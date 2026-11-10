import type { AgentInvocationOutput, ConfiguredModelSnapshot } from "@cosmos/contracts";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { estimateStoryGenerationCost, StoryGenerationActualCost, StoryGenerationEstimate } from "./story-generation-cost";

const model: ConfiguredModelSnapshot = {
    id: "model-story-mini",
    providerId: "provider-openai",
    modelId: "gpt-4.1-mini",
    name: "故事整理模型",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputPricePerMillion: 1,
    outputPricePerMillion: 2,
    version: 1,
    createdAt: "2026-11-10T06:00:00.000Z",
    updatedAt: "2026-11-10T06:00:00.000Z",
};

function renderEstimate(props: ComponentProps<typeof StoryGenerationEstimate>) {
    return renderToStaticMarkup(createElement(StoryGenerationEstimate, props));
}

function renderActual(cost?: AgentInvocationOutput["cost"]) {
    return renderToStaticMarkup(createElement(StoryGenerationActualCost, { cost }));
}

function text(html: string) {
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
}

describe("StoryGenerationEstimate", () => {
    it("identifies the current default model and shows the USD estimated range", () => {
        const content = text(renderEstimate({ model }));

        expect(content).toContain("当前默认模型");
        expect(content).toContain(model.name);
        expect(content).toContain(model.modelId);
        expect(content).toContain("预估成本");
        expect(content).toContain("USD");
        expect(content).toMatch(/0\.001512\s*[–—~～至-]\s*(?:USD\s*)?0\.006048/);
    });

    it("identifies an explicit model without presenting it as the current default", () => {
        const content = text(renderEstimate({ model, explicit: true }));

        expect(content).toContain("本次模型");
        expect(content).toContain(model.name);
        expect(content).toContain(model.modelId);
        expect(content).not.toContain("当前默认模型");
    });

    it("discloses the input/output token assumptions and that this is not a quote or actual billing", () => {
        const content = text(renderEstimate({ model })).replace(/,/g, "");

        expect(content).toMatch(/输入[^\d]*1000\s*[–—~～至-]\s*4000/);
        expect(content).toMatch(/输出[^\d]*256\s*[–—~～至-]\s*1024/);
        expect(content).toMatch(/tokens?/i);
        expect(content).toMatch(/(?:非|不|并非|不是).*报价/);
        expect(content).toMatch(/(?:非|不|并非|不是).*实际(?:计费|账单|费用|扣费)/);
    });

    it("shows reduced output assumptions and cost when the model output limit is below the usual range", () => {
        const content = text(renderEstimate({ model: { ...model, maxOutputTokens: 128 } }));

        expect(content).toMatch(/输出[^\d]*128/);
        expect(content).not.toContain("1024");
        expect(content).toContain("0.001256");
        expect(content).toContain("0.004256");
    });

    it.each([
        { inputPricePerMillion: undefined, outputPricePerMillion: undefined },
        { inputPricePerMillion: 1, outputPricePerMillion: undefined },
        { inputPricePerMillion: undefined, outputPricePerMillion: 2 },
    ])("does not invent a range for unavailable or partial prices: %j", (prices) => {
        const content = text(renderEstimate({ model: { ...model, ...prices } }));

        expect(content).toContain("价格信息不可用");
        expect(content).toContain(model.name);
        expect(content).toContain(model.modelId);
        expect(content).not.toMatch(/\d+(?:\.\d+)?\s*[–—~～至-]\s*(?:USD\s*)?\d+(?:\.\d+)?\s*USD/);
        expect(content).not.toContain("0.001512");
        expect(content).not.toContain("0.006048");
    });

    it("treats configured zero prices as a known free estimate, not unavailable pricing", () => {
        const content = text(renderEstimate({
            model: { ...model, inputPricePerMillion: 0, outputPricePerMillion: 0 },
        }));

        expect(content).toContain("预估成本");
        expect(content).toContain("USD");
        expect(content).toMatch(/(?:^|\D)0(?:\.0+)?\s*[–—~～至-]\s*(?:USD\s*)?0(?:\.0+)?(?:\D|$)/);
        expect(content).not.toContain("价格信息不可用");
    });

    it("explains that no default model is configured after a successful empty read", () => {
        const content = text(renderEstimate({ model: null }));

        expect(content).toMatch(/(?:未配置|没有|尚未设置|未设置).*默认模型/);
        expect(content).not.toContain("USD");
    });

    it("does not infer that the default model is missing when configuration could not be read", () => {
        const content = text(renderEstimate({ model: null, failed: true }));

        expect(content).toMatch(/(?:失败|无法|不可用)/);
        expect(content).not.toMatch(/(?:未配置|没有|尚未设置|未设置).*默认模型/);
        expect(content).not.toContain("USD");
    });

    it("shows a loading status instead of claiming the default model is missing", () => {
        const html = renderEstimate({ model: null, loading: true });
        const content = text(html);

        expect(html).toContain('role="status"');
        expect(content).toMatch(/(?:加载|读取).*中/);
        expect(content).not.toMatch(/(?:未配置|没有|尚未设置|未设置).*默认模型/);
        expect(content).not.toContain("USD");
    });
});

describe("estimateStoryGenerationCost context budgets", () => {
    it.each([
        { contextWindow: 512, maxOutputTokens: 256 },
        { contextWindow: 2, maxOutputTokens: 1 },
    ])("keeps the estimate within the context budget: %j", (budgets) => {
        const estimate = estimateStoryGenerationCost({ ...model, ...budgets });
        expect(estimate).not.toBeNull();
        expect(estimate!.inputMax + estimate!.outputMax).toBeLessThanOrEqual(budgets.contextWindow);
        expect(estimate!.inputMin).toBeLessThanOrEqual(estimate!.inputMax);
        expect(estimate!.outputMin).toBeLessThanOrEqual(estimate!.outputMax);
        expect(estimate!.minimum).toBeLessThanOrEqual(estimate!.maximum);
    });

    it("does not present a range when the context cannot accommodate both input and output", () => {
        expect(estimateStoryGenerationCost({ ...model, contextWindow: 1, maxOutputTokens: 1 })).toBeNull();
    });
});

describe("StoryGenerationActualCost", () => {
    it("renders nothing when actual cost is absent, with no estimate fallback", () => {
        expect(renderActual()).toBe("");
    });

    it("shows actual input, output, total and the supplied currency in small muted text", () => {
        const html = renderActual({ input: 0.12, output: 0.34, total: 0.46, currency: "EUR" });
        const content = text(html);

        expect(content).toContain("实际成本");
        expect(content).toMatch(/输入[^\d]*0\.12/);
        expect(content).toMatch(/输出[^\d]*0\.34/);
        expect(content).toContain("0.46");
        expect(content).toContain("EUR");
        expect(content).not.toContain("USD");
        expect(content).not.toContain("预估成本");
        expect(html).toContain("text-muted-foreground");
        expect(html).toMatch(/(?:text-xs|text-sm|<small\b)/);
    });

    it("preserves tiny actual charges rather than rounding them to zero", () => {
        const content = text(renderActual({
            input: 0.000038, output: 0.00000001, total: 0.00003801, currency: "USD",
        }));

        expect(content).toMatch(/输入[^\d]*0\.000038(?:\D|$)/);
        expect(content).toMatch(/输出[^\d]*0\.00000001(?:\D|$)/);
        expect(content).toContain("0.00003801");
        expect(content).not.toMatch(/\d[eE][+-]?\d/);
    });

    it("uses no more than eight decimal places for actual charges", () => {
        const content = text(renderActual({
            input: 0.123456789, output: 0.234567891, total: 0.35802468, currency: "USD",
        }));

        expect(content).toContain("0.12345679");
        expect(content).toContain("0.23456789");
        expect(content).toContain("0.35802468");
        expect(content).not.toMatch(/\d+\.\d{9,}/);
    });

    it("renders all zero actual values instead of hiding the cost", () => {
        const content = text(renderActual({ input: 0, output: 0, total: 0, currency: "USD" }));

        expect(content).toContain("实际成本");
        expect(content).toMatch(/输入[^\d]*0(?:\D|$)/);
        expect(content).toMatch(/输出[^\d]*0(?:\D|$)/);
        expect(content.match(/\b0(?:\.0+)?\b/g)?.length).toBeGreaterThanOrEqual(3);
        expect(content).toContain("USD");
    });
});
