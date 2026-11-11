import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { resolvePrismaCliPath } from "./prisma-cli.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryParent = join(repositoryRoot, ".agent/tmp");
const source = join(repositoryRoot, "packages/storage-prisma/prisma");
const adapterSource = join(repositoryRoot, "packages/storage-prisma/src/configured-model-repository.ts");
const require = createRequire(import.meta.url);

function run(root: string, label: string, args: string[], environment: NodeJS.ProcessEnv): void {
    if (!root.startsWith(`${temporaryParent}${sep}task39-configured-model-`)) throw new Error("Configured model isolation guard rejected the target.");
    const log = openSync(join(root, `${label}.log`), "wx");
    try {
        const result = spawnSync(process.execPath, args, { cwd: root, env: environment, stdio: ["ignore", log, log], timeout: 120_000 });
        if (result.error || result.status !== 0) {
            const logPath = join(root, `${label}.log`);
            const tail = readFileSync(logPath, "utf8").slice(-4000);
            throw new Error(`Isolated ${label} failed. Log tail:\n${tail}`);
        }
    } finally { closeSync(log); }
}

function environment(root: string): NodeJS.ProcessEnv {
    const value: NodeJS.ProcessEnv = { DATABASE_URL: `file:${join(root, "cosmos.sqlite").replaceAll("\\", "/")}`, 
        COSMOS_DATA_ROOT: root, HOME: root, USERPROFILE: root, TEMP: root, TMP: root,
        PRISMA_HIDE_UPDATE_MESSAGE: "1", PRISMA_GENERATE_SKIP_AUTOINSTALL: "true",
        PRISMA_SKIP_POSTINSTALL_GENERATE: "true", PRISMA_ENGINES_MIRROR: "http://127.0.0.1:1",
        HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1",
        NO_PROXY: "", npm_config_offline: "true", npm_config_ignore_scripts: "true" };
    for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"]) if (process.env[key] !== undefined) value[key] = process.env[key];
    return value;
}

async function snapshot(root: string): Promise<string> {
    const destination = join(root, "schema");
    const migrations = join(destination, "migrations");
    await mkdir(migrations, { recursive: true });
    const original = await readFile(join(source, "schema.prisma"), "utf8");
    const schema = original.replace(/generator client \{\s*provider = "prisma-client-js"\s*\}/,
        'generator client {\n provider = "prisma-client-js"\n output = "../generated-client"\n}');
    await writeFile(join(destination, "schema.prisma"), schema);
    await copyFile(join(source, "migrations/migration_lock.toml"), join(migrations, "migration_lock.toml"));
    const names = (await readdir(join(source, "migrations"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    if (names.length !== 43 || names.at(-1) !== "20261106085039_task_41_connection_agent_separation") throw new Error("Re-audit the frozen migration boundary.");
    const manifest: { path: string; sha256: string }[] = [];
    for (const name of names) {
        const relative = `migrations/${name}/migration.sql`;
        const bytes = await readFile(join(source, relative));
        await mkdir(join(migrations, name)); await writeFile(join(destination, relative), bytes);
        manifest.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
    return join(destination, "schema.prisma");
}

const harness = `import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "./generated-client/index.js";
import { PrismaConfiguredModelRepository } from "./configured-model-repository.js";
const client = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
try {
  const provider = await client.modelProvider.create({ data: { id: "provider", name: "Synthetic", api: "openai-completions", baseUrl: "https://example.invalid/v1" } });
  const repo = new PrismaConfiguredModelRepository(client);
  const created = await repo.create({ id: "model", providerId: provider.id, fields: { modelId: "org/model", name: "Model", contextWindow: 4096, maxOutputTokens: 128, inputPricePerMillion: 1.25, outputPricePerMillion: 2.5 } }) as { id: string; providerId: string; modelId: string; name: string; contextWindow: number; maxOutputTokens: number; version: number; createdAt: string; updatedAt: string; inputPricePerMillion?: number; outputPricePerMillion?: number };
  assert.deepEqual(created, { id: "model", providerId: "provider", modelId: "org/model", name: "Model", contextWindow: 4096, maxOutputTokens: 128, inputPricePerMillion: 1.25, outputPricePerMillion: 2.5, version: 1, createdAt: created.createdAt, updatedAt: created.updatedAt });
  assert.match(created.createdAt, /^\\d{4}-\\d{2}-\\d{2}T/);
  assert.equal(created.updatedAt, created.createdAt);
  const listed = await repo.list(provider.id); assert.equal(listed.length, 1); assert.deepEqual(listed[0], created); assert.deepEqual(await repo.get(provider.id, "model"), created);
  const updated = await repo.update({ id: "model", providerId: provider.id, expectedVersion: 1, fields: { name: "Renamed", inputPricePerMillion: 9, outputPricePerMillion: 18 } }) as { name: string; version: number; inputPricePerMillion?: number; outputPricePerMillion?: number };
  assert.deepEqual({ name: updated.name, version: updated.version, inputPricePerMillion: updated.inputPricePerMillion, outputPricePerMillion: updated.outputPricePerMillion }, { name: "Renamed", version: 2, inputPricePerMillion: 9, outputPricePerMillion: 18 });
   const zero = await client.configuredModel.create({ data: { id: "zero", providerId: provider.id, modelId: "org/zero", name: "Zero", contextWindow: 4096, maxOutputTokens: 128 } });
   assert.deepEqual(await repo.get(provider.id, "zero"), { id: "zero", providerId: provider.id, modelId: "org/zero", name: "Zero", contextWindow: 4096, maxOutputTokens: 128, inputPricePerMillion: 0, outputPricePerMillion: 0, version: 1, createdAt: zero.createdAt.toISOString(), updatedAt: zero.updatedAt.toISOString() });
   const explicitZero = await client.configuredModel.create({ data: { id: "explicit-zero", providerId: provider.id, modelId: "org/explicit-zero", name: "Explicit zero", contextWindow: 4096, maxOutputTokens: 128, inputPricePerMillion: 0, outputPricePerMillion: 0 } });
   assert.deepEqual(await repo.get(provider.id, "explicit-zero"), { id: explicitZero.id, providerId: provider.id, modelId: "org/explicit-zero", name: "Explicit zero", contextWindow: 4096, maxOutputTokens: 128, inputPricePerMillion: 0, outputPricePerMillion: 0, version: 1, createdAt: explicitZero.createdAt.toISOString(), updatedAt: explicitZero.updatedAt.toISOString() });
   await client.configuredModel.create({ data: { id: "unknown", providerId: provider.id, modelId: "org/unknown", name: "Unknown", contextWindow: 4096, maxOutputTokens: 128, inputPricePerMillion: null, outputPricePerMillion: null } });
   const unknown = await repo.get(provider.id, "unknown") as Record<string, unknown>;
   assert.equal("inputPricePerMillion" in unknown, false); assert.equal("outputPricePerMillion" in unknown, false);
   assert.equal(typeof updated.inputPricePerMillion, "number"); assert.equal(typeof updated.outputPricePerMillion, "number");
  await assert.rejects(repo.update({ id: "model", providerId: provider.id, expectedVersion: 1, fields: { name: "stale" } }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "version_conflict");
  await assert.rejects(repo.delete({ id: "model", providerId: provider.id, expectedVersion: 1 }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "version_conflict");
  await repo.delete({ id: "model", providerId: provider.id, expectedVersion: 2 });
  assert.equal(await repo.get(provider.id, "model"), null);
  assert.deepEqual(await client.$queryRawUnsafe("PRAGMA foreign_key_check"), []);
  await writeFile("verification.json", JSON.stringify({ status: "passed", repository: true, nonSecretFieldsOnly: true, providerScoped: true, cas: true, providerRequested: false }, null, 2));
} finally { await client.$disconnect(); }
`;

describe("isolated ConfiguredModel Prisma repository", () => {
    it("runs the actual adapter against a generated client and isolated 42-migration database", async () => {
        if (process.release.name !== "node" || process.versions.bun !== undefined) throw new Error("Run with Node-hosted Vitest.");
        await mkdir(temporaryParent, { recursive: true });
        const root = await mkdtemp(join(temporaryParent, "task39-configured-model-"));
        try {
            const env = environment(root);
        const schema = await snapshot(root);
        await writeFile(join(root, "configured-model-repository.ts"), await readFile(adapterSource, "utf8"));
        const cli = resolvePrismaCliPath();
        run(root, "generate", [cli, "generate", "--schema", schema], env);
        run(root, "migrate", [cli, "migrate", "deploy", "--schema", schema], env);
        await writeFile(join(root, "verify.mts"), harness);
        run(root, "typecheck", [require.resolve("typescript/bin/tsc"), "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--types", "node", "--noEmit", join(root, "verify.mts")], env);
        run(root, "compile", [require.resolve("typescript/bin/tsc"), "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--types", "node", join(root, "verify.mts")], env);
        run(root, "verify", [join(root, "verify.mjs")], env);
            expect(JSON.parse(await readFile(join(root, "verification.json"), "utf8"))).toEqual({ status: "passed", repository: true, nonSecretFieldsOnly: true, providerScoped: true, cas: true, providerRequested: false });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 240_000);
});
