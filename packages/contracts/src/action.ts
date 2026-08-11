import { z, type ZodType } from "zod";

/** 十种 Action 类型，对应总体架构 0001 §4.2。 */
export const actionKindSchema = z.enum([
    "connector",
    "transform",
    "library",
    "query",
    "control",
    "script",
    "agent",
    "artifact",
    "render",
    "delivery",
]);
export type ActionKind = z.infer<typeof actionKindSchema>;

/** Action 唯一标识，"{namespace}.{verb}"，例如 rss.poll、agent.run。 */
export const actionRefSchema = z
    .string()
    .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/);
export type ActionRef = z.infer<typeof actionRefSchema>;

/** 执行错误码：复用 ConnectorErrorCode 七种并新增注册/校验错误。 */
export const actionErrorCodeSchema = z.enum([
    "dependency_unavailable",
    "authentication_required",
    "timeout",
    "rate_limited",
    "malformed_payload",
    "unsupported_version",
    "invalid_configuration",
    "invalid_input",
    "unknown_action",
    "internal_error",
]);
export type ActionErrorCode = z.infer<typeof actionErrorCodeSchema>;

/** 输入/输出 schema 必须是可调用的 zod schema（含 parse）。 */
const zodTypeSchema = z.custom<ZodType<unknown>>(
    (value) =>
        typeof value === "object" &&
        value !== null &&
        typeof (value as { parse?: unknown }).parse === "function",
    { message: "expected a zod schema" },
);

/** ActionDefinition 是能力合同，不是任务实例（0001 §4.2）。 */
export const actionDefinitionSchema = z.object({
    ref: actionRefSchema,
    kind: actionKindSchema,
    description: z.string(),
    version: z.string(),
    capabilities: z.array(z.string()),
    inputSchema: zodTypeSchema,
    outputSchema: zodTypeSchema,
    execution: z.object({
        idempotent: z.boolean(),
        supportsCancellation: z.boolean(),
        timeoutMs: z.number().int().positive().nullable(),
        retryPolicy: z
            .object({
                maxAttempts: z.number().int().positive(),
                backoffMs: z.number().int().nonnegative(),
                retryableErrors: z.array(actionErrorCodeSchema).optional(),
            })
            .nullable(),
    }),
});
export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;

/** 可序列化描述（不含 schema 对象），沿用 ConnectorDescriptor 模式。 */
export const actionDescriptorSchema = z.object({
    ref: actionRefSchema,
    kind: actionKindSchema,
    description: z.string(),
    version: z.string(),
    capabilities: z.array(z.string()),
    idempotent: z.boolean(),
    supportsCancellation: z.boolean(),
    timeoutMs: z.number().int().positive().nullable(),
    retryPolicy: z
        .object({
            maxAttempts: z.number().int().positive(),
            backoffMs: z.number().int().nonnegative(),
            retryableErrors: z.array(actionErrorCodeSchema).optional(),
        })
        .nullable(),
});
export type ActionDescriptor = z.infer<typeof actionDescriptorSchema>;
