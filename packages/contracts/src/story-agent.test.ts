import { describe, expect, it } from "vitest";
import { storyAgentGenerationRequestSchema, storyAgentGenerationSchema } from "./story-agent.js";

describe("Story Agent generation contracts", () => {
    it("accepts an omitted modelId and an explicitly selected modelId", () => {
        expect(storyAgentGenerationRequestSchema.parse({ task: "story.summarize" }))
            .toEqual({ task: "story.summarize" });
        expect(storyAgentGenerationRequestSchema.parse({ task: "story.summarize", modelId: "configured-model-1" }))
            .toEqual({ task: "story.summarize", modelId: "configured-model-1" });
    });

    it("rejects connectionId from the request and generation response", () => {
        expect(() => storyAgentGenerationRequestSchema.parse({ task: "story.summarize", connectionId: "connection-1" })).toThrow();
        expect(storyAgentGenerationSchema.parse({ runId: "run-1", storyId: "story-1", task: "story.summarize",
            status: "queued", candidateId: null, errorCode: null })).toEqual({ runId: "run-1", storyId: "story-1",
            task: "story.summarize", status: "queued", candidateId: null, errorCode: null });
        expect(() => storyAgentGenerationSchema.parse({ runId: "run-1", storyId: "story-1", task: "story.summarize",
            connectionId: "connection-1", status: "queued", candidateId: null, errorCode: null })).toThrow();
    });
});
