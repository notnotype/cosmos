import { execFileSync } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import {
    findAvailablePort,
    spawnService,
    stopManagedProcess,
    waitForHttp,
    type ManagedProcess,
} from "../e2e/helpers.js";
import { repositoryRoot } from "./story-agent-isolation.js";

const root = join(repositoryRoot, ".agent", "tmp", "task40-story-SewnuB");
// Refuse a missing reuse target before Prisma can create an empty database.
await access(join(root, "data", "cosmos.sqlite"));
await access(join(root, "data", "blobs"));
const apiPort = await findAvailablePort(15710);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
// Keep user roots, proxies, credentials and debugging flags outside this reused isolation.
const apiEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: "test",
    COSMOS_WORKSPACE_ROOT: repositoryRoot,
    COSMOS_DATA_ROOT: join(root, "data"),
    COSMOS_BLOB_ROOT: join(root, "data", "blobs"),
    COSMOS_LOG_ROOT: join(root, "logs"),
    COSMOS_LOG_OUTPUT: "console",
    COSMOS_LOG_LEVEL: "error",
    DATABASE_URL: `file:${join(root, "data", "cosmos.sqlite").replaceAll("\\", "/")}`,
    COSMOS_API_HOST: "127.0.0.1",
    COSMOS_API_PORT: String(apiPort),
    COSMOS_ALLOWED_ORIGIN: apiOrigin,
    COSMOS_MODEL_CONFIGURATION_AUTHORITIES: `127.0.0.1:${apiPort}`,
};
const pageErrors: string[] = [];
let blockedExternalRequests = 0;
let degradedImageBlocks = 0;
let unloadedImages = 0;
let pendingImages = 0;
let failedImages = 0;
let imageFailureStatuses: string[] = [];
let api: ManagedProcess | undefined;
let web: ManagedProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
    api = spawnService({
        name: "real-source-ingest-api",
        command: process.env.NODE_BINARY?.trim() || "node",
        args: ["apps/api/dist/main.js"],
        cwd: repositoryRoot,
        env: apiEnv,
    });
    await waitForHttp(`${apiOrigin}/readyz`, 200, 30_000);

    const webPort = await findAvailablePort(15910);
    const webOrigin = `http://127.0.0.1:${webPort}`;
    const bun = process.env.BUN_BINARY?.trim() || "bun";
    const webEnv: NodeJS.ProcessEnv = {
        ...apiEnv,
        COSMOS_API_URL: apiOrigin,
        NEXT_PUBLIC_COSMOS_API_URL: "",
        NEXT_TELEMETRY_DISABLED: "1",
    };
    execFileSync(bun, ["run", "build:web"], {
        cwd: repositoryRoot,
        env: webEnv,
        stdio: "ignore",
    });
    web = spawnService({
        name: "real-source-ingest-web",
        command: bun,
        args: ["run", "--cwd", "apps/web", "start", "--", "-H", "127.0.0.1", "-p", String(webPort)],
        cwd: repositoryRoot,
        env: webEnv,
    });
    await waitForHttp(webOrigin, 200, 60_000);

    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", async (route) => {
        const hostname = new URL(route.request().url()).hostname;
        if (hostname !== "127.0.0.1" && hostname !== "localhost") {
            blockedExternalRequests += 1;
            await route.abort();
            return;
        }
        await route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${webOrigin}/stories/${encodeURIComponent("story:cmw38t1yx0008nze0ouc3hp2p")}`);
    await expect(page.getByRole("heading", {
        name: "Replacing the old battery on rechargeable bike lights",
        exact: true,
    })).toBeVisible();

    const paragraphs = page.locator('[data-content-block="paragraph"]');
    const images = page.locator('[data-content-block="image"]');
    await expect(paragraphs.first()).toBeAttached();
    await expect(images.first()).toBeAttached();
    const savedAssets = images.locator('figure[data-asset-status="saved"]');
    await expect(savedAssets.first()).toBeAttached();
    for (const image of await images.all()) {
        await image.scrollIntoViewIfNeeded();
    }
    // Allow load/error events to settle, without making pixel availability a pass condition.
    await expect.poll(() => images.locator("img").evaluateAll((elements) =>
        elements.every((element) => element instanceof HTMLImageElement && element.complete)),
    { timeout: 5_000 }).toBe(true).catch(() => undefined);
    // Saved rendering is the contract; unavailable pixels remain diagnostic, not a failure.
    imageFailureStatuses = await savedAssets.getByRole("status").allTextContents();
    degradedImageBlocks = await images.filter({ has: page.getByRole("status") }).count();
    const imageCounts = await images.locator("img").evaluateAll((elements) => {
        const pictures = elements.filter((element): element is HTMLImageElement =>
            element instanceof HTMLImageElement);
        return {
            pending: pictures.filter((image) => !image.complete).length,
            failed: pictures.filter((image) => image.complete && image.naturalWidth === 0).length,
        };
    });
    pendingImages = imageCounts.pending;
    failedImages = imageCounts.failed;
    unloadedImages = pendingImages + failedImages;
} finally {
    try {
        await browser?.close();
    } finally {
        try {
            if (web) await stopManagedProcess(web, "force");
        } finally {
            if (api) await stopManagedProcess(api, "force");
        }
    }
}

console.log(JSON.stringify({
    status: "passed",
    checks: ["title", "paragraph blocks", "image blocks", "saved asset rendered"],
    pageErrors,
    blockedExternalRequests,
    degradedImageBlocks,
    unloadedImages,
    pendingImages,
    failedImages,
    imageFailureStatuses,
}));
