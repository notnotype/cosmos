import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 测试保留根的清理。
 *
 * `model-configuration-lock`、`model-provider-*`、`story-agent-isolation` 这些用例会**刻意**
 * 留下隔离根供失败复盘（用例里会 `console.info("Retained ... root")`），但没有任何回收手段：
 * 一轮全量新增二十来个目录，长期累积到十几 GB 之后，磁盘写满会表现成随机的用例失败。
 *
 * 默认只报告不删除；删目录必须显式 `--apply`。
 */

/** 唯一允许删除的根：仓库下的 `.agent/tmp`。 */
export function artifactRoot(repositoryRoot: string): string {
    return join(repositoryRoot, ".agent", "tmp");
}

export type ArtifactEntry = { name: string; mtimeMs: number };

/** 挑出比 `maxAgeMs` 更早的保留根；纯函数，规则可以直接在测试里钉住。 */
export function selectExpiredArtifacts(
    entries: readonly ArtifactEntry[],
    nowMs: number,
    maxAgeMs: number,
): ArtifactEntry[] {
    return entries.filter((entry) => nowMs - entry.mtimeMs >= maxAgeMs);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
    const apply = args.includes("--apply");
    const daysArg = args.find((arg) => arg.startsWith("--days="));
    const days = daysArg ? Number(daysArg.slice("--days=".length)) : 7;
    if (!Number.isFinite(days) || days < 1) {
        throw new Error(`无效的 --days 取值: ${daysArg ?? ""}`);
    }

    const root = artifactRoot(process.cwd());
    let names: string[];
    try {
        names = await readdir(root);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            console.log(`没有需要清理的测试保留根：${root} 不存在。`);
            return;
        }
        throw error;
    }

    // 只按目录 mtime 判断：这些根内容量级差很多，逐个统计字节只会让清理本身变慢。
    const entries: ArtifactEntry[] = [];
    for (const name of names) {
        const stats = await stat(join(root, name)).catch(() => null);
        if (stats?.isDirectory()) {
            entries.push({ name, mtimeMs: stats.mtimeMs });
        }
    }

    const expired = selectExpiredArtifacts(entries, Date.now(), days * 24 * 60 * 60 * 1_000);
    console.log(`保留根共 ${entries.length} 个，早于 ${days} 天的 ${expired.length} 个。`);
    if (!apply) {
        console.log("只报告不删除；确认后加 --apply。");
        return;
    }
    for (const entry of expired) {
        await rm(join(root, entry.name), { recursive: true, force: true });
    }
    console.log(`已删除 ${expired.length} 个保留根。`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    await main();
}
