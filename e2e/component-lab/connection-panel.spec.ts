import {expect, test, type Page} from "@playwright/test";

import {expectSinglePreview} from "../support/lab";

const PREVIEW_ROOT = "[data-component-lab-preview]";

/**
 * 收集浏览器侧的错误：控制台 error 与未捕获异常。模型选择是纯前端交互，任何一条都说明
 * 渲染或事件路径坏了（例如弹层里留了已卸载节点的引用）。
 */
function watchFailures(page: Page) {
    const messages: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") messages.push(message.text());
    });
    page.on("pageerror", (error) => messages.push(error.message));
    return {messages};
}

/**
 * AUT-009 的连接可见性在实验室场景里的渲染验收：授权范围与失效原因两行、两种状态各自的
 * 动作入口，以及「标记失效」的内联原因输入。真实写入与状态翻转在浏览器产品 E2E 里验。
 */
test("renders the authorized scope and failure reason of the connection scene", async ({page}) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("/dev/components?component=connection-panel&scene=populated");
    const preview = page.locator(PREVIEW_ROOT);
    await expect(preview).toBeVisible();

    const active = preview.locator("li", { hasText: "我的 Bilibili 主账号" });
    await expect(active).toContainText("授权范围");
    // 授权范围按「键: 值」渲染，而不是把 JSON 原文丢给用户。
    await expect(active).toContainText("read: true · comment: false");
    await expect(active).toContainText("失效原因");
    await expect(active).toContainText("未记录");
    await expect(active.getByRole("button", { name: "标记失效 我的 Bilibili 主账号" })).toBeVisible();

    // 失效中的连接显示原因，动作入口换成「恢复可用」。
    const failed = preview.locator("li", { hasText: "示例站登录态" });
    await expect(failed).toContainText("登录态已过期");
    await expect(failed.getByRole("button", { name: "恢复可用 示例站登录态" })).toBeVisible();

    // 标记失效：内联输入在确认前不可提交，提交后收起。
    await active.getByRole("button", { name: "标记失效 我的 Bilibili 主账号" }).click();
    const reason = active.getByLabel("失效原因 我的 Bilibili 主账号");
    await expect(reason).toBeVisible();
    const confirm = active.getByRole("button", { name: "确认标记失效" });
    await expect(confirm).toBeDisabled();
    await reason.fill("登录态已过期");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(reason).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
});

/**
 * 授权范围输入必须是合法 JSON：非法输入在本地就被拦下，不发请求也不清空表单。
 */
test("rejects a non-JSON authorized scope before creating the connection", async ({page}) => {
    await page.goto("/dev/components?component=connection-panel&scene=populated");
    const preview = page.locator(PREVIEW_ROOT);
    await expect(preview).toBeVisible();

    // 创建表单在模态框里（Task 37 切片 1）：模态框 portal 到 body，脱离 preview 根，
    // 所以从 dialog 定位（而不是 preview），也避免与页面其它 alert 撞车。
    const dialog = page.locator('[data-slot="dialog-content"]');
    await page.getByRole("button", { name: "新建账号" }).click();
    await dialog.getByLabel("连接名称").fill("范围格式用例");
    await dialog.getByLabel("连接授权范围").fill("{read: true}");
    await dialog.getByRole("button", { name: "保存账号" }).click();

    await expect(dialog.getByRole("alert")).toContainText("授权范围必须是合法 JSON");
    // 表单没有被清空：用户不必重新输入名称。
    await expect(dialog.getByLabel("连接名称")).toHaveValue("范围格式用例");
});

/**
 * 适配器配置同样必须是合法 JSON（Proposal connection-login-lifecycle-v1 决定 1）：
 * Bilibili 的 OpenCLI profile 就是从这里进的连接，非法输入在本地拦下。
 */
test("rejects a non-JSON adapter configuration before creating the connection", async ({page}) => {
    await page.goto("/dev/components?component=connection-panel&scene=populated");
    const preview = page.locator(PREVIEW_ROOT);
    await expect(preview).toBeVisible();

    const dialog = page.locator('[data-slot="dialog-content"]');
    await page.getByRole("button", { name: "新建账号" }).click();
    await dialog.getByLabel("连接名称").fill("适配器配置格式用例");
    await dialog.getByLabel("连接适配器配置").fill("{profile: chrome-main}");
    await dialog.getByRole("button", { name: "保存账号" }).click();

    await expect(dialog.getByRole("alert")).toContainText("适配器配置必须是合法 JSON");
    await expect(dialog.getByLabel("连接名称")).toHaveValue("适配器配置格式用例");
});

/**
 * 登录探测入口按 manifest 声明出现（Proposal connection-login-lifecycle-v1 决定 2）：
 * 夹具里只有 bilibili 声明 `auth.probeSupported`，探测返回一条「已登录」结论，面板把它
 * 显示成可读文本并把结论写回连接（状态徽标与检查时间都来自系统观测）。
 */
test("probes the connection login state and shows the conclusion", async ({page}) => {
    await page.goto("/dev/components?component=connection-panel&scene=populated");
    const preview = page.locator(PREVIEW_ROOT);
    await expect(preview).toBeVisible();

    const row = preview.locator("li", { hasText: "我的 Bilibili 主账号" });
    await expect(row).toContainText("上次检查");
    await row.getByRole("button", { name: "检查登录状态 我的 Bilibili 主账号" }).click();

    await expect(row.getByRole("status")).toContainText("登录状态正常：example");
});

/*
 * 外部平台账号的认证信息仍附着在连接上；模型凭证则在模型服务商页管理。
 * 这里覆盖二者分离后的可见合同，不再访问已移除的 `scene=model`。
 */
test("keeps external account details without exposing model controls", async ({page}) => {
    const failures = watchFailures(page);
    await page.goto("/dev/components?component=connection-panel&scene=populated");
    const preview = await expectSinglePreview(page);

    const account = preview.locator("li", {hasText: "我的 Bilibili 主账号"});
    await expect(account).toBeVisible();
    await expect(account).toContainText("授权范围");
    await expect(account).toContainText("read: true · comment: false");
    await expect(account).toContainText("example");
    await expect(account.locator("dt").filter({hasText: "模型"})).toHaveCount(0);
    await expect(account.getByRole("button", {name: /^选择模型 /})).toHaveCount(0);
    expect(failures.messages).toEqual([]);
});
