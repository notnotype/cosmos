import {expect, test} from "@playwright/test";

test("updates SourceForm preview when inspector props change", async ({page}) => {
    await page.goto("/dev/components?component=source-form&scene=default");
    await expect(page.getByRole("button", {name: "SourceForm", exact: true})).toBeVisible();

    const previewName = page.locator("#source-name");
    await expect(previewName).toHaveValue("Cosmos fixture");
    const previewPath = page.locator("#fixture-path");
    await page.locator("#lab-control-source-form-fixturePath").fill("fixtures/rss/updated.xml");
    await expect(previewPath).toHaveValue("fixtures/rss/updated.xml");
    await page.locator("#lab-control-source-form-name").fill("Updated fixture");
    await expect(previewName).toHaveValue("Updated fixture");
    await page.locator("#source-name").fill("User editing");
    await expect(page.locator("#source-name")).toHaveValue("User editing");
});

test("keeps SourceForm fixture submission inside the lab", async ({page}) => {
    await page.goto("/dev/components?component=source-form&scene=default");
    await expect(page).toHaveURL(/viewport=responsive&theme=cosmos&colorway=light/u);
    const initialUrl = page.url();
    let navigationRequests = 0;
    page.on("request", (request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
            navigationRequests += 1;
        }
    });

    await page.getByRole("button", {name: "保存来源"}).click();
    await expect(page).toHaveURL(initialUrl);

    expect(page.url()).toBe(initialUrl);
    expect(navigationRequests).toBe(0);
    await expect(page.locator("#source-name")).toBeVisible();
});

test("keeps FeedBrowser fixture search inside the lab", async ({page}) => {
    await page.goto("/dev/components?component=feed-browser&scene=populated");
    await expect(page).toHaveURL(/viewport=responsive&theme=cosmos&colorway=light/u);
    const initialUrl = page.url();
    let navigationRequests = 0;
    page.on("request", (request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
            navigationRequests += 1;
        }
    });

    await page.getByRole("button", {name: "搜索", exact: true}).click();
    await expect(page).toHaveURL(initialUrl);
    expect(navigationRequests).toBe(0);
    await expect(page.getByText("Cosmos fixture story")).toBeVisible();
});

test("preserves a restored token when its field blurs without editing", async ({page}) => {
    const storageKey = "cosmos.component-lab.token-draft.v1";
    const storageValue = '{"overrides":{"--radius":"1rem"},"version":1}';
    await page.goto("/dev/components?component=button&scene=default");
    await page.evaluate(({key, value}) => {
        window.localStorage.setItem(key, value);
    }, {key: storageKey, value: storageValue});
    await page.reload();

    const tokenInput = page.locator("#lab-token---radius");
    await expect(tokenInput).toHaveValue("1rem");
    await tokenInput.focus();
    await page.keyboard.press("Tab");
    await expect(tokenInput).toHaveValue("1rem");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storageKey))
        .toBe(storageValue);
    await page.reload();
    await expect(page.locator("#lab-token---radius")).toHaveValue("1rem");
});
