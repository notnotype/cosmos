import { mkdir, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

import { PrismaSystemConfigRepository } from "./system-config.js";

const migrationUrl = new URL(
    "../prisma/migrations/20261106085039_task_41_connection_agent_separation/migration.sql",
    import.meta.url,
);

const repositoryRoot = resolve(process.cwd());
const temporaryParent = join(repositoryRoot, ".agent", "tmp", "task42-story-agent-timeout");

let prisma: PrismaClient;
let repository: PrismaSystemConfigRepository;
let temporaryRoot: string | undefined;

beforeEach(async () => {
    temporaryRoot = join(temporaryParent, randomUUID());
    await mkdir(temporaryRoot, { recursive: true });
    prisma = new PrismaClient({
        datasources: { db: { url: `file:${join(temporaryRoot, "test.sqlite").replaceAll("\\", "/")}` } },
    });

    // 直接使用真实迁移中的建表语句，避免复制 DDL 后与迁移漂移。
    const priorMigration = await readFile(migrationUrl, "utf8");
    const originalTable = priorMigration.match(/^CREATE TABLE "SystemConfig" \([\s\S]*?^\);/m)?.[0];
    if (originalTable === undefined) throw new Error("SystemConfig CREATE TABLE statement is missing from the Task 41 migration.");
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    await prisma.$executeRawUnsafe(originalTable);
    const timeoutMigration = await readFile(new URL("../prisma/migrations/20261112090000_task_42_story_agent_timeout/migration.sql", import.meta.url), "utf8");
    await prisma.$executeRawUnsafe(timeoutMigration);
    repository = new PrismaSystemConfigRepository(prisma);
});

afterEach(async () => {
    try {
        await prisma.$disconnect();
    } finally {
        if (temporaryRoot !== undefined) {
            const root = resolve(temporaryRoot);
            if (!root.startsWith(`${temporaryParent}${process.platform === "win32" ? "\\" : "/"}`)) {
                throw new Error("SystemConfig fixture cleanup rejected a non-owned temporary directory.");
            }
            await rm(root, { recursive: true, force: true });
            temporaryRoot = undefined;
        }
    }
});

describe("PrismaSystemConfigRepository", () => {
    test("migration preserves the existing singleton and adds the default timeout", async () => {
        const root = join(temporaryParent, randomUUID());
        await mkdir(root, { recursive: true });
        const migrationPrisma = new PrismaClient({
            datasources: { db: { url: `file:${join(root, "migration.sqlite").replaceAll("\\", "/")}` } },
        });
        try {
            const priorMigration = await readFile(migrationUrl, "utf8");
            const originalTable = priorMigration.match(/^CREATE TABLE "SystemConfig" \([\s\S]*?^\);/m)?.[0];
            if (originalTable === undefined) throw new Error("SystemConfig CREATE TABLE statement is missing from the Task 41 migration.");
            await migrationPrisma.$executeRawUnsafe(originalTable);
            await migrationPrisma.$executeRawUnsafe(
                'INSERT INTO "SystemConfig" ("id", "defaultModelId", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)',
                "singleton", "retained-model", "2026-01-02T03:04:05.000Z", "2026-02-03T04:05:06.000Z",
            );
            const timeoutMigration = await readFile(new URL("../prisma/migrations/20261112090000_task_42_story_agent_timeout/migration.sql", import.meta.url), "utf8");
            await migrationPrisma.$executeRawUnsafe(timeoutMigration);
            const rows = await migrationPrisma.$queryRawUnsafe<Array<{
                id: string; defaultModelId: string | null; storyAgentTimeoutSeconds: number; createdAt: string; updatedAt: string;
            }>>('SELECT "id", "defaultModelId", "storyAgentTimeoutSeconds", "createdAt", "updatedAt" FROM "SystemConfig"');
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ id: "singleton", defaultModelId: "retained-model", storyAgentTimeoutSeconds: 300 });
            expect(new Date(rows[0]!.createdAt).toISOString()).toBe("2026-01-02T03:04:05.000Z");
            expect(new Date(rows[0]!.updatedAt).toISOString()).toBe("2026-02-03T04:05:06.000Z");
        } finally {
            await migrationPrisma.$disconnect();
            const resolvedRoot = resolve(root);
            if (!resolvedRoot.startsWith(`${temporaryParent}${process.platform === "win32" ? "\\" : "/"}`)) {
                throw new Error("Migration fixture cleanup rejected a non-owned temporary directory.");
            }
            await rm(resolvedRoot, { recursive: true, force: true });
        }
    });

    test("reads an absent configuration without creating the singleton", async () => {
        expect(await repository.getSystemConfigWithModel()).toEqual({ defaultModelId: null, defaultModel: null, storyAgentTimeoutSeconds: 300 });
        expect(await repository.getStoryAgentTimeoutSeconds()).toBe(300);
        expect(await prisma.systemConfig.count()).toBe(0);
    });

    test("updates timeout independently from the default model", async () => {
        await repository.setDefaultModelId("model-a");
        await repository.updateConfig({ storyAgentTimeoutSeconds: 900 }, () => {});
        expect(await prisma.systemConfig.findUniqueOrThrow({ where: { id: "singleton" } }))
            .toMatchObject({ defaultModelId: "model-a", storyAgentTimeoutSeconds: 900 });
        await repository.setDefaultModelId("model-b");
        expect(await repository.getStoryAgentTimeoutSeconds()).toBe(900);
    });
    test("concurrent first writes keep exactly one singleton and a complete winning value", async () => {
        const values = ["model-a", "model-b", null, "model-c"];
        await Promise.all(values.map((value) => repository.setDefaultModelId(value)));
        const rows = await prisma.systemConfig.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.id).toBe("singleton");
        expect(values).toContain(rows[0]?.defaultModelId);
    });

    test("returns null initially and automatically creates the singleton on read", async () => {
        expect(await prisma.systemConfig.count()).toBe(0);

        expect(await repository.getDefaultModelId()).toBeNull();

        expect(await prisma.systemConfig.findMany()).toEqual([
            expect.objectContaining({ id: "singleton", defaultModelId: null }),
        ]);
    });

    test("persists the default model and reads it through another repository instance", async () => {
        await repository.ensureSingleton();

        await repository.setDefaultModelId("model-a");

        expect(await prisma.systemConfig.findUniqueOrThrow({ where: { id: "singleton" } }))
            .toMatchObject({ defaultModelId: "model-a" });
        const anotherRepository = new PrismaSystemConfigRepository(prisma);
        expect(await anotherRepository.getDefaultModelId()).toBe("model-a");
    });

    test("replaces an existing default model", async () => {
        await repository.setDefaultModelId("model-a");

        await repository.setDefaultModelId("model-b");

        expect(await repository.getDefaultModelId()).toBe("model-b");
        expect(await prisma.systemConfig.count()).toBe(1);
    });

    test("clears the stored default model with null without deleting the singleton", async () => {
        await repository.setDefaultModelId("model-a");

        await repository.setDefaultModelId(null);

        expect(await repository.getDefaultModelId()).toBeNull();
        expect(await prisma.systemConfig.findMany()).toEqual([
            expect.objectContaining({ id: "singleton", defaultModelId: null }),
        ]);
    });

    test("ensureSingleton creates the singleton with a null default model", async () => {
        expect(await prisma.systemConfig.count()).toBe(0);

        await repository.ensureSingleton();

        expect(await prisma.systemConfig.findMany()).toEqual([
            expect.objectContaining({ id: "singleton", defaultModelId: null }),
        ]);
    });

    test("ensureSingleton is idempotent and keeps exactly one row", async () => {
        await repository.ensureSingleton();
        await repository.ensureSingleton();
        await repository.ensureSingleton();

        expect(await prisma.systemConfig.count()).toBe(1);
        expect(await prisma.systemConfig.findUniqueOrThrow({ where: { id: "singleton" } }))
            .toMatchObject({ defaultModelId: null });
    });

    test("ensureSingleton preserves an already stored default model", async () => {
        await prisma.systemConfig.create({
            data: { id: "singleton", defaultModelId: "model-existing" },
        });

        await repository.ensureSingleton();
        await repository.ensureSingleton();

        expect(await prisma.systemConfig.findMany()).toEqual([
            expect.objectContaining({ id: "singleton", defaultModelId: "model-existing" }),
        ]);
    });

    test("automatically creates the singleton before writing a default model", async () => {
        expect(await prisma.systemConfig.count()).toBe(0);

        await repository.setDefaultModelId("model-a");

        expect(await prisma.systemConfig.findMany()).toEqual([
            expect.objectContaining({ id: "singleton", defaultModelId: "model-a" }),
        ]);
    });

    test("automatically creates the singleton when the first write is null", async () => {
        expect(await prisma.systemConfig.count()).toBe(0);

        await repository.setDefaultModelId(null);

        expect(await prisma.systemConfig.findMany()).toEqual([
            expect.objectContaining({ id: "singleton", defaultModelId: null }),
        ]);
    });

    test("repeated reads preserve the stored model and timestamps", async () => {
        // 固定历史时间可确定性地发现读取触发更新，无需 sleep 或替换 Prisma 的真实时钟。
        const existing = await prisma.systemConfig.create({
            data: {
                id: "singleton",
                defaultModelId: "model-existing",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-02T00:00:00.000Z"),
            },
        });

        expect(await repository.getDefaultModelId()).toBe("model-existing");
        expect(await repository.getDefaultModelId()).toBe("model-existing");

        expect(await prisma.systemConfig.findUniqueOrThrow({ where: { id: "singleton" } }))
            .toEqual(existing);
        expect(await prisma.systemConfig.count()).toBe(1);
    });
});
