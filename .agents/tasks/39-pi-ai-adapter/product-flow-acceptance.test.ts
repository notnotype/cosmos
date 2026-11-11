import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssistantMessage, ProviderStreamOptions } from "@mariozechner/pi-ai";
import type { JsonValue } from "@notnotype/nb-workflow";

import {
    ConfiguredModels,
    ModelProviderCredentials,
    ProviderModelDiscoveryRunner,
} from "@cosmos/application";
import type { PiAiClientV2 } from "@cosmos/agent-pi-ai";
import type { AgentInvocationV2Input } from "@cosmos/contracts";
import {
    PrismaAgentModelResolver,
    PrismaConfiguredModelRepository,
    PrismaProviderCredentialRepository,
    PrismaProviderDiscoveryReader,
    PrismaSystemConfigRepository,
    withModelConfigurationLock,
} from "@cosmos/storage-prisma";

import { withRepository } from "../../../packages/storage-prisma/src/index.fixtures.js";
import { createWorkerAgentInvocationV2Action } from "../../../apps/worker/src/agent-action-v2.js";
import { createWorkflowHost } from "../../../apps/worker/src/workflow-host.js";

/**
 * 任务 39 的端到端验收：把「配置服务商 → 发现模型 → 配置模型 → 执行」
 * 这一条真实产品链路串起来跑一遍。
 *
 * 只有两处是假的：Provider 的 `/models` 出口与模型的 `complete()`。前者在真实环境里是
 * 受控 HTTPS 外呼，本轮不授权真实外呼；后者是计费的模型调用。其余全部是产品代码——
 * 真实隔离数据库、真实迁移、真实 SecretStore、真实 Workflow Host 与 Activity Worker、
 * 真实 Prisma 解析器与 Worker 装配。
 */

const API_KEY = "sk-flow-acceptance-secret";
const PROVIDER_ID = "provider-flow";
const CONNECTION_MODEL_ID = "model-flow";
const WORKFLOW_MANIFEST = "builtin:cosmos.acceptance.agent-flow@1";

function asJson(value: unknown): JsonValue {
    return value as JsonValue;
}

function agentInput(modelId: string): AgentInvocationV2Input {
    return {
        modelId,
        messages: [{ role: "user", content: "Write one sentence about durable workflows." }],
        tools: [],
        budget: { maxDurationMs: 5_000, maxToolCalls: 0, maxOutputTokens: 512 },
        metadata: {},
    };
}

function assistantMessage(): AssistantMessage {
    return {
        role: "assistant",
        content: [{ type: "text", text: "Runs are durable when their steps are journaled." }],
        api: "openai-completions",
        provider: PROVIDER_ID,
        model: "flow-model",
        usage: {
            input: 12,
            output: 9,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 21,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
    };
}

/** 一个只做一步 `agent.invoke@2` 的最小 Workflow：验收关心的是链路，不是编排分支。 */
function acceptanceWorkflow() {
    return {
        key: "cosmos.acceptance.agent-flow",
        version: "1",
        manifestHash: WORKFLOW_MANIFEST,
        run: async (
            workflow: { callAction: <T>(ref: string, input: JsonValue, options?: { key: string }) => Promise<T> },
            rawInput: JsonValue,
        ): Promise<JsonValue> => workflow.callAction<JsonValue>(
            "agent.invoke@2",
            rawInput,
            { key: "agent.invoke" },
        ),
    };
}

async function drain(composition: ReturnType<typeof createWorkflowHost>, runId: string) {
    for (let index = 0; index < 60; index += 1) {
        await composition.runLane.pollOnce();
        await composition.activityWorker.pollOnce();
        await composition.completionDispatcher.pollOnce();
        const current = await composition.store.loadWorkflowEnvelope(runId);
        if (!current) continue;
        if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
            return current;
        }
    }
    throw new Error(`Workflow ${runId} did not reach a terminal state.`);
}

async function startRun(
    composition: ReturnType<typeof createWorkflowHost>,
    input: AgentInvocationV2Input,
): Promise<string> {
    const runId = `run-${randomUUID()}`;
    await composition.store.createWorkflowEnvelope({
        runId,
        definition: {
            key: "cosmos.acceptance.agent-flow",
            version: "1",
            manifestHash: WORKFLOW_MANIFEST,
        },
        inputSnapshot: asJson(input),
        productRun: asJson({ status: "queued" }),
    });
    return runId;
}

describe("Task 39 产品流程端到端验收", () => {
    it("把已选模型跑成一次真实的 WorkflowRun", async () => {
        await withRepository("task39-product-flow", async (repository, prisma) => {
            // 1. 配置服务商与它的凭证：走真实的应用服务、幂等键与 SecretStore。
            const credentials = new ModelProviderCredentials({
                repository: new PrismaProviderCredentialRepository(prisma),
                secrets: repository.secrets,
                lock: (id, use) => withModelConfigurationLock(repository.roots.dataRoot, id, use),
                // 锁把操作 ID 当文件名用，因此这里必须是 UUID 形态而不是任意字符串。
                operationId: () => randomUUID(),
            });
            const saved = await credentials.save({
                idempotencyKey: "provider-configuration-1",
                providerId: PROVIDER_ID,
                command: {
                    name: "Flow Provider",
                    api: "openai-completions",
                    baseUrl: "https://flow.example.com/v1",
                    apiKey: API_KEY,
                },
            });
            expect(saved).toMatchObject({ providerId: PROVIDER_ID, state: "completed", resourceVersion: 1 });

            // 2. 发现模型：只有出口是假的，其余是真实的读取器与解析器。
            const requested: Array<{ url: string; bearerToken: string }> = [];
            const discovery = new ProviderModelDiscoveryRunner({
                reader: new PrismaProviderDiscoveryReader(prisma),
                secrets: repository.secrets,
                directory: {
                    requestModels: async (input) => {
                        requested.push(input);
                        return { status: 200, body: { data: [{ id: "flow-model", name: "Flow Model" }] } };
                    },
                },
                ids: { nextId: (prefix) => `${prefix}-1` },
                clock: { now: () => new Date("2026-10-20T00:00:00.000Z") },
            });
            const discovered = await discovery.discover({
                providerId: PROVIDER_ID,
                expectedProviderVersion: 1,
            });
            expect(requested).toEqual([{
                url: "https://flow.example.com/v1/models",
                bearerToken: API_KEY,
            }]);
            expect(discovered.status).toBe("succeeded");
            expect(discovered.candidates).toEqual([{ modelId: "flow-model", name: "Flow Model" }]);
            expect(JSON.stringify(discovered)).not.toContain(API_KEY);

            // 3. 把候选里选中的模型配置成可调用模型（预算必须由用户给出，不能从目录推断）。
            const models = new ConfiguredModels(
                new PrismaConfiguredModelRepository(prisma),
                () => CONNECTION_MODEL_ID,
            );
            const model = await models.create(PROVIDER_ID, {
                modelId: "flow-model",
                name: "Flow Model",
                contextWindow: 8_192,
                maxOutputTokens: 1_024,
                inputPricePerMillion: 0, outputPricePerMillion: 0,
                cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0,
            });
            expect(model).toMatchObject({ id: CONNECTION_MODEL_ID, providerId: PROVIDER_ID, version: 1 });

            // 4. 用 Worker 的正式装配跑一次 WorkflowRun，直接传入 modelId。
            const calls: Array<{ model: unknown; options: ProviderStreamOptions }> = [];
            const client: PiAiClientV2 = {
                complete: async (model_, _context, options) => {
                    calls.push({ model: model_, options });
                    return assistantMessage();
                },
            };
            const composition = createWorkflowHost({
                prisma: repository.prisma,
                blobs: repository.blobs,
                definitions: [acceptanceWorkflow()],
                actions: [createWorkerAgentInvocationV2Action({
                    models: new PrismaAgentModelResolver(
                        prisma,
                        new PrismaSystemConfigRepository(prisma)
                    ),
                    secrets: repository.secrets,
                    client,
                })],
                owner: "task39-acceptance",
                leaseMs: 60_000,
            });

            const completedRunId = await startRun(composition, agentInput(CONNECTION_MODEL_ID));
            const completed = await drain(composition, completedRunId);
            expect(completed.status).toBe("completed");

            const jobs = await prisma.job.findMany({ where: { workflowRunId: completedRunId } });
            const activity = jobs.find((job) => job.resultJson !== null);
            expect(activity?.status).toBe("succeeded");
            const output = JSON.parse(activity!.resultJson!) as Record<string, unknown>;
            expect(output).toMatchObject({
                content: "Runs are durable when their steps are journaled.",
                provider: PROVIDER_ID,
                model: "flow-model",
                finishReason: "stop",
                usage: { inputTokens: 12, outputTokens: 9, totalTokens: 21 },
            });
            // 模型与地址来自模型解析结果，不是调用方声明的。
            expect(calls).toHaveLength(1);
            expect(calls[0]!.model).toMatchObject({
                api: "openai-completions",
                provider: PROVIDER_ID,
                baseUrl: "https://flow.example.com/v1",
                id: "flow-model",
            });
            expect(calls[0]!.options.apiKey).toBe(API_KEY);

            // 凭证只能落在 SecretStore 里：数据库文件（含 WAL）不该出现它。
            const databaseBytes = `${await readFile(repository.roots.databasePath, "utf8")}`;
            const walPath = `${repository.roots.databasePath}-wal`;
            const walBytes = await readFile(walPath, "utf8").catch(() => "");
            expect(`${databaseBytes}${walBytes}`).not.toContain(API_KEY);

            // 5. 删除模型后同一条链路必须失败关闭，且不再发出任何模型调用。
            await models.delete(PROVIDER_ID, CONNECTION_MODEL_ID, model.version);
            const failedRunId = await startRun(composition, agentInput(CONNECTION_MODEL_ID));
            const failed = await drain(composition, failedRunId);
            expect(failed.status).toBe("failed");
            const failedJob = (await prisma.job.findMany({ where: { workflowRunId: failedRunId } }))
                .find((job) => job.errorCode !== null);
            expect(failedJob).toMatchObject({ status: "failed_terminal", errorCode: "authentication_required" });
            expect(calls).toHaveLength(1);
        });
    }, 300_000);
});

// 上面这条用例覆盖的是「完整产品流程」的编排：真实持久化 + 真实执行器 + 真实凭证读取。
// 未覆盖的部分写在 Task walkthrough 的「未验证」里：真实 Provider 外呼、真实服务启动与
// 浏览器验收，都需要单独授权，不能用这条用例替代。
void join;
