import { withoutFences, collectRelativeLinkTargets, stripInlineCode } from "./markdown.js";
import { relativeLink } from "./links.js";
import { isActiveMarkdown, type Snapshot } from "./scope.js";

function plainHeading(text: string): string {
    return text.replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
        .replace(/\[([^\]]*)\]\[[^\]]*\]/gu, "$1")
        .replace(/<[^>]*>/gu, "")
        .replace(/&amp;/gu, "&").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">")
        .replace(/&quot;/gu, '"').replace(/&#39;/gu, "'")
        .replace(/&#(x[\da-f]+|\d+);/giu, (_, code: string) => {
            const value = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
            return value <= 0x10ffff ? String.fromCodePoint(value) : "";
        })
        .replace(/(?<![\p{L}\p{N}])(_{1,2})(\S(?:.*?\S)?)\1(?![\p{L}\p{N}])/gu, "$2")
        .replace(/[`*~]/gu, "");
}

export function anchors(markdown: string): Set<string> {
    const text = withoutFences(markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, ""))
        .replace(/<!--[\s\S]*?-->/gu, "");
    const result = new Set<string>();
    const headingIds = new Set<string>();
    const lines = text.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index++) {
        const atx = /^ {0,3}#{1,6}(?:[\t ]+(.*)|$)/u.exec(lines[index]);
        const setext = index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/u.test(lines[index + 1]) && lines[index].trim();
        if (atx || setext) {
            const heading = atx ? (atx[1] ?? "").replace(/[\t ]+#+[\t ]*$/u, "") : lines[index].trim();
            const base = plainHeading(heading).toLowerCase()
                .replace(/[^\p{L}\p{M}\p{N}\p{Zs}\t _-]/gu, "")
                .replace(/[\t ]/gu, "-");
            let slug = base;
            let suffix = 0;
            while (headingIds.has(slug)) slug = `${base}-${++suffix}`;
            headingIds.add(slug);
            result.add(slug);
            if (setext && !atx) index++;
        }
    }
    const html = text.split("\n").map(stripInlineCode).join("\n");
    for (const match of html.matchAll(/<[a-z][^>]*\s(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/giu)) {
        result.add(match[1] ?? match[2] ?? match[3]);
    }
    return result;
}

export function checkAnchors(snapshot: Snapshot, changed: readonly string[], all: boolean, failures: string[]): string[] {
    const changedTargets = new Set(changed.filter((path) => path.endsWith(".md")));
    const scope: string[] = [];
    const cache = new Map<string, Set<string>>();
    const fileSet = new Set(snapshot.files);
    for (const source of snapshot.files.filter(isActiveMarkdown)) {
        const urls = collectRelativeLinkTargets(snapshot.read(source));
        const inScope = all || changedTargets.has(source) || urls.some((url) => {
            const link = relativeLink(source, url, []);
            return link && changedTargets.has(link.target);
        });
        if (!inScope) continue;
        scope.push(source);
        for (const url of urls) {
            const link = relativeLink(source, url, []);
            if (!link?.fragment || !link.target.endsWith(".md") || !fileSet.has(link.target)) continue;
            let fragment: string;
            try {
                fragment = decodeURIComponent(link.fragment);
            } catch {
                failures.push(`相对链接片段 URL 编码无效：${source} -> ${url}`);
                continue;
            }
            let ids = cache.get(link.target);
            if (!ids) {
                ids = anchors(snapshot.read(link.target));
                cache.set(link.target, ids);
            }
            if (!ids.has(fragment)) failures.push(`相对链接锚点不存在：${source} -> ${url}（${link.target}#${fragment}）`);
        }
    }
    return scope;
}
