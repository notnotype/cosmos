import { ActionExecutionError, ActionRegistry } from "@cosmos/application";
import { PassThrough } from "node:stream";
import { createPiAiOpenAICompletionsModel, defaultPiAiClient, type PiAiClient } from "@cosmos/agent-pi-ai";
import type { ConnectionInstance } from "@cosmos/contracts";
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ISOLATION_PARENT, SNAPSHOT_COMMIT, SYNTHETIC_CREDENTIAL, V2_CONFIGURED_MODEL_ID, V2_PLAN_FILE, V2_PROVIDER_ID, assertUsableCredential, createTask39AgentAction, readCredentialWithoutEcho, validateRunnerInvocation, runOfflineSmoke, runCli, requestPlan, prepareRealSmoke, validatePreparedRoot, withBoundedProviderTransport, createSafeDiagnostics, prepareRealSmokeV2, requestPlanV2, runOfflineV2Smoke, validatePreparedRootV2 } from "./connection-smoke.js";

describe("Task 39 Connection smoke input guard", () => {
    it("retains the first failure without serializing arbitrary errors or cleanup payloads", async () => {
        const diagnostics = createSafeDiagnostics();
        await expect(diagnostics.step("secret_write", async () => {
            throw Object.assign(new Error(SYNTHETIC_CREDENTIAL), { body: "private-provider-body" });
        })).rejects.toThrow(SYNTHETIC_CREDENTIAL);
        await expect(diagnostics.step("secret_delete", async () => {
            throw new Error("private-cleanup-message");
        })).rejects.toThrow();
        expect(diagnostics.record.firstFailure).toEqual({ stage: "secret_write", category: "operation_failed" });
        expect(diagnostics.record.status).toBe("failed");
        const text = JSON.stringify(diagnostics.record);
        for (const sensitive of [SYNTHETIC_CREDENTIAL, "private-provider-body", "private-cleanup-message"]) {
            expect(text).not.toContain(sensitive);
        }
    });

    it.each(["credential_input", "database_initialize", "connection_create", "secret_write", "dispatch",
        "result_write", "secret_delete", "disconnect"] as const)("records the fixed %s failure stage", async (stage) => {
        const diagnostics = createSafeDiagnostics();
        await expect(diagnostics.step(stage, async () => { throw new Error("private"); })).rejects.toThrow();
        expect(diagnostics.record.firstFailure).toEqual({ stage, category: "operation_failed" });
        expect(diagnostics.record.transportSends).toBe(0);
    });

    it("records safe response status without recording response content", async () => {
        const diagnostics = createSafeDiagnostics();
        let status: number | null = null;
        const transport = vi.fn<typeof fetch>(async () => new Response("private-response", { status: 401 }));
        await expect(diagnostics.step("dispatch", () => withBoundedProviderTransport(() =>
            fetch("https://api-slb.jiji.cc/v1/chat/completions", { method: "POST" }), transport,
            () => { diagnostics.record.transportSends += 1; }, (response) => { status = response.status; })))
            .resolves.toBeInstanceOf(Response);
        diagnostics.record.response = { returned: true, status };
        expect(diagnostics.record.response).toEqual({ returned: true, status: 401 });
        expect(JSON.stringify(diagnostics.record)).not.toContain("private-response");
    });

    it("counts an attempted transport even when the synthetic transport fails", async () => {
        const diagnostics = createSafeDiagnostics();
        const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("private-network-message"));
        await expect(diagnostics.step("dispatch", () => withBoundedProviderTransport(() =>
            fetch("https://api-slb.jiji.cc/v1/chat/completions", { method: "POST" }), transport,
            () => { diagnostics.record.transportSends += 1; }))).rejects.toThrow();
        expect(diagnostics.record.transportSends).toBe(1);
        expect(diagnostics.record.firstFailure?.stage).toBe("dispatch");
        expect(JSON.stringify(diagnostics.record)).not.toContain("private-network-message");
    });
    it("bounds the installed SDK retries to one send and suppresses its console logs", async () => {
        const originalFetch = globalThis.fetch;
        const originalLog = process.env.OPENAI_LOG;
        process.env.OPENAI_LOG = "debug";
        const spies = ["debug", "info", "warn", "error"].map((level) =>
            vi.spyOn(console, level as "debug").mockImplementation(() => undefined));
        const transport = vi.fn<typeof fetch>(async (_input, init) => {
            expect(init?.redirect).toBe("error");
            expect(process.env.OPENAI_LOG).toBe("off");
            return new Response(JSON.stringify({ error: { message: "synthetic-private-response" } }), {
                status: 500, headers: { "content-type": "application/json", "retry-after-ms": "1" },
            });
        });
        try {
            await withBoundedProviderTransport(async () => {
                await defaultPiAiClient.complete(createPiAiOpenAICompletionsModel({
                    provider: "jijiapi", model: "gpt-6-luna", name: "test",
                    baseUrl: "https://api-slb.jiji.cc/v1", contextWindow: 262_144, maxTokens: 64,
                }), { messages: [{ role: "user", content: "Reply with exactly: OK", timestamp: 0 }] }, {
                    apiKey: SYNTHETIC_CREDENTIAL, maxTokens: 64, signal: AbortSignal.timeout(10_000),
                });
            }, transport);
            expect(transport).toHaveBeenCalledTimes(1);
            expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
            expect(globalThis.fetch).toBe(originalFetch);
            expect(process.env.OPENAI_LOG).toBe("debug");
        } finally {
            spies.forEach((spy) => spy.mockRestore());
            if (originalLog === undefined) delete process.env.OPENAI_LOG;
            else process.env.OPENAI_LOG = originalLog;
        }
    });

    it("rejects other destinations and restores globals after failure", async () => {
        const originalFetch = globalThis.fetch;
        const originalLog = process.env.OPENAI_LOG;
        const transport = vi.fn<typeof fetch>();
        await expect(withBoundedProviderTransport(() =>
            fetch("https://unapproved.invalid/v1/chat/completions", { method: "POST" }), transport))
            .rejects.toThrow("transport rejected");
        expect(transport).not.toHaveBeenCalled();
        expect(globalThis.fetch).toBe(originalFetch);
        expect(process.env.OPENAI_LOG).toBe(originalLog);
    });
    it("pins migration export to the reviewed immutable commit", () => {
        expect(SNAPSHOT_COMMIT).toBe("7ca568a91c57fba7bd8256727662936143b63a14");
    });

    it("deploys only frozen migrations and dispatches through real isolated Connection/SecretStore", async () => {
        const environmentBefore = { database: process.env.DATABASE_URL, root: process.env.COSMOS_DATA_ROOT };
        const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
            throw new Error("Network is forbidden in the offline smoke.");
        });
        try {
            const result = await runOfflineSmoke();
            expect(result).toMatchObject({ mode: "offline", status: "completed", migrationCount: 43,
                secretReads: 1, outputMatchesExpected: true, credentialAbsentFromOutput: true,
                missingSecretRejected: true, retained: true });
            expect(fetch).not.toHaveBeenCalled();
            expect({ database: process.env.DATABASE_URL, root: process.env.COSMOS_DATA_ROOT }).toEqual(environmentBefore);
            const manifest = JSON.parse(await readFile(join(result.isolatedRoot, "snapshot-manifest.json"), "utf8")) as {
                commit: string; files: Array<{ path: string; sha256: string }>;
            };
            expect(manifest.commit).toBe(SNAPSHOT_COMMIT);
            expect(manifest.files.filter((file) => file.path.endsWith("/migration.sql"))).toHaveLength(43);
            expect(manifest.files.some((file) => file.path.includes("20261008"))).toBe(true);
            expect(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
            for (const name of ["result.json", "application.log.json", "migration.log"]) {
                const text = await readFile(join(result.isolatedRoot, name), "utf8");
                expect(text).not.toContain(SYNTHETIC_CREDENTIAL);
            }
        } finally {
            fetch.mockRestore();
        }
    }, 120_000);

    it("prepares an exact real request plan without credentials or network", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden."));
        try {
            const result = await prepareRealSmoke();
            expect(result.status).toBe("prepared-no-request");
            expect(result.migrationCount).toBe(43);
            expect(await validatePreparedRoot(result.isolatedRoot)).toBe(result.isolatedRoot);
            expect(result.plan).toEqual(requestPlan(result.isolatedRoot));
            expect(result.plan.budget.maxOutputTokens).toBe(64);
            expect(result.plan.budget.maxDurationMs).toBe(300_000);
            expect(await readFile(join(result.isolatedRoot, "request-plan.json"), "utf8")).toContain("300000");
            expect(fetch).not.toHaveBeenCalled();
        } finally { fetch.mockRestore(); }
    }, 120_000);

    it("rejects real CLI execution in redirected tools before reading credentials", async () => {
        expect(process.stdin.isTTY === true && process.stdout.isTTY === true).toBe(false);
        await expect(runCli(["real", "unused-root"])).rejects.toThrow(/no credential was read/);
    });

    it("rejects unknown CLI arguments", async () => {
        await expect(runCli(["unexpected"])).rejects.toThrow(/credentials are never arguments/);
    });

    it("rejects redirected terminals before attempting to read input", async () => {
        const input = new PassThrough();
        await expect(readCredentialWithoutEcho(input as never, false)).rejects.toThrow(/no credential was read/);
        expect(input.listenerCount("data")).toBe(0);
    });

    it("rejects arguments and credential environment variables", () => {
        expect(() => validateRunnerInvocation({
            args: ["secret"],
            environment: {},
            inputIsTTY: true,
            outputIsTTY: true,
        })).toThrow(/no command-line arguments/);
        expect(() => validateRunnerInvocation({
            args: [],
            environment: { COSMOS_TEST_API_KEY: "present" },
            inputIsTTY: true,
            outputIsTTY: true,
        })).toThrow(/environment variables are not accepted/);
        expect(() => validateRunnerInvocation({
            args: [],
            environment: {},
            inputIsTTY: false,
            outputIsTTY: true,
        })).toThrow(/no credential was read/);
    });

    it("reads one submitted line with terminal raw mode enabled and always restores the mode", async () => {
        const input = new PassThrough() as PassThrough & {
            isTTY: boolean;
            setRawMode: (enabled: boolean) => void;
        };
        input.isTTY = true;
        const rawMode = vi.fn();
        input.setRawMode = rawMode;
        const pending = readCredentialWithoutEcho(input, true);
        input.write("test-secret\r");
        await expect(pending).resolves.toBe("test-secret");
        expect(rawMode.mock.calls).toEqual([[true], [false]]);
        expect(input.listenerCount("data")).toBe(0);
    });

    it("strips bracketed paste markers so a pasted credential stays byte-exact", async () => {
        // Terminals send pasted text wrapped in ESC[200~ / ESC[201~. Keeping them would corrupt
        // the Authorization header; splitting them across chunks is the realistic case.
        const input = new PassThrough() as PassThrough & {
            isTTY: boolean;
            setRawMode: (enabled: boolean) => void;
        };
        input.isTTY = true;
        input.setRawMode = vi.fn();
        const pending = readCredentialWithoutEcho(input, true);
        input.write("\u001b[20");
        input.write("0~sk-abc\r");
        await expect(pending).resolves.toBe("sk-abc");
    });

    it("rejects a credential that would only fail later as an unexplained provider status", () => {
        // A broken paste costs one real request and comes back as a bare 400, so the shape check
        // has to fail before anything is sent.
        expect(assertUsableCredential("sk-abc123")).toBe("sk-abc123");
        expect(() => assertUsableCredential("")).toThrow(/Empty credential/);
        expect(() => assertUsableCredential("sk-abc 123")).toThrow(/whitespace/);
        expect(() => assertUsableCredential("sk-abc\n")).toThrow(/whitespace/);
        expect(() => assertUsableCredential("sk-ab\u001bc")).toThrow(/non-ASCII/);
        expect(() => assertUsableCredential("sk-ab\u4e2dc")).toThrow(/non-ASCII/);
    });

    it("restores terminal mode after cancellation", async () => {
        const input = new PassThrough() as PassThrough & {
            isTTY: boolean;
            setRawMode: (enabled: boolean) => void;
        };
        input.isTTY = true;
        const rawMode = vi.fn();
        input.setRawMode = rawMode;
        const pending = readCredentialWithoutEcho(input, true);
        input.write("\u0003");
        await expect(pending).rejects.toThrow(/cancelled/);
        expect(rawMode.mock.calls).toEqual([[true], [false]]);
        expect(input.listenerCount("data")).toBe(0);
    });
});

describe("Task 39 model-scoped @2 smoke", () => {
    it("prepares an exact @2 request plan without credentials or network", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden."));
        try {
            const result = await prepareRealSmokeV2();
            expect(result.status).toBe("prepared-no-request");
            expect(result.migrationCount).toBe(44);
            expect(result.plan.schemaOverlay).toMatchObject({ baseCommit: SNAPSHOT_COMMIT, migrationName: "20261111080000_task_42_cache_tiered_pricing", source: "current-working-tree" });
            expect(result.plan.schemaOverlay.files.map((file) => file.path)).toEqual(["schema.prisma", "migrations/20261111080000_task_42_cache_tiered_pricing/migration.sql"]);
            expect(result.plan.schemaOverlay.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
            expect(await validatePreparedRootV2(result.isolatedRoot)).toBe(result.isolatedRoot);
            expect(result.plan).toEqual(requestPlanV2(result.isolatedRoot));
            // 预披露计划绑定服务端配置的模型与服务商，调用方不能覆盖地址或凭证。
            expect(result.plan).toMatchObject({
                mode: "real-v2", providerId: V2_PROVIDER_ID, configuredModelId: V2_CONFIGURED_MODEL_ID,
                budget: { maxDurationMs: 300_000, maxOutputTokens: 64 },
                maxDispatches: 1, maxTransportSends: 1, redirect: "error", sdkLogLevel: "off",
            });
            expect(await readFile(join(result.isolatedRoot, V2_PLAN_FILE), "utf8")).toContain("300000");
            expect(fetch).not.toHaveBeenCalled();
        } finally { fetch.mockRestore(); }
    }, 120_000);

    it("rejects a @1 prepared root and an unplanned @2 root", async () => {
        const v1Root = await mkdtemp(join(ISOLATION_PARENT, "task39-real-"));
        await writeFile(join(v1Root, "request-plan.json"), JSON.stringify(requestPlan(v1Root), null, 4));
        await expect(validatePreparedRootV2(v1Root)).rejects.toThrow(/Only the prepared Task 39 @2 real root/);

        const v2Root = await mkdtemp(join(ISOLATION_PARENT, "task39-real-v2-"));
        // 两个前缀重叠（`task39-real-` 也是 `task39-real-v2-` 的前缀），所以 `@1` 校验必须自己排掉 `@2` 根。
        await expect(validatePreparedRoot(v2Root)).rejects.toThrow(/Only the prepared Task 39 real root/);
        await expect(validatePreparedRootV2(v2Root)).rejects.toThrow();
        await writeFile(join(v2Root, V2_PLAN_FILE), JSON.stringify({ ...requestPlanV2(v2Root), model: "other" }, null, 4));
        await expect(validatePreparedRootV2(v2Root)).rejects.toThrow(/Request plan changed/);
    });

    it("resolves the model, endpoint and credential from the configured model instead of the caller", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
            throw new Error("Network is forbidden in the offline @2 smoke.");
        });
        try {
            const result = await runOfflineV2Smoke();
            expect(result).toMatchObject({
                mode: "offline-v2", status: "completed", migrationCount: 44,
                providerId: V2_PROVIDER_ID, configuredModelId: V2_CONFIGURED_MODEL_ID,
                secretReads: 1, sdkCalls: 2, outputMatchesExpected: true,
                credentialAbsentFromOutput: true, resolvedFromModel: true, maxOutputTokensClamped: true,
                missingSecretRejected: true, deletedRejected: true, retained: true,
            });
            expect(fetch).not.toHaveBeenCalled();
            // 缺凭证与已删除模型必须在解析阶段失败关闭，不能增加 SDK 调用。
            expect(result.sdkCalls).toBe(2);
            for (const name of ["result.json", "application.log.json", "migration.log"]) {
                const text = await readFile(join(result.isolatedRoot, name), "utf8");
                expect(text).not.toContain(SYNTHETIC_CREDENTIAL);
            }
        } finally {
            fetch.mockRestore();
        }
    }, 120_000);

    it("rejects real-v2 CLI execution in redirected tools before reading credentials", async () => {
        expect(process.stdin.isTTY === true && process.stdout.isTTY === true).toBe(false);
        await expect(runCli(["real-v2", "unused-root"])).rejects.toThrow(/no credential was read/);
    });

    it("still rejects unknown CLI arguments after adding the @2 modes", async () => {
        await expect(runCli(["real-v3", "unused-root"])).rejects.toThrow(/credentials are never arguments/);
    });
});

// Worker 不再注册 `agent.invoke@1`，但那次真实验收的装配（凭证按次读取、连接与 SecretRef
// 校验）留在验收脚本里；这些用例保证它仍然 fail closed，而不是跟着生产注册一起被删掉。
describe("Task 39 @1 evidence action composition", () => {
    const connection: ConnectionInstance = {
        id: "connection-1", name: "Test provider credential", connectorId: "custom-auth",
        account: null, scopeJson: null, configJson: null, status: "active", secretRef: "opaque-secret-ref",
        lastError: null, lastCheckedAt: null, version: 1,
        createdAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z",
    };
    const input = {
        provider: "jijiapi", model: "gpt-6-luna",
        messages: [{ role: "user" as const, content: "Say hello in one word." }],
        tools: [], budget: { maxDurationMs: 30_000, maxToolCalls: 0, maxOutputTokens: 64 }, metadata: {},
    };
    const context = { idempotencyKey: "agent-smoke-test", signal: new AbortController().signal };
    const config = { baseUrl: "https://api-slb.jiji.cc/v1", connectionId: "connection-1" };

    const response = () => ({
        role: "assistant" as const, content: [{ type: "text" as const, text: "Hello." }],
        api: "openai-completions" as const, provider: "jijiapi", model: "gpt-6-luna",
        usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop" as const, timestamp: Date.now(),
    });
    const client = (complete: PiAiClient["complete"]): PiAiClient => ({
        getModel: () => ({}) as never, complete,
    });
    const action = (options: {
        getConnection: ReturnType<typeof vi.fn>;
        read: ReturnType<typeof vi.fn>;
        client: PiAiClient;
    }) => new ActionRegistry([createTask39AgentAction({
        connections: { getConnection: options.getConnection as never },
        secrets: { read: options.read as never },
        config,
        client: options.client,
    })]);

    it("reloads credentials per invocation and rejects a subsequently revoked connection", async () => {
        const getConnection = vi.fn().mockResolvedValue(connection);
        const read = vi.fn().mockResolvedValueOnce("first-synthetic-key").mockResolvedValueOnce("rotated-synthetic-key");
        const used: Array<string | undefined> = [];
        const complete = vi.fn<PiAiClient["complete"]>(async (_model, _context, options) => {
            used.push(options.apiKey);
            return response();
        });
        const registry = action({ getConnection, read, client: client(complete) });

        await registry.dispatch("agent.invoke@1", input, context);
        await registry.dispatch("agent.invoke@1", input, context);
        getConnection.mockResolvedValue({ ...connection, status: "revoked" });
        await expect(registry.dispatch("agent.invoke@1", input, context))
            .rejects.toMatchObject({ code: "authentication_required" });
        expect(getConnection).toHaveBeenCalledTimes(3);
        expect(read).toHaveBeenCalledTimes(2);
        expect(used).toEqual(["first-synthetic-key", "rotated-synthetic-key"]);
    });

    it("sanitizes SecretStore failures and never calls the SDK", async () => {
        const complete = vi.fn();
        const registry = action({
            getConnection: vi.fn().mockResolvedValue(connection),
            read: vi.fn().mockRejectedValue(new Error("synthetic-sensitive-detail")),
            client: client(complete as never),
        });
        const error: unknown = await registry.dispatch("agent.invoke@1", input, context)
            .catch((failure: unknown) => failure);
        expect(error).toBeInstanceOf(ActionExecutionError);
        expect(error).toMatchObject({ code: "authentication_required", retryable: false });
        expect(String(error)).not.toContain("synthetic-sensitive-detail");
        expect(complete).not.toHaveBeenCalled();
    });

    it.each(["connection", "secret"] as const)("stops when cancelled during %s lookup", async (stage) => {
        const controller = new AbortController();
        const complete = vi.fn();
        const getConnection = vi.fn(async () => {
            if (stage === "connection") controller.abort();
            return connection;
        });
        const read = vi.fn(async () => {
            controller.abort();
            return "synthetic-key";
        });
        const registry = action({ getConnection, read, client: client(complete as never) });

        await expect(registry.dispatch("agent.invoke@1", input, { ...context, signal: controller.signal }))
            .rejects.toMatchObject({ code: "cancelled" });
        expect(read).toHaveBeenCalledTimes(stage === "connection" ? 0 : 1);
        expect(complete).not.toHaveBeenCalled();
    });

    it("reads the connection SecretRef and only passes its value to pi-ai", async () => {
        let usedCredential: string | undefined;
        let maxTokens: number | undefined;
        const read = vi.fn().mockResolvedValue("test-secret");
        const registry = action({
            getConnection: vi.fn().mockResolvedValue(connection),
            read,
            client: client(async (_model, _context, options) => {
                usedCredential = options.apiKey;
                maxTokens = options.maxTokens;
                return response();
            }),
        });

        const output = await registry.dispatch("agent.invoke@1", input, context);
        expect(output).toMatchObject({ content: "Hello.", provider: "jijiapi", model: "gpt-6-luna" });
        expect(usedCredential).toBe("test-secret");
        expect(maxTokens).toBe(64);
        expect(read).toHaveBeenCalledWith("opaque-secret-ref");
        expect(JSON.stringify(output)).not.toContain("test-secret");
    });

    it.each([
        null,
        { ...connection, status: "revoked" as const },
        { ...connection, secretRef: null },
        { ...connection, id: "different-id" },
    ])("fails closed for a missing, inactive, uncredentialed or mismatched connection", async (configured) => {
        const complete = vi.fn();
        const read = vi.fn();
        const registry = action({
            getConnection: vi.fn().mockResolvedValue(configured),
            read,
            client: client(complete as never),
        });

        await expect(registry.dispatch("agent.invoke@1", input, context)).rejects.toMatchObject({
            name: "ActionExecutionError", code: "authentication_required",
        });
        expect(read).not.toHaveBeenCalled();
        expect(complete).not.toHaveBeenCalled();
    });

    it("does not call pi-ai when the SecretStore has no value", async () => {
        const complete = vi.fn();
        const registry = action({
            getConnection: vi.fn().mockResolvedValue(connection),
            read: vi.fn().mockResolvedValue(null),
            client: client(complete as never),
        });

        await expect(registry.dispatch("agent.invoke@1", input, context))
            .rejects.toMatchObject({ code: "authentication_required" });
        expect(complete).not.toHaveBeenCalled();
    });

    it("does not load the connection when invocation was already cancelled", async () => {
        const cancelled = new AbortController();
        cancelled.abort();
        const getConnection = vi.fn();
        const registry = action({ getConnection, read: vi.fn(), client: client(vi.fn() as never) });

        await expect(registry.dispatch("agent.invoke@1", input, { ...context, signal: cancelled.signal }))
            .rejects.toMatchObject({ code: "cancelled" });
        expect(getConnection).not.toHaveBeenCalled();
    });
});
