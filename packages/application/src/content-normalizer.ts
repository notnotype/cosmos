import { boundedJsonByteLength } from "./content-input-budget.js";
import { parseFragment } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
import type {
    ContentInline,
    ContentSource,
    StructuredSourceBlock,
} from "@cosmos/domain";
import {
    CONTENT_BLOCK_MAX_COUNT,
    CONTENT_BLOCK_TEXT_MAX_LENGTH,
    CONTENT_INPUT_MAX_BYTES,
    CONTENT_LIST_MAX_DEPTH,
    CONTENT_MAX_DEPTH,
    CONTENT_NODE_MAX_COUNT,
    CONTENT_TABLE_MAX_COLUMNS,
    CONTENT_TABLE_MAX_ROWS,
    CONTENT_URL_MAX_LENGTH,
} from "@cosmos/domain";

export interface ContentDraft {
    blocks: readonly StructuredSourceBlock[];
    parserVersion: string;
    contentText: string;
    status: "complete" | "partial" | "failed";
    qualitySignals: Readonly<Record<string, number>>;
}

interface State {
    blocks: StructuredSourceBlock[];
    warnings: string[];
    text: string[];
    nodes: number;
    bytes: number;
    partial: boolean;
    baseUrl?: string;
    listDepth?: number;
}

const dangerousTags = new Set(["script", "style", "template", "iframe", "object", "embed", "form", "nav", "footer", "head"]);
const blockTags = new Set(["p", "div", "section", "article", "main", "header", "aside"]);
const flowTags = new Set(["p", "div", "section", "article", "main", "header", "aside", "h1", "h2", "h3", "h4", "h5", "h6", "img", "video", "audio", "hr", "pre", "blockquote", "ul", "ol", "table"]);
const inlineTags = new Set(["a", "strong", "b", "em", "i", "code", "span", "br"]);

function textOf(node: HtmlNode): string {
    if (node.nodeName === "#text") return "value" in node ? node.value : "";
    if (!("childNodes" in node)) return "";
    if ("tagName" in node && dangerousTags.has(node.tagName)) return "";
    return node.childNodes.map(textOf).join("");
}

function byteLength(value: string): number {
    return new TextEncoder().encode(value).byteLength;
}

function controlledUrl(raw: string, baseUrl?: string): string | undefined {
    if (raw.length === 0 || raw.length > CONTENT_URL_MAX_LENGTH) return undefined;
    try {
        const url = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
    } catch {
        return undefined;
    }
}

function inlineText(node: HtmlNode, state: State, depth: number): ContentInline[] {
    if (depth > CONTENT_MAX_DEPTH) {
        state.partial = true;
        state.warnings.push("content depth budget exceeded");
        return [];
    }
    if (node.nodeName === "#text") return "value" in node && node.value ? [{ type: "text", text: node.value }] : [];
    if (!("childNodes" in node)) return [];
    const element = node as HtmlElement;
    if (dangerousTags.has(element.tagName)) return [];
    const children = element.childNodes.flatMap((child: HtmlNode) => inlineText(child, state, depth + 1));
    switch (element.tagName) {
        case "strong": case "b": return children.length ? [{ type: "strong", inlines: children }] : [];
        case "em": case "i": return children.length ? [{ type: "emphasis", inlines: children }] : [];
        case "code": return [{ type: "code", text: textOf(node) }];
        case "a": {
            const href = element.attrs.find((attr) => attr.name === "href")?.value ?? "";
            const url = controlledUrl(href, state.baseUrl);
            if (!url) {
                if (href) state.warnings.push("unsafe or invalid link removed");
                return children;
            }
            return [{ type: "link", text: textOf(node).trim(), url }];
        }
        case "br": return [{ type: "text", text: "\n" }];
        default: return children;
    }
}

function addText(state: State, value: string): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    const remaining = CONTENT_BLOCK_TEXT_MAX_LENGTH - state.text.join(" ").length;
    if (remaining <= 0) {
        state.partial = true;
        return "";
    }
    if (normalized.length > remaining) {
        state.partial = true;
        state.warnings.push("block text budget exceeded");
        return normalized.slice(0, remaining);
    }
    return normalized;
}

function pushBlock(state: State, block: StructuredSourceBlock): void {
    if (state.blocks.length >= CONTENT_BLOCK_MAX_COUNT) {
        state.partial = true;
        state.warnings.push("block budget exceeded");
        return;
    }
    if (block.type === "paragraph") block = { ...block, data: { inlines: normalizeStructuredInlines(block.data.inlines, state, 0) } };
    else if (block.type === "heading") block = { ...block, data: { ...block.data, inlines: normalizeStructuredInlines(block.data.inlines, state, 0) } };
    state.blocks.push(block);
    const plain = block.type === "image" ? block.data.alt ?? ""
        : block.type === "video" || block.type === "audio" ? block.data.title ?? ""
        : block.type === "divider" ? "" : textOfBlock(block);
    if (plain) state.text.push(addText(state, plain));
}

function textOfInlines(inlines: readonly ContentInline[]): string {
    return inlines.map((inline) => "text" in inline ? inline.text : textOfInlines(inline.inlines)).join("");
}

function textOfBlock(block: StructuredSourceBlock): string {
    const data = block.data;
    if ("inlines" in data) return textOfInlines(data.inlines);
    if ("text" in data && typeof data.text === "string") return data.text;
    if (block.type === "table") return [...block.data.columns, ...block.data.rows.flat()].join(" ");
    if (block.type === "quote") return block.data.blocks.map(textOfBlock).join(" ");
    if (block.type === "list") return block.data.items.map((item) => [textOfInlines(item.inlines), ...(item.blocks ?? []).map(textOfBlock)].join(" ")).join(" ");
    if (block.type === "unknown") return block.data.text ?? "";
    return "";
}

function elementAttr(element: HtmlElement, name: string): string | undefined {
    return element.attrs.find((attr) => attr.name === name)?.value;
}

function walkFlow(nodes: readonly HtmlNode[], state: State, depth: number): void {
    let inline: ContentInline[] = [];
    const flush = () => {
        const text = textOfBlock({ type: "paragraph", data: { inlines: inline } });
        if (text.trim()) pushBlock(state, { type: "paragraph", data: { inlines: inline } });
        inline = [];
    };
    for (const node of nodes) {
        if (node.nodeName === "#text") {
            if ("value" in node && node.value) inline.push({ type: "text", text: node.value });
            continue;
        }
        if ("tagName" in node && flowTags.has(node.tagName)) {
            flush();
            walkHtml(node, state, depth);
            continue;
        }
        inline.push(...inlineText(node, state, depth));
    }
    flush();
}

function walkHtml(node: HtmlNode, state: State, depth: number): void {
    if (++state.nodes > CONTENT_NODE_MAX_COUNT || depth > CONTENT_MAX_DEPTH) {
        state.partial = true;
        state.warnings.push("HTML traversal budget exceeded");
        return;
    }
    if (node.nodeName === "#text") {
        const text = "value" in node ? node.value : "";
        if (text.trim()) pushBlock(state, { type: "paragraph", data: { inlines: [{ type: "text", text }] } });
        return;
    }
    if (!("childNodes" in node)) return;
    const element = node as HtmlElement;
    const tag = element.tagName;
    if (dangerousTags.has(tag)) return;
    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
        const inlines = inlineText(node, state, depth);
        if (inlines.length) pushBlock(state, { type: "heading", data: { level: Number(tag.slice(1)), inlines }, warnings: state.warnings.length ? [...state.warnings] : undefined });
        return;
    }
    if (tag === "img") {
        const url = controlledUrl(elementAttr(element, "src") ?? "", state.baseUrl);
        if (url) pushBlock(state, { type: "image", data: { sourceUrl: url, alt: elementAttr(element, "alt") }, warnings: state.warnings.length ? [...state.warnings] : undefined });
        else if (elementAttr(element, "src")) { state.partial = true; state.warnings.push("unsafe or invalid image URL removed"); }
        return;
    }
    if (tag === "video" || tag === "audio") {
        const sourceNode = element.childNodes.find((child): child is HtmlElement => "tagName" in child && child.tagName === "source");
        const url = controlledUrl(elementAttr(element, "src") ?? (sourceNode ? elementAttr(sourceNode, "src") : undefined) ?? "", state.baseUrl);
        if (url) pushBlock(state, { type: tag, data: { sourceUrl: url, title: elementAttr(element, "title") }, warnings: state.warnings.length ? [...state.warnings] : undefined });
        else if (elementAttr(element, "src")) { state.partial = true; state.warnings.push("unsafe or invalid media URL removed"); }
        return;
    }
    if (tag === "hr") { pushBlock(state, { type: "divider", data: {} }); return; }
    if (tag === "pre") {
        const text = addText(state, textOf(node));
        if (text) pushBlock(state, { type: "code", data: { text }, warnings: state.warnings.length ? [...state.warnings] : undefined });
        return;
    }
    if (tag === "blockquote") {
        const before = state.blocks.length;
        const textBefore = state.text.length;
        walkFlow(element.childNodes, state, depth + 1);
        const nested = state.blocks.splice(before);
        state.text.splice(textBefore);
        if (nested.length) pushBlock(state, { type: "quote", data: { blocks: nested }, warnings: state.warnings.length ? [...state.warnings] : undefined });
        return;
    }
    if (tag === "ul" || tag === "ol") {
        const items: { inlines: readonly ContentInline[]; blocks?: readonly StructuredSourceBlock[] }[] = [];
        const previousListDepth = state.listDepth ?? 0;
        if (previousListDepth >= CONTENT_LIST_MAX_DEPTH) {
            state.partial = true;
            state.warnings.push("list depth budget exceeded");
            return;
        }
        state.listDepth = previousListDepth + 1;
        for (const child of element.childNodes) {
            if (!("tagName" in child) || child.tagName !== "li") continue;
            const before = state.blocks.length;
            const textBefore = state.text.length;
            walkFlow(child.childNodes, state, depth + 1);
            const nested = state.blocks.splice(before);
            state.text.splice(textBefore);
            const first = nested[0];
            const startsWithText = first?.type === "paragraph";
            items.push({
                inlines: startsWithText ? first.data.inlines : [],
                ...(nested.length > (startsWithText ? 1 : 0)
                    ? { blocks: nested.slice(startsWithText ? 1 : 0) } : {}),
            });
        }
        state.listDepth = previousListDepth;
        if (items.length) pushBlock(state, { type: "list", data: { ordered: tag === "ol", items }, warnings: state.warnings.length ? [...state.warnings] : undefined });
        return;
    }
    if (tag === "table") {
        const rows: string[][] = [];
        const tableRows = element.childNodes.flatMap((child: HtmlNode) => "childNodes" in child ? child.childNodes : []);
        for (const row of tableRows) {
            if (!("tagName" in row) || row.tagName !== "tr") continue;
            const cells = row.childNodes.filter((cell: HtmlNode): cell is HtmlElement => "tagName" in cell && (cell.tagName === "td" || cell.tagName === "th")).map(textOf).slice(0, CONTENT_TABLE_MAX_COLUMNS);
            if (cells.length) rows.push(cells);
            if (rows.length >= CONTENT_TABLE_MAX_ROWS) { state.partial = true; break; }
        }
        const columns = rows[0] ?? [];
        if (rows.length) pushBlock(state, { type: "table", data: { columns, rows: rows.slice(1) }, warnings: state.warnings.length ? [...state.warnings] : undefined });
        return;
    }
    if (blockTags.has(tag)) {
        walkFlow(element.childNodes, state, depth + 1);
        return;
    }
    if (!inlineTags.has(tag) && tag) state.warnings.push(`unknown HTML element '${tag}' kept as text`);
    for (const child of element.childNodes) walkHtml(child, state, depth + 1);
}

function finish(state: State, legacy = false): ContentDraft {
    const contentText = state.text.join(" ").replace(/\s+/g, " ").trim();
    return {
        blocks: state.blocks,
        parserVersion: "content-normalizer@1",
        contentText,
        status: state.partial ? "partial" : "complete",
        qualitySignals: {
            blockCount: state.blocks.length,
            warningCount: state.warnings.length,
            nodeCount: state.nodes,
            ...(legacy ? { legacy: 1 } : {}),
        },
    };
}

function normalizePlain(text: string, legacy = false): ContentDraft {
    const state: State = { blocks: [], warnings: [], text: [], nodes: 0, bytes: byteLength(text), partial: false };
    const limited = text.slice(0, CONTENT_BLOCK_TEXT_MAX_LENGTH);
    if (state.bytes > CONTENT_INPUT_MAX_BYTES || text.length > CONTENT_BLOCK_TEXT_MAX_LENGTH) { state.partial = true; state.warnings.push("input or block text budget exceeded"); }
    if (limited.trim()) pushBlock(state, { type: "paragraph", data: { inlines: [{ type: "text", text: limited }] }, warnings: state.warnings.length ? [...state.warnings] : undefined });
    return finish(state, legacy);
}

function boundHtmlTree(root: DefaultTreeAdapterTypes.DocumentFragment, state: State): void {
    // Bound the parsed tree before any recursive text extraction, including links and table cells.
    const pending: { node: HtmlNode; depth: number }[] = [{ node: root, depth: 0 }];
    let visited = 0;
    while (pending.length) {
        const current = pending.pop();
        if (!current || !("childNodes" in current.node)) continue;
        const retained: DefaultTreeAdapterTypes.ChildNode[] = [];
        for (const child of current.node.childNodes) {
            if (++visited > CONTENT_NODE_MAX_COUNT || current.depth >= CONTENT_MAX_DEPTH) {
                state.partial = true;
                continue;
            }
            if ("tagName" in child && dangerousTags.has(child.tagName)) continue;
            if ("value" in child && child.value.length > CONTENT_BLOCK_TEXT_MAX_LENGTH) {
                child.value = child.value.slice(0, CONTENT_BLOCK_TEXT_MAX_LENGTH);
                state.partial = true;
            }
            retained.push(child);
            pending.push({ node: child, depth: current.depth + 1 });
        }
        current.node.childNodes = retained;
    }
    if (state.partial) state.warnings.push("HTML node, depth or text budget exceeded");
}

function normalizeHtml(html: string, baseUrl?: string, legacy = false): ContentDraft {
    const state: State = { blocks: [], warnings: [], text: [], nodes: 0, bytes: byteLength(html), partial: false, baseUrl: baseUrl && controlledUrl(baseUrl) ? baseUrl : undefined };
    if (state.bytes > CONTENT_INPUT_MAX_BYTES) { state.partial = true; state.warnings.push("input byte budget exceeded"); html = new TextDecoder().decode(new TextEncoder().encode(html).slice(0, CONTENT_INPUT_MAX_BYTES)); }
    const fragment = parseFragment(html);
    boundHtmlTree(fragment, state);
    for (const child of fragment.childNodes) walkHtml(child, state, 0);
    return finish(state, legacy);
}

export function normalizeContent(source: ContentSource): ContentDraft {
    if (source.format === "plain-text") return normalizePlain(source.text);
    if (source.format === "safe-html-input") return normalizeHtml(source.html, source.baseUrl);
    const state: State = { blocks: [], warnings: [], text: [], nodes: 0, bytes: byteLength('{"format":"structured-source-content","blocks":[]}'), partial: false };
    let accepted = 0;
    for (const block of source.blocks) {
        if (state.blocks.length >= CONTENT_BLOCK_MAX_COUNT) { state.partial = true; break; }
        const separator = accepted > 0 ? 1 : 0;
        const bytes = boundedJsonByteLength(block, CONTENT_INPUT_MAX_BYTES - state.bytes - separator);
        if (bytes === null) { state.partial = true; state.warnings.push("input byte budget exceeded"); break; }
        state.bytes += bytes + separator;
        accepted++;
        const normalized = normalizeStructuredBlock(block, state, 0);
        if (normalized) pushBlock(state, normalized);
    }
    return finish(state);
}

function normalizeStructuredInlines(inlines: readonly ContentInline[], state: State, depth: number): ContentInline[] {
    if (depth > CONTENT_MAX_DEPTH) {
        state.partial = true;
        state.warnings.push("content depth budget exceeded");
        return [];
    }
    if (inlines.length > 100) {
        state.partial = true;
        state.warnings.push("inline count budget exceeded");
    }
    return inlines.slice(0, 100).flatMap((inline): ContentInline[] => {
        if (++state.nodes > CONTENT_NODE_MAX_COUNT) {
            state.partial = true;
            return [];
        }
        if ("inlines" in inline) {
            return [{ ...inline, inlines: normalizeStructuredInlines(inline.inlines, state, depth + 1) }];
        }
        const text = inline.text.slice(0, CONTENT_BLOCK_TEXT_MAX_LENGTH);
        if (text.length !== inline.text.length) {
            state.partial = true;
            state.warnings.push("block text budget exceeded");
        }
        if (inline.type === "link") {
            const url = controlledUrl(inline.url);
            if (!url) {
                state.warnings.push("unsafe or invalid link removed");
                return [{ type: "text", text }];
            }
            return [{ type: "link", text, url }];
        }
        return [{ type: inline.type, text }];
    });
}

function normalizeStructuredBlock(block: StructuredSourceBlock, state: State, depth: number, listDepth = 0): StructuredSourceBlock | undefined {
    if (depth > CONTENT_MAX_DEPTH) { state.partial = true; return { type: "unknown", data: { reason: "content depth budget exceeded" } }; }
    if (block.type === "image" || block.type === "video" || block.type === "audio") {
        const url = controlledUrl(block.data.sourceUrl);
        if (!url) { state.partial = true; return { type: "unknown", data: { reason: "unsafe or invalid media URL removed" } }; }
        return { ...block, data: { ...block.data, sourceUrl: url } } as StructuredSourceBlock;
    }
    if (block.type === "paragraph") return { ...block, data: { inlines: normalizeStructuredInlines(block.data.inlines, state, depth + 1) } };
    if (block.type === "heading") return { ...block, data: { ...block.data, inlines: normalizeStructuredInlines(block.data.inlines, state, depth + 1) } };
    if (block.type === "quote") return { ...block, data: { blocks: block.data.blocks.map((child) => normalizeStructuredBlock(child, state, depth + 1, listDepth)).filter((child): child is StructuredSourceBlock => child !== undefined) } };
    if (block.type === "list") {
        if (listDepth >= CONTENT_LIST_MAX_DEPTH) { state.partial = true; return { type: "unknown", data: { reason: "list depth budget exceeded" } }; }
        return { ...block, data: { ...block.data, items: block.data.items.map((item) => ({ ...item, inlines: normalizeStructuredInlines(item.inlines, state, depth + 1), blocks: item.blocks?.map((child) => normalizeStructuredBlock(child, state, depth + 1, listDepth + 1)).filter((child): child is StructuredSourceBlock => child !== undefined) })) } };
    }
    if (block.type === "embed") {
        const url = controlledUrl(block.data.url);
        if (!url) { state.partial = true; return { type: "unknown", data: { reason: "unsafe or invalid embed URL removed" } }; }
        return { ...block, data: { ...block.data, url } };
    }
    return block;
}

export function adaptLegacyContentText(contentText: string): ContentDraft {
    return /<\/?[a-z][^>]*>/i.test(contentText) ? normalizeHtml(contentText, undefined, true) : normalizePlain(contentText, true);
}
