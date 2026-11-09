import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(200);
const idSchema = z.string().trim().min(1).max(200);
const positiveIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const apiSchema = z.enum(["openai-completions", "openai-responses"]);
const credentialSchema = z.string().min(1).max(8192).refine((value) => !/[\r\n]/.test(value), {
    message: "Invalid credential format.",
});

// Syntax validation is deliberately offline; DNS and actual peer checks belong to transport.
const baseUrlSchema = z.string().min(1).max(2048).refine((value) => {
    if (value !== value.trim() || /[\s\\]/.test(value) || /[?#]/.test(value)) {
        return false;
    }
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
        return url.protocol === "https:" && !url.username && !url.password
            && !url.port && hostname.includes(".") && !hostname.includes(":")
            && !/^[\d.]+$/.test(hostname) && hostname !== "localhost"
            && !hostname.endsWith(".localhost");
    } catch {
        return false;
    }
}, { message: "Invalid provider URL." });

const providerFields = { name: nameSchema, api: apiSchema, baseUrl: baseUrlSchema };
export const createModelProviderCommandSchema = z.object({
    ...providerFields,
    apiKey: credentialSchema,
}).strict();
export type CreateModelProviderCommand = z.infer<typeof createModelProviderCommandSchema>;

export const updateModelProviderCommandSchema = z.object({
    expectedVersion: positiveIntegerSchema,
    name: nameSchema.optional(),
    api: apiSchema.optional(),
    baseUrl: baseUrlSchema.optional(),
    apiKey: credentialSchema.optional(),
}).strict().refine((value) => Object.entries(value).some(([key, field]) => key !== "expectedVersion" && field !== undefined), {
    message: "At least one update is required.",
});
export type UpdateModelProviderCommand = z.infer<typeof updateModelProviderCommandSchema>;

export const modelProviderSnapshotSchema = z.object({
    id: idSchema,
    ...providerFields,
    version: positiveIntegerSchema,
    state: z.enum(["active", "deleting"]),
    credentialState: z.enum(["configured", "cleanup_pending"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).strict();
export type ModelProviderSnapshot = z.infer<typeof modelProviderSnapshotSchema>;

const operationIdSchema = z.string().min(1).max(200).refine((value) => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value));
export const modelProviderOperationSnapshotSchema = z.object({
    id: operationIdSchema,
    kind: z.enum(["create", "update"]),
    providerId: idSchema,
    state: z.enum(["pending", "completed", "failed", "cleanup_pending"]),
    resourceVersion: positiveIntegerSchema.nullable(),
    errorCode: z.enum(["credential_write_failed", "cleanup_pending", "dependency_unavailable", "version_conflict", "operation_in_progress"]).nullable().optional(),
}).strict();
export type ModelProviderOperationSnapshot = z.infer<typeof modelProviderOperationSnapshotSchema>;

export const modelProviderPageSchema = z.object({
    items: modelProviderSnapshotSchema.array(),
    nextCursor: idSchema.nullable(),
}).strict();
export type ModelProviderPage = z.infer<typeof modelProviderPageSchema>;

const upstreamModelIdSchema = idSchema.refine((value) => !/^[a-z][a-z\d+.-]*:\/\//i.test(value)
    && !value.startsWith("//"), { message: "Model identifier must not be a URL." });
const modelFields = {
    modelId: upstreamModelIdSchema,
    name: nameSchema,
    contextWindow: positiveIntegerSchema,
    maxOutputTokens: positiveIntegerSchema,
    // Prices are USD per million tokens; omitted prices mean the cost is unknown.
    inputPricePerMillion: z.number().nonnegative().optional(),
    outputPricePerMillion: z.number().nonnegative().optional(),
};
const withinContext = (value: { contextWindow?: number; maxOutputTokens?: number }): boolean =>
    value.contextWindow === undefined || value.maxOutputTokens === undefined
    || value.maxOutputTokens <= value.contextWindow;

export const createConfiguredModelCommandSchema = z.object(modelFields).strict().refine(withinContext, {
    message: "Output token limit exceeds context window.",
});
export type CreateConfiguredModelCommand = z.infer<typeof createConfiguredModelCommandSchema>;

// Partial budgets must also be checked against persisted values by the application service.
export const updateConfiguredModelCommandSchema = z.object({
    expectedVersion: positiveIntegerSchema,
    modelId: upstreamModelIdSchema.optional(),
    name: nameSchema.optional(),
    contextWindow: positiveIntegerSchema.optional(),
    maxOutputTokens: positiveIntegerSchema.optional(),
    inputPricePerMillion: z.number().nonnegative().optional(),
    outputPricePerMillion: z.number().nonnegative().optional(),
}).strict().refine((value) => Object.entries(value).some(([key, field]) => key !== "expectedVersion" && field !== undefined), {
    message: "At least one update is required.",
}).refine(withinContext, { message: "Output token limit exceeds context window." });
export type UpdateConfiguredModelCommand = z.infer<typeof updateConfiguredModelCommandSchema>;

export const configuredModelSnapshotSchema = z.object({
    ...modelFields,
    id: idSchema,
    providerId: idSchema,
    version: positiveIntegerSchema,
    // 存储层一直带这两个时间戳；快照曾漏掉它们，导致真实读取在严格解析处失败。
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).strict().refine(withinContext, { message: "Output token limit exceeds context window." });
export type ConfiguredModelSnapshot = z.infer<typeof configuredModelSnapshotSchema>;

export const configuredModelPageSchema = z.object({
    items: configuredModelSnapshotSchema.array(),
    nextCursor: idSchema.nullable(),
}).strict();
export type ConfiguredModelPage = z.infer<typeof configuredModelPageSchema>;

// 发现是同步只读请求：命令只指认 Provider 并做乐观版本校验，不接受凭证或 URL。
export const createProviderModelDiscoveryCommandSchema = z.object({
    providerId: idSchema,
    expectedProviderVersion: positiveIntegerSchema,
}).strict();
export type CreateProviderModelDiscoveryCommand = z.infer<typeof createProviderModelDiscoveryCommandSchema>;

export const providerModelDiscoveryCandidateSchema = z.object({
    modelId: upstreamModelIdSchema,
    name: nameSchema,
}).strict();
export type ProviderModelDiscoveryCandidate = z.infer<typeof providerModelDiscoveryCandidateSchema>;

export const providerModelDiscoveryErrorCodeSchema = z.enum([
    "authentication_failed",
    "unsupported",
    "timeout",
    "response_too_large",
    "malformed_response",
    "empty_result",
    "dependency_unavailable",
]);
export type ProviderModelDiscoveryErrorCode = z.infer<typeof providerModelDiscoveryErrorCodeSchema>;

export const providerModelDiscoverySnapshotSchema = z.object({
    id: idSchema,
    providerId: idSchema,
    providerVersion: positiveIntegerSchema,
    status: z.enum(["succeeded", "failed"]),
    candidates: providerModelDiscoveryCandidateSchema.array().max(1000),
    errorCode: providerModelDiscoveryErrorCodeSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).strict().superRefine((value, context) => {
    if (value.status === "succeeded" && value.errorCode !== null) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["errorCode"], message: "Succeeded discovery cannot have an error." });
    }
    if (value.status !== "succeeded" && value.candidates.length > 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates"], message: "Only succeeded discovery may expose candidates." });
    }
    if (value.status === "failed" && value.errorCode === null) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["errorCode"], message: "Failed discovery requires an error code." });
    }
    if (value.status !== "failed" && value.errorCode !== null) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["errorCode"], message: "Only failed discovery may expose an error." });
    }
});
export type ProviderModelDiscoverySnapshot = z.infer<typeof providerModelDiscoverySnapshotSchema>;
