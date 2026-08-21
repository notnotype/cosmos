import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";

export interface DocumentationCheckReport {
    failures: string[];
    checkedFiles: number;
}

const requiredIndexes = [
    ".agents/README.md",
    ".agents/tasks/README.md",
    ".agents/tasks/AGENTS.md",
    ".local/README.md",
    "docs/README.md",
    "docs/proposals/README.md",
    "docs/standards/README.md",
    "docs/standards/repository-workflow.md",
    "docs/testing/README.md",
] as const;

const retiredPaths = ["docs/tasks/", "docs/testing.md"] as const;

const windowsAbsolutePathPattern = /^[a-z]:[\\/]/iu;
const rootReadmeGitShaPattern = /\b[0-9a-f]{7,40}\b/iu;


export function checkDocumentation(
    repoRoot: string,
    paths?: readonly string[],
): DocumentationCheckReport {
    const normalizedRoot = resolve(repoRoot);
    const candidates = paths ?? listRepositoryFiles(normalizedRoot);
    const files = [...new Set(candidates.map(normalizeRepoPath))]
        .filter((path) => isRegularFile(normalizedRoot, path))
        .sort();
    const fileSet = new Set(files);
    const failures: string[] = [];

    for (const path of requiredIndexes) {
        if (!fileSet.has(path)) {
            failures.push(`缺少文档治理入口：${path}`);
        }
    }

    for (const path of retiredPaths) {
        if (existsSync(resolve(normalizedRoot, path))) {
            failures.push(`已退休文档路径仍然存在：${path}`);
        }
    }

    if (fileSet.has("README.md")) {
        const rootReadme = readFileSync(
            resolve(normalizedRoot, "README.md"),
            "utf8",
        );
        const rootNavigation = collectRelativeLinkTargets(rootReadme);
        const hasAgentGovernanceLink = rootNavigation.some((url) => {
            const encodedPath = url.split("#", 1)[0].split("?", 1)[0];
            try {
                return posix.normalize(decodeURIComponent(encodedPath))
                    === ".agents/README.md";
            } catch {
                return false;
            }
        });
        if (!hasAgentGovernanceLink) {
            failures.push(
                "根文档入口缺少 Agent 治理链接：README.md -> .agents/README.md",
            );
        }
        if (rootReadmeGitShaPattern.test(rootReadme)) {
            failures.push(
                "根 README 不得缓存 Git 提交 SHA；当前基线与验证结果只写入 PROJECT-STATUS.md",
            );
        }
    }

    for (const source of files.filter(isActiveMarkdown)) {
        const markdown = readFileSync(resolve(normalizedRoot, source), "utf8");
        for (const url of collectRelativeLinkTargets(markdown)) {
            checkRelativeLink(normalizedRoot, source, url, failures);
        }
    }

    return { failures, checkedFiles: files.length };
}

function listRepositoryFiles(repoRoot: string): string[] {
    const result = spawnSync(
        "git",
        ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        { cwd: repoRoot, encoding: "utf8", windowsHide: true },
    );
    if (result.error || result.status !== 0) {
        const detail = result.error instanceof Error
            ? result.error.message
            : result.stderr.trim() || `exit ${result.status ?? "unknown"}`;
        throw new Error(`无法列出仓库文件：${detail}`);
    }
    return result.stdout.split("\0").filter(Boolean);
}

function normalizeRepoPath(path: string): string {
    return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function isRegularFile(repoRoot: string, path: string): boolean {
    const absolutePath = resolve(repoRoot, path);
    if (!existsSync(absolutePath)) {
        return false;
    }
    const stats = lstatSync(absolutePath);
    return stats.isFile() && !stats.isSymbolicLink();
}

function isActiveMarkdown(path: string): boolean {
    if (!path.endsWith(".md")) {
        return false;
    }
    if (!path.includes("/")) {
        return true;
    }
    if (path === ".local/README.md" || path.startsWith(".github/")) {
        return true;
    }
    if (path.startsWith("docs/")) {
        return path !== "docs/requirements/0001-original-requirements.md"
            && !path.startsWith("docs/research/");
    }
    return path.startsWith(".agents/");
}

function collectRelativeLinkTargets(markdown: string): string[] {
    const text = stripMarkdownCode(markdown);
    const targets: string[] = [];
    const inlineLinkPattern = /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu;
    const referenceDefinitionPattern = /^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|([^\s]+))/gmu;

    for (const match of text.matchAll(inlineLinkPattern)) {
        const target = match[1] ?? match[2];
        if (target) {
            targets.push(target);
        }
    }
    for (const match of text.matchAll(referenceDefinitionPattern)) {
        const target = match[1] ?? match[2];
        if (target) {
            targets.push(target);
        }
    }

    return targets;
}

function stripMarkdownCode(markdown: string): string {
    let fenceMarker: string | undefined;
    const withoutFences = markdown.split(/(?<=\n)/u).map((line) => {
        const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
        if (fenceMarker) {
            if (fence?.[0] === fenceMarker[0] && fence.length >= fenceMarker.length) {
                fenceMarker = undefined;
            }
            return line.endsWith("\n") ? "\n" : "";
        }
        if (fence) {
            fenceMarker = fence;
            return line.endsWith("\n") ? "\n" : "";
        }
        return line;
    }).join("");

    return withoutFences.split("\n").map(stripInlineCode).join("\n");
}

function stripInlineCode(line: string): string {
    let result = "";
    let index = 0;
    while (index < line.length) {
        if (line[index] !== "`") {
            result += line[index];
            index += 1;
            continue;
        }
        let markerLength = 1;
        while (line[index + markerLength] === "`") {
            markerLength += 1;
        }
        const marker = "`".repeat(markerLength);
        const closingIndex = line.indexOf(marker, index + markerLength);
        if (closingIndex === -1) {
            result += marker;
            index += markerLength;
            continue;
        }
        result += " ".repeat(closingIndex + markerLength - index);
        index = closingIndex + markerLength;
    }
    return result;
}

function checkRelativeLink(
    repoRoot: string,
    source: string,
    url: string,
    failures: string[],
): void {
    if (url.includes("\\")) {
        failures.push(`相对链接必须使用正斜杠：${source} -> ${url}`);
        return;
    }
    if (windowsAbsolutePathPattern.test(url)) {
        failures.push(`相对链接越出仓库：${source} -> ${url}`);
        return;
    }
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/iu.test(url)) {
        return;
    }

    const encodedPath = url.split("#", 1)[0].split("?", 1)[0];
    if (!encodedPath) {
        return;
    }

    let decodedPath: string;
    try {
        decodedPath = decodeURIComponent(encodedPath);
    } catch {
        failures.push(`相对链接 URL 编码无效：${source} -> ${url}`);
        return;
    }
    if (windowsAbsolutePathPattern.test(decodedPath)) {
        failures.push(`相对链接越出仓库：${source} -> ${url}`);
        return;
    }
    if (decodedPath.includes("\\")) {
        failures.push(`相对链接必须使用正斜杠：${source} -> ${url}`);
        return;
    }
    if (posix.isAbsolute(decodedPath)) {
        failures.push(`相对链接越出仓库：${source} -> ${url}`);
        return;
    }

    const target = posix.normalize(posix.join(posix.dirname(source), decodedPath));
    if (target === ".." || target.startsWith("../") || posix.isAbsolute(target)) {
        failures.push(`相对链接越出仓库：${source} -> ${url}`);
        return;
    }
    if (!existsSync(resolve(repoRoot, target))) {
        failures.push(`相对链接目标不存在：${source} -> ${url}（${target}）`);
    }
}

if (import.meta.main) {
    const report = checkDocumentation(resolve(dirname(import.meta.path), ".."));
    console.log(JSON.stringify(report, null, 2));
    if (report.failures.length > 0) {
        process.exitCode = 1;
    }
}
