import { z } from "zod";
import {
    protocolVersion,
} from "./base.js";
import {
    annotationSchema,
    collectionDetailSchema,
    favoriteItemSchema,
    labelDetailSchema,
    savedViewSchema,
} from "./user-organization.js";
import {
    boardDetailSchema,
    spotlightPlacementSchema,
} from "./board.js";

export const storageStatsSchema = z.object({
    databaseBytes: z.number().int().nonnegative(),
    blobBytes: z.number().int().nonnegative(),
    blobFileCount: z.number().int().nonnegative(),
    artifactBytes: z.number().int().nonnegative(),
    cacheBytes: z.number().int().nonnegative(),
    logBytes: z.number().int().nonnegative(),
    secretBytes: z.number().int().nonnegative(),
    categories: z.object({
        raw: z.number().int().nonnegative(),
        user: z.number().int().nonnegative(),
        rebuildable: z.number().int().nonnegative(),
        cleanable: z.number().int().nonnegative(),
    }).strict(),
    snapshotAt: z.string(),
}).strict();

export type StorageStats = z.infer<typeof storageStatsSchema>;

/** A database backup file inside the data root (ADR-0019 / OPS-004). */

export const backupSnapshotSchema = z.object({
    id: z.string(),
    name: z.string(),
    byteSize: z.number().int().nonnegative(),
    createdAt: z.string(),
}).strict();

export type BackupSnapshot = z.infer<typeof backupSnapshotSchema>;

/**
 * 用户数据导出件（LIB-008 / OPS-004）：用户真相对象（ADR-0009/0010）的可带走副本。
 *
 * 只收录用户创作与配置的数据，以及它们引用的目标摘要；采集内容、运行记录、Secret
 * 与内部存储键都不在其中——需要内容库时用 `POST /backups` 的数据库副本。字段直接
 * 复用各对象的公开读投影，导出不新造第二套对象定义。
 */

export const userDataExportTargetSchema = z.object({
    targetType: z.string(),
    targetId: z.string(),
    // 目标已被删除时为 null，引用本身仍然保留，导出件不因悬空引用失败。
    title: z.string().nullable(),
    webUrl: z.string().nullable(),
});

export type UserDataExportTarget = z.infer<typeof userDataExportTargetSchema>;


export const userDataExportSchema = z.object({
    // 唯一版本位：新增分区或改变字段含义时升版本，不改已有字段语义。
    schemaVersion: z.literal(1),
    exportedAt: z.string(),
    counts: z.object({
        labels: z.number().int().nonnegative(),
        collections: z.number().int().nonnegative(),
        favorites: z.number().int().nonnegative(),
        annotations: z.number().int().nonnegative(),
        savedViews: z.number().int().nonnegative(),
        boards: z.number().int().nonnegative(),
        spotlightPlacements: z.number().int().nonnegative(),
        targets: z.number().int().nonnegative(),
    }).strict(),
    data: z.object({
        labels: labelDetailSchema.array(),
        collections: collectionDetailSchema.array(),
        favorites: favoriteItemSchema.array(),
        annotations: annotationSchema.array(),
        savedViews: savedViewSchema.array(),
        boards: boardDetailSchema.array(),
        spotlightPlacements: spotlightPlacementSchema.array(),
        targets: userDataExportTargetSchema.array(),
    }).strict(),
}).strict();

export type UserDataExport = z.infer<typeof userDataExportSchema>;

/**
 * 连接器状态导出／导入（ING-012，ADR-0026）。归属由 `ConnectorStateNamespace` 记录，
 * 所以清单与导出都是一次 join，不再解析 manifest 模板。导出件只含非秘密状态：
 * Secret、连接配置、Checkpoint 与其它表一律不在其中（ADR-0017 的所有权边界）。
 */

/** 一个抽屉的归属与规模；`unattributed` 为真时三个归属字段都是 null。 */
export const connectorStateNamespaceSummarySchema = z.object({
    namespace: z.string(),
    keyCount: z.number().int().nonnegative(),
    planId: z.string().nullable(),
    sourceId: z.string().nullable(),
    connectionId: z.string().nullable(),
    unattributed: z.boolean(),
}).strict();

export type ConnectorStateNamespaceSummary = z.infer<typeof connectorStateNamespaceSummarySchema>;

export const connectorStateEntrySchema = z.object({
    key: z.string(),
    value: z.unknown(),
    version: z.number().int().positive(),
    updatedAt: z.string(),
}).strict();

export type ConnectorStateEntryExport = z.infer<typeof connectorStateEntrySchema>;

/** 导出件里的归属快照：离开 Cosmos 后仍能读出「这个抽屉原来属于谁」。 */
export const connectorStateExportOwnerSchema = z.object({
    planId: z.string(),
    sourceId: z.string(),
    connectionId: z.string().nullable(),
}).strict();

export const connectorStateExportNamespaceSchema = z.object({
    namespace: z.string(),
    /** 未归属抽屉（只在按名字点名导出时出现）为 null。 */
    owner: connectorStateExportOwnerSchema.nullable(),
    entries: connectorStateEntrySchema.array(),
}).strict();

export const connectorStateExportScopeSchema = z.object({
    kind: z.enum(["namespace", "plan", "connection", "source", "attributed"]),
    /** `attributed`（全部已归属）时为 null。 */
    value: z.string().nullable(),
}).strict();

export const connectorStateExportSchema = z.object({
    // 唯一版本位：改变字段含义时升版本，不改已有字段语义。
    schemaVersion: z.literal(1),
    exportedAt: z.string(),
    scope: connectorStateExportScopeSchema,
    counts: z.object({
        namespaces: z.number().int().nonnegative(),
        keys: z.number().int().nonnegative(),
    }).strict(),
    namespaces: connectorStateExportNamespaceSchema.array(),
}).strict();

export type ConnectorStateExport = z.infer<typeof connectorStateExportSchema>;

/**
 * 导出范围（ADR-0026）：`attributed` 是「全部已归属」，其余四种按一个具体对象收窄。
 * 未归属抽屉不属于任何一种范围，只能按名字点名（`namespace`）。
 */
export type ConnectorStateExportScope =
    | { kind: "attributed" }
    | { kind: "namespace"; namespace: string }
    | { kind: "plan"; planId: string }
    | { kind: "connection"; connectionId: string }
    | { kind: "source"; sourceId: string };

/**
 * 导出范围查询参数：四选一，缺省 = 全部已归属。多个参数同时给出是无效请求——范围必须
 * 唯一，否则"导出连接 X"会静默变成 X 与 Y 的并集。未归属抽屉不在任何一种范围里，
 * 只能按名字点名（`namespace`）。
 */
export const connectorStateExportQuerySchema = z.object({
    namespace: z.string().trim().min(1).max(200).optional(),
    planId: z.string().trim().min(1).max(200).optional(),
    connectionId: z.string().trim().min(1).max(200).optional(),
    sourceId: z.string().trim().min(1).max(200).optional(),
}).strict().refine(
    (value) => [value.namespace, value.planId, value.connectionId, value.sourceId]
        .filter((item) => item !== undefined).length <= 1,
    { message: "At most one of namespace/planId/connectionId/sourceId may be given." },
);

export type ConnectorStateExportQuery = z.infer<typeof connectorStateExportQuerySchema>;

/**
 * 导入命令：导出件整体作为 body 的一个字段，导入边界因此只有一个被校验的输入。
 * `mode` 默认只补缺失——导入不该静默把本地较新的 ETag／游标回退成旧值。
 */
export const connectorStateImportCommandSchema = z.object({
    mode: z.enum(["skip-existing", "overwrite"]).default("skip-existing"),
    /**
     * 换机后计划 id 不同时把导出件落到本地另一个抽屉；只允许导出件含单个抽屉时使用，
     * 且目标抽屉必须已有归属登记（新环境确实有计划的模板会算出这个名字）。
     */
    targetNamespace: z.string().trim().min(1).max(200).optional(),
    export: connectorStateExportSchema,
}).strict();

export type ConnectorStateImportCommand = z.infer<typeof connectorStateImportCommandSchema>;

export const connectorStateImportResultSchema = z.object({
    mode: z.enum(["skip-existing", "overwrite"]),
    namespaces: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
    overwritten: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
}).strict();

export type ConnectorStateImportResult = z.infer<typeof connectorStateImportResultSchema>;



export const healthResponseSchema = z.object({
    status: z.literal("ok"),
    service: z.string(),
    version: z.string(),
    protocolVersion: z.string(),
    workerStatus: z.enum(["unknown", "starting", "ready", "stopped"]),
    storageStatus: z.enum(["unknown", "starting", "ready", "failed"]),
    migrationStatus: z.enum(["unknown", "pending", "ready", "failed"]),
    timestamp: z.string(),
});


export type HealthResponse = z.infer<typeof healthResponseSchema>;


export const serviceErrorCodeSchema = z.enum([
    "validation_failed",
    "not_found",
    "conflict",
    "service_unavailable",
    "protocol_mismatch",
    "uncertain",
    "invalid_input",
    "invalid_model_selection",
    "forbidden_origin",
    "version_conflict",
    "in_use",
    "operation_in_progress",
    "payload_too_large",
    "credential_write_failed",
    "cleanup_pending",
    "dependency_unavailable",
]);


export type ServiceErrorCode = z.infer<typeof serviceErrorCodeSchema>;


export const serviceErrorSchema = z.object({
    code: serviceErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    commandId: z.string().optional(),
    operationId: z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    retryable: z.boolean(),
});


export type ServiceError = z.infer<typeof serviceErrorSchema>;


export interface EventEnvelope<TPayload> {
    id: string;
    type: string;
    version: string;
    occurredAt: string;
    payload: TPayload;
}


export const eventSnapshotSchema = z.object({
    id: z.string(),
    type: z.string(),
    version: z.string(),
    occurredAt: z.string(),
    payload: z.unknown(),
});

export type EventSnapshot = z.infer<typeof eventSnapshotSchema>;


export const snapshotRequiredPayloadSchema = z.object({
    reason: z.string(),
    latestEventId: z.string(),
});

export type SnapshotRequiredPayload = z.infer<typeof snapshotRequiredPayloadSchema>;


export const sseEventSchema = z.object({
    id: z.string(),
    type: z.string(),
    version: z.string(),
    occurredAt: z.string(),
    payload: z.unknown(),
});

export type SseEvent = z.infer<typeof sseEventSchema>;
