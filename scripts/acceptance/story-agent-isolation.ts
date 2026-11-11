import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { FileSecretStore, PrismaCosmosRepository } from "@cosmos/storage-prisma";
import { resolvePrismaCliPath } from "../../packages/storage-prisma/src/prisma-cli.js";
import type { SecretStorePort } from "@cosmos/application";

export const repositoryRoot = resolve(import.meta.dirname, "../..");
// This immutable commit supplies the base 43 migrations; schema-snapshot-manifest.json identifies the explicit working-tree overlay.
export const snapshotCommit = "7ca568a91c57fba7bd8256727662936143b63a14";
const schemaPrefix = "packages/storage-prisma/prisma";
const overlayMigrationName = "20261111080000_task_42_cache_tiered_pricing";

export async function prepareStoryIsolation() {
    const parent = join(repositoryRoot, ".agent", "tmp");
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, "task40-story-"));
    let repository: PrismaCosmosRepository | undefined;
    try {
        const files = execFileSync("git", ["ls-tree", "-r", "--name-only", snapshotCommit, "--", schemaPrefix],
            { cwd: repositoryRoot, encoding: "utf8" }).trim().split(/\r?\n/);
        const baseMigrations = files.filter((file) => file.endsWith("/migration.sql")).sort();
        if (baseMigrations.length !== 43 || !baseMigrations.at(-1)?.includes("/20261106085039_task_41_connection_agent_separation/")) {
            throw new Error("Re-audit the immutable Story acceptance migration boundary.");
        }
        for (const file of files) {
            if (!file.startsWith(`${schemaPrefix}/`) || file.includes("..")) throw new Error("Invalid schema snapshot path");
            const destination = join(root, "snapshot", file);
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, execFileSync("git", ["show", `${snapshotCommit}:${file}`], { cwd: repositoryRoot }));
        }
        const overlays = [];
        for (const path of ["schema.prisma", `migrations/${overlayMigrationName}/migration.sql`]) {
            const bytes = await readFile(join(repositoryRoot, schemaPrefix, path));
            const destination = join(root, "snapshot", schemaPrefix, path);
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, bytes);
            overlays.push({ path, sha256: createHash("sha256").update(bytes).digest("hex") });
        }
        await writeFile(join(root, "schema-snapshot-manifest.json"), JSON.stringify({
            baseCommit: snapshotCommit, overlayMigrationName, overlaySource: "current-working-tree", overlays,
        }, null, 2));
        const dataRoot = join(root, "data");
        await mkdir(dataRoot);
        const databaseUrl = `file:${join(dataRoot, "cosmos.sqlite").replaceAll("\\", "/")}`;
        execFileSync(process.execPath, [resolvePrismaCliPath(), "migrate", "deploy", "--schema",
            join(root, "snapshot", schemaPrefix, "schema.prisma")],
        { cwd: repositoryRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "ignore" });
        const secretRefs = new Set<string>();
        const filesStore = new FileSecretStore({ root: join(dataRoot, "secrets") });
        // Opaque refs contain colons; literal Windows paths would create NTFS alternate streams.
        const fileRef = (ref: string) => createHash("sha256").update(ref).digest("hex");
        const secrets: SecretStorePort = {
            put: async (ref, value) => { secretRefs.add(ref); await filesStore.put(fileRef(ref), value); },
            read: (ref) => filesStore.read(fileRef(ref)), delete: (ref) => filesStore.delete(fileRef(ref)),
        };
        repository = new PrismaCosmosRepository({ dataRoot, secrets,
            prisma: new PrismaClient({ datasources: { db: { url: databaseUrl } } }) });
        await repository.initialize();
        return { root, repository, secretRefs };
    } catch {
        try { await repository?.close(); }
        finally {
            if (dirname(resolve(root)) !== parent || !basename(root).startsWith("task40-story-")) throw new Error("Unexpected isolation cleanup path");
            await rm(root, { recursive: true, force: true });
        }
        throw new Error("Isolated preparation failed.");
    }
}
