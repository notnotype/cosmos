import { z } from "zod";

export interface SystemConfigReader {
    getDefaultModelId(): Promise<string | null>;
}

export interface SystemConfigRepository extends SystemConfigReader {
    setDefaultModelId(modelId: string | null): Promise<void>;
}

const modelIdSchema = z.string().trim().min(1).max(200);

export class SystemConfigService {
    constructor(private readonly repository: SystemConfigRepository) {}

    async getDefaultModelId(): Promise<string | null> {
        return await this.repository.getDefaultModelId();
    }

    async setDefaultModelId(modelId: string | null): Promise<void> {
        if (modelId !== null && !modelIdSchema.safeParse(modelId).success) {
            throw Object.assign(new Error("Invalid model ID."), { code: "invalid_input" });
        }
        await this.repository.setDefaultModelId(modelId);
    }
}
