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
            await expect(preview.getByLabel("模型连接", { exact: true })).toHaveCount(0);
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
        await expect(generate).toBeEnabled();
        await expect(preview.getByLabel("模型连接", { exact: true })).toHaveCount(0);
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
    await expect(preview.getByLabel("模型连接", { exact: true })).toHaveCount(0);
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
    await expect(preview.getByLabel("模型连接", { exact: true })).toHaveCount(0);
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

for (const {mode, text} of [
    {mode: "known", text: "实际成本：0.46 USD（输入：0.12，输出：0.34）"},
    {mode: "zero", text: "实际成本：0 USD（输入：0，输出：0）"},
    {mode: "missing", text: null},
] as const) {
    test(`candidate actual cost displays ${mode} amount`, async ({page}) => {
        await page.goto("/dev/components?component=story-agent-candidates&scene=interactive&viewport=1024");
        const preview = await expectSinglePreview(page);
        await expect(preview.getByLabel("模型连接", {exact: true})).toHaveCount(0);
        await preview.getByLabel("模拟实际成本", {exact: true}).selectOption(mode);
        await preview.getByRole("button", {name: "生成建议", exact: true}).click();
        const candidate = preview.locator("article");
        await expect(candidate.getByRole("heading", {name: "建议标题", exact: true})).toBeVisible();
        if (text === null) {
            await expect(candidate.getByText("实际成本", {exact: false})).toHaveCount(0);
        } else {
            await expect(candidate.getByText(text, {exact: true})).toBeVisible();
            await expect(candidate).toContainText("按本次调用用量和调用时配置价格计算，非服务商结算账单。");
        }
    });
}
