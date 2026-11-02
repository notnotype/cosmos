import { expect, it } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createFixtureSource, withRepository } from "./index.fixtures.js";

/** 观测到的 SQL 事件：`params` 是 Prisma 序列化后的参数串，用它判断查询有没有设行数上限。 */
type QueryEventRecord = { query: string; params: string };

/**
 * 来源列表的批量投影（T04 list-sources 切片）。
 *
 * `listSources()` 原本逐来源查 legacy Run、WorkflowRun 与 collectionPlan，SQLite 下
 * `include: { triggerBindings }` 还会再拆一条查询，实测每个来源 4 次、合计 1 + 4N。
 * 「查询次数常数」只解决了一半：若每次仍把每个来源的全部历史运行读回来再挑最新一条，
 * 行数会随历史长度线性增长，等于把债务换个维度。因此查询次数与行数上界各自钉一条断言。
 */
function watchQueries(prisma: PrismaClient): {
    events: readonly QueryEventRecord[];
    reset: () => void;
} {
    const events: QueryEventRecord[] = [];
    // `$on("query")` 的重载由客户端构造参数里的 log 推出，夹具按普适的 PrismaClient
    // 交出来时拿不到那个字面量；相关用例在第三参打开了 query 事件，故按该事实收窄一次。
    const client: PrismaClient<Prisma.PrismaClientOptions, "query"> = prisma as PrismaClient<
        Prisma.PrismaClientOptions,
        "query"
    >;
    client.$on("query", (event) => {
        events.push({ query: event.query, params: event.params });
    });
    return {
        events,
        reset: () => {
            events.length = 0;
        },
    };
}

function countQueries(prisma: PrismaClient): {
    measure: (operation: () => Promise<unknown>) => Promise<number>;
} {
    const watcher = watchQueries(prisma);
    return {
        async measure(operation) {
            watcher.reset();
            await operation();
            return watcher.events.length;
        },
    };
}

/** 只留下读两张运行表的查询；Prisma 生成的 SQL 带反引号与 `main.` 前缀，这里统一归一化。 */
function readRunHistoryQueries(events: readonly QueryEventRecord[]): readonly QueryEventRecord[] {
    return events.filter((event) => /FROM\s+(?:main\.)?["`]?(?:WorkflowRun|Run)["`]?\b/.test(
        event.query.replace(/[`"]/g, ""),
    ));
}

/**
 * Prisma 把「不设上限」编码成 `LIMIT ?` 加参数 -1。命中它意味着这些历史行会被整批读回内存，
 * 只为每组留一条——行数上界于是取决于历史长度，而不是来源数。
 */
function readsUnboundedRunRows(events: readonly QueryEventRecord[]): readonly QueryEventRecord[] {
    return events.filter((event) => /(?:^|[[,\s])-1\b/.test(event.params));
}

it("lists sources with a query count that does not grow with the number of sources", async () => {
    await withRepository("source-list-projection-queries", async (repository, prisma) => {
        const counter = countQueries(prisma);
        await createFixtureSource(repository, { name: "第一个来源", config: {} });
        const single = await counter.measure(() => repository.listSources());

        for (const name of ["第二个", "第三个", "第四个", "第五个"]) {
            await createFixtureSource(repository, { name, config: {} });
        }
        const many = await counter.measure(() => repository.listSources());

        // 结论：查询次数只与读的表有关，与来源数无关。
        expect(many).toBe(single);
        // 上界把「批发」钉死：来源表、Run、WorkflowRun、计划各至多一批（Prisma 可能把
        // include 的反向关系拆成额外一条），5 个来源不该出现逐来源的 3 次查询。
        expect(many).toBeLessThanOrEqual(6);
        expect(single).toBeGreaterThanOrEqual(1);
    }, { clientOptions: { log: [{ emit: "event", level: "query" }] } });
});

it("bounds the run rows it reads by the number of sources, not by their history", async () => {
    await withRepository("source-list-projection-row-bound", async (repository, prisma) => {
        const watcher = watchQueries(prisma);
        // 两个来源的历史长度与时间带都不对称：只取「全局最新 N 行」的假批量会让历史短但
        // 更近的来源独占结果，长历史的来源反而丢掉最新一条。行数有界必须真的按来源分组。
        const sources: Array<{ id: string; name: string; historyLength: number; month: number }> = [
            { id: (await createFixtureSource(repository, { name: "历史很长的来源 A", config: {} })).id, name: "A", historyLength: 40, month: 2 },
            { id: (await createFixtureSource(repository, { name: "历史很短的来源 B", config: {} })).id, name: "B", historyLength: 3, month: 3 },
        ];
        for (const source of sources) {
            for (let index = 0; index < source.historyLength; index += 1) {
                const createdAt = new Date(Date.UTC(2026, source.month, 1, 0, index));
                await prisma.run.create({
                    data: {
                        sourceInstanceId: source.id,
                        triggerKind: "manual",
                        status: "failed",
                        createdAt,
                        errorMessage: `legacy-${source.name}-${index}`,
                    },
                });
                await prisma.workflowRun.create({
                    data: {
                        id: `bounded-${source.id}-${index}`,
                        stateJson: "{}",
                        status: "failed",
                        sourceInstanceId: source.id,
                        errorMessage: `workflow-${source.name}-${index}`,
                        definitionKey: "cosmos.ingest",
                        definitionVersion: "1",
                        manifestHash: "builtin:cosmos.ingest@1",
                        createdAt,
                        updatedAt: createdAt,
                    },
                });
            }
        }

        watcher.reset();
        const listed = await repository.listSources();
        const historyQueries = readRunHistoryQueries(watcher.events);
        // 每张运行表一次查询，且都不允许把历史整批读回来。
        expect(historyQueries).toHaveLength(2);
        expect(readsUnboundedRunRows(historyQueries)).toEqual([]);
        expect(watcher.events.length).toBeLessThanOrEqual(6);
        // 行数有界不能靠丢行换：每个来源各自最新的一条仍要被选中（并列时 legacy 胜）。
        for (const source of sources) {
            const snapshot = listed.find((candidate) => candidate.id === source.id)!;
            expect(snapshot.lastError).toBe(`legacy-${source.name}-${source.historyLength - 1}`);
            expect(snapshot.lastRunAt).toBe(new Date(Date.UTC(2026, source.month, 1, 0, source.historyLength - 1)).toISOString());
        }
    }, { clientOptions: { log: [{ emit: "event", level: "query" }] } });
});

it("projects every listed source exactly like the single-source read", async () => {
    await withRepository("source-list-projection-fields", async (repository, prisma) => {
        const connection = await prisma.connectionInstance.create({
            data: {
                name: "订阅连接",
                connectorId: "fixture-rss",
                account: "reader",
                configJson: JSON.stringify({ profile: "main" }),
            },
        });
        const withPlanFields = await createFixtureSource(repository, {
            name: "带连接与调度的来源",
            config: { fixturePath: "first.xml" },
            scheduleIntervalMs: 900_000,
        });
        const bare = await createFixtureSource(repository, { name: "只手动触发的来源", config: {} });
        // 连接与媒体预算归计划（ADR-0023 决策 2），只能经计划写入口落库。
        await repository.updateCollectionPlan(withPlanFields.planId, {
            baseRevisionId: withPlanFields.planRevisionId,
            connectionId: connection.id,
            mediaPolicy: { images: "download", maxFileBytes: 4 * 1024 * 1024 },
        });
        // createdAt 由数据库默认值生成，同毫秒会让顺序断言变成运气：显式拉开两者。
        await prisma.sourceInstance.update({
            where: { id: withPlanFields.id },
            data: { createdAt: new Date("2026-01-02T00:00:00.000Z") },
        });
        await prisma.sourceInstance.update({
            where: { id: bare.id },
            data: { createdAt: new Date("2026-01-03T00:00:00.000Z") },
        });

        const listed = await repository.listSources();
        // 顺序仍是 createdAt 升序。
        expect(listed.map((source) => source.id)).toEqual([withPlanFields.id, bare.id]);
        // 批量投影与单条读共用同一份映射：任何字段分叉都会在这里露出来。
        for (const snapshot of listed) {
            expect(snapshot).toEqual(await repository.getSource(snapshot.id));
        }
        const first = listed[0]!;
        expect(first.enabled).toBe(true);
        expect(first.connectionId).toBe(connection.id);
        expect(first.connection).toEqual({
            id: connection.id,
            connectorId: "fixture-rss",
            configJson: JSON.stringify({ profile: "main" }),
        });
        expect(first.mediaPolicy).toEqual({ images: "download", maxFileBytes: 4 * 1024 * 1024 });
        expect(first.scheduleIntervalMs).toBe(900_000);
        expect(first.revisionId).toBe(withPlanFields.revisionId);
        expect(first.planRevisionId).toMatch(new RegExp(`^${withPlanFields.planId}:\\d+$`));
        const second = listed[1]!;
        expect(second.connection).toBeNull();
        expect(second.scheduleIntervalMs).toBeNull();
    });
});

it("keeps tombstoned sources out of the list projection", async () => {
    await withRepository("source-list-projection-tombstone", async (repository, prisma) => {
        const kept = await createFixtureSource(repository, { name: "留下的来源", config: {} });
        const removed = await createFixtureSource(repository, { name: "被删除的来源", config: {} });
        // 反例先行：删除前必须在投影里，否则「删除后消失」是空断言。
        expect((await repository.listSources()).map((source) => source.id)).toEqual([kept.id, removed.id]);

        await repository.deleteSource({
            sourceId: removed.id,
            baseRevisionId: removed.revisionId,
            idempotencyKey: "list-projection-tombstone",
            actor: null,
            reason: null,
        });

        expect((await repository.listSources()).map((source) => source.id)).toEqual([kept.id]);
        // 计划行仍在库里（删除只停用它）：投影里消失靠的是墓碑过滤，不是删行。
        expect(await prisma.collectionPlan.findUnique({ where: { sourceId: removed.id } })).not.toBeNull();
    });
});

it("takes the newer run diagnostics across legacy Runs and Workflow Runs", async () => {
    await withRepository("source-list-projection-runs", async (repository, prisma) => {
        const earlier = new Date("2026-02-01T00:00:00.000Z");
        const later = new Date("2026-02-02T00:00:00.000Z");
        const legacyWins = await createFixtureSource(repository, { name: "legacy 更新", config: {} });
        const workflowWins = await createFixtureSource(repository, { name: "workflow 更新", config: {} });
        await prisma.run.create({
            data: {
                sourceInstanceId: legacyWins.id,
                triggerKind: "manual",
                status: "failed",
                createdAt: later,
                errorMessage: "legacy-failed",
            },
        });
        await prisma.workflowRun.create({
            data: {
                id: "workflow-diagnostics-older",
                stateJson: "{}",
                status: "failed",
                sourceInstanceId: legacyWins.id,
                errorMessage: "workflow-failed",
                definitionKey: "cosmos.ingest",
                definitionVersion: "1",
                manifestHash: "builtin:cosmos.ingest@1",
                createdAt: earlier,
                updatedAt: earlier,
            },
        });
        await prisma.run.create({
            data: {
                sourceInstanceId: workflowWins.id,
                triggerKind: "manual",
                status: "failed",
                createdAt: earlier,
                errorMessage: "legacy-failed",
            },
        });
        await prisma.workflowRun.create({
            data: {
                id: "workflow-diagnostics-newer",
                stateJson: "{}",
                status: "failed",
                sourceInstanceId: workflowWins.id,
                errorMessage: "workflow-failed",
                definitionKey: "cosmos.ingest",
                definitionVersion: "1",
                manifestHash: "builtin:cosmos.ingest@1",
                createdAt: later,
                finishedAt: later,
                updatedAt: later,
            },
        });

        const listed = await repository.listSources();
        const legacy = listed.find((source) => source.id === legacyWins.id)!;
        const workflow = listed.find((source) => source.id === workflowWins.id)!;
        expect(legacy.lastRunAt).toBe(later.toISOString());
        expect(legacy.lastError).toBe("legacy-failed");
        expect(workflow.lastRunAt).toBe(later.toISOString());
        expect(workflow.lastError).toBe("workflow-failed");
        // 仍与逐条读一致（诊断合并口径只有一份实现）。
        for (const snapshot of listed) {
            expect(snapshot).toEqual(await repository.getSource(snapshot.id));
        }
    });
});

it("fails the list projection when a source lost its collection plan", async () => {
    await withRepository("source-list-projection-missing-plan", async (repository, prisma) => {
        const source = await createFixtureSource(repository, { name: "没有计划的来源", config: {} });
        await prisma.collectionPlan.delete({ where: { sourceId: source.id } });

        // 计划是来源投影的必要输入：缺计划时既有路径是抛错，而不是投影一个半成品。
        await expect(repository.listSources()).rejects.toThrow(`Source has no collection plan: ${source.id}`);
        await expect(repository.getSource(source.id)).rejects.toThrow(`Source has no collection plan: ${source.id}`);
    });
});
