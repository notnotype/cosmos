import { z } from "zod";

import {
    type AnyWorkflowDefinition,
    type DeferredActivityCompletionInput,
    type JsonValue,
    type RunView,
} from "@notnotype/nb-workflow";
import type { ActionDefinition } from "@cosmos/contracts";

import type {
    WorkflowActivityJobClaim,
    WorkflowCompletionClaim,
    WorkflowEnvelope,
    WorkflowHostStore,
    WorkflowRunLease,
} from "./workflow-host.js";

// Workflow Host runtime 用例共用的输入构造器。22 条用例用的是同一套身份
// （run-1 / job-1 / completion-1），把这些字面量留在用例里只会让「这条用例的前提是什么」
// 被两百行样板盖住；所以前提放这里，断言留在用例里。

export const clock = new Date("2026-08-14T00:00:00.000Z");
export const definition = {
    key: "demo.workflow",
    version: "1",
    manifestHash: "sha256:demo-workflow",
    run: async () => ({ ok: true }),
} satisfies AnyWorkflowDefinition;
export const envelope: WorkflowEnvelope = {
    runId: "run-1",
    idempotencyKey: "enqueue-1",
    definition: {
        key: definition.key,
        version: definition.version,
        manifestHash: definition.manifestHash!,
    },
    inputSnapshot: { value: "input" },
    productRun: { status: "queued" },
    status: "queued",
    resumeRequired: false,
    createdAt: clock.toISOString(),
    updatedAt: clock.toISOString(),
    startedAt: null,
    finishedAt: null,
};
export const runLease: WorkflowRunLease = {
    runId: "run-1",
    owner: "worker-1",
    leaseToken: "run-token",
    leaseExpiresAt: new Date(clock.getTime() + 10_000).toISOString(),
};

export function view(status: RunView["status"] = "waiting"): RunView {
    return {
        runId: "run-1",
        workflowKey: definition.key,
        workflowVersion: definition.version!,
        workflowManifestHash: definition.manifestHash!,
        status,
        resumeRequired: false,
        cancelRequestedAt: null,
        budget: null,
        checkpoint: null,
        pendingAsks: [],
        pendingWaits: [],
        pendingActivities: [],
        activityCompletions: [],
        logs: [],
        progress: null,
        journal: [],
        revision: 1,
        createdAt: clock.toISOString(),
        updatedAt: clock.toISOString(),
    };
}

export const agentInput = {
    provider: "fake",
    model: "test-model",
    messages: [{ role: "user" as const, content: "Summarize this." }],
    tools: [],
    budget: { maxDurationMs: 5_000, maxToolCalls: 0, maxOutputTokens: 128 },
    metadata: {},
};

export const agentOutput = {
    content: "A short result.",
    toolCalls: [],
    usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 },
    provider: "fake",
    model: "test-model",
    finishReason: "stop" as const,
    metadata: {},
};

export function actionDefinition(
    executionPlacement: ActionDefinition["executionPlacement"] = "trusted_worker",
): ActionDefinition {
    return {
        ref: "demo.echo@1",
        kind: "transform",
        description: "Echo an input value.",
        capabilities: ["demo:echo"],
        executionPlacement,
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ echoed: z.string() }),
        execution: {
            idempotent: true,
            supportsCancellation: true,
            timeoutMs: null,
            retryPolicy: null,
        },
    };
}

export function activityJob(): WorkflowActivityJobClaim {
    return {
        id: "job-1",
        workflowRunId: runLease.runId,
        kernelRevision: 1,
        kind: "workflow-activity",
        status: "leased",
        payload: {
            runId: runLease.runId,
            activity: {
                key: "root#0",
                path: "root",
                seq: 0,
                kind: "action",
                fingerprint: "sha256:activity",
            },
            reference: "demo.echo@1",
            input: { value: "hello" },
            options: { timeoutMs: 1000 },
            idempotencyKey: "run-1:root#0:sha256:activity",
        },
        attempts: 1,
        maxAttempts: 3,
        leaseOwner: "worker-1",
        leaseToken: "job-token",
        leaseExpiresAt: new Date(clock.getTime() + 10_000).toISOString(),
        createdAt: clock.toISOString(),
        updatedAt: clock.toISOString(),
    };
}

export function completion(): WorkflowCompletionClaim {
    const job = activityJob();
    const input: DeferredActivityCompletionInput = {
        activityKey: job.payload.activity.key,
        receipt: job.id,
        reference: job.payload.reference,
        fingerprint: job.payload.activity.fingerprint,
        status: "completed",
        result: { echoed: "hello" },
    };
    return {
        id: "completion-1",
        workflowRunId: runLease.runId,
        jobId: job.id,
        activityKey: input.activityKey,
        receipt: input.receipt,
        reference: input.reference,
        fingerprint: input.fingerprint,
        completion: input,
        status: "leased",
        attempts: 1,
        maxAttempts: 5,
        availableAt: clock.toISOString(),
        leaseOwner: "worker-1",
        leaseToken: "completion-token",
        leaseExpiresAt: new Date(clock.getTime() + 10_000).toISOString(),
        lastError: null,
        createdAt: clock.toISOString(),
        updatedAt: clock.toISOString(),
    };
}

export function fakeStore(overrides: Record<string, unknown> = {}): WorkflowHostStore {
    return {
        claimRun: async () => runLease,
        heartbeatRun: async () => true,
        releaseRun: async () => true,
        loadWorkflowEnvelope: async () => envelope,
        hasWorkflowKernelState: async () => false,
        createWorkflowEnvelope: async () => envelope,
        startAction: async () => ({
            status: "pending",
            receipt: "job-1",
            reason: "workflow-activity",
        }),
        claimActivityJob: async () => activityJob(),
        heartbeatActivityJob: async () => true,
        consumeActivityDispatch: async () => ({ accepted: true, alreadyConsumed: false }),
        completeActivity: async () => ({
            accepted: true,
            jobStatus: "succeeded",
            completion: null,
        }),
        claimWorkflowCompletion: async () => completion(),
        heartbeatWorkflowCompletion: async () => true,
        deliverWorkflowCompletion: async () => true,
        requeueWorkflowCompletion: async () => true,
        deadLetterWorkflowCompletion: async () => true,
        markResumeRequired: async () => true,
        listRunsForRecovery: async () => [envelope],
        ...overrides,
    } as unknown as WorkflowHostStore;
}

export function runnerFactory(
    onCreate: (options: Record<string, unknown>) => void,
    behavior: {
        begin?: () => Promise<RunView>;
        rerun?: () => Promise<RunView>;
        completeActivity?: () => Promise<RunView>;
    } = {},
) {
    return (options: Record<string, unknown>) => {
        onCreate(options);
        return {
            begin: (_definition: AnyWorkflowDefinition, _args: JsonValue) => ({
                runId: "run-1",
                done: behavior.begin?.() ?? Promise.resolve(view()),
            }),
            rerun: async () => behavior.rerun?.() ?? view(),
            completeActivity: async () => behavior.completeActivity?.() ?? view("completed"),
        };
    };
}
