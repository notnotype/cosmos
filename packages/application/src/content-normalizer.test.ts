import type { StructuredSourceBlock } from "@cosmos/domain";
import { describe, expect, it } from "vitest";
import { structuredSourceBlockSchema } from "@cosmos/contracts";
import { adaptLegacyContentText, normalizeContent } from "./content-normalizer.js";

describe("content normalizer", () => {
    it("normalizes plain text and is deterministic", () => {
        const source = { format: "plain-text", text: "Hello  world" } as const;
        expect(normalizeContent(source)).toEqual(normalizeContent(source));
        expect(normalizeContent(source)).toMatchObject({ status: "complete", contentText: "Hello world", blocks: [{ type: "paragraph" }] });
    });

    it("preserves image positions among paragraphs", () => {
        const result = normalizeContent({ format: "safe-html-input", html: "<p>before</p><img src='/a.png'><p>middle</p><img src='/b.png'><p>after</p>", baseUrl: "https://example.test/story" });
        expect(result.blocks.map((block) => block.type)).toEqual(["paragraph", "image", "paragraph", "image", "paragraph"]);
        expect(result.contentText).toBe("before middle after");
        expect(result.blocks.filter((block) => block.type === "image").map((block) => block.data.sourceUrl)).toEqual(["https://example.test/a.png", "https://example.test/b.png"]);
        expect(result.blocks.every((block) => !("assetId" in block.data))).toBe(true);
    });

    it("splits inline media from surrounding text in one container", () => {
        const result = normalizeContent({
            format: "safe-html-input",
            html: "<article>before <img src='/inline.png' alt='figure'> after</article>",
            baseUrl: "https://example.test/story",
        });
        expect(result.blocks.map((block) => block.type)).toEqual(["paragraph", "image", "paragraph"]);
        expect(result.blocks[1]).toMatchObject({ type: "image", data: { sourceUrl: "https://example.test/inline.png" } });
        expect(result.contentText).toBe("before figure after");
    });

    it("keeps safe inline emphasis and links while removing unsafe links", () => {
        const result = normalizeContent({ format: "safe-html-input", html: "<p>A <strong>bold</strong> <em>word</em> <a href='javascript:alert(1)'>bad</a> <a href='/ok'>good</a></p>", baseUrl: "https://example.test/base" });
        expect(result.contentText).toContain("A bold word bad good");
        const paragraph = result.blocks[0];
        expect(paragraph?.type).toBe("paragraph");
        if (paragraph?.type === "paragraph") {
            expect(paragraph.data.inlines.map((inline) => inline.type)).toEqual(["text", "strong", "text", "emphasis", "text", "text", "text", "link"]);
            expect(paragraph.data.inlines.at(-1)).toMatchObject({ type: "link", url: "https://example.test/ok" });
        }
        expect(result.qualitySignals.warningCount).toBeGreaterThan(0);
    });

    it("converts lists and tables within bounded structure", () => {
        const result = normalizeContent({ format: "safe-html-input", html: "<ol><li>one</li><li>two</li></ol><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>" });
        expect(result.blocks.map((block) => block.type)).toEqual(["list", "table"]);
        expect(result.blocks[0]).toMatchObject({ type: "list", data: { ordered: true, items: [{ inlines: [{ type: "text", text: "one" }] }, { inlines: [{ type: "text", text: "two" }] }] } });
        expect(result.blocks[1]).toMatchObject({ type: "table", data: { columns: ["A", "B"], rows: [["1", "2"]] } });
    });

    it("counts list levels independently from surrounding containers", () => {
        const result = normalizeContent({ format: "safe-html-input", html: "<article><section><div><ul><li>one<ul><li>two<ul><li>three</li></ul></li></ul></li></ul></div></section></article>" });
        expect(result.status).toBe("complete");
        expect(result.contentText).toBe("one two three");
        expect(result.blocks[0]).toMatchObject({ type: "list", data: { items: [{ blocks: [{ type: "list", data: { items: [{ blocks: [{ type: "list" }] }] } }] }] } });
        const overflow = normalizeContent({ format: "safe-html-input", html: "<ul><li>one<ul><li>two<ul><li>three<ul><li>four</li></ul></li></ul></li></ul></li></ul><p>after</p>" });
        expect(overflow.status).toBe("partial");
        expect(overflow.contentText).toBe("one two three after");
    });

    it("retains media and trailing text within list items in order", () => {
        const result = normalizeContent({ format: "safe-html-input", html: "<ul><li>before<img src='https://example.test/a.png'>after</li></ul>" });
        expect(result.blocks[0]).toMatchObject({ type: "list", data: { items: [{ inlines: [{ type: "text", text: "before" }], blocks: [{ type: "image" }, { type: "paragraph" }] }] } });
        expect(result.contentText).toBe("before after");
    });

    it("preserves audio and video source children at their positions", () => {
        const result = normalizeContent({ format: "safe-html-input", html: "<p>before</p><video><source src='/clip.mp4'></video><audio><source src='/sound.mp3'></audio><p>after</p>", baseUrl: "https://example.test/story" });
        expect(result.blocks.map((block) => block.type)).toEqual(["paragraph", "video", "audio", "paragraph"]);
        expect(result.blocks[1]).toMatchObject({ type: "video", data: { sourceUrl: "https://example.test/clip.mp4" } });
        expect(result.blocks[2]).toMatchObject({ type: "audio", data: { sourceUrl: "https://example.test/sound.mp3" } });
    });

    it("handles malformed HTML and deletes script content", () => {
        const result = normalizeContent({ format: "safe-html-input", html: "<p>safe<script>secret()</script><b> text" });
        expect(result.contentText).toBe("safe text");
        expect(result.contentText).not.toContain("secret");
    });

    it("projects nested emphasis and quotes once in source order", () => {
        const result = normalizeContent({ format: "safe-html-input", html: "<p>before</p><blockquote><p><strong><em>quoted</em></strong> words</p></blockquote><p>after</p>" });
        expect(result.blocks.map((block) => block.type)).toEqual(["paragraph", "quote", "paragraph"]);
        expect(result.contentText).toBe("before quoted words after");
    });

    it("removes executable text inside links and code", () => {
        const result = normalizeContent({ format: "safe-html-input", html: "<p><a href='https://example.test'>safe<script>secret()</script> link</a></p><pre>code<script>hidden()</script></pre>" });
        expect(result.contentText).toBe("safe link code");
        expect(JSON.stringify(result.blocks)).not.toMatch(/secret|hidden/);
    });

    it("returns partial output on input budget overflow", () => {
        const result = normalizeContent({ format: "plain-text", text: "x".repeat(1_048_577) });
        expect(result.status).toBe("partial");
        expect(result.contentText.length).toBeLessThanOrEqual(65_536);
        expect(result.blocks).toHaveLength(1);
    });

    it("bounds inline HTML nodes and depth before recursive text extraction", () => {
        const wide = normalizeContent({ format: "safe-html-input", html: `<p>${"<span>x</span>".repeat(26_000)}</p>` });
        expect(wide.status).toBe("partial");
        expect(wide.contentText.length).toBeLessThan(26_000);
        const deep = normalizeContent({ format: "safe-html-input", html: `<p><a href='https://example.test'>${"<span>".repeat(100)}deep${"</span>".repeat(100)}</a></p><p>after</p>` });
        expect(deep.status).toBe("partial");
        expect(deep.contentText).toContain("after");
    });

    it("keeps truncated HTML inline output valid for storage contracts", () => {
        for (const html of [
            `<p>${"<em>word</em>".repeat(101)}</p>`,
            `<h1><a href='https://example.test'>${"x".repeat(70_000)}</a></h1>`,
        ]) {
            const result = normalizeContent({ format: "safe-html-input", html });
            expect(result.status).toBe("partial");
            expect(result.blocks.length).toBeGreaterThan(0);
            for (const block of result.blocks) expect(structuredSourceBlockSchema.safeParse(block).success).toBe(true);
        }
    });

    it("sanitizes structured links without losing readable text", () => {
        const result = normalizeContent({ format: "structured-source-content", blocks: [
            { type: "paragraph", data: { inlines: [{ type: "strong", inlines: [{ type: "link", text: "readable", url: "javascript:alert(1)" }] }] } },
        ] });
        expect(result.blocks[0]).toMatchObject({ type: "paragraph", data: { inlines: [{ type: "strong", inlines: [{ type: "text", text: "readable" }] }] } });
        expect(result.contentText).toBe("readable");
        expect(result.qualitySignals.warningCount).toBeGreaterThan(0);
    });

    it("counts structured list levels independently from quotes", () => {
        const result = normalizeContent({ format: "structured-source-content", blocks: [
            { type: "quote", data: { blocks: [{ type: "quote", data: { blocks: [
                { type: "list", data: { ordered: false, items: [{ inlines: [{ type: "text", text: "one" }], blocks: [
                    { type: "list", data: { ordered: false, items: [{ inlines: [{ type: "text", text: "two" }], blocks: [
                        { type: "list", data: { ordered: false, items: [{ inlines: [{ type: "text", text: "three" }] }] } },
                    ] }] } },
                ] }] } },
            ] } }] } },
        ] });
        expect(result.status).toBe("complete");
        expect(result.contentText).toBe("one two three");
    });

    it("stops structured input at a deterministic UTF-8 JSON byte prefix", () => {
        const blocks = Array.from({ length: 60 }, (_, index) => ({
            type: "divider" as const, data: {}, source: `${index}:` + "界".repeat(10_000),
        }));
        const result = normalizeContent({ format: "structured-source-content", blocks });
        expect(result.status).toBe("partial");
        expect(result.blocks.length).toBeGreaterThan(0);
        expect(result.blocks.length).toBeLessThan(blocks.length);
        expect(new TextEncoder().encode(JSON.stringify({ format: "structured-source-content", blocks: result.blocks })).byteLength).toBeLessThanOrEqual(1_048_576);
        expect(result.blocks).toEqual(blocks.slice(0, result.blocks.length));
        expect(normalizeContent({ format: "structured-source-content", blocks })).toEqual(result);
    });

    it("counts nested content and JSON escapes before accepting a structured block", () => {
        const prefix = { type: "paragraph" as const, data: { inlines: [{ type: "text" as const, text: "prefix" }] } };
        const oversized: readonly StructuredSourceBlock[] = [
            { type: "quote", data: { blocks: Array.from({ length: 40 }, () => ({ type: "code", data: { text: "界".repeat(10_000) } })) } },
            { type: "divider", data: {}, source: "\u0000".repeat(180_000) },
        ];
        for (const block of oversized) {
            const result = normalizeContent({ format: "structured-source-content", blocks: [prefix, block, prefix] });
            expect(result).toMatchObject({ status: "partial", contentText: "prefix", blocks: [prefix] });
        }
    });

    it("safely adapts legacy HTML to text blocks without raw markup", () => {
        const result = adaptLegacyContentText("<p>old <b>body</b></p><script>bad()</script>");
        expect(result.contentText).toBe("old body");
        expect(result.contentText).not.toContain("<");
        expect(result.status).toBe("complete");
    });
});
