import { useState } from "react";
import { configuredModelSnapshotSchema, createConfiguredModelCommandSchema, updateConfiguredModelCommandSchema } from "@cosmos/contracts";
import {CosmosTransportError, type HttpCosmosClient} from "@cosmos/transport-http";

import {DefaultModelPanel} from "@/components/cosmos/default-model-panel";
import {StoryAgentTimeoutPanel} from "@/components/cosmos/story-agent-timeout-panel";
import {
    STORY_AGENT_TIMEOUT_DEFAULT,
    type StoryAgentTimeoutClient,
} from "@/components/cosmos/story-agent-timeout-settings";
import {ModelProviderPanel} from "@/components/cosmos/model-provider-panel";
import {ModelDetails} from "@/components/cosmos/model-details";
import {ProviderModelsSection} from "@/components/cosmos/provider-models-section";
import {ToastHost, ToastProvider} from "@/components/ui/toast";

import {optionProp} from "./registry/shared";
import type {LabProps} from "./types";

/**
 * 模型页的夹具（Proposal connection-credential-entry-v1）：一个服务商、两个模型，
 * 发现返回三个候选，其中一个是已配置模型——界面上它应当显示成「已添加」而不是可再添加。
 *
 * 夹具不假装任何真实外呼：`discoverProviderModels` 只回一份固定快照。
 *
 * 独立成文件是因为 `product-fixtures.tsx` 已到 50 KB 红线（单文件治理口径），
 * 模型这组夹具与其余产品夹具没有共享状态。
 */
const fixtureTimestamp = "2026-01-01T00:00:00.000Z";

const modelLabProvider = {
    id: "provider-deepseek",
    name: "我的 DeepSeek",
    api: "openai-completions" as const,
    baseUrl: "https://api.deepseek.example/v1",
    version: 2,
    state: "active" as const,
    credentialState: "configured" as const,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
};

const modelLabModels = [
    {
        id: "model-chat",
        providerId: modelLabProvider.id,
        modelId: "deepseek-chat",
        name: "DeepSeek Chat",
        contextWindow: 65_536,
        maxOutputTokens: 8_192,
        version: 1,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
    },
    {
        id: "model-reasoner",
        providerId: modelLabProvider.id,
        modelId: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        contextWindow: 65_536,
        maxOutputTokens: 8_192,
        version: 1,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
    },
].map((model) => configuredModelSnapshotSchema.parse(model));

const modelDiscoveryLabSnapshot = {
    id: "discovery-lab",
    providerId: modelLabProvider.id,
    providerVersion: modelLabProvider.version,
    status: "succeeded" as const,
    candidates: [
        {modelId: "deepseek-chat", name: "DeepSeek Chat"},
        {modelId: "deepseek-coder", name: "DeepSeek Coder"},
        {modelId: "deepseek-reasoner", name: "DeepSeek Reasoner"},
    ],
    errorCode: null,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
};

type ModelPanelLabMethods = Pick<HttpCosmosClient,
    "listModelProviders" | "listConfiguredModels" | "discoverProviderModels"
    | "createModelProvider" | "updateModelProvider" | "createConfiguredModel"
    | "getConfiguredModel" | "updateConfiguredModel" | "deleteConfiguredModel" | "deleteModelProvider"
>;

/** 每次挂载创建独立存储；列表重读能看到本预览内的修改，切换场景不会共享数据。 */
function createModelPanelLabMethods({ empty = false, conflict = false } = {}): ModelPanelLabMethods {
    let models = empty ? [] : modelLabModels.map((model) => configuredModelSnapshotSchema.parse(model));
    let providers = empty ? [] : [{ ...modelLabProvider }];
    let nextId = 1;
    const reject = (status: number, code: string): never => {
        throw new CosmosTransportError(status, { code, message: "Model configuration write rejected.", retryable: false });
    };
    const getModel = (providerId: string, id: string) => {
        const model = models.find((item) => item.providerId === providerId && item.id === id);
        return model ?? reject(404, "not_found");
    };
    return {
        listModelProviders: async () => ({ items: providers.map((provider) => ({ ...provider })), nextCursor: null }),
        listConfiguredModels: async (providerId) => ({
            items: models.filter((model) => model.providerId === providerId).map((model) => configuredModelSnapshotSchema.parse(model)), nextCursor: null,
        }),
        discoverProviderModels: async () => ({ ...modelDiscoveryLabSnapshot, candidates: empty ? [] : modelDiscoveryLabSnapshot.candidates }),
        createModelProvider: async () => {
            providers = [{ ...modelLabProvider }];
            return { ...modelLabProvider };
        },
        updateModelProvider: async () => ({ ...modelLabProvider }),
        createConfiguredModel: async (providerId, input) => {
            const command = createConfiguredModelCommandSchema.parse(input);
            if (models.some((model) => model.providerId === providerId && model.modelId === command.modelId)) reject(409, "already_exists");
            const model = configuredModelSnapshotSchema.parse({ ...command, providerId, id: `lab-model-${nextId++}`,
                version: 1, createdAt: fixtureTimestamp, updatedAt: fixtureTimestamp });
            models = [...models, model];
            return configuredModelSnapshotSchema.parse(model);
        },
        getConfiguredModel: async (providerId, id) => configuredModelSnapshotSchema.parse(getModel(providerId, id)),
        updateConfiguredModel: async (providerId, id, input) => {
            const { expectedVersion, ...changes } = updateConfiguredModelCommandSchema.parse(input);
            const current = getModel(providerId, id);
            if (expectedVersion !== current.version) reject(409, "version_conflict");
            if (models.some((model) => model.id !== id && model.providerId === providerId && model.modelId === (changes.modelId ?? current.modelId))) reject(409, "already_exists");
            const updated = configuredModelSnapshotSchema.parse({ ...current, ...changes, version: current.version + 1,
                updatedAt: new Date().toISOString() });
            if (updated.maxOutputTokens > updated.contextWindow) reject(400, "invalid_input");
            models = models.map((model) => model.id === id ? updated : model);
            return configuredModelSnapshotSchema.parse(updated);
        },
        deleteConfiguredModel: async (providerId, id, expectedVersion) => {
            const current = getModel(providerId, id);
            if (current.version !== expectedVersion) reject(409, "version_conflict");
            models = models.filter((model) => model.id !== id);
        },
        deleteModelProvider: async () => {
            if (conflict) reject(409, "in_use");
            providers = [];
            models = [];
        },
    };
}

function ModelProviderPanelLab({ state }: { state: "populated" | "conflict" | "empty" }) {
    const [client] = useState(() => createModelPanelLabMethods({ empty: state === "empty", conflict: state === "conflict" }) as unknown as HttpCosmosClient);
    // 面板无条件调用 useToast()，而 /dev/components 不在 (shell)/(reading) 路由组里，
    // 没有祖先 Provider；缺它会抛「must be used within <Toast.Provider>」并让整个预览台不渲染
    // （实测 toHaveCount(0)，不是渲染出空面板）。
    return (
        <ToastProvider>
            <ModelProviderPanel client={client} />
            <ToastHost />
        </ToastProvider>
    );
}

export function renderModelProviderPanelLab(props: LabProps) {
    const state = optionProp(props, "state", "populated", ["populated", "conflict", "empty"] as const);
    return <ModelProviderPanelLab key={state} state={state} />;
}

const defaultModelLabClient: Pick<HttpCosmosClient,
    "getSystemConfig" | "updateSystemConfig" | "listModelProviders" | "listConfiguredModels"
> = {
    getSystemConfig: async () => ({defaultModelId: modelLabModels[0]!.id, defaultModel: modelLabModels[0]!, storyAgentTimeoutSeconds: 300}),
    updateSystemConfig: async ({defaultModelId, storyAgentTimeoutSeconds}) => {
        const nextDefaultModelId = defaultModelId === undefined ? modelLabModels[0]!.id : defaultModelId;
        return {
            defaultModelId: nextDefaultModelId,
            defaultModel: nextDefaultModelId === null ? null : modelLabModels.find((model) => model.id === nextDefaultModelId) ?? null,
            storyAgentTimeoutSeconds: storyAgentTimeoutSeconds ?? STORY_AGENT_TIMEOUT_DEFAULT,
        };
    },
    listModelProviders: async () => ({ items: [modelLabProvider], nextCursor: null }),
    listConfiguredModels: async () => ({ items: modelLabModels.map((model) => configuredModelSnapshotSchema.parse(model)), nextCursor: null }),
};

export function renderDefaultModelPanelLab() {
    return <DefaultModelPanel client={defaultModelLabClient} />;
}

type StoryAgentTimeoutLabState = "default" | "read-failure";

export function createStoryAgentTimeoutLabClient(state: StoryAgentTimeoutLabState = "default"): StoryAgentTimeoutClient {
    let seconds = STORY_AGENT_TIMEOUT_DEFAULT;
    return {
        getSystemConfig: async () => {
            if (state === "read-failure") throw new Error("Story Agent timeout config read failed.");
            return {storyAgentTimeoutSeconds: seconds};
        },
        updateSystemConfig: async ({storyAgentTimeoutSeconds}) => {
            seconds = storyAgentTimeoutSeconds;
            return {storyAgentTimeoutSeconds: seconds};
        },
    };
}

function StoryAgentTimeoutPanelLab({state}: {state: StoryAgentTimeoutLabState}) {
    const [client] = useState(() => createStoryAgentTimeoutLabClient(state));
    return <StoryAgentTimeoutPanel client={client} />;
}

export function renderStoryAgentTimeoutPanelLab(props: LabProps) {
    const state = optionProp(props, "state", "default", ["default", "read-failure"] as const);
    return <StoryAgentTimeoutPanelLab key={state} state={state} />;
}

export function renderModelDetailsLab(props: LabProps) {
    const state = optionProp(props, "state", "priced", ["priced", "unknown"] as const);
    const model = state === "priced"
        ? { ...modelLabModels[0]!, inputPricePerMillion: 0, outputPricePerMillion: 2, cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0 }
        : modelLabModels[0]!;
    return <ModelDetails model={model} providerName={modelLabProvider.name} />;
}

function ProviderModelsSectionLab({ state }: { state: "populated" | "empty" }) {
    const [client] = useState(() => createModelPanelLabMethods({ empty: state === "empty" }) as unknown as HttpCosmosClient);
    return <ProviderModelsSection client={client} provider={modelLabProvider} />;
}

export function renderProviderModelsSectionLab(props: LabProps) {
    const state = optionProp(props, "state", "populated", ["populated", "empty"] as const);
    return <ProviderModelsSectionLab key={state} state={state} />;
}
