import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { connectionInstanceSchema, connectionProbeJobSnapshotSchema } from "@cosmos/contracts";

/** 授权范围、失效原因与恢复写回属于外部账号合同，模型独立配置后仍须保留。 */
test("账号面板显示并记录授权范围与失效原因", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/automation");
    await expect(page.getByRole("heading", { name: "自动化", exact: true })).toBeVisible();

    const connectionName = `连接可见性-${randomUUID().slice(0, 8)}`;
    const connections = page.getByRole("region", { name: "账号", exact: true });
    let connectionId: string | null = null;

    try {
        await connections.getByRole("button", { name: "新建账号" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("连接名称").fill(connectionName);
        await dialog.getByLabel("连接授权范围").fill('{"read":true,"comment":false}');
        const createResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/connections")
            && response.request().method() === "POST");
        await dialog.getByRole("button", { name: "保存账号" }).click();
        const createResponse = await createResponsePromise;
        expect(createResponse.status()).toBe(201);
        const created = connectionInstanceSchema.parse(await createResponse.json());
        expect(created.name).toBe(connectionName);
        connectionId = created.id;

        const listResponse = await page.request.get("/api/v1/connections");
        expect(listResponse.status()).toBe(200);
        const listed = connectionInstanceSchema.array().parse(await listResponse.json());
        expect(listed.some((connection) => connection.id === created.id)).toBe(true);

        const row = connections.locator("li", { hasText: connectionName });
        await expect(row).toBeVisible();
        await expect(row).toContainText("read: true · comment: false");
        await expect(row.getByRole("button", { name: /模型/ })).toHaveCount(0);
        await expect(row).toContainText("未记录");

        await row.getByRole("button", { name: `标记失效 ${connectionName}` }).click();
        await row.getByLabel(`失效原因 ${connectionName}`).fill("登录态已过期");
        await row.getByRole("button", { name: "确认标记失效" }).click();
        await expect(row).toContainText("错误");
        await expect(row).toContainText("登录态已过期");

        await row.getByRole("button", { name: `恢复可用 ${connectionName}` }).click();
        await expect(row).toContainText("可用");
        await expect(row).toContainText("未记录");
    } finally {
        if (connectionId !== null) {
            await page.evaluate(async (id) => {
                await fetch(`/api/v1/connections/${id}/removals`, { method: "POST" });
            }, connectionId);
        }
    }
});

/** 使用Node可执行文件代替OpenCLI，不连接Browser Bridge；断言Worker写回失败结论并记录受限HTTP诊断。 */
test("账号面板能发起登录探测并记录检查时间", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/automation");
    await expect(page.getByRole("heading", { name: "自动化", exact: true })).toBeVisible();

    const connectionName = `登录探测-${randomUUID().slice(0, 8)}`;
    const connections = page.getByRole("region", { name: "账号", exact: true });
    let connectionId: string | null = null;
    try {
        await connections.getByRole("button", { name: "新建账号" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("连接名称").fill(connectionName);
        await dialog.getByLabel("连接 Connector").fill("bilibili");
        await dialog.getByLabel("连接适配器配置").fill('{"profile":"chrome-main"}');
        const createResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/connections")
            && response.request().method() === "POST");
        await dialog.getByRole("button", { name: "保存账号" }).click();
        const createResponse = await createResponsePromise;
        expect(createResponse.status()).toBe(201);
        const created = connectionInstanceSchema.parse(await createResponse.json());
        expect(created.name).toBe(connectionName);
        expect(created.connectorId).toBe("bilibili");
        connectionId = created.id;

        const row = connections.locator("li", { hasText: connectionName });
        await expect(row).toBeVisible();
        await expect(row).toContainText("未检查");

        const probePath = `/api/v1/connections/${encodeURIComponent(created.id)}/probes`;
        const enqueueResponsePromise = page.waitForResponse((response) => response.url().endsWith(probePath)
            && response.request().method() === "POST", {timeout: 15_000});
        await row.getByRole("button", { name: `检查登录状态 ${connectionName}` }).click();
        const enqueueResponse = await enqueueResponsePromise;
        let enqueueCode: string | undefined;
        if (enqueueResponse.status() !== 202) {
            const body = await enqueueResponse.json() as {code?: unknown};
            if (typeof body.code === "string") enqueueCode = body.code;
        }
        expect(enqueueResponse.status(), `POST /connections/:id/probes status=${enqueueResponse.status()} code=${enqueueCode ?? "none"}`)
            .toBe(202);
        const job = connectionProbeJobSnapshotSchema.parse(await enqueueResponse.json());
        const jobPath = `/api/v1/connection-probes/${encodeURIComponent(job.id)}`;
        const pollEvidence = async () => {
            const response = await page.request.get(jobPath);
            if (response.status() !== 200) {
                let code: string | undefined;
                const body = await response.json() as {code?: unknown};
                if (typeof body.code === "string") code = body.code;
                return {httpStatus: response.status(), code};
            }
            const polled = connectionProbeJobSnapshotSchema.parse(await response.json());
            return {httpStatus: response.status(), jobId: polled.id, status: polled.status};
        };
        await expect.poll(pollEvidence, {timeout: 180_000, intervals: [100, 250, 500, 1_000]})
            .toMatchObject({httpStatus: 200, jobId: job.id, status: "succeeded"});
        const completedResponse = await page.request.get(jobPath);
        expect(completedResponse.status()).toBe(200);
        const completedJob = connectionProbeJobSnapshotSchema.parse(await completedResponse.json());
        expect(completedJob).toMatchObject({id: job.id, status: "succeeded"});
        expect(completedJob.result).toMatchObject({outcome: "error"});

        await expect(row).toContainText("错误");
        const connectionResponse = await page.request.get(`/api/v1/connections/${encodeURIComponent(created.id)}`);
        expect(connectionResponse.status()).toBe(200);
        const probe = connectionInstanceSchema.parse(await connectionResponse.json());
        expect(probe).toMatchObject({id: created.id, status: "error"});
        expect(probe.lastCheckedAt).not.toBeNull();
        expect(probe.lastError).toBeTruthy();
        expect(probe.lastError?.length ?? 0).toBeLessThanOrEqual(500);
        expect(probe.lastError).toBe(completedJob.result?.reason);
        if (probe.lastError) await expect(row).toContainText(probe.lastError);
    } finally {
        if (connectionId !== null) {
            await page.evaluate(async (id) => {
                await fetch(`/api/v1/connections/${id}/removals`, { method: "POST" });
            }, connectionId);
        }
    }
});
