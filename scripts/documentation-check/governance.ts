import { posix } from "node:path";
import { collectRelativeLinkTargets } from "./markdown.js";
import { checkPath } from "./links.js";
import { isActiveMarkdown, type Snapshot } from "./scope.js";

const requiredIndexes = [
    ".agents/README.md", ".agents/tasks/README.md", ".agents/tasks/AGENTS.md", ".local/README.md",
    "docs/README.md", "docs/proposals/README.md", "docs/standards/README.md",
    "docs/standards/repository-workflow.md", "docs/testing/README.md", ".github/SECURITY.md",
];

function hasTarget(urls: readonly string[], expected: string): boolean {
    return urls.some((url) => {
        try { return posix.normalize(decodeURIComponent(url.split("#", 1)[0].split("?", 1)[0])) === expected; }
        catch { return false; }
    });
}

function hasAdmission(markdown: string, label: string, predicate: (cell: string) => boolean): boolean {
    return markdown.split(/\r?\n/u).some((line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|")) return false;
        const cells = trimmed.split("|").slice(1, -1).map((cell) => cell.trim());
        return cells.length >= 3 && cells[0] === label && predicate(cells[2]);
    });
}

export function checkGovernance(snapshot: Snapshot, failures: string[]): void {
    const files = new Set(snapshot.files);
    for (const path of requiredIndexes) {
        if (!files.has(path)) failures.push(`缺少文档治理入口：${path}`);
    }
    for (const path of ["docs/tasks/", "docs/testing.md"]) {
        if (snapshot.exists(path)) failures.push(`已退休文档路径仍然存在：${path}`);
    }
    if (files.has("README.md")) {
        const markdown = snapshot.read("README.md");
        if (!hasTarget(collectRelativeLinkTargets(markdown), ".agents/README.md")) {
            failures.push("根文档入口缺少 Agent 治理链接：README.md -> .agents/README.md");
        }
        if (/\b[0-9a-f]{7,40}\b/iu.test(markdown)) {
            failures.push("根 README 不得缓存 Git 提交 SHA；当前基线与验证结果只写入 PROJECT-STATUS.md");
        }
    }
    const workflow = "docs/standards/repository-workflow.md";
    if (files.has(workflow)) {
        const markdown = snapshot.read(workflow);
        if (!hasTarget(collectRelativeLinkTargets(markdown), "../../.github/SECURITY.md")) {
            failures.push("仓库流程缺少私密安全报告链接：docs/standards/repository-workflow.md -> .github/SECURITY.md");
        }
        if (!hasAdmission(markdown, "违反当前安全合同的漏洞", (cell) => cell.startsWith("禁止") && hasTarget(collectRelativeLinkTargets(cell), "../../.github/SECURITY.md"))) {
            failures.push("仓库流程缺少私密安全报告路由：docs/standards/repository-workflow.md");
        }
        if (!hasAdmission(markdown, "当前合同可判定的局部非安全 Bug", (cell) => cell === "需要")) {
            failures.push("仓库流程缺少非安全 Bug 公开 Issue 路由：docs/standards/repository-workflow.md");
        }
    }
    for (const source of snapshot.files.filter(isActiveMarkdown)) {
        for (const url of collectRelativeLinkTargets(snapshot.read(source))) checkPath(snapshot, source, url, failures);
    }
}
