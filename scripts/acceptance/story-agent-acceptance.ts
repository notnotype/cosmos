import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { assertUsableCredential, readCredentialWithoutEcho, validateRunnerInvocation } from "../../.agents/tasks/39-pi-ai-adapter/connection-smoke-harness.js";
import { acceptancePlan, runStoryAcceptance } from "./story-agent-runner.js";
import { repositoryRoot, snapshotCommit } from "./story-agent-isolation.js";

export async function main(): Promise<void> {
    if (process.argv.slice(2).length === 1 && process.argv[2] === "--plan") {
        console.log(JSON.stringify({ ...acceptancePlan, schemaCommit: snapshotCommit }, null, 2));
        return;
    }
    validateRunnerInvocation({ args: process.argv.slice(2), environment: process.env,
        inputIsTTY: Boolean(process.stdin.isTTY), outputIsTTY: Boolean(process.stdout.isTTY) });
    if (execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim()) {
        throw new Error("Acceptance requires a clean committed workspace.");
    }
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    console.log(JSON.stringify({ ...acceptancePlan, codeCommit: revision, schemaCommit: snapshotCommit }, null, 2));
    console.log("最多一次付费 POST；实际费用及 Provider 留存未知。临时 SecretStore 是本地明文文件，Windows 权限仅尽力保护；正常/失败退出均清理，但强制终止或断电可能残留。不要在共享机器运行。隔离数据库保留模型输出，本工具不是产品浏览器验收。尚未获得本次明确授权请退出。不要把凭据发送到聊天或命令行。");
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    let confirmed: string;
    try { confirmed = await terminal.question(`已单独获准本次请求后，输入 ONE REQUEST ${revision.slice(0, 12)} 确认：`); }
    finally { terminal.close(); }
    if (confirmed !== `ONE REQUEST ${revision.slice(0, 12)}`) throw new Error("Request not confirmed.");
    process.stdout.write("输入临时 API Key（无回显），回车提交，Ctrl+C 取消：");
    let credential = assertUsableCredential(await readCredentialWithoutEcho(process.stdin, Boolean(process.stdout.isTTY)));
    try {
        const result = await runStoryAcceptance({ credential, transport: globalThis.fetch });
        console.log(JSON.stringify(result, null, 2));
        if (result.report.status !== "completed") process.exitCode = 1;
    } finally { credential = ""; }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main().catch(() => { console.error("Story acceptance stopped; no automatic retry. Check the isolated result if created. Do not paste credentials or raw provider errors."); process.exitCode = 1; });
}
