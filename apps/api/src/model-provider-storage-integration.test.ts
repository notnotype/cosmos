import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { resolvePrismaCliPath } from "../../../packages/storage-prisma/src/prisma-cli.js";

import { harness } from "./model-provider-storage-integration.fixture.js";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

it("verifies HTTP credential writes and recovery against isolated Prisma and FileSecretStore", async () => {
    if (process.release.name !== "node" || process.versions.bun !== undefined) throw new Error("Node-hosted Vitest required.");
    await mkdir(join(repositoryRoot, ".agent/tmp"), { recursive: true });
    const root = await mkdtemp(join(repositoryRoot, ".agent/tmp/task39-provider-http-"));
    console.info(`Retained HTTP verification root: ${root}`);
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
        ["packages/contracts/src/provider-model.ts", "contracts.ts"],
        ["packages/application/src/model-provider-query.ts", "query.ts"],
        ["packages/application/src/model-provider-credentials.ts", "credentials.ts"],
        ["packages/application/src/model-provider-removals.ts", "removals.ts"],
        ["packages/application/src/model-provider-credential-port.ts", "model-provider-credential-port.ts"],
        ["packages/application/src/secret-store.ts", "secret-store.ts"],
        ["packages/storage-prisma/src/model-provider-query-repository.ts", "query-repository.ts"],
        ["packages/storage-prisma/src/model-provider-credential-repository.ts", "credential-repository.ts"],
        ["packages/storage-prisma/src/model-configuration-lock.ts", "lock.ts"],
        ["packages/storage-prisma/src/secret-store.ts", "file-secrets.ts"],
        ["apps/api/src/model-provider.controller.ts", "read-controller.ts"],
        ["apps/api/src/model-provider-write.controller.ts", "write-controller.ts"],
        ["apps/api/src/model-configuration-body-reader.ts", "model-configuration-body-reader.ts"],
        ["apps/api/src/model-configuration-write-policy.ts", "model-configuration-write-policy.ts"],

    ];
    for (const [from, to] of copies) {
        const original = await readFile(join(repositoryRoot, from!), "utf8");
        const application = to === "query-repository.ts" || to === "read-controller.ts" ? "./query.js"
            : to === "credential-repository.ts" ? "./model-provider-credential-port.js"
                : to === "file-secrets.ts" ? "./secret-store.js" : "./application.js";
        const text = original.replaceAll('from "@cosmos/application"', `from "${application}"`)
            .replaceAll('from "@cosmos/contracts"', 'from "./contracts.js"')
            .replaceAll('from "@prisma/client"', 'from "./generated-client/index.js"');
        await writeFile(join(root, to!), text);
        manifest.push({ path: from!, sha256: createHash("sha256").update(original).digest("hex") });
    }
    await writeFile(join(root, "application.ts"), 'export { ModelProviderCredentials } from "./credentials.js";\nexport { ModelProviderQuery } from "./query.js";\nexport { ModelProviderRemovals } from "./removals.js";\n');
    manifest.push({ path: "apps/api/src/model-provider-storage-integration.fixture.ts:harness", sha256: createHash("sha256").update(harness).digest("hex") });
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(join(root, "verify.ts"), harness);
    run("generate", [resolvePrismaCliPath(), "generate", "--schema", join(root, "schema/schema.prisma")]);
    run("migrate", [resolvePrismaCliPath(), "migrate", "deploy", "--schema", join(root, "schema/schema.prisma")]);
    run("compile", [require.resolve("typescript/bin/tsc"), "--strict", "--skipLibCheck", "--target", "ES2022",
        "--module", "NodeNext", "--moduleResolution", "NodeNext", "--types", "node",
        "--experimentalDecorators", "--emitDecoratorMetadata", join(root, "verify.ts")]);
    run("verify", [join(root, "verify.js")]);
    expect(JSON.parse(await readFile(join(root, "verification.json"), "utf8"))).toEqual({
        status: "passed", create: true, replace: true, replay: true, conflict: true, cleanupRecovery: true,
        nativeLock: true, foreignKeys: true, providerRequests: 0,
    });
}, 240_000);
