import { join } from "node:path";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { collectionPlanWebhookEntryPath, type CollectionPlanSnapshot, type CollectionPlanWebhookEntry, type CreateSourceCommand, type ConnectionInstance, type ConnectionStatus, type CreateConnectionCommand, type UpdateConnectionCommand, type StorageStats, type BackupSnapshot, type SourceMediaPolicy, type SourceSnapshot, type UpdateCollectionPlanCommand, type UpdateSourceCommand } from "@cosmos/contracts";
import { CollectionPlanNotFoundError, CollectionPlanRevisionConflictError, ConnectionNotFoundError, ConnectionVersionConflictError, InvalidModelSelectionError, resolveModelConnectionWrite, SourceNotFoundError, SourceRevisionConflictError, type CollectionPlanWebhookEntryTarget } from "@cosmos/application";
import { type Prisma } from "@prisma/client";
import { directorySize, fileSize, parsePlanRevisionId, parseSourceRevisionId } from "../storage-root.js";
import { appendDomainEvent } from "./repository-internals.js";
import { PrismaCosmosRepositoryHelpers4 } from "./helpers-4.js";
import { firstRunPerSource, latestRunRowsPerSource, mergeRunDiagnostics, projectSourceSnapshot, requireSourceManifest } from "./source-projection.js";

export class PrismaCosmosRepositorySources extends PrismaCosmosRepositoryHelpers4 {
    async createSource(input: CreateSourceCommand): Promise<SourceSnapshot> {
        const manifest = this.catalog.getSourceDefinitionByRef(input.sourceDefinitionRef);
        if (!manifest || manifest.status !== "enabled" || !manifest.operationIds.includes(input.operationId)) {
            throw new Error(`Source definition is not available: ${input.sourceDefinitionRef}`);
        }
        const source = await this.prisma.$transaction(async (tx) => {
            const created = await tx.sourceInstance.create({
                data: {
                    name: input.name,
                    kind: manifest.id,
                    sourceDefinitionRef: manifest.ref,
                    operationId: input.operationId,
                    configJson: JSON.stringify(input.config),
                    enabled: false,
                    revision: 1,
                },
            });
            // 计划与采集目标一对一（ADR-0023）：默认计划与来源同批建出。读取切换之后
            // 调度、状态命名空间与媒体预算都按计划归属，晚建会让新来源失去这些归属。
            const plan = await tx.collectionPlan.create({
                data: {
                    id: `plan:${created.id}`,
                    name: created.name,
                    sourceId: created.id,
                    // 连接归计划（ADR-0023 决策 2）：创建命令接受它是为了让「建目标」与
                    // 「绑连接」在同一步完成，不留下没有连接的计划。
                    connectionId: input.connectionId ?? null,
                    mediaPolicyJson: null,
                    enabled: false,
                    revision: 1,
                },
            });
            if (input.scheduleIntervalMs !== undefined) {
                await tx.triggerBinding.create({
                    data: {
                        sourceId: created.id,
                        planId: plan.id,
                        kind: "schedule",
                        configJson: JSON.stringify({ intervalMs: input.scheduleIntervalMs }),
                        enabled: true,
                        revision: 1,
                    },
                });
            }
            return created;
        });
        return this.toSourceSnapshot(source);
    }

    async listSources(): Promise<readonly SourceSnapshot[]> {
        const sources = await this.prisma.sourceInstance.findMany({
            // 墓碑来源（AUT-001 删除）不再出现在产品面上。
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
        });
        if (sources.length === 0) {
            return [];
        }
        const sourceIds = sources.map((source) => source.id);
        // 批量投影：每个来源各查计划与两类运行会让查询量随来源数线性增长（N 个来源 1 + 4N 次），
        // 列表是产品面的常驻读，这里按来源 id 一次取回再在内存里归并，与来源数无关。
        const [plans, legacyRuns, workflowRuns] = await Promise.all([
            this.prisma.collectionPlan.findMany({
                where: { sourceId: { in: sourceIds } },
                include: { triggerBindings: true, connection: true },
            }),
            // 运行行只取每个来源最新一条：只把查询次数变成常数还不够，整批读回历史会让
            // 读到的行数随每个来源的历史长度线性增长，等于把债务换个维度。
            latestRunRowsPerSource(this.prisma, "Run", sourceIds),
            latestRunRowsPerSource(this.prisma, "WorkflowRun", sourceIds),
        ]);
        const planBySource = new Map(plans.map((plan) => [plan.sourceId, plan]));
        const legacyBySource = firstRunPerSource(legacyRuns);
        const workflowBySource = firstRunPerSource(workflowRuns);
        return sources.map((source) => {
            // 校验放在批量查询之后：来源定义非法时这几次批量读已经付过代价，但那只发生在
            // 错误路径，换来的是一条查询服务全部来源。
            const manifest = requireSourceManifest(this.catalog, source);
            const plan = planBySource.get(source.id);
            if (!plan) {
                throw new Error(`Source has no collection plan: ${source.id}`);
            }
            return projectSourceSnapshot({
                source,
                manifest,
                plan,
                latest: mergeRunDiagnostics(
                    legacyBySource.get(source.id) ?? null,
                    workflowBySource.get(source.id) ?? null,
                ),
            });
        });
    }

    async getSource(sourceId: string): Promise<SourceSnapshot | null> {
        const source = await this.prisma.sourceInstance.findFirst({
            where: { id: sourceId, deletedAt: null },
        });
        return source ? this.toSourceSnapshot(source) : null;
    }

    /**
     * 计划读投影（ADR-0023）：产品面的对象是计划，所以它要能独立回答「挂在哪个连接、
     * 多久采集一次、什么媒体预算、最近一次失败」。墓碑来源的计划不出现在产品面上。
     */
    protected async toCollectionPlanSnapshot(plan: CollectionPlanRow): Promise<CollectionPlanSnapshot> {
        const latest = await this.latestRunDiagnostics(this.prisma, { planId: plan.id });
        return toCollectionPlanSnapshot(plan, plan.triggerBindings, plan.source.revision, latest);
    }

    async listCollectionPlans(): Promise<readonly CollectionPlanSnapshot[]> {
        const plans = await this.prisma.collectionPlan.findMany({
            where: { source: { deletedAt: null } },
            include: { triggerBindings: true, source: { select: { revision: true } } },
            orderBy: { createdAt: "asc" },
        });
        return Promise.all(plans.map((plan) => this.toCollectionPlanSnapshot(plan)));
    }

    async getCollectionPlan(planId: string): Promise<CollectionPlanSnapshot | null> {
        const plan = await this.prisma.collectionPlan.findFirst({
            where: { id: planId, source: { deletedAt: null } },
            include: { triggerBindings: true, source: { select: { revision: true } } },
        });
        return plan ? this.toCollectionPlanSnapshot(plan) : null;
    }

    /**
     * 来源只写它自己拥有的字段（ADR-0023 决策 2 的字段边界）：名字与目标配置。
     * 连接、调度、媒体预算与启用状态归计划，写入口是 `updateCollectionPlan`。
     */
    async updateSource(sourceId: string, input: UpdateSourceCommand): Promise<SourceSnapshot> {
        const expectedRevision = parseSourceRevisionId(sourceId, input.baseRevisionId);
        const current = await this.prisma.sourceInstance.findUnique({ where: { id: sourceId } });
        // 墓碑来源对编辑命令等同不存在（AUT-001）。
        if (!current || current.deletedAt) throw new SourceNotFoundError(sourceId);
        // 一次 CAS 写就够了：媒体预算的写穿透随 1c-1c-b2 收掉之后，这里不再有第二张表要改。
        const updated = await this.prisma.sourceInstance.updateMany({
            where: { id: sourceId, revision: expectedRevision },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.config !== undefined ? { configJson: JSON.stringify(input.config) } : {}),
                revision: { increment: 1 },
            },
        });
        if (updated.count !== 1) throw new SourceRevisionConflictError(sourceId);
        return this.toSourceSnapshot(await this.prisma.sourceInstance.findUniqueOrThrow({ where: { id: sourceId } }));
    }

    /**
     * 计划自有字段的唯一写入口（ADR-0023 决策 2）：名字、连接、调度、媒体预算与启用状态。
     * CAS 用计划自身的 revision，与来源 revision 相互独立（ADR-0004 的形态）。
     * 墓碑来源的计划对编辑命令等同不存在。
     */
    async updateCollectionPlan(
        planId: string,
        input: UpdateCollectionPlanCommand,
    ): Promise<CollectionPlanSnapshot> {
        const expectedRevision = parsePlanRevisionId(planId, input.baseRevisionId);
        const current = await this.prisma.collectionPlan.findFirst({
            where: { id: planId, source: { deletedAt: null } },
        });
        if (!current) throw new CollectionPlanNotFoundError(planId);
        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.collectionPlan.updateMany({
                where: { id: planId, revision: expectedRevision },
                data: {
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    ...(input.connectionId !== undefined ? { connectionId: input.connectionId } : {}),
                    ...(input.mediaPolicy !== undefined
                        ? {
                            mediaPolicyJson: input.mediaPolicy === null || input.mediaPolicy === undefined
                                ? null
                                : JSON.stringify(input.mediaPolicy),
                        }
                        : {}),
                    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
                    revision: { increment: 1 },
                },
            });
            if (updated.count !== 1) throw new CollectionPlanRevisionConflictError(planId);
            if (input.scheduleIntervalMs !== undefined) {
                if (input.scheduleIntervalMs === null) {
                    // 只删调度那一行：webhook 等其它触发方式是独立的行（ADR-0025），
                    // 删掉它们等于静默关掉用户配好的另一种触发方式。
                    await tx.triggerBinding.deleteMany({ where: { planId, kind: "schedule" } });
                } else {
                    await tx.triggerBinding.upsert({
                        where: { planId_kind: { planId, kind: "schedule" } },
                        create: {
                            sourceId: current.sourceId,
                            planId,
                            kind: "schedule",
                            configJson: JSON.stringify({ intervalMs: input.scheduleIntervalMs }),
                            enabled: true,
                            revision: 1,
                        },
                        update: {
                            planId,
                            configJson: JSON.stringify({ intervalMs: input.scheduleIntervalMs }),
                            revision: { increment: 1 },
                        },
                    });
                }
            }
        });
        const updatedPlan = await this.getCollectionPlan(planId);
        if (!updatedPlan) throw new CollectionPlanNotFoundError(planId);
        return updatedPlan;
    }

    /**
     * Webhook 入口的生成/轮换（ADR-0024）。凭证字节先写到**新的**引用，再换行上的引用，
     * 最后删旧引用：任何一步失败，旧凭证要么仍然有效，要么已经被替换成同一份新值，
     * 不会留下「行上的引用指向一份已经被覆盖掉的凭证」这种静默失效。
     */
    async rotateCollectionPlanWebhookEntry(planId: string): Promise<CollectionPlanWebhookEntry> {
        const plan = await this.prisma.collectionPlan.findFirst({
            where: { id: planId, source: { deletedAt: null } },
            include: { triggerBindings: true },
        });
        if (!plan) throw new CollectionPlanNotFoundError(planId);
        const existing = plan.triggerBindings.find((binding) => binding.kind === "webhook") ?? null;

        // 入口标识会出现在 URL 与日志里，所以它不是凭证；凭证是另一份更强的随机值。
        const token = randomBytes(24).toString("base64url");
        const credential = randomBytes(32).toString("base64url");
        const secretRef = `secret:webhook-${randomUUID()}`;
        await this.secrets.put(secretRef, credential);
        try {
            if (existing) {
                await this.prisma.triggerBinding.update({
                    where: { id: existing.id },
                    data: { webhookToken: token, secretRef, revision: { increment: 1 } },
                });
            } else {
                await this.prisma.triggerBinding.create({
                    data: {
                        sourceId: plan.sourceId,
                        planId: plan.id,
                        kind: "webhook",
                        configJson: JSON.stringify({}),
                        enabled: true,
                        revision: 1,
                        webhookToken: token,
                        secretRef,
                    },
                });
            }
        } catch (error) {
            // 行没换成，新引用就没人引用：删掉它，旧凭证保持原样可用。
            await this.secrets.delete(secretRef).catch(() => false);
            throw error;
        }
        if (existing?.secretRef && existing.secretRef !== secretRef) {
            // 旧凭证字节已无人引用；删除失败只留一个不可达的文件，不影响入口行为。
            const deleted = await this.secrets.delete(existing.secretRef).catch(() => false);
            if (!deleted) {
                this.logger?.warn("collection_plan.webhook.secret_orphaned", {
                    planId: plan.id,
                    secretRef: existing.secretRef,
                });
            }
        }
        return { planId: plan.id, entryPath: collectionPlanWebhookEntryPath(token), credential };
    }

    /** 撤销入口（幂等）：先删行让入口立刻不可解析，再删凭证字节。 */
    async revokeCollectionPlanWebhookEntry(planId: string): Promise<CollectionPlanSnapshot> {
        const plan = await this.prisma.collectionPlan.findFirst({
            where: { id: planId, source: { deletedAt: null } },
            include: { triggerBindings: true },
        });
        if (!plan) throw new CollectionPlanNotFoundError(planId);
        const existing = plan.triggerBindings.find((binding) => binding.kind === "webhook") ?? null;
        if (existing) {
            await this.prisma.triggerBinding.delete({ where: { id: existing.id } });
            if (existing.secretRef) {
                const deleted = await this.secrets.delete(existing.secretRef).catch(() => false);
                if (!deleted) {
                    this.logger?.warn("collection_plan.webhook.secret_orphaned", {
                        planId: plan.id,
                        secretRef: existing.secretRef,
                    });
                }
            }
        }
        const snapshot = await this.getCollectionPlan(planId);
        if (!snapshot) throw new CollectionPlanNotFoundError(planId);
        return snapshot;
    }

    /** 按入口标识解析目标（ADR-0024）：凭证明文不出仓储，这里只回答计划与启用状态。 */
    async resolveCollectionPlanWebhookEntry(token: string): Promise<CollectionPlanWebhookEntryTarget | null> {
        const trimmed = token.trim();
        if (!trimmed) return null;
        const binding = await this.prisma.triggerBinding.findFirst({
            where: { webhookToken: trimmed, kind: "webhook" },
            include: { plan: { include: { source: { select: { deletedAt: true } } } } },
        });
        // 墓碑来源的计划等同不存在（AUT-001）：已删除的来源不该还能被入口触发。
        if (!binding?.plan || binding.plan.source.deletedAt !== null) return null;
        return {
            planId: binding.plan.id,
            sourceId: binding.plan.sourceId,
            bindingId: binding.id,
            secretRef: binding.secretRef,
            planEnabled: binding.plan.enabled,
            bindingEnabled: binding.enabled,
        };
    }

    /**
     * 校验入口凭证（ADR-0024）：常量时间比较，只回答对与不对。两侧都先取等长摘要，
     * 免得长度差异既影响耗时又暴露「猜对了几位」。
     */
    async verifyCollectionPlanWebhookCredential(secretRef: string, credential: string): Promise<boolean> {
        const stored = await this.secrets.read(secretRef);
        if (stored === null) return false;
        const expected = createHash("sha256").update(stored, "utf8").digest();
        const provided = createHash("sha256").update(credential, "utf8").digest();
        return timingSafeEqual(expected, provided);
    }

    async createConnection(input: CreateConnectionCommand): Promise<ConnectionInstance> {
        const connection = await this.prisma.$transaction(async (tx) => {
            if (input.modelId !== undefined) {
                await assertSelectableModel(tx, input.modelId);
            }
            return tx.connectionInstance.create({
                data: {
                    name: input.name,
                    connectorId: input.connectorId,
                    account: input.account ?? null,
                    scopeJson: input.scopeJson ?? null,
                    configJson: input.configJson ?? null,
                    secretRef: input.secretRef ?? null,
                    modelId: input.modelId ?? null,
                },
            });
        });
        return this.toConnectionSnapshot(connection);
    }

    async listConnections(): Promise<readonly ConnectionInstance[]> {
        const connections = await this.prisma.connectionInstance.findMany({
            // 倒序（Task 37）：新建的连接排在列表最前，用户建完立刻能在顶部看到它，
            // 不必在长列表里找。`id` 作次键让同一毫秒创建的连接有稳定顺序。
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        return connections.map((connection) => this.toConnectionSnapshot(connection));
    }

    async getConnection(connectionId: string): Promise<ConnectionInstance | null> {
        const connection = await this.prisma.connectionInstance.findUnique({
            where: { id: connectionId },
        });
        return connection ? this.toConnectionSnapshot(connection) : null;
    }

    async updateConnection(connectionId: string, input: UpdateConnectionCommand): Promise<ConnectionInstance> {
        const updated = await this.prisma.$transaction(async (tx) => {
            const current = await tx.connectionInstance.findUnique({ where: { id: connectionId } });
            if (!current) throw new ConnectionNotFoundError(connectionId);
            const write = resolveModelConnectionWrite(this.toConnectionSnapshot(current), input);
            if (write.selectionChanged && write.modelId !== null) {
                await assertSelectableModel(tx, write.modelId);
            }
            // 版本是所有连接的写入序号，不只是模型连接的：通用更新也递增，读到的版本才能
            // 当作「我这份快照有多旧」。CAS 用 version 条件，count 为 0 就是被别人改过。
            const result = await tx.connectionInstance.updateMany({
                where: { id: connectionId, version: current.version },
                data: {
                    ...(write.name !== undefined ? { name: write.name } : {}),
                    ...(write.status !== undefined ? { status: write.status } : {}),
                    ...(input.configJson !== undefined ? { configJson: input.configJson } : {}),
                    ...(input.secretRef !== undefined ? { secretRef: input.secretRef } : {}),
                    ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
                    ...(write.modelId !== current.modelId ? { modelId: write.modelId } : {}),
                    version: { increment: 1 },
                },
            });
            if (result.count === 0) {
                throw new ConnectionVersionConflictError(connectionId, input.expectedVersion ?? current.version);
            }
            const fresh = await tx.connectionInstance.findUnique({ where: { id: connectionId } });
            if (!fresh) throw new ConnectionNotFoundError(connectionId);
            return fresh;
        });
        return this.toConnectionSnapshot(updated);
    }

    /**
     * 记录一次登录探测的结果（Proposal connection-login-lifecycle-v1 决定 2）。这是**系统观测**
     * 而不是用户编辑，所以状态、账号、失效原因与检查时间一次写入；`lastCheckedAt` 只在探测
     * 跑过之后才更新，公开的更新命令碰不到它。
     */
    async recordConnectionProbe(
        connectionId: string,
        result: {
            status: ConnectionStatus;
            account: string | null;
            lastError: string | null;
            checkedAt: string;
        },
    ): Promise<ConnectionInstance> {
        const current = await this.prisma.connectionInstance.findUnique({
            where: { id: connectionId },
            select: { id: true },
        });
        if (!current) throw new ConnectionNotFoundError(connectionId);
        const updated = await this.prisma.connectionInstance.update({
            where: { id: connectionId },
            data: {
                status: result.status,
                account: result.account,
                lastError: result.lastError,
                lastCheckedAt: new Date(result.checkedAt),
            },
        });
        return this.toConnectionSnapshot(updated);
    }

    /**
     * 删除 Connection（AUT-001 的「删除凭据」）：来源回退 `connectionId: null`、连接行删除，
     * 并在同一动作里删除 SecretStore 中该 `secretRef` 的密钥字节。
     *
     * 顺序是「先删行、后删密钥」：行删掉后这次删除就已经完成，密钥字节残留只是可清理的垃圾；
     * 反过来先删密钥、行删失败会留下一个指向空密钥的活连接，反而更难发现。密钥删除失败只记
     * warn、不让删除失败（重试删除是幂等的）。
     */
    async deleteConnection(connectionId: string): Promise<boolean> {
        const connection = await this.prisma.connectionInstance.findUnique({
            where: { id: connectionId },
            select: { secretRef: true },
        });
        await this.prisma.$transaction(async (tx) => {
            await tx.sourceInstance.updateMany({
                where: { connectionId },
                data: { connectionId: null },
            });
            await tx.connectionInstance.delete({ where: { id: connectionId } });
        });
        const secretRef = connection?.secretRef;
        if (secretRef) {
            try {
                await this.secrets.delete(secretRef);
            } catch (error) {
                this.logger?.warn("connection.secret.delete_failed", {
                    connectionId,
                    secretRef,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return true;
    }

    /**
     * 删除来源（AUT-001）：墓碑 + 移除调度绑定，已录入的 Entry/Observation/Revision 全部保留
     * （Entry.sourceInstanceId 是必填级联外键，硬删会带走历史，所以来源行留下）。
     *
     * 不建命令表：删除天然幂等——重复调用返回同一份墓碑快照、不重复写事件；CAS 只拦
     * 「拿旧 revision 去删一个已经被改过的来源」。actor/reason 进 DomainEvent 保留审计（ORG-010）。
     */
    async deleteSource(input: {
        sourceId: string;
        baseRevisionId: string;
        idempotencyKey: string;
        actor: string | null;
        reason: string | null;
    }): Promise<SourceSnapshot> {
        const expectedRevision = parseSourceRevisionId(input.sourceId, input.baseRevisionId);
        const current = await this.prisma.sourceInstance.findUnique({ where: { id: input.sourceId } });
        if (!current) throw new SourceNotFoundError(input.sourceId);
        if (current.deletedAt) {
            return this.toSourceSnapshot(current);
        }
        if (current.revision !== expectedRevision) {
            throw new SourceRevisionConflictError(input.sourceId);
        }
        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.sourceInstance.updateMany({
                where: { id: input.sourceId, revision: expectedRevision, deletedAt: null },
                data: { deletedAt: new Date(), revision: expectedRevision + 1 },
            });
            if (updated.count !== 1) throw new SourceRevisionConflictError(input.sourceId);
            // 启用状态归计划（ADR-0023 决策 2）：墓碑来源的计划必须一起停用，否则
            // 计划读投影会把一个已删除的来源显示成「已启用」（回填用的是同一约定）。
            await tx.collectionPlan.updateMany({
                where: { sourceId: input.sourceId },
                data: { enabled: false },
            });
            await tx.triggerBinding.deleteMany({ where: { sourceId: input.sourceId } });
            await appendDomainEvent(tx, {
                type: "source.deleted.v1",
                aggregateType: "SourceInstance",
                aggregateId: input.sourceId,
                idempotencyKey: input.idempotencyKey,
                payload: {
                    sourceId: input.sourceId,
                    baseRevisionId: input.baseRevisionId,
                    actor: input.actor,
                    reason: input.reason,
                },
            });
        });
        return this.toSourceSnapshot(
            await this.prisma.sourceInstance.findUniqueOrThrow({ where: { id: input.sourceId } }),
        );
    }

    async listScheduleTriggers(): Promise<readonly {
        planId: string;
        sourceId: string;
        intervalMs: number;
        lastRunAt: string | null;
    }[]> {
        // 调度单位是采集计划（ADR-0023）：绑定与启用状态都挂在计划上，来源只决定
        // 「这个目标还在不在」（墓碑来源不调度）。计划与目标 v1 一对一。
        const plans = await this.prisma.collectionPlan.findMany({
            where: { enabled: true, source: { deletedAt: null } },
            include: {
                triggerBindings: true,
                source: { select: { id: true } },
            },
        });
        const result: { planId: string; sourceId: string; intervalMs: number; lastRunAt: string | null }[] = [];
        for (const plan of plans) {
            // 计划可以持有多种触发器（ADR-0025）：调度只认 schedule 那一行，
            // webhook 等其它触发方式不参与轮询。
            const binding = plan.triggerBindings.find((row) => row.kind === "schedule");
            if (!binding || !binding.enabled) continue;
            const config = JSON.parse(binding.configJson) as { intervalMs?: number };
            if (typeof config.intervalMs !== "number") continue;
            const latest = await this.prisma.workflowRun.findFirst({
                where: { planId: plan.id },
                orderBy: { createdAt: "desc" },
                select: { finishedAt: true, createdAt: true },
            });
            result.push({
                planId: plan.id,
                sourceId: plan.source.id,
                intervalMs: config.intervalMs,
                lastRunAt: latest ? (latest.finishedAt ?? latest.createdAt).toISOString() : null,
            });
        }
        return result;
    }

    async getStorageStats(): Promise<StorageStats> {
        const databaseBytes = await fileSize(this.roots.databasePath);
        const blob = await directorySize(this.roots.blobRoot);
        const artifact = await directorySize(this.roots.artifactRoot);
        const cache = await directorySize(this.roots.cacheRoot);
        const log = await directorySize(this.roots.logRoot);
        const secret = await directorySize(this.roots.secretRoot);

        const cleanable = await this.prisma.asset.aggregate({
            _sum: { byteSize: true },
            where: { status: "saved" },
        });
        const cleanableBytes = cleanable._sum.byteSize ?? 0;

        return {
            databaseBytes,
            blobBytes: blob.bytes,
            blobFileCount: blob.fileCount,
            artifactBytes: artifact.bytes,
            cacheBytes: cache.bytes,
            logBytes: log.bytes,
            secretBytes: secret.bytes,
            categories: {
                raw: blob.bytes + databaseBytes,
                user: databaseBytes,
                rebuildable: cache.bytes + log.bytes,
                cleanable: cleanableBytes,
            },
            snapshotAt: new Date().toISOString(),
        };
    }

    async listBackups(): Promise<readonly BackupSnapshot[]> {
        const dir = join(this.roots.dataRoot, "backups");
        let entries: string[] = [];
        try {
            entries = await readdir(dir);
        } catch {
            return [];
        }
        const snapshots: BackupSnapshot[] = [];
        for (const name of entries) {
            if (!name.endsWith(".sqlite")) continue;
            const info = await stat(join(dir, name)).catch(() => null);
            if (!info || !info.isFile()) continue;
            snapshots.push({
                id: name,
                name,
                byteSize: info.size,
                createdAt: info.birthtime.toISOString(),
            });
        }
        return snapshots.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    async createBackup(): Promise<BackupSnapshot> {
        const now = new Date();
        const name = `backup-${now.toISOString().replaceAll(":", "-").replaceAll(".", "-")}.sqlite`;
        const dir = join(this.roots.dataRoot, "backups");
        await mkdir(dir, { recursive: true });
        const target = join(dir, name);
        await this.prisma.$executeRawUnsafe(`VACUUM INTO '${target.replaceAll("\\", "/")}'`);
        const info = await stat(target);
        return {
            id: name,
            name,
            byteSize: info.size,
            createdAt: info.birthtime.toISOString(),
        };
    }

    async restoreBackup(backupId: string): Promise<void> {
        const dir = join(this.roots.dataRoot, "backups");
        const source = join(dir, backupId);
        const sourceInfo = await stat(source).catch(() => null);
        if (!sourceInfo || !sourceInfo.isFile()) {
            throw new Error(`Backup not found: ${backupId}`);
        }
        // Protect the current state before overwriting it.
        const now = new Date();
        const preRestore = join(dir, `pre-restore-${now.toISOString().replaceAll(":", "-").replaceAll(".", "-")}.sqlite`);
        await this.prisma.$executeRawUnsafe(`VACUUM INTO '${preRestore.replaceAll("\\", "/")}'`);
        await copyFile(source, this.roots.databasePath);
    }

}

/** `listCollectionPlans`／`getCollectionPlan` 的行形状：触发器行、目标 revision 一起取。 */
type CollectionPlanRow = Prisma.CollectionPlanGetPayload<{
    include: { triggerBindings: true; source: { select: { revision: true } } };
}>;

function toCollectionPlanSnapshot(
    plan: Prisma.CollectionPlanGetPayload<{}>,
    bindings: readonly Prisma.TriggerBindingGetPayload<{}>[],
    sourceRevision: number,
    latest: { at: Date; error: string | null } | null,
): CollectionPlanSnapshot {
    // 一个计划可以持有多种触发器（ADR-0025）：调度间隔只由 schedule 行派生，
    // 其它类型的行不参与这个字段。
    const scheduleBinding = bindings.find((binding) => binding.kind === "schedule") ?? null;
    const interval = scheduleBinding === null
        ? undefined
        : (JSON.parse(scheduleBinding.configJson) as { intervalMs?: unknown }).intervalMs;
    // 入口地址由不可猜的标识拼出；凭证明文不在这条读路径上，只回答「配没配」。
    const webhookBinding = bindings.find((binding) => binding.kind === "webhook") ?? null;
    const webhook = webhookBinding === null || webhookBinding.webhookToken === null
        ? null
        : {
            entryPath: collectionPlanWebhookEntryPath(webhookBinding.webhookToken),
            credentialConfigured: webhookBinding.secretRef !== null,
        };
    return {
        id: plan.id,
        name: plan.name,
        sourceId: plan.sourceId,
        sourceRevisionId: `${plan.sourceId}:${sourceRevision}`,
        connectionId: plan.connectionId,
        mediaPolicy: plan.mediaPolicyJson === null
            ? null
            : JSON.parse(plan.mediaPolicyJson) as SourceMediaPolicy,
        overlapPolicy: plan.overlapPolicy as CollectionPlanSnapshot["overlapPolicy"],
        enabled: plan.enabled,
        // CAS 的 baseRevisionId 必须是 `<planId>:<revision>`（parsePlanRevisionId 的形状）；
        // 只回数字会让客户端拿到一个自己送不回来的 revisionId。
        revisionId: `${plan.id}:${plan.revision}`,
        scheduleIntervalMs: typeof interval === "number" ? interval : null,
        webhook,
        lastRunAt: latest?.at.toISOString() ?? null,
        lastError: latest?.error ?? null,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
    };
}

/**
 * 模型连接只能引用「还能用」的模型：模型行存在，且它所属 Provider 不在删除流程里
 * （Proposal connection-credential-entry-v1 的删除规则要求先解除引用才允许删 Provider）。
 *
 * 判定与写入必须同一个事务：分两次读会让「校验通过」与「真的写进去」之间出现一个
 * Provider 刚开始删除的窗口。
 */
async function assertSelectableModel(
    tx: Prisma.TransactionClient,
    modelId: string,
): Promise<void> {
    const model = await tx.configuredModel.findUnique({
        where: { id: modelId },
        select: { id: true, provider: { select: { state: true } } },
    });
    if (!model) {
        throw new InvalidModelSelectionError(`Configured model not found: ${modelId}`);
    }
    if (model.provider.state !== "active") {
        throw new InvalidModelSelectionError(`Configured model is not selectable: ${modelId}`);
    }
}
