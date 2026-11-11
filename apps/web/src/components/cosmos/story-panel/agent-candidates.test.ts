import { storyAgentCandidateRecordSchema, type AgentInvocationOutput, type StoryAgentCandidateRecordContract } from "@cosmos/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StoryAgentCandidatePreview } from "./agent-candidates";

const cost = { input: 0.12, output: 0.34, total: 0.46, currency: "EUR" };
function record(actualCost?: AgentInvocationOutput["cost"]): StoryAgentCandidateRecordContract {
    return storyAgentCandidateRecordSchema.parse({
        status: "pending",
        candidate: {
            id: "candidate-story-a", storyId: "story-a", storyRevisionId: "revision-a",
            producer: "agent", producerVersion: "agent@1", provider: "provider-a", model: "model-a",
            inputSources: [], confidence: null, createdAt: "2026-11-11T00:00:00.000Z",
            proposal: { task: "story.summarize", title: "候选标题", summary: "候选摘要", keyFacts: [] },
            ...(actualCost === undefined ? {} : { cost: actualCost }),
        },
    });
}
function render(value: StoryAgentCandidateRecordContract) {
    return renderToStaticMarkup(createElement(StoryAgentCandidatePreview, { record: value }));
}

describe("Story candidate persisted actual costs", () => {
    it("shows the successful candidate amount once alongside its proposal", () => {
        const html = render(record(cost));

        expect(html).toContain("候选标题");
        expect(html).toContain("候选摘要");
        expect(html.match(/实际成本/g)).toHaveLength(1);
        expect(html).toContain("0.46 EUR");
        expect(html).toContain("输入：0.12");
        expect(html).toContain("输出：0.34");
    });

    it("preserves a known zero cost without claiming the call is free", () => {
        const html = render(record({ input: 0, output: 0, total: 0, currency: "USD" }));

        expect(html).toContain("实际成本：0 USD");
        expect(html).toContain("输入：0");
        expect(html).toContain("输出：0");
        expect(html).not.toContain("免费");
    });

    it("hides cost digits for historical candidates with no persisted cost", () => {
        const html = render(record());

        expect(html).toContain("候选摘要");
        expect(html).not.toContain("实际成本");
        expect(html).not.toContain("USD");
        expect(html).not.toContain("免费");
    });

    it("displays the saved call cost after reloading candidate JSON without model pricing", () => {
        const loaded: unknown = JSON.parse(JSON.stringify(record(cost)));
        const html = render(storyAgentCandidateRecordSchema.parse(loaded));

        expect(html).toContain("0.46 EUR");
        expect(html).not.toContain("预估成本");
        expect(html).not.toContain("当前默认模型");
    });

    it("does not carry cost into a different candidate lacking cost", () => {
        expect(render(record(cost))).toContain("0.46 EUR");
        const other = record();
        other.candidate.id = "candidate-story-b";
        other.candidate.storyId = "story-b";
        const html = render(other);

        expect(html).not.toContain("0.46");
        expect(html).not.toContain("EUR");
        expect(html).not.toContain("实际成本");
    });
});
