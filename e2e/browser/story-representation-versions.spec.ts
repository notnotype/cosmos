import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { contentRebuildResultSchema, contentSelectionCommandSchema, contentSelectionResultSchema,
    storyDetailSchema, structuredContentViewSchema } from "@cosmos/contracts";
import { FIXTURE_TITLES, ingestFeed, openStory, waitForStoryIds } from "../support/story-flow";

const bodyText = "The first fixture item has a web URL.";
const contentPath = (revisionId: string) => `/api/v1/revisions/${encodeURIComponent(revisionId)}/content`;

async function readContent(page: Page, revisionId: string, version?: number) {
    const response = await page.request.get(contentPath(revisionId), {
        params: version === undefined ? {} : { representationVersion: version },
    });
    expect(response.status()).toBe(200);
    return structuredContentViewSchema.parse(await response.json());
}

async function selectContent(page: Page, revisionId: string, command: z.infer<typeof contentSelectionCommandSchema>, status = 201) {
    const response = await page.request.post(`${contentPath(revisionId)}/selection`, { data: command });
    expect(response.status()).toBe(status);
    return status === 201 ? contentSelectionResultSchema.parse(await response.json()) : null;
}

async function rebuild(page: Page, revisionId: string) {
    const response = await page.request.post(`${contentPath(revisionId)}/rebuild`, { data: {} });
    expect(response.status()).toBe(201);
    return contentRebuildResultSchema.parse(await response.json());
}

async function assertReaderCurrent(page: Page, revisionId: string, representationId: string) {
    const response = page.waitForResponse((value) => new URL(value.url()).pathname === contentPath(revisionId)
        && value.request().method() === "GET", { timeout: 15_000 });
    await page.reload();
    const result = await response;
    expect(result.status()).toBe(200);
    expect(structuredContentViewSchema.parse(await result.json()).representation?.id).toBe(representationId);
    const reader = page.getByRole("region", { name: "来源正文", exact: true });
    await expect(reader.locator('[data-reading-mode="representation"]')).toBeVisible();
    await expect(reader.getByText(bodyText, { exact: true })).toBeVisible();
    const original = reader.getByRole("link", { name: "查看来源原文", exact: true });
    await expect(original).toHaveAttribute("href", "https://example.test/cosmos/scaffold");
    await original.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(original).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
}

for (const width of [1024, 1440]) {
    test(`Content versions preserve exact history and locked rollback in the product at ${width}px`, async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width, height: 1000 });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("requestfailed", (request) => errors.push(`${request.method()} ${request.url()}`));
        const sourceName = await ingestFeed(page, `Content versions ${width}`);
        const storyIds = await waitForStoryIds(page, sourceName, 3);
        const details = await Promise.all(storyIds.map(async (id) => storyDetailSchema.parse(
            await (await page.request.get(`/api/v1/stories/${encodeURIComponent(id)}`)).json(),
        )));
        const initial = details.find((detail) => detail.story.title === FIXTURE_TITLES[0]);
        const other = details.find((detail) => detail.story.title === FIXTURE_TITLES[1]);
        if (!initial?.entry || !other?.entry) throw new Error("Expected two isolated fixture Stories with source revisions");
        const revisionId = initial.entry.currentRevisionId;
        const first = await readContent(page, revisionId);
        const foreign = await readContent(page, other.entry.currentRevisionId);
        if (!first.representation || !foreign.representation) throw new Error("Expected ingested content representations");
        const v1 = first.representation;
        expect(v1.representationVersion).toBe(1);
        await openStory(page, initial.story.id);
        await test.step("Locked rebuild retains current content and immutable source facts", async () => {
            expect(await selectContent(page, revisionId, { operation: "lock", expectedCurrentId: v1.id, expectedLocked: false }))
                .toEqual({ currentRepresentationId: v1.id, locked: true, changed: true });
            const v2 = await rebuild(page, revisionId);
            expect(v2).toMatchObject({ representationVersion: 2, promoted: false });
            const second = await readContent(page, revisionId, 2);
            expect(second.representation).toMatchObject({ id: v2.representationId, entryRevisionId: revisionId,
                parserVersion: v1.parserVersion, contentText: v1.contentText, blocks: v1.blocks, supersedesRepresentationId: v1.id });
            expect(await readContent(page, revisionId)).toEqual(first);
            expect(await readContent(page, revisionId, 1)).toEqual(first);
            await assertReaderCurrent(page, revisionId, v1.id);
        });
        await test.step("Exact unavailable history and stale or foreign selections never fall through", async () => {
            const missing = await readContent(page, revisionId, 999);
            expect(missing).toMatchObject({ representation: null, contentText: "", readingMode: "unavailable", evidenceStatus: "representation-unavailable" });
            await selectContent(page, revisionId, { operation: "unlock", expectedCurrentId: v1.id, expectedLocked: false }, 409);
            const v2 = (await readContent(page, revisionId, 2)).representation!;
            await selectContent(page, revisionId, { operation: "unlock", expectedCurrentId: v2.id, expectedLocked: true }, 409);
            await selectContent(page, revisionId, { operation: "rollback", expectedCurrentId: v1.id, expectedLocked: true,
                representationId: foreign.representation!.id }, 409);
            await selectContent(page, revisionId, { operation: "rollback", expectedCurrentId: v1.id, expectedLocked: true,
                representationId: "missing-representation" }, 404);
            expect(await readContent(page, revisionId)).toEqual(first);
        });
        await test.step("Unlock promotes a rebuilt version; rollback re-locks without rewriting history", async () => {
            expect(await selectContent(page, revisionId, { operation: "unlock", expectedCurrentId: v1.id, expectedLocked: true }))
                .toEqual({ currentRepresentationId: v1.id, locked: false, changed: true });
            const v3 = await rebuild(page, revisionId);
            expect(v3).toMatchObject({ representationVersion: 3, promoted: true });
            const third = await readContent(page, revisionId, 3);
            await assertReaderCurrent(page, revisionId, v3.representationId);
            expect(await selectContent(page, revisionId, { operation: "rollback", expectedCurrentId: v3.representationId,
                expectedLocked: false, representationId: v1.id })).toEqual({ currentRepresentationId: v1.id, locked: true, changed: true });
            expect(await rebuild(page, revisionId)).toMatchObject({ representationVersion: 4, promoted: false });
            expect(await readContent(page, revisionId, 3)).toEqual(third);
            expect(await readContent(page, revisionId, 1)).toEqual(first);
            expect(await readContent(page, revisionId)).toEqual(first);
            const after = storyDetailSchema.parse(await (await page.request.get(`/api/v1/stories/${encodeURIComponent(initial.story.id)}`)).json());
            expect(after.entry).toEqual(initial.entry);
            expect(after.story).toEqual(initial.story);
            await assertReaderCurrent(page, revisionId, v1.id);
        });
        expect(errors).toEqual([]);
    });
}
