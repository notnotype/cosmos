import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { expandEditSurface } from "../support/story-flow";

const FEED_URL = "http://127.0.0.1:4380/feed.xml";

/**
 * 右栏最小宽度（维护者 2026-10-03）。与 `story-reading.tsx` 的
 * `grid-cols-[minmax(0,3fr)_minmax(240px,1fr)]` 同步。
 */
const ACTION_COLUMN_MIN_WIDTH_PX = 240;

/**
 * Story 阅读页的真实数据验收（ADR-0029 决策 7）。
 *
 * 这一条同时承担两件事：
 * - 读：标题衬线、正文 16px/1.8、正文撑满左栏（2026-10-03 起不再限 34em），只读区块与来源标记都在；
 * - 写：切片 3e 把抽屉删掉后，编辑与关联面必须**在阅读页可达**（改标题与关键事实、归并、
 *   拆分、打标签、写批注、加入话题、关联 Entity），否则「Story 的唯一可写入口」就只是句话。
 *
 * 版面本身（两栏比例、整组宽度与居中）由 Task 36 切片 A 改成左内容 / 右操作编辑，
 * 2026-10-03 又把比例改成 3:1、整组宽度改成视口 80%，断言在同一条用例里，
 * 本文件的其余断言只守「读得到的在、写得进的在」。
 */

/** 每个场景自建来源并触发录入，不依赖其它 spec 留下的数据。 */
async function ingestFeed(page: import("@playwright/test").Page, prefix: string): Promise<string> {
    const sourceName = `${prefix}-${randomUUID().slice(0, 8)}`;
    await page.goto("/automation");
    await expect(page.getByRole("heading", { name: "自动化", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "新建来源" }).click();
    await page.getByLabel("名称", { exact: true }).fill(sourceName);
    await page.getByLabel("Feed URL").fill(FEED_URL);
    await page.getByRole("button", { name: "保存计划" }).click();
    await expect(page.getByText("采集计划已保存，当前为停用状态")).toBeVisible();

    const planSection = page.getByRole("region", { name: "采集计划" }).or(page.locator("section").filter({ hasText: "采集计划" })).first();
    await planSection.getByRole("button", { name: `启用 ${sourceName}`, exact: true }).click();
    await expect(page.getByText("已启用；可执行手动录入")).toBeVisible();
    await planSection.getByRole("button", { name: `立即抓取 ${sourceName}`, exact: true }).click();
    await expect(page.getByText("录入任务已排队", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    return sourceName;
}

/** 等这一条来源的 Story 真的落库：读取侧与录入是两条路径，读不到就再等一会儿。 */
async function waitForStoryId(page: import("@playwright/test").Page, sourceName: string): Promise<string> {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
        const response = await page.request.get("/api/v1/feed?limit=20");
        if (response.ok()) {
            const body = await response.json() as { items?: { storyId: string; sourceName: string }[] };
            const match = body.items?.find((item) => item.sourceName === sourceName);
            if (match !== undefined) {
                return match.storyId;
            }
        }
        await page.waitForTimeout(2_000);
    }
    throw new Error(`等待 Story 落库超时：${sourceName}`);
}

test("reads a Story at its own URL and reaches the edit surface there", async ({ page }) => {
    test.setTimeout(300_000);
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    const storyRequests: string[] = [];
    page.on("request", (request) => {
        storyRequests.push(request.url());
    });

    const sourceName = await ingestFeed(page, "Story 阅读验收来源");
    const storyId = await waitForStoryId(page, sourceName);

    /*
     * 自己把「关联动作」的前置备齐：编辑面的「加入 Topic」与「关联已有 Entity」区块只在
     * **已有对象**时渲染（`topic-join.tsx` 的 `topics.length > 0`、`link-entity.tsx` 的
     * `entityOptions.length > 0` 守卫），依赖别的 spec 先建对象会让这条用例在单独运行时假红。
     * 创建都走对象页，正是 ADR-0029 决策 1 的分工。
     */
    const topicTitle = `阅读验收话题-${randomUUID().slice(0, 8)}`;
    await page.goto("/topics");
    await page.getByLabel("新话题标题").fill(topicTitle);
    await page.getByLabel("关注目的").fill("给阅读页的关联动作备一个可加入的话题。");
    await page.getByRole("button", { name: "新建话题", exact: true }).click();
    await expect(page.getByText(`已创建话题「${topicTitle}」`)).toBeVisible();

    const entityName = `阅读验收实体-${randomUUID().slice(0, 8)}`;
    await page.goto("/entities");
    await page.getByLabel("新 Entity 名称").fill(entityName);
    await page.getByRole("button", { name: "新建 Entity", exact: true }).click();
    await expect(page.getByText(`已创建 Entity「${entityName}」`)).toBeVisible();

    // id 含冒号，路由段必须编码：不编码会让 Next 把 id 截断。
    await page.goto(`/stories/${encodeURIComponent(storyId)}`);
    const title = page.locator("[data-story-id]");
    await expect(title).toBeVisible();
    await expect(page.getByRole("link", { name: "← 返回" })).toBeVisible();

    /*
     * 取数次数门禁：阅读页的挂载 effect 依赖 `openStory`，而它一旦不是身份稳定的
     * （`useStoryWorkspace` 里必须 `useCallback`），effect 会每渲染重跑 → `setStory` → 再渲染，
     * 形成自激取数循环。实测过：3 秒内对同一条 Story 发了 349 次请求，页内跳转与提交后的重读
     * 全被拖住。这里把「一条 Story 只读几次」变成断言，防止再犯。
     * 计数从**进入阅读页那一刻**开始（上面那些请求属于录入前置，不该算进来）。
     */
    storyRequests.length = 0;
    await page.goto(`/stories/${encodeURIComponent(storyId)}`);
    await expect(title).toBeVisible();
    const storyReads = storyRequests.filter((url) => url.includes("/api/v1/stories/"));
    expect(storyReads.length, `阅读页对同一条 Story 取了 ${storyReads.length} 次`).toBeLessThanOrEqual(8);

    /*
     * 版面（维护者 2026-10-03 裁定，取代切片 A 的「3:2 + 整组限宽 ≈931 px」）：
     * 整组宽 = 视口 80%、居中；左右两栏宽比 3:1。右栏另有 240 px 下限（同一天追加）：
     * 按 3:1 算 1024 px 窗口下右栏只剩 199 px，表单被压坏，所以窄档允许整组略超 80%。
     * 三档断点都量一遍——用 `vw` 表达宽度就是为了让这些约束在整档宽度内都成立。
     */
    const columns = page.locator('[data-story-columns="true"]');
    await expect(columns).toBeVisible();
    for (const width of [1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const measured = await columns.evaluate((element) => {
            const content = element.querySelector('[data-story-column="content"]');
            const actions = element.querySelector('[data-story-column="actions"]');
            const box = element.getBoundingClientRect();
            return {
                content: content?.getBoundingClientRect().width ?? 0,
                actions: actions?.getBoundingClientRect().width ?? 0,
                container: box.width,
                left: box.left,
                viewport: window.innerWidth,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
        });
        expect(measured.actions).toBeGreaterThan(0);
        // 3:1 只在右栏够宽、下限不生效时成立；下限生效时右栏必须**不小于** 240 px。
        if (measured.actions > ACTION_COLUMN_MIN_WIDTH_PX + 1) {
            expect(Math.abs(measured.container / measured.viewport - 0.8), `${width}px 下整组宽度不是视口的 80%`)
                .toBeLessThanOrEqual(0.01);
            const ratio = measured.content / measured.actions;
            expect(ratio, `${width}px 下两栏比例 ${ratio.toFixed(2)} 不是 3:1`).toBeGreaterThan(2.9);
            expect(ratio).toBeLessThan(3.2);
        } else {
            expect(measured.actions, `${width}px 下右栏窄于最小宽度`)
                .toBeGreaterThanOrEqual(ACTION_COLUMN_MIN_WIDTH_PX);
        }
        // 居中：两侧留白相等（±2px）——下限生效时整组只是变宽，仍然居中。
        const sideGap = (measured.viewport - measured.container) / 2;
        expect(Math.abs(measured.left - sideGap), `${width}px 下整组没有居中`).toBeLessThanOrEqual(2);
        expect(measured.overflow, `${width}px 下阅读页出现横向溢出`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    const titleFont = await title.evaluate((element) => getComputedStyle(element).fontFamily);
    expect(titleFont.toLowerCase()).toContain("charter");
    // 正文块必须存在：取不到就断言失败，而不是把这一段整块跳过（曾经用 `if (count > 0)` 包着，
    // 元素消失时用例照样绿）。
    const body = page.locator("article").first().locator('[data-content-block="paragraph"] > p').first();
    await expect(body).toBeVisible();
    const metrics = await body.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            width: element.getBoundingClientRect().width,
        };
    });
    expect(metrics.fontSize).toBe("16px");
    expect(Number.parseFloat(metrics.lineHeight) / Number.parseFloat(metrics.fontSize)).toBeCloseTo(1.8, 1);
    /*
     * 正文撑满左栏，不再限 34em（V4 那条行宽合同 2026-10-03 一并废止）。
     * 断言写「正文与左栏等宽」而不是给一个新像素上限：上限是随手可改的数字，
     * 「撑满」才是这一轮真正引入的合同。卡片内边距两侧各 32px。
     */
    const contentWidth = await page.locator('[data-story-column="content"]')
        .evaluate((element) => element.getBoundingClientRect().width);
    expect(Math.abs(metrics.width - (contentWidth - 64))).toBeLessThanOrEqual(2);

    // 只读区块的锚点是既有浏览器验收依赖的合同，删页时不能顺手丢掉。
    await expect(page.locator('[data-story-key-facts="true"]')).toBeVisible();
    await expect(page.locator('[data-story-member-id]').first()).toBeVisible();
    await expect(page.locator('[data-story-timeline="true"], section[aria-label="时间线"]').first()).toBeVisible();
    // 来源标记：机器写出的成员要标出来（ADR-0028）。
    await expect(page.locator('[data-story-member-id]').first()).toContainText(/系统创建|Agent 产生|人工编辑过/);

    // 写入面：抽屉删除后，编辑与关联必须在阅读页可达。
    const editSection = await expandEditSurface(page);
    await expect(editSection).toBeVisible();
    await expect(editSection.locator('fieldset[data-story-time-bound="start"]')).toBeVisible();
    await expect(editSection.getByRole("button", { name: "保存修改", exact: true })).toBeVisible();
    await expect(editSection.getByRole("button", { name: "归并", exact: true })).toBeVisible();
    await expect(editSection.getByRole("button", { name: "添加批注", exact: true })).toBeVisible();

    /*
     * 创建动作**不在** Story 页（ADR-0029 决策 1：创建去对象页、关联就地）。
     * 这四条断言是 3c 验收 ② 的门禁——曾经因为页面把四个 onCreate 回调传下来，
     * 组件里的 `onCreateX &&` 守卫失效、创建表单又冒了出来。
     */
    for (const createAction of ["创建并关联", "创建并加入", "创建并添加", "新建收藏夹"]) {
        await expect(
            editSection.getByRole("button", { name: createAction, exact: true }),
            `Story 页不应出现创建入口：${createAction}`,
        ).toHaveCount(0);
    }
    // 关联动作仍在：挂到已有话题、关联已有 Entity（都是「用已有的」，不新建）。
    await expect(editSection.getByRole("heading", { name: "加入 Topic", exact: true })).toBeVisible();
    await expect(editSection.getByRole("button", { name: "加入", exact: true })).toBeVisible();
    await expect(editSection.getByText("关联已有 Entity", { exact: true })).toBeVisible();
    await expect(editSection.getByRole("button", { name: "关联", exact: true })).toBeVisible();

    /*
     * 「同一件事只有一个可写入口」：收藏只有右栏动作区那一个按钮，页面上不该出现第二个。
     * 这条抓的正是 Round 13 修掉的重复收藏入口——按按钮名做黑名单抓不到它。
     *
     * Task 36 切片 A 把收藏从「读完动作区」移进右栏 `StoryEditPanel`，2026-10-03 又把它
     * 放进「编辑与关联」标题行，因此这里不断言它在还是不在编辑面里，只断言全页恰好一个。
     */
    await expect(page.getByRole("button", { name: "收藏", exact: true })).toHaveCount(1);

    /*
     * 拆分表单不在这一条里：它要求 Story 至少有 2 个成员（`split.tsx` 的 `entries.length >= 2`），
     * 一条 RSS 条目进来只有 1 个成员。拆分的渲染验收在组件实验室的 `splittable` 场景里做
     * （`e2e/component-lab/story-edit-panel.spec.ts`），那里有固定的双成员夹具。
     */

    expect(consoleErrors).toEqual([]);
});
