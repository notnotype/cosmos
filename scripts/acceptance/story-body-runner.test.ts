import { storyAgentCandidateRecordSchema } from "@cosmos/contracts";
import { afterEach, expect, it } from "vitest";
import { readdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { repositoryRoot } from "./story-agent-isolation.js";
import { createOfflineStoryTransport } from "./story-agent-runner.js";
import { runBodyStoryAcceptance } from "./story-body-runner.js";


it("records a rejection only after an external API decision and verifies unchanged formal rows", async () => {
    const result = await runBodyStoryAcceptance({ credential: "synthetic-task40-key", transport: createOfflineStoryTransport("valid") });
    roots.push(result.root);
    try {
        expect(result.api).toBeDefined();
        const origin = result.api!.origin;
        const records = storyAgentCandidateRecordSchema.array().parse(await (await fetch(`${origin}/api/v1/stories/${result.storyId}/agent-candidates`)).json());
        const response = await fetch(`${origin}/api/v1/story-agent-candidates/${records[0].candidate.id}/decision`, {
            method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ decision: "reject" }),
        });
        expect(response.status).toBe(201);
        await result.recordDecision();
        expect(result.report).toMatchObject({ status: "decision_recorded", decision: "rejected", formalUnchanged: true, manualPersistenceVerified: true });
    } finally { await result.close(); }
}, 30_000);

const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0)) {
        if (dirname(resolve(root)) !== join(repositoryRoot, ".agent", "tmp") || !basename(root).startsWith("task40-story-")) throw new Error("Unexpected test cleanup path");
        await rm(root, { recursive: true, force: true });
    }
});

it("queues the disclosed source body through HTTP, keeps pending unchanged and waits for a Web decision", async () => {
    const requests: unknown[] = [];
    const result = await runBodyStoryAcceptance({ credential: "synthetic-task40-key", transport: createOfflineStoryTransport("valid", requests) });
    roots.push(result.root);
    try {
        expect(JSON.stringify(requests)).toContain("18 seats");
        expect(JSON.stringify(requests)).toContain("block-1");
        expect(JSON.stringify(requests)).toMatch(/max_(completion_)?tokens\":512/);
        await expect(result.recordDecision()).rejects.toThrow("No manual decision yet");
    } finally { await result.close(); }
    expect(result.report).toMatchObject({ status: "awaiting_manual_decision", transportSends: 1,
        pendingCount: 1, formalUnchanged: true, secretCleanup: "completed", decision: "none" });
    expect(await readdir(join(result.root, "data", "secrets"))).toEqual([]);
    expect(await readFile(join(result.root, "result.json"), "utf8")).not.toContain("synthetic-task40-key");
}, 30_000);

it("cancels an active generation without retry and removes temporary credentials", async () => {
    const controller = new AbortController();
    let sends = 0;
    const result = await runBodyStoryAcceptance({ credential: "synthetic-task40-key", signal: controller.signal, maxDurationMs: 1_000,
        transport: async () => { sends++; controller.abort(); return new Promise<Response>(() => undefined); } });
    roots.push(result.root);
    expect(sends).toBe(1);
    expect(result.report).toMatchObject({ status: "failed", stage: "generation_cancelled", secretCleanup: "completed", disconnect: "completed" });
    expect(await readdir(join(result.root, "data", "secrets"))).toEqual([]);
}, 30_000);

it("bounds a stalled provider and cleans up without retry", async () => {
    const result = await runBodyStoryAcceptance({ credential: "synthetic-task40-key", maxDurationMs: 1_000,
        transport: async () => new Promise<Response>(() => undefined) });
    roots.push(result.root);
    expect(result.report).toMatchObject({ status: "failed", stage: "generation_timeout", transportSends: 1, secretCleanup: "completed", disconnect: "completed" });
    expect(await readdir(join(result.root, "data", "secrets"))).toEqual([]);
}, 30_000);
it.each(["proposal_schema_invalid", "proposal_json_invalid", "completion_incomplete", "candidate_save_failed"] as const)("classifies %s without retaining model text in the report", async (expected) => {
    let sends = 0;
    const text = expected === "proposal_json_invalid" ? "PRIVATE-NOT-JSON" : JSON.stringify({ task: "story.summarize", title: "PRIVATE-TITLE", summary: "PRIVATE-SUMMARY",
        keyFacts: [{ text: "PRIVATE-FACT", evidence: expected === "proposal_schema_invalid" ? ["PRIVATE-REFERENCE"]
            : [{ entryId: "foreign-entry", entryRevisionId: "foreign-revision", representationVersion: 1 }] }] });
    const result = await runBodyStoryAcceptance({ credential: "synthetic-task40-key", transport: async () => {
        sends++;
        const event = (delta: object, finish_reason: string | null) => ({ id: "synthetic", object: "chat.completion.chunk", created: 1,
            model: "gpt-6-luna", choices: [{ index: 0, delta, finish_reason }] });
        return new Response([event({ role: "assistant", content: text }, null), event({}, expected === "completion_incomplete" ? "length" : "stop")]
            .map(value => `data: ${JSON.stringify(value)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
    } });
    roots.push(result.root);
    expect(result.report).toMatchObject({ status: "failed", failureCode: expected, pendingCount: 0, formalUnchanged: true,
        transportSends: 1, secretCleanup: "completed", disconnect: "completed", decision: "none" });
    expect(sends).toBe(1);
    expect(await readFile(join(result.root, "result.json"), "utf8")).not.toMatch(/PRIVATE|synthetic-task40-key/);
    expect(await readdir(join(result.root, "data", "secrets"))).toEqual([]);
}, 30_000);

it.each(["network", "invalid"] as const)("fails closed and cleans credentials after %s without retry or formal writes", async (outcome) => {
    const requests: unknown[] = [];
    const result = await runBodyStoryAcceptance({ credential: "synthetic-task40-key", transport: createOfflineStoryTransport(outcome, requests) });
    roots.push(result.root);
    expect(result.report).toMatchObject({ status: "failed", formalUnchanged: true, secretCleanup: "completed", disconnect: "completed", decision: "none" });
    expect(requests).toHaveLength(1);
    expect(await readdir(join(result.root, "data", "secrets"))).toEqual([]);
    expect(await readFile(join(result.root, "result.json"), "utf8")).not.toContain("PRIVATE");
}, 30_000);
