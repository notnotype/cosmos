import { describe, expect, it } from "vitest";

import { HttpCosmosClient } from "./index.js";

/**
 * LIB-001：搜索的三个新过滤维度必须真的走到 HTTP query 上——只加合同字段而客户端
 * 不拼参数，界面上选中的条件会被静默丢掉。
 */
function clientWithCapture(requests: string[]): HttpCosmosClient {
    return new HttpCosmosClient({
        baseUrl: "http://localhost:4310",
        fetch: async (input) => {
            requests.push(String(input));
            return new Response(JSON.stringify({ items: [], nextCursor: null }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        },
    });
}

describe("HttpCosmosClient structured reading", () => {
    it("rebuilds an encoded source revision with an empty command", async () => {
        const requests: { url: string; body: unknown }[] = [];
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input, init) => {
            requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
            return Response.json({ representationId: "rep-2", representationVersion: 2, promoted: false });
        } });
        expect(await client.rebuildRevisionContent("revision/1")).toEqual({ representationId: "rep-2", representationVersion: 2, promoted: false });
        expect(requests).toEqual([{ url: "http://localhost:4310/api/v1/revisions/revision%2F1/content/rebuild", body: {} }]);
    });
    it("encodes candidate routes and sends only a human decision", async () => {
        const candidate = { id: "candidate/1", storyId: "story/1", storyRevisionId: "story-revision-1",
            producer: "agent", producerVersion: "story-agent@1", provider: "fake", model: "fixture",
            inputSources: [], confidence: null, createdAt: "2026-10-08T12:00:00.000Z",
            proposal: { task: "story.summarize", title: "Title", summary: "Summary", keyFacts: [] } };
        const requests: { url: string; body: unknown }[] = [];
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input, init) => {
            requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
            return Response.json(init?.method === "POST" ? { candidate, status: "rejected" } : [{ candidate, status: "pending" }]);
        } });
        expect(await client.storyAgentCandidates("story/1")).toHaveLength(1);
        expect((await client.decideStoryAgentCandidate("candidate/1", "reject")).status).toBe("rejected");
        expect(requests).toEqual([
            { url: "http://localhost:4310/api/v1/stories/story%2F1/agent-candidates", body: null },
            { url: "http://localhost:4310/api/v1/story-agent-candidates/candidate%2F1/decision", body: { decision: "reject" } },
        ]);
    });
    it("queues exact source bindings with a stable key and reads an encoded generation route", async () => {
        const requests: { url: string; body: unknown; key: string | null }[] = [];
        const generation = { runId: "run/1", storyId: "story/1", task: "story.summarize", connectionId: "connection-1",
            status: "queued", candidateId: null, errorCode: null };
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input, init) => {
            requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null,
                key: new Headers(init?.headers).get("idempotency-key") });
            return Response.json(generation, { status: init?.method === "POST" ? 202 : 200 });
        } });
        const request = { task: "story.summarize" as const, connectionId: "connection-1", sources: [{ entryRevisionId: "revision-1", representationVersion: 2 }] };
        await expect(client.proposeStoryAgentCandidate("story/1", request, "stable-key")).resolves.toEqual(generation);
        await expect(client.storyAgentGeneration("story/1", "run/1")).resolves.toEqual(generation);
        expect(requests).toEqual([
            { url: "http://localhost:4310/api/v1/stories/story%2F1/agent-candidates", body: request, key: "stable-key" },
            { url: "http://localhost:4310/api/v1/stories/story%2F1/agent-generations/run%2F1", body: null, key: null },
        ]);
        await expect(client.proposeStoryAgentCandidate("story/1", { ...request, sources: [{ entryRevisionId: "revision-1", representationVersion: 0 }] }, "stable-key")).rejects.toThrow();
        await expect(client.proposeStoryAgentCandidate("story/1", request, " ")).rejects.toThrow();
        expect(requests).toHaveLength(2);
    });
    it("sends a validated selection command to the encoded revision endpoint", async () => {
        const requests: { url: string; body: unknown; method: string | undefined }[] = [];
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input, init) => {
            requests.push({ url: String(input), body: JSON.parse(String(init?.body)), method: init?.method });
            return Response.json({ currentRepresentationId: "old", locked: true, changed: true });
        } });
        const command = { operation: "rollback" as const, expectedCurrentId: "current", expectedLocked: false, representationId: "old" };
        await expect(client.selectRevisionContent("revision/1", command)).resolves.toMatchObject({ locked: true });
        expect(requests[0]).toEqual({ url: "http://localhost:4310/api/v1/revisions/revision%2F1/content/selection", body: command, method: "POST" });
        await expect(client.selectRevisionContent("revision/1", { ...command, representationId: undefined })).rejects.toThrow();
        expect(requests).toHaveLength(1);
    });
    it("requests an exact historical version and validates the response", async () => {
        const requests: string[] = [];
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input) => {
            requests.push(String(input));
            return Response.json({ entryId: "entry-1", entryRevisionId: "revision/1", representation: null,
                contentText: "", readingMode: "unavailable", evidenceStatus: "representation-unavailable" });
        } });
        expect((await client.revisionContent("revision/1", 4)).readingMode).toBe("unavailable");
        const url = new URL(requests[0]!);
        expect(url.pathname).toBe("/api/v1/revisions/revision%2F1/content");
        expect(url.searchParams.get("representationVersion")).toBe("4");
        await expect(client.revisionContent("revision/1", 0)).rejects.toBeInstanceOf(RangeError);
        expect(requests).toHaveLength(1);
    });
});

describe("HttpCosmosClient search filters", () => {
    it("sends author, media type and ingest status as query parameters", async () => {
        const requests: string[] = [];
        const client = clientWithCapture(requests);

        await client.search({
            author: "Alice",
            contentKind: "video",
            assetStatus: "saved",
            limit: 20,
        });

        const url = new URL(requests[0]!);
        expect(url.pathname).toBe("/api/v1/search");
        expect(url.searchParams.get("author")).toBe("Alice");
        expect(url.searchParams.get("contentKind")).toBe("video");
        expect(url.searchParams.get("assetStatus")).toBe("saved");
    });

    it("omits the parameters when the caller leaves them out", async () => {
        const requests: string[] = [];
        const client = clientWithCapture(requests);

        await client.search({ text: "qwen", limit: 20 });

        const url = new URL(requests[0]!);
        expect(url.searchParams.has("author")).toBe(false);
        expect(url.searchParams.has("contentKind")).toBe(false);
        expect(url.searchParams.has("assetStatus")).toBe(false);
    });
});
