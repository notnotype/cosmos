import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { resolvePrismaCliPath } from "./prisma-cli.js";

/** sqlite 文件路径转 Prisma 的 datasource url。 */
export function sqliteUrl(databasePath: string): string {
    return `file:${databasePath.replaceAll("\\", "/")}`;
}

/** 包内 canonical 的那份 schema。 */
export function defaultSchemaPath(): string {
    return resolve(process.cwd(), "packages/storage-prisma/prisma/schema.prisma");
}

/**
 * 把指定 schema 部署到某个 DB 文件。**不截断文件**，所以可以在同一个 DB 上分步部署——
 * 升级类用例要先部署 legacy schema、再用当前 schema 覆盖同一个文件。
 */
export function deploySchema(databasePath: string, schemaPath?: string): void {
    execFileSync(process.execPath, [
        resolvePrismaCliPath(),
        "migrate",
        "deploy",
        "--schema",
        schemaPath ?? defaultSchemaPath(),
    ], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: sqliteUrl(databasePath) },
        stdio: "ignore",
    });
}

/** 已部署好的模板库（key = schema 路径）；同一测试文件内的用例共用一份。 */
const templates = new Map<string, Promise<string>>();
const templateRoots: string[] = [];

/**
 * 在 `root` 里铺出一个已部署 schema 的空库并返回它的路径。
 *
 * 逐用例执行一次 `prisma migrate deploy`（当前 45 个迁移）要 4~6 秒，而拷贝一份部署好的
 * 模板库只要几毫秒；两者交给用例的都是「逐用例全新、结构相同」的库。模板按**测试文件**
 * 缓存而不是跨文件共享：共享临时文件会让并发 worker 互相抢同一个文件，那正是本仓历史上
 * EBUSY 与超时抖动的来源，所以宁可每个文件多付一次部署。
 */
export async function materializeDatabase(root: string, schemaPath?: string): Promise<string> {
    const template = await schemaTemplate(schemaPath);
    const databasePath = join(root, "cosmos.sqlite");
    await copyFile(template, databasePath);
    return databasePath;
}

/**
 * 删除模板根。必须由 `afterAll` 调用：模板要活过整个文件的用例，放进逐用例清理会把
 * 后续用例依赖的模板提前删掉。
 */
export async function releaseSchemaTemplates(): Promise<void> {
    const roots = templateRoots.splice(0);
    templates.clear();
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}

function schemaTemplate(schemaPath?: string): Promise<string> {
    const key = schemaPath ?? "default";
    let template = templates.get(key);
    if (!template) {
        template = createSchemaTemplate(schemaPath);
        templates.set(key, template);
    }
    return template;
}

async function createSchemaTemplate(schemaPath?: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cosmos-schema-template-"));
    templateRoots.push(root);
    const databasePath = join(root, "cosmos.sqlite");
    writeFileSync(databasePath, new Uint8Array());
    deploySchema(databasePath, schemaPath);
    return databasePath;
}
