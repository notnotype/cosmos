import {CosmosTransportError, type HttpCosmosClient} from "@cosmos/transport-http";

import {DefaultModelPanel} from "@/components/cosmos/default-model-panel";
import {ModelProviderPanel} from "@/components/cosmos/model-provider-panel";
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
];

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

/** 实验室里 Provider 面板用到的客户端能力：只有这几个方法会被面板调用。 */
const modelPanelLabMethods = {
    listModelProviders: async () => ({items: [modelLabProvider], nextCursor: null}),
    listConfiguredModels: async () => ({items: modelLabModels, nextCursor: null}),
    discoverProviderModels: async () => modelDiscoveryLabSnapshot,
    createModelProvider: async () => modelLabProvider,
    updateModelProvider: async () => modelLabProvider,
    createConfiguredModel: async () => modelLabModels[0],
    deleteConfiguredModel: async () => {},
    deleteModelProvider: async () => {},
    // 编辑框会 join 连接列表来提示「改动会影响谁」；实验室给一条引用 chat 的模型连接。
    listConnections: async () => [{
        id: "connection-deepseek-agent",
        name: "DeepSeek 助手",
        connectorId: "cosmos.agent",
        status: "active" as const,
        modelId: modelLabModels[0]!.id,
        version: 1,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
    }],
};

const modelPanelLabClient = modelPanelLabMethods as unknown as HttpCosmosClient;

/**
 * 被连接引用时的删除：服务端返回 409 `in_use`，界面必须把原因留在列表上方，
 * 而不是弹一个几秒就消失的提示。真实判定在服务端事务里，这里只复现契约。
 */
const modelPanelConflictClient = {
    ...modelPanelLabMethods,
    deleteModelProvider: async () => {
        throw new CosmosTransportError(409, {
            code: "in_use",
            message: "Model configuration write rejected.",
            retryable: false,
        });
    },
} as unknown as HttpCosmosClient;

export function renderModelProviderPanelLab(props: LabProps) {
    const state = optionProp(props, "state", "populated", ["populated", "conflict", "empty"] as const);
    const client = state === "empty"
        ? ({
            listModelProviders: async () => ({items: [], nextCursor: null}),
        } as unknown as HttpCosmosClient)
        : state === "conflict"
            ? modelPanelConflictClient
            : modelPanelLabClient;
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

const defaultModelLabClient: Pick<HttpCosmosClient,
    "getDefaultModel" | "setDefaultModel" | "listModelProviders" | "listConfiguredModels"
> = {
    getDefaultModel: async () => ({modelId: modelLabModels[0]!.id}),
    setDefaultModel: async (modelId: string | null) => ({modelId}),
    listModelProviders: modelPanelLabMethods.listModelProviders,
    listConfiguredModels: modelPanelLabMethods.listConfiguredModels,
};

export function renderDefaultModelPanelLab() {
    return <DefaultModelPanel client={defaultModelLabClient as HttpCosmosClient} />;
}

export function renderProviderModelsSectionLab(props: LabProps) {
    const state = optionProp(props, "state", "populated", ["populated", "empty"] as const);
    const client = state === "empty"
        ? ({
            listConfiguredModels: async () => ({items: [], nextCursor: null}),
            discoverProviderModels: async () => ({
                ...modelDiscoveryLabSnapshot,
                status: "succeeded" as const,
                candidates: [],
            }),
        } as unknown as HttpCosmosClient)
        : modelPanelLabClient;
    return <ProviderModelsSection client={client} provider={modelLabProvider} />;
}
