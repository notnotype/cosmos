import { afterEach, describe, expect, it } from "vitest";
import { runDocumentationCheck } from "../check-documentation.js";
import { cleanFixtures, fixture, put, volume } from "./fixtures.js";

afterEach(cleanFixtures);

describe("incremental documentation contracts", () => {
    it("checks changed targets through unchanged inbound sources", () => {
        const root = fixture({ "docs/source.md": "[old](target.md#old)\n", "docs/target.md": "# Old\n" });
        put(root, "docs/target.md", "# New\n");
        const report = runDocumentationCheck(root);
        expect(report.failures).toContainEqual(expect.stringContaining("docs/source.md -> target.md#old"));
        expect(report.anchorSources).toContain("docs/source.md");
        expect(report.changedFiles).toEqual(["docs/target.md"]);
        expect(report.mode).toBe("workspace");
    });

    it("reports malformed fragments in changed Markdown sources", () => {
        const root = fixture({ "docs/existing.md": "# Existing\n" });
        put(root, "docs/source.md", "[self](#100%)\n[target](existing.md#100%)\n");
        const report = runDocumentationCheck(root);
        expect(report.anchorSources).toContain("docs/source.md");
        expect(report.failures).toEqual([
            "相对链接片段 URL 编码无效：docs/source.md -> #100%",
            "相对链接片段 URL 编码无效：docs/source.md -> existing.md#100%",
        ]);
    });

    it("reports malformed inbound fragments only when the target enters anchor scope", () => {
        const root = fixture({ "docs/source.md": "[target](existing.md#100%)\n", "docs/existing.md": "# Existing\n" });
        expect(runDocumentationCheck(root).failures).toEqual([]);
        expect(runDocumentationCheck(root, { all: true }).failures).toEqual([
            "相对链接片段 URL 编码无效：docs/source.md -> existing.md#100%",
        ]);
        put(root, "docs/existing.md", "# Changed\n");
        const report = runDocumentationCheck(root);
        expect(report.anchorSources).toContain("docs/source.md");
        expect(report.failures).toEqual([
            "相对链接片段 URL 编码无效：docs/source.md -> existing.md#100%",
        ]);
    });

    it("accepts Chinese, encoded, duplicate, natural collision, Setext and HTML anchors", () => {
        const root = fixture();
        put(root, "docs/anchors.md", [
            "# 中文 标题", "# A", "# A", "# A-1", "# A", "Setext *title*", "===",
            "## A `code` and [link](https://example.invalid) ##", '<a name="named"></a><div id="explicit"></div>',
            "[中文](#%E4%B8%AD%E6%96%87-%E6%A0%87%E9%A2%98)", "[d](#a-1)", "[collision](#a-1-1)", "[d2](#a-2)",
            "[setext](#setext-title)", "[inline](#a-code-and-link)", "[name](#named)", "[id](#explicit)", "",
        ].join("\n"));
        expect(runDocumentationCheck(root).failures).toEqual([]);
    });

    it("ignores fenced headings and validates pure fragments and Markdown line anchors", () => {
        const root = fixture({ "code.ts": "// fixture\n" });
        put(root, "docs/new.md", "```md\n# Fake\n```\n~~~\n# Other\n~~~\n[x](#fake)\n[y](#other)\n[line](new.md#L12)\n[code](../code.ts#L12-L20)\n");
        const report = runDocumentationCheck(root);
        expect(report.failures.filter((failure) => failure.includes("锚点"))).toHaveLength(3);
        expect(report.failures.some((failure) => failure.includes("code.ts"))).toBe(false);
    });

    it("reports incremental limits and keeps historical anchors outside default scope", () => {
        const root = fixture({ "docs/old.md": "[debt](#missing)\n" });
        expect(runDocumentationCheck(root).failures).toEqual([]);
        expect(runDocumentationCheck(root).anchorSources).toEqual([]);
        expect(runDocumentationCheck(root).uncovered.length).toBeGreaterThan(0);
        expect(runDocumentationCheck(root, { all: true }).failures).toContainEqual(expect.stringContaining("#missing"));
        put(root, "docs/research/new.md", "[debt](#missing)\n");
        put(root, "docs/requirements/0001-original-requirements.md", "[debt](#missing)\n");
        expect(runDocumentationCheck(root).failures).toEqual([]);
    });

    it.each(["docs/book.md", "../book.md"])("accepts existing parent convention %s", (parent) => {
        const root = fixture({ "docs/book.md": "# Book\n" });
        put(root, "docs/book/01.md", volume(parent));
        expect(runDocumentationCheck(root).failures).toEqual([]);
    });

    it("detects missing headers from main-file/directory relation without metadata hints", () => {
        const root = fixture({ "docs/book.md": "# Book\n" });
        put(root, "docs/book/01.md", "# Unmarked volume\n");
        put(root, "docs/ordinary.md", "# Ordinary\n");
        const report = runDocumentationCheck(root);
        expect(report.failures).toContainEqual(expect.stringContaining("分册元数据"));
        expect(report.metadataFiles).toEqual(["docs/book/01.md"]);
    });

    it.each([
        ["range: 1-20", "range:"], ["sealed_at: 2026-02-28", "sealed_at: 2026-02-30"],
        ["tags: [testing, governance]", "tags: []"], ["tokens_est: 123", "tokens_est: 0"],
        ["parent: docs/book.md", "parent: docs/other.md"], ["parent: docs/book.md", "parent: missing.md"],
    ])("rejects invalid volume field %s", (from, to) => {
        const root = fixture({ "docs/book.md": "# Book\n", "docs/other.md": "# Other\n" });
        put(root, "docs/book/01.md", volume().replace(from, to));
        expect(runDocumentationCheck(root).failures).toContainEqual(expect.stringContaining("分册元数据"));
    });

    it("accepts tokens alias and block tags and explicit volume outside directory relation", () => {
        const root = fixture({ "docs/book.md": "# Book\n" });
        put(root, "docs/explicit.md", volume().replace("tokens_est:", "tokens:").replace("tags: [testing, governance]", "tags:\n  - testing\n  - governance"));
        expect(runDocumentationCheck(root).failures).toEqual([]);
        put(root, "docs/explicit.md", volume().replace("sealed_at: 2026-02-28\n", ""));
        expect(runDocumentationCheck(root).failures).toContainEqual(expect.stringContaining("sealed_at"));
    });

    it.each(["# New ", "# New\t\n", "# New\n\n", "# New"])("rejects added Markdown whitespace %j", (content) => {
        const root = fixture();
        put(root, "docs/new.md", content);
        expect(runDocumentationCheck(root).failures).toContainEqual(expect.stringContaining("空白"));
    });

    it("keeps metadata mandatory after an unrelated-directory volume loses its entire header", () => {
        const root = fixture({ "docs/book-v1.md": "# Book\n", "docs/history/01.md": volume("../book-v1.md") });
        put(root, "docs/history/01.md", "# Header removed\n");
        expect(runDocumentationCheck(root).failures).toContainEqual(expect.stringContaining("分册元数据"));
        put(root, "docs/history/01.md", volume("../book-v1.md") + "\nMore content.\n");
        expect(runDocumentationCheck(root).failures).toEqual([]);
    });

    it("detects new nonmatching volumes only through an explicit volume declaration", () => {
        const root = fixture({ "docs/book-v1.md": "# Book\n\n> 分册：[new](book-history/part-1.md)\n" });
        put(root, "docs/book-history/part-1.md", "# Missing header\n");
        expect(runDocumentationCheck(root).failures).toContainEqual(expect.stringContaining("分册元数据"));
    });

    it("does not turn ordinary nested links into volume declarations", () => {
        const root = fixture({ "docs/book-v1.md": "# Book\n\n分册另列。\n\n[ordinary](examples/example.md)\n" });
        put(root, "docs/examples/example.md", "# Ordinary\n");
        expect(runDocumentationCheck(root).metadataFiles).toEqual([]);
    });

    it("exempts ordinary ERRATA and README but checks explicitly governed ones", () => {
        const root = fixture({ "docs/book.md": "# Book\n" });
        put(root, "docs/book/ERRATA.md", "# Errata\n");
        put(root, "docs/book/README.md", "# Entry\n");
        put(root, "docs/book/ordinary.md", "# Ordinary\n");
        expect(runDocumentationCheck(root).metadataFiles).toEqual([]);
        put(root, "docs/book/ERRATA.md", volume().replace("tokens_est: 123", "tokens_est: 0"));
        expect(runDocumentationCheck(root).metadataFiles).toEqual(["docs/book/ERRATA.md"]);
        expect(runDocumentationCheck(root).failures).toContainEqual(expect.stringContaining("分册元数据"));
    });

    it("accepts the explicit active-volume date marker and parent outside docs", () => {
        const root = fixture({ "PROJECT-STATUS.md": "# Status\n" });
        put(root, "docs/undo.md", volume("PROJECT-STATUS.md").replace("2026-02-28", "—"));
        expect(runDocumentationCheck(root).failures).toEqual([]);
        put(root, "docs/undo.md", volume("PROJECT-STATUS.md").replace("2026-02-28", "unknown"));
        expect(runDocumentationCheck(root).failures).toContainEqual(expect.stringContaining("sealed_at"));
    });

    it("rejects conflicting token estimates and accepts equal aliases", () => {
        const root = fixture({ "docs/book.md": "# Book\n" });
        put(root, "docs/book/01.md", volume("docs/book.md", "tokens: 124\n"));
        expect(runDocumentationCheck(root).failures).toContainEqual(expect.stringContaining("tokens"));
        put(root, "docs/book/01.md", volume("docs/book.md", "tokens: 123\n"));
        expect(runDocumentationCheck(root).failures).toEqual([]);
    });

    it("preserves literal underscores and ignores HTML anchors inside inline code", () => {
        const root = fixture();
        put(root, "docs/new.md", '# snake_case\n# **Bold** and _Emphasis_\n[x](#snake_case)\n[y](#bold-and-emphasis)\n`<a id="fake"></a>`\n[z](#fake)\n');
        const report = runDocumentationCheck(root);
        expect(report.failures.filter((failure) => failure.includes("锚点"))).toEqual([
            expect.stringContaining("#fake"),
        ]);
    });

    it("checks whitespace for new Markdown outside active navigation sources", () => {
        const root = fixture();
        put(root, "packages/example/README.md", "# New ");
        put(root, "docs/research/new.md", "# New\t\n");
        const report = runDocumentationCheck(root);
        expect(report.whitespaceFiles).toEqual(["docs/research/new.md", "packages/example/README.md"]);
        expect(report.failures).toContainEqual(expect.stringContaining("packages/example/README.md"));
        expect(report.failures).toContainEqual(expect.stringContaining("docs/research/new.md"));
    });

    it("allows two-space body hardbreaks and ignores historical whitespace", () => {
        const root = fixture({ "docs/old.md": "# Old \n\n" });
        put(root, "docs/new.md", "# New\n\nbody  \nnext\n");
        expect(runDocumentationCheck(root).failures).toEqual([]);
        put(root, "docs/old.md", "# Edited \n\n");
        expect(runDocumentationCheck(root).failures).toEqual([]);
    });
});
