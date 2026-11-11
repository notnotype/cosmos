import {
    agentInvocationOutputSchema,
    agentInvocationV2InputSchema,
    type ActionDefinition,
    type AgentInvocationOutput,
    type AgentInvocationV2Input,
} from "@cosmos/contracts";

import {
    type ActionExecutionContext,
    type RegisteredAction,
} from "./action.js";
import type { AgentInvocationContext } from "./agent-invocation.js";

export interface AgentModelSnapshot {
    modelId: string;
    modelName: string;
    providerId: string;
    api: "openai-completions" | "openai-responses";
    baseUrl: string;
    contextWindow: number;
    maxOutputTokens: number;
    secretRef: string;
    inputPricePerMillion: number | null;
    outputPricePerMillion: number | null;
    cacheWritePricePerMillion?: number | null;
    cacheReadPricePerMillion?: number | null;
    currency?: "USD" | "CNY";
    tieredPricingEnabled?: boolean;
    tieredPricingThreshold?: number | null;
    highInputPricePerMillion?: number | null;
    highOutputPricePerMillion?: number | null;
    highCacheWritePricePerMillion?: number | null;
    highCacheReadPricePerMillion?: number | null;
}

export interface AgentModelResolver {
    resolve(modelId: string | null): Promise<AgentModelSnapshot | null>;
}

export interface AgentInvocationV2Port {
    invoke(input: AgentInvocationV2Input, context: AgentInvocationContext): Promise<AgentInvocationOutput>;
}

const agentInvocationV2Definition: ActionDefinition = {
    ref: "agent.invoke@2",
    kind: "agent",
    description: "Invoke a configured model.",
    capabilities: ["agent:invoke"],
    executionPlacement: "trusted_worker",
    inputSchema: agentInvocationV2InputSchema,
    outputSchema: agentInvocationOutputSchema,
    execution: {
        idempotent: false,
        supportsCancellation: true,
        timeoutMs: null,
        retryPolicy: {
            maxAttempts: 2,
            backoffMs: 1_000,
            retryableErrors: ["dependency_unavailable", "timeout", "rate_limited"],
        },
    },
};

export function createAgentInvocationV2Action(port: AgentInvocationV2Port): RegisteredAction {
    return {
        definition: agentInvocationV2Definition,
        handler: async (input: unknown, context: ActionExecutionContext) => {
            const parsedInput = agentInvocationV2InputSchema.parse(input);
            const output = await port.invoke(parsedInput, context);
            return agentInvocationOutputSchema.parse(output);
        },
    };
}

export function getAgentInvocationV2Definition(): ActionDefinition {
    return agentInvocationV2Definition;
}
