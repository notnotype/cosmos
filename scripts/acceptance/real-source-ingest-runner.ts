import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareStoryIsolation, repositoryRoot } from "./story-agent-isolation.js";
import { containsDangerousHtml, countBlockTypes, evaluateIngestGate } from "./real-source-ingest-gate.js";
import type { RealSourceIngestPlan } from "./real-source-ingest-plan.js";
import {
    applyMigrations,
    assertLogsRedacted,
    assertRunSucceeded,
    boundedItemCount,
    environmentForStack,
    expectJsonObject,
    findAvailablePort,
    readString,
    readStructuredLogs,
    requestJson,
    spawnService,
    stopManagedProcess,
    waitForCondition,
    waitForHttp,
    waitForTerminalRun,
    type ManagedProcess,
} from "../e2e/helpers.js";

export interface RealSourceIngestReport {
    status: "completed" | "failed";
    stage: string;
    rssUrl: string;
    fetchStatus: string;
    itemCount: number;
    parseSuccessRate: number;
    mediaDownloadRate: number | null;
    imageRichItems: number;
    versionInfo: {
        schemaCommit: string;
        codeCommit: string;
    };
    blocksStats: {
        totalBlocks: number;
        textBlocks: number;
        imageBlocks: number;
    };
    qualitySignals: {
        completeRepresentations: number;
        partialRepresentations: number;
        failedRepresentations: number;
    };
    disconnect: "pending" | "completed" | "failed";
}

export async function runRealSourceIngestAcceptance(options: {
    plan: RealSourceIngestPlan;
    signal?: AbortSignal;
}): Promise<{ root: string; report: RealSourceIngestReport; close: () => Promise<void> }> {
    const { root, repository, secretRefs } = await prepareStoryIsolation();
    const codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    
    // 使用第一个 RSS URL
    const rssUrl = options.plan.rssUrls[0]!;
    
    const report: RealSourceIngestReport = {
        status: "failed",
        stage: "initialization",
        rssUrl,
        fetchStatus: "not_started",
        itemCount: 0,
        parseSuccessRate: 0,
        mediaDownloadRate: null,
        imageRichItems: 0,
        versionInfo: {
            schemaCommit: options.plan.schemaCommit,
            codeCommit,
        },
        blocksStats: {
            totalBlocks: 0,
            textBlocks: 0,
            imageBlocks: 0,
        },
        qualitySignals: {
            completeRepresentations: 0,
            partialRepresentations: 0,
            failedRepresentations: 0,
        },
        disconnect: "pending",
    };

    let api: ManagedProcess | undefined;
    let worker: ManagedProcess | undefined;

    const writeReport = () => writeFile(join(root, "result.json"), JSON.stringify(report, null, 2));
    
    let closing: Promise<void> | undefined;
    const close = () => closing ??= (async () => {
        try {
            if (worker) await stopManagedProcess(worker, "graceful").catch(() => undefined);
            if (api) await stopManagedProcess(api, "graceful").catch(() => undefined);
        } finally {
            try {
                // 清理 secrets
                for (const ref of secretRefs) {
                    await repository.secrets.delete(ref);
                }
                await repository.close();
                report.disconnect = "completed";
            } catch {
                report.disconnect = "failed";
                report.status = "failed";
            }
            await writeReport();
        }
    })();

    try {
        options.signal?.throwIfAborted();
        
        // 写入请求计划
        await writeFile(join(root, "request-plan.json"), JSON.stringify({
            ...options.plan,
            codeCommit,
        }, null, 2));

        report.stage = "stack_preparation";
        
        // 应用迁移
        const dataRoot = join(root, "data");
        applyMigrations(dataRoot);

        // 查找可用端口
        const apiPort = await findAvailablePort(14310);

        const environment = environmentForStack(process.env, { root, dataRoot, logRoot: join(root, "logs") }, {
            NODE_ENV: "test",
            COSMOS_API_HOST: "127.0.0.1",
            COSMOS_API_PORT: String(apiPort),
            COSMOS_WORKSPACE_ROOT: repositoryRoot,
            COSMOS_WORKFLOW_HOST_ENABLED: "true",
            COSMOS_WORKER_ADMIN_ENABLED: "false",
            COSMOS_WORKER_POLL_MS: "100",
            COSMOS_WORKER_LEASE_MS: "30000",
            COSMOS_WORKER_SHUTDOWN_DEADLINE_MS: "5000",
        });

        report.stage = "api_startup";
        
        // 启动 API
        api = spawnService({
            name: "real-source-ingest-api",
            command: process.env.NODE_BINARY?.trim() || "node",
            args: ["apps/api/dist/main.js"],
            cwd: repositoryRoot,
            env: environment,
        });

        await waitForHttp(`http://127.0.0.1:${apiPort}/readyz`, 200, 30_000);

        report.stage = "worker_startup";
        
        // 启动 Worker
        worker = spawnService({
            name: "real-source-ingest-worker",
            command: process.env.NODE_BINARY?.trim() || "node",
            args: ["apps/worker/dist/main.js"],
            cwd: repositoryRoot,
            env: environment,
        });

        await waitForCondition(
            "real-source-ingest Worker heartbeat",
            async () => {
                const result = await requestJson(`http://127.0.0.1:${apiPort}/api/v1/health`);
                return result.status === 200 && (result.body as any)?.workerStatus === "ready";
            },
            30_000,
            200,
        );

        report.stage = "source_creation";
        
        const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;
        
        // 创建来源
        const created = expectJsonObject(
            await requestJson(`${apiBaseUrl}/sources`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name: "Task 40 Real RSS Ingest Acceptance",
                    sourceDefinitionRef: "source.rss@1",
                    operationId: "fetch",
                    config: { feedUrl: rssUrl },
                }),
            }),
            201,
            "Real RSS source creation",
        );

        const sourceId = readString(created, "id");
        const planId = readString(created, "planId");

        report.stage = "plan_activation";
        
        // 启用计划
        expectJsonObject(
            await requestJson(`${apiBaseUrl}/collection-plans/${encodeURIComponent(planId)}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    enabled: true,
                    baseRevisionId: readString(created, "planRevisionId"),
                }),
            }),
            200,
            "Real RSS plan activation",
        );

        report.stage = "run_trigger";
        report.fetchStatus = "triggered";
        
        // 触发 Run
        const triggered = expectJsonObject(
            await requestJson(`${apiBaseUrl}/sources/${sourceId}/runs`, {
                method: "POST",
                headers: { "idempotency-key": `task40-real-rss-${Date.now()}` },
            }),
            201,
            "Real RSS Run enqueue",
        );

        const runId = readString(triggered, "id");

        report.stage = "run_execution";
        
        // 等待 Run 完成
        const terminal = await waitForTerminalRun(apiBaseUrl, runId, "real RSS ingest", 300_000);
        assertRunSucceeded("real RSS ingest", runId, terminal);

        report.fetchStatus = "completed";
        report.itemCount = boundedItemCount("real RSS ingest", terminal);

        report.stage = "result_analysis";
        
        // 分析结果
        const entries = await repository.prisma.entry.findMany({
            where: { sourceInstanceId: sourceId },
            include: {
                currentRevision: {
                    include: { currentRepresentation: true },
                },
            },
        });
        const imageAssets = await repository.prisma.asset.findMany({
            where: {
                kind: "image",
                entryRevision: { entry: { sourceInstanceId: sourceId } },
            },
            select: { status: true },
        });

        report.itemCount = entries.length;
        let completeCount = 0;
        let partialCount = 0;
        let failedCount = 0;
        let imageRichCount = 0;
        let totalBlocks = 0;
        let textBlocks = 0;
        let imageBlocks = 0;

        for (const entry of entries) {
            const repr = entry.currentRevision?.currentRepresentation;
            if (!repr) {
                failedCount++;
                continue;
            }

            let blocks: unknown;
            try {
                blocks = JSON.parse(repr.blocksJson) as unknown;
                JSON.parse(repr.qualitySignalsJson);
            } catch {
                failedCount++;
                continue;
            }
            if (!Array.isArray(blocks) || blocks.length === 0 || containsDangerousHtml(blocks)) {
                failedCount++;
                continue;
            }

            const counts = { text: 0, image: 0 };
            countBlockTypes(blocks, counts);
            totalBlocks += blocks.length;
            textBlocks += counts.text;
            imageBlocks += counts.image;
            if (counts.image > 0) imageRichCount++;

            if (repr.status === "complete") completeCount++;
            else if (repr.status === "partial") partialCount++;
            else failedCount++;
        }

        report.parseSuccessRate = entries.length > 0 ? (completeCount + partialCount) / entries.length : 0;
        report.imageRichItems = imageRichCount;
        report.blocksStats = { totalBlocks, textBlocks, imageBlocks };
        report.qualitySignals = {
            completeRepresentations: completeCount,
            partialRepresentations: partialCount,
            failedRepresentations: failedCount,
        };

        report.mediaDownloadRate = imageAssets.length > 0
            ? imageAssets.filter((asset) => asset.status === "saved").length / imageAssets.length
            : null;

        // 检查验收门禁
        const passed = evaluateIngestGate({
            itemCount: report.itemCount,
            imageRichItems: report.imageRichItems,
            mediaDownloadRate: report.mediaDownloadRate,
            completeCount,
            partialCount,
            failedCount,
            totalBlocks,
        }, options.plan.expectations);

        if (passed) {
            report.status = "completed";
            report.stage = "validation_passed";
        } else {
            report.status = "failed";
            report.stage = "validation_failed";
        }

        // 检查日志脱敏
        const records = await readStructuredLogs(join(root, "logs"));
        assertLogsRedacted(records);

        await writeReport();
        
        return { root, report, close };
    } catch (error) {
        report.stage = options.signal?.aborted ? "cancelled" : "error";
        report.status = "failed";
        if (error instanceof Error) {
            report.stage = `error: ${error.message}`;
        }
        await close();
        return { root, report, close: async () => undefined };
    }
}
