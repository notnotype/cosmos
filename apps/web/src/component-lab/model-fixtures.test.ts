import type {HttpCosmosClient} from "@cosmos/transport-http";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {DefaultModelPanel} from "@/components/cosmos/default-model-panel";

import {renderDefaultModelPanelLab} from "./model-fixtures";

type FixtureClient = Pick<HttpCosmosClient, "getSystemConfig" | "updateSystemConfig" | "listModelProviders" | "listConfiguredModels">;
function getClient(): FixtureClient {
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
            getSystemConfig: expect.any(Function), updateSystemConfig: expect.any(Function),
            listModelProviders: expect.any(Function), listConfiguredModels: expect.any(Function),
        });
    });

    it("keeps the client reference stable across renders", () => {
        expect(renderDefaultModelPanelLab().props.client).toBe(renderDefaultModelPanelLab().props.client);
    });

    it("reads an active provider, its configured models and matching default details", async () => {
        const client = getClient();
        const providers = await client.listModelProviders();
        expect(providers.nextCursor).toBeNull();
        expect(providers.items[0]).toMatchObject({ id: "provider-deepseek", state: "active", credentialState: "configured" });
        const models = await client.listConfiguredModels(providers.items[0]!.id);
        expect(models.items).toHaveLength(2);
        const config = await client.getSystemConfig();
        expect(config.defaultModelId).toBe("model-chat");
        expect(config.defaultModel).toEqual(models.items[0]);
    });

    it.each(["model-chat", "model-reasoner", null])("returns the selected default %s without a real write", async (defaultModelId) => {
        await expect(getClient().updateSystemConfig({defaultModelId})).resolves.toEqual({defaultModelId});
    });
});
