import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { configuredModelSnapshotSchema, modelProviderSnapshotSchema, systemConfigDtoSchema } from "@cosmos/contracts";

test("default model settings save, recover from a refused write, show deletion and clear", async ({page}) => {
    test.setTimeout(120_000);
    await page.goto("/settings");
    const origin = new URL(page.url()).origin;
    const headers = () => ({origin, "idempotency-key": randomUUID()});
    const config = async () => systemConfigDtoSchema.parse(await (await page.request.get("/api/v1/system/config")).json());
    const previous = await config();
    let providerId: string | null = null;
    let providerVersion: number | null = null;
    let modelId: string | null = null;
    let modelVersion: number | null = null;
    let modelRemoved = false;
    let providerDeleted = false;

    try {
        const providerResponse = await page.request.post("/api/v1/model-providers", {
            headers: headers(), data: {name: `Default model ${randomUUID()}`, api: "openai-completions",
                baseUrl: "https://settings.e2e.invalid/v1", apiKey: "synthetic-settings-key"},
        });
        expect(providerResponse.status()).toBe(201);
        const provider = modelProviderSnapshotSchema.parse(await providerResponse.json());
        providerId = provider.id;
        providerVersion = provider.version;
        const modelResponse = await page.request.post(`/api/v1/model-providers/${provider.id}/models`, {
            headers: headers(), data: {modelId: "settings-model", name: "Settings synthetic model",
                contextWindow: 4096, maxOutputTokens: 512,
                inputPricePerMillion: 0, outputPricePerMillion: 0,
                cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0, currency: "USD"},
        });
        expect(modelResponse.status()).toBe(201);
        const model = configuredModelSnapshotSchema.parse(await modelResponse.json());
        modelId = model.id;
        modelVersion = model.version;

        const region = page.getByRole("region", {name: "默认模型", exact: true});
        const selector = region.getByRole("combobox", {name: "默认模型", exact: true});
        const save = region.getByRole("button", {name: "保存", exact: true});
        await page.reload();
        await expect(selector).toBeEnabled();
        await selector.selectOption(model.id);
        let rejectWrite = true;
        await page.route("**/api/v1/system/config", async (route) => {
            if (route.request().method() === "PUT" && rejectWrite) {
                rejectWrite = false;
                await route.fulfill({status: 503, contentType: "application/json",
                    body: JSON.stringify({code: "dependency_unavailable", message: "Synthetic write refusal"})});
                return;
            }
            await route.continue();
        });
        await save.click();
        await expect(region.getByRole("alert")).toContainText("模型配置服务暂时不可用");
        await expect(selector).toHaveValue(model.id);
        expect((await config()).defaultModelId).toBe(previous.defaultModelId);
        await save.click();
        await expect(region.getByRole("status")).toContainText("已保存");
        expect((await config()).defaultModelId).toBe(model.id);
        await page.reload();
        await expect(selector).toHaveValue(model.id);
        await expect(region.getByRole("region", {name: "当前默认模型", exact: true})).toContainText(model.name);
        await expect(region).toContainText("输入价格：$0 USD / 百万 tokens");
        await expect(region).toContainText("输出价格：$0 USD / 百万 tokens");
        await expect(region).toContainText("缓存写入价格：$0 USD / 百万 tokens");
        await expect(region).toContainText("缓存读取价格：$0 USD / 百万 tokens");
        await expect(region).not.toContainText("价格信息不可用");

        const providerDeleteWhileModelExists = await page.request.delete(`/api/v1/model-providers/${provider.id}`, {
            headers: headers(), data: {expectedVersion: provider.version},
        });
        expect(providerDeleteWhileModelExists.status()).toBe(409);
        expect(await providerDeleteWhileModelExists.json()).toMatchObject({code: "in_use"});
        expect((await config()).defaultModelId).toBe(model.id);

        const modelDelete = await page.request.delete(`/api/v1/model-providers/${provider.id}/models/${model.id}`, {
            headers: headers(), data: {expectedVersion: model.version},
        });
        expect(modelDelete.status()).toBe(204);
        modelRemoved = true;
        expect(await config()).toMatchObject({defaultModelId: model.id, defaultModel: null});
        await page.reload();
        await expect(region.getByText("原默认模型已不存在，请重新选择或清除设置。", {exact: true})).toBeVisible();
        await expect(selector).toHaveValue(model.id);

        await selector.selectOption("");
        await save.click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toContainText("清除默认模型？");
        await dialog.getByRole("button", {name: "取消", exact: true}).click();
        expect((await config()).defaultModelId).toBe(model.id);
        await save.click();
        await dialog.getByRole("button", {name: "确认清除", exact: true}).click();
        await expect(region.getByRole("status")).toContainText("已保存");
        expect((await config()).defaultModelId).toBeNull();
        const providerDeleteAfterModelRemoval = await page.request.delete(`/api/v1/model-providers/${provider.id}`, {
            headers: headers(), data: {expectedVersion: provider.version},
        });
        expect(providerDeleteAfterModelRemoval.status()).toBe(204);
        providerDeleted = true;
        await page.reload();
        await expect(selector).toHaveValue("");
    } finally {
        await page.unroute("**/api/v1/system/config");
        const restore = await page.request.put("/api/v1/system/config", {
            data: {defaultModelId: previous.defaultModelId},
        });
        expect(restore.status()).toBe(200);
        if (providerId !== null && providerVersion !== null) {
            if (!modelRemoved && modelId !== null && modelVersion !== null) {
                const removeModel = await page.request.delete(
                    `/api/v1/model-providers/${providerId}/models/${modelId}`,
                    {headers: headers(), data: {expectedVersion: modelVersion}},
                );
                expect(removeModel.status()).toBe(204);
            }
            if (!providerDeleted) {
                const removeProvider = await page.request.delete(`/api/v1/model-providers/${providerId}`, {
                    headers: headers(), data: {expectedVersion: providerVersion},
                });
                expect([204, 404]).toContain(removeProvider.status());
            }
        }
    }
});
