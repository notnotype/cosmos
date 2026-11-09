import {
    ActionExecutionError,
    createAgentInvocationV2Action,
    type AgentModelResolver,
    type RegisteredAction,
    type SecretStorePort,
} from "@cosmos/application";
import {
    PiAiAgentInvocationV2Adapter,
    defaultPiAiClient,
    type PiAiClientV2,
} from "@cosmos/agent-pi-ai";

/**
 * `agent.invoke@2` 的 Worker 装配：模型与凭证都按 modelId 在调用时解析，不需要启动时固定的
 * Agent 配置。
 *
 * 这里始终注册 Action——与 @1 不同，@2 没有"Worker 没配 Agent 所以不可用"的状态：
 * 是否能用由调用时指定的模型是否可用决定。没配 Provider 的用户收到的是模型不可用，
 * 而不是"这个 Worker 不支持"。
 */
export function createWorkerAgentInvocationV2Action(dependencies: {
    models: AgentModelResolver;
    secrets: SecretStorePort;
    client?: PiAiClientV2;
}): RegisteredAction {
    return createAgentInvocationV2Action(new PiAiAgentInvocationV2Adapter({
        models: dependencies.models,
        secrets: {
            read: async (secretRef) => {
                try {
                    return await dependencies.secrets.read(secretRef);
                } catch {
                    // 存储层读取失败对调用方与"没有凭证"是同一种可恢复状态：重新保存
                    // 重新保存 Provider 凭证即可，不需要区分内部错误类型。
                    throw new ActionExecutionError(
                        "authentication_required",
                        "The selected model connection credential could not be loaded.",
                        false,
                    );
                }
            },
        },
        client: dependencies.client ?? defaultPiAiClient,
    }));
}
