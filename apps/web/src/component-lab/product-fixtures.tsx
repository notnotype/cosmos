import {useMemo, useState} from "react";
import {zodResolver} from "@hookform/resolvers/zod";
import {useForm} from "react-hook-form";

import type {
    BoardBlock,
    BoardDetail,
    CollectionPlanSnapshot,
    ConnectionInstance,
    EntityDetail,
    EntitySummary,
    EntryDetail,
    FeedItem,
    HealthResponse,
    RunControlResult,
    RunSnapshot,
    SourceConfigProbeResult,
    SourceDefinitionManifest,
    SourceSnapshot,
    StoryDetail,
    StorySubtype,
    TopicDetail,
} from "@cosmos/contracts";
import { HttpCosmosClient } from "@cosmos/transport-http";

import { BoardView } from "@/components/cosmos/board-view";
import { BoardBlockList, BoardDndProvider } from "@/components/cosmos/board-sortable-blocks";
import {ConnectionPanel} from "@/components/cosmos/connection-panel";
import {FeedBrowser, searchSchema, type SearchFormValues} from "@/components/cosmos/feed-browser";
import {RunControl} from "@/components/cosmos/run-control";
import {RunHistory} from "@/components/cosmos/run-history";
import {StoragePanel} from "@/components/cosmos/storage-panel";
import {CollectionPlanList} from "@/components/cosmos/collection-plan-list";
import {
    SourceForm,
    sourceFormSchema,
    type ProbeState,
    type SourceDefinitionState,
    type SourceFormValues,
} from "@/components/cosmos/source-form";
import {
    StatusSummary,
    type EventStreamState,
} from "@/components/cosmos/status-summary";
import {StoryEditPanel} from "@/components/cosmos/story-edit-panel";
import {StoryReadingContent} from "@/components/cosmos/story-reading-content";
import {TopicPanel} from "@/components/cosmos/topic-panel";
import {EntityPanel} from "@/components/cosmos/entity-panel";
import {ThemeSwitcher} from "@/components/cosmos/theme-switcher";

import type {CosmosThemePreference} from "@/theme/theme";

import type {LabProps} from "./types";

const fixtureTimestamp = "2026-01-01T00:00:00.000Z";

/** 合成连接：表单的连接选择与计划列表的按连接分组都用它。 */
const labConnections: readonly ConnectionInstance[] = [{
    id: "connection-fixture",
    name: "Cosmos 主账号",
    connectorId: "fixture-rss",
    account: "fixture@example.test",
    scopeJson: null,
    configJson: null,
    status: "active",
    secretRef: null,
    lastError: null,
    lastCheckedAt: null,
    modelId: null,
    version: 1,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
}];

/** 与 domain 注册表同构的合成目录；实验室不发任何 Product API 请求。 */
const labStorySubtypeOptions: readonly StorySubtype[] = [
    {
        id: "media.comic",
        kind: "media",
        version: 1,
        label: "漫画",
        description: "同一部漫画作品。",
        status: "active",
        identityPolicy: "same-work-v1",
        owner: "core",
    },
    {
        id: "media.anime",
        kind: "media",
        version: 1,
        label: "动画",
        description: "同一部动画作品。",
        status: "active",
        identityPolicy: "same-work-v1",
        owner: "core",
    },
    {
        id: "media.video",
        kind: "media",
        version: 1,
        label: "视频",
        description: "同一段视频或影像作品。",
        status: "active",
        identityPolicy: "same-work-v1",
        owner: "core",
    },
];

function textProp(props: LabProps, name: string, fallback: string): string {
    const value = props[name];
    return typeof value === "string" ? value : fallback;
}

export function optionProp<T extends string>(props: LabProps, name: string, fallback: T, options: readonly T[]): T {
    const value = props[name];
    return typeof value === "string" && options.includes(value as T) ? value as T : fallback;
}

function booleanProp(props: LabProps, name: string, fallback = false): boolean {
    const value = props[name];
    return typeof value === "boolean" ? value : fallback;
}

/** 合成 manifest：与产品 `source.rss@1` 的 configurationSchema 同构，但无任何网络请求。 */
const labSourceDefinitionManifest: SourceDefinitionManifest = {
    id: "rss",
    version: 1,
    ref: "source.rss@1",
    provider: "cosmos",
    connectorId: "rss",
    displayName: "RSS",
    description: "Fetch one RSS or Atom feed page.",
    manifestHash: {algorithm: "builtin", value: "builtin:source.rss@1"},
    status: "enabled",
    operationIds: ["fetch"],
    capabilities: ["source:read", "cursor"],
    configurationSchema: {
        id: "source.rss.config@1",
        version: 1,
        hash: {algorithm: "builtin", value: "source.rss.config@1"},
        schema: {
            type: "object",
            properties: {
                feedUrl: {type: "string", format: "uri"},
            },
            required: ["feedUrl"],
            additionalProperties: false,
        },
    },
    auth: {kind: "none", label: null, secretRefRequired: false, probeSupported: false},
    operations: [{
        operationId: "fetch",
        inputSchema: {id: "source.rss.fetch.input@1", version: 1, hash: {algorithm: "builtin", value: "source.rss.fetch.input@1"}},
        outputSchema: {id: "source.rss.fetch.output@1", version: 1, hash: {algorithm: "builtin", value: "source.rss.fetch.output@1"}},
        configurationSchema: null,
        externalKey: "url",
        discoveryContext: "",
        media: "download",
        stateStoreNamespace: "{id}",
    }],
};

/**
 * 合成 Bilibili 定义：`mode` 只有 `enum` 没有 `type`，是表单必须处理的那种属性；
 * 认证是 external（OpenCLI 登录态），用来覆盖「认证提示」分支。第二个 operation
 * 自带配置 schema（EXT-006），用来覆盖「操作选择器 + 按操作渲染字段」分支。
 */
const labBilibiliDefinitionManifest: SourceDefinitionManifest = {
    id: "bilibili",
    version: 1,
    ref: "source.bilibili@1",
    provider: "cosmos",
    connectorId: "bilibili",
    displayName: "Bilibili",
    description: "Read Bilibili data through a trusted OpenCLI profile.",
    manifestHash: {algorithm: "builtin", value: "builtin:source.bilibili@1"},
    status: "enabled",
    operationIds: ["fetch", "search"],
    capabilities: ["source:read", "cursor", "external:opencli"],
    configurationSchema: {
        id: "source.bilibili.config@1",
        version: 1,
        hash: {algorithm: "builtin", value: "source.bilibili.config@1"},
        schema: {
            type: "object",
            properties: {
                mode: {enum: ["hot", "feed"]},
                limit: {type: "integer", minimum: 1, maximum: 100},
            },
            required: ["mode"],
            additionalProperties: false,
        },
    },
    auth: {kind: "external", label: "OpenCLI 浏览器登录态", secretRefRequired: false, probeSupported: true},
    operations: [
        {
            operationId: "fetch",
            inputSchema: {id: "source.bilibili.fetch.input@1", version: 1, hash: {algorithm: "builtin", value: "source.bilibili.fetch.input@1"}},
            outputSchema: {id: "source.bilibili.fetch.output@1", version: 1, hash: {algorithm: "builtin", value: "source.bilibili.fetch.output@1"}},
            configurationSchema: null,
            externalKey: "url",
            discoveryContext: "",
            media: "metadata_only",
            stateStoreNamespace: "{id}",
        },
        {
            operationId: "search",
            inputSchema: {id: "source.bilibili.search.input@1", version: 1, hash: {algorithm: "builtin", value: "source.bilibili.search.input@1"}},
            outputSchema: {id: "source.bilibili.search.output@1", version: 1, hash: {algorithm: "builtin", value: "source.bilibili.search.output@1"}},
            configurationSchema: {
                id: "source.bilibili.search.config@1",
                version: 1,
                hash: {algorithm: "builtin", value: "source.bilibili.search.config@1"},
                schema: {
                    type: "object",
                    properties: {
                        query: {type: "string"},
                        limit: {type: "integer", minimum: 1, maximum: 100},
                    },
                    required: ["query"],
                    additionalProperties: false,
                },
            },
            externalKey: "url",
            discoveryContext: "search",
            media: "metadata_only",
            stateStoreNamespace: null,
        },
    ],
};

const labProbeResult: SourceConfigProbeResult = {
    sourceDefinitionRef: "source.rss@1",
    operationId: "fetch",
    connectorId: "rss",
    itemCount: 3,
    nextCursorAvailable: false,
    sampleTitles: ["Cosmos scaffold is ready", "Second fixture item", "第三条样例标题"],
    checkedAt: fixtureTimestamp,
    durationMs: 140,
};

export function renderSourceFormLab(props: LabProps) {
    return <SourceFormLabFixture props={props} />;
}

function SourceFormLabFixture({props}: {props: LabProps}) {
    const name = textProp(props, "name", "Cosmos RSS");
    const feedUrl = textProp(props, "feedUrl", "https://example.com/feed.xml");
    const manifests = [labSourceDefinitionManifest, labBilibiliDefinitionManifest];
    const [definitionRef, setDefinitionRef] = useState(labSourceDefinitionManifest.ref);
    const [operationId, setOperationId] = useState(labSourceDefinitionManifest.operationIds[0] ?? "fetch");
    const definitionState = optionProp<SourceDefinitionState["status"]>(
        props,
        "definitionState",
        "ready",
        ["ready", "loading", "error"] as const,
    );
    const probeState = optionProp<ProbeState["status"]>(
        props,
        "probeState",
        "idle",
        ["idle", "running", "succeeded", "failed", "timeout"] as const,
    );
    const values = useMemo<SourceFormValues>(
        () => ({
            name,
            scheduleIntervalMinutes: "30",
            connectionId: "",
            config: {feedUrl},
        }),
        [feedUrl, name],
    );
    const form = useForm<SourceFormValues>({
        resolver: zodResolver(sourceFormSchema),
        defaultValues: values,
        values,
    });
    // 与产品 hook 同口径（EXT-006）：换定义/换操作都丢掉旧配置字段。
    const resetConfig = (): void => {
        form.setValue("config", {});
    };
    const selectDefinition = (ref: string): void => {
        setDefinitionRef(ref);
        setOperationId(manifests.find((item) => item.ref === ref)?.operationIds[0] ?? "fetch");
        resetConfig();
    };
    const selectOperation = (next: string): void => {
        setOperationId(next);
        resetConfig();
    };
    const resolvedDefinitionState: SourceDefinitionState = definitionState === "ready"
        ? {status: "ready", manifests}
        : definitionState === "error"
        ? {status: "error", message: "无法连接服务（HTTP 503）。"}
        : {status: "loading"};
    const resolvedProbeState: ProbeState = probeState === "succeeded"
        ? {status: "succeeded", result: labProbeResult}
        : probeState === "failed"
        ? {status: "failed", message: "Feed 返回 404。"}
        : {status: probeState};
    return (
        <SourceForm
            form={form}
            definitionState={resolvedDefinitionState}
            selectedDefinitionRef={definitionRef}
            onSelectDefinition={selectDefinition}
            selectedOperationId={operationId}
            onSelectOperation={selectOperation}
            onSubmit={(event) => event.preventDefault()}
            onTest={() => undefined}
            probeState={resolvedProbeState}
            onRetryDefinition={() => undefined}
            connections={labConnections}
        />
    );
}

export function renderStatusSummaryLab(props: LabProps) {
    const healthState = optionProp(props, "health", "unknown", ["unknown", "ready", "failed"] as const);
    const eventStreamState = optionProp(
        props,
        "eventStreamState",
        "connecting",
        ["connecting", "connected", "unavailable"] as const,
    );
    const health: HealthResponse | null = healthState === "unknown"
        ? null
        : {
            status: "ok",
            service: "Cosmos fixture",
            version: "0.1.0",
            protocolVersion: "v1",
            workerStatus: healthState === "ready" ? "ready" : "stopped",
            storageStatus: healthState === "ready" ? "ready" : "failed",
            migrationStatus: healthState === "ready" ? "ready" : "failed",
            timestamp: fixtureTimestamp,
        };
    return (
        <StatusSummary
            eventStreamState={eventStreamState as EventStreamState}
            health={health}
            planSummary={textProp(props, "planSummary", "尚未配置采集计划")}
        />
    );
}

export function renderCollectionPlanListLab(props: LabProps) {
    const state = optionProp(props, "state", "configured", ["configured", "untimed", "empty", "disabled", "media-policy", "webhook"] as const);
    const grouped = booleanProp(props, "grouped", false);
    const plans: readonly CollectionPlanSnapshot[] = state === "empty"
        ? []
        : [{
            id: "plan:source-fixture",
            name: textProp(props, "sourceName", "Cosmos fixture"),
            sourceId: "source-fixture",
            sourceRevisionId: "source-fixture:1",
            connectionId: grouped ? "connection-fixture" : null,
            mediaPolicy: state === "media-policy"
                ? { images: "metadata_only", maxFileBytes: 2 * 1024 * 1024 }
                : null,
            overlapPolicy: "forbid",
            enabled: state !== "disabled" && booleanProp(props, "enabled", true),
            revisionId: "plan:source-fixture:1",
            scheduleIntervalMs: state === "untimed" ? null : 1_800_000,
            webhook: state === "webhook"
                ? { entryPath: "/hooks/collection-plans/fixture-entry", credentialConfigured: true }
                : null,
            lastRunAt: null,
            lastError: state === "disabled" ? "Fixture plan disabled" : null,
            createdAt: fixtureTimestamp,
            updatedAt: fixtureTimestamp,
        }];
    return (
        <CollectionPlanList
            onRun={async () => undefined}
            onToggleActivation={async () => undefined}
            onSaveMediaPolicy={async () => undefined}
            onRotateWebhookEntry={async () => ({
                planId: "plan:source-fixture",
                entryPath: "/hooks/collection-plans/fixture-entry",
                credential: "fixture-credential-shown-once",
            })}
            onRevokeWebhookEntry={async () => undefined}
            plans={plans}
            connections={grouped ? labConnections : []}
        />
    );
}

export function renderRunControlLab(props: LabProps) {
    const status = optionProp(props, "status", "failed", ["queued", "running", "succeeded", "failed", "cancelled"] as const);
    const run: RunSnapshot = {
        id: "run-fixture",
        sourceId: "source-fixture",
        triggerKind: "manual",
        status,
        createdAt: fixtureTimestamp,
        startedAt: status === "queued" ? null : fixtureTimestamp,
        finishedAt: status === "succeeded" || status === "failed" || status === "cancelled" ? fixtureTimestamp : null,
        itemCount: 0,
        createdEntryCount: 0,
        revisedEntryCount: 0,
        error: status === "failed" ? "Fixture failure" : null,
    };
    const result: RunControlResult | null = status === "cancelled"
        ? { action: "cancelled", run, reuse: "已入库内容保留不回滚。", sideEffects: "取消是终态，不再产生新副作用。" }
        : null;
    return (
        <RunControl
            run={run}
            result={result}
            onCancel={async () => undefined}
            onRecover={async () => undefined}
            onRerun={async () => undefined}
        />
    );
}

const runHistoryLabRuns: readonly RunSnapshot[] = [
    {
        id: "run-failed",
        sourceId: "source-a",
        triggerKind: "manual",
        status: "failed",
        createdAt: "2026-09-10T08:00:00.000Z",
        startedAt: "2026-09-10T08:00:01.000Z",
        finishedAt: "2026-09-10T08:00:02.000Z",
        itemCount: 0,
        createdEntryCount: 0,
        revisedEntryCount: 0,
        error: "Fixture failure",
    },
    {
        id: "run-running",
        sourceId: "source-b",
        triggerKind: "schedule",
        status: "running",
        createdAt: "2026-09-10T09:00:00.000Z",
        startedAt: "2026-09-10T09:00:01.000Z",
        finishedAt: null,
        itemCount: 3,
        createdEntryCount: 3,
        revisedEntryCount: 0,
        error: null,
    },
];

const runHistoryLabClient = {
    listRuns: async () => runHistoryLabRuns,
    cancelRun: async () => ({ action: "cancelled", run: runHistoryLabRuns[1], reuse: "已入库内容保留。", sideEffects: "取消是终态。" }),
    recoverRun: async () => ({ action: "recovered", run: runHistoryLabRuns[1], reuse: "复用已持久化进度。", sideEffects: "从安全步骤续跑。" }),
    rerunRun: async () => ({ action: "rerun", run: runHistoryLabRuns[0], reuse: "复用已入库内容。", sideEffects: "从当前 checkpoint 重新抓取。" }),
} as unknown as HttpCosmosClient;

export function renderRunHistoryLab(props: LabProps) {
    const state = optionProp(props, "state", "populated", ["populated", "empty"] as const);
    const client = state === "empty"
        ? ({ listRuns: async () => [] } as unknown as HttpCosmosClient)
        : runHistoryLabClient;
    return <RunHistory client={client} />;
}

const connectionLabConnections: readonly ConnectionInstance[] = [
    {
        id: "connection-bilibili",
        name: "我的 Bilibili 主账号",
        connectorId: "bilibili",
        account: "example",
        scopeJson: '{"read":true,"comment":false}',
        configJson: '{"profile":"chrome-main"}',
        status: "active",
        secretRef: "secret:connection-bilibili",
        lastError: null,
        lastCheckedAt: "2026-09-10T08:05:00.000Z",
        modelId: null,
        version: 1,
        createdAt: "2026-09-10T08:00:00.000Z",
        updatedAt: "2026-09-10T08:00:00.000Z",
    },
    {
        id: "connection-lab-expired",
        name: "示例站登录态",
        connectorId: "generic",
        account: null,
        scopeJson: null,
        configJson: null,
        status: "error",
        secretRef: null,
        lastError: "登录态已过期",
        lastCheckedAt: null,
        modelId: null,
        version: 2,
        createdAt: "2026-09-10T08:00:00.000Z",
        updatedAt: "2026-09-10T08:00:00.000Z",
    },
];

const connectionLabClient = {
    listConnections: async () => connectionLabConnections,
    createConnection: async () => connectionLabConnections[0],
    deleteConnection: async () => ({ ok: true, id: "connection-bilibili", action: "connection.deleted" }),
    updateConnection: async (
        connectionId: string,
        input: { status?: ConnectionInstance["status"]; lastError?: string | null },
    ) => ({
        ...(connectionLabConnections.find((item) => item.id === connectionId)
            ?? connectionLabConnections[0]),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.lastError === undefined ? {} : { lastError: input.lastError }),
    }),
    // 登录探测按声明出现（Proposal connection-login-lifecycle-v1 决定 2）：夹具只声明
    // bilibili 支持探测，探测本身返回一条「已登录」的固定结论。
    listSourceDefinitions: async () => [
        {
            id: "bilibili",
            version: 1,
            ref: "source.bilibili@1",
            provider: "cosmos",
            connectorId: "bilibili",
            displayName: "Bilibili",
            description: null,
            manifestHash: { algorithm: "builtin", value: "builtin:source.bilibili@1" },
            status: "enabled",
            operationIds: ["fetch"],
            capabilities: ["source:read"],
            configurationSchema: { id: "c", version: 1, hash: { algorithm: "builtin", value: "c" } },
            auth: { kind: "external", label: "OpenCLI 浏览器登录态", secretRefRequired: false, probeSupported: true },
            operations: [],
        },
    ],
    createConnectionProbe: async () => connectionProbeJob("succeeded"),
    getConnectionProbe: async () => connectionProbeJob("succeeded"),
    // 模型选择器要读「已配置的模型」：夹具给一个空列表，实验室里模型连接显示「还没选模型」。
    listModelProviders: async () => ({ items: [], nextCursor: null }),
    listConfiguredModels: async () => ({ items: [], nextCursor: null }),
} as unknown as HttpCosmosClient;

/** 连接探测 Job 的夹具：终态 + 一条「已登录」结论。 */
function connectionProbeJob(status: "queued" | "succeeded") {
    return {
        id: "job-connection-probe",
        kind: "connection-probe" as const,
        sourceId: null,
        runId: null,
        status,
        attempts: 1,
        maxAttempts: 3,
        errorCode: null,
        error: null,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
        result: status === "succeeded"
            ? {
                connectionId: "connection-bilibili",
                outcome: "active" as const,
                account: "example",
                reason: null,
                checkedAt: fixtureTimestamp,
            }
            : null,
    };
}

export function renderConnectionPanelLab(props: LabProps) {
    const state = optionProp(props, "state", "populated", ["populated", "empty"] as const);
    const client = state === "empty"
        ? ({
            listConnections: async () => [],
            listSourceDefinitions: async () => [],
        } as unknown as HttpCosmosClient)
        : connectionLabClient;
    return <ConnectionPanel client={client} />;
}

const storagePanelLabClient = {
    storageStats: async () => ({
        databaseBytes: 12_345_678,
        blobBytes: 4_194_304,
        blobFileCount: 12,
        artifactBytes: 0,
        cacheBytes: 1024,
        logBytes: 2048,
        secretBytes: 0,
        categories: { raw: 16_539_982, user: 12_345_678, rebuildable: 3072, cleanable: 4_194_304 },
        snapshotAt: "2026-09-10T08:00:00.000Z",
    }),
    listBackups: async () => [{
        id: "backup-2026-09-10.sqlite",
        name: "backup-2026-09-10.sqlite",
        byteSize: 12_345_678,
        createdAt: "2026-09-10T08:00:00.000Z",
    }],
    createBackup: async () => ({
        id: "backup-new.sqlite",
        name: "backup-new.sqlite",
        byteSize: 12_345_678,
        createdAt: "2026-09-10T08:00:00.000Z",
    }),
    restoreBackup: async () => ({ ok: true, id: "backup-new.sqlite", action: "backup.restored" }),
    exportUserData: async () => ({
        schemaVersion: 1,
        exportedAt: "2026-09-10T08:00:00.000Z",
        counts: {
            labels: 1,
            collections: 0,
            favorites: 0,
            annotations: 0,
            savedViews: 0,
            boards: 0,
            spotlightPlacements: 0,
            targets: 1,
        },
        data: {
            labels: [{
                id: "label-lab",
                name: "关注",
                createdAt: "2026-09-10T08:00:00.000Z",
                updatedAt: "2026-09-10T08:00:00.000Z",
                assignedStories: [{ id: "story-lab", title: "示例 Story" }],
                assignedEntries: [],
                assignedTopics: [],
            }],
            collections: [],
            favorites: [],
            annotations: [],
            savedViews: [],
            boards: [],
            spotlightPlacements: [],
            targets: [{ targetType: "story", targetId: "story-lab", title: "示例 Story", webUrl: null }],
        },
    }),
    listConnectorStateNamespaces: async () => [
        {
            namespace: "plan:source-lab",
            keyCount: 1,
            planId: "plan:source-lab",
            sourceId: "source-lab",
            connectionId: null,
            unattributed: false,
        },
        {
            namespace: "other-namespace",
            keyCount: 1,
            planId: null,
            sourceId: null,
            connectionId: null,
            unattributed: true,
        },
    ],
    exportConnectorState: async () => ({
        schemaVersion: 1,
        exportedAt: "2026-09-10T08:00:00.000Z",
        scope: { kind: "attributed", value: null },
        counts: { namespaces: 1, keys: 1 },
        namespaces: [{
            namespace: "plan:source-lab",
            owner: { planId: "plan:source-lab", sourceId: "source-lab", connectionId: null },
            entries: [{
                key: "http-cache",
                value: { etag: 'W/"lab"' },
                version: 1,
                updatedAt: "2026-09-10T08:00:00.000Z",
            }],
        }],
    }),
    importConnectorState: async () => ({
        mode: "skip-existing",
        namespaces: 1,
        created: 1,
        overwritten: 0,
        skipped: 0,
    }),
} as unknown as HttpCosmosClient;

export function renderStoragePanelLab() {
    return <StoragePanel client={storagePanelLabClient} />;
}

export function renderFeedBrowserLab(props: LabProps) {
    return <FeedBrowserLabFixture props={props} />;
}

function FeedBrowserLabFixture({props}: {props: LabProps}) {
    const form = useForm<SearchFormValues>({
        resolver: zodResolver(searchSchema),
        defaultValues: {
            text: "",
            sourceId: "",
            publishedAfter: "",
            publishedBefore: "",
            labelIds: [],
            topicIds: [],
        },
    });
    const state = optionProp(props, "state", "populated", ["loading", "empty", "populated"] as const);
    const feed: readonly FeedItem[] = state === "populated"
        ? [{
            storyId: "story-fixture",
            storyKind: "document",
            title: textProp(props, "title", "Cosmos fixture story"),
            summary: "A synthetic Feed item for the component laboratory.",
            entryId: "entry-fixture",
            sourceId: "source-fixture",
            sourceName: "Cosmos fixture",
            sourceKind: "fixture-rss",
            revisionId: "revision-fixture",
            publishedAt: fixtureTimestamp,
            assets: [],
        }]
        : [];
    return (
        <FeedBrowser
            feed={feed}
            loading={state === "loading"}
            onLoadMore={async () => undefined}
            onOpenStory={async () => undefined}
            onSubmit={(event) => event.preventDefault()}
            searchForm={form}
            nextCursor={state === "populated" ? "fixture-next" : null}
            labels={[{id: "label-fixture", name: "开发"}]}
            topics={[{
                id: "topic-fixture",
                revisionId: "revision-topic-fixture",
                title: "Cosmos fixture topic",
                purpose: "一个用于组件检查的合成 Topic。",
                scope: null,
                memberCount: 1,
                updatedAt: fixtureTimestamp,
            }]}
            sources={[{
                id: "source-fixture",
                name: "Cosmos fixture",
                sourceDefinitionRef: "source.fixture-rss@1",
                operationId: "fetch",
                connectorId: "fixture-rss",
                kind: "fixture-rss",
                config: {fixturePath: "fixtures/rss/basic.xml"},
                enabled: true,
                mediaPolicy: null,
                revisionId: "source-fixture:1",
                createdAt: fixtureTimestamp,
                updatedAt: fixtureTimestamp,
                lastRunAt: null,
                lastError: null,
                planId: "plan:source-fixture",
                planRevisionId: "plan:source-fixture:1",
                connectionId: null,
                scheduleIntervalMs: null,
            }]}
        />
    );
}

type StoryLabState =
    | "revision"
    | "empty"
    | "split"
    | "splittable"
    | "split-origin"
    | "legacy-subtype"
    | "representation"
    | "entry-relations"
    | "human-protected";

/** 阅读页两栏共用的 Story 夹具；两个渲染函数各自只取自己那一半所需的 props。 */
export function storyLabFixture(
    state: StoryLabState,
    title: string,
    contentText: string,
): StoryDetail {
    const memberEntry: EntryDetail = {
        id: "entry-fixture",
        sourceId: "source-fixture",
        sourceName: "Cosmos fixture",
        sourceKind: "fixture-rss",
        currentRevisionId: "revision-fixture",
        metrics: null,
        revisions: state === "empty" ? [] : [{
            id: "revision-fixture",
            revision: 1,
            title,
            summary: "A synthetic Story summary.",
            contentText,
            webUrl: null,
            contentKind: "article",
            publisher: null,
            publishedAt: null,
            updatedAt: null,
            sourcePublishedAt: null,
            createdAt: fixtureTimestamp,
            assets: [],
        }],
        observations: [{
            id: "observation-fixture",
            externalId: null,
            externalKey: "fixture:story",
            eventKind: "snapshot",
            webUrl: null,
            capturedAt: fixtureTimestamp,
            sourcePublishedAt: null,
        }],
        relatedStories: [{
            storyId: "story-evidenced-fixture",
            relationType: "evidence_for",
            title: "A fixture event Story this entry is evidence for",
            reason: "同一事件",
        }],
        relations: [],
    };
    const secondEntry: EntryDetail = {
        ...memberEntry,
        id: "entry-fixture-2",
        sourceId: "source-fixture-2",
        sourceName: "Cosmos fixture source 2",
        currentRevisionId: "revision-fixture-2",
        revisions: memberEntry.revisions.map((revision) => ({
            ...revision,
            id: "revision-fixture-2",
            title: "A second fixture member",
        })),
        observations: [],
        relatedStories: [],
        // 场景固定成「第二条转载第一条」：成员行两侧的措辞（转载自 / 被…转载）
        // 与解除入口都能在实验室里看到（ADR-0022 决定 3/7）。
        relations: state === "entry-relations"
            ? [{
                entryId: "entry-fixture",
                relationType: "syndicated_from",
                direction: "outgoing" as const,
                title,
                sourceId: "source-fixture",
                sourceName: "Cosmos fixture",
                producer: "human",
                producerVersion: null,
                confidence: 1,
                evidence: null,
                actor: "user",
                reason: "门户转载官网",
            }]
            : [],
    };
    const story: StoryDetail = {
        story: {
            id: "story-fixture",
            kind: state === "legacy-subtype" ? "media" : "document",
            subtype: state === "legacy-subtype" ? "media.legacy" : null,
            revisionId: "revision-fixture",
            title,
            summary: "A synthetic Story summary.",
            // 时间范围与关键事实是 Story 当前表示的后两项（ADR-0021 决定 1）；
            // 场景固定两端：一个准确时刻 + 一个只有原文的结束端，一条挂出处、
            // 一条无出处、一条指回已不存在的条目，让详情与表单两条路径都能被看到。
            timeRange: state === "representation"
                ? {
                    start: {
                        exact: "2026-01-02T09:30:00.000Z",
                        exactPrecision: "second",
                        fallback: null,
                    },
                    end: {
                        exact: null,
                        exactPrecision: null,
                        fallback: {
                            raw: "昨天下午",
                            lowerBound: "2026-01-02T00:00:00.000Z",
                            precision: "day",
                            timezone: null,
                            confidence: "uncertain",
                        },
                    },
                }
                : null,
            keyFacts: state === "representation"
                ? [
                    { text: "上下文窗口 1M", entryId: "entry-fixture" },
                    { text: "第三方测评认为长文本仍会衰减", entryId: null },
                    { text: "出处指向一条已经删除的信息条目", entryId: "entry-deleted-fixture" },
                ]
                : [],
            // 「人工已修改」是自动写入方停止更新的判据（ADR-0028），只有这条
            // 场景把它打开，其余场景保持 ingest 投影写出的默认值。
            producer: state === "human-protected" ? "human" : "system",
            status: state === "split" ? "split" : "active",
            replacedBy: state === "split"
                ? [
                    { storyId: "story-successor-a", title: "Fixture successor A", kind: "event" },
                    { storyId: "story-successor-b", title: "Fixture successor B", kind: "document" },
                ]
                : [],
            // 后继指向原条的反向边：拆分来源回链靠它渲染（维护者 2026-10-05）。
            splitFrom: state === "split-origin"
                ? { storyId: "story-shell", title: "Fixture 原条", kind: "event" }
                : null,
        },
        entry: state === "split" ? null : memberEntry,
        entries: state === "split"
            ? []
            : state === "splittable" || state === "entry-relations"
                ? [memberEntry, secondEntry]
                : [memberEntry],
        entities: [],
        topics: [],
        labels: [],
        favorited: false,
        evidence: [{
            entryId: "entry-evidence-fixture",
            sourceId: "source-fixture",
            sourceName: "Cosmos fixture source",
            relationType: "evidence_for",
            title: "A fixture entry that supports this Story",
            producer: "human",
            producerVersion: null,
            confidence: 1,
            evidence: "官方公告",
            actor: null,
            reason: "同一事件",
        }],
    };
    return story;
}

/** 阅读页左栏：只读内容区块（成员、证据、时间线、相关内容、媒体）。 */
export function renderStoryReadingContentLab(props: LabProps) {
    const state = optionProp(
        props,
        "state",
        "representation",
        ["revision", "empty", "split", "split-origin", "representation", "entry-relations", "human-protected"] as const,
    );
    const title = textProp(props, "title", "Cosmos fixture story");
    const contentText = textProp(props, "contentText", "A synthetic Story body for component inspection.");
    return (
        <StoryReadingContent
            busy={false}
            entryCandidates={[
                { id: "entry-fixture", title, sourceName: "Cosmos fixture", isMember: true },
                { id: "entry-fixture-2", title: "A second fixture member", sourceName: "Cosmos fixture source 2", isMember: true },
                { id: "entry-relation-candidate", title: "A third fixture entry", sourceName: "Cosmos fixture source 3", isMember: false },
            ]}
            onLinkEntryRelation={async () => undefined}
            onUnlinkEntryRelation={async () => undefined}
            relatedStories={[{
                storyId: "story-related-fixture",
                title: "A related but different fixture Story",
                reason: "共享分类：开发",
            }]}
            story={storyLabFixture(state, title, contentText)}
        />
    );
}

/** 阅读页右栏：会改写 Story 的动作与编排。 */
export function renderStoryEditPanelLab(props: LabProps) {
    const state = optionProp(
        props,
        "state",
        "splittable",
        ["revision", "split", "splittable", "split-origin", "legacy-subtype", "representation"] as const,
    );
    const title = textProp(props, "title", "Cosmos fixture story");
    const contentText = textProp(props, "contentText", "A synthetic Story body for component inspection.");
    return (
        <StoryEditPanel
            story={storyLabFixture(state, title, contentText)}
            onUpdateStoryRevision={async () => undefined}
            onMergeStory={async () => undefined}
            onSplitStory={async () => undefined}
            onSearchMergeTargets={async () => [
                { storyId: "story-merge-candidate", title: "A fixture Story to merge into" },
                { storyId: "story-fixture", title },
            ]}
            entryCandidates={[
                { id: "entry-fixture", title, sourceName: "Cosmos fixture", isMember: true },
                { id: "entry-fixture-2", title: "A second fixture member", sourceName: "Cosmos fixture source 2", isMember: true },
                { id: "entry-relation-candidate", title: "A third fixture entry", sourceName: "Cosmos fixture source 3", isMember: false },
            ]}
            onLoadStoryUserState={async () => ({
                favorite: true,
                labels: [{ id: "label-fixture", name: "开发" }],
                collections: [{ id: "collection-fixture", name: "Fixture collection" }],
                annotations: [{ id: "annotation-fixture", name: "A fixture note" }],
                placements: [{ id: "placement-fixture", name: "board-fixture" }],
            })}
            onMigrateStoryUserState={async () => undefined}
            onToggleFavorite={async () => undefined}
            subtypeOptions={labStorySubtypeOptions}
        />
    );
}

export function renderThemeSwitcherLab(props: LabProps) {
    const value = optionProp(
        props,
        "value",
        "system",
        ["system", "macos-light", "macos-night"] as const,
    );
    return (
        <ThemeSwitcher
            onValueChange={() => undefined}
            value={value as CosmosThemePreference}
        />
    );
}

export function renderTopicPanelLab(props: LabProps) {
    const title = textProp(props, "title", "Cosmos fixture topic");
    const purpose = textProp(props, "purpose", "一个用于组件检查的合成 Topic。");
    const state = optionProp(props, "state", "members", ["members", "empty", "removed"] as const);
    const topic: TopicDetail = {
        topic: {
            id: "topic-fixture",
            revisionId: "rev-t-fixture",
            title,
            purpose,
            scope: null,
        },
        members: state === "empty"
            ? []
            : [{
                storyId: "story-fixture-a",
                role: "core",
                reason: "seed",
                actor: "user",
                revision: 1,
                removed: false,
            }, {
                storyId: "story-fixture-b",
                role: "background",
                reason: "背景",
                actor: "user",
                revision: 1,
                removed: state === "removed",
            }],
    };
    return (
        <TopicPanel
            onClose={() => undefined}
            topic={topic}
            onUpdateTopic={async () => undefined}
            onUpdateMemberRole={async () => undefined}
            onRemoveMember={async () => undefined}
            onRestoreMember={async () => undefined}
        />
    );
}

export function renderEntityPanelLab(props: LabProps) {
    const name = textProp(props, "name", "Jeff Dean");
    const type = optionProp(props, "type", "person", ["person", "organization", "model"] as const);
    const state = optionProp(props, "state", "linked", ["linked", "empty"] as const);
    const targetOptions: readonly EntitySummary[] = [{
        id: "entity-fixture-loop",
        revisionId: "rev-e-fixture-loop",
        type: "organization",
        name: "Discovery Loop",
        storyCount: 0,
        relationCount: 0,
        updatedAt: fixtureTimestamp,
    }];
    const entity: EntityDetail = {
        entity: {
            id: "entity-fixture",
            revisionId: "rev-e-fixture",
            type,
            name,
        },
        aliases: ["Jeffrey Dean"],
        stories: state === "empty"
            ? []
            : [{
                storyId: "story-fixture-a",
                producer: "human",
                producerVersion: null,
                confidence: 1,
                evidence: null,
                actor: "user",
                reason: null,
            }],
        relations: state === "empty"
            ? []
            : [{
                fromEntityId: "entity-fixture",
                toEntityId: "entity-fixture-loop",
                relationType: "founded",
                producer: "human",
                producerVersion: null,
                confidence: 0.9,
                evidence: null,
                actor: "user",
                reason: "已知履历",
            }],
    };
    return (
        <EntityPanel
            onClose={() => undefined}
            entity={entity}
            entityOptions={targetOptions}
            onUpdateEntity={async () => undefined}
            onAddAlias={async () => undefined}
            onRemoveAlias={async () => undefined}
            onUnlinkStory={async () => undefined}
            onCreateRelation={async () => undefined}
            onRemoveRelation={async () => undefined}
        />
    );
}

/**
 * 实验室的只读客户端：阅读流区块是自取数区块，这里给 feed 一个固定响应，让它在
 * 实验室里渲染出内容而不是失败占位；其余方法不覆盖，本 fixture 不触发它们。
 */
const labBoardClient = Object.assign(new HttpCosmosClient({ baseUrl: "" }), {
    feed: async () => ({
        items: [{
            storyId: "story-fixture-feed",
            storyKind: "event" as const,
            title: "合成阅读流条目",
            summary: null,
            entryId: "entry-fixture-feed",
            sourceId: "source-fixture",
            sourceName: "Cosmos fixture source",
            sourceKind: "rss" as const,
            revisionId: "revision-fixture-feed",
            publishedAt: null,
            assets: [],
        }],
        nextCursor: null,
    }),
});

function buildBoardFixture(state: "default" | "unknown-block"): BoardDetail {
    const timestamp = fixtureTimestamp;
    const hotBlock: BoardBlock = {
        id: "block-fixture-hot",
        sectionId: "section-fixture-hot",
        // source-health 渲染页面传入的插槽，实验室零请求；spotlight/collection
        // 是自取数区块，不在 fixture 中出现（真实流程由浏览器 E2E 覆盖）。
        type: "source-health",
        config: {},
        position: 0,
        visible: true,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    const feedBlock: BoardBlock = {
        id: "block-fixture-feed",
        sectionId: "section-fixture-feed",
        type: "feed",
        config: {},
        position: 0,
        visible: true,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    const topicBlock: BoardBlock = {
        id: "block-fixture-topics",
        sectionId: "section-fixture-feed",
        type: "topic-list",
        config: { limit: 5 },
        position: 1,
        visible: true,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    const unknownBlock: BoardBlock = {
        id: "block-fixture-unknown",
        sectionId: "section-fixture-feed",
        type: "gadget",
        config: {},
        position: 2,
        visible: true,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    return {
        id: "board-fixture",
        name: "默认看板",
        description: null,
        sections: [
            {
                id: "section-fixture-hot",
                boardId: "board-fixture",
                title: "热点",
                position: 0,
                blocks: [hotBlock],
                createdAt: timestamp,
                updatedAt: timestamp,
            },
            {
                id: "section-fixture-feed",
                boardId: "board-fixture",
                title: "信息流",
                position: 1,
                blocks: state === "unknown-block"
                    ? [feedBlock, topicBlock, unknownBlock]
                    : [feedBlock, topicBlock],
                createdAt: timestamp,
                updatedAt: timestamp,
            },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

/** 拖拽排序的实验室场景：真实 DndContext，命令回调只记录不写服务端。 */
export function renderBoardBlockListLab(props: LabProps) {
    const state = optionProp(props, "state", "default", ["default", "unknown-block"] as const);
    const board = buildBoardFixture(state);
    const section = board.sections[1];
    return (
        <BoardDndProvider board={board} onMoveBlock={async () => undefined}>
            <BoardBlockList
                sectionId={section.id}
                blocks={section.blocks}
                renderBlock={(block) => (
                    <div className="rounded-sm border bg-card px-3 py-2 text-sm">
                        {block.type}（合成区块内容）
                    </div>
                )}
            />
        </BoardDndProvider>
    );
}

export function renderBoardViewLab(props: LabProps) {
    const state = optionProp(props, "state", "default", ["default", "unknown-block"] as const);
    const board = buildBoardFixture(state);
    return (
        <BoardView
            board={board}
            client={labBoardClient}
            planListSlot={(
                <div className="rounded-[var(--radius-panel)] border border-dashed px-6 py-10 text-sm text-muted-foreground">
                    合成采集计划区块。
                </div>
            )}
            topics={[{
                id: "topic-fixture",
                revisionId: "rev-t-fixture",
                title: "Qwen 3.8 发布跟踪",
                purpose: "合成 Topic",
                scope: null,
                memberCount: 3,
                updatedAt: fixtureTimestamp,
            }]}
            openingTopicId={null}
            onOpenTopic={() => undefined}
            onOpenStory={() => undefined}
        />
    );
}
