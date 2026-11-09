import { describe, expect, it } from "vitest";
import { HttpCosmosClient } from "./index.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("HttpCosmosClient SystemConfig", () => {
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
