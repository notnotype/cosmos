import { z } from "zod";
import { ConfiguredModelsClient } from "./client-configured-models.js";

const defaultModelResponseSchema = z.object({ modelId: z.string().nullable() }).strict();
export type DefaultModelResponse = z.infer<typeof defaultModelResponseSchema>;

/**
 * 系统配置客户端：全局默认模型的读写。
 * 继承 ConfiguredModelsClient，在导出门面 (HttpCosmosClient) 之前插入继承链。
 */
export class SystemConfigClient extends ConfiguredModelsClient {
    async getDefaultModel(): Promise<DefaultModelResponse> {
        return this.request("/api/v1/config/default-model", {
            schema: defaultModelResponseSchema,
        });
    }

    async setDefaultModel(modelId: string | null): Promise<DefaultModelResponse> {
        return this.request("/api/v1/config/default-model", {
            method: "PUT", body: { modelId },
            schema: defaultModelResponseSchema,
        });
    }
}
