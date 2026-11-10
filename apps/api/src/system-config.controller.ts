import "reflect-metadata";
import { Body, Controller, Get, Header, HttpException, Inject, Put } from "@nestjs/common";
import type { SystemConfigService } from "@cosmos/application";
import { updateSystemConfigCommandSchema } from "@cosmos/contracts";

type Service = Pick<SystemConfigService, "getDefaultModelId" | "setDefaultModelId" | "getConfig" | "setDefaultModel">;

function configFailure(error: unknown): never {
    let status = 503;
    let code = "dependency_unavailable";
    try {
        if (typeof error === "object" && error !== null && "code" in error) {
            if (error.code === "invalid_input") {
                status = 400;
                code = "invalid_input";
            } else if (error.code === "invalid_model_selection") {
                const missing = "reason" in error && error.reason === "not_found";
                status = missing ? 404 : 409;
                code = missing ? "not_found" : "invalid_model_selection";
            }
        }
    } catch { /* Dependency error accessors must not bypass response redaction. */ }
    throw new HttpException({ code, message: "System config operation failed." }, status);
}

@Controller()
export class SystemConfigController {
    constructor(@Inject("COSMOS_SYSTEM_CONFIG") private readonly config: Service) {}

    @Get("config/default-model")
    @Header("Cache-Control", "no-store")
    async getDefaultModel() {
        try {
            const modelId = await this.config.getDefaultModelId();
            return { modelId };
        } catch {
            throw new HttpException({ code: "dependency_unavailable", message: "System config operation failed." }, 503);
        }
    }

    @Put("config/default-model")
    @Header("Cache-Control", "no-store")
    async setDefaultModel(@Body() body: unknown) {
        if (typeof body !== "object" || body === null || !("modelId" in body)) {
            throw new HttpException({ code: "invalid_input", message: "Request body must contain modelId." }, 400);
        }
        const modelId = (body as { modelId: unknown }).modelId;
        if (modelId !== null && typeof modelId !== "string") {
            throw new HttpException({ code: "invalid_input", message: "modelId must be a string or null." }, 400);
        }
        try {
            await this.config.setDefaultModelId(modelId);
            return { modelId };
        } catch (error) {
            return configFailure(error);
        }
    }

    @Get("system/config")
    @Header("Cache-Control", "no-store")
    async getConfig() {
        try {
            return await this.config.getConfig();
        } catch (error) {
            return configFailure(error);
        }
    }

    @Put("system/config")
    @Header("Cache-Control", "no-store")
    async updateConfig(@Body() body: unknown) {
        const parsed = updateSystemConfigCommandSchema.safeParse(body);
        if (!parsed.success) {
            throw new HttpException({ code: "invalid_input", message: "Invalid system configuration." }, 400);
        }
        try {
            await this.config.setDefaultModel(parsed.data.defaultModelId);
            return { defaultModelId: parsed.data.defaultModelId };
        } catch (error) {
            return configFailure(error);
        }
    }
}
