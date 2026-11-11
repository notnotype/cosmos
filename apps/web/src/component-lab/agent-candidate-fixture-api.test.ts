import { storyAgentCandidateRecordSchema, storyAgentGenerationSchema } from "@cosmos/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentCandidateFixtureApi } from "./agent-candidate-fixture-api";
import { storyLabFixture } from "./product-fixtures";

const story = storyLabFixture("splittable", "费用验收文章", "现有摘要");
const savedCost = { input: 0.12, output: 0.34, cacheWrite: 0, cacheRead: 0, total: 0.46, currency: "USD" };
const zeroCost = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0, currency: "USD" };
const fetch = vi.fn(() => { throw new Error("Story lab fixtures must not access the network."); });
function behavior() {
    return { loseResponse: false, hold: false, fail: false, saveThenFail: false,
        sourceStatus: "current" as const, costMode: "known" as "known" | "zero" | "missing" };
}

beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
    });
    fetch.mockClear();
    vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
    try { expect(fetch).not.toHaveBeenCalled(); }
    finally { vi.unstubAllGlobals(); }
});

describe("Story candidate lab actual cost DTOs", () => {
    it.each([
        ["known", savedCost], ["zero", zeroCost], ["missing", undefined],
    ] as const)("persists %s candidate costs and projects the same completed generation cost", async (costMode, expected) => {
        const options = { ...behavior(), costMode };
        const api = createAgentCandidateFixtureApi(story, options, () => {});
        const queued = await api.proposeStoryAgentCandidate(story.story.id, { task: "story.summarize" }, "request-one");
        expect(queued.status).toBe("queued");
        expect(queued).not.toHaveProperty("cost");

        const completed = storyAgentGenerationSchema.parse(await api.storyAgentGeneration(story.story.id, queued.runId));
        expect(completed.status).toBe("completed");
        expect(completed.cost).toEqual(expected);
        const reloadedApi = createAgentCandidateFixtureApi(story, options, () => {});
        const records = await reloadedApi.storyAgentCandidates();
        const record = storyAgentCandidateRecordSchema.parse(records[0]);
        expect(record.candidate.cost).toEqual(expected);
        expect(record.candidate.id).toBe(completed.candidateId);
        if (expected === undefined) {
            expect(completed).not.toHaveProperty("cost");
            expect(record.candidate).not.toHaveProperty("cost");
        }
    });

    it("omits generation cost while running and after failure", async () => {
        const options = { ...behavior(), hold: true };
        const api = createAgentCandidateFixtureApi(story, options, () => {});
        const queued = await api.proposeStoryAgentCandidate(story.story.id, { task: "story.summarize" }, "request-one");
        const running = await api.storyAgentGeneration(story.story.id, queued.runId);
        expect(running.status).toBe("running");
        expect(running).not.toHaveProperty("cost");
        options.hold = false;
        options.fail = true;
        const failed = await api.storyAgentGeneration(story.story.id, queued.runId);
        expect(failed.status).toBe("failed");
        expect(failed).not.toHaveProperty("cost");
        expect(await api.storyAgentCandidates()).toEqual([]);
    });

    it("retains saved candidate cost without adding cost to a failed generation receipt", async () => {
        const api = createAgentCandidateFixtureApi(story, { ...behavior(), saveThenFail: true }, () => {});
        const queued = await api.proposeStoryAgentCandidate(story.story.id, { task: "story.summarize" }, "request-one");
        const failed = await api.storyAgentGeneration(story.story.id, queued.runId);
        expect(failed.status).toBe("failed");
        expect(failed).not.toHaveProperty("cost");
        const [record] = await api.storyAgentCandidates();
        expect(record?.candidate.cost).toEqual(savedCost);
    });
});
