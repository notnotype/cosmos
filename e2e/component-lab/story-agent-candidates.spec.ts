import { expect, test } from "@playwright/test";
import { expectSinglePreview } from "../support/lab";

for (const sourceStatus of ["superseded", "unavailable"] as const) {
    for (const width of [320, 768, 1024, 1440]) {
        test(`${sourceStatus} evidence remains inspectable and rejectable at ${width}px`, async ({ page }) => {
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
            page.on("requestfailed", (request) => errors.push(request.url()));
            await page.setViewportSize({ width, height: 1000 });
            await page.goto(`/dev/components?component=story-agent-candidates&scene=interactive&viewport=${width}`);
            const preview = await expectSinglePreview(page);
            await preview.getByLabel("模拟来源证据", { exact: true }).selectOption(sourceStatus);
            await preview.getByLabel("模型连接", { exact: true }).selectOption("lab-model");
            await preview.getByRole("button", { name: "生成建议", exact: true }).click();
            await expect(preview).toContainText(sourceStatus === "superseded" ? "基于旧版内容表示" : "原输入证据暂不可用");
            await expect(preview.getByRole("button", { name: "接受建议", exact: true })).toBeDisabled();
            await preview.getByText("查看输入版本", { exact: true }).click();
            await expect(preview).toContainText("lab-old-source · 表示版本 1");
            const reject = preview.getByRole("button", { name: "拒绝建议", exact: true });
            await reject.focus();
            await expect(reject).toBeFocused();
            await page.keyboard.press("Enter");
            await expect(preview.getByText("已拒绝", { exact: true })).toBeVisible();
            await expect(preview.getByLabel("生成任务数")).toHaveText("1");
            expect(await preview.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
            expect(errors).toEqual([]);
        });
    }
}

for (const width of [320, 768, 1024, 1440]) {
    test(`candidate preview and human decision at ${width}px`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("requestfailed", (request) => errors.push(request.url()));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/dev/components?component=story-agent-candidates&scene=interactive&viewport=${width}`);
        const preview = await expectSinglePreview(page);
        await expect(preview.getByText("暂无建议。", { exact: true })).toBeVisible();
        const generate = preview.getByRole("button", { name: "生成建议", exact: true });
        await expect(generate).toBeDisabled();
        await preview.getByLabel("模型连接", { exact: true }).selectOption("lab-model");
        await generate.focus();
        await expect(generate).toBeFocused();
        await generate.press("Enter");
        await expect(preview.getByRole("heading", { name: "建议标题", exact: true })).toBeVisible();
        await expect(preview).toContainText("<script>不会执行</script>");
        await expect(preview.locator("script")).toHaveCount(0);
        await preview.getByLabel("模拟未保存编辑").check();
        await expect(preview.getByRole("button", { name: "接受建议", exact: true })).toBeDisabled();
        await expect(preview).toContainText("请先保存或取消编辑");
        await preview.getByLabel("模拟未保存编辑").uncheck();
        await preview.getByRole("button", { name: "接受建议", exact: true }).click();
        await expect(preview.getByText("已接受", { exact: true })).toBeVisible();
        await expect(preview.getByText("已刷新 Story", { exact: true })).toBeVisible();
        await expect(preview.getByRole("button", { name: "接受建议", exact: true })).toHaveCount(0);
        await generate.click();
        await preview.getByRole("button", { name: "拒绝建议", exact: true }).click();
        await expect(preview.getByText("已拒绝", { exact: true })).toBeVisible();
        expect(errors).toEqual([]);
    });
}

test("lost enqueue response replays the same intent and refresh resumes the known run", async ({ page }) => {
    await page.goto("/dev/components?component=story-agent-candidates&scene=interactive&viewport=1024");
    let preview = await expectSinglePreview(page);
    await preview.getByLabel("模拟入队响应丢失").check();
    await preview.getByLabel("模拟任务运行中").check();
    await preview.getByLabel("模型连接", { exact: true }).selectOption("lab-model");
    const generate = preview.getByRole("button", { name: "生成建议", exact: true });
    await generate.click();
    await expect(preview.getByRole("alert")).toContainText("尚未确认入队结果");
    await expect(generate).toBeDisabled();
    await expect(preview.getByLabel("生成任务数")).toHaveText("1");
    await preview.getByRole("button", { name: "恢复本次生成", exact: true }).click();
    await expect(preview).toContainText("正在生成建议");
    await expect(preview.getByLabel("生成任务数")).toHaveText("1");
    await page.reload();
    preview = await expectSinglePreview(page);
    await expect(preview.getByRole("heading", { name: "建议标题", exact: true })).toBeVisible();
    await expect(preview.getByLabel("生成任务数")).toHaveText("1");
    await preview.getByRole("button", { name: "拒绝建议", exact: true }).click();
    await expect(preview.getByText("已拒绝", { exact: true })).toBeVisible();
});

test("failed generation has no candidate and permits an explicit new request", async ({ page }) => {
    await page.goto("/dev/components?component=story-agent-candidates&scene=interactive&viewport=1024");
    const preview = await expectSinglePreview(page);
    await preview.getByLabel("模拟生成失败").check();
    await preview.getByLabel("模型连接", { exact: true }).selectOption("lab-model");
    const generate = preview.getByRole("button", { name: "生成建议", exact: true });
    await generate.click();
    await expect(preview).toContainText("生成失败或结果未确认");
    await expect(preview.getByRole("button", { name: "接受建议", exact: true })).toHaveCount(0);
    await expect(generate).toBeEnabled();
    await preview.getByLabel("模拟生成失败").uncheck();
    await generate.click();
    await expect(preview.getByRole("heading", { name: "建议标题", exact: true })).toBeVisible();
    await expect(preview.getByLabel("生成任务数")).toHaveText("2");
});

test("an unknown save receipt still refreshes committed pending candidates", async ({ page }) => {
    await page.goto("/dev/components?component=story-agent-candidates&scene=interactive&viewport=1024");
    const preview = await expectSinglePreview(page);
    await preview.getByLabel("模拟候选已保存但回执失败").check();
    await preview.getByLabel("模型连接", { exact: true }).selectOption("lab-model");
    await preview.getByRole("button", { name: "生成建议", exact: true }).click();
    await expect(preview.getByRole("heading", { name: "建议标题", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(preview).not.toContainText("未保存建议");
    await expect(preview.getByLabel("生成任务数")).toHaveText("1");
    await preview.getByRole("button", { name: "拒绝建议", exact: true }).click();
    await expect(preview.getByText("已拒绝", { exact: true })).toBeVisible();
});
