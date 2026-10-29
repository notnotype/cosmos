import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { assertUsableCredential, readCredentialWithoutEcho, validateRunnerInvocation } from "../../.agents/tasks/39-pi-ai-adapter/connection-smoke-harness.js";
import { repositoryRoot, snapshotCommit } from "./story-agent-isolation.js";
import { bodyAcceptancePlan } from "./story-body-plan.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
    const plan = { ...await bodyAcceptancePlan(), schemaCommit: snapshotCommit };
    if (args.length === 1 && args[0] === "--plan") { console.log(JSON.stringify(plan, null, 2)); return; }
    validateRunnerInvocation({ args, environment: process.env, inputIsTTY: Boolean(process.stdin.isTTY), outputIsTTY: Boolean(process.stdout.isTTY) });
    if (execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim()) throw new Error("Acceptance requires a clean committed workspace");
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    console.log(JSON.stringify({ ...plan, codeCommit: revision }, null, 2));
    console.log("最多一次付费 POST；Provider 费用与留存未知。临时凭据为本地明文，强杀或断电可能残留，不在共享机器运行。隔离库保留输出。本入口不是完整 Worker 进程验收。尚未单独获得本次请求授权请退出；不要向聊天或环境变量提供凭据。确认后会在读凭据前本地重建 API，Web 在生成后本地构建；准备和收尾不计入 60s 生成期限。候选需由你在 Web 手动查看和决定，失败不得重跑。");
    const question = async (message: string, signal?: AbortSignal) => {
        const terminal = createInterface({ input: process.stdin, output: process.stdout });
        try { return await terminal.question(message, { signal }); } finally { terminal.close(); }
    };
    if (await question(`已逐次获准后输入 ONE REQUEST ${revision.slice(0, 12)}：`) !== `ONE REQUEST ${revision.slice(0, 12)}`) throw new Error("Not confirmed");
    execFileSync(process.env.BUN_BINARY?.trim() || "bun", ["run", "build:api"], { cwd: repositoryRoot, stdio: "ignore" });
    if (execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim() !== revision
        || execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim()) throw new Error("Workspace changed during preparation");
    process.stdout.write("输入临时 API Key（无回显），回车提交，Ctrl+C 取消：");
    let credential = assertUsableCredential(await readCredentialWithoutEcho(process.stdin, Boolean(process.stdout.isTTY)));
    const { runBodyStoryAcceptance } = await import("./story-body-runner.js");
    const controller = new AbortController();
    let result: Awaited<ReturnType<typeof runBodyStoryAcceptance>> | undefined;
    let web: { origin: string; stop(): Promise<void> } | undefined;
    const stop = async () => { try { await web?.stop(); } finally { await result?.close(); } };
    const signal = () => { controller.abort(); };
    process.once("SIGINT", signal); process.once("SIGTERM", signal);
    try {
        result = await runBodyStoryAcceptance({ credential, transport: globalThis.fetch, signal: controller.signal }).finally(() => { credential = ""; });
        controller.signal.throwIfAborted();
        console.log(JSON.stringify({ root: result.root, report: result.report }, null, 2));
        if (!result.api || result.report.status !== "awaiting_manual_decision") { process.exitCode = 1; return; }
        const { startBodyWeb } = await import("./story-body-web.js");
        web = await startBodyWeb(result.api);
        console.log(`只在本地打开 ${web.origin}/stories/${result.storyId}；检查正文与精确证据，手动接受/拒绝并刷新确认。不要再次点生成（Host 已停止，凭据已删除）。`);
        if (await question("完成 Web 决定并刷新后输入 FINISH，或输入其它文字停止并保留 pending：", controller.signal) === "FINISH") await result.recordDecision();
        else { console.log("保留 pending；本次未完成手动决定核验。"); process.exitCode = 1; }
    } finally {
        process.removeListener("SIGINT", signal); process.removeListener("SIGTERM", signal);
        await stop();
        if (result) {
            console.log(JSON.stringify({ root: result.root, report: result.report }, null, 2));
            if (result.report.status === "failed" || result.report.secretCleanup !== "completed" || result.report.disconnect !== "completed") process.exitCode = 1;
        }
    }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main().catch(() => { console.error("Body Story acceptance stopped; no automatic retry. Inspect fixed-field isolated result if created. Do not share credentials or raw errors."); process.exitCode = 1; });
}
