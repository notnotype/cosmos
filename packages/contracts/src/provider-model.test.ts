import { describe, expect, it } from "vitest";

import {
    createModelProviderCommandSchema,
    updateModelProviderCommandSchema,
    modelProviderSnapshotSchema,
    modelProviderOperationSnapshotSchema, modelProviderPageSchema,
    createConfiguredModelCommandSchema,
    updateConfiguredModelCommandSchema,
    configuredModelSnapshotSchema,
    createProviderModelDiscoveryCommandSchema,
    providerModelDiscoverySnapshotSchema,
} from "./index.js";

const provider = {
    name: "My Provider", api: "openai-completions", baseUrl: "https://provider.example/v1",
    apiKey: "synthetic-key",
};
const model = {
    modelId: "text-model", name: "Text model", contextWindow: 8192, maxOutputTokens: 256,
    inputPricePerMillion: 1, outputPricePerMillion: 2,
    cacheWritePricePerMillion: 3, cacheReadPricePerMillion: 4,
};

describe("Provider/model configuration contracts", () => {
    it("accepts both explicitly selected APIs and preserves credential bytes", () => {
        for (const api of ["openai-completions", "openai-responses"]) {
            expect(createModelProviderCommandSchema.parse({ ...provider, api, apiKey: " synthetic-key " }))
                .toMatchObject({ api, apiKey: " synthetic-key " });
        }
    });

    it("requires a bounded credential only on create, rejecting client references", () => {
        for (const apiKey of [undefined, "", "x\r\ny", "x".repeat(8193)]) {
            expect(createModelProviderCommandSchema.safeParse({ ...provider, apiKey }).success).toBe(false);
        }
        for (const extra of [{ secretRef: "owned-elsewhere" }, { configJson: "{}" }]) {
            expect(createModelProviderCommandSchema.safeParse({ ...provider, ...extra }).success).toBe(false);
        }
    });

    it("requires a version and an actual edit; omitted key preserves the existing value", () => {
        expect(updateModelProviderCommandSchema.parse({ expectedVersion: 1, name: "Renamed" }))
            .toEqual({ expectedVersion: 1, name: "Renamed" });
        for (const input of [{ name: "Renamed" }, { expectedVersion: 0, name: "Renamed" },
            { expectedVersion: 1 }, { expectedVersion: 1, apiKey: "" },
            { expectedVersion: 1, apiKey: null }, { expectedVersion: 1, secretRef: "x" }]) {
            expect(updateModelProviderCommandSchema.safeParse(input).success).toBe(false);
        }
    });

    it("rejects syntactically unsafe provider addresses without DNS or HTTP", () => {
        for (const baseUrl of ["http://provider.example/v1", "https://user:pass@provider.example/v1",
            "https://provider.example/v1?key=x", "https://provider.example/v1#x", "https://localhost/v1",
            "https://127.0.0.1/v1", "https://[::1]/v1", "https://provider.example:444/v1", "not a URL"]) {
            expect(createModelProviderCommandSchema.safeParse({ ...provider, baseUrl }).success).toBe(false);
        }
    });

    it("validates operation receipts and provider pages with exact public fields", () => {
        const receipt = { id: "operation:one", kind: "update", providerId: "provider/one", state: "failed", resourceVersion: 3, errorCode: "version_conflict" };
        expect(modelProviderOperationSnapshotSchema.parse(receipt)).toEqual(receipt);
        expect(modelProviderOperationSnapshotSchema.safeParse({ ...receipt, apiKey: "secret" }).success).toBe(false);
        expect(modelProviderPageSchema.parse({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
        expect(modelProviderPageSchema.safeParse({ items: [], nextCursor: "", extra: true }).success).toBe(false);
    });

    it("bounds model tokens and forbids reassignment or credential fields", () => {
        expect(createConfiguredModelCommandSchema.parse(model)).toEqual({
            ...model, currency: "USD", tieredPricingEnabled: false, tieredPricingThreshold: null,
            highInputPricePerMillion: null, highOutputPricePerMillion: null,
            highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null,
        });
        expect(createConfiguredModelCommandSchema.parse({ ...model, modelId: "namespace/text-model" }))
            .toMatchObject({ modelId: "namespace/text-model" });
        expect(updateConfiguredModelCommandSchema.safeParse({ expectedVersion: 1, modelId: "https://provider.example/model" }).success).toBe(false);
        expect(configuredModelSnapshotSchema.safeParse({ ...model, id: "model-1", providerId: "provider-1", version: 1,
            modelId: "https://provider.example/model" }).success).toBe(false);
        expect(createConfiguredModelCommandSchema.parse({ ...model, inputPricePerMillion: 0.5, outputPricePerMillion: 1.25 }))
            .toMatchObject({ inputPricePerMillion: 0.5, outputPricePerMillion: 1.25 });
        for (const change of [{ maxOutputTokens: 8193 }, { contextWindow: 0 }, { maxOutputTokens: 1.5 },
            { contextWindow: Number.MAX_SAFE_INTEGER + 1 }, { modelId: "" }, { modelId: "https://provider.example/model" },
            { inputPricePerMillion: -0.01 }, { outputPricePerMillion: -0.01 },
            { providerId: "another" }, { apiKey: "synthetic-key" }]) {
            expect(createConfiguredModelCommandSchema.safeParse({ ...model, ...change }).success).toBe(false);
        }
        expect(updateConfiguredModelCommandSchema.parse({ expectedVersion: 1, maxOutputTokens: 128 }))
            .toEqual({ expectedVersion: 1, maxOutputTokens: 128 });
        expect(updateConfiguredModelCommandSchema.safeParse({ expectedVersion: 1, inputPricePerMillion: 0, outputPricePerMillion: 2 }).success)
            .toBe(false);
        for (const price of [{ inputPricePerMillion: -1 }, { outputPricePerMillion: -1 }]) {
            expect(updateConfiguredModelCommandSchema.safeParse({ expectedVersion: 1, ...price }).success).toBe(false);
        }
        expect(updateConfiguredModelCommandSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
        expect(updateConfiguredModelCommandSchema.safeParse({ expectedVersion: 1, providerId: "another" }).success).toBe(false);
        expect(updateConfiguredModelCommandSchema.safeParse({ expectedVersion: 1, contextWindow: 32, maxOutputTokens: 64 }).success).toBe(false);
    });

    it("requires the complete four-price set and validates tiered pricing as one group", () => {
        const created = createConfiguredModelCommandSchema.parse(model);
        expect(created).toMatchObject({
            inputPricePerMillion: 1, outputPricePerMillion: 2,
            cacheWritePricePerMillion: 3, cacheReadPricePerMillion: 4,
            currency: "USD", tieredPricingEnabled: false,
        });
        for (const field of ["inputPricePerMillion", "outputPricePerMillion", "cacheWritePricePerMillion", "cacheReadPricePerMillion"] as const) {
            const incomplete = { ...model };
            delete incomplete[field];
            expect(createConfiguredModelCommandSchema.safeParse(incomplete).success).toBe(false);
        }
        expect(createConfiguredModelCommandSchema.safeParse({
            ...model, tieredPricingEnabled: true, tieredPricingThreshold: 272000,
            highInputPricePerMillion: 5, highOutputPricePerMillion: 6,
            highCacheWritePricePerMillion: 7, highCacheReadPricePerMillion: 8,
        }).success).toBe(true);
        expect(createConfiguredModelCommandSchema.safeParse({
            ...model, tieredPricingEnabled: true, tieredPricingThreshold: 272000,
            highInputPricePerMillion: 5, highOutputPricePerMillion: 6,
            highCacheWritePricePerMillion: 7,
        }).success).toBe(false);
        expect(createConfiguredModelCommandSchema.safeParse({
            ...model, tieredPricingEnabled: false, tieredPricingThreshold: 272000,
        }).success).toBe(false);
        expect(createConfiguredModelCommandSchema.safeParse({ ...model, currency: "EUR" }).success).toBe(false);
    });

    it("requires pricing patches to carry a complete configuration while metadata-only patches stay partial", () => {
        expect(updateConfiguredModelCommandSchema.parse({ expectedVersion: 1, name: "Renamed" }))
            .toEqual({ expectedVersion: 1, name: "Renamed" });
        const prices = {
            inputPricePerMillion: 1, outputPricePerMillion: 2,
            cacheWritePricePerMillion: 3, cacheReadPricePerMillion: 4,
            currency: "CNY", tieredPricingEnabled: true, tieredPricingThreshold: 272000,
            highInputPricePerMillion: 5, highOutputPricePerMillion: 6,
            highCacheWritePricePerMillion: 7, highCacheReadPricePerMillion: 8,
        } as const;
        expect(updateConfiguredModelCommandSchema.parse({ expectedVersion: 1, ...prices }))
            .toMatchObject({ currency: "CNY", tieredPricingEnabled: true, highCacheReadPricePerMillion: 8 });
        expect(updateConfiguredModelCommandSchema.safeParse({ expectedVersion: 1, currency: "USD" }).success).toBe(false);
        expect(updateConfiguredModelCommandSchema.safeParse({ expectedVersion: 1, ...prices, highCacheReadPricePerMillion: null }).success).toBe(false);
        expect(updateConfiguredModelCommandSchema.safeParse({ expectedVersion: 1, ...prices, tieredPricingEnabled: false }).success).toBe(false);
    });

    it("reads legacy snapshots without inventing prices and defaults their currency and tier switch", () => {
        const legacy = {
            modelId: "text-model", name: "Text model", contextWindow: 8192, maxOutputTokens: 256,
            id: "model-legacy", providerId: "provider-1", version: 1,
            createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z",
        };
        expect(configuredModelSnapshotSchema.parse(legacy)).toMatchObject({
            currency: "USD", tieredPricingEnabled: false, tieredPricingThreshold: null,
        });
        expect(configuredModelSnapshotSchema.parse(legacy)).not.toHaveProperty("inputPricePerMillion");
        expect(configuredModelSnapshotSchema.parse(legacy)).not.toHaveProperty("cacheReadPricePerMillion");
    });

    it("accepts discovery commands without credentials and rejects unsafe fields", () => {
        const command = { providerId: "provider-1", expectedProviderVersion: 3 };
        expect(createProviderModelDiscoveryCommandSchema.parse(command)).toEqual(command);
        for (const invalid of [
            { ...command, providerId: "" },
            { ...command, expectedProviderVersion: 0 },
            { ...command, idempotencyKey: "discover-1" },
            { ...command, apiKey: "secret" },
            { ...command, baseUrl: "https://provider.example/v1" },
        ]) {
            expect(createProviderModelDiscoveryCommandSchema.safeParse(invalid).success).toBe(false);
        }
    });

    it("keeps discovery snapshots safe and state-consistent", () => {
        const base = {
            id: "discovery-1", providerId: "provider-1", providerVersion: 3,
            candidates: [], errorCode: null,
            createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z",
        };
        // 发现是同步一次请求，没有排队/运行中态：结果只有成功或失败。
        expect(providerModelDiscoverySnapshotSchema.safeParse({ ...base, status: "queued" }).success).toBe(false);
        expect(providerModelDiscoverySnapshotSchema.parse({ ...base, status: "succeeded", candidates: [{ modelId: "gpt-x", name: "GPT X" }] }))
            .toMatchObject({ status: "succeeded" });
        expect(providerModelDiscoverySnapshotSchema.parse({ ...base, status: "failed", errorCode: "timeout" }))
            .toMatchObject({ status: "failed", errorCode: "timeout" });
        for (const invalid of [
            { ...base, status: "failed", errorCode: null },
            { ...base, status: "running", errorCode: "timeout" },
            { ...base, status: "failed", candidates: [{ modelId: "https://provider.example/model", name: "unsafe" }], errorCode: "timeout" },
            { ...base, status: "succeeded", candidates: [{ modelId: "gpt-x", name: "GPT X" }], errorCode: "timeout" },
            { ...base, status: "succeeded", apiKey: "secret" },
        ]) {
            expect(providerModelDiscoverySnapshotSchema.safeParse(invalid).success).toBe(false);
        }
    });

    it("keeps public snapshots strict and credential-free", () => {
        const snapshot = {
            id: "provider-1", name: provider.name, api: provider.api, baseUrl: provider.baseUrl,
            version: 1, state: "active", credentialState: "configured",
            createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z",
        };
        expect(modelProviderSnapshotSchema.parse(snapshot)).toEqual(snapshot);
        for (const extra of [{ apiKey: "synthetic-key" }, { secretRef: "private-ref" }]) {
            expect(modelProviderSnapshotSchema.safeParse({ ...snapshot, ...extra }).success).toBe(false);
        }
        expect(configuredModelSnapshotSchema.parse({
            ...model, id: "model-1", providerId: "provider-1", version: 1,
            createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z",
        })).toMatchObject({ id: "model-1", providerId: "provider-1" });
    });
});
