import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolvePrismaCliPath } from "./prisma-cli.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryParent = join(repositoryRoot, ".agent/tmp");
const source = join(repositoryRoot, "packages/storage-prisma/prisma");
const boundary = "20261111080000_task_42_cache_tiered_pricing";
const require = createRequire(import.meta.url);

function run(root: string, label: string, args: string[], environment: NodeJS.ProcessEnv): void {
    if (!root.startsWith(`${temporaryParent}${sep}task39-provider-model-client-`)) {
        throw new Error("Client verification isolation guard rejected the target.");
    }
    const log = openSync(join(root, `${label}.log`), "wx");
    try {
        const result = spawnSync(process.execPath, args, {
            cwd: root, env: environment, stdio: ["ignore", log, log], timeout: 90_000,
        });
        if (result.error || result.status !== 0) {
            throw new Error(`Isolated ${label} failed; inspect ${join(root, `${label}.log`)}`);
        }
    } finally {
        closeSync(log);
    }
}

function isolatedEnvironment(root: string): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = {
        DATABASE_URL: `file:${join(root, "cosmos.sqlite").replaceAll("\\", "/")}`,
        COSMOS_DATA_ROOT: root, HOME: root, USERPROFILE: root, TEMP: root, TMP: root,
        CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1",
        PRISMA_GENERATE_SKIP_AUTOINSTALL: "true", PRISMA_SKIP_POSTINSTALL_GENERATE: "true",
        PRISMA_ENGINES_MIRROR: "http://127.0.0.1:1", HTTP_PROXY: "http://127.0.0.1:1",
        HTTPS_PROXY: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1", NO_PROXY: "",
        npm_config_offline: "true", npm_config_ignore_scripts: "true",
    };
    for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"]) {
        if (process.env[key] !== undefined) environment[key] = process.env[key];
    }
    return environment;
}

async function snapshot(root: string): Promise<string> {
    const destination = join(root, "schema-snapshot");
    const migrations = join(destination, "migrations");
    await mkdir(migrations, { recursive: true });
    const original = await readFile(join(source, "schema.prisma"), "utf8");
    const generator = /generator client \{\s*provider = "prisma-client-js"\s*\}/g;
    if ([...original.matchAll(generator)].length !== 1) {
        throw new Error("Re-audit the generator before isolated client generation.");
    }
    const schema = original.replace(generator,
        'generator client {\n    provider = "prisma-client-js"\n    output = "../generated-client"\n}');
    await writeFile(join(destination, "schema.prisma"), schema);
    await copyFile(join(source, "migrations/migration_lock.toml"), join(migrations, "migration_lock.toml"));
    const names = (await readdir(join(source, "migrations"), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    if (names.length !== 44 || names.at(-1) !== boundary) {
        throw new Error("Re-audit the migration boundary before executing this suite.");
    }
    const manifest = [{ path: "source-schema.prisma", sha256: createHash("sha256").update(original).digest("hex") },
        { path: "schema.prisma", sha256: createHash("sha256").update(schema).digest("hex") }];
    for (const name of names) {
        const relativePath = `migrations/${name}/migration.sql`;
        const bytes = await readFile(join(source, relativePath));
        await mkdir(join(migrations, name));
        await writeFile(join(destination, relativePath), bytes);
        manifest.push({ path: relativePath, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
    return join(destination, "schema.prisma");
}

// Compiled against the isolated generated declarations, then executed by Node.
const harness = `import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "./generated-client/index.js";

const url = process.env.DATABASE_URL;
assert.ok(url);
const client = new PrismaClient({ datasources: { db: { url } } });
try {
    const provider = await client.modelProvider.create({ data: {
        id: "provider", name: "Synthetic", api: "openai-completions", baseUrl: "https://example.invalid/v1",
    } });
    assert.equal(provider.version, 1);
    assert.equal(provider.secretRef, null);
    const model = await client.configuredModel.create({ data: {
        id: "model", providerId: provider.id, modelId: "namespace/synthetic", name: "Synthetic",
        contextWindow: 4096, maxOutputTokens: 64,
    } });
    // Task 41: ConnectionInstance.modelId 已删除，连接不再持有模型引用。
    const connection = await client.connectionInstance.create({ data: {
        id: "connection", name: "Synthetic", connectorId: "cosmos.agent",
        scopeJson: "{}", configJson: "{}", status: "active",
    } });
    assert.equal(connection.version, 1);
    const associated = await client.connectionInstance.findUniqueOrThrow({
        where: { id: connection.id },
    });
    assert.equal(associated.secretRef, null);
    const operation = await client.modelConfigurationOperation.create({ data: {
        id: "operation", idempotencyKey: "synthetic-request", kind: "replace", providerId: provider.id,
        expectedVersion: 1, newSecretRef: "synthetic-new-ref",
    } });
    assert.equal(operation.generation, 1);
    await client.modelProvider.update({ where: { id: provider.id }, data: { pendingOperationId: operation.id } });
    const fenced = await client.modelConfigurationOperation.updateMany({
        where: { id: operation.id, generation: 1, state: "pending" }, data: { generation: { increment: 1 } },
    });
    assert.equal(fenced.count, 1);
    assert.equal((await client.modelConfigurationOperation.updateMany({
        where: { id: operation.id, generation: 1, state: "pending" }, data: { phase: "published" },
    })).count, 0);
    await assert.rejects(client.$transaction(async (transaction) => {
        await transaction.modelProvider.update({ where: { id: provider.id }, data: { name: "rollback" } });
        await transaction.modelConfigurationOperation.update({ where: { id: operation.id }, data: { phase: "rollback" } });
        throw new Error("synthetic rollback");
    }), /synthetic rollback/);
    assert.equal((await client.modelProvider.findUniqueOrThrow({ where: { id: provider.id } })).name, "Synthetic");
    assert.equal((await client.modelConfigurationOperation.findUniqueOrThrow({ where: { id: operation.id } })).phase, "registered");
    await client.$transaction(async (transaction) => {
        const current = await transaction.modelConfigurationOperation.updateMany({
            where: { id: operation.id, generation: 2, state: "pending" },
            data: { phase: "published", resourceVersion: 2 },
        });
        assert.equal(current.count, 1);
        const published = await transaction.modelProvider.updateMany({
            where: { id: provider.id, version: 1, pendingOperationId: operation.id },
            data: { secretRef: "synthetic-new-ref", version: { increment: 1 } },
        });
        assert.equal(published.count, 1);
    });
    assert.equal((await client.modelProvider.updateMany({
        where: { id: provider.id, version: 1 }, data: { name: "stale" },
    })).count, 0);
    // Provider 有子模型时不允许删除（ConfiguredModel.providerId 外键保护）。
    await assert.rejects(client.modelProvider.delete({ where: { id: provider.id } }));
    await client.connectionInstance.delete({ where: { id: connection.id } });
    await client.configuredModel.delete({ where: { id: model.id } });
    await client.modelProvider.delete({ where: { id: provider.id } });
    assert.equal((await client.modelConfigurationOperation.findUniqueOrThrow({ where: { id: operation.id } })).generation, 2);
    const integrity = await client.$queryRawUnsafe<Array<{ integrity_check: string }>>("PRAGMA integrity_check");
    assert.deepEqual(integrity, [{ integrity_check: "ok" }]);
    assert.deepEqual(await client.$queryRawUnsafe("PRAGMA foreign_key_check"), []);
    await writeFile("verification.json", JSON.stringify({
        status: "passed", typedClient: true, association: true, rollback: true,
        staleVersionRejected: true, staleGenerationRejected: true, receiptRetained: true,
        secretStoreAccessed: false, providerRequested: false,
    }, null, 2));
} finally {
    await client.$disconnect();
}
`;

describe("isolated generated Provider/model client", () => {
    it("compiles typed delegates and verifies association, transactions and conditional writes", async () => {
        if (process.release.name !== "node" || process.versions.bun !== undefined) {
            throw new Error("Run this suite with Node-hosted Vitest.");
        }
        await mkdir(temporaryParent, { recursive: true });
        const root = await mkdtemp(join(temporaryParent, "task39-provider-model-client-"));
        console.info(`Retained isolated client root: ${root}`);
        const environment = isolatedEnvironment(root);
        const schema = await snapshot(root);
        const cli = resolvePrismaCliPath();
        run(root, "generate", [cli, "generate", "--schema", schema], environment);
        run(root, "migrate", [cli, "migrate", "deploy", "--schema", schema], environment);
        await writeFile(join(root, "verify.mts"), harness);
        run(root, "typecheck", [require.resolve("typescript/bin/tsc"), "--strict", "--skipLibCheck",
            "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext",
            "--types", "node", "--noEmit", join(root, "verify.mts")], environment);
        // Keep the generated-client relative import stable without copying generated artifacts.
        run(root, "compile", [require.resolve("typescript/bin/tsc"), "--strict", "--skipLibCheck",
            "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext",
            "--types", "node", join(root, "verify.mts")], environment);
        run(root, "verify", [join(root, "verify.mjs")], environment);
        expect(JSON.parse(await readFile(join(root, "verification.json"), "utf8"))).toEqual({
            status: "passed", typedClient: true, association: true, rollback: true,
            staleVersionRejected: true, staleGenerationRejected: true, receiptRetained: true,
            secretStoreAccessed: false, providerRequested: false,
        });
    }, 240_000);
});
