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
const modelIdentityFields = {
    modelId: upstreamModelIdSchema,
    name: nameSchema,
    contextWindow: positiveIntegerSchema,
    maxOutputTokens: positiveIntegerSchema,
};
const priceSchema = z.number().finite().nonnegative();
const currencySchema = z.enum(["USD", "CNY"]);
const pricingFields = {
    inputPricePerMillion: priceSchema,
    outputPricePerMillion: priceSchema,
    cacheWritePricePerMillion: priceSchema,
    cacheReadPricePerMillion: priceSchema,
    currency: currencySchema.default("USD"),
    tieredPricingEnabled: z.boolean().default(false),
    tieredPricingThreshold: positiveIntegerSchema.nullable().default(null),
    highInputPricePerMillion: priceSchema.nullable().default(null),
    highOutputPricePerMillion: priceSchema.nullable().default(null),
    highCacheWritePricePerMillion: priceSchema.nullable().default(null),
    highCacheReadPricePerMillion: priceSchema.nullable().default(null),
};
const withinContext = (value: { contextWindow?: number; maxOutputTokens?: number }): boolean =>
    value.contextWindow === undefined || value.maxOutputTokens === undefined
    || value.maxOutputTokens <= value.contextWindow;
const hasCompleteTier = (value: {
    tieredPricingEnabled?: boolean;
    tieredPricingThreshold?: number | null;
    highInputPricePerMillion?: number | null;
    highOutputPricePerMillion?: number | null;
    highCacheWritePricePerMillion?: number | null;
    highCacheReadPricePerMillion?: number | null;
}): boolean => value.tieredPricingEnabled
    ? value.tieredPricingThreshold != null && value.highInputPricePerMillion != null
        && value.highOutputPricePerMillion != null && value.highCacheWritePricePerMillion != null
        && value.highCacheReadPricePerMillion != null
    : (value.tieredPricingThreshold == null && value.highInputPricePerMillion == null
        && value.highOutputPricePerMillion == null && value.highCacheWritePricePerMillion == null
        && value.highCacheReadPricePerMillion == null);

export const createConfiguredModelCommandSchema = z.object({
    ...modelIdentityFields,
    ...pricingFields,
}).strict().refine(withinContext, {
    message: "Output token limit exceeds context window.",
}).refine(hasCompleteTier, {
    message: "Tiered pricing requires a threshold and all four high-tier prices; disabled tier pricing must be empty.",
});
export type CreateConfiguredModelCommand = z.input<typeof createConfiguredModelCommandSchema>;

const updatePricingFields = {
    inputPricePerMillion: priceSchema.optional(),
    outputPricePerMillion: priceSchema.optional(),
    cacheWritePricePerMillion: priceSchema.optional(),
    cacheReadPricePerMillion: priceSchema.optional(),
    currency: currencySchema.optional(),
    tieredPricingEnabled: z.boolean().optional(),
    tieredPricingThreshold: positiveIntegerSchema.nullable().optional(),
    highInputPricePerMillion: priceSchema.nullable().optional(),
    highOutputPricePerMillion: priceSchema.nullable().optional(),
    highCacheWritePricePerMillion: priceSchema.nullable().optional(),
    highCacheReadPricePerMillion: priceSchema.nullable().optional(),
};
const pricingKeys = Object.keys(updatePricingFields);
function hasCompletePricingUpdate(value: Record<string, unknown>): boolean {
    return !pricingKeys.some((key) => value[key] !== undefined) || pricingKeys.every((key) => value[key] !== undefined);
}

// Any price or tier edit replaces one complete configuration, preventing stale mixed tiers.
export const updateConfiguredModelCommandSchema = z.object({
    expectedVersion: positiveIntegerSchema,
    modelId: upstreamModelIdSchema.optional(),
    name: nameSchema.optional(),
    contextWindow: positiveIntegerSchema.optional(),
    maxOutputTokens: positiveIntegerSchema.optional(),
    ...updatePricingFields,
}).strict().refine((value) => Object.entries(value).some(([key, field]) => key !== "expectedVersion" && field !== undefined), {
    message: "At least one update is required.",
}).refine(withinContext, { message: "Output token limit exceeds context window." })
    .refine((value) => hasCompletePricingUpdate(value), {
        message: "Price updates must include the complete pricing configuration.",
    }).refine(hasCompleteTier, {
        message: "Tiered pricing requires a threshold and all four high-tier prices; disabled tier pricing must be empty.",
    });
export type UpdateConfiguredModelCommand = z.infer<typeof updateConfiguredModelCommandSchema>;

export const configuredModelSnapshotSchema = z.object({
    ...modelIdentityFields,
    id: idSchema,
    providerId: idSchema,
    version: positiveIntegerSchema,
    // Legacy snapshots may not have had every price recorded; omission stays unknown, not zero.
    inputPricePerMillion: priceSchema.optional(),
    outputPricePerMillion: priceSchema.optional(),
    cacheWritePricePerMillion: priceSchema.optional(),
    cacheReadPricePerMillion: priceSchema.optional(),
    currency: currencySchema.default("USD"),
    tieredPricingEnabled: z.boolean().default(false),
    tieredPricingThreshold: positiveIntegerSchema.nullable().default(null),
    highInputPricePerMillion: priceSchema.nullable().default(null),
    highOutputPricePerMillion: priceSchema.nullable().default(null),
    highCacheWritePricePerMillion: priceSchema.nullable().default(null),
    highCacheReadPricePerMillion: priceSchema.nullable().default(null),
    // 存储层一直带这两个时间戳；快照曾漏掉它们，导致真实读取在严格解析处失败。
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).strict().refine(withinContext, { message: "Output token limit exceeds context window." })
    .refine(hasCompleteTier, {
        message: "Tiered pricing requires a threshold and all four high-tier prices; disabled tier pricing must be empty.",
    });
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
