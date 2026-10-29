import assert from "node:assert/strict";
import { storyAgentCandidateRecordSchema } from "@cosmos/contracts";
import { chromium, expect } from "@playwright/test";
import { bodySource, bodyStory } from "./story-body-plan.js";
import { runBodyStoryAcceptance } from "./story-body-runner.js";
import { createBodyOfflineTransport } from "./story-body-fixtures.js";
import { startBodyWeb } from "./story-body-web.js";

// Explicit offline acceptance, not a provider run. Kept outside the default unit-test layer.
const result = await runBodyStoryAcceptance({ credential: "synthetic-task40-browser-key", transport: createBodyOfflineTransport() });
let web: Awaited<ReturnType<typeof startBodyWeb>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
    assert.equal(result.report.status, "awaiting_manual_decision");
    assert.ok(result.api);
    assert.equal(result.report.formalUnchanged, true);
    assert.equal(result.report.secretCleanup, "completed");
    web = await startBodyWeb(result.api);
    browser = await chromium.launch();
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const externalRequests: string[] = [];
    await page.route("**/*", async (route) => {
        if (!new URL(route.request().url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) {
            externalRequests.push("non-local request blocked"); await route.abort(); return;
        }
        await route.continue();
    });
    await page.goto(`${web.origin}/stories/${bodyStory.storyId}`);
    await expect(page.getByRole("heading", { name: bodyStory.title, exact: true })).toBeVisible();
    const panel = page.getByRole("region", { name: "Agent 建议" });
    await expect(panel.getByText("待决定", { exact: true })).toBeVisible();
    await expect(page.getByText(/The workshop has 18 seats/).first()).toBeVisible();
    await panel.getByText("查看输入版本", { exact: true }).click();
    await expect(panel.getByText(new RegExp(bodySource.entryRevisionId))).toBeVisible();
    const candidates = storyAgentCandidateRecordSchema.array().parse(await (await fetch(`${result.api.origin}/api/v1/stories/${bodyStory.storyId}/agent-candidates`)).json());
    assert.equal(candidates[0]!.candidate.proposal.task, "story.summarize");
    const proposal = candidates[0]!.candidate.proposal;
    assert.ok(proposal.task === "story.summarize");
    assert.deepEqual(proposal.keyFacts[0]!.evidence, [{ entryId: bodySource.entryId,
        entryRevisionId: bodySource.entryRevisionId, representationVersion: 1, blockId: "block-1" }]);
    await panel.getByRole("button", { name: "接受建议", exact: true }).click();
    await expect(panel.getByText("已接受", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Synthetic map-reading workshop", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Agent 建议" }).getByText("已接受", { exact: true })).toBeVisible();
    await result.recordDecision();
    assert.equal(result.report.decision, "accepted");
    assert.equal(result.report.bodyEvidenceRefs, 1);
    assert.equal(result.report.manualPersistenceVerified, true);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(externalRequests, []);
    console.log(JSON.stringify({ root: result.root, result: "offline browser acceptance passed", checks: ["source body", "version", "exact evidence via API", "pending unchanged", "Web accept", "reload", "durable API read"] }));
} finally {
    await browser?.close();
    try { await web?.stop(); } finally { await result.close(); }
}
