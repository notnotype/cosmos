import "reflect-metadata";
import { Module, RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { describe, expect, it } from "vitest";
import { SystemConfigService } from "../../../packages/application/src/system-config.js";
import { RequestExceptionFilter } from "./request-logging.js";
import { SystemConfigController } from "./system-config.controller.js";
import { configureModelConfigurationBodyParsers } from "./model-configuration-body-parser.js";
import type { Logger } from "@cosmos/logging";

function serviceWith(initialValue: string | null = null) {
    let value = initialValue;
    return new SystemConfigService({
        async getDefaultModelId() { return value; },
        async setDefaultModelId(modelId) { value = modelId; },
    });
}

function createLogger(): Logger {
    const logger: Logger = {
        child: () => logger, withContext: (_context, use) => use(),
        debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, close: async () => {},
    };
    return logger;
}

describe("SystemConfigController", () => {
    it("gets and sets string or null default model IDs over isolated HTTP", async () => {
        const service = serviceWith("org/initial");
        @Module({
            controllers: [SystemConfigController],
            providers: [{ provide: "COSMOS_SYSTEM_CONFIG", useValue: service }],
        })
        class TestModule {}
        const app = await NestFactory.create<NestExpressApplication>(TestModule, {
            logger: false,
            bodyParser: false,
        });
        configureModelConfigurationBodyParsers(app);
        app.setGlobalPrefix("api/v1");
        app.useGlobalFilters(new RequestExceptionFilter(createLogger()));
        try {
            await app.listen(0, "127.0.0.1");
            const base = await app.getUrl();
            const get = () => fetch(`${base}/api/v1/config/default-model`);
            const put = (body: unknown) => fetch(`${base}/api/v1/config/default-model`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const initial = await get();
            expect(initial.status).toBe(200);
            expect(initial.headers.get("cache-control")).toBe("no-store");
            expect(await initial.json()).toEqual({ modelId: "org/initial" });

            const setString = await put({ modelId: "org/selected" });
            expect(setString.status).toBe(200);
            expect(setString.headers.get("cache-control")).toBe("no-store");
            expect(await setString.json()).toEqual({ modelId: "org/selected" });
            expect(await (await get()).json()).toEqual({ modelId: "org/selected" });

            const setNull = await put({ modelId: null });
            expect(setNull.status).toBe(200);
            expect(setNull.headers.get("cache-control")).toBe("no-store");
            expect(await setNull.json()).toEqual({ modelId: null });
            expect(await (await get()).json()).toEqual({ modelId: null });
        } finally {
            await app.close();
        }
    });

    it("rejects malformed bodies and non-string model IDs as 400", async () => {
        const controller = new SystemConfigController(serviceWith());
        const invalidBodies: unknown[] = [null, "text", 12, true, [], {}, { other: "value" }];
        for (const body of invalidBodies) {
            await expect(controller.setDefaultModel(body)).rejects.toMatchObject({ status: 400 });
        }
        for (const modelId of [0, false, {}, []]) {
            await expect(controller.setDefaultModel({ modelId })).rejects.toMatchObject({ status: 400 });
        }
    });

    it("uses real service validation and preserves accepted surrounding whitespace", async () => {
        const writes: Array<string | null> = [];
        const service = new SystemConfigService({
            async getDefaultModelId() { return null; },
            async setDefaultModelId(modelId) { writes.push(modelId); },
        });
        const controller = new SystemConfigController(service);

        for (const modelId of ["", "   ", "x".repeat(201)]) {
            await expect(controller.setDefaultModel({ modelId })).rejects.toMatchObject({ status: 400 });
        }
        await expect(controller.setDefaultModel({ modelId: "  org/model  " }))
            .resolves.toEqual({ modelId: "  org/model  " });
        expect(writes).toEqual(["  org/model  "]);
    });

    it("maps dependency failures to a redacted 503", async () => {
        const secret = "PRIVATE_SYSTEM_CONFIG_DETAIL";
        const service = {
            async getDefaultModelId() { throw new Error(secret); },
            async setDefaultModelId() { throw Object.assign(new Error(secret), { code: "storage_down" }); },
        };
        const controller = new SystemConfigController(service);

        await expect(controller.getDefaultModel()).rejects.toMatchObject({ status: 503 });
        await expect(controller.setDefaultModel({ modelId: "org/model" }))
            .rejects.toMatchObject({ status: 503 });
        await expect(controller.getDefaultModel()).rejects.not.toThrow(secret);
    });

    it("registers the default-model GET and PUT routes with no-store metadata", async () => {
        const controller = SystemConfigController as unknown as { prototype: Record<string, unknown> };
        expect(Reflect.getMetadata("path", SystemConfigController)).toBe("/");

        for (const [name, method] of [["getDefaultModel", RequestMethod.GET], ["setDefaultModel", RequestMethod.PUT]] as const) {
            const handler = controller.prototype[name] as Function;
            expect(Reflect.getMetadata("path", handler)).toBe("config/default-model");
            expect(Reflect.getMetadata("method", handler)).toBe(method);
            expect(Reflect.getMetadata("__headers__", handler)).toContainEqual({
                name: "Cache-Control",
                value: "no-store",
            });
            expect(handler).toBeDefined();
        }
    });
});
