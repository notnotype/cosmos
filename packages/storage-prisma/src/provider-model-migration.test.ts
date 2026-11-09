import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { resolvePrismaCliPath } from "./prisma-cli.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = join(repositoryRoot, "packages/storage-prisma/prisma");
const migrationName = "20261015000000_provider_model_configuration";
/**
 * 本测试的「现状」快照包含到此为止的迁移。边界之后一旦出现新迁移就要重新审计——
 * 因为快照复制的是当前 schema.prisma，新迁移如果改了本测试断言的结构，断言会静默失真。
 */
const auditedThrough = "20261106085039_task_41_connection_agent_separation";
const temporaryParent = join(repositoryRoot, ".agent/tmp");
const timestamp = "2026-10-15T00:00:00.000Z";

async function snapshot(root: string, includeNew: boolean): Promise<string> {
    const destination = join(root, includeNew ? "current" : "legacy");
    const migrationsRoot = join(destination, "migrations");
    await mkdir(migrationsRoot, { recursive: true });
    await copyFile(join(source, "schema.prisma"), join(destination, "schema.prisma"));
    await copyFile(join(source, "migrations/migration_lock.toml"), join(migrationsRoot, "migration_lock.toml"));
    const entries = (await readdir(join(source, "migrations"), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    if (entries.some((name) => name > auditedThrough)) {
        throw new Error("Re-audit the migration boundary before including later migrations.");
    }
    const manifest: { path: string; sha256: string }[] = [];
    for (const name of entries.filter((entry) => includeNew || entry < migrationName)) {
        const relativePath = `migrations/${name}/migration.sql`;
        const bytes = await readFile(join(source, relativePath));
        await mkdir(join(migrationsRoot, name));
        await writeFile(join(destination, relativePath), bytes);
        manifest.push({ path: relativePath, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    await writeFile(join(destination, "manifest.json"), JSON.stringify(manifest, null, 2));
    return join(destination, "schema.prisma");
}

function deploy(root: string, schema: string, databaseUrl: string, label: string): void {
    if (!root.startsWith(`${temporaryParent}${sep}task39-provider-model-migration-`)
        || !schema.startsWith(`${root}${sep}`)
        || databaseUrl !== `file:${join(root, "cosmos.sqlite").replaceAll("\\", "/")}`) {
        throw new Error("Migration isolation guard rejected the target.");
    }
    const environment: NodeJS.ProcessEnv = {
        DATABASE_URL: databaseUrl,
        COSMOS_DATA_ROOT: root,
        HOME: root,
        USERPROFILE: root,
        TEMP: root,
        TMP: root,
        CHECKPOINT_DISABLE: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
    };
    for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"]) {
        if (process.env[key] !== undefined) environment[key] = process.env[key];
    }
    const log = openSync(join(root, `${label}.log`), "wx");
    try {
        const result = spawnSync(process.execPath,
            [resolvePrismaCliPath(), "migrate", "deploy", "--schema", schema],
            { cwd: root, env: environment, stdio: ["ignore", log, log], timeout: 60_000 });
        if (result.error || result.status !== 0) {
            throw new Error(`Isolated migration failed; inspect ${join(root, `${label}.log`)}`);
        }
    } finally {
        closeSync(log);
    }
}

async function seedProvider(client: PrismaClient, id: string): Promise<void> {
    await client.$executeRawUnsafe(`INSERT INTO "ModelProvider"
        (id,name,api,baseUrl,secretRef,updatedAt) VALUES (?,?,?,?,?,?)`,
    id, "Synthetic provider", "openai-completions", "https://provider.example/v1", `synthetic:${id}`, timestamp);
}

async function seedModel(client: PrismaClient, id: string, providerId: string, modelId: string): Promise<void> {
    await client.$executeRawUnsafe(`INSERT INTO "ConfiguredModel"
        (id,providerId,modelId,name,contextWindow,maxOutputTokens,updatedAt) VALUES (?,?,?,?,?,?,?)`,
    id, providerId, modelId, "Synthetic model", 8192, 64, timestamp);
}

async function verifyStructure(client: PrismaClient): Promise<void> {
    await seedProvider(client, "provider-a");
    await seedProvider(client, "provider-b");
    await expect(client.$executeRawUnsafe(`UPDATE "ModelProvider" SET secretRef='synthetic:provider-a'
        WHERE id='provider-b'`)).rejects.toThrow();
    await client.$executeRawUnsafe(`UPDATE "ModelProvider" SET secretRef=NULL`);
    await seedModel(client, "model-a", "provider-a", "namespace/model");
    await seedModel(client, "model-b", "provider-b", "namespace/model");
    await expect(seedModel(client, "duplicate", "provider-a", "namespace/model")).rejects.toThrow();
    await expect(seedModel(client, "orphan", "missing", "model")).rejects.toThrow();
    // Task 41 删除了 ConnectionInstance.modelId：连接不再直接引用模型，
    // 相关的"模型被连接引用则不可删除"约束已随列删除一起移除。
    // 仍然验证 Provider 有模型时无法删除（外键保护 ModelProvider ← ConfiguredModel）。
    await expect(client.$executeRawUnsafe(`DELETE FROM "ModelProvider" WHERE id='provider-a'`)).rejects.toThrow();
    expect(await client.$queryRawUnsafe(`SELECT name,version,state FROM "ModelProvider" WHERE id='provider-a'`))
        .toEqual([{ name: "Synthetic provider", version: 1, state: "active" }]);
    expect(await client.$queryRawUnsafe(`SELECT version FROM "ConfiguredModel" WHERE id='model-a'`))
        .toEqual([{ version: 1 }]);
    await client.$executeRawUnsafe(`INSERT INTO "ModelConfigurationOperation"
        (id,idempotencyKey,kind,providerId,newSecretRef,updatedAt)
        VALUES ('operation-a','request-a','create','provider-b','synthetic:new',?)`, timestamp);
    await expect(client.$executeRawUnsafe(`INSERT INTO "ModelConfigurationOperation"
        (id,idempotencyKey,kind,providerId,updatedAt)
        VALUES ('duplicate-operation','request-a','create','provider-b',?)`, timestamp)).rejects.toThrow();
    await expect(client.$executeRawUnsafe(`INSERT INTO "ModelConfigurationOperation"
        (id,idempotencyKey,kind,providerId,newSecretRef,updatedAt)
        VALUES ('duplicate-ref','request-b','create','provider-b','synthetic:new',?)`, timestamp)).rejects.toThrow();
    await client.$executeRawUnsafe(`UPDATE "ModelProvider" SET pendingOperationId='operation-a' WHERE id='provider-b'`);
    await expect(client.$executeRawUnsafe(`UPDATE "ModelProvider" SET pendingOperationId='operation-a'
        WHERE id='provider-a'`)).rejects.toThrow();
    await client.$executeRawUnsafe(`DELETE FROM "ConfiguredModel" WHERE id='model-b'`);
    await client.$executeRawUnsafe(`DELETE FROM "ModelProvider" WHERE id='provider-b'`);
    expect(await client.$queryRawUnsafe(`SELECT providerId,state,phase,generation FROM "ModelConfigurationOperation"
        WHERE id='operation-a'`)).toEqual([{ providerId: "provider-b", state: "pending", phase: "registered", generation: 1 }]);
    const columns = await client.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info('ModelConfigurationOperation')`);
    expect(columns.map((column) => column.name).sort()).toEqual([
        "id", "idempotencyKey", "kind", "providerId", "state", "phase", "generation", "expectedVersion",
        "resourceVersion", "newSecretRef", "oldSecretRef", "errorCode", "createdAt", "updatedAt",
    ].sort());
    expect(await client.$queryRawUnsafe(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(await client.$queryRawUnsafe(`PRAGMA integrity_check`)).toEqual([{ integrity_check: "ok" }]);
}

describe("Provider/model additive migration (retained isolated databases)", () => {
    it.each(["fresh", "legacy"] as const)("preserves constraints and data on %s", async (mode) => {
        const originalDatabaseUrl = process.env.DATABASE_URL;
        const originalDataRoot = process.env.COSMOS_DATA_ROOT;
        await mkdir(temporaryParent, { recursive: true });
        const root = await mkdtemp(join(temporaryParent, "task39-provider-model-migration-"));
        console.info(JSON.stringify({ mode, isolatedRoot: root, retained: true }));
        const databaseUrl = `file:${join(root, "cosmos.sqlite").replaceAll("\\", "/")}`;
        const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
        try {
            if (mode === "legacy") {
                deploy(root, await snapshot(root, false), databaseUrl, "legacy-deploy");
                await client.$executeRawUnsafe(`INSERT INTO "ConnectionInstance"
                    (id,name,connectorId,account,scopeJson,configJson,status,secretRef,lastError,lastCheckedAt,createdAt,updatedAt)
                    VALUES ('legacy','Legacy','synthetic.connector','account','{}','{}','revoked','synthetic:legacy','old',?,?,?)`,
                timestamp, timestamp, timestamp);
                expect(await client.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND name='ModelProvider'`))
                    .toEqual([]);
            }
            deploy(root, await snapshot(root, true), databaseUrl, "current-deploy");
            if (mode === "legacy") {
                expect(await client.$queryRawUnsafe(`SELECT id,name,connectorId,account,scopeJson,configJson,status,
                    secretRef,lastError,lastCheckedAt,createdAt,updatedAt,version FROM "ConnectionInstance" WHERE id='legacy'`))
                    .toEqual([{ id: "legacy", name: "Legacy", connectorId: "synthetic.connector", account: "account",
                        scopeJson: "{}", configJson: "{}", status: "revoked", secretRef: "synthetic:legacy", lastError: "old",
                        lastCheckedAt: new Date(timestamp), createdAt: new Date(timestamp), updatedAt: new Date(timestamp),
                        version: 1 }]);
                expect(await client.$queryRawUnsafe(`SELECT id FROM "ModelProvider"`)).toEqual([]);
            }
            await verifyStructure(client);
            const manifest = JSON.parse(await readFile(join(root, "current/manifest.json"), "utf8")) as { path: string; sha256: string }[];
            expect(manifest.some((entry) => entry.path === `migrations/${migrationName}/migration.sql`)).toBe(true);
            const migrations = await client.$queryRawUnsafe<{ migration_name: string; checksum: string }[]>(
                `SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`);
            expect(migrations).toEqual(manifest.map((entry) => ({
                migration_name: entry.path.split("/")[1], checksum: entry.sha256,
            })));
            expect(process.env.DATABASE_URL).toBe(originalDatabaseUrl);
            expect(process.env.COSMOS_DATA_ROOT).toBe(originalDataRoot);
        } finally {
            await client.$disconnect();
        }
    });
});
