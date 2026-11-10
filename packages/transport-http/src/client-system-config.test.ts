import { describe, expect, it } from "vitest";
import { CosmosTransportError, HttpCosmosClient } from "./index.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("HttpCosmosClient SystemConfig", () => {
    it("reads the new config endpoint with a deleted model", async () => {
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input) => {
            expect(String(input)).toBe("http://localhost:4310/api/v1/system/config");
            return jsonResponse({ defaultModelId: "deleted-model", defaultModel: null });
        } });
        expect(await client.getSystemConfig()).toEqual({ defaultModelId: "deleted-model", defaultModel: null });
    });

    it("parses a full default model including zero price and version metadata", async () => {
        const model = {
            id: "model-one", providerId: "provider-one", modelId: "upstream-model", name: "Model One",
            contextWindow: 128000, maxOutputTokens: 4096, inputPricePerMillion: 0, outputPricePerMillion: 2,
            version: 2, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T01:00:00.000Z",
        };
        const response = { defaultModelId: model.id, defaultModel: model };
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async () => jsonResponse(response) });
        expect(await client.getSystemConfig()).toEqual(response);
    });

    it.each(["model/one", null])("updates the new config endpoint with %s", async (defaultModelId) => {
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input, init) => {
            expect(String(input)).toBe("http://localhost:4310/api/v1/system/config");
            expect(init?.method).toBe("PUT");
            expect(JSON.parse(String(init?.body))).toEqual({ defaultModelId });
            return jsonResponse({ defaultModelId });
        } });
        expect(await client.updateSystemConfig({ defaultModelId })).toEqual({ defaultModelId });
    });

    it("validates config writes before making a request", async () => {
        let called = false;
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async () => {
            called = true;
            return jsonResponse({ defaultModelId: null });
        } });
        await expect(client.updateSystemConfig({ defaultModelId: " " })).rejects.toThrow();
        expect(called).toBe(false);
    });

    it.each([404, 409, 503])("preserves API errors (%s) for actionable UI messages", async (status) => {
        const body = {
            code: status === 404 ? "not_found" : status === 409 ? "invalid_model_selection" : "dependency_unavailable",
            message: "Model is unavailable.", requestId: "request-42", retryable: status === 503,
        };
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async () => jsonResponse(body, status) });
        const result = client.updateSystemConfig({ defaultModelId: "model-one" });
        await expect(result).rejects.toBeInstanceOf(CosmosTransportError);
        await expect(result).rejects.toMatchObject({ status, body });
    });
    it("reads the default model, including when none is set", async () => {
        const requests: Array<{ url: string; method: string }> = [];
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input, init) => {
            requests.push({ url: String(input), method: init?.method ?? "GET" });
            return jsonResponse({ modelId: requests.length === 1 ? "model/one" : null });
        } });
        expect(await client.getDefaultModel()).toEqual({ modelId: "model/one" });
        expect(await client.getDefaultModel()).toEqual({ modelId: null });
        expect(requests).toEqual([
            { url: "http://localhost:4310/api/v1/config/default-model", method: "GET" },
            { url: "http://localhost:4310/api/v1/config/default-model", method: "GET" },
        ]);
    });

    it("sets and clears the default model with a PUT body", async () => {
        const requests: Array<{ url: string; method: string; body?: string }> = [];
        const client = new HttpCosmosClient({ baseUrl: "http://localhost:4310", fetch: async (input, init) => {
            requests.push({ url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? "") });
            return jsonResponse({ modelId: JSON.parse(String(init?.body)).modelId });
        } });
        expect(await client.setDefaultModel("model/one")).toEqual({ modelId: "model/one" });
        expect(await client.setDefaultModel(null)).toEqual({ modelId: null });
        expect(requests).toEqual([
            { url: "http://localhost:4310/api/v1/config/default-model", method: "PUT", body: JSON.stringify({ modelId: "model/one" }) },
            { url: "http://localhost:4310/api/v1/config/default-model", method: "PUT", body: JSON.stringify({ modelId: null }) },
        ]);
    });
});
