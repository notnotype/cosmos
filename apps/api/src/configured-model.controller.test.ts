import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { expect, it, vi } from "vitest";
import type { ConfiguredModelSnapshot } from "@cosmos/contracts";
import { ConfiguredModelController } from "./configured-model.controller.js";
import { configureModelConfigurationBodyParsers } from "./model-configuration-body-parser.js";

const providerId = "provider/one";
const modelId = "model/one";
const pricing = {
    inputPricePerMillion: 1, outputPricePerMillion: 2, cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0.1,
    currency: "USD" as const, tieredPricingEnabled: false, tieredPricingThreshold: null,
    highInputPricePerMillion: null, highOutputPricePerMillion: null,
    highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null,
};
const snapshot: ConfiguredModelSnapshot = {
    currency: "USD", tieredPricingEnabled: false, tieredPricingThreshold: null,
    highInputPricePerMillion: null, highOutputPricePerMillion: null,
    highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null,
    id: modelId, providerId, modelId: "org/model", name: "Synthetic",
    contextWindow: 4096, maxOutputTokens: 128, version: 1,
    createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z",
};

it("serves provider-scoped model CRUD through trusted HTTP without leaking failures", async () => {
    const trust = { origins: ["http://localhost:4300"], authorities: [] as string[] };
    const models = {
        list: vi.fn(async (id: string) => id === providerId ? [snapshot] : []),
        get: vi.fn(async (provider: string, id: string) => provider === providerId && id === modelId ? snapshot : null),
        create: vi.fn(async (_provider: string, input: unknown) => ({ ...snapshot, ...(input as object) })),
        update: vi.fn(async () => { throw Object.assign(new Error("PRIVATE_MODEL_DETAIL"), { code: "version_conflict" }); }),
        delete: vi.fn(async () => undefined),
    };
    @Module({ controllers: [ConfiguredModelController], providers: [
        { provide: "COSMOS_MODEL_CONFIGURATION_TRUST", useValue: trust },
        { provide: "COSMOS_CONFIGURED_MODELS", useValue: models },
    ] })
    class TestModule {}
    const app = await NestFactory.create<NestExpressApplication>(TestModule, { logger: false, bodyParser: false });
    configureModelConfigurationBodyParsers(app);
    app.setGlobalPrefix("api/v1");
    try {
        await app.listen(0, "127.0.0.1");
        const base = await app.getUrl();
        trust.authorities.push(new URL(base).host);
        const get = async (path: string) => fetch(`${base}/api/v1/${path}`);
        const read = await get("model-providers/provider%2Fone/models");
        expect(read.status).toBe(200);
        expect(await read.json()).toEqual({ items: [snapshot], nextCursor: null });
        expect(models.list).toHaveBeenCalledWith(providerId);
        const missing = await get("model-providers/other/models/model%2Fone");
        expect(missing.status).toBe(404);

        const headers = { Origin: trust.origins[0]!, "Content-Type": "application/json", "Idempotency-Key": "model-create" };
        const created = await fetch(`${base}/api/v1/model-providers/provider%2Fone/models`, {
            method: "POST", headers, body: JSON.stringify({ modelId: "org/new", name: "New", contextWindow: 2048, maxOutputTokens: 64, ...pricing }),
        });
        expect(created.status).toBe(201);
        expect(models.create).toHaveBeenCalledWith(providerId, { modelId: "org/new", name: "New", contextWindow: 2048, maxOutputTokens: 64, ...pricing });

        const conflict = await fetch(`${base}/api/v1/model-providers/provider%2Fone/models/model%2Fone`, {
            method: "PATCH", headers: { ...headers, "Idempotency-Key": "model-update" },
            body: JSON.stringify({ expectedVersion: 1, name: "Changed" }),
        });
        expect(conflict.status).toBe(409);
        const conflictText = await conflict.text();
        expect(conflictText).not.toContain("PRIVATE_MODEL_DETAIL");
        expect(JSON.parse(conflictText)).toMatchObject({ code: "version_conflict" });

        const deleted = await fetch(`${base}/api/v1/model-providers/provider%2Fone/models/model%2Fone`, {
            method: "DELETE", headers: { ...headers, "Idempotency-Key": "model-delete" }, body: JSON.stringify({ expectedVersion: 1 }),
        });
        expect(deleted.status).toBe(204);
        expect(models.delete).toHaveBeenCalledWith(providerId, modelId, 1);
        expect(models.update).toHaveBeenCalledOnce();
        expect(models.delete).toHaveBeenCalledOnce();

        const denied = await fetch(`${base}/api/v1/model-providers/provider%2Fone/models`, {
            method: "POST", headers: { ...headers, Origin: "http://evil.example" }, body: "{}",
        });
        expect(denied.status).toBe(403);
        expect(models.create).toHaveBeenCalledOnce();
    } finally {
        await app.close();
    }
});
