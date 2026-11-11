import { expect, it, vi } from "vitest";
import { configuredModelSnapshotSchema } from "@cosmos/contracts";

import { PrismaConfiguredModelRepository } from "./configured-model-repository.js";

type Client = ConstructorParameters<typeof PrismaConfiguredModelRepository>[0];

const basePrices = { inputPricePerMillion: 1, outputPricePerMillion: 2, cacheWritePricePerMillion: 3, cacheReadPricePerMillion: 4 };
const row = {
    id: "model-a", providerId: "provider-a", modelId: "org/model", name: "Model A",
    contextWindow: 8192, maxOutputTokens: 256, version: 1,
    createdAt: new Date("2026-10-15T00:00:00.000Z"), updatedAt: new Date("2026-10-15T00:00:00.000Z"),
};

it("projects every price and tier consistently without losing zero or inventing unknown cache rates", async () => {
    const pricing = {
        inputPricePerMillion: "1.25", outputPricePerMillion: "2.5",
        cacheWritePricePerMillion: "0", cacheReadPricePerMillion: "0.25",
        currency: "CNY", tieredPricingEnabled: true, tieredPricingThreshold: 100,
        highInputPricePerMillion: "3", highOutputPricePerMillion: "4",
        highCacheWritePricePerMillion: "0", highCacheReadPricePerMillion: "0.5",
    };
    const pricedRow = { ...row, ...pricing };
    const client: Client = {
        configuredModel: {
            findFirst: vi.fn(async () => pricedRow), findMany: vi.fn(async () => [pricedRow]),
            create: vi.fn(async () => pricedRow), updateMany: vi.fn(async () => ({ count: 1 })),
            deleteMany: vi.fn(async () => ({ count: 1 })),
        },
    };
    const repository = new PrismaConfiguredModelRepository(client);
    const expected = {
        inputPricePerMillion: 1.25, outputPricePerMillion: 2.5,
        cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0.25,
        currency: "CNY", tieredPricingEnabled: true, tieredPricingThreshold: 100,
        highInputPricePerMillion: 3, highOutputPricePerMillion: 4,
        highCacheWritePricePerMillion: 0, highCacheReadPricePerMillion: 0.5,
    };
    expect(configuredModelSnapshotSchema.parse(await repository.get("provider-a", "model-a"))).toMatchObject(expected);
    expect(await repository.list("provider-a")).toEqual([expect.objectContaining(expected)]);
});

it("lists and reads only models belonging to the requested Provider", async () => {
    const findMany = vi.fn(async (_input: Parameters<Client["configuredModel"]["findMany"]>[0]) => [row]);
    const findFirst = vi.fn(async (_input: Parameters<Client["configuredModel"]["findFirst"]>[0]) => row);
    const repository = new PrismaConfiguredModelRepository({ configuredModel: { findMany, findFirst } } as unknown as Client);

    expect(await repository.list("provider-a")).toEqual([expect.objectContaining({ id: "model-a", version: 1 })]);
    expect(await repository.get("provider-a", "model-a")).toMatchObject({ providerId: "provider-a" });
    expect(findMany.mock.calls[0]?.[0].where).toEqual({ providerId: "provider-a" });
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({ id: "model-a", providerId: "provider-a" });
});

it("creates non-secret model fields without provider or credential data", async () => {
    const create = vi.fn(async (_input: Parameters<Client["configuredModel"]["create"]>[0]) => row);
    const repository = new PrismaConfiguredModelRepository({ configuredModel: { create } } as unknown as Client);
    await repository.create({ id: "model-a", providerId: "provider-a", fields: {
        modelId: "org/model", name: "Model A", contextWindow: 8192, maxOutputTokens: 256, ...basePrices,
    } });
    expect(create.mock.calls[0]?.[0].data).toEqual({
        id: "model-a", providerId: "provider-a", modelId: "org/model", name: "Model A",
        contextWindow: 8192, maxOutputTokens: 256, ...basePrices,
    });
});

it("translates the provider/modelId unique constraint into already_exists", async () => {
    const create = vi.fn(async (_input: Parameters<Client["configuredModel"]["create"]>[0]) => {
        throw Object.assign(new Error("Unique constraint failed."), { code: "P2002" });
    });
    const repository = new PrismaConfiguredModelRepository({ configuredModel: { create } } as unknown as Client);

    // 兜底成 dependency_unavailable 会让界面提示「稍后重试」，而重复录入永远重试不成功。
    await expect(repository.create({ id: "model-b", providerId: "provider-a", fields: {
        modelId: "org/model", name: "Model A", contextWindow: 8192, maxOutputTokens: 256, ...basePrices,
    } })).rejects.toMatchObject({ code: "already_exists" });
});

it("does not swallow unrelated database failures", async () => {
    const create = vi.fn(async (_input: Parameters<Client["configuredModel"]["create"]>[0]) => {
        throw Object.assign(new Error("Connection reset."), { code: "ECONNRESET" });
    });
    const repository = new PrismaConfiguredModelRepository({ configuredModel: { create } } as unknown as Client);

    await expect(repository.create({ id: "model-c", providerId: "provider-a", fields: {
        modelId: "org/model", name: "Model A", contextWindow: 8192, maxOutputTokens: 256, ...basePrices,
    } })).rejects.toMatchObject({ code: "ECONNRESET" });
});

it("updates with a provider-scoped version fence and rejects stale versions", async () => {
    const updateMany = vi.fn(async (_input: Parameters<Client["configuredModel"]["updateMany"]>[0]) => ({ count: 1 }));
    const findFirst = vi.fn(async (_input: Parameters<Client["configuredModel"]["findFirst"]>[0]) => row);
    const repository = new PrismaConfiguredModelRepository({ configuredModel: { updateMany, findFirst } } as unknown as Client);
    await repository.update({ id: "model-a", providerId: "provider-a", expectedVersion: 1, fields: { name: "Renamed" } });
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
        where: { id: "model-a", providerId: "provider-a", version: 1 }, data: { name: "Renamed", version: { increment: 1 } },
    });
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(repository.update({ id: "model-a", providerId: "provider-a", expectedVersion: 0, fields: {} }))
        .rejects.toMatchObject({ code: "version_conflict" });
});

it("deletes only the matching provider model version", async () => {
    const deleteMany = vi.fn(async (_input: Parameters<Client["configuredModel"]["deleteMany"]>[0]) => ({ count: 1 }));
    const repository = new PrismaConfiguredModelRepository({ configuredModel: { deleteMany } } as unknown as Client);
    await repository.delete({ id: "model-a", providerId: "provider-a", expectedVersion: 3 });
    expect(deleteMany.mock.calls[0]?.[0]).toEqual({ where: { id: "model-a", providerId: "provider-a", version: 3 } });
    deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(repository.delete({ id: "model-a", providerId: "provider-a", expectedVersion: 3 }))
        .rejects.toMatchObject({ code: "version_conflict" });
});
