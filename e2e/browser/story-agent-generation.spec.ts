import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { configuredModelSnapshotSchema, connectionInstanceSchema, modelProviderSnapshotSchema,
    storyAgentGenerationRequestSchema, storyAgentGenerationSchema, storyDetailSchema } from "@cosmos/contracts";
import { ingestFeed, openStory, waitForStoryId } from "../support/story-flow";

test("Story generation uses the product queue and Worker before a human accepts or rejects", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", (request) => errors.push(`${request.method()} ${request.url()}`));
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
    const modelResponse = await page.request.post(`/api/v1/model-providers/${provider.id}/models`, {
        headers: headers(), data: { modelId: "synthetic-story-model", name: "Synthetic Story Model",
            contextWindow: 4096, maxOutputTokens: 512 },
    });
    expect(modelResponse.status()).toBe(201);
    const model = configuredModelSnapshotSchema.parse(await modelResponse.json());
    const connectionResponse = await page.request.post("/api/v1/connections", {
        headers: headers(), data: { name: "Synthetic Story Connection", connectorId: "cosmos.agent", modelId: model.id },
    });
    expect(connectionResponse.status()).toBe(201);
    const connection = connectionInstanceSchema.parse(await connectionResponse.json());
    const detail = async () => storyDetailSchema.parse(await (await page.request.get(`/api/v1/stories/${storyId}`)).json());
    const before = await detail();
    await openStory(page, storyId);
    const panel = page.getByRole("region", { name: "Agent 建议", exact: true });
    const generate = panel.getByRole("button", { name: "生成建议", exact: true });
    await expect(generate).toBeDisabled();
    await panel.getByLabel("模型连接", { exact: true }).selectOption(connection.id);
    const endpoint = `/api/v1/stories/${encodeURIComponent(storyId)}/agent-candidates`;
    const queuedResponse = page.waitForResponse((response) => response.url().endsWith(endpoint)
        && response.request().method() === "POST", { timeout: 15_000 });
    await generate.click();
    const queued = await queuedResponse;
    expect(queued.status()).toBe(202);
    const generation = storyAgentGenerationSchema.parse(await queued.json());
    const intent = storyAgentGenerationRequestSchema.parse(queued.request().postDataJSON());
    expect(intent).toEqual({ task: "story.summarize", connectionId: connection.id });
    await expect(panel.getByRole("heading", { name: "Synthetic generated title 1", exact: true })).toBeVisible();
    expect((await detail()).story.revisionId).toBe(before.story.revisionId);
    const replay = await page.request.post(endpoint, { headers: { origin,
        "idempotency-key": queued.request().headers()["idempotency-key"]! }, data: intent });
    expect(replay.status()).toBe(202);
    expect(storyAgentGenerationSchema.parse(await replay.json())).toMatchObject({
        runId: generation.runId, status: "completed", candidateId: `story-candidate-${generation.runId}`,
    });
    await panel.getByRole("button", { name: "接受建议", exact: true }).click();
    await expect(panel.getByText("已接受", { exact: true })).toBeVisible();
    await expect.poll(async () => (await detail()).story.summary).toBe("Isolated model summary 1");
    const accepted = await detail();
    await panel.getByLabel("模型连接", { exact: true }).selectOption(connection.id);
    await panel.getByLabel("允许读取此 Story 的来源正文", { exact: true }).check();
    await generate.click();
    await expect(panel.getByRole("heading", { name: "Synthetic generated title 2", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "拒绝建议", exact: true }).click();
    await expect(panel.getByText("已拒绝", { exact: true })).toBeVisible();
    expect((await detail()).story.revisionId).toBe(accepted.story.revisionId);
    await page.reload();
    await expect(panel.getByText("已接受", { exact: true })).toBeVisible();
    await expect(panel.getByText("已拒绝", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
});
