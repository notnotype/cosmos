import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
    appendFile,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
} from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findAvailablePort as findAvailablePortFromDevTools } from "../dev-port.js";

const scriptsDirectory = resolve(dirname(fileURLToPath(import.meta.url)));
export const repositoryRoot = resolve(scriptsDirectory, "../..");
const e2eTmpRoot = resolve(repositoryRoot, ".agent", "tmp");
const maxCapturedBytes = 64 * 1024;

export interface IsolatedStackRoot {
    root: string;
    dataRoot: string;
    blobRoot: string;
    logRoot: string;
}

export async function createIsolatedStackRoot(prefix: string): Promise<IsolatedStackRoot> {
    await mkdir(e2eTmpRoot, { recursive: true });
    const safePrefix = prefix.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40) || "e2e";
    const root = await mkdtemp(join(e2eTmpRoot, `${safePrefix}-${randomUUID()}-`));
    const dataRoot = join(root, "data");
    const blobRoot = join(root, "blobs");
    const logRoot = join(root, "logs");
    await Promise.all([
        mkdir(dataRoot, { recursive: true }),
        mkdir(blobRoot, { recursive: true }),
        mkdir(logRoot, { recursive: true }),
    ]);
    return { root, dataRoot, blobRoot, logRoot };
}

export function databaseUrl(dataRoot: string): string {
    return `file:${resolve(dataRoot, "cosmos.sqlite").replaceAll("\\", "/")}`;
}

export function applyMigrations(dataRoot: string): void {
    const environment: NodeJS.ProcessEnv = {
        ...process.env,
        COSMOS_DATA_ROOT: dataRoot,
        DATABASE_URL: databaseUrl(dataRoot),
    };
    const result = spawnSync(
        process.env.BUN_BINARY?.trim() || "bun",
        ["run", "scripts/prisma.ts", "migrate", "deploy"],
        {
            cwd: repositoryRoot,
            env: environment,
            encoding: "utf8",
            windowsHide: true,
        },
    );
    if (result.error || result.status !== 0) {
        throw new Error([
            `Prisma migration failed for ${dataRoot}.`,
            result.error instanceof Error ? result.error.stack ?? result.error.message : "",
            result.stdout ?? "",
            result.stderr ?? "",
        ].filter(Boolean).join("\n"));
    }
}

export async function findAvailablePort(preferredPort: number, host = "127.0.0.1"): Promise<number> {
    return findAvailablePortFromDevTools(preferredPort, host);
}

export interface ManagedProcess {
    readonly name: string;
    readonly child: ChildProcess;
    readonly pid: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
    waitForExit(timeoutMs?: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

export interface SpawnServiceOptions {
    name: string;
    command: string;
    args: readonly string[];
    cwd?: string;
    env: NodeJS.ProcessEnv;
}

export function spawnService(options: SpawnServiceOptions): ManagedProcess {
    const child = spawn(options.command, [...options.args], {
        cwd: options.cwd ?? repositoryRoot,
        env: { ...options.env },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });
    if (!child.pid) {
        throw new Error(`Could not start ${options.name}.`);
    }

    let stdout = "";
    let stderr = "";
    const appendCaptured = (current: string, chunk: Buffer): string => {
        const next = current + chunk.toString("utf8");
        return next.length > maxCapturedBytes ? next.slice(-maxCapturedBytes) : next;
    };
    child.stdout?.on("data", (chunk: Buffer) => {
        stdout = appendCaptured(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
        stderr = appendCaptured(stderr, chunk);
    });

    let exitResult: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    let resolveExit!: (result: { code: number | null; signal: NodeJS.Signals | null }) => void;
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExitPromise) => {
        resolveExit = resolveExitPromise;
    });
    child.once("exit", (code, signal) => {
        exitResult = { code, signal };
        resolveExit(exitResult);
    });

    const managed: ManagedProcess = {
        name: options.name,
        child,
        pid: child.pid,
        get stdout() {
            return stdout;
        },
        get stderr() {
            return stderr;
        },
        exited,
        async waitForExit(timeoutMs = 10_000) {
            if (exitResult) return exitResult;
            return withTimeout(exited, timeoutMs, `${options.name} did not exit in time.`);
        },
    };
    return managed;
}

export async function stopManagedProcess(
    managed: ManagedProcess,
    mode: "graceful" | "force" = "graceful",
    timeoutMs = 10_000,
): Promise<void> {
    if (managed.child.exitCode !== null || managed.child.signalCode !== null || managed.child.killed) {
        return;
    }
    if (mode === "graceful") {
        managed.child.kill("SIGTERM");
        try {
            await managed.waitForExit(timeoutMs);
            return;
        } catch {
            // Fall through to a tree kill. A test must never leak a service.
        }
    }
    if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(managed.pid), "/t", "/f"], {
            stdio: "ignore",
            windowsHide: true,
        });
    } else {
        try {
            process.kill(-managed.pid, "SIGKILL");
        } catch {
            managed.child.kill("SIGKILL");
        }
    }
    await managed.waitForExit(5_000).catch(() => undefined);
}

export async function disposeIsolatedStack(root: string): Promise<void> {
    await rm(root, { recursive: true, force: true });
}

export async function waitForHttp(
    url: string,
    expectedStatus = 200,
    timeoutMs = 10_000,
): Promise<unknown> {
    let lastError: unknown;
    const attempts = Math.max(1, Math.ceil(timeoutMs / 200));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.status !== expectedStatus) {
                throw new Error(`Expected ${expectedStatus} from ${url}, got ${response.status}.`);
            }
            const contentType = response.headers.get("content-type") ?? "";
            return contentType.includes("json") ? await response.json() : await response.text();
        } catch (error) {
            lastError = error;
            await delay(200);
        }
    }
    throw new Error(`Timed out waiting for ${url}: ${errorMessage(lastError)}`);
}

export async function waitForCondition(
    description: string,
    predicate: () => boolean | Promise<boolean>,
    timeoutMs = 10_000,
    intervalMs = 100,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            if (await predicate()) return;
        } catch (error) {
            lastError = error;
        }
        await delay(intervalMs);
    }
    throw new Error(`Timed out waiting for ${description}.${lastError ? ` ${errorMessage(lastError)}` : ""}`);
}

export async function readStructuredLogs(logRoot: string): Promise<readonly Record<string, unknown>[]> {
    const files = await collectFiles(logRoot);
    const records: Record<string, unknown>[] = [];
    for (const file of files.filter((candidate) => candidate.endsWith(".jsonl"))) {
        const text = await readFile(file, "utf8");
        for (const line of text.split(/\r?\n/).filter(Boolean)) {
            const parsed: unknown = JSON.parse(line);
            if (!isRecord(parsed)) throw new Error(`Structured log line is not an object: ${file}`);
            records.push(parsed);
        }
    }
    return records;
}

export function assertLogsRedacted(records: readonly Record<string, unknown>[]): void {
    const forbidden = /^(?:token|authorization|cookie|contentText|prompt|stdout|stderr|payload)$/i;
    const inspect = (value: unknown, path: string): void => {
        if (!isRecord(value)) {
            if (typeof value === "string" && value.includes("undefined")) {
                throw new Error(`Structured logs contain serialized undefined at ${path}.`);
            }
            return;
        }
        for (const [key, child] of Object.entries(value)) {
            if (forbidden.test(key)) {
                throw new Error(`Structured logs contain forbidden field ${path}.${key}.`);
            }
            inspect(child, `${path}.${key}`);
        }
    };
    for (const [index, record] of records.entries()) inspect(record, `record[${index}]`);
}

export function environmentForStack(
    base: NodeJS.ProcessEnv,
    stack: IsolatedStackRoot,
    overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
    return {
        ...base,
        DATABASE_URL: databaseUrl(stack.dataRoot),
        COSMOS_DATA_ROOT: stack.dataRoot,
        COSMOS_BLOB_ROOT: stack.blobRoot,
        COSMOS_LOG_ROOT: stack.logRoot,
        COSMOS_LOG_OUTPUT: "both",
        COSMOS_LOG_LEVEL: "debug",
        ...overrides,
    };
}

export function formatProcessFailure(processValue: ManagedProcess): string {
    return [
        `${processValue.name} exited unexpectedly (pid=${processValue.pid}).`,
        `stdout:\n${processValue.stdout}`,
        `stderr:\n${processValue.stderr}`,
    ].join("\n");
}

export async function appendFailureLog(root: string, processValue: ManagedProcess): Promise<void> {
    const path = join(root, `${processValue.name}.failure.log`);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, formatProcessFailure(processValue), "utf8");
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestJson(
    url: string,
    init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
    const response = await fetch(url, init);
    const text = await response.text();
    let body: unknown = null;
    if (text) {
        try {
            body = JSON.parse(text) as unknown;
        } catch {
            body = text;
        }
    }
    return { status: response.status, body };
}

export function readString(value: unknown, key: string): string {
    if (
        !isRecord(value)
        || typeof value[key] !== "string"
        || value[key].length === 0
    ) {
        throw new Error(`Expected ${key} in response.`);
    }
    return value[key];
}

export function expectJsonObject(
    response: { status: number; body: unknown },
    expected: number,
    description: string,
): Record<string, unknown> {
    if (response.status !== expected || !isRecord(response.body)) {
        throw new Error(
            `Expected HTTP ${expected} from ${description}, got ${response.status}: ${JSON.stringify(response.body)}.`,
        );
    }
    return response.body;
}

/**
 * 真实来源验收共享的 Run 等待与判定：终态只认 succeeded / failed，成功口径与 item 数
 * 上界只有一处定义，单来源与双计划两条路径不各自演化。
 */
export async function waitForTerminalRun(
    apiBaseUrl: string,
    runId: string,
    label: string,
    timeoutMs = 180_000,
): Promise<Record<string, unknown>> {
    let completed: Record<string, unknown> | null = null;
    await waitForCondition(
        `${label} Run completion`,
        async () => {
            const result = await requestJson(`${apiBaseUrl}/runs/${runId}`);
            if (result.status !== 200 || !isRecord(result.body)) return false;
            completed = result.body;
            return (
                result.body.status === "succeeded"
                || result.body.status === "failed"
            );
        },
        timeoutMs,
        500,
    );
    const terminal: Record<string, unknown> | null = completed;
    if (!terminal) {
        throw new Error(`${label} Run ${runId} never reached a terminal status.`);
    }
    return terminal;
}

export function assertRunSucceeded(
    label: string,
    runId: string,
    completed: Record<string, unknown>,
): void {
    if (completed.status !== "succeeded") {
        throw new Error(
            `${label} Run ${runId} did not succeed: ${JSON.stringify(completed)}.`,
        );
    }
}

export function boundedItemCount(
    label: string,
    completed: Record<string, unknown>,
): number {
    const itemCount = Number(completed.itemCount ?? 0);
    if (!Number.isSafeInteger(itemCount) || itemCount < 0 || itemCount > 100) {
        throw new Error(
            `${label} item count exceeded bounded acceptance: ${itemCount}.`,
        );
    }
    return itemCount;
}

async function collectFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await collectFiles(path));
        else files.push(path);
    }
    return files.map((path) => resolve(path));
}

export function relativeToRepository(path: string): string {
    return relative(repositoryRoot, path);
}

export function delay(milliseconds: number): Promise<void> {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, description: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(description)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export function createHealthServer(): {
    server: ReturnType<typeof createServer>;
    listen(): Promise<number>;
    close(): Promise<void>;
} {
    const server = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
    });
    return {
        server,
        listen: () => new Promise((resolveListen, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                if (!address || typeof address === "string") {
                    reject(new Error("Health server did not expose a TCP port."));
                    return;
                }
                resolveListen(address.port);
            });
        }),
        close: () => new Promise((resolveClose, reject) => {
            server.close((error) => error ? reject(error) : resolveClose());
        }),
    };
}

async function postExpectedCreated(
    url: string,
    headers: Record<string, string>,
    body: unknown,
): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.status !== 201 || payload === null) {
        throw new Error(`Expected HTTP 201 from ${url}, got ${response.status}.`);
    }
    return payload;
}

async function getExpectedOk(
    url: string,
): Promise<Record<string, unknown>> {
    const response = await fetch(url);
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.status !== 200 || payload === null) {
        throw new Error(`Expected HTTP 200 from ${url}, got ${response.status}.`);
    }
    return payload;
}

async function patchExpectedOk(
    url: string,
    headers: Record<string, string>,
    body: unknown,
): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.status !== 200 || payload === null) {
        throw new Error(`Expected HTTP 200 from ${url}, got ${response.status}.`);
    }
    return payload;
}

/**
 * Single source of truth for the Product API acceptance flow: create a
 * disabled RSS Source, then optionally enable its default plan. Contract
 * changes to this flow should land here only instead of being re-applied
 * across every E2E scenario.
 *
 * Always resolves to the **source** projection: enabling now goes through the
 * plan endpoint (ADR-0023), whose response is a plan snapshot, so the helper
 * re-reads the source instead of handing callers a differently shaped object.
 */
export async function createRssSource(options: {
    apiBaseUrl: string;
    feedUrl: string;
    name: string;
    enabled?: boolean;
    scheduleIntervalMs?: number;
}): Promise<Record<string, unknown>> {
    const created = await postExpectedCreated(`${options.apiBaseUrl}/api/v1/sources`, {
        "content-type": "application/json",
    }, {
        name: options.name,
        sourceDefinitionRef: "source.rss@1",
        operationId: "fetch",
        // ADR-0018: scheduleIntervalMs 自 Source config 迁出,create 命令接受顶层字段
        ...(options.scheduleIntervalMs === undefined ? {} : { scheduleIntervalMs: options.scheduleIntervalMs }),
        config: {
            feedUrl: options.feedUrl,
        },
    });
    const sourceId = created.id;
    const planId = created.planId;
    const planRevisionId = created.planRevisionId;
    if (typeof sourceId !== "string" || typeof planId !== "string" || typeof planRevisionId !== "string") {
        throw new Error("Source creation response is missing id, planId or planRevisionId.");
    }
    if (options.enabled === false) return created;
    // 启用状态归计划（ADR-0023 决策 2）：写入口是计划端点，CAS 用计划的 revision。
    await patchExpectedOk(
        `${options.apiBaseUrl}/api/v1/collection-plans/${encodeURIComponent(planId)}`,
        { "content-type": "application/json" },
        { enabled: true, baseRevisionId: planRevisionId },
    );
    return await getExpectedOk(
        `${options.apiBaseUrl}/api/v1/sources/${encodeURIComponent(sourceId)}`,
    );
}
