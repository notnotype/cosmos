import { sourceConfigSchema, type SourceMediaPolicy, type SourceSnapshot } from "@cosmos/contracts";
import { type Prisma } from "@prisma/client";
import type { CatalogPort, SourceDefinitionManifest } from "@cosmos/application";

/**
 * 来源读投影的唯一实现（ADR-0023 决策 2）：计划自有字段（连接、调度、启用状态、媒体预算）
 * 一律从计划取，运行诊断取计划与来源里更近的一条。单条读与列表读共用它，否则同一事实会
 * 出现两个答案；列表读还需要批量版本，因此投影本身是纯函数，查询留在调用方。
 */
export interface SourceRunDiagnostics {
    at: Date;
    error: string | null;
}

/** 运行行的诊断读模型：`finishedAt` 优先，未完成时退回归档时间。 */
export type SourceRunDiagnosticsRow = {
    createdAt: Date;
    finishedAt: Date | null;
    errorMessage: string | null;
};

export type SourcePlanRow = Prisma.CollectionPlanGetPayload<{
    include: { triggerBindings: true; connection: true };
}>;

type SourceManifestInput = Pick<Prisma.SourceInstanceGetPayload<{}>, "sourceDefinitionRef" | "kind" | "operationId">;

/** 来源定义对不上清单就拒绝投影：来源 id 只有在清单里才解释得出连接器与操作。 */
export function requireSourceManifest(
    catalog: Pick<CatalogPort, "getSourceDefinitionByRef">,
    source: SourceManifestInput,
): SourceDefinitionManifest {
    const manifest = catalog.getSourceDefinitionByRef(source.sourceDefinitionRef);
    if (!manifest || manifest.id !== source.kind || !manifest.operationIds.includes(source.operationId)) {
        throw new Error(`Source definition mapping is invalid: ${source.sourceDefinitionRef}`);
    }
    return manifest;
}

/** legacy Run 与 durable WorkflowRun 里更近的一条；并列时 legacy 胜（与原 findFirst 口径一致）。 */
export function mergeRunDiagnostics(
    legacy: SourceRunDiagnosticsRow | null,
    workflow: SourceRunDiagnosticsRow | null,
): SourceRunDiagnostics | null {
    const legacyProjection = legacy
        ? { at: legacy.finishedAt ?? legacy.createdAt, error: legacy.errorMessage }
        : null;
    const workflowProjection = workflow
        ? { at: workflow.finishedAt ?? workflow.createdAt, error: workflow.errorMessage }
        : null;
    return legacyProjection && workflowProjection
        ? legacyProjection.at >= workflowProjection.at ? legacyProjection : workflowProjection
        : legacyProjection ?? workflowProjection;
}

/**
 * 批量读的运行行：查询按 `createdAt desc` 排序，每组的第一行就是最新一条。
 * 归属为空的行（WorkflowRun 的 sourceInstanceId 可空）直接丢弃。
 */
export function firstRunPerSource<Row extends SourceRunDiagnosticsRow & { sourceInstanceId: string | null }>(
    rows: readonly Row[],
): ReadonlyMap<string, Row> {
    const latest = new Map<string, Row>();
    for (const row of rows) {
        if (row.sourceInstanceId !== null && !latest.has(row.sourceInstanceId)) {
            latest.set(row.sourceInstanceId, row);
        }
    }
    return latest;
}

export type RunHistoryTable = "Run" | "WorkflowRun";

export type LatestRunRow = SourceRunDiagnosticsRow & { sourceInstanceId: string };

/**
 * 每个来源的最新一条运行行。
 *
 * 不能用 `findMany({ where: { sourceInstanceId: { in } }, orderBy, take })`：`take` 是整批的
 * 全局上限，而这里每组各要一条；Prisma 也不用 `distinct` 在 SQL 层分组，整批历史会被读回内存
 * 再挑，行数于是随历史长度线性增长。窗口函数把分组交给 SQLite，返回行数上界就等于来源数。
 * `@@index([sourceInstanceId, createdAt])` 让分区与排序都走索引，不必扫全表。
 *
 * 表名来自字面量联合类型而非外部输入，因此可以直接拼进 SQL；id 仍走占位符参数。
 * DateTime 列由 Prisma 解码成 `Date`（原始 SQL 也一样），调用方不必再转换。
 */
export async function latestRunRowsPerSource(
    client: Pick<Prisma.TransactionClient, "$queryRawUnsafe">,
    table: RunHistoryTable,
    sourceIds: readonly string[],
): Promise<readonly LatestRunRow[]> {
    if (sourceIds.length === 0) {
        return [];
    }
    const placeholders = sourceIds.map(() => "?").join(", ");
    return client.$queryRawUnsafe<LatestRunRow[]>(
        `SELECT sourceInstanceId, createdAt, finishedAt, errorMessage FROM (
            SELECT sourceInstanceId, createdAt, finishedAt, errorMessage,
                ROW_NUMBER() OVER (PARTITION BY sourceInstanceId ORDER BY createdAt DESC) AS rowNumber
            FROM "${table}"
            WHERE sourceInstanceId IN (${placeholders})
        ) WHERE rowNumber = 1`,
        ...sourceIds,
    );
}

export function projectSourceSnapshot(input: {
    source: Prisma.SourceInstanceGetPayload<{}>;
    manifest: SourceDefinitionManifest;
    plan: SourcePlanRow;
    latest: SourceRunDiagnostics | null;
}): SourceSnapshot {
    const { source, manifest, plan, latest } = input;
    // 计划可以持有多种触发器（ADR-0025）：来源投影里的调度间隔只由 schedule 行派生。
    const scheduleBinding = plan.triggerBindings.find((binding) => binding.kind === "schedule") ?? null;
    const triggerConfig = scheduleBinding
        ? JSON.parse(scheduleBinding.configJson) as { intervalMs?: number }
        : null;
    return {
        id: source.id,
        name: source.name,
        sourceDefinitionRef: manifest.ref,
        operationId: source.operationId,
        connectorId: manifest.connectorId,
        kind: manifest.id,
        config: sourceConfigSchema.parse(JSON.parse(source.configJson)),
        enabled: plan.enabled,
        mediaPolicy: plan.mediaPolicyJson === null
            ? null
            : JSON.parse(plan.mediaPolicyJson) as SourceMediaPolicy,
        revisionId: `${source.id}:${source.revision}`,
        createdAt: source.createdAt.toISOString(),
        updatedAt: source.updatedAt.toISOString(),
        lastRunAt: latest?.at.toISOString() ?? null,
        lastError: latest?.error ?? null,
        planId: plan.id,
        planRevisionId: `${plan.id}:${plan.revision}`,
        connectionId: plan.connectionId,
        /**
         * 连接投影随执行快照一起冻住（Proposal connection-login-lifecycle-v1 决定 1）。
         * 只取身份与非秘密配置：`status`/`lastError` 是活诊断，冻进 Run 的输入只会
         * 让后来读它的人以为那就是当轮的连接状态。
         */
        connection: plan.connection
            ? {
                id: plan.connection.id,
                connectorId: plan.connection.connectorId,
                configJson: plan.connection.configJson,
            }
            : null,
        scheduleIntervalMs: typeof triggerConfig?.intervalMs === "number" ? triggerConfig.intervalMs : null,
    };
}
