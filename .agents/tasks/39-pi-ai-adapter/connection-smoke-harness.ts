import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import type { Readable } from "node:stream";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { LoggerPort } from "@cosmos/application";
import { resolvePrismaCliPath } from "../../../packages/storage-prisma/src/prisma-cli.js";

// 两条烟测（@1 与 @2）共用同一套隔离、终端与诊断边界：这些是「不会随请求形状变化」的部分，
// 拆出来是为了让两个 runner 文件各自留在体积警戒线内，而不是复制两份保护逻辑。

export const repositoryRoot = resolve(import.meta.dirname, "../../..");
export const snapshotPath = "packages/storage-prisma/prisma";
export const provider = "jijiapi";
export const model = "gpt-6-luna";
export const secretRef = "secret:task39-connection-smoke";
// Current @2 resolution reads Task 41 model prices, even when an explicit modelId is supplied.
export const SNAPSHOT_COMMIT = "7ca568a91c57fba7bd8256727662936143b63a14";
export const SYNTHETIC_CREDENTIAL = "task39-synthetic-offline-only";
export const ISOLATION_PARENT = join(repositoryRoot, ".agent/tmp");
export const ROOT_PREFIX = "task39-offline-";

// This helper is retained for a separately approved real-terminal acceptance step.
export function validateRunnerInvocation(input: {
    args: readonly string[];
    environment: NodeJS.ProcessEnv;
    inputIsTTY: boolean;
    outputIsTTY: boolean;
}): void {
    if (input.args.length !== 0) throw new Error("This runner accepts no command-line arguments.");
    if (input.environment.COSMOS_TEST_API_KEY !== undefined || input.environment.COSMOS_AGENT_API_KEY !== undefined) {
        throw new Error("Credential environment variables are not accepted by this runner.");
    }
    if (!input.inputIsTTY || !input.outputIsTTY) {
        throw new Error("A real interactive terminal is required; no credential was read.");
    }
}

// Bracketed paste (most Windows terminals enable it) wraps pasted text in ESC[200~ / ESC[201~.
// Those bytes would otherwise land inside the credential and make the Authorization header invalid.
const BRACKETED_PASTE_START = "\u001b[200~";
const BRACKETED_PASTE_END = "\u001b[201~";

/**
 * 读取一行不回显的输入（凭据或确认词）。
 *
 * raw 模式拿不到行编辑，所以要自己处理退格与粘贴标记：终端把粘贴内容整段送进来时，
 * 括号粘贴的控制序列也会跟着进来，把它们当普通字符存进 SecretStore 会让请求头变成无效值，
 * 而失败现场又只剩一个 HTTP 400。
 */
export async function readCredentialWithoutEcho(input: Readable & {
    isTTY?: boolean;
    setRawMode?: (enabled: boolean) => void;
}, outputIsTTY: boolean): Promise<string> {
    if (!input.isTTY || !outputIsTTY || typeof input.setRawMode !== "function") {
        throw new Error("A real interactive terminal is required; no credential was read.");
    }
    input.setRawMode(true);
    input.resume();
    // Kept as one growing string so the paste markers can be recognised across chunk boundaries.
    let text = "";
    let onData: ((chunk: Buffer) => void) | undefined;
    let onEnd: (() => void) | undefined;
    try {
        return await new Promise<string>((resolveCredential, reject) => {
            onData = (chunk: Buffer) => {
                text += chunk.toString("utf8");
                text = text.replaceAll(BRACKETED_PASTE_START, "").replaceAll(BRACKETED_PASTE_END, "");
                for (let index = 0; index < text.length; index += 1) {
                    const character = text[index]!;
                    if (character === "\u0003") {
                        reject(new Error("Credential entry cancelled."));
                        return;
                    }
                    if (character === "\r" || character === "\n") {
                        resolveCredential(text.slice(0, index));
                        return;
                    }
                    // Backspace removes the preceding character; the loop index is rewound by one.
                    if (character === "\u007f" || character === "\b") {
                        text = text.slice(0, index - 1) + text.slice(index);
                        index -= 2;
                    }
                }
            };
            onEnd = () => reject(new Error("Credential input ended before submission."));
            input.on("data", onData);
            input.once("end", onEnd);
        });
    } finally {
        if (onData) input.off("data", onData);
        if (onEnd) input.off("end", onEnd);
        input.setRawMode(false);
        input.pause();
        text = "";
    }
}

/**
 * 拒绝「看起来不像一个能直接放进 Authorization 头的令牌」的输入。
 *
 * 真实外呼一次就要花一次请求，而粘贴损坏（多出空格、换行、框选字符、全角字符）在服务商那里
 * 只表现为一个 400，无法与「服务商真的拒绝」区分——三次 400 里就有一次是这么来的。
 * 这里只做形状检查，不联网、不判断令牌是否有效；形状不对就在 `credential_input` 阶段失败关闭。
 */
export function assertUsableCredential(value: string): string {
    if (value === "") throw new Error("Empty credential.");
    if (/\s/.test(value)) throw new Error("Credential contains whitespace; check the paste.");
    if (/[^\u0020-\u007e]/.test(value)) throw new Error("Credential contains non-ASCII characters; check the paste.");
    return value;
}

// File descriptors avoid the Windows sandbox's named-pipe subprocess boundary.
function runToFile(command: string, args: string[], output: string, cwd: string, env?: NodeJS.ProcessEnv): void {
    const descriptor = openSync(output, "w");
    try {
        const result = spawnSync(command, args, { cwd, env, stdio: ["ignore", descriptor, "ignore"] });
        if (result.error || result.status !== 0) throw new Error("Isolated subprocess failed; details suppressed.");
    } finally {
        closeSync(descriptor);
    }
}

export async function exportFrozenSnapshot(root: string): Promise<{
    schemaPath: string;
    manifest: Array<{ path: string; sha256: string }>;
}> {
    const listing = join(root, "snapshot-paths.txt");
    runToFile("git", ["ls-tree", "-r", "--name-only", SNAPSHOT_COMMIT, snapshotPath], listing, repositoryRoot);
    const paths = (await readFile(listing, "utf8")).trim().split(/\r?\n/);
    if (paths.filter((path) => path.endsWith("/migration.sql")).length !== 43) {
        throw new Error("Frozen migration count changed.");
    }
    const manifest: Array<{ path: string; sha256: string }> = [];
    for (const path of paths) {
        if (!path.startsWith(`${snapshotPath}/`) || path.includes("..")) throw new Error("Invalid snapshot path.");
        const destination = join(root, "schema-snapshot", path);
        await mkdir(dirname(destination), { recursive: true });
        runToFile("git", ["show", `${SNAPSHOT_COMMIT}:${path}`], destination, repositoryRoot);
        manifest.push({ path, sha256: createHash("sha256").update(await readFile(destination)).digest("hex") });
    }
    await writeFile(join(root, "snapshot-manifest.json"), JSON.stringify({ commit: SNAPSHOT_COMMIT, files: manifest }, null, 4));
    return { schemaPath: join(root, "schema-snapshot", snapshotPath, "schema.prisma"), manifest };
}

export async function prepareDatabase(root: string) {
    const { schemaPath, manifest } = await exportFrozenSnapshot(root);
    const databaseUrl = `file:${join(root, "cosmos.sqlite").replaceAll("\\", "/")}`;
    // No inherited credentials or ambient DATABASE_URL reach the migration process.
    runToFile(process.execPath, [resolvePrismaCliPath(), "migrate", "deploy", "--schema", schemaPath],
        join(root, "migration.log"), root, {
            PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: root, TMP: root,
            DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1",
        });
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
        const migrations = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
            'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
        );
        const expected = manifest.filter((item) => item.path.endsWith("/migration.sql"))
            .map((item) => item.path.split("/").at(-2));
        if (JSON.stringify(migrations.map((item) => item.migration_name)) !== JSON.stringify(expected)) {
            throw new Error("Deployed migrations do not match the frozen manifest.");
        }
        return { databaseUrl, migrationCount: migrations.length };
    } finally { await prisma.$disconnect(); }
}

/** 记录事件名与字段的日志桩；凭据泄漏检查靠它把「日志里有没有密钥」变成可断言的事实。 */
export function createCountingLogger(events: unknown[] = []): LoggerPort & { count: () => number } {
    const logger: LoggerPort = {
        child: () => logger, withContext: (_context, callback) => callback(),
        debug: (event, fields) => { events.push({ event, fields }); },
        info: (event, fields) => { events.push({ event, fields }); },
        warn: (event, fields) => { events.push({ event, fields }); },
        error: (event, fields) => { events.push({ event, fields }); },
    };
    return Object.assign(logger, { count: () => events.length });
}

// The standalone CLI owns these globals only until its single SDK invocation settles.
export async function withBoundedProviderTransport<T>(use: () => Promise<T>, transport = globalThis.fetch,
    onSend: () => void = () => undefined, onResponse: (response: Response) => void = () => undefined): Promise<T> {
    const previousFetch = globalThis.fetch;
    const previousLog = process.env.OPENAI_LOG;
    let sent = false;
    process.env.OPENAI_LOG = "off";
    globalThis.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        if (sent || url !== "https://api-slb.jiji.cc/v1/chat/completions" || method.toUpperCase() !== "POST") {
            throw new Error("Task 39 transport rejected the request.");
        }
        sent = true;
        onSend();
        const response = await transport(input, { ...init, redirect: "error" });
        onResponse(response);
        return response;
    };
    try { return await use(); }
    finally {
        globalThis.fetch = previousFetch;
        if (previousLog === undefined) delete process.env.OPENAI_LOG;
        else process.env.OPENAI_LOG = previousLog;
    }
}

export type DiagnosticStage = "credential_input" | "database_initialize" | "provider_configure" | "model_configure" |
    "connection_create" | "secret_write" | "dispatch" | "result_write" | "secret_delete" | "disconnect";
type SafeFailureCategory = "aborted" | "authentication_required" | "rate_limited" | "timeout" |
    "dependency_unavailable" | "malformed_payload" | "invalid_configuration" | "budget_exhausted" |
    "cancelled" | "operation_failed";

function safeFailureCategory(error: unknown): SafeFailureCategory {
    if (error instanceof Error && error.name === "AbortError") return "aborted";
    if (typeof error === "object" && error !== null && "code" in error) {
        const code = error.code;
        if (code === "authentication_required" || code === "rate_limited" || code === "timeout" ||
            code === "dependency_unavailable" || code === "malformed_payload" ||
            code === "invalid_configuration" || code === "budget_exhausted" || code === "cancelled") return code;
    }
    return "operation_failed";
}

export function createSafeDiagnostics() {
    const record = { version: 1, status: "running" as "running" | "completed" | "failed",
        stage: "credential_input" as DiagnosticStage, transportSends: 0,
        response: { returned: false, status: null as number | null },
        firstFailure: null as null | { stage: DiagnosticStage; category: SafeFailureCategory },
        cleanup: { secretDelete: "not_started", disconnect: "not_started" } };
    return {
        record,
        async step<T>(stage: DiagnosticStage, use: () => Promise<T>): Promise<T> {
            record.stage = stage;
            try { return await use(); }
            catch (error) {
                // Only fixed categories cross the diagnostic boundary; never serialize the error.
                record.firstFailure ??= { stage, category: safeFailureCategory(error) };
                record.status = "failed";
                throw error;
            }
        },
    };
}
