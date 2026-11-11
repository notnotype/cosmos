import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { ActionRegistry, ConfiguredModels, ModelProviderCredentials } from "@cosmos/application";
import type { PiAiClientV2 } from "@cosmos/agent-pi-ai";
import { agentInvocationOutputSchema } from "@cosmos/contracts";
import {
    PrismaAgentModelResolver,
    PrismaConfiguredModelRepository,
    PrismaCosmosRepository,
    PrismaProviderCredentialRepository,
    PrismaSystemConfigRepository,
    withModelConfigurationLock,
} from "@cosmos/storage-prisma";
import { createWorkerAgentInvocationV2Action } from "../../../apps/worker/src/agent-action-v2.js";
import {
    ISOLATION_PARENT, SNAPSHOT_COMMIT, SYNTHETIC_CREDENTIAL,
    assertUsableCredential, createCountingLogger, createSafeDiagnostics, model, prepareDatabase, provider,
    readCredentialWithoutEcho, validateRunnerInvocation, withBoundedProviderTransport, modelPricingOverlayMetadata, snapshotPath,
} from "./connection-smoke-harness.js";
import type { DiagnosticStage } from "./connection-smoke-harness.js";

// `agent.invoke@2` 的请求形状：调用方给 `modelId`（可选），模型、地址与凭证由服务端
// 按 modelId（或默认模型）→ Provider → SecretStore 解析。

export const V2_PROVIDER_ID = "provider-task39-v2";
export const V2_CONFIGURED_MODEL_ID = "model-task39-v2";
export const V2_ROOT_PREFIX = "task39-real-v2-";
export const V2_OFFLINE_ROOT_PREFIX = "task39-offline-v2-";
export const V2_PLAN_FILE = "request-plan-v2.json";
export const V2_BASE_URL = "https://api-slb.jiji.cc/v1";
const V2_OFFLINE_BASE_URL = "https://task39-v2.invalid/v1";

export interface OfflineV2Request {
    provider: string;
    model: string;
    baseUrl: string;
    apiKey: string | undefined;
    maxTokens: number | undefined;
}

export function createOfflineV2Client(requests: OfflineV2Request[] = []): PiAiClientV2 {
    return {
        complete: async (configuredModel, context, options) => {
            requests.push({
                provider: configuredModel.provider, model: configuredModel.id,
                baseUrl: configuredModel.baseUrl, apiKey: options.apiKey, maxTokens: options.maxTokens,
            });
            if (options.apiKey !== SYNTHETIC_CREDENTIAL ||
                context.messages.length !== 1 || context.messages[0]?.role !== "user") {
                throw new Error("Offline @2 SDK request did not satisfy its contract.");
            }
            return {
                role: "assistant", content: [{ type: "text", text: "OK" }],
                api: "openai-completions", provider: configuredModel.provider, model: configuredModel.id,
                usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: "stop", timestamp: Date.now(),
            };
        },
    };
}

/**
 * 按产品的真实写入路径造数：凭证走 `ModelProviderCredentials`（幂等键 + 锁 + SecretStore），
 * 模型走 `ConfiguredModels`，连接只挑模型。@2 能否解析出来取决于这三步真实落库，
 * 直接插库会让验收绕过凭证归属规则。
 */
export async function configureModelConnection(
    repository: PrismaCosmosRepository,
    credential: string,
    baseUrl: string,
    step: <T>(stage: DiagnosticStage, use: () => Promise<T>) => Promise<T> = (_stage, use) => use(),
): Promise<{ modelId: string; secretRef: string }> {
    const credentials = new ModelProviderCredentials({
        repository: new PrismaProviderCredentialRepository(repository.prisma),
        secrets: repository.secrets,
        lock: (id, use) => withModelConfigurationLock(repository.roots.dataRoot, id, use),
        // 锁把操作 ID 当文件名用，必须是每次独立的操作标识而不是固定字符串。
        operationId: () => randomUUID(),
    });
    await step("provider_configure", () => credentials.save({
        idempotencyKey: "task39-v2-provider",
        providerId: V2_PROVIDER_ID,
        command: { name: "Task 39 v2 verification", api: "openai-completions", baseUrl, apiKey: credential },
    }));
    const models = new ConfiguredModels(
        new PrismaConfiguredModelRepository(repository.prisma),
        () => V2_CONFIGURED_MODEL_ID,
    );
    await step("model_configure", () => models.create(V2_PROVIDER_ID, {
        modelId: model, name: "Task 39 v2 verification model",
        contextWindow: 262_144, maxOutputTokens: 64,
        // These isolated fixture rates are unrelated to the provider's actual billing.
        inputPricePerMillion: 0, outputPricePerMillion: 0, cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0,
    }));
    const providerRow = await repository.prisma.modelProvider.findUnique({
        where: { id: V2_PROVIDER_ID }, select: { secretRef: true },
    });
    if (!providerRow?.secretRef) throw new Error("Provider credential was not stored.");
    return { modelId: V2_CONFIGURED_MODEL_ID, secretRef: providerRow.secretRef };
}

export async function dispatchInvocationV2(
    repository: PrismaCosmosRepository,
    modelId: string,
    client?: PiAiClientV2,
    maxOutputTokens = 64,
) {
    let secretReads = 0;
    const action = createWorkerAgentInvocationV2Action({
        models: new PrismaAgentModelResolver(
            repository.prisma,
            new PrismaSystemConfigRepository(repository.prisma)
        ),
        secrets: {
            put: (ref, value) => repository.secrets.put(ref, value),
            delete: (ref) => repository.secrets.delete(ref),
            read: (ref) => { secretReads += 1; return repository.secrets.read(ref); },
        },
        client,
    });
    const output = agentInvocationOutputSchema.parse(await new ActionRegistry([action]).dispatch("agent.invoke@2", {
        modelId,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        tools: [],
        budget: { maxDurationMs: 300_000, maxToolCalls: 0, maxOutputTokens },
        metadata: {},
    }, { idempotencyKey: "task39-v2", signal: AbortSignal.timeout(305_000) }));
    if (JSON.stringify(output).includes(SYNTHETIC_CREDENTIAL)) throw new Error("Credential detected in output.");
    return {
        provider: output.provider, model: output.model, usage: output.usage,
        outputMatchesExpected: output.content === "OK", credentialAbsentFromOutput: true, secretReads,
    };
}

function expectAuthenticationRequired(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "authentication_required";
}

export async function runOfflineV2Smoke() {
    await mkdir(ISOLATION_PARENT, { recursive: true });
    const root = await mkdtemp(join(ISOLATION_PARENT, V2_OFFLINE_ROOT_PREFIX));
    const { databaseUrl, migrationCount } = await prepareDatabase(root, { modelPricingOverlay: true });
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const logs: unknown[] = [];
    const repository = new PrismaCosmosRepository({ dataRoot: root, prisma, logger: createCountingLogger(logs) });
    const requests: OfflineV2Request[] = [];
    try {
        await repository.initialize();
        const configured = await configureModelConnection(repository, SYNTHETIC_CREDENTIAL, V2_OFFLINE_BASE_URL);
        const first = await dispatchInvocationV2(repository, configured.modelId, createOfflineV2Client(requests));
        // 调用方要求更大的输出预算时，仍然只能按模型配置的上限发送。
        await dispatchInvocationV2(repository, configured.modelId, createOfflineV2Client(requests), 4_096);
        // 凭证被删除后必须失败关闭，且不再发出任何模型调用。
        await repository.secrets.delete(configured.secretRef);
        let missingSecretRejected = false;
        try { await dispatchInvocationV2(repository, configured.modelId, createOfflineV2Client(requests)); }
        catch (error: unknown) { missingSecretRejected = expectAuthenticationRequired(error); }
        if (!missingSecretRejected) throw new Error("Missing Secret did not fail closed.");
        // 恢复凭证，确保删除模型场景独立受到测试（不受凭证缺失干扰）。
        await repository.secrets.put(configured.secretRef, SYNTHETIC_CREDENTIAL);
        let deletedRejected = false;
        try {
            // 模型被删除后同样失败关闭：@2 的可用性由模型配置决定，不看进程启动配置。
            await repository.prisma.configuredModel.delete({ where: { id: configured.modelId } });
            try { await dispatchInvocationV2(repository, configured.modelId, createOfflineV2Client(requests)); }
            catch (error: unknown) { deletedRejected = expectAuthenticationRequired(error); }
            if (!deletedRejected) throw new Error("A deleted model did not fail closed.");
        } finally {
            // 清理恢复的凭证，避免隔离根残留密钥。
            await repository.secrets.delete(configured.secretRef);
        }
        if (requests.length !== 2) throw new Error("Rejected calls still reached the SDK.");
        const result = {
            status: "completed", mode: "offline-v2", isolatedRoot: root, snapshotCommit: SNAPSHOT_COMMIT,
            migrationCount, schemaOverlay: modelPricingOverlayMetadata(), ...first, providerId: V2_PROVIDER_ID, configuredModelId: V2_CONFIGURED_MODEL_ID,
            sdkCalls: requests.length,
            // 模型、地址与凭证都由模型解析结果决定，不是调用方声明的；Provider 记的是配置行 ID
            // （`V2_PROVIDER_ID`），不是上游模型品牌名。
            resolvedFromModel: requests.every((request) =>
                request.provider === V2_PROVIDER_ID && request.model === model && request.baseUrl === V2_OFFLINE_BASE_URL),
            maxOutputTokensClamped: requests.every((request) => request.maxTokens === 64),
            missingSecretRejected, deletedRejected, retained: true,
        };
        await repository.close();
        if (JSON.stringify(logs).includes(SYNTHETIC_CREDENTIAL)) throw new Error("Credential detected in logs.");
        await writeFile(join(root, "application.log.json"), JSON.stringify(logs, null, 4));
        await writeFile(join(root, "result.json"), JSON.stringify(result, null, 4));
        return result;
    } finally {
        await prisma.$disconnect();
    }
}

export function requestPlanV2(root: string) {
    return {
        mode: "real-v2", isolatedRoot: root, snapshotCommit: SNAPSHOT_COMMIT,
        schemaOverlay: modelPricingOverlayMetadata(), schemaOverlayManifest: "model-pricing-overlay-manifest.json",
        providerId: V2_PROVIDER_ID, configuredModelId: V2_CONFIGURED_MODEL_ID,
        provider, model, api: "openai-completions", baseUrl: V2_BASE_URL,
        messages: [{ role: "user", content: "Reply with exactly: OK" }], tools: [], metadata: {},
        budget: { maxDurationMs: 300_000, maxToolCalls: 0, maxOutputTokens: 64 },
        idempotencyKey: "task39-v2", maxDispatches: 1, maxTransportSends: 1,
        redirect: "error", sdkLogLevel: "off", automaticDirectoryCleanup: false,
    };
}

export async function prepareRealSmokeV2() {
    await mkdir(ISOLATION_PARENT, { recursive: true });
    const root = await mkdtemp(join(ISOLATION_PARENT, V2_ROOT_PREFIX));
    const database = await prepareDatabase(root, { modelPricingOverlay: true });
    await writeFile(join(root, V2_PLAN_FILE), JSON.stringify(requestPlanV2(root), null, 4), { flag: "wx" });
    return { status: "prepared-no-request", isolatedRoot: root, ...database, plan: requestPlanV2(root) };
}

export async function validatePreparedRootV2(root: string): Promise<string> {
    const resolved = await realpath(root);
    const parent = await realpath(ISOLATION_PARENT);
    if (dirname(resolved) !== parent || !resolved.startsWith(join(parent, V2_ROOT_PREFIX))) {
        throw new Error("Only the prepared Task 39 @2 real root is accepted.");
    }
    const plan = JSON.parse(await readFile(join(resolved, V2_PLAN_FILE), "utf8")) as unknown;
    if (JSON.stringify(plan) !== JSON.stringify(requestPlanV2(resolved))) throw new Error("Request plan changed.");
    const overlay = modelPricingOverlayMetadata();
    if (JSON.stringify(JSON.parse(await readFile(join(resolved, "model-pricing-overlay-manifest.json"), "utf8"))) !== JSON.stringify(overlay)) {
        throw new Error("Model pricing overlay changed.");
    }
    for (const file of overlay.files) {
        const bytes = await readFile(join(resolved, "model-pricing-schema", snapshotPath, file.path));
        if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Model pricing overlay changed.");
    }
    return resolved;
}

export async function runRealSmokeV2(root: string) {
    // These checks precede any credential prompt, filesystem writes, or SDK request.
    validateRunnerInvocation({ args: [], environment: process.env,
        inputIsTTY: process.stdin.isTTY === true, outputIsTTY: process.stdout.isTTY === true });
    const prepared = await validatePreparedRootV2(root);
    process.stdout.write(JSON.stringify(requestPlanV2(prepared)) + "\n");
    process.stdout.write("Only after separate approval for this exact request, type APPROVED (input hidden): ");
    if (await readCredentialWithoutEcho(process.stdin, true) !== "APPROVED") {
        throw new Error("Request confirmation missing.");
    }
    await writeFile(join(prepared, "attempted.json"), JSON.stringify({ attemptedAt: new Date().toISOString() }), { flag: "wx" });
    process.stdout.write("\nProvider credential (input hidden): ");
    const diagnostics = createSafeDiagnostics();
    let credential = "";
    let prisma: PrismaClient | undefined;
    let repository: PrismaCosmosRepository | undefined;
    let storedSecretRef: string | null = null;
    try {
        credential = await diagnostics.step("credential_input", async () => {
            const value = await readCredentialWithoutEcho(process.stdin, true);
            // A stray trailing space or newline makes the Authorization header invalid; the
            // provider then answers 400 and the diagnostic only shows a status code.
            return assertUsableCredential(value.trim());
        });
        process.stdout.write("\n");
        const logger = createCountingLogger();
        const active = await diagnostics.step("database_initialize", async () => {
            prisma = new PrismaClient({ datasources: { db: {
                url: `file:${join(prepared, "cosmos.sqlite").replaceAll("\\", "/")}`,
            } } });
            const instance = new PrismaCosmosRepository({ dataRoot: prepared, prisma, logger });
            repository = instance;
            await instance.initialize();
            return instance;
        });
        const configured = await configureModelConnection(active, credential, requestPlanV2(prepared).baseUrl,
            (stage, use) => diagnostics.step(stage, use));
        storedSecretRef = configured.secretRef;
        let responseStatus: number | null = null;
        let responseReturned = false;
        const summary = await diagnostics.step("dispatch", () => withBoundedProviderTransport(
            () => dispatchInvocationV2(active, configured.modelId),
            globalThis.fetch, () => { diagnostics.record.transportSends += 1; }, (response) => {
                responseReturned = true;
                responseStatus = response.status;
                diagnostics.record.response = { returned: true, status: response.status };
            }));
        const result = { status: "completed", mode: "real-v2", isolatedRoot: prepared, ...summary,
            logEvents: logger.count(), responseStatus, responseReturned,
            providerBodyRecorded: false, retained: true };
        await diagnostics.step("result_write", () => writeFile(join(prepared, "result.json"), JSON.stringify(result, null, 4)));
        diagnostics.record.status = "completed";
        return result;
    } finally {
        credential = "";
        // Cleanup failures are independent evidence and must not erase the first failure.
        if (repository && storedSecretRef) {
            const ref = storedSecretRef;
            try {
                await diagnostics.step("secret_delete", () => repository!.secrets.delete(ref));
                diagnostics.record.cleanup.secretDelete = "completed";
            } catch { diagnostics.record.cleanup.secretDelete = "failed"; }
        }
        if (prisma) {
            try {
                await diagnostics.step("disconnect", () => prisma!.$disconnect());
                diagnostics.record.cleanup.disconnect = "completed";
            } catch { diagnostics.record.cleanup.disconnect = "failed"; }
        }
        const text = JSON.stringify(diagnostics.record);
        // Fixed-schema console fallback remains available if the diagnostic file cannot be written.
        try { await writeFile(join(prepared, "diagnostic.json"), text, { flag: "wx" }); }
        catch { process.stderr.write("Task 39 @2 diagnostic file unavailable.\n"); }
        process.stderr.write(text + "\n");
        if (diagnostics.record.status === "failed") process.exitCode = 1;
    }
}
