import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

import { PrismaSystemConfigRepository } from "./system-config.js";

const migrationUrl = new URL(
    "../prisma/migrations/20261106085039_task_41_connection_agent_separation/migration.sql",
    import.meta.url,
);

let prisma: PrismaClient;
let repository: PrismaSystemConfigRepository;
let temporaryRoot: string | undefined;

beforeEach(async () => {
    // Windows native Prisma 会把 :memory: 当文件路径；每例独占临时库，结束后清理。
    temporaryRoot = await mkdtemp(join(tmpdir(), "cosmos-system-config-"));
    prisma = new PrismaClient({
        datasources: { db: { url: `file:${join(temporaryRoot, "test.sqlite").replaceAll("\\", "/")}` } },
    });

    // 直接使用真实迁移中的建表语句，避免复制 DDL 后与迁移漂移。
    const migrationSql = await readFile(migrationUrl, "utf8");
    const createTableSql = migrationSql.match(/^CREATE TABLE "SystemConfig" \([\s\S]*?^\);/m)?.[0];
    if (createTableSql === undefined) {
        throw new Error("SystemConfig CREATE TABLE statement is missing from the Task 41 migration.");
    }
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    await prisma.$executeRawUnsafe(createTableSql);
    repository = new PrismaSystemConfigRepository(prisma);
});

afterEach(async () => {
    try {
        await prisma.$disconnect();
    } finally {
        if (temporaryRoot !== undefined) {
            const root = resolve(temporaryRoot);
            if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cosmos-system-config-")) {
                throw new Error("SystemConfig fixture cleanup rejected a non-owned temporary directory.");
            }
            await rm(root, { recursive: true, force: true });
            temporaryRoot = undefined;
        }
    }
});

describe("PrismaSystemConfigRepository", () => {
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
