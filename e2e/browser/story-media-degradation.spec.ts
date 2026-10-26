import { expect, test, type Locator, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { storyDetailSchema, structuredContentViewSchema, type StoryDetail } from "@cosmos/contracts";
import { ingestFeed, openStory, waitForStoryIds } from "../support/story-flow";

async function startMediaFixture() {
    let baseUrl = "";
    const requests: string[] = [];
    const server = createServer((request, response) => {
        const path = new URL(request.url ?? "/", "http://fixture.invalid").pathname;
        requests.push(path);
        if (path !== "/feed.xml") {
            response.writeHead(404);
            response.end("Media must not be downloaded in this fixture");
            return;
        }
        const blockedUrl = baseUrl.replace("127.0.0.1", "127.0.0.2") + "/blocked.svg";
        const item = (id: string, body: string, enclosure = "") => `<item><guid>${id}</guid><title>${id}</title><link>${baseUrl}/${encodeURIComponent(id)}</link><description><![CDATA[${body}]]></description>${enclosure}</item>`;
        const media = item("Only audio and video", `<audio src="${baseUrl}/episode.mp3"></audio><video src="${baseUrl}/clip.mp4"></video>`,
            `<enclosure url="${baseUrl}/episode.mp3" type="audio/mpeg" length="1200"/><enclosure url="${baseUrl}/clip.mp4" type="video/mp4" length="2400"/>`);
        const blocked = item("Blocked image", `<p>Body before blocked image</p><img src="${blockedUrl}" alt="Blocked fixture image"/><p>Body after blocked image</p>`);
        response.writeHead(200, { "content-type": "application/rss+xml" });
        response.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Media degradation</title><link>${baseUrl}</link><description>Isolated acceptance</description>${media}${blocked}${item("Empty body", "<div></div>")}</channel></rss>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    const blockedServer = createServer((request, response) => {
        requests.push(new URL(request.url ?? "/", "http://fixture.invalid").pathname);
        response.writeHead(200, { "content-type": "image/svg+xml" });
        response.end('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>');
    });
    try {
        await new Promise<void>((resolve, reject) => {
            blockedServer.once("error", reject);
            blockedServer.listen(port, "127.0.0.2", resolve);
        });
    } catch (error) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        throw error;
    }
    return { baseUrl, requests, close: async () => {
        await Promise.all([server, blockedServer].map((value) => new Promise<void>((resolve, reject) => {
            value.close((error) => error ? reject(error) : resolve());
        })));
    } };
}

async function readContent(page: Page, detail: StoryDetail) {
    if (!detail.entry) throw new Error("Expected a source Entry");
    const response = await page.request.get(`/api/v1/revisions/${encodeURIComponent(detail.entry.currentRevisionId)}/content`);
    expect(response.status()).toBe(200);
    return structuredContentViewSchema.parse(await response.json());
}

async function assertSafeLink(page: Page, link: Locator, url: string) {
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
    await link.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(link).toBeFocused();
}

async function checkReader(page: Page, detail: StoryDetail, baseUrl: string, check: (reader: Locator) => Promise<void>) {
    const initial = await readContent(page, detail);
    await openStory(page, detail.story.id);
    for (const refresh of [false, true]) {
        if (refresh) await page.reload();
        const reader = page.getByRole("region", { name: "来源正文", exact: true });
        await expect(reader.locator('[data-reading-mode="representation"]')).toBeVisible();
        await check(reader);
        await expect(reader.locator("img, audio, video, iframe")).toHaveCount(0);
        await expect(reader).not.toContainText("已保存本地");
        await assertSafeLink(page, reader.getByRole("link", { name: "查看来源原文", exact: true }), `${baseUrl}/${encodeURIComponent(detail.story.title)}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
        expect(await readContent(page, detail)).toEqual(initial);
    }
}

for (const width of [1024, 1440]) {
    test(`Media metadata, blocked images and empty bodies stay readable in the product at ${width}px`, async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width, height: 1000 });
        const fixture = await startMediaFixture();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("requestfailed", (request) => errors.push(`${request.method()} ${request.url()}`));
        try {
            const source = await ingestFeed(page, `Media degradation ${width}`, async (current) => {
                await current.getByLabel("Feed URL").fill(`${fixture.baseUrl}/feed.xml`);
            });
            const ids = await waitForStoryIds(page, source, 3);
            const details = await Promise.all(ids.map(async (id) => {
                const response = await page.request.get(`/api/v1/stories/${encodeURIComponent(id)}`);
                expect(response.status()).toBe(200);
                return storyDetailSchema.parse(await response.json());
            }));
            const find = (title: string) => {
                const detail = details.find((value) => value.story.title === title);
                if (!detail?.entry) throw new Error(`Expected ingested fixture Story: ${title}`);
                return detail;
            };
            await test.step("Audio and video expose metadata without claiming saved playback", async () => {
                const detail = find("Only audio and video");
                const view = await readContent(page, detail);
                expect(view.contentText).toBe("");
                expect(view.representation?.blocks.map((block) => block.type)).toEqual(["audio", "video"]);
                expect(detail.entry!.revisions[0]!.assets.map((asset) => ({ kind: asset.kind, status: asset.status })).sort((a, b) => a.kind.localeCompare(b.kind)))
                    .toEqual([{ kind: "audio", status: "metadata_only" }, { kind: "video", status: "metadata_only" }]);
                await checkReader(page, detail, fixture.baseUrl, async (reader) => {
                    await expect(reader.locator("[data-content-block]")).toHaveCount(2);
                    for (const [kind, label, path] of [["audio", "音频", "episode.mp3"], ["video", "视频", "clip.mp4"]] as const) {
                        const media = reader.locator(`[data-content-block=${kind}] [data-asset-status=metadata_only]`);
                        await expect(media).toContainText(label);
                        await expect(media).toContainText("仅记录元数据");
                        await expect(media).toContainText("按策略仅记录元数据");
                        await assertSafeLink(page, media.getByRole("link", { name: "查看原文外链" }), `${fixture.baseUrl}/${path}`);
                    }
                });
            });
            await test.step("Real Worker security blocking preserves body order and explanation", async () => {
                const detail = find("Blocked image");
                const asset = detail.entry!.revisions[0]!.assets[0]!;
                expect(asset).toMatchObject({ kind: "image", status: "skipped", errorCode: "security_blocked" });
                const view = await readContent(page, detail);
                expect(view.representation?.blocks.map((block) => block.type)).toEqual(["paragraph", "image", "paragraph"]);
                await checkReader(page, detail, fixture.baseUrl, async (reader) => {
                    await expect(reader.locator("[data-content-block=paragraph]")).toHaveText(["Body before blocked image", "Body after blocked image"]);
                    const media = reader.locator("[data-asset-status=skipped]");
                    await expect(media).toContainText("未保存");
                    await expect(media).toContainText("图片服务器位于内网或本机地址，已拦截");
                    await assertSafeLink(page, media.getByRole("link", { name: "查看原文外链" }), asset.sourceUrl!);
                });
            });
            await test.step("Empty declared HTML has an honest empty state, not fabricated title content", async () => {
                const detail = find("Empty body");
                const view = await readContent(page, detail);
                expect(view).toMatchObject({ readingMode: "representation", contentText: "", representation: { blocks: [] } });
                await checkReader(page, detail, fixture.baseUrl, async (reader) => {
                    await expect(reader.locator("[data-content-block]")).toHaveCount(0);
                    await expect(reader.getByText("此来源没有可展示的正文。", { exact: true })).toBeVisible();
                    await expect(reader).not.toContainText("此来源的正文暂不可用");
                });
            });
            expect(fixture.requests.filter((path) => path !== "/feed.xml")).toEqual([]);
            expect(errors).toEqual([]);
        } finally {
            await fixture.close();
        }
    });
}
