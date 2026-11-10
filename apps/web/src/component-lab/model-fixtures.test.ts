import type {HttpCosmosClient} from "@cosmos/transport-http";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {DefaultModelPanel} from "@/components/cosmos/default-model-panel";

import {renderDefaultModelPanelLab} from "./model-fixtures";

function getClient(): HttpCosmosClient {
    return renderDefaultModelPanelLab().props.client;
}

const fetch = vi.fn(() => {
    throw new Error("Model lab fixtures must not access the network.");
});

beforeEach(() => {
    fetch.mockClear();
    vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
    try {
        expect(fetch).not.toHaveBeenCalled();
    } finally {
        vi.unstubAllGlobals();
    }
});

describe("default model panel lab fixture", () => {
    it("renders DefaultModelPanel with its offline client", () => {
        const element = renderDefaultModelPanelLab();

        expect(element.type).toBe(DefaultModelPanel);
        expect(element.props.client).toEqual({
            getDefaultModel: expect.any(Function),
            setDefaultModel: expect.any(Function),
            listModelProviders: expect.any(Function),
            listConfiguredModels: expect.any(Function),
        });
    });

    it("keeps the client reference stable across renders", () => {
        expect(renderDefaultModelPanelLab().props.client)
            .toBe(renderDefaultModelPanelLab().props.client);
    });

    it("reads an active provider, its configured models and a matching default", async () => {
        const client = getClient();
        const providers = await client.listModelProviders();

        expect(providers.nextCursor).toBeNull();
        expect(providers.items).toHaveLength(1);
        expect(providers.items[0]).toMatchObject({
            id: "provider-deepseek",
            name: "我的 DeepSeek",
            state: "active",
            credentialState: "configured",
        });

        const models = await client.listConfiguredModels(providers.items[0]!.id);

        expect(models.nextCursor).toBeNull();
        expect(models.items).toHaveLength(2);
        expect(models.items).toEqual([
            expect.objectContaining({
                id: "model-chat",
                providerId: providers.items[0]!.id,
                modelId: "deepseek-chat",
                name: "DeepSeek Chat",
            }),
            expect.objectContaining({
                id: "model-reasoner",
                providerId: providers.items[0]!.id,
                modelId: "deepseek-reasoner",
                name: "DeepSeek Reasoner",
            }),
        ]);

        const defaultModel = await client.getDefaultModel();

        expect(defaultModel).toEqual({modelId: "model-chat"});
        expect(models.items.some((model) => model.id === defaultModel.modelId)).toBe(true);
    });

    it.each(["model-chat", "model-reasoner"])("returns the selected configured model %s when saving", async (modelId) => {
        const client = getClient();

        await expect(client.setDefaultModel(modelId)).resolves.toEqual({modelId});
    });

    it("returns a null modelId when clearing the default", async () => {
        const client = getClient();

        await expect(client.setDefaultModel(null)).resolves.toEqual({modelId: null});
    });
});
