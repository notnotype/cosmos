import { expect, test, type Locator, type Page } from "@playwright/test";
import { storyDetailSchema, structuredContentViewSchema, type StoryDetail } from "@cosmos/contracts";
import { openStory, waitForStoryIds } from "../support/story-flow";

const origin = "https://reading-degradation.e2e.invalid";

async function content(page: Page, detail: StoryDetail, version?: number) {
    if (!detail.entry) throw new Error("Expected synthetic source Entry");
    const suffix = version === undefined ? "" : `?representationVersion=${version}`;
    const response = await page.request.get(`/api/v1/revisions/${encodeURIComponent(detail.entry.currentRevisionId)}/content${suffix}`);
    expect(response.status()).toBe(200);
    return structuredContentViewSchema.parse(await response.json());
}

async function keyboardLink(page: Page, link: Locator, url: string) {
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
    await link.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(link).toBeFocused();
}

async function checkReader(page: Page, detail: StoryDetail, mode: string, check: (reader: Locator) => Promise<void>) {
    const before = await content(page, detail);
    await openStory(page, detail.story.id);
    for (const refresh of [false, true]) {
        if (refresh) await page.reload();
        const reader = page.getByRole("region", { name: "来源正文", exact: true });
        await expect(reader.locator(`[data-reading-mode="${mode}"]`)).toBeVisible();
        await check(reader);
        await expect(reader.locator("img, video, audio, iframe, script")).toHaveCount(0);
        await expect(reader).not.toContainText("已保存本地");
        await keyboardLink(page, reader.getByRole("link", { name: "查看来源原文", exact: true }), `${origin}/${encodeURIComponent(detail.story.title)}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
        expect(await page.evaluate(() => Reflect.get(window, "__legacyExecuted"))).toBeUndefined();
        expect(await content(page, detail)).toEqual(before);
        const response = await page.request.get(`/api/v1/stories/${encodeURIComponent(detail.story.id)}`);
        expect(response.status()).toBe(200);
        expect(storyDetailSchema.parse(await response.json())).toEqual(detail);
    }
}

for (const width of [1024, 1440]) {
    test(`Legacy, broken representations and missing assets degrade honestly at ${width}px`, async ({ page }) => {
        test.setTimeout(120_000);
        test.skip(process.env.COSMOS_E2E_READING_DEGRADATION !== "1", "Requires opt-in prelaunch synthetic rows: COSMOS_E2E_READING_DEGRADATION=1");
        await page.setViewportSize({ width, height: 1000 });
        const errors: string[] = [];
        const mediaRequests: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("requestfailed", (request) => errors.push(request.url()));
        page.on("request", (request) => {
            const url = new URL(request.url());
            if (url.origin === origin || url.pathname.startsWith("/api/v1/assets/")) mediaRequests.push(url.href);
        });
        const ids = await waitForStoryIds(page, "Reading degradation seed", 4);
        const details = await Promise.all(ids.map(async (id) => {
            const response = await page.request.get(`/api/v1/stories/${encodeURIComponent(id)}`);
            expect(response.status()).toBe(200);
            return storyDetailSchema.parse(await response.json());
        }));
        const find = (title: string) => {
            const result = details.find((value) => value.story.title === title);
            if (!result?.entry) throw new Error(`Missing seeded Story ${title}`);
            return result;
        };
        await test.step("Legacy HTML is safely adapted without a fabricated representation or historical fallback", async () => {
            const detail = find("Legacy HTML");
            const view = await content(page, detail);
            expect(view).toMatchObject({ readingMode: "legacy-text", representation: null });
            expect(view.contentText).toContain("Legacy safe body");
            expect(view.contentText).toContain("Legacy tail");
            expect(view.contentText).not.toMatch(/<|script|__legacyExecuted|tracker/);
            expect(await content(page, detail, 1)).toMatchObject({ readingMode: "unavailable", representation: null, contentText: "" });
            await checkReader(page, detail, "legacy-text", async (reader) => {
                await expect(reader).toContainText("Legacy safe body");
                await expect(reader).toContainText("Legacy tail");
                await expect(reader).toContainText("历史内容以安全文本展示");
                await expect(reader).not.toContainText("__legacyExecuted");
            });
        });
        await test.step("Corrupt current and failed representations do not substitute stale text or break the Story", async () => {
            const corrupt = find("Corrupt representation");
            expect(await content(page, corrupt)).toMatchObject({ readingMode: "unavailable", representation: null,
                contentText: "", evidenceStatus: "representation-unavailable" });
            const failed = find("Failed representation");
            expect(await content(page, failed)).toMatchObject({ readingMode: "representation", representation: { status: "failed" } });
            for (const [detail, mode] of [[corrupt, "unavailable"], [failed, "representation"]] as const) {
                await checkReader(page, detail, mode, async (reader) => {
                    await expect(reader).toContainText("此来源的正文暂不可用");
                    await expect(reader).not.toContainText("DO-NOT-");
                    await expect(reader.locator("[data-content-block]")).toHaveCount(0);
                });
            }
        });
        await test.step("Missing Asset references retain block order, explanation and only available safe links", async () => {
            const detail = find("Missing assets");
            expect(detail.entry!.revisions[0]!.assets).toEqual([]);
            expect((await content(page, detail)).representation?.blocks.map((block) => block.type))
                .toEqual(["paragraph", "image", "audio", "video", "paragraph"]);
            await checkReader(page, detail, "representation", async (reader) => {
                await expect(reader.locator("[data-content-block]")).toHaveCount(5);
                await expect(reader.locator("[data-content-block=paragraph]")).toHaveText(["Before missing media", "After missing media"]);
                await expect(reader.locator("[data-asset-status=asset-missing]")).toHaveCount(3);
                for (const kind of ["image", "audio", "video"]) {
                    const slot = reader.locator(`[data-content-block=${kind}]`);
                    await expect(slot).toContainText("媒体资源缺失，正文仍可继续阅读。");
                    if (kind === "audio") await expect(slot.getByRole("link")).toHaveCount(0);
                    else await keyboardLink(page, slot.getByRole("link"), `${origin}/original-${kind}.${kind === "image" ? "svg" : "mp4"}`);
                }
            });
        });
        expect(mediaRequests).toEqual([]);
        expect(errors).toEqual([]);
    });
}
