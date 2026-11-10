import type { ConfiguredModelSnapshot, ModelProviderSnapshot } from "@cosmos/contracts";
import { CosmosTransportError, type HttpCosmosClient } from "@cosmos/transport-http";
import { messages } from "@/copy/messages";

export type ModelSettingsClient = Pick<HttpCosmosClient,
    "getSystemConfig" | "updateSystemConfig" | "listModelProviders" | "listConfiguredModels"
>;
export type DefaultModelOption = { model: ConfiguredModelSnapshot; provider: ModelProviderSnapshot };

async function loadModelOptions(client: ModelSettingsClient): Promise<DefaultModelOption[]> {
    const providers: ModelProviderSnapshot[] = [];
    let cursor: string | undefined;
    do {
        const page = await client.listModelProviders(cursor ? { cursor } : {});
        providers.push(...page.items);
        cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const groups = await Promise.all(providers.filter((provider) => provider.state === "active").map(async (provider) => {
        const page = await client.listConfiguredModels(provider.id);
        return page.items.map((model) => ({ model, provider }));
    }));
    return groups.flat();
}

export async function loadDefaultModelSettings(client: ModelSettingsClient) {
    const [config, options] = await Promise.all([client.getSystemConfig(), loadModelOptions(client)]);
    return { config, options };
}

export function defaultModelErrorMessage(error: unknown): string {
    const copy = messages.pages.settings.defaultModel;
    if (error instanceof CosmosTransportError) {
        if (error.status === 404) return copy.modelMissing;
        if (error.status === 409) return copy.invalidSelection;
        if (error.status === 503) return copy.serviceUnavailable;
        if (error.status === 400) return copy.invalidInput;
    }
    return copy.saveFailed;
}
