import { describe, expect, it } from "vitest";
import { storyAgentGenerationRequestSchema, storyAgentGenerationSchema } from "./story-agent.js";

describe("Story Agent generation contracts", () => {
    it("accepts an omitted modelId and an explicitly selected modelId", () => {
        expect(storyAgentGenerationRequestSchema.parse({ task: "story.summarize" }))
            .toEqual({ task: "story.summarize" });
        expect(storyAgentGenerationRequestSchema.parse({ task: "story.summarize", modelId: "configured-model-1" }))
            .toEqual({ task: "story.summarize", modelId: "configured-model-1" });
    });

    it("accepts only the approved safe failure codes", () => {
        const base = { runId: "run-1", storyId: "story-1", task: "story.summarize" as const,
            status: "failed" as const, candidateId: null };
        for (const errorCode of ["timeout", "authentication_required", "rate_limited", "budget_exhausted",
            "invalid_configuration", "dependency_unavailable", "malformed_payload", "generation_failed"] as const) {
            expect(storyAgentGenerationSchema.parse({ ...base, errorCode }).errorCode).toBe(errorCode);
        }
        for (const errorCode of ["provider message", "secret", "unknown_code"]) {
            expect(storyAgentGenerationSchema.safeParse({ ...base, errorCode }).success).toBe(false);
        }
    });
    it("accepts optional invocation cost while preserving zero and legacy responses", () => {
        const response = { runId: "run-1", storyId: "story-1", task: "story.summarize" as const,
            status: "completed" as const, candidateId: "candidate-1", errorCode: null };
        expect(storyAgentGenerationSchema.parse(response)).toEqual(response);
        expect(storyAgentGenerationSchema.parse({ ...response,
            cost: { input: 0, output: 0, total: 0, currency: "USD" } })).toMatchObject({
            cost: { input: 0, output: 0, total: 0, currency: "USD" },
        });
        expect(storyAgentGenerationSchema.safeParse({ ...response,
            cost: { input: -1, output: 0, total: 0, currency: "USD" } }).success).toBe(false);
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
