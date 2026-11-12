import { z } from "zod";
import { systemConfigDtoSchema, updateSystemConfigCommandSchema,
    type ConfiguredModelSnapshot, type SystemConfigDto, type UpdateSystemConfigCommand } from "@cosmos/contracts";

export interface SystemConfigReader {
    getDefaultModelId(): Promise<string | null>;
    getStoryAgentTimeoutSeconds(): Promise<number>;
}

export interface SystemConfigRepository extends SystemConfigReader {
    updateConfig(command: UpdateSystemConfigCommand, validateModel: (selection: { model: ConfiguredModelSnapshot; providerState: string | null } | null) => void): Promise<void>;
    setDefaultModelId(modelId: string | null): Promise<void>;
    getSystemConfigWithModel(): Promise<SystemConfigDto>;
    getModelSelection(modelId: string): Promise<{ model: ConfiguredModelSnapshot; providerState: string | null } | null>;
    setDefaultModelWithValidation(modelId: string, validate: (selection: { model: ConfiguredModelSnapshot; providerState: string | null } | null) => void): Promise<void>;
}

const modelIdSchema = z.string().trim().min(1).max(200);

export class SystemConfigService {
    constructor(private readonly repository: SystemConfigRepository) {}

    async getDefaultModelId(): Promise<string | null> {
        return await this.repository.getDefaultModelId();
    }

    async getConfig(): Promise<SystemConfigDto> {
        return systemConfigDtoSchema.parse(await this.repository.getSystemConfigWithModel());
    }

    async getSystemConfigWithModel(): Promise<SystemConfigDto> {
        return await this.getConfig();
    }

    async getStoryAgentTimeoutSeconds(): Promise<number> {
        return await this.repository.getStoryAgentTimeoutSeconds();
    }

    async updateConfig(input: unknown): Promise<void> {
        const parsed = updateSystemConfigCommandSchema.safeParse(input);
        if (!parsed.success) throw Object.assign(new Error("Invalid system configuration."), { code: "invalid_input" });
        if (parsed.data.defaultModelId !== undefined && parsed.data.defaultModelId !== null
            && !modelIdSchema.safeParse(parsed.data.defaultModelId).success) {
            throw Object.assign(new Error("Invalid model ID."), { code: "invalid_input" });
        }
        await this.repository.updateConfig(parsed.data, (selection) => this.validateModelSelection(selection));
    }

    async setDefaultModel(modelId: string | null): Promise<void> {
        const parsed = updateSystemConfigCommandSchema.safeParse({ defaultModelId: modelId });
        if (!parsed.success) {
            throw Object.assign(new Error("Invalid model ID."), { code: "invalid_input" });
        }
        await this.setDefaultModelId(modelId);
    }

    async setDefaultModelId(modelId: string | null): Promise<void> {
        if (modelId !== null && !modelIdSchema.safeParse(modelId).success) {
            throw Object.assign(new Error("Invalid model ID."), { code: "invalid_input" });
        }
        if (modelId === null) {
            await this.repository.setDefaultModelId(null);
            return;
        }
        await this.repository.setDefaultModelWithValidation(modelId, (selection) => this.validateModelSelection(selection));
    }

    private validateModelSelection(selection: { model: ConfiguredModelSnapshot; providerState: string | null } | null): void {
        if (selection === null) {
            throw Object.assign(new Error("Selected model does not exist."), {
                code: "invalid_model_selection", reason: "not_found",
            });
        }
        if (selection.providerState !== "active") {
            throw Object.assign(new Error("Selected model provider is not active."), {
                code: "invalid_model_selection", reason: "inactive_provider",
            });
        }
    }
}
