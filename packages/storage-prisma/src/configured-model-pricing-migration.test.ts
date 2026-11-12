import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { expect, it } from "vitest";
import { resolvePrismaCliPath } from "./prisma-cli.js";
import { PrismaConfiguredModelRepository } from "./configured-model-repository.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = join(repositoryRoot, "packages/storage-prisma/prisma");
const migrationName = "20261111080000_task_42_cache_tiered_pricing";
const parent = join(repositoryRoot, ".agent/tmp/t42-cache-tiered-pricing");

async function schemaAt(root: string, current: boolean): Promise<string> {
    const destination = join(root, current ? "current" : "legacy");
    const migrations = join(destination, "migrations");
    await mkdir(migrations, { recursive: true });
    await copyFile(join(source, "schema.prisma"), join(destination, "schema.prisma"));
    await copyFile(join(source, "migrations/migration_lock.toml"), join(migrations, "migration_lock.toml"));
    const names = (await readdir(join(source, "migrations"), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const historicalNames = names.filter((name) => name <= migrationName);
    expect(historicalNames).toHaveLength(44);
    expect(historicalNames.at(-1)).toBe(migrationName);
    for (const name of historicalNames.filter((name) => current || name < migrationName)) {
        await mkdir(join(migrations, name));
        await copyFile(join(source, "migrations", name, "migration.sql"), join(migrations, name, "migration.sql"));
    }
    return join(destination, "schema.prisma");
}

function deploy(root: string, schema: string, databaseUrl: string): void {
    const environment: NodeJS.ProcessEnv = { DATABASE_URL: databaseUrl, COSMOS_DATA_ROOT: root,
        HOME: root, USERPROFILE: root, TEMP: root, TMP: root, CHECKPOINT_DISABLE: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "1", PRISMA_SKIP_POSTINSTALL_GENERATE: "true" };
    for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"]) {
        if (process.env[key] !== undefined) environment[key] = process.env[key];
    }
    const result = spawnSync(process.execPath, [resolvePrismaCliPath(), "migrate", "deploy", "--schema", schema],
        { cwd: root, env: environment, encoding: "utf8", timeout: 60_000 });
    if (result.error || result.status !== 0) {
        throw new Error(`Isolated migration failed: ${result.error?.message ?? ""}\n${result.stderr.slice(-4000)}\n${result.stdout.slice(-4000)}`);
    }
}

it("upgrades the previous 43-migration database without inventing cache prices or rewriting historical costs", async () => {
    const root = join(parent, randomUUID());
    await mkdir(root, { recursive: true });
    const databaseUrl = `file:${join(root, "cosmos.sqlite").replaceAll("\\", "/")}`;
    const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const history = '{"id":"historical","cost":{"input":0.1,"output":0.2,"total":0.3,"currency":"USD"}}';
    try {
        deploy(root, await schemaAt(root, false), databaseUrl);
        await client.$executeRawUnsafe(`INSERT INTO ModelProvider (id,name,api,baseUrl,updatedAt)
            VALUES ('provider','Synthetic','openai-completions','https://example.invalid/v1',CURRENT_TIMESTAMP)`);
        await client.$executeRawUnsafe(`INSERT INTO ConfiguredModel
            (id,providerId,modelId,name,contextWindow,maxOutputTokens,inputPricePerMillion,outputPricePerMillion,updatedAt)
            VALUES ('legacy','provider','legacy','Legacy',4096,256,1.25,2.5,CURRENT_TIMESTAMP)`);
        await client.$executeRawUnsafe(`INSERT INTO Story (id,kind,updatedAt) VALUES ('story','article',CURRENT_TIMESTAMP)`);
        await client.$executeRawUnsafe(`INSERT INTO StoryAgentCandidate (id,storyId,storyRevisionId,candidateJson)
            VALUES ('historical','story','revision',?)`, history);
        deploy(root, await schemaAt(root, true), databaseUrl);
        const columns = await client.$queryRawUnsafe<{ name: string; type: string; notnull: bigint; dflt_value: unknown }[]>(
            'PRAGMA table_info("ConfiguredModel")');
        expect(columns.find((column) => column.name === "tieredPricingThreshold"))
            .toMatchObject({ type: "BIGINT", notnull: 0n, dflt_value: null });
        const row = await client.configuredModel.findUniqueOrThrow({ where: { id: "legacy" } });
        expect(Number(row.inputPricePerMillion)).toBe(1.25);
        expect(Number(row.outputPricePerMillion)).toBe(2.5);
        expect(row).toMatchObject({ cacheWritePricePerMillion: null, cacheReadPricePerMillion: null,
            currency: "USD", tieredPricingEnabled: false, tieredPricingThreshold: null,
            highInputPricePerMillion: null, highOutputPricePerMillion: null,
            highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null });
        const snapshot = await new PrismaConfiguredModelRepository(client).get("provider", "legacy");
        expect(snapshot).not.toHaveProperty("cacheWritePricePerMillion");
        expect(snapshot).not.toHaveProperty("cacheReadPricePerMillion");
        expect((await client.storyAgentCandidate.findUniqueOrThrow({ where: { id: "historical" } })).candidateJson).toBe(history);
        expect(await client.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]);
        expect(await client.$queryRawUnsafe("PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
        expect(await readFile(join(source, "migrations", migrationName, "migration.sql"), "utf8")).not.toMatch(/UPDATE|DELETE|DROP/i);
    } finally {
        await client.$disconnect();
        await rm(root, { recursive: true, force: true });
    }
}, 120_000);
