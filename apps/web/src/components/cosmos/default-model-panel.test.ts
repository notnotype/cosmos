import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DefaultModelPanel } from "@/components/cosmos/default-model-panel";
import type { ModelSettingsClient } from "@/components/cosmos/default-model-settings";

describe("DefaultModelPanel server render", () => {
    it("announces loading without claiming an empty configuration or issuing API calls", () => {
        const client = {
            getSystemConfig: vi.fn<ModelSettingsClient["getSystemConfig"]>(),
            updateSystemConfig: vi.fn<ModelSettingsClient["updateSystemConfig"]>(),
            listModelProviders: vi.fn<ModelSettingsClient["listModelProviders"]>(),
            listConfiguredModels: vi.fn<ModelSettingsClient["listConfiguredModels"]>(),
        } satisfies ModelSettingsClient;
        const html = renderToStaticMarkup(createElement(DefaultModelPanel, { client }));

        expect(html).toContain('role="status"');
        expect(html).toContain("读取模型列表中…");
        expect(html).not.toContain("（未设置）");
        expect(html).not.toContain("暂无可选模型");
        expect(html).not.toContain('role="alert"');
        expect(html).not.toContain("<select");
        expect(html).not.toContain("<button");
        expect(client.getSystemConfig).not.toHaveBeenCalled();
        expect(client.listModelProviders).not.toHaveBeenCalled();
        expect(client.listConfiguredModels).not.toHaveBeenCalled();
        expect(client.updateSystemConfig).not.toHaveBeenCalled();
    });
});
