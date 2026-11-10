import type { ConfiguredModelSnapshot } from "@cosmos/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ModelDetails } from "@/components/cosmos/model-details";

const model: ConfiguredModelSnapshot = {
    id: "configured-model-one",
    providerId: "provider-one",
    modelId: "upstream-model-one",
    name: "整理模型",
    contextWindow: 128000,
    maxOutputTokens: 8192,
    version: 7,
    createdAt: "2026-11-01T01:02:03.000Z",
    updatedAt: "2026-11-10T04:05:06.000Z",
};

function render(overrides: Partial<ConfiguredModelSnapshot> = {}, providerName = "测试服务商") {
    return renderToStaticMarkup(createElement(ModelDetails, {
        model: { ...model, ...overrides }, providerName,
    }));
}

function text(html: string) {
    return html.replace(/<[^>]*>/g, "");
}

describe("ModelDetails", () => {
    it("identifies the model and provider and keeps context/output budgets distinct", () => {
        const content = text(render());

        expect(content).toContain(model.name);
        expect(content).toContain(model.modelId);
        expect(content).toContain("服务商：测试服务商");
        expect(content).toContain(`上下文窗口：${model.contextWindow.toLocaleString()} tokens`);
        expect(content).toContain(`输出上限：${model.maxOutputTokens.toLocaleString()} tokens`);
        expect(content).not.toContain(model.providerId);
    });

    it("shows separate known input/output prices with their USD per-million unit", () => {
        const content = text(render({ inputPricePerMillion: 0.125, outputPricePerMillion: 2.75 }));

        expect(content).toContain("输入价格：$0.125 USD / 百万 tokens");
        expect(content).toContain("输出价格：$2.75 USD / 百万 tokens");
        expect(content).not.toContain("价格信息不可用");
    });

    it("renders known zero prices instead of treating them as unavailable", () => {
        const content = text(render({ inputPricePerMillion: 0, outputPricePerMillion: 0 }));

        expect(content).toContain("输入价格：$0 USD / 百万 tokens");
        expect(content).toContain("输出价格：$0 USD / 百万 tokens");
        expect(content).not.toContain("价格信息不可用");
    });

    it("explains unknown pricing without inventing a free price", () => {
        const content = text(render());

        expect(content).toContain("价格信息不可用");
        expect(content).not.toContain("输入价格");
        expect(content).not.toContain("输出价格");
        expect(content).not.toContain("$");
        expect(content).not.toContain("undefined");
    });

    it.each([
        { prices: { inputPricePerMillion: 0 }, known: "输入价格：$0 USD / 百万 tokens", absent: "输出价格" },
        { prices: { outputPricePerMillion: 2.75 }, known: "输出价格：$2.75 USD / 百万 tokens", absent: "输入价格" },
    ])("preserves the known side of partial pricing: $known", ({ prices, known, absent }) => {
        const content = text(render(prices));

        expect(content).toContain(known);
        expect(content).not.toContain(absent);
        expect(content).not.toContain("undefined");
        expect(content).not.toContain("NaN");
    });

    it("keeps version and distinct machine-readable timestamps inside collapsed metadata", () => {
        const html = render();
        const metadata = html.match(/<details\b[^>]*>([\s\S]*?)<\/details>/)?.[1];

        expect(metadata).toBeDefined();
        expect(html).not.toMatch(/<details\b[^>]*\bopen(?:=|\s|>)/);
        expect(metadata).toContain("模型版本与时间</summary>");
        expect(text(metadata ?? "")).toContain("版本：7");
        expect(metadata).toContain(`<time dateTime="${model.createdAt}">${model.createdAt}</time>`);
        expect(metadata).toContain(`<time dateTime="${model.updatedAt}">${model.updatedAt}</time>`);
        expect(text(metadata ?? "")).toContain(`创建时间：${model.createdAt}`);
        expect(text(metadata ?? "")).toContain(`更新时间：${model.updatedAt}`);
    });

    it("escapes model and provider text rather than interpreting them as markup", () => {
        const html = render({ name: "<script>model</script>", modelId: "<b>model-id</b>" }, "<img src=x>");

        expect(html).toContain("&lt;script&gt;model&lt;/script&gt;");
        expect(html).toContain("&lt;b&gt;model-id&lt;/b&gt;");
        expect(html).toContain("&lt;img src=x&gt;");
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("<img");
    });
});
