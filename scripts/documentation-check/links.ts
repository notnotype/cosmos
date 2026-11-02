import { posix } from "node:path";
import type { Snapshot } from "./scope.js";

export interface RelativeLink { target: string; fragment?: string }

export function relativeLink(source: string, url: string, failures: string[]): RelativeLink | undefined {
    const hash = url.indexOf("#");
    const path = hash < 0 ? url : url.slice(0, hash);
    const windowsAbsolute = /^[a-z]:[\\/]/iu;
    if (path.includes("\\")) {
        failures.push(`相对链接必须使用正斜杠：${source} -> ${url}`);
        return;
    }
    if (windowsAbsolute.test(path)) {
        failures.push(`相对链接越出仓库：${source} -> ${url}`);
        return;
    }
    if (/^[a-z][a-z0-9+.-]*:/iu.test(path)) return;
    let decoded: string;
    const fragment = hash < 0 ? undefined : url.slice(hash + 1);
    try {
        decoded = decodeURIComponent(path.split("?", 1)[0]);
    } catch {
        failures.push(`相对链接 URL 编码无效：${source} -> ${url}`);
        return;
    }
    if (decoded.includes("\\")) {
        failures.push(`相对链接必须使用正斜杠：${source} -> ${url}`);
        return;
    }
    if (windowsAbsolute.test(decoded) || posix.isAbsolute(decoded)) {
        failures.push(`相对链接越出仓库：${source} -> ${url}`);
        return;
    }
    const target = decoded ? posix.normalize(posix.join(posix.dirname(source), decoded)) : source;
    if (target === ".." || target.startsWith("../") || posix.isAbsolute(target)) {
        failures.push(`相对链接越出仓库：${source} -> ${url}`);
        return;
    }
    return { target, fragment };
}

export function checkPath(snapshot: Snapshot, source: string, url: string, failures: string[]): RelativeLink | undefined {
    const link = relativeLink(source, url, failures);
    if (link && !snapshot.exists(link.target)) {
        failures.push(`相对链接目标不存在：${source} -> ${url}（${link.target}）`);
        return;
    }
    return link;
}
