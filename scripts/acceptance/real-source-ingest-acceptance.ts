import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { repositoryRoot } from "./story-agent-isolation.js";
import { realSourceIngestPlan } from "./real-source-ingest-plan.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
    const plan = await realSourceIngestPlan();
    
    // --plan 模式：只读打印计划，不联网、不建库
    if (args.length === 1 && args[0] === "--plan") {
        console.log(JSON.stringify(plan, null, 2));
        return;
    }

    if (process.env.COSMOS_ALLOW_REAL_NETWORK !== "true") {
        throw new Error(
            "Real source acceptance requires COSMOS_ALLOW_REAL_NETWORK=true. " +
            "Also set COSMOS_REAL_RSS_URL=<url> to specify the feed."
        );
    }

    // 检查工作区状态
    if (execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim()) {
        throw new Error("Acceptance requires a clean committed workspace");
    }

    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    
    console.log(JSON.stringify({ ...plan, codeCommit: revision }, null, 2));
    console.log("\n=== 真实来源扩大验收（Task 40）===");
    console.log("本验收将执行真实 RSS fetch，产生外部网络请求。");
    console.log("使用隔离数据库与文件根，不影响默认用户库。");
    console.log(`RSS URLs: ${plan.rssUrls.join(", ")}`);
    console.log("\n验收检查点：");
    plan.checks.forEach((check, i) => console.log(`  ${i + 1}. ${check}`));
    console.log("\n隔离环境：");
    console.log(`  - 根目录前缀: ${plan.isolation.rootPrefix}`);
    console.log(`  - 数据目录: ${plan.isolation.dataRoot}`);
    console.log(`  - Secret 存储: ${plan.isolation.secretStore}`);
    console.log("\n期望值：");
    console.log(`  - 最少 Entry 数: ${plan.expectations.minItemCount}`);
    console.log(`  - 最少图文混排数: ${plan.expectations.minImageRichItems}`);
    console.log(`  - 最低媒体下载率: ${Math.round(plan.expectations.minMediaDownloadRate * 100)}%`);
    console.log("\n⚠️  尚未单独获得本次请求授权请退出。");
    console.log("确认后会构建 API，然后执行真实 ingest。");
    console.log("失败不得重跑，须重新获得授权。");

    const question = async (message: string, signal?: AbortSignal) => {
        const terminal = createInterface({ input: process.stdin, output: process.stdout });
        try {
            return await terminal.question(message, { signal });
        } finally {
            terminal.close();
        }
    };

    const confirmText = `EXECUTE ${revision.slice(0, 12)}`;
    const answer = await question(`\n已逐次获准后输入 ${confirmText}：`);
    
    if (answer !== confirmText) {
        throw new Error("Not confirmed");
    }

    console.log("\n构建 API...");
    execFileSync(process.env.BUN_BINARY?.trim() || "bun", ["run", "build:api"], {
        cwd: repositoryRoot,
        stdio: "inherit",
    });

    // 再次检查工作区未变化
    if (
        execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim() !== revision ||
        execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim()
    ) {
        throw new Error("Workspace changed during preparation");
    }

    console.log("\n开始真实 ingest 验收...\n");

    const { runRealSourceIngestAcceptance } = await import("./real-source-ingest-runner.js");
    
    const controller = new AbortController();
    let result: Awaited<ReturnType<typeof runRealSourceIngestAcceptance>> | undefined;

    const signal = () => {
        controller.abort();
    };

    process.once("SIGINT", signal);
    process.once("SIGTERM", signal);

    try {
        result = await runRealSourceIngestAcceptance({
            plan,
            signal: controller.signal,
        });

        controller.signal.throwIfAborted();

        console.log("\n=== 验收结果 ===");
        console.log(JSON.stringify({ root: result.root, report: result.report }, null, 2));

        if (result.report.status === "completed") {
            console.log("\n✅ 真实来源验收通过");
            console.log(`\n隔离数据库保留在: ${result.root}`);
            console.log("可手动检查数据内容或启动浏览器验收（需另行实施）。");
        } else {
            console.log("\n❌ 真实来源验收失败");
            console.log(`阶段: ${result.report.stage}`);
            process.exitCode = 1;
        }
    } finally {
        process.removeListener("SIGINT", signal);
        process.removeListener("SIGTERM", signal);
        
        if (result) {
            await result.close();
            
            console.log("\n=== 最终报告 ===");
            console.log(JSON.stringify({ root: result.root, report: result.report }, null, 2));
            
            if (
                result.report.status === "failed" ||
                result.report.disconnect !== "completed"
            ) {
                process.exitCode = 1;
            }
        }
    }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main().catch((error) => {
        console.error("\n❌ Real source ingest acceptance stopped; no automatic retry.");
        console.error("Inspect fixed-field isolated result if created.");
        if (error instanceof Error) {
            console.error(`Error: ${error.message}`);
        }
        process.exitCode = 1;
    });
}
