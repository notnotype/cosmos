import { describe, expect, it } from "vitest";
import { HttpCosmosClient } from "./index.js";

const prices = { inputPricePerMillion: 1, outputPricePerMillion: 2, cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0.1 };
const defaults = {
    currency: "USD", tieredPricingEnabled: false, tieredPricingThreshold: null,
    highInputPricePerMillion: null, highOutputPricePerMillion: null,
    highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null,
};
const model = {
    ...defaults,
    id: "model/one", providerId: "provider/one", modelId: "org/model",
    name: "Model", contextWindow: 4096, maxOutputTokens: 128, version: 1,
    createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("HttpCosmosClient ConfiguredModel", () => {
    it("lists and reads models under an encoded provider scope", async () => {
        const requests: Array<{ url: string; method: string }> = [];
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input, init) => {
            requests.push({ url: String(input), method: init?.method ?? "GET" });
            return jsonResponse(requests.length === 1 ? { items: [model], nextCursor: null } : model);
        } });
        expect(await client.listConfiguredModels("provider/one")).toEqual({ items: [model], nextCursor: null });
        expect(await client.getConfiguredModel("provider/one", "model/one")).toEqual(model);
        expect(requests).toEqual([
            { url: "http://localhost:4310/api/v1/model-providers/provider%2Fone/models", method: "GET" },
            { url: "http://localhost:4310/api/v1/model-providers/provider%2Fone/models/model%2Fone", method: "GET" },
        ]);
    });

    it("creates, updates, and deletes with one caller-owned idempotency key and version", async () => {
        const requests: Array<{ url: string; method: string; body?: string; key?: string }> = [];
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input, init) => {
            requests.push({ url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? ""), key: new Headers(init?.headers).get("idempotency-key") ?? undefined });
            return jsonResponse(requests.length === 1 ? model : requests.length === 2 ? { ...model, version: 2 } : {}, requests.length === 2 ? 200 : requests.length === 3 ? 204 : 201);
        } });
        expect(await client.createConfiguredModel("provider/one", { modelId: model.modelId, name: model.name, contextWindow: model.contextWindow, maxOutputTokens: model.maxOutputTokens, ...prices }, "create:model")).toEqual(model);
        expect(await client.updateConfiguredModel("provider/one", "model/one", { expectedVersion: 1, name: "Renamed" }, "update:model")).toEqual({ ...model, version: 2 });
        await expect(client.deleteConfiguredModel("provider/one", "model/one", 2, "delete:model")).resolves.toBeUndefined();
        expect(requests).toEqual([
            { url: "http://localhost:4310/api/v1/model-providers/provider%2Fone/models", method: "POST", body: JSON.stringify({ modelId: "org/model", name: "Model", contextWindow: 4096, maxOutputTokens: 128, ...prices, ...defaults }), key: "create:model" },
            { url: "http://localhost:4310/api/v1/model-providers/provider%2Fone/models/model%2Fone", method: "PATCH", body: JSON.stringify({ expectedVersion: 1, name: "Renamed" }), key: "update:model" },
            { url: "http://localhost:4310/api/v1/model-providers/provider%2Fone/models/model%2Fone", method: "DELETE", body: JSON.stringify({ expectedVersion: 2 }), key: "delete:model" },
        ]);
    });
});
