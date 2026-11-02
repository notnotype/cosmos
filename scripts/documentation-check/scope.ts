import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { git } from "./git.js";

export interface Snapshot {
    files: string[];
    exists(path: string): boolean;
    read(path: string): string;
}

export function normalizePath(path: string): string {
    return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function workspace(root: string, paths?: readonly string[]): Snapshot {
    const candidates = paths ?? git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean);
    const files = [...new Set(candidates.map(normalizePath))].filter((path) => {
        const target = resolve(root, path);
        return existsSync(target) && lstatSync(target).isFile() && !lstatSync(target).isSymbolicLink();
    }).sort();
    return {
        files,
        exists: (path) => existsSync(resolve(root, path)),
        read: (path) => readFileSync(resolve(root, path), "utf8"),
    };
}

export function gitSnapshot(root: string, mode: "staged" | "ci", ref = "HEAD"): Snapshot {
    const output = mode === "staged"
        ? git(root, ["ls-files", "--stage", "-z"])
        : git(root, ["ls-tree", "-r", "-z", ref]);
    const objects = new Map<string, string>();
    for (const row of output.split("\0").filter(Boolean)) {
        const tab = row.indexOf("\t");
        const [permissions, second, third] = row.slice(0, tab).split(" ");
        const path = row.slice(tab + 1);
        if (tab < 0 || !path) throw new Error("无法解析 Git 快照");
        if (mode === "staged" && third !== "0") throw new Error(`暂存区存在未解决冲突：${path}`);
        if (permissions === "100644" || permissions === "100755") {
            objects.set(path, mode === "staged" ? second : third);
        }
    }
    const files = [...objects.keys()].sort();
    const directories = new Set<string>(["."]);
    for (const path of files) {
        const parts = path.split("/");
        while (parts.length > 1) {
            parts.pop();
            directories.add(parts.join("/"));
        }
    }
    const cache = new Map<string, string>();
    return {
        files,
        exists: (path) => objects.has(path.replace(/\/$/u, "")) || directories.has(path.replace(/\/$/u, "")),
        read: (path) => {
            const oid = objects.get(path);
            if (!oid) throw new Error(`快照文件不存在：${path}`);
            let text = cache.get(path);
            if (text === undefined) {
                text = git(root, ["cat-file", "blob", oid]);
                cache.set(path, text);
            }
            return text;
        },
    };
}

export function isActiveMarkdown(path: string): boolean {
    if (!path.endsWith(".md")) return false;
    if (!path.includes("/")) return true;
    if (path === ".local/README.md" || path.startsWith(".github/")) return true;
    if (path.startsWith("docs/")) {
        return path !== "docs/requirements/0001-original-requirements.md" && !path.startsWith("docs/research/");
    }
    return path.startsWith(".agents/");
}
