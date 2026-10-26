import { hostname } from "node:os";

import {
    ConnectorProbeService,
    ConnectionProbeService,
    createBuiltinManifestCatalog,
    createMediaAcquirer,
    IngestionService,
    IngestionWorker,
    parseAllowedHosts,
    SourceConfigProbeService,
    createStoryAgentWorkflowDefinition,
    createStoryAgentSaveAction,
} from "@cosmos/application";
import {
    createIngestActions,
    createIngestWorkflowDefinition,
} from "@cosmos/application/workflow-ingest";
import {
    createMediaCleanupActions,
    createMediaCleanupWorkflowDefinition,
} from "@cosmos/application/media-cleanup";
import { IngestWorkflowControlService } from "@cosmos/application/workflow-control";
import { createLogger } from "@cosmos/logging";
import { createBuiltInConnectorRegistry } from "@cosmos/plugin-collectors";
import { PrismaAgentModelConnectionResolver, PrismaConnectorStateStore, PrismaCosmosRepository, PrismaStoryAgentCandidateRepository } from "@cosmos/storage-prisma";
import { createWorkerAdminServer, type ComponentHealth, type WorkerAdminServer } from "@cosmos/worker-admin";
import type { ConnectorStateHandle, ConnectorStateStorePort, LoggerPort } from "@cosmos/application";
import type { CatalogPort } from "@cosmos/application/catalog";
import type { SourceExecutionSnapshot } from "@cosmos/contracts";
import { parseWorkerRuntimeConfig } from "./config.js";
import { WorkerRuntime } from "./runtime.js";
import { createProxyFetch, describeProxyConfig } from "./proxy-fetch.js";
import { createScheduleQueue } from "./scheduling.js";
import { createWorkflowHost } from "./workflow-host.js";
import { createWorkerAgentInvocationV2Action } from "./agent-action-v2.js";

/**
 * 把执行快照解析成连接器状态句柄：命名空间取自 manifest 的 `stateStoreNamespace`
 * （ADR-0018，声明为 null 就不给句柄，连接器退化成无状态抓取），`{id}` 换成**计划 id**
 * （ADR-0023 决策 2：状态按计划隔离），并在这里登记抽屉归属（ADR-0026）。
 */
async function resolveConnectorStateHandle(
    store: ConnectorStateStorePort,
    catalog: CatalogPort,
    source: SourceExecutionSnapshot,
    logger: LoggerPort,
): Promise<ConnectorStateHandle | undefined> {
    const definition = catalog.getSourceDefinitionByRef(source.sourceDefinitionRef);
    const namespace = definition?.operations
        .find((operation) => operation.operationId === source.operationId)
        ?.stateStoreNamespace;
    if (!namespace) {
        return undefined;
    }
    const resolved = namespace.replaceAll("{id}", source.planId);
    // 登记是尽力而为的元数据：失败或与别的计划冲突都只记日志。状态写入本来就允许
    // 降级（连接器把 CAS 冲突吞成一条调试日志），不该因为归属登记让采集失败。
    try {
        const registration = await store.registerNamespace(resolved, { planId: source.planId });
        if (registration === "conflict") {
            logger.debug("connector.state.owner_conflict", {
                namespace: resolved,
                planId: source.planId,
            });
        }
    } catch (error) {
        logger.debug("connector.state.registration_skipped", {
            namespace: resolved,
            planId: source.planId,
            reason: error instanceof Error ? error.name : "unknown",
        });
    }
    return {
        get: (key) => store.getState(resolved, key),
        put: (key, value, expectedVersion) => store.putState(resolved, key, value, expectedVersion),
    };
}

async function bootstrap(): Promise<void> {
    // Parse all untrusted numeric configuration before constructing any
    // repository, connector, durable host or Admin listener.
    const config = parseWorkerRuntimeConfig();
    const instanceId = `${hostname()}:${process.pid}`;
    const logger = createLogger({
        service: "cosmos-worker",
        fileName: "worker",
        instanceId,
    });
    const catalog = createBuiltinManifestCatalog();
    const repository = new PrismaCosmosRepository({ logger, catalog });
    const proxyConfig = describeProxyConfig(process.env);
    if (proxyConfig.enabled) {
        logger.info("network.proxy.enabled", {
            proxyHost: proxyConfig.proxyHost,
        });
    }
    const connectors = createBuiltInConnectorRegistry({
        workspaceRoot: process.env.COSMOS_WORKSPACE_ROOT ?? process.cwd(),
        logger,
        fetch: createProxyFetch(),
    });
    const connectorStateStore = new PrismaConnectorStateStore(repository.prisma);
    const mediaAcquirer = createMediaAcquirer({
        fetch: createProxyFetch(),
        allowedHosts: parseAllowedHosts(process.env.COSMOS_MEDIA_ALLOWED_HOSTS),
        logger,
    });
    let workerAdminServer: WorkerAdminServer | null = null;
    let runtime: WorkerRuntime | null = null;

    const heartbeat = async (status: "starting" | "ready" | "stopped"): Promise<void> => {
        await repository.touchWorkerHeartbeat({
            instanceId,
            status,
            version: config.version,
        });
        workerAdminServer?.service.markHeartbeat();
    };

    try {
        await repository.initialize();
        await heartbeat("starting");
        const ingestion = new IngestionService(
            repository,
            (source) => connectors.resolve(source),
            logger,
            mediaAcquirer,
            repository.blobs,
        );
        const probe = new ConnectorProbeService(
            repository,
            (source) => connectors.resolve(source),
            undefined,
            logger,
        );
        const configProbe = new SourceConfigProbeService(
            catalog,
            connectors,
            undefined,
            logger,
            async (connectionId) => {
                const connection = await repository.getConnection(connectionId);
                return connection === null
                    ? null
                    : {
                        id: connection.id,
                        connectorId: connection.connectorId,
                        configJson: connection.configJson,
                    };
            },
        );
        // 连接登录探测（Proposal connection-login-lifecycle-v1 决定 2）：按连接解析连接器，
        // 探测走 Worker——API 不访问外部平台。
        const connectionProbe = new ConnectionProbeService(
            repository,
            (connectorId) => connectors.resolveByConnectorId(connectorId),
            undefined,
            logger,
        );
        const workflowHost = config.workflowHostEnabled
            ? createWorkflowHost({
                prisma: repository.prisma,
                blobs: repository.blobs,
                definitions: [
                    createIngestWorkflowDefinition(),
                    createMediaCleanupWorkflowDefinition(),
                    createStoryAgentWorkflowDefinition(),
                ],
                actions: [
                    // Agent 只有连接作用域一个版本：模型、地址与凭证都在调用时按那条连接解析，
                    // 没有启动期 profile，所以这里无条件注册。
                    createWorkerAgentInvocationV2Action({
                        connections: new PrismaAgentModelConnectionResolver(repository.prisma),
                        secrets: repository.secrets,
                    }),
                    ...createIngestActions({
                        resolveConnector: (source) => connectors.resolve(source),
                        blobs: repository.blobs,
                        domain: repository,
                        unchangedItems: repository,
                        mediaAcquirer,
                        mediaRetrier: mediaAcquirer,
                        retryCandidates: repository,
                        connectorState: (source) =>
                            resolveConnectorStateHandle(connectorStateStore, catalog, source, logger),
                        logger,
                    }),
                    ...createMediaCleanupActions({ domain: repository, logger }),
                    createStoryAgentSaveAction(new PrismaStoryAgentCandidateRepository(repository.prisma)),
                ],
                owner: instanceId,
                workerId: config.workerId,
                leaseMs: config.leaseMs,
                logger,
                onAttemptStarted: (attempt) => workerAdminServer?.service.registerAttempt({
                    ...attempt,
                    lane: "workflow-activity",
                }),
                onAttemptFinished: (attemptId) => workerAdminServer?.service.finishAttempt(attemptId),
            })
            : null;
        const workflowControl = workflowHost
            ? new IngestWorkflowControlService({
                store: workflowHost.store,
                getSourceExecutionSnapshot: async (sourceId) => {
                    const source = await repository.getSource(sourceId);
                    return source ?? null;
                },
                getCheckpointSnapshot: (planId) => repository.getCheckpointSnapshot(planId),
            })
            : null;
        const scheduleQueue = workflowControl
            ? createScheduleQueue({
                listScheduleTriggers: () => repository.listScheduleTriggers(),
                queue: workflowControl,
                logger,
            })
            : null;
        const worker = new IngestionWorker(repository, ingestion, {
            owner: instanceId,
            leaseMs: config.leaseMs,
            probe,
            configProbe,
            connectionProbe,
            schedule: workflowHost === null,
            logger,
        });
        const executableActionRefs = new Set(
            workflowHost?.actions.descriptors().map((descriptor) => descriptor.ref) ?? [],
        );
        const workflowEvidence = workflowHost
            ? catalog.listWorkflowDefinitions().map((definition) => ({
                ref: definition.ref,
                manifestHash: definition.manifestHash,
            }))
            : [];
        const actionEvidence = catalog.listActionDefinitions()
            .filter((definition) => executableActionRefs.has(definition.ref))
            .map((definition) => ({
                ref: definition.ref,
                manifestHash: definition.manifestHash,
                executionPlacements: [definition.executionPlacement],
            }));
        const connectorEvidence = catalog.listSourceDefinitions().map((definition) => ({
            ref: definition.ref,
            manifestHash: definition.manifestHash,
        }));
        const adminComponentHealth = async () => {
            const checkedAt = new Date().toISOString();
            const health = await repository.health();
            const storage = toWorkerComponentHealth(health.storageStatus, checkedAt);
            return {
                migration: toWorkerComponentHealth(health.migrationStatus, checkedAt),
                taskStore: storage,
                definitionCatalog: workflowHost
                    ? workerComponent("ready", checkedAt)
                    : workerComponent("disabled", checkedAt),
                actionRegistry: workflowHost
                    ? workerComponent("ready", checkedAt)
                    : workerComponent("disabled", checkedAt),
                connectorRegistry: workerComponent("ready", checkedAt),
                valueStore: storage,
            } satisfies Record<string, ComponentHealth>;
        };

        if (config.workerAdminEnabled) {
            workerAdminServer = createWorkerAdminServer({
                workerId: config.workerId,
                instanceId,
                version: config.version,
                mode: "direct",
                host: config.workerAdminHost,
                port: config.workerAdminPort,
                authorize: config.workerAdminToken
                    ? (request) => request.headers.authorization === `Bearer ${config.workerAdminToken}`
                    : undefined,
                lanes: workflowHost
                    ? [
                        { lane: "workflow-run" },
                        { lane: "workflow-activity" },
                        { lane: "workflow-completion" },
                        { lane: "legacy" },
                    ]
                    : [{ lane: "legacy" }],
                health: adminComponentHealth,
                genericCapabilities: workflowHost
                    ? ["source:read", "connector:execute", "workflow:execute", "library:write"]
                    : ["source:read", "connector:execute"],
                workflowEvidence,
                actionEvidence,
                connectorEvidence,
                limits: { maxConcurrency: workflowHost ? 4 : 1 },
                onDrain: async () => {
                    await runtime?.requestShutdown("ADMIN_DRAIN");
                },
                onDrainTimeout: async () => {
                    await runtime?.forceShutdown("ADMIN_DRAIN_TIMEOUT");
                },
            });
            await workerAdminServer.start();
            workerAdminServer.service.markReady();
            const address = workerAdminServer.server.address();
            const port = address && typeof address !== "string" ? address.port : config.workerAdminPort;
            logger.info("worker.admin.started", {
                host: config.workerAdminHost,
                port,
            });
        }

        runtime = new WorkerRuntime({
            repository,
            workflowHost,
            workflowControl,
            worker,
            workerAdminServer,
            logger,
            closeLogger: () => logger.close(),
            config,
            instanceId,
            heartbeat,
            queueScheduledWorkflowSources: scheduleQueue ?? (async () => undefined),
            activeAttemptCount: () => workerAdminServer?.service.status().activeAttemptCount ?? 0,
        });

        logger.info("worker.started", {
            intervalMs: config.pollMs,
            leaseMs: config.leaseMs,
            mode: process.env.NODE_ENV ?? "development",
            workflowHostEnabled: config.workflowHostEnabled,
            workflowActionRefs: workflowHost?.actions.descriptors().map((descriptor) => descriptor.ref) ?? [],
        });
        const stopForSignal = (reason: string): void => {
            void runtime?.requestShutdown(reason).then((result) => {
                process.exitCode = result.status === "succeeded" ? 0 : 1;
            });
        };
        process.once("SIGINT", () => stopForSignal("SIGINT"));
        process.once("SIGTERM", () => stopForSignal("SIGTERM"));
        await runtime.start();
    } catch (error) {
        workerAdminServer?.service.markStopped();
        await workerAdminServer?.close().catch(() => undefined);
        await repository.close().catch(() => undefined);
        await logger.close().catch(() => undefined);
        throw error;
    }
}

function workerComponent(status: ComponentHealth["status"], checkedAt: string): ComponentHealth {
    return { status, checkedAt };
}

function toWorkerComponentHealth(status: string, checkedAt: string): ComponentHealth {
    return workerComponent(
        status === "ready" ? "ready" : status === "failed" ? "unavailable" : "unknown",
        checkedAt,
    );
}

void bootstrap().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
});
