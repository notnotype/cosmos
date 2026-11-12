import { z } from "zod";
import { configuredModelSnapshotSchema } from "./provider-model.js";

const modelIdSchema = z.string().min(1).max(200)
    .refine((value) => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value));

export const storyAgentTimeoutSecondsSchema = z.number().int().min(30).max(1800);

export const systemConfigDtoSchema = z.object({
    defaultModelId: z.string().nullable(),
    defaultModel: configuredModelSnapshotSchema.nullable(),
    storyAgentTimeoutSeconds: storyAgentTimeoutSecondsSchema,
}).strict();
export type SystemConfigDto = z.infer<typeof systemConfigDtoSchema>;

export const updateSystemConfigCommandSchema = z.object({
    defaultModelId: modelIdSchema.nullable().optional(),
    storyAgentTimeoutSeconds: storyAgentTimeoutSecondsSchema.optional(),
}).strict().refine((value) => value.defaultModelId !== undefined || value.storyAgentTimeoutSeconds !== undefined);
export type UpdateSystemConfigCommand = z.infer<typeof updateSystemConfigCommandSchema>;
