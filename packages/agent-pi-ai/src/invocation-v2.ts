import {
    ActionExecutionError,
    type AgentInvocationContext,
    type AgentInvocationV2Port,
    type AgentModelResolver,
    type AgentModelSnapshot,
} from "@cosmos/application";
import {
    agentInvocationOutputSchema,
    type AgentInvocationOutput,
    type AgentInvocationV2Input,
} from "@cosmos/contracts";
import type { AssistantMessage, Context, Model, ProviderStreamOptions } from "@mariozechner/pi-ai";

import {
    createPiAiOpenAICompletionsModel,
    createPiAiOpenAIResponsesModel,
    mapPiAiError,
    mapPiAiResponseFailure,
} from "./pi-models.js";

/** 只按 secretRef 读一次凭证；实现方通常就是应用的 SecretStore。 */
export interface PiAiSecretReader {
    read(secretRef: string): Promise<string | null>;
}

export interface PiAiClientV2 {
    complete(
        model: Model<string & {}>,
        context: Context,
        options: ProviderStreamOptions,
    ): Promise<AssistantMessage>;
}

export interface PiAiAgentInvocationV2AdapterOptions {
    models: AgentModelResolver;
    secrets: PiAiSecretReader;
    client: PiAiClientV2;
}

/**
 * `agent.invoke@2` 的 pi-ai 适配器：模型、地址与凭证全部来自连接解析结果。
 *
 * 与 @1 的区别不只在输入形状——@1 的模型是 Worker 启动时固定的，@2 每次调用都要重新
 * 解析，所以这里也不能缓存解析结果：用户换模型或撤销连接后，下一次调用必须立刻生效。
 */
export class PiAiAgentInvocationV2Adapter implements AgentInvocationV2Port {
    constructor(private readonly options: PiAiAgentInvocationV2AdapterOptions) {}

    async invoke(
        input: AgentInvocationV2Input,
        context: AgentInvocationContext,
    ): Promise<AgentInvocationOutput> {
        assertNotAborted(context);
        const model = await this.options.models.resolve(input.modelId ?? null);
        assertNotAborted(context);
        if (model === null) {
            throw new ActionExecutionError(
                "authentication_required",
                "The selected model is unavailable.",
                false,
            );
        }

        const controller = new AbortController();
        const abort = () => controller.abort();
        context.signal.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(() => controller.abort(), input.budget.maxDurationMs);

        try {
            // 预算上限由模型配置决定：调用方给的 maxOutputTokens 只能更小，不能突破。
            const maxTokens = Math.min(input.budget.maxOutputTokens, model.maxOutputTokens);
            const credential = await this.options.secrets.read(model.secretRef);
            assertNotAborted(context);
            if (credential === null || credential.trim().length === 0) {
                throw new ActionExecutionError(
                    "authentication_required",
                    "The selected model has no stored credential.",
                    false,
                );
            }
            const response = await this.options.client.complete(
                toPiModel(model),
                toPiContext(input, model),
                { apiKey: credential, maxTokens, signal: controller.signal, metadata: { idempotencyKey: context.idempotencyKey } },
            );
            assertNotAborted(context);
            return mapResponseV2(response, model);
        } catch (error) {
            if (context.signal.aborted) {
                throw new ActionExecutionError("cancelled", "Agent invocation was cancelled.", false);
            }
            if (controller.signal.aborted) {
                throw new ActionExecutionError("timeout", "Agent invocation timed out.", true);
            }
            if (error instanceof ActionExecutionError) throw error;
            throw mapPiAiError(error, model.providerId);
        } finally {
            clearTimeout(timeout);
            context.signal.removeEventListener("abort", abort);
        }
    }
}

function calculateCost(
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
    model: AgentModelSnapshot,
): AgentInvocationOutput["cost"] {
    if (!isPrice(model.inputPricePerMillion) || !isPrice(model.outputPricePerMillion)
        || (model.cacheReadPricePerMillion != null && !isPrice(model.cacheReadPricePerMillion))
        || (model.cacheWritePricePerMillion != null && !isPrice(model.cacheWritePricePerMillion))
        || (usage.cacheReadTokens > 0 && model.cacheReadPricePerMillion == null)
        || (usage.cacheWriteTokens > 0 && model.cacheWritePricePerMillion == null)) {
        return undefined;
    }
    const highRates = { input: model.highInputPricePerMillion, output: model.highOutputPricePerMillion,
        cacheRead: model.highCacheReadPricePerMillion, cacheWrite: model.highCacheWritePricePerMillion };
    const threshold = model.tieredPricingThreshold;
    if (model.tieredPricingEnabled === true && (typeof threshold !== "number" || !Number.isSafeInteger(threshold)
        || threshold <= 0 || !Object.values(highRates).every(isPrice))) {
        return undefined;
    }
    const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    const highTier = model.tieredPricingEnabled === true && promptTokens > (threshold ?? Infinity);
    const rates = highTier ? highRates
        : { input: model.inputPricePerMillion, output: model.outputPricePerMillion,
            cacheRead: model.cacheReadPricePerMillion, cacheWrite: model.cacheWritePricePerMillion };
    const input = (usage.inputTokens / 1_000_000) * (rates.input ?? 0);
    const output = (usage.outputTokens / 1_000_000) * (rates.output ?? 0);
    const cacheRead = (usage.cacheReadTokens / 1_000_000) * (rates.cacheRead ?? 0);
    const cacheWrite = (usage.cacheWriteTokens / 1_000_000) * (rates.cacheWrite ?? 0);
    const total = input + output + cacheRead + cacheWrite;
    if (![input, output, cacheRead, cacheWrite, total].every(Number.isFinite)) return undefined;
    return { input, output, cacheRead, cacheWrite, total, currency: model.currency ?? "USD" };
}

function isPrice(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function assertNotAborted(context: AgentInvocationContext): void {
    if (context.signal.aborted) {
        throw new ActionExecutionError("cancelled", "Agent invocation was cancelled.", false);
    }
}

function toPiModel(model: AgentModelSnapshot): Model<string & {}> {
    const config = {
        provider: model.providerId,
        model: model.modelId,
        name: model.modelName,
        baseUrl: model.baseUrl,
        contextWindow: model.contextWindow,
        maxTokens: model.maxOutputTokens,
    };
    return model.api === "openai-responses"
        ? createPiAiOpenAIResponsesModel(config)
        : createPiAiOpenAICompletionsModel(config);
}

/**
 * Assistant 历史必须与本次模型一致：pi-ai 用消息上的 api/provider/model 判断上下文
 * 是否可复用，写错会让服务端拒绝或让旧模型的名义出现在新模型的对话里。
 */
function toPiContext(input: AgentInvocationV2Input, model: AgentModelSnapshot): Context {
    const system = input.messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n");
    const messages = input.messages
        .filter((message) => message.role !== "system")
        .map((message) => {
            if (message.role === "assistant") {
                return {
                    role: "assistant" as const,
                    content: [{ type: "text" as const, text: message.content }],
                    api: model.api,
                    provider: model.providerId,
                    model: model.modelId,
                    usage: {
                        input: 0,
                        output: 0,
                        cacheRead: 0,
                        cacheWrite: 0,
                        totalTokens: 0,
                        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                    },
                    stopReason: "stop" as const,
                    timestamp: Date.now(),
                };
            }
            return {
                role: "user" as const,
                content: message.role === "tool" ? `[tool] ${message.content}` : message.content,
                timestamp: Date.now(),
            };
        });

    return {
        ...(system ? { systemPrompt: system } : {}),
        messages,
        tools: input.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema as never,
        })),
    };
}

function mapResponseV2(
    response: AssistantMessage,
    model: AgentModelSnapshot,
): AgentInvocationOutput {
    // 服务商侧的拒绝以 `stopReason: "error"` 返回，而不是抛错；先按状态码归类，
    // 否则下面「结束原因不认识」的分支会把它误报成协议错误。
    const failure = mapPiAiResponseFailure(response, model.providerId);
    if (failure !== null) throw failure;

    const content = response.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("");
    const toolCalls = response.content
        .filter((part): part is Extract<AssistantMessage["content"][number], { type: "toolCall" }> => part.type === "toolCall")
        .map((part) => ({ name: part.name, arguments: part.arguments }));
    const finishReason = response.stopReason === "toolUse"
        ? "tool_call"
        : response.stopReason === "length"
            ? "length"
            : response.stopReason === "aborted"
                ? "cancelled"
                : response.stopReason === "stop"
                    ? "stop"
                    : null;

    const tokenCounts = [response.usage.input, response.usage.output, response.usage.cacheRead,
        response.usage.cacheWrite, response.usage.totalTokens];
    const totalTokens = response.usage.input + response.usage.output + response.usage.cacheRead + response.usage.cacheWrite;
    if (finishReason === null || tokenCounts.some((count) => !Number.isSafeInteger(count) || count < 0)
        || !Number.isSafeInteger(totalTokens)) {
        throw new ActionExecutionError("malformed_payload", "pi-ai returned an unsupported response.", false);
    }

    const usage = {
        inputTokens: response.usage.input,
        outputTokens: response.usage.output,
        cacheReadTokens: response.usage.cacheRead,
        cacheWriteTokens: response.usage.cacheWrite,
        totalTokens,
    };
    const cost = calculateCost(usage, model);

    try {
        return agentInvocationOutputSchema.parse({
            content,
            toolCalls,
            usage,
            // cost 为 undefined 时不写入该属性：isJsonValue 会拒绝含 undefined 值的对象，
            // 导致 durable workflow runner 报 "non-JSON value"。
            ...(cost ? { cost } : {}),
            // 输出里的 provider/model 回应实际使用的配置，而不是调用方声明的（@2 没有声明）。
            provider: model.providerId,
            model: model.modelId,
            finishReason,
            metadata: {},
        });
    } catch (error) {
        throw new ActionExecutionError("malformed_payload", "pi-ai returned an invalid response.", false, { cause: error });
    }
}
