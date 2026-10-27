import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createControlledRssServer, type ControlledRssServer } from "../scripts/e2e/controlled-rss.js";
import {
    applyMigrations,
    assertLogsRedacted,
    createRssSource,
    createIsolatedStackRoot,
    databaseUrl,
    disposeIsolatedStack,
    environmentForStack,
    findAvailablePort,
    formatProcessFailure,
    readStructuredLogs,
    repositoryRoot,
    spawnService,
    stopManagedProcess,
    waitForCondition,
    waitForHttp,
    type IsolatedStackRoot,
    type ManagedProcess,
} from "../scripts/e2e/helpers.js";

type JsonResponse = {
    status: number;
    body: unknown;
};

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>Recovery Fixture Feed</title>
        <link>https://example.test/recovery</link>
        <item>
            <guid>recovery-item-001</guid>
            <title>Recovered item</title>
            <link>https://example.test/recovery/1</link>
            <description>Must not be ingested after an uncertain dispatch.</description>
            <pubDate>Tue, 18 Aug 2026 12:00:00 GMT</pubDate>
        </item>
    </channel>
</rss>`;

let stack: IsolatedStackRoot;
let rss: ControlledRssServer;
let api: ManagedProcess;
let firstWorker: ManagedProcess;
let secondWorker: ManagedProcess;
let prisma: PrismaClient;
let apiBaseUrl: string;
let environment: NodeJS.ProcessEnv;

beforeAll(async () => {
    stack = await createIsolatedStackRoot("recovery-e2e");
    applyMigrations(stack.dataRoot);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl(stack.dataRoot) } } });
    rss = await createControlledRssServer(fixtureXml);
    const apiPort = await findAvailablePort(14310);
    apiBaseUrl = `http://127.0.0.1:${apiPort}`;
    environment = environmentForStack(process.env, stack, {
        NODE_ENV: "test",
        COSMOS_API_HOST: "127.0.0.1",
        COSMOS_API_PORT: String(apiPort),
        COSMOS_WORKSPACE_ROOT: repositoryRoot,
        COSMOS_WORKFLOW_HOST_ENABLED: "true",
        COSMOS_WORKER_ADMIN_ENABLED: "false",
        COSMOS_WORKER_POLL_MS: "50",
        COSMOS_WORKER_LEASE_MS: "1000",
        COSMOS_WORKER_SHUTDOWN_DEADLINE_MS: "5000",
    });
    api = spawnService({
        name: "recovery-e2e-api",
        command: process.env.NODE_BINARY?.trim() || "node",
        args: ["apps/api/dist/main.js"],
        cwd: repositoryRoot,
        env: environment,
    });
    await waitForHttp(`${apiBaseUrl}/readyz`, 200, 30_000);
}, 180_000);

afterAll(async () => {
    await stopManagedProcess(secondWorker, "force").catch(() => undefined);
    await stopManagedProcess(firstWorker, "force").catch(() => undefined);
    await stopManagedProcess(api, "force").catch(() => undefined);
    await rss?.close().catch(() => undefined);
    await prisma?.$disconnect();
    if (stack) {
        const records = await readStructuredLogs(stack.logRoot).catch(() => []);
        try {
            assertLogsRedacted(records);
        } finally {
            await disposeIsolatedStack(stack.root);
        }
    }
}, 120_000);

describe("cross-process Worker recovery E2E", () => {
    it("terminalizes an uncertain dispatch without automatically repeating the external request", async () => {
        try {
            const activated = await createRssSource({
                apiBaseUrl,
                feedUrl: rss.url,
                name: "Controlled Recovery RSS",
            });
            const sourceId = readString(activated, "id");
            const queued = await requestJson(`${apiBaseUrl}/api/v1/sources/${sourceId}/runs`, {
                method: "POST",
                headers: { "idempotency-key": "recovery-e2e-run" },
            });
            expect(queued.status).toBe(201);
            const runId = readString(queued.body, "id");
            firstWorker = startWorker("1");
            await waitForCondition("first Worker started and claimed RSS", () => {
                assertWorkerRunning(firstWorker);
                return firstWorker.stdout.includes('"event":"worker.started"') && rss.requests.length >= 1;
            }, 30_000, 50);
            const job = await prisma.job.findFirstOrThrow({ where: { workflowRunId: runId } });
            expect(job).toMatchObject({
                status: "leased",
                attempts: 1,
                leaseOwner: expect.stringContaining(`:${firstWorker.child.pid}`),
            });
            expect(job.dispatchAuthorizedAt).not.toBeNull();

            await stopManagedProcess(firstWorker, "force");
            expect((await firstWorker.waitForExit(10_000)).code).not.toBe(0);
            // Observe the durable lease: a fixed sleep could kill coverage of the expired-lease path.
            await waitForCondition("crashed Activity and Run leases expired", async () => {
                const currentJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
                const run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
                const now = Date.now();
                return currentJob.leaseExpiresAt !== null && currentJob.leaseExpiresAt.getTime() <= now
                    && run.runLeaseExpiresAt !== null && run.runLeaseExpiresAt.getTime() <= now;
            }, 30_000, 50);
            secondWorker = startWorker("2");
            await waitForCondition("second Worker terminalized uncertain dispatch", async () => {
                assertWorkerRunning(secondWorker);
                const currentJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
                const result = await requestJson(`${apiBaseUrl}/api/v1/runs/${runId}`);
                return secondWorker.stdout.includes('"event":"worker.started"')
                    && currentJob.errorCode === "outcome_unknown"
                    && result.status === 200 && isRecord(result.body) && result.body.status === "failed";
            }, 30_000, 50);
            await assertUnknownOutcome(runId, job.id);
            rss.release();
            await waitForCondition("uncertain completion safely drained", async () => {
                assertWorkerRunning(secondWorker);
                const completion = await prisma.workflowCompletion.findUniqueOrThrow({ where: { jobId: job.id } });
                return completion.status === "dead_letter";
            }, 30_000, 50);
            const feed = await requestJson(`${apiBaseUrl}/api/v1/feed?limit=10`);
            expect(feed).toMatchObject({ status: 200, body: { items: [] } });
            expect(await prisma.entry.count()).toBe(0);
            expect(await prisma.observation.count()).toBe(0);
            expect(await prisma.entryRevision.count()).toBe(0);
            expect(await prisma.job.count({ where: { workflowRunId: runId } })).toBe(1);
            expect(rss.requests).toHaveLength(1);
        } catch (error) {
            throw new Error([
                error instanceof Error ? error.stack ?? error.message : String(error),
                api ? formatProcessFailure(api) : "",
                firstWorker ? formatProcessFailure(firstWorker) : "",
                secondWorker ? formatProcessFailure(secondWorker) : "",
            ].filter(Boolean).join("\n"));
        }
    }, 180_000);
});

function startWorker(number: "1" | "2"): ManagedProcess {
    return spawnService({
        name: `recovery-e2e-worker-${number}`,
        command: process.env.NODE_BINARY?.trim() || "node",
        args: ["apps/worker/dist/main.js"],
        cwd: repositoryRoot,
        env: { ...environment, COSMOS_WORKER_ID: `recovery-worker-${number}` },
    });
}

function assertWorkerRunning(worker: ManagedProcess): void {
    if (worker.child.exitCode !== null || worker.child.signalCode !== null) {
        throw new Error(formatProcessFailure(worker));
    }
}

async function assertUnknownOutcome(runId: string, jobId: string): Promise<void> {
    await expect(prisma.job.findUniqueOrThrow({ where: { id: jobId } })).resolves.toMatchObject({
        status: "failed_terminal",
        errorCode: "outcome_unknown",
        attempts: 1,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
    });
    await expect(prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } })).resolves.toMatchObject({
        status: "failed",
        errorMessage: "Activity dispatch outcome is unknown; the external request may already have been sent.",
        runLeaseOwner: null,
        runLeaseToken: null,
        runLeaseExpiresAt: null,
        resumeRequired: false,
    });
    const completion = await prisma.workflowCompletion.findUniqueOrThrow({ where: { jobId } });
    expect(JSON.parse(completion.completionJson) as unknown).toMatchObject({ status: "failed", receipt: jobId });
}

async function requestJson(url: string, init?: RequestInit): Promise<JsonResponse> {
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

function readString(value: unknown, key: string): string {
    if (!isRecord(value) || typeof value[key] !== "string" || value[key].length === 0) {
        throw new Error(`Expected ${key} in response.`);
    }
    return value[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
