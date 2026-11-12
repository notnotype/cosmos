import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { resolvePrismaCliPath } from "./prisma-cli.js";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

it("verifies safe Provider queries against an isolated generated Prisma client", async () => {
    if (process.release.name !== "node" || process.versions.bun !== undefined) throw new Error("Node-hosted Vitest required.");
    await mkdir(join(repositoryRoot, ".agent/tmp"), { recursive: true });
    const root = await mkdtemp(join(repositoryRoot, ".agent/tmp/task39-provider-query-"));
    console.info(`Retained query verification root: ${root}`);
    const env: NodeJS.ProcessEnv = {
        DATABASE_URL: `file:${join(root, "cosmos.sqlite").replaceAll("\\", "/")}`,
        HOME: root, USERPROFILE: root, TEMP: root, TMP: root, COSMOS_DATA_ROOT: root,
        PRISMA_GENERATE_SKIP_AUTOINSTALL: "true", PRISMA_SKIP_POSTINSTALL_GENERATE: "true",
        PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1",
        PRISMA_ENGINES_MIRROR: "http://127.0.0.1:1", HTTP_PROXY: "http://127.0.0.1:1",
        HTTPS_PROXY: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1", NO_PROXY: "",
        npm_config_offline: "true", npm_config_ignore_scripts: "true",
    };
    for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"]) {
        if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    const run = (label: string, args: string[]) => {
        const log = openSync(join(root, `${label}.log`), "wx");
        try {
            const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: ["ignore", log, log], timeout: 90_000 });
            expect(result.error, `Isolated ${label} failed; retained log`).toBeUndefined();
            expect(result.status, `Isolated ${label} failed; retained log`).toBe(0);
        } finally { closeSync(log); }
    };
    const source = join(repositoryRoot, "packages/storage-prisma/prisma");
    const schema = await readFile(join(source, "schema.prisma"), "utf8");
    const generator = /generator client \{\s*provider = "prisma-client-js"\s*\}/g;
    expect([...schema.matchAll(generator)]).toHaveLength(1);
    await mkdir(join(root, "schema/migrations"), { recursive: true });
    const isolatedSchema = schema.replace(generator, 'generator client {\n provider = "prisma-client-js"\n output = "../generated-client"\n}');
    await writeFile(join(root, "schema/schema.prisma"), isolatedSchema);
    const names = (await readdir(join(source, "migrations"), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    expect(names).toHaveLength(45);
    expect(names.at(-1)).toBe("20261112090000_task_42_story_agent_timeout");
    const manifest = [
        { path: "source-schema.prisma", sha256: createHash("sha256").update(schema).digest("hex") },
        { path: "schema/schema.prisma", sha256: createHash("sha256").update(isolatedSchema).digest("hex") },
    ];
    await copyFile(join(source, "migrations/migration_lock.toml"), join(root, "schema/migrations/migration_lock.toml"));
    for (const name of names) {
        await mkdir(join(root, "schema/migrations", name));
        const bytes = await readFile(join(source, "migrations", name, "migration.sql"));
        await writeFile(join(root, "schema/migrations", name, "migration.sql"), bytes);
        manifest.push({ path: `schema/migrations/${name}/migration.sql`, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    const copies = [
        ["packages/contracts/src/provider-model.ts", "contracts.ts"],
        ["packages/application/src/model-provider-query.ts", "query.ts"],
        ["packages/storage-prisma/src/model-provider-query-repository.ts", "repository.ts"],
    ];
    for (const [from, to] of copies) {
        const original = await readFile(join(repositoryRoot, from!), "utf8");
        const text = original.replace('from "@cosmos/application"', 'from "./query.js"')
            .replace('from "@cosmos/contracts"', 'from "./contracts.js"');
        await writeFile(join(root, to!), text);
        manifest.push({ path: from!, sha256: createHash("sha256").update(original).digest("hex") });
    }
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(join(root, "verify.mts"), harness);
    run("generate", [resolvePrismaCliPath(), "generate", "--schema", join(root, "schema/schema.prisma")]);
    run("migrate", [resolvePrismaCliPath(), "migrate", "deploy", "--schema", join(root, "schema/schema.prisma")]);
    const compiler = [require.resolve("typescript/bin/tsc"), "--strict", "--skipLibCheck", "--target", "ES2022",
        "--module", "NodeNext", "--moduleResolution", "NodeNext", "--types", "node"];
    run("typecheck", [...compiler, "--noEmit", join(root, "verify.mts")]);
    run("compile", [...compiler, join(root, "verify.mts")]);
    run("verify", [join(root, "verify.mjs")]);
    expect(JSON.parse(await readFile(join(root, "verification.json"), "utf8"))).toEqual({
        status: "passed", hiddenReservation: true, pagination: true, cleanupState: true,
        receiptLookup: true, whitelist: true, secretStoreAccessed: false, providerRequested: false,
    });
}, 240_000);

const harness = `import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "./generated-client/index.js";
import { ModelProviderQuery } from "./query.js";
import { PrismaModelProviderQueryRepository } from "./repository.js";
const client = new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL!}}});
const query = new ModelProviderQuery(new PrismaModelProviderQueryRepository(client));
try {
    await client.modelProvider.create({data:{id:"a-hidden",name:"Reservation",api:"openai-completions",baseUrl:"https://example.com/v1"}});
    for (const id of ["b-provider","c-provider","d-provider"]) {
        await client.modelProvider.create({data:{id,name:"Synthetic",api:"openai-completions",baseUrl:"https://example.com/v1",secretRef:"synthetic-ref:"+id}});
    }
    await assert.rejects(query.get("a-hidden"), (error:unknown)=> error instanceof Error && "code" in error && error.code === "not_found");
    const first = await query.list({limit:2});
    assert.deepEqual(first.items.map(row=>row.id),["b-provider","c-provider"]);
    assert.equal(first.nextCursor,"c-provider");
    const second = await query.list({limit:2,cursor:first.nextCursor!});
    assert.deepEqual(second.items.map(row=>row.id),["d-provider"]);
    assert.equal(second.nextCursor,null);
    assert.equal((await query.get("b-provider")).credentialState,"configured");
    await client.modelConfigurationOperation.create({data:{id:"operation",idempotencyKey:"synthetic-key",kind:"update",providerId:"b-provider",state:"cleanup_pending",phase:"published",resourceVersion:1,errorCode:"cleanup_pending",oldSecretRef:"synthetic-private-old"}});
    assert.equal((await query.get("b-provider")).credentialState,"cleanup_pending");
    const receipt = await query.operation("operation");
    assert.deepEqual(receipt,await query.operationByKey("synthetic-key"));
    assert.deepEqual(Object.keys(receipt).sort(),["errorCode","id","kind","providerId","resourceVersion","state"].sort());
    const provider = await query.get("b-provider");
    assert.deepEqual(Object.keys(provider).sort(),["id","name","api","baseUrl","version","state","credentialState","createdAt","updatedAt"].sort());
    assert.ok(!JSON.stringify({provider,receipt}).includes("synthetic-private"));
    await client.modelConfigurationOperation.update({where:{id:"operation"},data:{state:"completed",errorCode:null}});
    assert.equal((await query.get("b-provider")).credentialState,"configured");
    assert.deepEqual(await client.$queryRawUnsafe("PRAGMA foreign_key_check"),[]);
    await writeFile("verification.json",JSON.stringify({status:"passed",hiddenReservation:true,pagination:true,cleanupState:true,receiptLookup:true,whitelist:true,secretStoreAccessed:false,providerRequested:false},null,2));
} finally {await client.$disconnect();}
`;
