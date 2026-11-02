import { posix } from "node:path";
import { collectRelativeLinkTargets } from "./markdown.js";
import { relativeLink } from "./links.js";
import { isActiveMarkdown, type Snapshot } from "./scope.js";

function fields(text: string): Map<string, string> {
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)?.[1];
    const values = new Map<string, string>();
    if (!header) return values;
    let key = "";
    for (const line of header.split(/\r?\n/u)) {
        const pair = /^([a-z_]+):\s*(.*?)\s*$/u.exec(line);
        if (pair) {
            key = pair[1];
            values.set(key, pair[2].replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2"));
        } else if (key === "tags" && /^\s+-\s+\S/u.test(line)) {
            values.set(key, `${values.get(key) ?? ""}\n${line.trim()}`);
        }
    }
    return values;
}

function explicit(values: Map<string, string>): boolean {
    return ["parent", "range", "sealed_at", "tokens_est"].some((key) => values.has(key));
}

function correspondingMain(snapshot: Snapshot, path: string): string | undefined {
    let directory = posix.dirname(path);
    while (directory !== ".") {
        if (snapshot.files.includes(`${directory}.md`)) return `${directory}.md`;
        directory = posix.dirname(directory);
    }
    return;
}

function declaredParents(snapshot: Snapshot): Map<string, string> {
    const result = new Map<string, string>();
    for (const source of snapshot.files.filter(isActiveMarkdown)) {
        const text = snapshot.read(source);
        if (explicit(fields(text))) continue;
        let sectionDepth = 0;
        const declared = text.split(/\r?\n/u).filter((line) => {
            const heading = /^(#{1,6})\s+(.*)/u.exec(line);
            if (heading) {
                if (sectionDepth && heading[1].length <= sectionDepth) sectionDepth = 0;
                if (/分册/u.test(heading[2])) sectionDepth = heading[1].length;
            }
            return sectionDepth > 0 || /分册[^\n：:]{0,8}[：:]/u.test(line);
        }).join("\n");
        for (const url of collectRelativeLinkTargets(declared)) {
            const target = relativeLink(source, url, [])?.target;
            if (target?.endsWith(".md") && posix.dirname(target).startsWith(`${posix.dirname(source)}/`)) {
                result.set(target, source);
            }
        }
    }
    return result;
}

function realDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTags(value: string): boolean {
    if (value.startsWith("[")) {
        return /^\[.+\]$/u.test(value) && value.slice(1, -1).split(",").every((tag) => Boolean(tag.trim().replace(/^['"]|['"]$/gu, "")));
    }
    return value.split("\n").filter(Boolean).length > 0 && value.split("\n").filter(Boolean).every((tag) => /^-\s+\S/u.test(tag));
}

export function checkMetadata(snapshot: Snapshot, changed: readonly string[], failures: string[], previous?: Snapshot): string[] {
    const checked: string[] = [];
    const declarations = declaredParents(snapshot);
    for (const path of changed.filter(isActiveMarkdown)) {
        if (!snapshot.files.includes(path)) continue;
        const values = fields(snapshot.read(path));
        const old = previous?.files.includes(path) ? fields(previous.read(path)) : new Map<string, string>();
        const main = correspondingMain(snapshot, path);
        const special = ["README.md", "ERRATA.md"].includes(posix.basename(path));
        const declared = special ? undefined : declarations.get(path);
        const namedVolume = /^(?:\d+(?:[-.]|$)|part[-_]|history[-_.])/iu.test(posix.basename(path, ".md"));
        if (!explicit(values) && !explicit(old) && !declared && (!main || !namedVolume || special)) continue;
        checked.push(path);
        const invalid: string[] = [];
        if (!values.get("range")?.trim()) invalid.push("range");
        const sealedAt = values.get("sealed_at") ?? "";
        if (sealedAt !== "—" && !realDate(sealedAt)) invalid.push("sealed_at");
        if (!validTags(values.get("tags") ?? "")) invalid.push("tags");
        const estimates = [values.get("tokens"), values.get("tokens_est")].filter((value) => value !== undefined);
        if (!estimates.length || !estimates.every((value) => /^\d+(?:\.\d+)?$/u.test(value) && Number(value) > 0) || new Set(estimates.map(Number)).size > 1) invalid.push("tokens/tokens_est");
        const parent = values.get("parent");
        const candidates = parent && !parent.includes("\\") && !posix.isAbsolute(parent)
            ? [posix.normalize(parent), posix.normalize(posix.join(posix.dirname(path), parent))] : [];
        const oldParent = old.get("parent");
        const oldTarget = oldParent && [posix.normalize(oldParent), posix.normalize(posix.join(posix.dirname(path), oldParent))]
            .find((candidate) => previous?.files.includes(candidate));
        const expected = main ?? declared ?? oldTarget;
        const valid = candidates.find((candidate) => candidate !== path && snapshot.files.includes(candidate) && candidate.endsWith(".md") && (!expected || candidate === expected));
        if (!valid) invalid.push("parent");
        if (invalid.length) failures.push(`分册元数据无效：${path}（${invalid.join("、")}）`);
    }
    return checked;
}
