import { execFileSync } from "node:child_process";
import {
    applyMigrations,
    createIsolatedStackRoot,
    disposeIsolatedStack,
    environmentForStack,
    findAvailablePort,
    formatProcessFailure,
    repositoryRoot,
    spawnService,
    stopManagedProcess,
    waitForHttp,
    type IsolatedStackRoot,
    type ManagedProcess,
} from "./helpers.js";

const webPort = readPort(process.env.COSMOS_E2E_WEB_PORT ?? process.argv[2] ?? "4173");
let stack: IsolatedStackRoot | null = null;
let api: ManagedProcess | null = null;
let worker: ManagedProcess | null = null;
let web: ManagedProcess | null = null;
let stopping = false;

async function main(): Promise<void> {
    // 上一轮崩溃残留的 `next start` 会满足 Playwright 的就绪探测，于是本轮测试实际打在
    // **上一轮的构建产物与数据库**上（`reuseExistingServer: false` 挡不住这种形态）。
    // 这里先自己确认 web 端口是空的，占用就明确失败，而不是悄悄复用别人的服务。
    await assertPortFree(webPort);
    stack = await createIsolatedStackRoot("browser-stack");
    applyMigrations(stack.dataRoot);
    const apiPort = await findAvailablePort(14310);
    const baseEnvironment = environmentForStack(process.env, stack, {
        NODE_ENV: "test",
        COSMOS_WORKSPACE_ROOT: repositoryRoot,
        COSMOS_WORKFLOW_HOST_ENABLED: "true",
        COSMOS_WORKER_ADMIN_ENABLED: "false",
        COSMOS_WORKER_POLL_MS: "50",
        COSMOS_WORKER_LEASE_MS: "30000",
        COSMOS_WORKER_SHUTDOWN_DEADLINE_MS: "5000",
        COSMOS_MEDIA_ALLOWED_HOSTS: "127.0.0.1",
        COSMOS_API_HOST: "127.0.0.1",
        COSMOS_API_PORT: String(apiPort),
        COSMOS_API_URL: `http://127.0.0.1:${apiPort}`,
        COSMOS_ALLOWED_ORIGIN: `http://127.0.0.1:${webPort}`,
        COSMOS_MODEL_CONFIGURATION_AUTHORITIES: `127.0.0.1:${apiPort}`,
        NEXT_PUBLIC_COSMOS_API_URL: "",
        COSMOS_LOG_OUTPUT: "both",
    });
    // 这次构建**不能跳过**：`rewrites()` 的 API 目标地址在构建时就烘焙进
    // `routes-manifest.json`，只有带着本栈的 `COSMOS_API_URL` 重新构建，产物才会指向本栈的 API。
    // （曾经加过「跳过构建」的开关，结果四套栈共用一份指向默认 14310 的产物，全部打到 QQ。）
    execFileSync(process.env.BUN_BINARY?.trim() || "bun", ["run", "build:web"], {
        cwd: repositoryRoot,
        env: baseEnvironment,
        stdio: "inherit",
    });
    api = spawnService({
        name: "browser-stack-api",
        command: process.env.NODE_BINARY?.trim() || "node",
        args: ["apps/api/dist/main.js"],
        cwd: repositoryRoot,
        env: baseEnvironment,
    });
    await waitForHttp(`http://127.0.0.1:${apiPort}/readyz`, 200, 30_000);

    worker = spawnService({
        name: "browser-stack-worker",
        command: process.env.NODE_BINARY?.trim() || "node",
        args: ["--import", "./scripts/e2e/story-agent-fetch-fixture.mjs", "apps/worker/dist/main.js"],
        cwd: repositoryRoot,
        env: baseEnvironment,
    });
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/v1/health`, 200, 30_000);

    web = spawnService({
        name: "browser-stack-web",
        command: process.env.BUN_BINARY?.trim() || "bun",
        args: ["run", "--cwd", "apps/web", "start", "--", "-H", "127.0.0.1", "-p", String(webPort)],
        cwd: repositoryRoot,
        env: {
            ...baseEnvironment,
            COSMOS_API_URL: `http://127.0.0.1:${apiPort}`,
            NEXT_PUBLIC_COSMOS_API_URL: "",
        },
    });
    await waitForHttp(`http://127.0.0.1:${webPort}`, 200, 60_000);
    process.stdout.write(`WEB_STACK_READY http://127.0.0.1:${webPort}\n`);

    await Promise.race([
        web.exited,
        api.exited,
        worker.exited,
    ]).then(async () => {
        if (!stopping) {
            throw new Error([
                web ? formatProcessFailure(web) : "",
                api ? formatProcessFailure(api) : "",
                worker ? formatProcessFailure(worker) : "",
            ].filter(Boolean).join("\n"));
        }
    });
}

async function stop(): Promise<void> {
    if (stopping) return;
    stopping = true;
    await stopManagedProcess(web, "graceful").catch(() => undefined);
    await stopManagedProcess(worker, "force").catch(() => undefined);
    await stopManagedProcess(api, "force").catch(() => undefined);
    if (stack) await disposeIsolatedStack(stack.root).catch(() => undefined);
}

function readPort(raw: string): number {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
        throw new Error(`Invalid browser Web port: ${raw}`);
    }
    return value;
}

/** web 端口必须空闲：占用说明有上一轮的残留服务，复用它会测到旧构建与旧数据库。 */
async function assertPortFree(port: number): Promise<void> {
    const { createServer } = await import("node:net");
    await new Promise<void>((resolve, reject) => {
        const probe = createServer();
        probe.once("error", (error: NodeJS.ErrnoException) => {
            reject(new Error(
                error.code === "EADDRINUSE"
                    ? `端口 ${port} 已被占用：先停掉残留的验收服务再跑（否则会测到上一轮的构建与数据库）`
                    : `端口 ${port} 探测失败：${error.message}`,
            ));
        });
        probe.once("listening", () => {
            probe.close(() => resolve());
        });
        probe.listen(port, "127.0.0.1");
    });
}

process.once("SIGINT", () => void stop().finally(() => process.exit(0)));
process.once("SIGTERM", () => void stop().finally(() => process.exit(0)));

void main().catch(async (error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
    await stop();
});
