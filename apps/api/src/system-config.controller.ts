import "reflect-metadata";
import { Body, Controller, Get, Header, HttpException, Inject, Put } from "@nestjs/common";
import type { SystemConfigService } from "@cosmos/application";

type Service = Pick<SystemConfigService, "getDefaultModelId" | "setDefaultModelId">;

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
            const invalid = typeof error === "object" && error !== null && "code" in error && error.code === "invalid_input";
            const code = invalid ? "invalid_input" : "dependency_unavailable";
            throw new HttpException({ code, message: "System config operation failed." }, invalid ? 400 : 503);
        }
    }
}
