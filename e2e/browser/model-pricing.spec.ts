import {expect, test, type Locator, type Page} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {configuredModelSnapshotSchema, modelProviderSnapshotSchema, type ConfiguredModelSnapshot} from "@cosmos/contracts";

async function verifyPricingConflict(page: Page, editor: Locator, modelRow: Locator, modelPath: string,
    current: {version: number}, remember: (snapshot: ConfiguredModelSnapshot) => void) {
    const staleVersion = current.version;
    const externalUpdate = await page.request.patch(modelPath, {
        headers: {origin: new URL(page.url()).origin, "idempotency-key": randomUUID()},
        data: {expectedVersion: staleVersion, maxOutputTokens: 768}});
    expect(externalUpdate.status()).toBe(200);
    const external = configuredModelSnapshotSchema.parse(await externalUpdate.json());
    remember(external);
    expect(external.version).toBe(staleVersion + 1);
    await editor.getByLabel("输入单价", {exact: true}).fill("12");
    const uiPatches: Array<{expectedVersion?: number}> = [];
    page.on("request", (request) => {
        if (request.method() === "PATCH" && request.url().endsWith(modelPath)) {
            const body: unknown = request.postDataJSON();
            let expectedVersion: number | undefined;
            if (typeof body === "object" && body !== null && "expectedVersion" in body
                && typeof body.expectedVersion === "number") expectedVersion = body.expectedVersion;
            uiPatches.push({expectedVersion});
        }
    });
    const refusedPromise = page.waitForResponse((response) => response.url().endsWith(modelPath)
        && response.request().method() === "PATCH");
    await editor.getByRole("button", {name: "保存模型修改", exact: true}).click();
    const refused = await refusedPromise;
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toMatchObject({code: "version_conflict"});
    expect(refused.request().postDataJSON()).toMatchObject({expectedVersion: staleVersion, inputPricePerMillion: 12});
    await expect(modelRow.getByRole("status")).toContainText("草稿已保留");
    await expect(editor.getByLabel("输入单价", {exact: true})).toHaveValue("12");
    await expect(editor.getByRole("button", {name: "保存模型修改", exact: true})).toBeDisabled();
    expect(uiPatches).toEqual([{expectedVersion: staleVersion}]);
    page.once("dialog", (dialog) => {
        expect(dialog.message()).toContain("放弃当前模型草稿");
        void dialog.dismiss();
    });
    await editor.getByRole("button", {name: "重新加载模型", exact: true}).click();
    await expect(editor.getByLabel("输入单价", {exact: true})).toHaveValue("12");
    await expect(editor.getByRole("button", {name: "保存模型修改", exact: true})).toBeDisabled();
    expect(uiPatches).toEqual([{expectedVersion: staleVersion}]);
    page.once("dialog", (dialog) => {
        expect(dialog.message()).toContain("放弃当前模型草稿");
        void dialog.accept();
    });
    await editor.getByRole("button", {name: "重新加载模型", exact: true}).click();
    await expect(editor.getByLabel("输入单价", {exact: true})).toHaveValue("1");
    await expect(editor.getByLabel("单次输出上限（token）", {exact: true})).toHaveValue("768");
    await expect(editor.getByRole("button", {name: "保存模型修改", exact: true})).toBeEnabled();
    expect(uiPatches).toEqual([{expectedVersion: staleVersion}]);
    await editor.getByLabel("输入单价", {exact: true}).fill("12");
    const recoveredPromise = page.waitForResponse((response) => response.url().endsWith(modelPath)
        && response.request().method() === "PATCH");
    await editor.getByRole("button", {name: "保存模型修改", exact: true}).click();
    const recovered = await recoveredPromise;
    expect(recovered.status()).toBe(200);
    const updated = configuredModelSnapshotSchema.parse(await recovered.json());
    remember(updated);
    expect(recovered.request().postDataJSON()).toMatchObject({expectedVersion: external.version, inputPricePerMillion: 12});
    expect(uiPatches).toEqual([{expectedVersion: staleVersion}, {expectedVersion: external.version}]);
    expect(updated).toMatchObject({inputPricePerMillion: 12, maxOutputTokens: 768, currency: "CNY", tieredPricingEnabled: true});
}

test("model pricing UI creates, edits and reloads the complete CNY and USD groups", async ({page}) => {
    await page.goto("/models");
    const headers = () => ({origin: new URL(page.url()).origin, "idempotency-key": randomUUID()});
    const providerName = `Pricing UI ${randomUUID()}`;
    const modelName = `Tiered UI ${randomUUID()}`;
    let provider: {id: string; version: number} | undefined;
    let model: {id: string; version: number} | undefined;
    try {
        const createdProvider = await page.request.post("/api/v1/model-providers", {headers: headers(),
            data: {name: providerName, api: "openai-completions", baseUrl: "https://pricing.e2e.invalid/v1",
                apiKey: "synthetic-pricing-key"}});
        expect(createdProvider.status()).toBe(201);
        provider = modelProviderSnapshotSchema.parse(await createdProvider.json());
        const path = `/api/v1/model-providers/${provider.id}/models`;
        await page.reload();
        const providerRow = page.locator("li").filter({hasText: providerName});
        await providerRow.getByRole("button", {name: `展开「${providerName}」的模型`, exact: true}).click();
        await providerRow.getByLabel("模型 ID", {exact: true}).fill("pricing-ui-model");
        await providerRow.getByLabel("显示名称", {exact: true}).fill(modelName);
        await providerRow.getByLabel("上下文窗口（token）", {exact: true}).fill("400000");
        await providerRow.getByLabel("单次输出上限（token）", {exact: true}).fill("512");
        for (const [label, value] of [["输入单价", "1"], ["输出单价", "2"],
            ["缓存写入单价", "3"], ["缓存读取单价", "4"]]) {
            await providerRow.getByLabel(label!, {exact: true}).fill(value!);
        }
        await providerRow.getByLabel("计价币种", {exact: true}).selectOption("CNY");
        await providerRow.getByLabel("启用阶梯定价", {exact: true}).check();
        await providerRow.getByLabel("输入 token 阈值", {exact: true}).fill("272000");
        for (const [label, value] of [["高档输入单价", "10"], ["高档输出单价", "20"],
            ["高档缓存写入单价", "30"], ["高档缓存读取单价", "40"]]) {
            await providerRow.getByLabel(label!, {exact: true}).fill(value!);
        }
        await expect(providerRow).toContainText("输入总量超过阈值，整次请求按高价档");
        const responsePromise = page.waitForResponse((response) => response.url().endsWith(path)
            && response.request().method() === "POST");
        await providerRow.getByRole("button", {name: "全部添加", exact: true}).click();
        const created = await responsePromise;
        expect(created.status()).toBe(201);
        model = configuredModelSnapshotSchema.parse(await created.json());
        const tiered = {...basePrices, tieredPricingEnabled: true, tieredPricingThreshold: 272000,
            highInputPricePerMillion: 10, highOutputPricePerMillion: 20,
            highCacheWritePricePerMillion: 30, highCacheReadPricePerMillion: 40};
        expect(model).toMatchObject(tiered);
        const modelPath = `${path}/${model.id}`;
        const read = async () => {
            const response = await page.request.get(modelPath);
            expect(response.status()).toBe(200);
            return configuredModelSnapshotSchema.parse(await response.json());
        };
        expect(await read()).toEqual(model);
        await page.reload();
        await providerRow.getByRole("button", {name: `展开「${providerName}」的模型`, exact: true}).click();
        await providerRow.getByRole("button", {name: `编辑模型 ${modelName}`, exact: true}).click();
        const editor = providerRow.getByRole("group", {name: `编辑模型 ${modelName}`, exact: true});
        await expect(editor.getByLabel("缓存读取单价", {exact: true})).toHaveValue("4");
        await expect(editor.getByLabel("高档缓存读取单价", {exact: true})).toHaveValue("40");
        await expect(editor.getByLabel("计价币种", {exact: true})).toHaveValue("CNY");
        await expect(editor.getByLabel("输入 token 阈值", {exact: true})).toHaveValue("272000");
        const modelRow = providerRow.locator("li").filter({has: page.getByRole("button", {name: `编辑模型 ${modelName}`, exact: true})});
        await verifyPricingConflict(page, editor, modelRow, modelPath, model, (snapshot) => { model = snapshot; });
        expect(await read()).toEqual(model);
        await providerRow.getByRole("button", {name: `编辑模型 ${modelName}`, exact: true}).click();
        await editor.getByLabel("计价币种", {exact: true}).selectOption("USD");
        await editor.getByLabel("启用阶梯定价", {exact: true}).uncheck();
        for (const label of ["输入单价", "输出单价", "缓存写入单价", "缓存读取单价"]) {
            await editor.getByLabel(label, {exact: true}).fill("0");
        }
        const updatedPromise = page.waitForResponse((response) => response.url().endsWith(modelPath)
            && response.request().method() === "PATCH");
        await editor.getByRole("button", {name: "保存模型修改", exact: true}).click();
        const updated = await updatedPromise;
        expect(updated.status()).toBe(200);
        model = configuredModelSnapshotSchema.parse(await updated.json());
        const zero = {...basePrices, currency: "USD", inputPricePerMillion: 0, outputPricePerMillion: 0,
            cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0};
        expect(model).toMatchObject(zero);
        expect(await read()).toEqual(model);
        await page.reload();
        await providerRow.getByRole("button", {name: `展开「${providerName}」的模型`, exact: true}).click();
        await providerRow.getByRole("button", {name: `编辑模型 ${modelName}`, exact: true}).click();
        await expect(editor.getByLabel("计价币种", {exact: true})).toHaveValue("USD");
        await expect(editor.getByLabel("缓存读取单价", {exact: true})).toHaveValue("0");
        await expect(editor.getByLabel("启用阶梯定价", {exact: true})).not.toBeChecked();
    } finally {
        if (provider !== undefined) {
            if (model !== undefined) expect((await page.request.delete(`/api/v1/model-providers/${provider.id}/models/${model.id}`, {
                headers: headers(), data: {expectedVersion: model.version},
            })).status()).toBe(204);
            expect((await page.request.delete(`/api/v1/model-providers/${provider.id}`, {
                headers: headers(), data: {expectedVersion: provider.version},
            })).status()).toBe(204);
        }
    }
});

const basePrices = {inputPricePerMillion: 1, outputPricePerMillion: 2,
    cacheWritePricePerMillion: 3, cacheReadPricePerMillion: 4, currency: "CNY",
    tieredPricingEnabled: false, tieredPricingThreshold: null,
    highInputPricePerMillion: null, highOutputPricePerMillion: null,
    highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null};

test("model pricing HTTP validation is atomic and metadata updates preserve all prices", async ({page}) => {
    await page.goto("/settings");
    const headers = () => ({origin: new URL(page.url()).origin, "idempotency-key": randomUUID()});
    let provider: {id: string; version: number} | undefined;
    let model: {id: string; version: number} | undefined;
    try {
        const response = await page.request.post("/api/v1/model-providers", {headers: headers(),
            data: {name: `Pricing validation ${randomUUID()}`, api: "openai-completions",
                baseUrl: "https://pricing.e2e.invalid/v1", apiKey: "synthetic-pricing-key"}});
        expect(response.status()).toBe(201);
        provider = modelProviderSnapshotSchema.parse(await response.json());
        const path = `/api/v1/model-providers/${provider.id}/models`;
        const identity = {modelId: "pricing-validation", name: "Pricing validation", contextWindow: 4096, maxOutputTokens: 512};
        for (const invalid of [
            {...identity, inputPricePerMillion: 1, outputPricePerMillion: 2},
            {...identity, ...basePrices, currency: "EUR"},
            {...identity, ...basePrices, tieredPricingEnabled: true, tieredPricingThreshold: 272000},
            {...identity, ...basePrices, tieredPricingThreshold: 272000},
        ]) {
            expect((await page.request.post(path, {headers: headers(), data: invalid})).status()).toBe(400);
        }
        const tieredPrices = {...basePrices, tieredPricingEnabled: true, tieredPricingThreshold: 272000,
            highInputPricePerMillion: 10, highOutputPricePerMillion: 20,
            highCacheWritePricePerMillion: 30, highCacheReadPricePerMillion: 40};
        const created = await page.request.post(path, {headers: headers(), data: {...identity, ...tieredPrices}});
        expect(created.status()).toBe(201);
        model = configuredModelSnapshotSchema.parse(await created.json());
        expect(model).toMatchObject(tieredPrices);
        const modelPath = `${path}/${model.id}`;
        const read = async () => {
            const result = await page.request.get(modelPath);
            expect(result.status()).toBe(200);
            return configuredModelSnapshotSchema.parse(await result.json());
        };
        const before = await read();
        for (const invalid of [
            {expectedVersion: model.version, inputPricePerMillion: 0},
            {expectedVersion: model.version, ...basePrices, tieredPricingEnabled: true, tieredPricingThreshold: 272000,
                highInputPricePerMillion: 10, highOutputPricePerMillion: 20, highCacheWritePricePerMillion: 30},
            {expectedVersion: model.version, ...basePrices, highCacheReadPricePerMillion: 40},
        ]) {
            expect((await page.request.patch(modelPath, {headers: headers(), data: invalid})).status()).toBe(400);
            expect(await read()).toEqual(before);
        }
        const renamed = await page.request.patch(modelPath, {headers: headers(),
            data: {expectedVersion: model.version, name: "Metadata only pricing"}});
        expect(renamed.status()).toBe(200);
        model = configuredModelSnapshotSchema.parse(await renamed.json());
        expect(model).toMatchObject({...tieredPrices, name: "Metadata only pricing"});
        const zeroPrices = {...basePrices, inputPricePerMillion: 0, outputPricePerMillion: 0,
            cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0, currency: "USD"};
        const zero = await page.request.patch(modelPath, {headers: headers(),
            data: {expectedVersion: model.version, ...zeroPrices}});
        expect(zero.status()).toBe(200);
        model = configuredModelSnapshotSchema.parse(await zero.json());
        expect(model).toMatchObject(zeroPrices);
        expect(await read()).toEqual(model);
    } finally {
        if (provider !== undefined) {
            if (model !== undefined) {
                expect((await page.request.delete(`/api/v1/model-providers/${provider.id}/models/${model.id}`, {
                    headers: headers(), data: {expectedVersion: model.version},
                })).status()).toBe(204);
            }
            expect((await page.request.delete(`/api/v1/model-providers/${provider.id}`, {
                headers: headers(), data: {expectedVersion: provider.version},
            })).status()).toBe(204);
        }
    }
});
