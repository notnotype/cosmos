import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { PrismaClient } from "@prisma/client";
import type { Logger } from "@cosmos/logging";
import { describe, expect, it } from "vitest";
import { SystemConfigService, type SystemConfigRepository } from "../../../packages/application/src/system-config.js";
import { PrismaSystemConfigRepository } from "../../../packages/storage-prisma/src/system-config.js";
import { withRepository } from "../../../packages/storage-prisma/src/index.fixtures.js";
import { RequestExceptionFilter } from "./request-logging.js";
import { configureModelConfigurationBodyParsers } from "./model-configuration-body-parser.js";
import { SystemConfigController } from "./system-config.controller.js";

const currentRoute = "/api/v1/system/config";
const legacyRoute = "/api/v1/config/default-model";
const secret = "PRIVATE_SYSTEM_CONFIG_API_SECRET";
const createdAt = new Date("2026-01-02T03:04:05.000Z");
const updatedAt = new Date("2026-02-03T04:05:06.000Z");
type Request = (route: string, body?: unknown) => Promise<Response>;

function createLogger(): Logger {
    const logger: Logger = {
        child: () => logger,
        withContext: (_context, use) => use(),
        debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, close: async () => {},
    };
    return logger;
}

async function withApi(service: SystemConfigService, use: (request: Request) => Promise<void>) {
    @Module({
        controllers: [SystemConfigController],
        providers: [{ provide: "COSMOS_SYSTEM_CONFIG", useValue: service }],
    })
    class TestModule {}
    const app = await NestFactory.create<NestExpressApplication>(TestModule, { logger: false, bodyParser: false });
    configureModelConfigurationBodyParsers(app);
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new RequestExceptionFilter(createLogger()));
    try {
        await app.listen(0, "127.0.0.1");
        const base = await app.getUrl();
        await use((route, body) => fetch(`${base}${route}`, body === undefined ? undefined : {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }));
    } finally {
        await app.close();
    }
}

async function withDatabaseApi(use: (request: Request, prisma: PrismaClient) => Promise<void>) {
    await withRepository("system-config-api", async (_repository, prisma) => {
        await withApi(new SystemConfigService(new PrismaSystemConfigRepository(prisma)), async (request) => {
            await use(request, prisma);
        });
    });
}

async function expectSuccess(response: Response, expected: unknown) {
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(expected);
}

async function expectError(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain(secret);
    const body: unknown = JSON.parse(text);
    expect(body).toEqual({
        code, message: expect.any(String), requestId: expect.any(String), retryable: status >= 500,
    });
    expect(body).toMatchObject({ requestId: response.headers.get("x-request-id") });
}

async function seedModels(prisma: PrismaClient) {
    const provider = await prisma.modelProvider.create({ data: {
        id: "provider-system-config-api", name: "Test provider", api: "openai-completions",
        baseUrl: "https://provider.example/v1", secretRef: secret,
    } });
    const first = await prisma.configuredModel.create({ data: {
        id: "a", providerId: provider.id, modelId: "upstream/first", name: "First model",
        contextWindow: 32768, maxOutputTokens: 8192, version: 7,
        inputPricePerMillion: "1.25", outputPricePerMillion: "2.5", createdAt, updatedAt,
    } });
    const second = await prisma.configuredModel.create({ data: {
        id: "x".repeat(200), providerId: provider.id, modelId: "upstream/second", name: "Unknown pricing",
        contextWindow: 65536, maxOutputTokens: 4096, version: 3,
        inputPricePerMillion: null, outputPricePerMillion: null, createdAt, updatedAt,
    } });
    return { provider, first, second };
}

const pricingDefaults = {
    currency: "USD" as const, tieredPricingEnabled: false, tieredPricingThreshold: null,
    highInputPricePerMillion: null, highOutputPricePerMillion: null,
    highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null,
};
function firstSnapshot(providerId: string) {
    return {
        id: "a", providerId, modelId: "upstream/first", name: "First model",
        contextWindow: 32768, maxOutputTokens: 8192, version: 7,
        inputPricePerMillion: 1.25, outputPricePerMillion: 2.5,
        ...pricingDefaults,
        createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
    };
}

describe("system config HTTP contracts", () => {
    it("reads an empty SQLite configuration as two nulls and preserves legacy GET", async () => {
        await withDatabaseApi(async (request) => {
            await expectSuccess(await request(currentRoute), { defaultModelId: null, defaultModel: null });
            await expectSuccess(await request(legacyRoute), { modelId: null });
        });
    });

    it("sets, reads, replaces and clears the default through both route contracts", async () => {
        await withDatabaseApi(async (request, prisma) => {
            const { provider, first, second } = await seedModels(prisma);
            await expectSuccess(await request(currentRoute, { defaultModelId: first.id }), { defaultModelId: first.id });
            await expectSuccess(await request(currentRoute), {
                defaultModelId: first.id, defaultModel: firstSnapshot(provider.id),
            });
            await expectSuccess(await request(legacyRoute), { modelId: first.id });
            await expectSuccess(await request(legacyRoute, { modelId: second.id }), { modelId: second.id });
            await expectSuccess(await request(currentRoute), {
                defaultModelId: second.id,
                defaultModel: {
                    id: second.id, providerId: provider.id, modelId: "upstream/second", name: "Unknown pricing",
                    contextWindow: 65536, maxOutputTokens: 4096, version: 3,
                    ...pricingDefaults,
                    createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
                },
            });
            await expectSuccess(await request(`${currentRoute}/?source=test`, { defaultModelId: null }), { defaultModelId: null });
            await expectSuccess(await request(currentRoute), { defaultModelId: null, defaultModel: null });
            await expectSuccess(await request(legacyRoute), { modelId: null });
            await expectSuccess(await request(legacyRoute, { modelId: first.id }), { modelId: first.id });
            await expectSuccess(await request(legacyRoute, { modelId: null }), { modelId: null });
            expect(await prisma.systemConfig.findUnique({ where: { id: "singleton" } }))
                .toMatchObject({ defaultModelId: null });
        });
    });

    it("reads a hard-deleted selection safely and rejects missing IDs on both PUT routes", async () => {
        await withDatabaseApi(async (request, prisma) => {
            const { first } = await seedModels(prisma);
            await expectSuccess(await request(currentRoute, { defaultModelId: first.id }), { defaultModelId: first.id });
            await prisma.configuredModel.delete({ where: { id: first.id } });
            await expectSuccess(await request(currentRoute), { defaultModelId: first.id, defaultModel: null });
            await expectSuccess(await request(legacyRoute), { modelId: first.id });
            for (const id of [first.id, "never-existed"]) {
                await expectError(await request(currentRoute, { defaultModelId: id }), 404, "not_found");
                await expectError(await request(legacyRoute, { modelId: id }), 404, "not_found");
            }
            expect(await prisma.systemConfig.findUnique({ where: { id: "singleton" } }))
                .toMatchObject({ defaultModelId: first.id });
            await expectSuccess(await request(currentRoute, { defaultModelId: null }), { defaultModelId: null });
        });
    });

    it("rejects a deleting Provider without overwriting the existing selection", async () => {
        await withDatabaseApi(async (request, prisma) => {
            const { provider, first, second } = await seedModels(prisma);
            await expectSuccess(await request(legacyRoute, { modelId: first.id }), { modelId: first.id });
            await prisma.modelProvider.update({ where: { id: provider.id }, data: { state: "deleting" } });
            await expectError(await request(currentRoute, { defaultModelId: second.id }), 409, "invalid_model_selection");
            await expectError(await request(legacyRoute, { modelId: second.id }), 409, "invalid_model_selection");
            await expectSuccess(await request(currentRoute), {
                defaultModelId: first.id, defaultModel: firstSnapshot(provider.id),
            });
            await expectSuccess(await request(currentRoute, { defaultModelId: null }), { defaultModelId: null });
        });
    });

    it("rejects strict invalid bodies before persisting, including whitespace and control characters", async () => {
        await withDatabaseApi(async (request, prisma) => {
            const { first } = await seedModels(prisma);
            await expectSuccess(await request(legacyRoute, { modelId: first.id }), { modelId: first.id });
            const invalidIds: unknown[] = ["", " ", " a", "a ", "a\tb", "a\nb", "a\rb", "a\u0000b", "a\u001fb", "a\u007fb", "x".repeat(201), 0, false, {}, []];
            const invalidBodies: unknown[] = [null, "text", 12, true, [], {}, { other: first.id },
                { defaultModelId: first.id, unexpected: secret },
                ...invalidIds.map((id) => ({ defaultModelId: id }))];
            for (const body of invalidBodies) {
                await expectError(await request(currentRoute, body), 400, "invalid_input");
            }
            for (const body of [{}, { other: first.id }, { modelId: 0 }, { modelId: false }]) {
                await expectError(await request(legacyRoute, body), 400, "invalid_input");
            }
            await expectSuccess(await request(legacyRoute), { modelId: first.id });
        });
    });

    it("maps an absent Provider to 409 rather than treating its existing model as selectable", async () => {
        let writes = 0;
        const repository: SystemConfigRepository = {
            async getDefaultModelId() { return null; },
            async getSystemConfigWithModel() { return { defaultModelId: null, defaultModel: null }; },
            async getModelSelection(_modelId: string) { return { model: firstSnapshot("missing-provider"), providerState: null }; },
            async setDefaultModelId(_modelId: string | null) { writes += 1; },
            async setDefaultModelWithValidation(modelId, validate) {
                validate(await this.getModelSelection(modelId));
                await this.setDefaultModelId(modelId);
            },
        };
        await withApi(new SystemConfigService(repository), async (request) => {
            await expectError(await request(currentRoute, { defaultModelId: "a" }), 409, "invalid_model_selection");
            await expectError(await request(legacyRoute, { modelId: "a" }), 409, "invalid_model_selection");
        });
        expect(writes).toBe(0);
    });

    it.each(["read", "selection", "write"] as const)("redacts unknown %s dependency failures", async (failure) => {
        const fail = () => { throw Object.assign(new Error(secret), { code: "PRIVATE_STORAGE_FAILURE" }); };
        const repository: SystemConfigRepository = {
            async getDefaultModelId() { return failure === "read" ? fail() : null; },
            async getSystemConfigWithModel() {
                if (failure === "read") return fail();
                return { defaultModelId: null, defaultModel: null };
            },
            async getModelSelection(_modelId: string) {
                if (failure === "selection") return fail();
                return { model: firstSnapshot("provider"), providerState: "active" };
            },
            async setDefaultModelId(_modelId: string | null) { if (failure === "write") fail(); },
            async setDefaultModelWithValidation(modelId, validate) {
                validate(await this.getModelSelection(modelId));
                await this.setDefaultModelId(modelId);
            },
        };
        await withApi(new SystemConfigService(repository), async (request) => {
            for (const [route, key] of [[currentRoute, "defaultModelId"], [legacyRoute, "modelId"]] as const) {
                const response = failure === "read" ? await request(route) : await request(route, { [key]: "a" });
                await expectError(response, 503, "dependency_unavailable");
            }
        });
    });
});
