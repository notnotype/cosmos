import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ingestFeed, openStory, waitForStoryId } from "../support/story-flow";

const failureCases = [
    { code: "timeout", message: "本次生成超出允许时限。调整 Story Agent 超时时间后可以重试。" },
    { code: "authentication_required", message: "模型服务需要有效凭证，请检查默认模型的服务商凭证后重试。" },
    { code: "rate_limited", message: "模型服务暂时繁忙，请稍后重试。" },
    { code: "budget_exhausted", message: "本次请求超出模型可处理的预算，请检查模型及请求内容后重试。" },
    { code: "invalid_configuration", message: "模型配置无效，请检查默认模型设置后重试。" },
    { code: "dependency_unavailable", message: "模型服务暂时不可用，请稍后重试或检查服务商状态。" },
    { code: "malformed_payload", message: "模型返回的结果无法使用，请尝试更换模型后重新生成。" },
] as const;

const privateDetail = "SYNTHETIC_PRIVATE_PROVIDER_DETAIL_DO_NOT_RENDER";

test("Story Agent failure statuses render safe copy in the real Story panel", async ({ page }) => {
    test.setTimeout(180_000);
    const sourceName = await ingestFeed(page, "Story Agent safe error copy");
    const storyId = await waitForStoryId(page, sourceName);
    const responses = new Map<string, { status: "failed" | "cancelled"; errorCode: string | null; detail?: string }>();
    const intercepted: string[] = [];

    await page.route("**/api/v1/system/config", async (route) => {
        if (route.request().method() !== "GET") {
            await route.continue();
            return;
        }
        intercepted.push("config");
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
            defaultModelId: null,
            defaultModel: null,
            storyAgentTimeoutSeconds: 600,
        }) });
    });
    await page.route("**/api/v1/stories/*/agent-generations/*", async (route) => {
        if (route.request().method() !== "GET") {
            await route.continue();
            return;
        }
        const runId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1)!);
        const result = responses.get(runId);
        if (!result) {
            await route.continue();
            return;
        }
        intercepted.push(`generation:${runId}`);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
            runId,
            storyId,
            task: "story.summarize",
            status: result.status,
            candidateId: null,
            errorCode: result.errorCode,
            ...(result.detail ? { detail: result.detail } : {}),
        }) });
    });

    await openStory(page, storyId);
    const panel = page.getByRole("region", { name: "Agent 建议", exact: true });
    const alert = panel.getByRole("alert");
    const status = panel.getByRole("status");
    const storageKey = `cosmos.story-generation.v1:${encodeURIComponent(storyId)}`;

    for (const scenario of failureCases) {
        const runId = `synthetic-${scenario.code}-${randomUUID()}`;
        responses.set(runId, { status: "failed", errorCode: scenario.code });
        await page.evaluate(({ storageKey: key, runId: id }) => {
            sessionStorage.setItem(key, JSON.stringify({
                version: 1,
                key: `synthetic-idempotency-${id}`,
                request: { task: "story.summarize" },
                runId: id,
            }));
        }, { storageKey, runId });
        await page.reload();
        await expect(alert).toContainText(scenario.message);
        await expect(status).toHaveCount(0);
        if (scenario.code === "timeout") {
            await expect(alert).not.toContainText(/\b(?:300|420|600)\s*(?:秒|seconds?)\b/u);
        }
    }

    const cancelledRunId = `synthetic-cancelled-${randomUUID()}`;
    responses.set(cancelledRunId, { status: "cancelled", errorCode: null });
    await page.evaluate(({ storageKey: key, runId: id }) => {
        sessionStorage.setItem(key, JSON.stringify({
            version: 1,
            key: `synthetic-idempotency-${id}`,
            request: { task: "story.summarize" },
            runId: id,
        }));
    }, { storageKey, runId: cancelledRunId });
    await page.reload();
    await expect(status.filter({ hasText: "生成任务已取消" })).toBeVisible();
    await expect(alert).toHaveCount(0);

    const unknownRunId = `synthetic-unknown-${randomUUID()}`;
    responses.set(unknownRunId, {
        status: "failed",
        errorCode: "unknown_provider_code",
        detail: privateDetail,
    });
    await page.evaluate(({ storageKey: key, runId: id }) => {
        sessionStorage.setItem(key, JSON.stringify({
            version: 1,
            key: `synthetic-idempotency-${id}`,
            request: { task: "story.summarize" },
            runId: id,
        }));
    }, { storageKey, runId: unknownRunId });
    await page.reload();
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("生成未能完成，请检查设置或稍后重试。");
    await expect(page.getByText(privateDetail, { exact: false })).toHaveCount(0);
    await expect(page.getByText("unknown_provider_code", { exact: true })).toHaveCount(0);
    expect(intercepted).toContain("config");
    expect(intercepted).toContain(`generation:${unknownRunId}`);
});
