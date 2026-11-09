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

it("verifies that a referenced model blocks both provider and model removal", async () => {
    if (process.release.name !== "node" || process.versions.bun !== undefined) throw new Error("Node-hosted Vitest required.");
    await mkdir(join(repositoryRoot, ".agent/tmp"), { recursive: true });
    const root = await mkdtemp(join(repositoryRoot, ".agent/tmp/task39-provider-removal-"));
    console.info(`Retained removal verification root: ${root}`);
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
    expect(names).toHaveLength(43);
    expect(names.at(-1)).toBe("20261106085039_task_41_connection_agent_separation");
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
        ["packages/storage-prisma/src/model-provider-removal-repository.ts", "removal.ts"],
        ["packages/storage-prisma/src/configured-model-repository.ts", "models.ts"],
    ];
    for (const [from, to] of copies) {
        const original = await readFile(join(repositoryRoot, from!), "utf8");
        const text = original.replace('from "@cosmos/application"', 'from "./types.js"')
            .replace('from "@cosmos/contracts"', 'from "./types.js"');
        await writeFile(join(root, to!), text);
        manifest.push({ path: from!, sha256: createHash("sha256").update(original).digest("hex") });
    }
    // 隔离根只放类型桩：被测代码真实，顶层 workspace 包的类型在这里按结构放宽。
    await writeFile(join(root, "types.ts"), TYPES);
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
        status: "passed", providerInUse: true, modelInUse: true, providerRemoved: true, credentialRefReturned: true,
    });
}, 240_000);

const TYPES = `export interface ModelProviderRemovalRepository {
    remove(input: { id: string; expectedVersion: number }): Promise<string | null>;
}
export type CreateConfiguredModelCommand = {
    modelId: string; name: string; contextWindow: number; maxOutputTokens: number;
};
export type UpdateConfiguredModelCommand = CreateConfiguredModelCommand & { expectedVersion: number };
export interface ConfiguredModelRepository {
    list(providerId: string): Promise<unknown[]>;
    get(providerId: string, id: string): Promise<unknown | null>;
    create(input: { id: string; providerId: string; fields: CreateConfiguredModelCommand }): Promise<unknown>;
    update(input: { id: string; providerId: string; expectedVersion: number; fields: Omit<UpdateConfiguredModelCommand, "expectedVersion"> }): Promise<unknown>;
    delete(input: { id: string; providerId: string; expectedVersion: number }): Promise<void>;
}
`;

const harness = `import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "./generated-client/index.js";
import { PrismaModelProviderRemovalRepository } from "./removal.js";
import { PrismaConfiguredModelRepository } from "./models.js";
const client = new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL!}}});
// PrismaClient.$transaction 有数组+回调两种重载；RemovalClient 只声明了回调式，
// 导致 TS 收窄后认为不兼容。as any 做边界断言，不影响运行时正确性。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const removal = new PrismaModelProviderRemovalRepository(client as any);
const models = new PrismaConfiguredModelRepository(client);
const code = (error:unknown): unknown => typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
try {
    await client.modelProvider.create({data:{id:"provider",name:"Synthetic",api:"openai-completions",baseUrl:"https://example.com/v1",secretRef:"secret-synthetic"}});
    await client.configuredModel.create({data:{id:"model-a",providerId:"provider",modelId:"gpt-a",name:"A",contextWindow:262144,maxOutputTokens:32768}});
    await client.configuredModel.create({data:{id:"model-b",providerId:"provider",modelId:"gpt-b",name:"B",contextWindow:262144,maxOutputTokens:32768}});
    // Task 41: ConnectionInstance.modelId 已删除；provider 有子模型时，
    // ConfiguredModel.providerId 外键仍然阻止删除 provider（in_use 来自子模型行）。
    await assert.rejects(removal.remove({id:"provider",expectedVersion:1}), (error:unknown)=> code(error) === "in_use");
    assert.equal(await client.modelProvider.count({where:{id:"provider"}}),1);
    await client.configuredModel.delete({where:{id:"model-a"}});
    await assert.rejects(removal.remove({id:"provider",expectedVersion:1}), (error:unknown)=> code(error) === "in_use");
    await client.configuredModel.delete({where:{id:"model-b"}});
    await assert.rejects(removal.remove({id:"provider",expectedVersion:9}), (error:unknown)=> code(error) === "version_conflict");
    const secretRef = await removal.remove({id:"provider",expectedVersion:1});
    assert.equal(secretRef,"secret-synthetic");
    assert.equal(await client.modelProvider.count({where:{id:"provider"}}),0);
    assert.equal(await client.configuredModel.count({where:{providerId:"provider"}}),0);
    assert.deepEqual(await client.$queryRawUnsafe("PRAGMA foreign_key_check"),[]);
    await writeFile("verification.json",JSON.stringify({status:"passed",providerInUse:true,modelInUse:true,providerRemoved:true,credentialRefReturned:true},null,2));
} finally {await client.$disconnect();}
`;
