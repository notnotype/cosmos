import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { configuredModelSnapshotSchema, modelProviderSnapshotSchema, systemConfigDtoSchema,
    storyAgentCandidateRecordSchema, contentRebuildResultSchema, structuredContentViewSchema,
    storyAgentGenerationRequestSchema, storyAgentGenerationSchema, storyDetailSchema } from "@cosmos/contracts";
import { ingestFeed, openStory, waitForStoryId } from "../support/story-flow";

test("Story generation persists actual cost through Worker, decisions and model repricing", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", (request) => errors.push(`${request.method()} ${request.url()}`));
    const previousConfig = systemConfigDtoSchema.parse(await (await page.request.get("/api/v1/system/config")).json());
    let providerId: string | null = null;
    let providerVersion: number | null = null;
    let modelId: string | null = null;
    let modelVersion: number | null = null;

    try {
    const source = await ingestFeed(page, "Story Agent isolated chain");
    const storyId = await waitForStoryId(page, source);
    const origin = new URL(page.url()).origin;
    const headers = () => ({ origin, "idempotency-key": randomUUID() });
    const providerResponse = await page.request.post("/api/v1/model-providers", {
        headers: headers(), data: { name: "Synthetic Story Provider", api: "openai-completions",
            baseUrl: "https://story-agent.e2e.invalid/v1", apiKey: "e2e-synthetic-key" },
    });
    expect(providerResponse.status()).toBe(201);
    const provider = modelProviderSnapshotSchema.parse(await providerResponse.json());
    providerId = provider.id;
    providerVersion = provider.version;
    const modelPath = `/api/v1/model-providers/${provider.id}/models`;
    const modelResponse = await page.request.post(modelPath, {
        headers: headers(), data: { modelId: "synthetic-story-model", name: "Synthetic Story Model",
            contextWindow: 4096, maxOutputTokens: 512, inputPricePerMillion: 1.25, outputPricePerMillion: 2.5,
            cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0, currency: "USD" },
    });
    expect(modelResponse.status()).toBe(201);
    const model = configuredModelSnapshotSchema.parse(await modelResponse.json());
    modelId = model.id;
    modelVersion = model.version;
    const configured = await page.request.put("/api/v1/system/config", { data: { defaultModelId: model.id } });
    expect(configured.status()).toBe(200);
    const detail = async () => storyDetailSchema.parse(await (await page.request.get(`/api/v1/stories/${storyId}`)).json());
    const before = await detail();
    await openStory(page, storyId);
    const panel = page.getByRole("region", { name: "Agent 建议", exact: true });
    const generate = panel.getByRole("button", { name: "生成建议", exact: true });
    await expect(panel.getByLabel("模型连接", { exact: true })).toHaveCount(0);
    await expect(generate).toBeEnabled();
    const endpoint = `/api/v1/stories/${encodeURIComponent(storyId)}/agent-candidates`;
    const records = async () => storyAgentCandidateRecordSchema.array().parse(await (await page.request.get(endpoint)).json());
    const queuedResponse = page.waitForResponse((response) => response.url().endsWith(endpoint)
        && response.request().method() === "POST", { timeout: 15_000 });
    await generate.click();
    const queued = await queuedResponse;
    expect(queued.status()).toBe(202);
    const generation = storyAgentGenerationSchema.parse(await queued.json());
    expect(generation).not.toHaveProperty("cost");
    const intent = storyAgentGenerationRequestSchema.parse(queued.request().postDataJSON());
    expect(intent).toEqual({ task: "story.summarize" });
    await expect(panel.getByRole("heading", { name: "Synthetic generated title 1", exact: true })).toBeVisible();

    // The isolated Worker's provider response contains 10 input and 20 output tokens.
    const cost = { input: 0.0000125, output: 0.00005, cacheRead: 0, cacheWrite: 0,
        total: 0.0000625, currency: "USD" };
    const generationPath = `/api/v1/stories/${encodeURIComponent(storyId)}/agent-generations/${generation.runId}`;
    const readGeneration = async () => {
        const response = await page.request.get(generationPath);
        expect(response.status()).toBe(200);
        return storyAgentGenerationSchema.parse(await response.json());
    };
    expect(await readGeneration()).toMatchObject({runId: generation.runId, status: "completed", cost});
    const candidateId = `story-candidate-${generation.runId}`;
    expect((await records()).find((record) => record.candidate.id === candidateId)?.candidate.cost).toEqual(cost);
    const firstCandidate = panel.locator("article").filter({hasText: "Synthetic generated title 1"});
    const costText = /^实际成本：0\.0000625 USD(?:（|$)/;
    await expect(firstCandidate.getByText(costText)).toBeVisible();
    await expect(firstCandidate).toContainText("输入：0.0000125");
    await expect(firstCandidate).toContainText("输出：0.00005");
    await expect(firstCandidate).toContainText("缓存写入：0");
    await expect(firstCandidate).toContainText("缓存读取：0");
    expect((await detail()).story.revisionId).toBe(before.story.revisionId);
    const replay = await page.request.post(endpoint, { headers: { origin,
        "idempotency-key": queued.request().headers()["idempotency-key"]! }, data: intent });
    expect(replay.status()).toBe(202);
    expect(storyAgentGenerationSchema.parse(await replay.json())).toMatchObject({
        runId: generation.runId, status: "completed", candidateId, cost,
    });
    await panel.getByRole("button", { name: "接受建议", exact: true }).click();
    await expect(panel.getByText("已接受", { exact: true })).toBeVisible();
    await expect.poll(async () => (await detail()).story.summary).toBe("Isolated model summary 1");
    const accepted = await detail();
    const repriced = await page.request.patch(`${modelPath}/${model.id}`, {
        headers: headers(), data: { expectedVersion: model.version,
            inputPricePerMillion: 9, outputPricePerMillion: 18,
            cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0, currency: "USD",
            tieredPricingEnabled: false, tieredPricingThreshold: null,
            highInputPricePerMillion: null, highOutputPricePerMillion: null,
            highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null },
    });
    expect(repriced.status()).toBe(200);
    const repricedModel = configuredModelSnapshotSchema.parse(await repriced.json());
    modelVersion = repricedModel.version;
    expect(repricedModel).toMatchObject({inputPricePerMillion: 9, outputPricePerMillion: 18});
    expect((await readGeneration()).cost).toEqual(cost);
    await page.reload();
    await expect(firstCandidate.getByText(costText)).toBeVisible();
    expect((await records()).find((record) => record.candidate.id === candidateId)?.candidate.cost).toEqual(cost);

    await panel.getByLabel("允许读取此 Story 的来源正文", { exact: true }).check();
    await generate.click();
    await expect(panel.getByRole("heading", { name: "Synthetic generated title 2", exact: true })).toBeVisible();
    const oldCandidate = (await records()).find((record) => record.status === "pending")!;
    await expect(panel.locator("article").filter({hasText: "Synthetic generated title 2"})
        .getByText(/^实际成本：0\.00045 USD(?:（|$)/)).toBeVisible();
    const updatedCost = oldCandidate.candidate.cost!;
    expect(updatedCost.input).toBeCloseTo(0.00009, 14);
    expect(updatedCost.output).toBeCloseTo(0.00036, 14);
    expect(updatedCost.total).toBeCloseTo(0.00045, 14);
    expect(updatedCost.currency).toBe("USD");
    const binding = oldCandidate.candidate.inputSources[0]!;
    const contentEndpoint = `/api/v1/revisions/${encodeURIComponent(binding.entryRevisionId)}/content`;
    const history = async () => structuredContentViewSchema.parse(await (await page.request.get(`${contentEndpoint}?representationVersion=${binding.representationVersion}`)).json());
    const oldView = await history();
    const rebuild = await page.request.post(`${contentEndpoint}/rebuild`, { data: {} });
    expect(rebuild.status()).toBe(201);
    expect(contentRebuildResultSchema.parse(await rebuild.json()).promoted).toBe(true);
    expect(await history()).toEqual(oldView);
    expect((await records()).find((item) => item.candidate.id === oldCandidate.candidate.id)).toMatchObject({
        candidate: oldCandidate.candidate, status: "pending", sourceStatus: "superseded",
    });
    const staleDecision = await page.request.post(`/api/v1/story-agent-candidates/${encodeURIComponent(oldCandidate.candidate.id)}/decision`, { data: { decision: "accept" } });
    expect(staleDecision.status()).toBe(409);
    expect((await detail()).story.revisionId).toBe(accepted.story.revisionId);
    await page.reload();
    await expect(panel.getByText("基于旧版内容表示；请重新验证后再接受。", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "接受建议", exact: true })).toBeDisabled();
    await panel.getByRole("button", { name: "拒绝建议", exact: true }).focus();
    await expect(panel.getByRole("button", { name: "拒绝建议", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel.getByText("已拒绝", { exact: true })).toBeVisible();
    expect((await detail()).story.revisionId).toBe(accepted.story.revisionId);
    await page.reload();
    await expect(panel.getByText("已接受", { exact: true })).toBeVisible();
    await expect(panel.getByText("已拒绝", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    } finally {
        const restore = await page.request.put("/api/v1/system/config", {
            data: {defaultModelId: previousConfig.defaultModelId},
        });
        expect(restore.status()).toBe(200);
        if (providerId !== null && providerVersion !== null) {
            if (modelId !== null && modelVersion !== null) {
                const modelRemoval = await page.request.delete(`/api/v1/model-providers/${providerId}/models/${modelId}`, {
                    headers: {origin: new URL(page.url()).origin, "idempotency-key": randomUUID()},
                    data: {expectedVersion: modelVersion},
                });
                expect(modelRemoval.status()).toBe(204);
            }
            const providerRemoval = await page.request.delete(`/api/v1/model-providers/${providerId}`, {
                headers: {origin: new URL(page.url()).origin, "idempotency-key": randomUUID()},
                data: {expectedVersion: providerVersion},
            });
            expect(providerRemoval.status()).toBe(204);
        }
    }
});

for (const scenario of [
    {modelId: "synthetic-story-model-at-threshold", input: 0.271999, output: 0.000002, cacheRead: 0.000004,
        total: 0.272005, outputText: "0.000002", cacheReadText: "0.000004"},
    {modelId: "synthetic-story-model-above-threshold", input: 2.72, output: 0.00002, cacheRead: 0.00004,
        total: 2.72006, outputText: "0.00002", cacheReadText: "0.00004"},
]) {
    test(`Story cache pricing uses the raw input tier for ${scenario.modelId}`, async ({page}) => {
        test.setTimeout(180_000);
        const previous = systemConfigDtoSchema.parse(await (await page.request.get("/api/v1/system/config")).json());
        let provider: {id: string; version: number} | undefined;
        let model: {id: string; version: number} | undefined;
        const headers = () => ({origin: new URL(page.url()).origin, "idempotency-key": randomUUID()});
        try {
            const source = await ingestFeed(page, `Cache pricing ${scenario.modelId}`);
            const storyId = await waitForStoryId(page, source);
            const providerResponse = await page.request.post("/api/v1/model-providers", {
                headers: headers(), data: {name: `Synthetic cache ${randomUUID()}`, api: "openai-completions",
                    baseUrl: "https://story-agent.e2e.invalid/v1", apiKey: "e2e-synthetic-key"},
            });
            expect(providerResponse.status()).toBe(201);
            provider = modelProviderSnapshotSchema.parse(await providerResponse.json());
            const modelPath = `/api/v1/model-providers/${provider.id}/models`;
            const created = await page.request.post(modelPath, {
                headers: headers(), data: {modelId: scenario.modelId, name: scenario.modelId,
                    contextWindow: 400000, maxOutputTokens: 512, currency: "CNY",
                    inputPricePerMillion: 1, outputPricePerMillion: 2,
                    cacheWritePricePerMillion: 3, cacheReadPricePerMillion: 4,
                    tieredPricingEnabled: true, tieredPricingThreshold: 272000,
                    highInputPricePerMillion: 10, highOutputPricePerMillion: 20,
                    highCacheWritePricePerMillion: 30, highCacheReadPricePerMillion: 40},
            });
            expect(created.status()).toBe(201);
            model = configuredModelSnapshotSchema.parse(await created.json());
            expect((await page.request.put("/api/v1/system/config", {data: {defaultModelId: model.id}})).status()).toBe(200);
            await openStory(page, storyId);
            const panel = page.getByRole("region", {name: "Agent 建议", exact: true});
            const endpoint = `/api/v1/stories/${encodeURIComponent(storyId)}/agent-candidates`;
            const queuedResponse = page.waitForResponse((response) => response.url().endsWith(endpoint)
                && response.request().method() === "POST");
            await panel.getByRole("button", {name: "生成建议", exact: true}).click();
            const queued = await queuedResponse;
            expect(queued.status()).toBe(202);
            const generation = storyAgentGenerationSchema.parse(await queued.json());
            const generationPath = `/api/v1/stories/${encodeURIComponent(storyId)}/agent-generations/${generation.runId}`;
            const readGeneration = async () => {
                const response = await page.request.get(generationPath);
                expect(response.status()).toBe(200);
                return storyAgentGenerationSchema.parse(await response.json());
            };
            await expect.poll(async () => (await readGeneration()).status, {timeout: 90_000}).toBe("completed");
            const completed = await readGeneration();
            const actual = completed.cost!;
            expect(actual.input).toBeCloseTo(scenario.input, 12);
            expect(actual.output).toBeCloseTo(scenario.output, 12);
            expect(actual.cacheRead).toBeCloseTo(scenario.cacheRead, 12);
            expect(actual.cacheWrite).toBe(0);
            expect(actual.total).toBeCloseTo(scenario.total, 12);
            expect(actual.currency).toBe("CNY");
            const records = async () => storyAgentCandidateRecordSchema.array()
                .parse(await (await page.request.get(endpoint)).json());
            const candidate = (await records()).find((item) => item.candidate.id === completed.candidateId)!;
            expect(candidate.candidate.cost).toEqual(actual);
            const proposal = candidate.candidate.proposal;
            if (proposal.task !== "story.summarize") throw new Error("Expected a summary candidate for cache pricing");
            const card = panel.locator("article").filter({
                has: page.getByRole("heading", {name: proposal.title, exact: true}),
            });
            await expect(card).toHaveCount(1);
            await expect(card).toContainText(`实际成本：${scenario.total} CNY`);
            await expect(card).toContainText(`输入：${scenario.input}`);
            await expect(card).toContainText(`输出：${scenario.outputText}`);
            await expect(card).toContainText(`缓存读取：${scenario.cacheReadText}`);
            await expect(card).toContainText("缓存写入：0");
            const repriced = await page.request.patch(`${modelPath}/${model.id}`, {
                headers: headers(), data: {expectedVersion: model.version,
                    inputPricePerMillion: 0, outputPricePerMillion: 0,
                    cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0, currency: "USD",
                    tieredPricingEnabled: false, tieredPricingThreshold: null,
                    highInputPricePerMillion: null, highOutputPricePerMillion: null,
                    highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null},
            });
            expect(repriced.status()).toBe(200);
            model = configuredModelSnapshotSchema.parse(await repriced.json());
            expect(model).toMatchObject({currency: "USD", tieredPricingEnabled: false});
            await page.reload();
            expect((await readGeneration()).cost).toEqual(actual);
            expect((await records()).find((item) => item.candidate.id === completed.candidateId)?.candidate.cost).toEqual(actual);
            await expect(panel.getByText(`实际成本：${scenario.total} CNY`, {exact: false})).toBeVisible();
        } finally {
            expect((await page.request.put("/api/v1/system/config", {data: {defaultModelId: previous.defaultModelId}})).status()).toBe(200);
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
}
