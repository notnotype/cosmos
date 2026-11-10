import { expect, it } from "vitest";
import { ConnectorExecutionError, ConnectorProbeService, ConnectionProbeService, createBuiltinManifestCatalog, ConnectorRegistry, IngestionService, IngestionWorker, SourceConfigProbeService, type IngestConnector } from "@cosmos/application";
import { createFixtureSource, withRepository } from "./index.fixtures.js";

    it("lets the persistent worker consume a queued source run end to end", async () => {
        await withRepository("worker-test", async (repository) => {
            const source = await createFixtureSource(repository, {
                name: "Worker fixture",
                config: {},
            });
            const run = await repository.createQueuedRun({
                sourceId: source.id,
                triggerKind: "manual",
            });
            const connector: IngestConnector = {
                id: "worker-test",
                description: "Worker test",
                configVersion: "v1",
                capabilities: ["test"],
                validate: () => undefined,
                async fetchItems() {
                    return {
                        items: [{
                            externalId: "worker-item",
                            title: "Worker item",
                            summary: "From worker",
                            contentText: "Persisted by worker",
                            webUrl: null,
                            kind: "article",
                            publisher: null,
                            metrics: null,
                            publishedAt: null,
                            updatedAt: null,
                            sourceLocator: { provider: "test" },
                            rawPayload: "<item>worker</item>",
                            assets: [],
                        }],
                        nextCursor: "worker-cursor",
                    };
                },
            };
            const ingestion = new IngestionService(
                repository,
                () => connector,
            );
            const worker = new IngestionWorker(repository, ingestion, {
                owner: "worker-test",
                leaseMs: 60_000,
            });

            const result = await worker.pollOnce();

            expect(result?.status).toBe("succeeded");
            expect((await repository.getRun(run.id))?.status).toBe("succeeded");
            expect((await repository.feed({ limit: 20 })).items).toHaveLength(1);
            expect(await repository.getCheckpoint(source.planId)).toBe("worker-cursor");
        });
    });

    it("runs source probes in a worker without persisting entries or checkpoints", async () => {
        await withRepository("probe-test", async (repository) => {
            const source = await createFixtureSource(repository, {
                name: "Probe fixture",
                config: {},
            });
            const job = await repository.createProbeJob({
                sourceId: source.id,
                idempotencyKey: "probe-command-1",
            });
            const connector: IngestConnector = {
                id: "probe-test",
                description: "Probe test",
                configVersion: "v1",
                capabilities: ["test"],
                validate: () => undefined,
                async fetchItems() {
                    return {
                        items: [{
                            externalId: "probe-item",
                            title: "Probe item",
                            summary: null,
                            contentText: "Should not be persisted",
                            webUrl: null,
                            kind: "article",
                            publisher: null,
                            metrics: null,
                            publishedAt: null,
                            updatedAt: null,
                            sourceLocator: { provider: "probe-test" },
                            rawPayload: "{}",
                            assets: [],
                        }],
                        nextCursor: "probe-cursor",
                    };
                },
            };
            const probe = new ConnectorProbeService(
                repository,
                () => connector,
            );
            const worker = new IngestionWorker(
                repository,
                new IngestionService(repository, () => connector),
                {
                    owner: "probe-worker",
                    leaseMs: 60_000,
                    probe,
                },
            );

            const result = await worker.pollOnce();

            expect(result?.status).toBe("succeeded");
            expect((await repository.getJob(job.id))?.result).toMatchObject({
                sourceId: source.id,
                connectorId: "probe-test",
                itemCount: 1,
                nextCursorAvailable: true,
            });
            expect((await repository.entries({ limit: 20 })).items).toHaveLength(0);
            expect(await repository.getCheckpoint(source.planId)).toBeNull();
        });
    });

    it("runs a source config probe job idempotently without persisting library data", async () => {
        await withRepository("config-probe-test", async (repository) => {
            const command = {
                sourceDefinitionRef: "source.rss@1",
                operationId: "fetch",
                config: { feedUrl: "https://example.test/feed.xml" },
            } as const;
            const job = await repository.createConfigProbeJob({
                command,
                idempotencyKey: "config-probe-command-1",
            });
            const replayed = await repository.createConfigProbeJob({
                command,
                idempotencyKey: "config-probe-command-1",
            });
            expect(replayed.id).toBe(job.id);
            expect(job.kind).toBe("source-config-probe");
            expect(job.sourceId).toBeNull();

            const connector: IngestConnector = {
                id: "rss",
                description: "RSS",
                configVersion: "source.rss@1",
                capabilities: ["source:read"],
                validate: () => undefined,
                async fetchItems() {
                    return {
                        items: [{
                            externalId: "config-probe-item",
                            title: "Config probe item",
                            summary: null,
                            contentText: "Should not be persisted",
                            webUrl: null,
                            kind: "article",
                            publisher: null,
                            metrics: null,
                            publishedAt: null,
                            updatedAt: null,
                            sourceLocator: { provider: "rss" },
                            rawPayload: "{}",
                            assets: [],
                        }],
                        nextCursor: "must-not-be-persisted",
                    };
                },
            };
            const configProbe = new SourceConfigProbeService(
                createBuiltinManifestCatalog(),
                new ConnectorRegistry([connector]),
            );
            const worker = new IngestionWorker(
                repository,
                new IngestionService(repository, () => connector),
                {
                    owner: "config-probe-worker",
                    leaseMs: 60_000,
                    configProbe,
                },
            );

            const result = await worker.pollOnce();

            expect(result?.status).toBe("succeeded");
            expect((await repository.getJob(job.id))?.result).toMatchObject({
                sourceDefinitionRef: "source.rss@1",
                connectorId: "rss",
                itemCount: 1,
                nextCursorAvailable: true,
                sampleTitles: ["Config probe item"],
            });
            expect((await repository.entries({ limit: 20 })).items).toHaveLength(0);
            expect((await repository.listSources()).filter((source) => source.id === "config-probe")).toHaveLength(0);
        });
    });

    /**
     * 连接登录探测的 Worker 派发（Proposal connection-login-lifecycle-v1 决定 2）：作业被认领、
     * 跑完、结论写回连接。认领清单是显式的，所以这条用例同时守住「新 kind 进了 acceptedKinds」。
     */
    it("dispatches a connection probe job and writes the conclusion back", async () => {
        await withRepository("connection-probe-test", async (repository) => {
            const connection = await repository.createConnection({
                name: "主账号",
                connectorId: "bilibili",
                configJson: '{"profile":"chrome-main"}',
            });
            const job = await repository.createConnectionProbeJob({
                connectionId: connection.id,
                idempotencyKey: "connection-probe-1",
            });
            expect(job.kind).toBe("connection-probe");
            expect(job.sourceId).toBeNull();

            const connector: IngestConnector = {
                id: "bilibili",
                description: "Bilibili",
                configVersion: "v1",
                capabilities: ["bilibili"],
                validate: () => undefined,
                async fetchItems() {
                    return { items: [], nextCursor: null };
                },
                async probeAuthorization() {
                    return { outcome: "expired", reason: "需要重新登录。" };
                },
            };
            const connectionProbe = new ConnectionProbeService(
                repository,
                () => connector,
                () => "2026-09-23T09:00:00.000Z",
            );
            const worker = new IngestionWorker(
                repository,
                new IngestionService(repository, () => connector),
                {
                    owner: "connection-probe-worker",
                    leaseMs: 60_000,
                    connectionProbe,
                },
            );

            const result = await worker.pollOnce();
            expect(result?.status).toBe("succeeded");
            expect((await repository.getJob(job.id))?.result).toMatchObject({
                connectionId: connection.id,
                outcome: "expired",
                reason: "需要重新登录。",
            });
            // 结论写回连接：这就是「登录状态有自动写入方」的证据。
            await expect(repository.getConnection(connection.id)).resolves.toMatchObject({
                status: "expired",
                lastError: "需要重新登录。",
                lastCheckedAt: "2026-09-23T09:00:00.000Z",
            });
        });
    });

    it("does not retry non-retryable connector failures", async () => {
        await withRepository("failure-test", async (repository) => {
            const source = await createFixtureSource(repository, {
                name: "Auth fixture",
                config: {},
            });
            const run = await repository.createQueuedRun({
                sourceId: source.id,
                triggerKind: "manual",
                idempotencyKey: "auth-failure-1",
            });
            const connector: IngestConnector = {
                id: "auth-failure",
                description: "Auth failure",
                configVersion: "v1",
                capabilities: ["test"],
                validate: () => undefined,
                async fetchItems() {
                    throw new ConnectorExecutionError(
                        "authentication_required",
                        "Login is required.",
                        false,
                    );
                },
            };
            const worker = new IngestionWorker(
                repository,
                new IngestionService(repository, () => connector),
                {
                    owner: "auth-failure-worker",
                    leaseMs: 60_000,
                },
            );

            const result = await worker.pollOnce();
            const events = await repository.events({
                afterSequence: 0,
                limit: 100,
            });
            const leasedEvent = events.find((event) => event.type === "job.leased.v1");
            const jobId = leasedEvent
                && typeof (leasedEvent.payload as { jobId?: unknown }).jobId === "string"
                ? (leasedEvent.payload as { jobId: string }).jobId
                : null;
            const job = jobId ? await repository.getJob(jobId) : null;

            expect(result?.status).toBe("failed_terminal");
            expect((await repository.getRun(run.id))?.status).toBe("failed");
            expect(job?.errorCode).toBe("authentication_required");
        });
    });

    it("queues a scheduled source once per interval bucket", async () => {
        await withRepository("schedule-test", async (repository) => {
            const source = await createFixtureSource(repository, {
                name: "Scheduled fixture",
                config: {},
                scheduleIntervalMs: 60_000,
            });
            const connector: IngestConnector = {
                id: "schedule-test",
                description: "Schedule test",
                configVersion: "v1",
                capabilities: ["test"],
                validate: () => undefined,
                async fetchItems() {
                    return {
                        items: [],
                        nextCursor: "schedule-cursor",
                    };
                },
            };
            const worker = new IngestionWorker(
                repository,
                new IngestionService(repository, () => connector),
                {
                    owner: "schedule-worker",
                    leaseMs: 60_000,
                    now: () => new Date("2026-08-08T00:00:00.000Z"),
                },
            );

            await worker.queueScheduledSources();
            await worker.queueScheduledSources();
            const result = await worker.pollOnce();

            expect(result?.status).toBe("succeeded");
            expect(await repository.getCheckpoint(source.planId)).toBe("schedule-cursor");
        });
    });
    it("commits Workflow checkpoint revisions only under the current dual fence", async () => {
        await withRepository("workflow-checkpoint-test", async (repository) => {
            const workflowRunId = "workflow-checkpoint-run";
            const jobId = "workflow-checkpoint-job";
            await repository.prisma.workflowRun.create({
                data: {
                    id: workflowRunId,
                    stateJson: JSON.stringify({ runId: workflowRunId, status: "running", revision: 1 }),
                    kernelRevision: 1,
                    status: "running",
                    resumeRequired: false,
                    definitionKey: "cosmos.ingest",
                    definitionVersion: "1",
                    manifestHash: "builtin:cosmos.ingest@1:source-snapshot-v1",
                    idempotencyKey: "workflow-checkpoint-command",
                    inputSnapshotJson: "{}",
                    productRunJson: "{}",
                    runLeaseOwner: "worker-checkpoint",
                    runLeaseToken: "run-fence",
                    runLeaseExpiresAt: new Date(Date.now() + 60_000),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });
            await repository.prisma.sourceInstance.create({
                data: {
                    id: "source-checkpoint",
                    name: "Checkpoint",
                    kind: "fixture-rss",
                    sourceDefinitionRef: "source.fixture-rss@1",
                    operationId: "fetch",
                    configJson: "{}",
                    enabled: true,
                    revision: 1,
                },
            });
            // checkpoint 归属采集计划；只有来源行不足以满足计划外键。
            await repository.prisma.collectionPlan.create({
                data: {
                    id: "plan:source-checkpoint",
                    sourceId: "source-checkpoint",
                    name: "Checkpoint",
                    enabled: true,
                },
            });
            await repository.prisma.job.create({
                data: {
                    id: jobId,
                    workflowRunId,
                    kind: "workflow-activity",
                    status: "leased",
                    idempotencyKey: "workflow-checkpoint-job-key",
                    attempts: 1,
                    maxAttempts: 3,
                    payloadJson: JSON.stringify({
                        activity: {
                            key: "collection-plan.checkpoint",
                            path: "root",
                            seq: 0,
                            kind: "action",
                            fingerprint: "sha256:checkpoint",
                        },
                    }),
                    leaseOwner: "worker-checkpoint",
                    leaseToken: "job-fence",
                    leaseExpiresAt: new Date(Date.now() + 60_000),
                    workflowKernelRevision: 1,
                },
            });
            await expect(repository.setWorkflowIngestCheckpoint({
                planId: "plan:source-checkpoint",
                workflowRunId,
                cursor: "cursor-1",
                expectedRevision: 0,
                itemCount: 0,
                fence: {
                    workflowRunId,
                    kernelRevision: 1,
                    activity: {
                        key: "collection-plan.checkpoint",
                        path: "root",
                        seq: 0,
                        kind: "action",
                        fingerprint: "sha256:checkpoint",
                    },
                    jobId,
                    attempt: 1,
                    jobLeaseToken: "job-fence",
                    runLeaseToken: "run-fence",
                },
                idempotencyKey: "workflow-checkpoint-action-key",
            })).resolves.toEqual({
                planId: "plan:source-checkpoint",
                cursor: "cursor-1",
                revision: 1,
                committed: true,
            });
            await expect(repository.getCheckpointSnapshot("plan:source-checkpoint"))
                .resolves.toEqual({ cursor: "cursor-1", revision: 1 });
        });
    });
