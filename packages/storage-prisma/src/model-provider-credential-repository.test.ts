import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePrismaCliPath } from "./prisma-cli.js";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("isolated Provider credential repository", () => {
    it("runs the real coordinator against isolated Prisma transactions with synthetic credentials", async () => {
        await mkdir(join(repositoryRoot, ".agent/tmp"), { recursive: true });
        const root = await mkdtemp(join(repositoryRoot, ".agent/tmp/task39-provider-credentials-"));
        console.info(`Retained credential coordination root: ${root}`);
        const env: NodeJS.ProcessEnv = {
            DATABASE_URL: `file:${join(root, "cosmos.sqlite").replaceAll("\\", "/")}`,
            HOME: root, USERPROFILE: root, TEMP: root, TMP: root, COSMOS_DATA_ROOT: root,
            PRISMA_GENERATE_SKIP_AUTOINSTALL: "true", PRISMA_SKIP_POSTINSTALL_GENERATE: "true",
            PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1",
            PRISMA_ENGINES_MIRROR: "http://127.0.0.1:1", HTTP_PROXY: "http://127.0.0.1:1",
            HTTPS_PROXY: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1",
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
        await writeFile(join(root, "schema/schema.prisma"), schema.replace(generator,
            'generator client {\n provider = "prisma-client-js"\n output = "../generated-client"\n}'));
        const names = (await readdir(join(source, "migrations"), { withFileTypes: true }))
            .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
        expect(names).toHaveLength(45);
        expect(names.at(-1)).toBe("20261112090000_task_42_story_agent_timeout");
        const manifest = [{ path: "source-schema.prisma", sha256: createHash("sha256").update(schema).digest("hex") }];
        await copyFile(join(source, "migrations/migration_lock.toml"), join(root, "schema/migrations/migration_lock.toml"));
        for (const name of names) {
            await mkdir(join(root, "schema/migrations", name));
            const bytes = await readFile(join(source, "migrations", name, "migration.sql"));
            await writeFile(join(root, "schema/migrations", name, "migration.sql"), bytes);
            manifest.push({ path: `migrations/${name}/migration.sql`, sha256: createHash("sha256").update(bytes).digest("hex") });
        }
        await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
        const files = [
            ["packages/application/src/model-provider-credential-port.ts", "port.ts"],
            ["packages/application/src/model-provider-credentials.ts", "service.ts"],
            ["packages/application/src/secret-store.ts", "secret-store.ts"],
            ["packages/storage-prisma/src/model-provider-credential-repository.ts", "repository.ts"],
            ["packages/storage-prisma/src/model-configuration-lock.ts", "lock.ts"],
        ];
        for (const [from, to] of files) {
            const text = await readFile(join(repositoryRoot, from!), "utf8");
            await writeFile(join(root, to!), text.replace('from "@prisma/client"', 'from "./generated-client/index.js"')
                .replace('from "@cosmos/application"', 'from "./port.js"')
                .replace('from "./model-provider-credential-port.js"', 'from "./port.js"'));
        }
        await writeFile(join(root, "package.json"), '{"type":"module"}');
        await writeFile(join(root, "verify.mts"), harness);
        await writeFile(join(root, "participant.mts"), participantHarness);
        run("generate", [resolvePrismaCliPath(), "generate", "--schema", join(root, "schema/schema.prisma")]);
        run("migrate", [resolvePrismaCliPath(), "migrate", "deploy", "--schema", join(root, "schema/schema.prisma")]);
        run("compile", [require.resolve("typescript/bin/tsc"), "--strict", "--skipLibCheck", "--target", "ES2022",
            "--module", "NodeNext", "--moduleResolution", "NodeNext", "--types", "node", join(root, "verify.mts"), join(root, "participant.mts")]);
        run("verify", [join(root, "verify.mjs")]);
    }, 240_000);
});

const participantHarness = `import { writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "./generated-client/index.js";
import { PrismaProviderCredentialRepository } from "./repository.js";
import { ModelProviderCredentials } from "./service.js";
import { withModelConfigurationLock } from "./lock.js";
const client = new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL!}}});
const service = new ModelProviderCredentials({repository:new PrismaProviderCredentialRepository(client),operationId:randomUUID,
 lock:async <T,>(id:string,use:()=>Promise<T>)=>withModelConfigurationLock(process.cwd(),id,use),
 secrets:{async put(){await writeFile("pending.tmp","ready");await rename("pending.tmp","pending.ready");await new Promise<void>(()=>{});},async delete(){return false;}}});
// Bound orphan lifetime if the supervising verification process is terminated.
const safetyExit = setTimeout(()=>process.exit(2),30_000);
const keepAlive = setInterval(()=>{},1000);
try {await service.save({idempotencyKey:"cross-process",providerId:"provider",command:{expectedVersion:5,apiKey:"synthetic-child"}});}
finally {clearTimeout(safetyExit);clearInterval(keepAlive);await client.$disconnect();}
`;

const harness = `import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "./generated-client/index.js";
import { PrismaProviderCredentialRepository } from "./repository.js";
import { ModelProviderCredentials } from "./service.js";
import { withModelConfigurationLock } from "./lock.js";
const client = new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL!}}});
const repository = new PrismaProviderCredentialRepository(client);
const values = new Map<string,string>();
let puts = 0;
let failDelete = false;
const secrets = {
    async put(ref:string,value:string) { puts++; values.set(ref,value); },
    async delete(ref:string) { if(failDelete) throw new Error("synthetic-only"); return values.delete(ref); },
};
const service = new ModelProviderCredentials({repository,secrets,operationId:randomUUID,
    lock:async <T,>(id:string,use:()=>Promise<T>)=>withModelConfigurationLock(process.cwd(),id,use)});
try {
    const create = {idempotencyKey:"create",providerId:"provider",command:{name:"Synthetic",api:"openai-completions" as const,
        baseUrl:"https://example.invalid/v1",apiKey:"synthetic-one"}};
    const first = await service.save(create);
    assert.equal(first.state,"completed");
    const provider = await client.modelProvider.findUniqueOrThrow({where:{id:"provider"}});
    assert.equal(values.get(provider.secretRef!),"synthetic-one");
    assert.equal(provider.version,1);
    await service.save({...create,command:{...create.command,apiKey:"should-not-write"}});
    assert.equal(puts,1);
    await assert.rejects(service.save({idempotencyKey:"stale",providerId:"provider",command:{expectedVersion:2,apiKey:"never-write"}}));
    assert.equal(puts,1);
    failDelete = true;
    const second = await service.save({idempotencyKey:"replace",providerId:"provider",command:{expectedVersion:1,apiKey:"synthetic-two"}});
    assert.equal(second.state,"cleanup_pending");
    const active = await client.modelProvider.findUniqueOrThrow({where:{id:"provider"}});
    assert.equal(active.version,2);
    assert.equal(values.get(active.secretRef!),"synthetic-two");
    assert.equal(values.get(provider.secretRef!),"synthetic-one");
    failDelete = false;
    assert.equal((await service.retry(second.id)).state,"completed");
    assert.equal(values.has(provider.secretRef!),false);
    assert.equal(values.get(active.secretRef!),"synthetic-two");
    const noKey = await service.save({idempotencyKey:"rename",providerId:"provider",command:{expectedVersion:2,name:"Renamed",apiKey:undefined}});
    assert.equal(noKey.state,"completed");
    assert.equal((await client.modelProvider.findUniqueOrThrow({where:{id:"provider"}})).secretRef,active.secretRef);
    assert.equal(puts,2);
    const interruptedId = randomUUID();
    const interrupted = await repository.register({id:interruptedId,idempotencyKey:"interrupted",providerId:"interrupted-provider",
        fields:{name:"Interrupted",api:"openai-completions",baseUrl:"https://example.invalid/v1"},replaceCredential:true});
    values.set(interrupted.newSecretRef!,"synthetic-partial");
    assert.equal((await service.retry(interruptedId)).state,"failed");
    assert.equal(values.has(interrupted.newSecretRef!),false);
    assert.equal(await client.modelProvider.findUnique({where:{id:"interrupted-provider"}}),null);
    await assert.rejects(repository.publish(interrupted,{name:"stale",api:"openai-completions",baseUrl:"https://example.invalid/v1"}));
    const fencedId = randomUUID();
    const stale = await repository.register({id:fencedId,idempotencyKey:"fenced",providerId:"provider",
        fields:{expectedVersion:3,name:"Fenced"},replaceCredential:false});
    const recovered = await repository.recover(fencedId);
    assert.equal(recovered.generation,stale.generation+1);
    await assert.rejects(repository.publish(stale,{expectedVersion:3,name:"Cannot publish"}));
    assert.equal((await service.retry(fencedId)).state,"failed");
    const badService = new ModelProviderCredentials({repository,operationId:randomUUID,
        lock:async <T,>(id:string,use:()=>Promise<T>)=>withModelConfigurationLock(process.cwd(),id,use),
        secrets:{async put(ref:string,value:string){values.set(ref,value);throw new Error("synthetic-partial");},delete:secrets.delete}});
    const failed = await badService.save({idempotencyKey:"partial",providerId:"partial-provider",command:create.command});
    assert.equal(failed.state,"failed");
    assert.equal(await client.modelProvider.findUnique({where:{id:"partial-provider"}}),null);
    assert.equal([...values.values()].includes("synthetic-partial"),false);
    const races = await Promise.allSettled(["race-a","race-b"].map(idempotencyKey => service.save({idempotencyKey,
        providerId:"provider",command:{expectedVersion:3,name:idempotencyKey}})));
    assert.equal(races.filter(result=>result.status==="fulfilled").length,1);
    assert.equal((await client.modelProvider.findUniqueOrThrow({where:{id:"provider"}})).version,4);
    const originalPublish = repository.publish.bind(repository);
    repository.publish = async (operation,fields) => { await originalPublish(operation,fields); throw new Error("unknown committed outcome"); };
    const unknown = await service.save({idempotencyKey:"unknown",providerId:"provider",command:{expectedVersion:4,apiKey:"synthetic-three"}});
    assert.equal(unknown.state,"completed");
    const afterUnknown = await client.modelProvider.findUniqueOrThrow({where:{id:"provider"}});
    assert.equal(values.get(afterUnknown.secretRef!),"synthetic-three");
    assert.equal(values.has(active.secretRef!),false);
    repository.publish = originalPublish;
    const child = spawn(process.execPath,["participant.mjs"],{cwd:process.cwd(),env:process.env,stdio:"ignore"});
    const exited = new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",()=>resolve());});
    try {
        const deadline = Date.now()+10_000;
        while (true) {
            try {await access("pending.ready");break;} catch {if(Date.now()>deadline)throw new Error("Synthetic handshake timed out");}
            await new Promise(resolve=>setTimeout(resolve,20));
        }
        const pending = await repository.findByKey("cross-process");
        assert.ok(pending);
        await assert.rejects(service.save({idempotencyKey:"blocked",providerId:"provider",command:{expectedVersion:5,name:"Blocked"}}),
            {code:"operation_in_progress"});
        await assert.rejects(service.retry(pending.id), {code:"operation_in_progress"});
        assert.equal((await client.modelConfigurationOperation.findUniqueOrThrow({where:{id:pending.id}})).generation,1);
        child.kill();await exited;
        assert.equal((await service.retry(pending.id)).state,"failed");
        assert.equal((await client.modelProvider.findUniqueOrThrow({where:{id:"provider"}})).secretRef,afterUnknown.secretRef);
    } finally {if(child.exitCode===null && child.signalCode===null)child.kill();await exited;}
    const records = JSON.stringify(await client.modelConfigurationOperation.findMany());
    assert.equal(records.includes("synthetic-one"),false);
    assert.equal(records.includes("synthetic-two"),false);
} finally { await client.$disconnect(); }
`;
