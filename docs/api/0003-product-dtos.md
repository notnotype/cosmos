# Product DTO 草案

> 状态：Draft v0.2
>
> 端点：[`0002-product-service-api.md`](0002-product-service-api.md)
>
> 公共类型：[`0001-common-contracts.md`](0001-common-contracts.md)

## 1. 规则

- 下列是 API 最小语义 shape，不是 Prisma schema。
- `unknown` 只允许出现在同一对象内能定位到 owner/schema/version 的字段；它表示
  边界处仍需按关联 definition/schema 校验，不表示运行时可以跳过验证。
- `config`、`input` 和 `output` 必须绑定 schema/version；不能成为无 owner 的任意
  JSON。
- 不使用 `ValueEnvelope | unknown`。在 TypeScript 中该联合会退化为 `unknown`，
  失去 ValueRef/大小/hash 合同；普通 JSON 也必须放入 inline `ValueEnvelope`。
- Snapshot 可以增加纯展示字段，但稳定身份、revision、provenance、状态和错误不能
  只靠前端拼接。
- 所有分页列表使用 `Page<T>`。
- Detail 内的集合字段只能是明确有界的 preview；完整历史和成员使用分页子资源。
- 所有 Secret 值、lease token、Worker session token 和绝对路径都不属于 Product
  DTO。

`JsonSchemaRef`、`WorkflowBudget`、`WorkflowUsage`、`WorkflowRunStatus`、
`ActionReceiptSnapshot` 等同时被 Product Query 与 Gateway 使用的类型，落代码时
属于 `contracts/runtime` 或 `contracts/common` 的单一 canonical schema；它们只为
阅读连续性列在本文件，不允许复制成 Product/Gateway 两份实现。

## 2. System

```ts
type LivenessSnapshot = {
    status: "alive";
    service: "cosmos-api" | "cosmos-worker";
    instanceId: string;
    version: string;
    timestamp: string;
};

type ReadinessSnapshot = {
    ready: boolean;
    service: string;
    instanceId: string;
    protocolVersion: string;
    acceptingRequests: boolean;
    components: Record<string, ComponentHealth>;
    timestamp: string;
};

type ServiceHealthSnapshot = {
    status: "ok" | "degraded";
    service: "cosmos-api";
    version: string;
    productProtocolVersion: string;
    workerProtocolVersions: string[];
    storage: ComponentHealth;
    migration: ComponentHealth;
    workers: ComponentHealth & {
        active: number;
        capable: number | null;
    };
    eventStream: ComponentHealth;
    timestamp: string;
};

type ServiceCapabilitySnapshot = {
    productProtocolVersion: string;
    workerProtocolVersions: string[];
    features: Record<string, {
        status: "enabled" | "disabled" | "unavailable" | "planned";
        version?: string | null;
    }>;
    limits: {
        maxPageSize: number;
        maxInlineValueBytes: number;
        maxUploadBytes: number | null;
        sseReplayLimit: number;
    };
    serverTime: string;
};

type MutationAuditSnapshot = {
    actor: ActorRef;
    baseRevisionId: string | null;
    resultRevisionId: string;
    reason: string;
    evidence: EvidenceRef[];
    runId: string | null;
    occurredAt: string;
};
```

## 3. Catalog

```ts
type JsonSchemaRef = {
    id: string;
    version: number;
    hash: HashRef;
    schema?: Record<string, unknown>;
};

type PluginManifestSummary = {
    id: string;
    version: string;
    displayName: string;
    description: string | null;
    sdkRange: string;
    manifestHash: HashRef;
    status: "available" | "enabled" | "disabled" | "incompatible";
    capabilities: string[];
};

type PluginManifestDetail = PluginManifestSummary & {
    sourceDefinitionRefs: string[];
    workflowRefs: string[];
    actionRefs: string[];
    triggerDefinitionRefs: string[];
    boardBlockDefinitionRefs: string[];
    configurationSchema: JsonSchemaRef | null;
    provenance: {
        origin: string;
        installedAt: string | null;
        verifiedAt: string | null;
    };
};

type SourceOperationDefinition = {
    id: string;
    sourceDefinitionId: string;
    version: number;
    displayName: string;
    description: string | null;
    mode: "snapshot" | "cursor" | "stream" | "probe";
    inputSchema: JsonSchemaRef;
    stateSchema: JsonSchemaRef | null;
    outputSchema: JsonSchemaRef;
    authMethods: string[];
    capabilities: string[];
    externalKeyContractVersion: string;
    discoveryContextVersion: string;
    defaultWorkflowRef: string | null;
};

type SourceDefinitionSummary = {
    id: string;
    version: number;
    ref: string;
    provider: string;
    displayName: string;
    description: string | null;
    manifestHash: HashRef;
    status: "enabled" | "disabled" | "unavailable" | "incompatible";
    operationIds: string[];
    capabilities: string[];
};

type SourceDefinitionDetail = SourceDefinitionSummary & {
    configurationSchema: JsonSchemaRef;
    connectionSchema: JsonSchemaRef | null;
    operations: SourceOperationDefinition[];
    pluginRef: string | null;
};

type RetryPolicy = {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoff: "fixed" | "exponential";
    jitter: boolean;
};

type ActionDefinitionSummary = {
    id: string;
    version: number;
    ref: string;
    provider: string;
    manifestHash: HashRef;
    effectMode: "none" | "external";
    executionPlacement: "host" | "trusted_worker" | "remote_worker";
    requiredCapabilities: string[];
    concurrencyClass: string | null;
    rateLimitClass: string | null;
    status: "enabled" | "disabled" | "unavailable" | "incompatible";
};

type ActionDefinitionDetail = ActionDefinitionSummary & {
    inputSchema: JsonSchemaRef;
    outputSchema: JsonSchemaRef;
    retryPolicy: RetryPolicy;
    timeoutMs: number | null;
    cancellation: "cooperative" | "not_supported";
    valuePolicy: {
        input: "inline_or_ref" | "ref_only";
        output: "inline_or_ref" | "ref_only";
    };
    metadata: Record<string, unknown>;
};

type BackendCapabilityRequirement = {
    processRestart: boolean;
    multiWorker: boolean;
    leases: boolean;
    signals: boolean;
    durableTimers: boolean;
    externalReceipts: boolean;
    outbox: boolean;
};

type WorkflowDefinitionSummary = {
    id: string;
    version: number;
    ref: string;
    kind:
        | "ingest"
        | "knowledge"
        | "research"
        | "maintenance"
        | "delivery"
        | "interaction"
        | "custom";
    tags: string[];
    provider: string;
    manifestHash: HashRef;
    status: "enabled" | "disabled" | "unavailable" | "incompatible";
    requiredActionRefs: string[];
};

type WorkflowDefinitionDetail = WorkflowDefinitionSummary & {
    inputSchema: JsonSchemaRef;
    outputSchema: JsonSchemaRef;
    requiredBackendCapabilities: BackendCapabilityRequirement;
    defaultLane: string;
    defaultPriority: number;
    defaultBudget: WorkflowBudget | null;
    metadata: Record<string, unknown>;
};

type TriggerDefinitionSummary = {
    id: string;
    version: number;
    ref: string;
    displayName: string;
    manifestHash: HashRef;
    configSchema: JsonSchemaRef;
    supportedKinds: TriggerConfig["kind"][];
    status: "enabled" | "disabled" | "unavailable" | "incompatible";
};

type StorySubtypeDefinition = {
    id: string;
    version: number;
    ref: string;
    coreKind: "event" | "document" | "media" | "thread";
    displayName: string;
    identityPolicyRef: string;
    metadataSchema: JsonSchemaRef | null;
    manifestHash: HashRef;
    status: "enabled" | "disabled" | "incompatible";
};

type WorkspaceViewDefinition = {
    id: string;
    version: number;
    ref: string;
    displayName: string;
    configurationSchema: JsonSchemaRef;
    interactionStateSchema: JsonSchemaRef | null;
    manifestHash: HashRef;
    status: "enabled" | "disabled" | "incompatible";
};

type BoardBlockDefinition = {
    id: string;
    version: number;
    ref: string;
    displayName: string;
    configurationSchema: JsonSchemaRef;
    supportedSourceTypes: string[];
    manifestHash: HashRef;
    status: "enabled" | "disabled" | "incompatible";
};
```

这些 Definition 都使用 `id/version/ref/manifestHash/schema/status` 基线，但每个
kind 仍有自己的受限字段，不合并成一个无约束 manifest DTO。

## 4. Connection、Source、计划与 Trigger

```ts
type ConnectionStatus =
    | "draft"
    | "authorizing"
    | "ready"
    | "expired"
    | "revoked"
    | "failed"
    | "disabled";

type ConnectionSummary = {
    id: string;
    provider: string;
    sourceDefinitionRef: string;
    displayName: string;
    status: ConnectionStatus;
    accountLabel: string | null;
    scopes: string[];
    secretRef: string | null;
    revisionId: string;
    lastCheckedAt: string | null;
    error: FailureSnapshot | null;
    createdAt: string;
    updatedAt: string;
};

type ConnectionDetail = ConnectionSummary & {
    safeMetadata: Record<string, unknown>;
    referencedBy: {
        sourceCount: number;
        collectionPlanCount: number;
    };
};

type ConnectionSnapshot = ConnectionDetail;

type CreateConnectionCommand = {
    sourceDefinitionRef: string;
    displayName: string;
    authMethod: string;
    safeConfiguration: unknown;
};

type AuthorizationSessionSnapshot = {
    id: string;
    connectionId: string;
    method: string;
    status:
        | "pending"
        | "waiting_user"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "expired";
    instructions: {
        verificationUri?: string;
        userCode?: string;
        message?: string;
    } | null;
    expiresAt: string | null;
    error: FailureSnapshot | null;
    createdAt: string;
    updatedAt: string;
};

type SourceStatus = "ready" | "disabled" | "unavailable" | "error";

type SourceSummary = {
    id: string;
    name: string;
    sourceDefinitionRef: string;
    operationId: string;
    connectionId: string | null;
    enabled: boolean;
    status: SourceStatus;
    revisionId: string;
    lastRunRef: ResourceRef | null;
    lastSuccessAt: string | null;
    lastError: FailureSnapshot | null;
    createdAt: string;
    updatedAt: string;
};

type SourceDetail = SourceSummary & {
    configSchemaRef: JsonSchemaRef;
    config: unknown;
    health: ComponentHealth;
    collectionPlanRefs: ResourceRef[];
    checkpoint: CheckpointSnapshot | null;
};

type SourceSnapshot = SourceDetail;

type CreateSourceCommand = {
    name: string;
    sourceDefinitionRef: string;
    operationId: string;
    connectionId?: string | null;
    config: unknown;
    enabled?: boolean;
};

type UpdateSourceCommand = {
    baseRevisionId: string;
    name?: string;
    connectionId?: string | null;
    config?: unknown;
    enabled?: boolean;
};

type OverlapPolicy = "forbid" | "queue" | "replace" | "allow" | "merge";

type CollectionPlanSummary = {
    id: string;
    name: string;
    sourceId: string;
    connectionId: string | null;
    sourceOperationRef: string;
    workflowRef: string;
    triggerBindingId: string;
    enabled: boolean;
    overlapPolicy: OverlapPolicy;
    revisionId: string;
    lastRunRef: ResourceRef | null;
    nextTriggerAt: string | null;
    status: "ready" | "paused" | "running" | "error";
    createdAt: string;
    updatedAt: string;
};

type CollectionPlanDetail = CollectionPlanSummary & {
    scopeSchemaRef: JsonSchemaRef;
    scope: unknown;
    budget: WorkflowBudget | null;
    checkpoint: CheckpointSnapshot | null;
    stateNamespace: string;
    discoveryContext: {
        schemaVersion: number;
        defaults: DiscoveryContext;
        mappingRef: string | null;
    };
    lastError: FailureSnapshot | null;
};

type CollectionPlanSnapshot = CollectionPlanDetail;

type TriggerConfig =
    | {
        kind: "manual";
    }
    | {
        kind: "schedule";
        expression: string;
        timezone: string;
        misfirePolicy: "skip" | "run_once" | "catch_up_bounded";
    }
    | {
        kind: "poll";
        intervalMs: number;
        jitterMs: number;
    }
    | {
        kind: "event";
        eventTypes: string[];
        filterSchemaRef: JsonSchemaRef;
        filter: unknown;
    }
    | {
        kind: "webhook";
        schemaRef: JsonSchemaRef;
    };

type TriggerBindingSnapshot = {
    id: string;
    definitionRef: string;
    workflowRef: string;
    enabled: boolean;
    config: TriggerConfig;
    inputMappingSchemaRef: JsonSchemaRef;
    inputMapping: unknown;
    revisionId: string;
    lastTriggeredAt: string | null;
    nextTriggerAt: string | null;
    createdAt: string;
    updatedAt: string;
};

type TriggerBindingSummary = Omit<
    TriggerBindingSnapshot,
    "config" | "inputMapping" | "inputMappingSchemaRef"
>;

type TriggerBindingDetail = TriggerBindingSnapshot;

type CheckpointSnapshot = {
    owner: ResourceRef;
    revision: number;
    value: ValueEnvelope | null;
    advancedByRunRef: ResourceRef | null;
    updatedAt: string;
};

type ProbeSnapshot = {
    id: string;
    target: ResourceRef;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    runRef: ResourceRef | null;
    connectorRef: string | null;
    itemCount: number | null;
    nextCursorAvailable: boolean | null;
    diagnostics: Record<string, unknown>;
    error: FailureSnapshot | null;
    createdAt: string;
    finishedAt: string | null;
};
```

## 5. Workflow Runtime

```ts
type WorkflowRunStatus =
    | "queued"
    | "running"
    | "waiting"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "expired";

type WorkflowBudget = {
    wallTimeMs?: number | null;
    actionCalls?: number | null;
    networkBytes?: number | null;
    storageBytes?: number | null;
    modelInputTokens?: number | null;
    modelOutputTokens?: number | null;
    modelCost?: {
        amount: string;
        currency: string;
    } | null;
    recursionDepth?: number | null;
};

type WorkflowUsage = {
    wallTimeMs: number;
    actionCalls: number;
    attempts: number;
    networkBytes: number | null;
    storageBytes: number | null;
    modelInputTokens: number | null;
    modelOutputTokens: number | null;
    modelCost: {
        amount: string;
        currency: string;
    } | null;
};

type WorkflowTriggerSnapshot = {
    kind: string;
    reason: string;
    bindingRef: ResourceRef | null;
    definitionRef: string | null;
    definitionVersion: number | null;
    occurredAt: string;
    input: ValueEnvelope | null;
    inputFingerprint: HashRef;
    mappingRef: string | null;
    evidence: EvidenceRef[];
};

type WorkflowRunSnapshot = {
    id: string;
    workflowRef: string;
    workflowVersion: number;
    definitionSnapshotStatus: "complete" | "legacy_missing";
    definitionManifestHash: HashRef | null;
    kind: WorkflowDefinitionSummary["kind"];
    tags: string[];
    status: WorkflowRunStatus;
    admissionStatus: "unknown" | "ready" | "no_capable_worker";
    trigger: WorkflowTriggerSnapshot;
    correlation: CorrelationRef | null;
    parentRunId: string | null;
    lane: string;
    priority: number;
    input: ValueEnvelope;
    output: ValueEnvelope | null;
    checkpoint: ValueEnvelope | null;
    waiting: {
        kind: "signal" | "timer" | "child_workflow" | "external" | "user";
        ref: string;
        since: string;
    } | null;
    budget: WorkflowBudget | null;
    usage: WorkflowUsage;
    error: FailureSnapshot | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    updatedAt: string;
};

type StartWorkflowRunCommand = {
    workflowRef: string;
    input: ValueEnvelope;
    correlation?: CorrelationRef | null;
    parentRunId?: string | null;
    priority?: number;
    lane?: string;
    budget?: WorkflowBudget | null;
    deadlineAt?: string | null;
};

type CancelWorkflowRunCommand = {
    reason: string;
    cascade: boolean;
};

type SignalWorkflowRunCommand = {
    signalRef: string;
    signalVersion: number;
    value: ValueEnvelope;
};

type ActivitySnapshot = {
    id: string;
    runId: string;
    key: string;
    path: string;
    sequence: number;
    kind:
        | "action"
        | "query"
        | "signal"
        | "timer"
        | "child_workflow"
        | "side_effect";
    fingerprint: HashRef;
    status: "pending" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";
    actionRef: string | null;
    input: ValueEnvelope | null;
    output: ValueEnvelope | null;
    waitingRef: string | null;
    jobRef: ResourceRef | null;
    childRunRef: ResourceRef | null;
    error: FailureSnapshot | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
};

type ActivityDetail = ActivitySnapshot & {
    receiptRefs: ResourceRef[];
    eventRefs: ResourceRef[];
};

type StepSnapshot = {
    id: string;
    runId: string;
    key: string;
    title: string;
    status: "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";
    progress: {
        current: number | null;
        total: number | null;
        message: string | null;
    } | null;
    activityRefs: ResourceRef[];
    startedAt: string | null;
    finishedAt: string | null;
};

type JobSnapshot = {
    id: string;
    runId: string;
    activityId: string;
    actionRef: string;
    actionManifestHash: HashRef;
    status:
        | "queued"
        | "leased"
        | "retry_wait"
        | "succeeded"
        | "failed_terminal"
        | "cancelled";
    lane: string;
    priority: number;
    attempts: number;
    maxAttempts: number;
    availableAt: string;
    nextAttemptAt: string | null;
    currentAttemptId: string | null;
    result: ValueEnvelope | null;
    error: FailureSnapshot | null;
    createdAt: string;
    updatedAt: string;
};

type JobDetail = JobSnapshot & {
    currentAttempt: AttemptSnapshot | null;
    recentAttemptPreview: AttemptSnapshot[];
    receiptPreview: ActionReceiptSnapshot[];
};

type AttemptSnapshot = {
    id: string;
    jobId: string;
    number: number;
    workerId: string;
    workerInstanceId: string;
    ownerEpoch: number;
    ownerSessionId: string | null;
    status:
        | "leased"
        | "succeeded"
        | "failed"
        | "lease_lost"
        | "cancelled"
        | "uncertain";
    leaseAcquiredAt: string;
    leaseExpiresAt: string;
    lastHeartbeatAt: string | null;
    finishedAt: string | null;
    error: FailureSnapshot | null;
};

type ActionReceiptSnapshot = {
    id: string;
    runId: string;
    activityId: string;
    jobId: string;
    attemptId: string;
    idempotencyKey: string;
    revision: number;
    status: "started" | "committed" | "unknown" | "compensated";
    externalRef: string | null;
    details: ValueEnvelope | null;
    error: FailureSnapshot | null;
    observedAt: string | null;
    receivedAt: string;
    createdAt: string;
    updatedAt: string;
};

type ReceiptReconciliationSnapshot = {
    id: string;
    receiptId: string;
    status: "queued" | "running" | "confirmed_committed" | "confirmed_not_committed"
        | "compensated" | "unresolved" | "failed";
    runId: string;
    evidence: EvidenceRef[];
    externalRef: string | null;
    error: FailureSnapshot | null;
    createdAt: string;
    finishedAt: string | null;
};

type WorkflowWorkerSummary = {
    workerId: string;
    instanceId: string;
    registrationGeneration: number;
    version: string;
    status: "starting" | "ready" | "draining" | "stopped" | "expired";
    mode: "direct" | "gateway";
    lanes: string[];
    workflowRefs: string[];
    actionRefs: string[];
    manifestEvidenceVersion: number;
    registeredAt: string;
    lastSeenAt: string;
    expiresAt: string;
};
```

Attempt Snapshot 可以公开租约时间、非秘密 Session 诊断 ID 和 owner epoch，但绝不
能公开 `leaseToken`、late-evidence token 或 Session token。新 Run 必须使用完整
definition snapshot；`legacy_missing` 只用于读取 Spike/迁移前历史，不能新建。

## 6. Observation、Entry 与 Asset

```ts
type OriginLocator = {
    scheme: string;
    provider: string;
    accountRef?: string | null;
    containerRef?: string | null;
    itemRef: string;
    attributes: Record<string, string>;
};

type DiscoveryContext = {
    schemaVersion: number;
    kind:
        | "followed_account"
        | "platform_recommendation"
        | "search"
        | "announcement_monitor"
        | "mailbox"
        | "manual_import"
        | "related_link"
        | "agent_research"
        | "research_request"
        | "schedule"
        | "manual";
    query?: string | null;
    parentRef?: ResourceRef | null;
    researchRequestId?: string | null;
    attributes: Record<string, unknown>;
};

type ObservationSummary = {
    id: string;
    sourceId: string;
    runId: string;
    entryId: string | null;
    eventKind: "create" | "update" | "delete" | "snapshot";
    externalId: string | null;
    externalKey: string;
    externalRevision: string;
    capturedAt: string;
    sourcePublishedAt: string | null;
};

type ObservationDetail = ObservationSummary & {
    originLocator: OriginLocator;
    discoveryContext: DiscoveryContext;
    webUrl: string | null;
    payload: ValueEnvelope | null;
    contentFingerprint: HashRef | null;
    parser: ProducerRef;
    assets: AssetSnapshot[];
};

type AssetSnapshot = {
    id: string;
    entryRevisionId: string;
    kind: string;
    status:
        | "saved"
        | "metadata_only"
        | "skipped"
        | "failed"
        | "over_budget"
        | "authentication_required";
    sourceUrl: string | null;
    mediaType: string | null;
    byteSize: number | null;
    hash: HashRef | null;
    downloadAvailable: boolean;
    error: FailureSnapshot | null;
    createdAt: string;
};

type PublisherSnapshot = {
    platformId: string | null;
    name: string;
    handle: string | null;
    profileUrl: string | null;
    kind: "person" | "bot" | "channel" | "site" | "official-account" | "org" | "unknown";
    metrics?: {
        followers?: number | null;
        following?: number | null;
        statuses?: number | null;
        voteup?: number | null;
        reliable?: "high" | "low" | "unknown";
    } | null;
};

type TemporalValueSnapshot = {
    exact: string | null;
    exactPrecision: "second" | null;
    fallback: {
        raw: string;
        lowerBound: string;
        precision: "second" | "minute" | "hour" | "day" | "week" | "month" | "year"
            | "unknown";
        timezone: string | null;
        confidence: "high" | "inferred" | "uncertain";
    } | null;
};

type ContentMetricsSnapshot = {
    values: {
        likes?: number | null;
        views?: number | null;
        reposts?: number | null;
        comments?: number | null;
        collects?: number | null;
        score?: number | null;
    };
    raw: Record<string, string>;
    reliability: "high" | "low" | "unknown";
    capturedAt: string;
};

type EntrySummary = {
    id: string;
    sourceId: string;
    primaryStoryId: string;
    currentRevisionId: string;
    contentKind: string;
    title: string;
    summary: string | null;
    publisher: PublisherSnapshot | null;
    publishedAt: TemporalValueSnapshot | null;
    webUrl: string | null;
    revisionCount: number;
    observationCount: number;
    assetSummary: {
        saved: number;
        missing: number;
    };
    updatedAt: string;
};

type EntryDetail = EntrySummary & {
    metrics: ContentMetricsSnapshot | null;
    currentRevision: EntryRevisionSnapshot;
    recentRevisionPreview: EntryRevisionSnapshot[];
    observationPreview: ObservationSummary[];
    relationPreview: RelationshipSummary[];
};

type EntryRevisionSnapshot = {
    id: string;
    entryId: string;
    revision: number;
    title: string;
    summary: string | null;
    contentText: string;
    webUrl: string | null;
    contentKind: string;
    publisher: PublisherSnapshot | null;
    publishedAt: TemporalValueSnapshot | null;
    updatedAt: TemporalValueSnapshot | null;
    contentFingerprint: HashRef;
    assets: AssetSnapshot[];
    provenance: EvidenceRef[];
    createdAt: string;
};
```

`PublisherSnapshot`、`TemporalValueSnapshot` 和 `ContentMetricsSnapshot` 与
Phase 1B 已验证合同保持同一 canonical schema；未来只做向后兼容扩展。

## 7. Story、Topic、Entity 与用户真相

```ts
type StorySummary = {
    id: string;
    canonicalId: string;
    kind: "event" | "document" | "media" | "thread";
    subtype: string | null;
    status: "current" | "merged" | "historical_shell";
    currentRevisionId: string;
    title: string;
    summary: string | null;
    memberCount: number;
    updatedAt: string;
};

type StoryRevisionSnapshot = {
    id: string;
    storyId: string;
    revision: number;
    title: string;
    summary: string | null;
    keyFacts: {
        text: string;
        factuality: "source_fact" | "inference";
        evidence: EvidenceRef[];
    }[];
    timeRange: {
        from: string | null;
        to: string | null;
    } | null;
    producer: ProducerRef;
    confidence: number | null;
    previousRevisionId: string | null;
    changeSummary: string | null;
    protectedFields: string[];
    audit: MutationAuditSnapshot;
    createdAt: string;
};

type StoryMembershipSnapshot = {
    id: string;
    storyId: string;
    entryId: string;
    status: "candidate" | "accepted" | "rejected" | "moved";
    role: "primary" | "evidence" | "mention";
    evidence: EvidenceRef[];
    producer: ProducerRef;
    revision: number;
    audit: MutationAuditSnapshot;
    createdAt: string;
    updatedAt: string;
};

type StoryDetail = StorySummary & {
    currentRevision: StoryRevisionSnapshot;
    memberPreview: StoryMembershipSnapshot[];
    aliases: string[];
    replacedBy: ResourceRef[];
    relatedPreview: RelatedStorySnapshot[];
};

type MergeStoryCommand = {
    storyIds: string[];
    canonicalStoryId: string;
    baseRevisionIds: Record<string, string>;
    reason: string;
    evidence: EvidenceRef[];
};

type SplitStoryCommand = {
    storyId: string;
    baseRevisionId: string;
    successors: {
        title: string;
        kind: StorySummary["kind"];
        subtype: string | null;
        entryIds: string[];
    }[];
    unresolvedEntryIds: string[];
    reason: string;
    evidence: EvidenceRef[];
};

type StoryStateMigrationPlanSnapshot = {
    id: string;
    operationRef: ResourceRef;
    status: "preview" | "ready" | "applied" | "reverted" | "expired" | "failed";
    baseRevisionIds: Record<string, string>;
    decisions: {
        stateType: "read_state" | "interaction" | "collection" | "topic_membership";
        from: ResourceRef;
        to: ResourceRef[];
        mode: "move" | "keep_on_history" | "drop" | "manual";
        reason: string;
    }[];
    audit: MutationAuditSnapshot | null;
    expiresAt: string | null;
};

type TopicSummary = {
    id: string;
    canonicalId: string;
    status: "current" | "merged" | "archived";
    currentRevisionId: string;
    title: string;
    purpose: string;
    memberCount: number;
    maintenanceEnabled: boolean;
    updatedAt: string;
};

type TopicRevisionSnapshot = {
    id: string;
    topicId: string;
    revision: number;
    title: string;
    purpose: string;
    scope: string;
    exclusions: string[];
    seedRefs: ResourceRef[];
    previousRevisionId: string | null;
    audit: MutationAuditSnapshot;
    createdAt: string;
};

type TopicMembershipSnapshot = {
    id: string;
    topicId: string;
    storyId: string;
    role:
        | "core"
        | "update"
        | "background"
        | "analysis"
        | "counterpoint"
        | "tutorial";
    status: "current" | "removed" | "proposed_remove";
    humanConfirmed: boolean;
    revision: number;
    evidence: EvidenceRef[];
    audit: MutationAuditSnapshot;
    updatedAt: string;
};

type EntitySummary = {
    id: string;
    type: string;
    canonicalName: string;
    aliases: string[];
    currentRevisionId: string;
};

type RelationshipSummary = {
    id: string;
    type: string;
    from: ResourceRef;
    to: ResourceRef;
    direction: "directed" | "undirected";
    status: "candidate" | "accepted" | "rejected";
    producer: ProducerRef;
    confidence: number | null;
    evidence: EvidenceRef[];
    revision: number;
    audit: MutationAuditSnapshot | null;
};

type AnnotationSnapshot = {
    id: string;
    target: ResourceRef;
    fragment: EvidenceRef["fragment"] | null;
    body: string;
    actor: ActorRef;
    revisionId: string;
    createdAt: string;
    updatedAt: string;
};

type SavedViewSnapshot = {
    id: string;
    name: string;
    targetKind: "story" | "entry";
    queryVersion: number;
    querySchemaRef: JsonSchemaRef;
    query: unknown;
    sort: unknown;
    revisionId: string;
    createdAt: string;
    updatedAt: string;
};
```

Label、Collection、Board placement 等用户真相沿用 stable ID、revision、actor、
createdAt/updatedAt 和显式 membership command。所有会改变 Story、Topic、
Membership、Relationship、Workspace 或用户状态的 Command 都返回
`MutationAuditSnapshot`；不能只在日志里记录 actor/base/result/reason/Run。

## 8. Knowledge 与 Research

```ts
type KnowledgeSignalSnapshot = {
    id: string;
    target: ResourceRef;
    targetRevisionId: string | null;
    kind: "urgent" | "needs_research" | "source_conflict" | "high_importance" | string;
    reason: string;
    evidence: EvidenceRef[];
    producer: ProducerRef;
    confidence: number | null;
    runId: string;
    createdAt: string;
};

type KnowledgeSignalDispositionSnapshot = {
    id: string;
    signalId: string;
    status: "acknowledged" | "ignored" | "converted_to_research" | "superseded";
    actor: ActorRef;
    reason: string | null;
    researchRequestRef: ResourceRef | null;
    supersededBySignalRef: ResourceRef | null;
    runId: string | null;
    createdAt: string;
};

type ProposalSnapshot = {
    id: string;
    kind:
        | "story_revision"
        | "story_membership"
        | "topic"
        | "topic_membership"
        | "relationship"
        | "workspace_revision";
    target: ResourceRef | null;
    baseRevisionId: string | null;
    value: ValueEnvelope;
    producer: ProducerRef;
    runId: string;
    evidence: EvidenceRef[];
    confidence: number | null;
    status: "pending" | "accepted" | "rejected" | "superseded";
    decision: {
        actor: ActorRef;
        reason: string | null;
        decidedAt: string;
    } | null;
    createdAt: string;
};

type ResearchRequestSnapshot = {
    id: string;
    signalIds: string[];
    goal: string;
    scope: {
        libraryQuerySchemaRef?: JsonSchemaRef;
        libraryQuery?: unknown;
        sourceRefs?: ResourceRef[];
        externalOperations?: string[];
        timeRange?: { from: string | null; to: string | null };
    };
    priority: number;
    idempotencyKey: string;
    parentRunId: string | null;
    parentActivityId: string | null;
    trigger: {
        reason: string;
        triggerRef: ResourceRef | null;
        input: ValueEnvelope;
        inputFingerprint: HashRef;
    };
    recursionDepth: number;
    workflowRef: string;
    workflowVersion: number;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
    runId: string | null;
    budget: WorkflowBudget | null;
    resultRefs: ResourceRef[];
    error: FailureSnapshot | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
};

type CreateResearchRequestCommand = {
    signalIds?: string[];
    goal: string;
    scope: ResearchRequestSnapshot["scope"];
    triggerReason: string;
    parentRunId?: string | null;
    parentActivityId?: string | null;
    priority?: number;
    workflowRef?: string;
    budget?: WorkflowBudget | null;
};
```

Research 的 Activity/Action/Attempt、恢复和外部调用通过 `runId` 查询同一 Runtime
journal；Request 只保存业务目标、不可变触发输入、深度和关联，不复制第二份执行
状态。KnowledgeSignal 的 disposition 是追加记录，原 Signal 永远不覆盖。

## 9. Feed、Related 与 Interaction

```ts
type RecommendationDecisionSnapshot = {
    policyRef: string;
    policyVersion: number;
    score: number | null;
    signals: {
        key: string;
        value: number | string | boolean | null;
        contribution: number | null;
    }[];
    adjustments: {
        kind: "dedupe" | "diversity" | "freshness" | "hysteresis" | "manual_override";
        value: number | string | boolean | null;
        reason: string;
    }[];
    reasons: string[];
    runId: string | null;
    decidedAt: string;
};

type FeedItemSnapshot = {
    story: StorySummary;
    primaryEntry: EntrySummary;
    sourceSummary: {
        independentSources: number;
        totalEntries: number;
    };
    ranking: RecommendationDecisionSnapshot;
    readState: ReadStateSnapshot | null;
    placement: {
        position: number;
        surface: string;
    };
};

type RelatedStorySnapshot = {
    story: StorySummary;
    relationTypes: string[];
    score: number | null;
    reasons: string[];
    evidence: EvidenceRef[];
};

type InteractionCommand = {
    event:
        | "impression"
        | "open"
        | "read"
        | "save"
        | "hide"
        | "not_interested"
        | "follow_topic"
        | "annotate"
        | "complete";
    target: ResourceRef;
    surface: string;
    impressionId?: string | null;
    occurredAt: string;
    metadata?: Record<string, string | number | boolean | null>;
};

type ReadStateSnapshot = {
    storyId: string;
    surface: string;
    lastSeenRevisionId: string | null;
    updatedSinceLastSeen: boolean;
    lastSeenAt: string | null;
};

type SpotlightPlacementSnapshot = {
    id: string;
    target: ResourceRef;
    boardId: string;
    sectionId: string;
    status: "active" | "expired" | "excluded";
    origin: "automatic" | "manual";
    policyRef: string | null;
    policyVersion: number | null;
    signals: {
        trend: number | null;
        importance: number | null;
        urgency: number | null;
        interest: number | null;
    };
    reasons: string[];
    thresholdDecision: "entered" | "retained" | "exited" | "manually_overridden";
    nextEvaluationAt: string | null;
    decisionRunId: string | null;
    expiresAt: string | null;
    manualOverride: "pinned" | "excluded" | null;
    actor: ActorRef;
    revision: number;
};
```

## 10. Workspace、Artifact 与 Board

```ts
type WorkspaceSummary = {
    id: string;
    kind: "recurring" | "brief" | "dossier" | "timeline" | "learning" | "custom";
    title: string;
    description: string | null;
    lifecycle: "active" | "paused" | "archived";
    currentRevisionId: string;
    currentArtifactRevisionId: string | null;
    activeUpdateId: string | null;
    maintenanceBindingRef: ResourceRef | null;
    freshness: "current" | "stale" | "unknown";
    updatedAt: string;
};

type WorkspaceInputBindingSnapshot = {
    id: string;
    workspaceId: string;
    input: ResourceRef | {
        type: "query";
        schemaRef: JsonSchemaRef;
        query: unknown;
    };
    role: string;
    primary: boolean;
    revision: number;
    actor: ActorRef;
    reason: string;
};

type WorkspaceMaintenanceBindingSnapshot = {
    id: string;
    workspaceId: string;
    workflowRef: string;
    workflowVersion: number;
    triggerBindingRef: ResourceRef | null;
    agentProfileRef: string | null;
    budget: WorkflowBudget | null;
    enabled: boolean;
    revisionId: string;
    audit: MutationAuditSnapshot;
};

type WorkspaceUpdateSnapshot = {
    id: string;
    workspaceId: string;
    baseWorkspaceRevisionId: string;
    runId: string;
    actor: ActorRef;
    maintenanceBindingRef: ResourceRef | null;
    triggerRef: ResourceRef | null;
    input: ValueEnvelope;
    status: "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";
    progress: StepSnapshot["progress"];
    currentStep: {
        stepId: string;
        title: string;
    } | null;
    recentResultRef: ResourceRef | null;
    budget: WorkflowBudget | null;
    candidateArtifactRevisionId: string | null;
    publishedWorkspaceRevisionId: string | null;
    error: FailureSnapshot | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
};

type ArtifactSummary = {
    id: string;
    kind: string;
    workspaceId: string | null;
    currentRevisionId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
};

type ArtifactRevisionSnapshot = {
    id: string;
    artifactId: string;
    revision: number;
    manifestHash: HashRef;
    entryPath: string | null;
    files: ArtifactFileSnapshot[];
    provenance: EvidenceRef[];
    producer: ProducerRef;
    runId: string;
    renderProfile: ArtifactRenderProfileSnapshot;
    createdAt: string;
};

type ArtifactFileSnapshot = {
    path: string;
    mediaType: string;
    byteSize: number;
    hash: HashRef;
    renderMode: "download" | "inline_media" | "sandboxed_html";
    downloadAvailable: boolean;
};

type ArtifactRenderProfileSnapshot = {
    id: string;
    version: number;
    originMode: "isolated";
    sandboxFlags: string[];
    contentSecurityPolicy: string;
    network: {
        mode: "deny_all" | "allowlist";
        allowedOrigins: string[];
    };
    hostDom: "denied";
    fileSystem: "denied";
    secrets: "denied";
    status: "renderable" | "download_only" | "blocked";
    reason: string | null;
};

type ArtifactRenderCapabilitySnapshot = {
    artifactRevisionId: string;
    profile: ArtifactRenderProfileSnapshot;
    url: string;
    expiresAt: string;
};

type BoardSnapshot = {
    id: string;
    name: string;
    currentRevisionId: string;
    sections: {
        id: string;
        title: string;
        position: number;
        blocks: {
            id: string;
            definitionRef: string;
            position: number;
            config: unknown;
            sourceRef: ResourceRef | null;
        }[];
    }[];
    actor: ActorRef;
    updatedAt: string;
};
```

InteractionState 使用 Workspace view definition 声明的版本化 schema；更新时返回
schema version 和 revision，不能把学习进度藏进 Artifact 文件。

## 11. Agent Conversation

```ts
type AgentConversationSnapshot = {
    id: string;
    roleRef: "knowledge-manager" | string;
    profileRef: string;
    title: string | null;
    status: "active" | "archived";
    memoryScopeRef: string | null;
    activeInvocationRunId: string | null;
    createdAt: string;
    updatedAt: string;
};

type AgentMessageSnapshot = {
    id: string;
    conversationId: string;
    parentId: string | null;
    role: "user" | "assistant" | "system" | "tool";
    content: ValueEnvelope;
    runId: string | null;
    usage: WorkflowUsage | null;
    createdAt: string;
};

type SendAgentMessageCommand = {
    parentMessageId?: string | null;
    content: ValueEnvelope;
    attachments?: ResourceRef[];
    requestedActions?: string[];
};
```

这些 DTO 只是 Cosmos Product 边界。Harness 的 SessionEntry、Profile 编译、
ModelRuntime 和 compaction 内部字段不直接成为 Product DTO。

## 12. Publication 与 Delivery

```ts
type SubscriptionSnapshot = {
    id: string;
    target: ResourceRef;
    enabled: boolean;
    schedule: {
        expression: string;
        timezone: string;
        misfirePolicy: "skip" | "run_once" | "catch_up_bounded";
        maxCatchUpRuns: number;
    } | null;
    channels: {
        channelDefinitionRef: string;
        connectionRef: ResourceRef;
        destinationRef: string;
        priority: number;
        capabilityStatus: "ready" | "unavailable" | "authorization_required";
    }[];
    deliveryRuleRef: string;
    revisionId: string;
    audit: MutationAuditSnapshot;
    nextTriggerAt: string | null;
};

type PublicationSnapshot = {
    id: string;
    source: ResourceRef | {
        type: "query";
        schemaRef: JsonSchemaRef;
        query: unknown;
    };
    status: "draft" | "freezing" | "ready" | "failed";
    currentRevisionId: string | null;
    createdBy: ActorRef;
    createdAt: string;
    updatedAt: string;
};

type PublicationRevisionSnapshot = {
    id: string;
    publicationId: string;
    revision: number;
    frozenRefs: ResourceRef[];
    webArtifactRevisionId: string | null;
    imageArtifactRevisionId: string | null;
    messageBody: ValueEnvelope | null;
    hash: HashRef;
    runId: string;
    createdAt: string;
};

type DeliveryIntentSnapshot = {
    id: string;
    publicationRevisionId: string;
    channel: string;
    destinationRef: string;
    idempotencyKey: string;
    status: "queued" | "sending" | "succeeded" | "failed" | "uncertain" | "cancelled";
    runId: string;
    attempts: number;
    receipt: ActionReceiptSnapshot | null;
    error: FailureSnapshot | null;
    createdAt: string;
    finishedAt: string | null;
};
```

## 13. 数据运维

```ts
type StorageUsageSnapshot = {
    measuredAt: string;
    categories: {
        database: number;
        observations: number | null;
        blobs: number;
        artifacts: number;
        cache: number;
        logs: number;
        exports: number;
    };
    totalBytes: number;
};

type BackupSnapshot = {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    scope: string[];
    manifestHash: HashRef | null;
    byteSize: number | null;
    runId: string;
    error: FailureSnapshot | null;
    createdAt: string;
    finishedAt: string | null;
};

type ExportSnapshot = {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "expired";
    format: string;
    scopeSchemaRef: JsonSchemaRef;
    scope: unknown;
    downloadAvailable: boolean;
    expiresAt: string | null;
    runId: string;
    error: FailureSnapshot | null;
};

type DeletionPlanSnapshot = {
    id: string;
    target: ResourceRef;
    mode: "configuration_only" | "history" | "all_owned_data";
    status: "preview" | "ready" | "executing" | "succeeded" | "failed" | "expired";
    affectedCounts: Record<string, number>;
    blockedBy: {
        target: ResourceRef;
        reason: string;
    }[];
    estimatedReclaimedBytes: number | null;
    irreversible: boolean;
    expiresAt: string;
    executionRunId: string | null;
};

type IntegrityReportSnapshot = {
    id: string;
    status: "running" | "clean" | "issues_found" | "failed";
    checkedAt: string;
    issues: {
        code: string;
        severity: "info" | "warning" | "error";
        target: ResourceRef | null;
        message: string;
        repairable: boolean;
    }[];
    runId: string;
};
```

## 14. Event payload 基线

事件 payload 只携带发生变化所需的最小引用：

```ts
type ResourceChangedPayload = {
    target: ResourceRef;
    previousRevisionId?: string | null;
    currentRevisionId?: string | null;
    runId?: string | null;
};

type RuntimeStateChangedPayload = {
    runId: string;
    activityId?: string | null;
    jobId?: string | null;
    attemptId?: string | null;
    previousStatus: string | null;
    status: string;
    reasonCode?: string | null;
};

type SnapshotRequiredPayload = {
    reason: "replay_limit" | "cursor_retired" | "projection_rebuilt";
    latestEventId: string;
    refresh: {
        resourceTypes: string[];
        refs?: ResourceRef[];
    };
};
```

完整对象由客户端重新 Query，Event 不复制大型 Entry、Artifact 或 Worker Job
payload。

## 15. Query DTO 基线

HTTP query parameter 在 Transport 层先解析为以下 DTO；多值字段使用重复参数，
cursor/limit 使用公共 `CursorPageQuery`，时间使用 `from` inclusive、`to`
exclusive。Application Query 接收已校验对象，不接收原始 URLSearchParams。

```ts
type CatalogListQuery = CursorPageQuery & {
    provider?: string | null;
    status?: ("enabled" | "disabled" | "unavailable" | "incompatible")[];
    capability?: string[];
};

type SourceListQuery = CursorPageQuery & {
    sourceDefinitionRef?: string | null;
    connectionId?: string | null;
    enabled?: boolean | null;
    status?: SourceStatus[];
    sort?: "name_asc" | "updated_desc" | "last_success_desc";
};

type WorkflowRunListQuery = CursorPageQuery & TimeRangeQuery & {
    workflowRef?: string | null;
    kind?: WorkflowDefinitionSummary["kind"][];
    status?: WorkflowRunStatus[];
    correlationType?: string | null;
    correlationId?: string | null;
    parentRunId?: string | null;
    lane?: string[];
    sort?: "created_desc" | "priority_desc" | "finished_desc";
};

type ObservationListQuery = CursorPageQuery & TimeRangeQuery & {
    sourceId?: string[];
    runId?: string | null;
    entryId?: string | null;
    eventKind?: ObservationSummary["eventKind"][];
    discoveryKind?: DiscoveryContext["kind"][];
    sort?: "captured_desc" | "source_published_desc";
};

type EntryListQuery = CursorPageQuery & TimeRangeQuery & {
    timeField?: "published_at" | "captured_at" | "updated_at";
    sourceId?: string[];
    storyId?: string | null;
    publisher?: string | null;
    contentKind?: string[];
    hasSavedAsset?: boolean | null;
    sort?: "published_desc" | "updated_desc" | "created_desc";
};

type LibrarySearchQuery = CursorPageQuery & TimeRangeQuery & {
    q: string;
    timeField?: "published_at" | "captured_at" | "updated_at";
    target?: ("story" | "entry")[];
    sourceId?: string[];
    publisher?: string | null;
    contentKind?: string[];
    ingestStatus?: string[];
    sort?: "relevance" | "published_desc" | "captured_desc";
};

type SearchHitSnapshot =
    | {
        kind: "story";
        story: StorySummary;
        primaryEntry: EntrySummary;
        score: number | null;
        highlights: string[];
        explanation: string[];
    }
    | {
        kind: "entry";
        entry: EntrySummary;
        storyRef: ResourceRef;
        score: number | null;
        highlights: string[];
        explanation: string[];
    };

type FeedQuery = CursorPageQuery & TimeRangeQuery & {
    surface?: string | null;
    savedViewId?: string | null;
    topicId?: string[];
    sourceId?: string[];
    category?: string[];
    unreadOnly?: boolean;
    policyRef?: string | null;
};

type StoryListQuery = CursorPageQuery & TimeRangeQuery & {
    kind?: StorySummary["kind"][];
    subtype?: string[];
    status?: StorySummary["status"][];
    topicId?: string[];
    entityId?: string[];
    sort?: "updated_desc" | "published_desc" | "title_asc";
};

type KnowledgeSignalListQuery = CursorPageQuery & TimeRangeQuery & {
    targetType?: string[];
    kind?: string[];
    producerId?: string[];
    disposition?: KnowledgeSignalDispositionSnapshot["status"][];
};

type ResearchRequestListQuery = CursorPageQuery & TimeRangeQuery & {
    status?: ResearchRequestSnapshot["status"][];
    priorityAtLeast?: number;
    signalId?: string | null;
    parentRunId?: string | null;
};

type EventQuery = CursorPageQuery & {
    type?: string[];
    aggregateType?: string | null;
    aggregateId?: string | null;
    runId?: string | null;
    after?: string | null;
};
```

Search 返回 `Page<SearchHitSnapshot>`，Feed 返回 `Page<FeedItemSnapshot>`。Query
fingerprint 包含所有过滤器、排序、协议版本和授权 scope；改变任一项后旧 cursor
失效。`EventQuery.cursor` 用于普通分页 Query，SSE 恢复仍优先使用
`Last-Event-ID`，`after` 只作兼容 fallback。

## 16. Planned mutation Command 基线

以下 DTO 固定“要表达什么”，不冻结具体 UI。`actor`、request/command ID 和认证
scope 由 Transport/Application context 注入，不接受客户端伪造；幂等键使用
Header。更新命令中的 `baseRevisionId` 与 `If-Match` 必须一致。

```ts
type UpdateConnectionCommand = {
    baseRevisionId: string;
    displayName?: string;
    safeConfiguration?: ValueEnvelope;
    enabled?: boolean;
};

type CreateCollectionPlanCommand = {
    name: string;
    sourceId: string;
    connectionId?: string | null;
    sourceOperationRef: string;
    workflowRef: string;
    trigger: TriggerConfig;
    scope: ValueEnvelope;
    discoveryContext: CollectionPlanDetail["discoveryContext"];
    budget?: WorkflowBudget | null;
    overlapPolicy?: OverlapPolicy;
    enabled?: boolean;
};

type UpdateCollectionPlanCommand = {
    baseRevisionId: string;
    name?: string;
    workflowRef?: string;
    trigger?: TriggerConfig;
    scope?: ValueEnvelope;
    discoveryContext?: CollectionPlanDetail["discoveryContext"];
    budget?: WorkflowBudget | null;
    overlapPolicy?: OverlapPolicy;
    enabled?: boolean;
};

type CreateTriggerBindingCommand = {
    definitionRef: string;
    workflowRef: string;
    config: TriggerConfig;
    inputMapping: ValueEnvelope;
    enabled?: boolean;
};

type UpdateTriggerBindingCommand = {
    baseRevisionId: string;
    workflowRef?: string;
    config?: TriggerConfig;
    inputMapping?: ValueEnvelope;
    enabled?: boolean;
};

type PutWorkflowBindingCommand = {
    baseRevisionId: string | null;
    workflowRef: string;
    workflowVersion: number;
    manifestHash: HashRef;
    enabled: boolean;
};

type StoryMembershipCommand = {
    operation: "accept" | "reject" | "move" | "correct";
    storyId: string;
    entryId: string;
    targetStoryId?: string | null;
    role?: StoryMembershipSnapshot["role"];
    baseRevisionId: string;
    reason: string;
    evidence: EvidenceRef[];
};

type ApplyStoryStateMigrationCommand = {
    planId: string;
    baseRevisionIds: Record<string, string>;
    operation: "apply" | "revert";
    reason: string;
};

type CreateTopicCommand = {
    title: string;
    purpose: string;
    scope: string;
    exclusions?: string[];
    seedRefs?: ResourceRef[];
    maintenanceBinding?: {
        workflowRef: string;
        workflowVersion: number;
        triggerBindingRef?: ResourceRef | null;
        budget?: WorkflowBudget | null;
    } | null;
    reason: string;
};

type UpdateTopicCommand = {
    baseRevisionId: string;
    title?: string;
    purpose?: string;
    scope?: string;
    exclusions?: string[];
    seedRefs?: ResourceRef[];
    reason: string;
};

type TopicMembershipCommand = {
    operation: "add" | "change_role" | "remove" | "propose_remove";
    topicId: string;
    storyId: string;
    role?: TopicMembershipSnapshot["role"];
    baseRevisionId: string;
    reason: string;
    evidence: EvidenceRef[];
};

type ProposalDecisionCommand = {
    decision: "accept" | "reject" | "supersede";
    baseRevisionId: string | null;
    reason: string;
    replacementProposalId?: string | null;
};

type CreateAnnotationCommand = {
    target: ResourceRef;
    fragment?: EvidenceRef["fragment"] | null;
    body: string;
};

type UpdateAnnotationCommand = {
    baseRevisionId: string;
    body: string;
};

type CreateSavedViewCommand = {
    name: string;
    targetKind: SavedViewSnapshot["targetKind"];
    querySchemaRef: JsonSchemaRef;
    query: ValueEnvelope;
    sort: ValueEnvelope;
};

type CreateWorkspaceCommand = {
    kind: WorkspaceSummary["kind"];
    title: string;
    description?: string | null;
    inputBindings?: {
        input: ResourceRef | { type: "query"; schemaRef: JsonSchemaRef; query: ValueEnvelope };
        role: string;
        primary: boolean;
    }[];
    maintenanceBinding?: Omit<
        WorkspaceMaintenanceBindingSnapshot,
        "id" | "workspaceId" | "revisionId" | "audit"
    > | null;
};

type UpdateWorkspaceCommand = {
    baseRevisionId: string;
    title?: string;
    description?: string | null;
    lifecycle?: WorkspaceSummary["lifecycle"];
    reason: string;
};

type WorkspaceInputBindingCommand = {
    operation: "add" | "change" | "remove";
    workspaceId: string;
    bindingId?: string | null;
    input?: ResourceRef | { type: "query"; schemaRef: JsonSchemaRef; query: ValueEnvelope };
    role?: string;
    primary?: boolean;
    baseRevisionId: string;
    reason: string;
};

type BoardLayoutCommand = {
    boardId: string;
    baseRevisionId: string;
    operation: "add" | "move" | "configure" | "remove";
    targetType: "section" | "block";
    targetId?: string | null;
    parentSectionId?: string | null;
    position?: number | null;
    definitionRef?: string | null;
    config?: ValueEnvelope | null;
    reason: string;
};

type SpotlightPlacementCommand = {
    target: ResourceRef;
    boardId: string;
    sectionId: string;
    operation: "pin" | "exclude" | "release";
    baseRevisionId?: string | null;
    reason: string;
};

type CreatePublicationCommand = {
    source: ResourceRef | { type: "query"; schemaRef: JsonSchemaRef; query: ValueEnvelope };
    requestedFormats: ("web" | "image" | "message")[];
};

type CreateDeliveryIntentCommand = {
    publicationRevisionId: string;
    channelDefinitionRef: string;
    connectionRef: ResourceRef;
    destinationRef: string;
};

type CreateDeletionPlanCommand = {
    target: ResourceRef;
    mode: DeletionPlanSnapshot["mode"];
};

type ExecuteDeletionPlanCommand = {
    planId: string;
    planFingerprint: HashRef;
    confirmation: "confirm_irreversible_delete";
};

type CreateBackupCommand = {
    scope: string[];
    destinationRef: string;
};

type CreateRestorePlanCommand = {
    backupId: string;
    expectedManifestHash: HashRef;
    mode: "replace" | "restore_into_empty";
};
```

Label、Collection、Subscription、Settings 和简单 metadata CRUD 仍遵循同一
revision/idempotency/audit 规则；实现 Task 必须在生成 OpenAPI 前为实际交付端点
补齐具体 schema，不能以 `Record<string, unknown>` 作为 Command fallback。
