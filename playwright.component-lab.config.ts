import {defineConfig, devices} from "@playwright/test";

export default defineConfig({
    testDir: "./e2e/component-lab",
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 2 : 0,
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    reporter: process.env.CI ? [["line"], ["html", {open: "never"}]] : "list",
    use: {
        baseURL: "http://127.0.0.1:3300",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        ...devices["Desktop Chrome"],
    },
    webServer: {
        command: "bun run --cwd apps/web dev -- --hostname 127.0.0.1 --port 3300",
        url: "http://127.0.0.1:3300",
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
    },
});
