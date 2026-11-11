import {expect, test, type Locator, type Page} from "@playwright/test";

import {expectSinglePreview, latestToast} from "../support/lab";

/**
 * 模型页的浏览器验收（Task 39 E 切片）。
 *
 * 流量全部来自实验室 fixture：这条链路里没有任何真实 Provider 请求，也没有 API 服务，
 * 所以它只能证明「界面按合同渲染与交互」，不能替代真实服务验收。
 *
 * 覆盖的是 walkthrough E 切片列的验收点：桌面与平板视口、键盘可达、错误恢复常驻原因、
 * console / pageerror 为空，以及「保存不调用模型、编辑留空保留 key」这两条写入口径。
 */

const DIALOG = '[data-slot="dialog-content"]';
const PROVIDER_NAME = "我的 DeepSeek";

async function openPanel(page: Page, scene: string): Promise<Locator> {
    await page.goto(`/dev/components?component=model-provider-panel&scene=${scene}`);
    return expectSinglePreview(page);
}

/** 收集 console 错误与未捕获异常：两者都算验收失败。 */
function watchFailures(page: Page): { readonly messages: string[] } {
    const messages: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") messages.push(message.text());
    });
    page.on("pageerror", (error) => messages.push(error.message));
    return {messages};
}

test("renders a provider row with its protocol, credential state and base URL", async ({page}) => {
    const failures = watchFailures(page);
    const preview = await openPanel(page, "populated");

    const row = preview.locator("li", {hasText: PROVIDER_NAME});
    await expect(row).toContainText(PROVIDER_NAME);
    // 协议与凭证状态都用徽章写明，避免用户靠地址猜它走哪种请求体。
    await expect(row).toContainText("OpenAI Chat Completions");
    await expect(row).toContainText("已保存凭证");
    await expect(row.locator("code")).toHaveText("https://api.deepseek.example/v1");
    await expect(row.getByRole("button", {name: `编辑 ${PROVIDER_NAME}`})).toBeVisible();
    await expect(row.getByRole("button", {name: `删除服务商 ${PROVIDER_NAME}`})).toBeVisible();

    expect(failures.messages).toEqual([]);
});

test("expands a provider into its models and its manual draft row", async ({page}) => {
    const failures = watchFailures(page);
    const preview = await openPanel(page, "populated");
    const row = preview.locator("li", {hasText: PROVIDER_NAME});

    // 展开前不请求模型列表：十个服务商同时展开会连打十次读接口。
    await expect(row.getByRole("heading", {name: "模型"})).toHaveCount(0);
    await row.getByRole("button", {name: `展开「${PROVIDER_NAME}」的模型`}).click();

    await expect(row.getByRole("button", {name: `收起「${PROVIDER_NAME}」的模型`})).toBeVisible();
    await expect(row).toContainText("DeepSeek Chat");
    await expect(row).toContainText("deepseek-chat");
    await expect(row).toContainText("65536 / 8192");

    // 录入行仍是「一行一个模型」，预算是 placeholder 而不是预填值——留空即提交默认值。
    const draftId = row.locator('input[id^="model-id-provider-deepseek-"]');
    await expect(draftId).toHaveCount(1);
    await expect(draftId).toHaveValue("");
    const context = row.locator('input[id^="model-context-provider-deepseek-"]');
    await expect(context).toHaveAttribute("placeholder", "262144");
    await expect(context).toHaveValue("");
    await expect(row.locator('input[id^="model-output-provider-deepseek-"]'))
        .toHaveAttribute("placeholder", "32768");
    await expect(row).toContainText("预算字段留空就按输入框里的默认值提交，可按上游实际能力改小。");

    await row.getByRole("button", {name: "再加一行"}).click();
    await expect(row.locator('input[id^="model-id-provider-deepseek-"]')).toHaveCount(2);

    expect(failures.messages).toEqual([]);
});

test("creating a provider never persists the key in the form after closing", async ({page}) => {
    const failures = watchFailures(page);
    const preview = await openPanel(page, "populated");
    const dialog = page.locator(DIALOG);

    await preview.getByRole("button", {name: "添加服务商"}).click();
    await expect(dialog).toBeVisible();
    // 明写「保存不调用模型」：录制 key 时不外呼，用户才敢在这里填。
    await expect(dialog).toContainText("保存不调用模型");
    const key = dialog.locator("#provider-api-key");
    await expect(key).toHaveAttribute("type", "password");

    await dialog.locator("#provider-name").fill("草稿服务商");
    await dialog.locator("#provider-base-url").fill("https://draft.example/v1");
    await key.fill("sk-synthetic-draft");
    await expect(key).toHaveValue("sk-synthetic-draft");

    await dialog.getByRole("button", {name: "取消"}).click();
    await expect(dialog).toHaveCount(0);

    // 重新打开是全新的表单：key 不留在任何 DOM 里。
    await preview.getByRole("button", {name: "添加服务商"}).click();
    await expect(dialog.locator("#provider-api-key")).toHaveValue("");
    await expect(dialog.locator("#provider-name")).toHaveValue("");
    await expect(dialog.locator("#provider-base-url")).toHaveValue("");
    await expect(page.locator('input[value="sk-synthetic-draft"]')).toHaveCount(0);

    expect(failures.messages).toEqual([]);
});

test("editing preserves the saved key when the field is left blank", async ({page}) => {
    const failures = watchFailures(page);
    const preview = await openPanel(page, "populated");
    const dialog = page.locator(DIALOG);

    await preview.getByRole("button", {name: `编辑 ${PROVIDER_NAME}`}).click();
    await expect(dialog).toBeVisible();
    // 已保存的 key 读不出来，所以空白只能解释成「保留」，否则会静默删掉凭证。
    await expect(dialog).toContainText("留空表示保留已保存的 Key");
    await expect(dialog.locator("#provider-api-key")).toHaveValue("");
    await expect(dialog.locator("#provider-name")).toHaveValue(PROVIDER_NAME);
    await expect(dialog.locator("#provider-base-url")).toHaveValue("https://api.deepseek.example/v1");

    expect(failures.messages).toEqual([]);
});

test("picking discovery candidates appends them to the draft rows", async ({page}) => {
    const failures = watchFailures(page);
    const preview = await openPanel(page, "populated");
    const row = preview.locator("li", {hasText: PROVIDER_NAME});
    const dialog = page.locator(DIALOG);

    await row.getByRole("button", {name: `展开「${PROVIDER_NAME}」的模型`}).click();
    await row.getByRole("button", {name: "获取模型列表"}).click();

    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("选择要添加的模型");
    const candidates = dialog.getByTestId("discovery-candidates");
    await expect(candidates.locator("li")).toHaveCount(3);

    // 已配置的候选仍然显示（藏掉会让人以为上游没这个模型），但不可勾选。
    const configured = candidates.locator("li", {hasText: "deepseek-chat"});
    await expect(configured.locator("input")).toBeDisabled();
    await expect(configured).toContainText("已添加");
    const available = candidates.locator("li", {hasText: "deepseek-coder"});
    await expect(available.locator("input")).toBeEnabled();

    // 一个都没勾时不能保存。
    await expect(dialog.getByRole("button", {name: "保存"})).toBeDisabled();
    await available.locator("input").check();
    await expect(dialog).toContainText("已选 1 个");
    await dialog.getByRole("button", {name: "保存"}).click();

    await expect(dialog).toHaveCount(0);
    await expect(row).toContainText("已把 1 个模型追加到录入表单。");
    // 追加是「填满空行再新建」，不覆盖已填内容，也不留下一行空白。
    const ids = row.locator('input[id^="model-id-provider-deepseek-"]');
    await expect(ids).toHaveCount(1);
    await expect(ids.first()).toHaveValue("deepseek-coder");
    await expect(row.locator('input[id^="model-name-provider-deepseek-"]').first()).toHaveValue("DeepSeek Coder");

    expect(failures.messages).toEqual([]);
});

test("a refused delete keeps its reason on the page instead of a disappearing toast", async ({page}) => {
    const failures = watchFailures(page);
    const preview = await openPanel(page, "conflict");
    const alertDialog = page.locator('[data-slot="alert-dialog-content"]');

    await preview.getByRole("button", {name: `删除服务商 ${PROVIDER_NAME}`}).click();
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog).toContainText(`删除「${PROVIDER_NAME}」？`);
    await expect(alertDialog).toContainText("会一并删除它的模型和已保存的 API Key");

    // 取消不删：服务商还在列表里。
    await alertDialog.getByRole("button", {name: "取消"}).click();
    await expect(alertDialog).toHaveCount(0);
    await expect(preview.locator("li", {hasText: PROVIDER_NAME})).toHaveCount(1);

    await preview.getByRole("button", {name: `删除服务商 ${PROVIDER_NAME}`}).click();
    await alertDialog.getByRole("button", {name: "删除"}).click();

    // 默认模型引用会拒绝删除，原因必须常驻，用户才能去设置页更换或清除。
    await expect(alertDialog).toHaveCount(0);
    await expect(preview.getByRole("alert")).toContainText("这个模型仍是系统默认模型，请先到设置页更换或清除默认模型再删。");
    await expect(preview.getByRole("alert")).toContainText("系统默认模型仍指向它");
    await expect(preview.locator("li", {hasText: PROVIDER_NAME})).toHaveCount(1);

    expect(failures.messages).toEqual([]);
});

test("deleting a provider that is free of references confirms through a toast", async ({page}) => {
    const failures = watchFailures(page);
    const preview = await openPanel(page, "populated");
    const alertDialog = page.locator('[data-slot="alert-dialog-content"]');

    await preview.getByRole("button", {name: `删除服务商 ${PROVIDER_NAME}`}).click();
    await alertDialog.getByRole("button", {name: "删除"}).click();

    // 删除成功的回执走 toast（latestToast 是异步取「最新一条」的位置）。
    await expect(await latestToast(page)).toContainText("已删除服务商。");
    await expect(preview.getByRole("alert")).toHaveCount(0);

    expect(failures.messages).toEqual([]);
});

test("the empty scene explains what to do first", async ({page}) => {
    const failures = watchFailures(page);
    const preview = await openPanel(page, "empty");

    await expect(preview).toContainText("还没有配置服务商。先添加一个，再为它录入或发现模型。");
    await expect(preview.getByRole("button", {name: "添加服务商"})).toBeVisible();

    expect(failures.messages).toEqual([]);
});

test("the editor and the discovery dialog are reachable and closable by keyboard", async ({page}) => {
    const failures = watchFailures(page);
    const preview = await openPanel(page, "populated");
    const dialog = page.locator(DIALOG);

    const addButton = preview.getByRole("button", {name: "添加服务商"});
    await addButton.focus();
    await expect(addButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    // 焦点进了对话框（Base UI 负责陷阱），Esc 关掉后必须回到打开它的按钮。
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(addButton).toBeFocused();

    const row = preview.locator("li", {hasText: PROVIDER_NAME});
    await row.getByRole("button", {name: `展开「${PROVIDER_NAME}」的模型`}).click();
    await row.getByRole("button", {name: "获取模型列表"}).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // 这里不断言焦点落回触发按钮：读取期间的「正在读取上游模型列表…」会把它短暂禁用，
    // 禁用元素不能持有焦点，恢复目标并不稳定。稳定的不变量是「焦点没被困进已卸载的对话框」：
    // 再按一次 Tab，焦点必须落在页面内的可聚焦元素上，而不是掉回 body。
    await page.keyboard.press("Tab");
    const focusTrapped = await page.evaluate(() => {
        const active = document.activeElement;
        return active === null || active === document.body || document.querySelector('[data-slot="dialog-content"]') !== null;
    });
    expect(focusTrapped).toBe(false);

    expect(failures.messages).toEqual([]);
});

test("the panel stays usable at the tablet viewport", async ({page}) => {
    // 1024 px 是 (shell) 的断点；模型页在平板上仍要能展开与录入。
    await page.setViewportSize({width: 1024, height: 768});
    const failures = watchFailures(page);
    const preview = await openPanel(page, "populated");

    const row = preview.locator("li", {hasText: PROVIDER_NAME});
    await row.getByRole("button", {name: `展开「${PROVIDER_NAME}」的模型`}).click();
    await expect(row.locator('input[id^="model-id-provider-deepseek-"]')).toBeVisible();
    await expect(row.getByRole("button", {name: "全部添加"})).toBeVisible();

    // 录入行的两个预算输入在窄屏仍然并排可读（没有被压成 0 宽）。
    const context = row.locator('input[id^="model-context-provider-deepseek-"]');
    const box = await context.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(80);

    expect(failures.messages).toEqual([]);
});


test("clears the default model only after confirmation", async ({page}) => {
    const failures = watchFailures(page);
    await page.goto("/dev/components?component=default-model-panel");
    const preview = await expectSinglePreview(page);
    const selector = preview.getByRole("combobox", {name: "默认模型"});

    await expect(selector).toHaveValue("model-chat");
    await selector.selectOption("");
    await preview.getByRole("button", {name: "保存"}).click();

    const dialog = page.locator('[data-slot="alert-dialog-content"]');
    await expect(dialog).toContainText("清除默认模型？");
    await expect(dialog).toContainText("未指定模型的 Story 生成将无法运行");
    await dialog.getByRole("button", {name: "取消"}).click();
    await expect(dialog).toHaveCount(0);
    await expect(selector).toHaveValue("");

    await preview.getByRole("button", {name: "保存"}).click();
    await page.locator('[data-slot="alert-dialog-content"]')
        .getByRole("button", {name: "确认清除"}).click();
    await expect(preview.getByRole("status")).toContainText("已保存");
    await expect(preview.getByRole("region", {name: "当前默认模型"})).toContainText("未设置");
    expect(failures.messages).toEqual([]);
});
