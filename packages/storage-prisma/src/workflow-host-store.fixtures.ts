import { canonicalJson, fingerprint, type ActivityExecutionRequest, type DeferredActivityCompletionInput } from "@notnotype/nb-workflow";
import type { RetryPolicy } from "@cosmos/contracts";
import type { TestDatabase } from "./index.fixtures.js";
import { PrismaWorkflowHostStore } from "./workflow-host-store.js";

export const definition = {
    key: "cosmos.ingest",
    version: "1",
    manifestHash: "sha256:cosmos-ingest",
} as const;

export const inputSnapshot = {
    sourceId: "source-1",
    cursor: null,
};

export const productRun = {
    status: "queued",
    sourceId: "source-1",
    triggerKind: "manual",
};

/**
 * 用例侧的 store 组合：在调用方给的隔离数据库上部署当前 schema，再开一个已登记的客户端。
 * 根、客户端登记与清理都归 `withTestDatabase`，这里只负责建 store。
 */
export function createStore(
    database: TestDatabase,
    options: { actionRetryPolicies?: Readonly<Record<string, RetryPolicy>> } = {},
): PrismaWorkflowHostStore {
    database.deploy();
    return new PrismaWorkflowHostStore(database.openClient(), options);
}

export async function createRunningRun(
    store: PrismaWorkflowHostStore,
    runId: string,
    owner = "run-worker",
    now?: Date,
) {
    await store.createWorkflowEnvelope({
        runId,
        idempotencyKey: `${runId}:enqueue`,
        definition,
        inputSnapshot,
        productRun,
    });
    const lease = await store.claimRun({ owner, leaseMs: 60_000, runId, ...(now ? { now } : {}) });
    if (!lease) {
        throw new Error("expected Run lease");
    }
    return lease;
}
export function activityRequest(runId: string, idempotencyKey: string): ActivityExecutionRequest {
    return {
        reference: "library.ingest@1",
        input: { sourceId: "source-1" },
        options: { timeoutMs: 1000, metadata: { sourceId: "source-1" } },
        context: {
            runId,
            idempotencyKey,
            signal: new AbortController().signal,
            activity: {
                key: `activity:${idempotencyKey}`,
                path: "root",
                seq: 0,
                kind: "action",
                fingerprint: `sha256:${idempotencyKey}`,
            },
        },
    };
}

export function completionFor(
    request: ActivityExecutionRequest,
    receipt: string,
    completion: Pick<DeferredActivityCompletionInput, "status" | "result" | "error">,
): DeferredActivityCompletionInput {
    return {
        activityKey: request.context.activity.key,
        receipt,
        reference: request.reference,
        fingerprint: request.context.activity.fingerprint,
        ...completion,
    };
}
export async function acceptCompletionInKernel(
    store: PrismaWorkflowHostStore,
    request: ActivityExecutionRequest,
    completion: DeferredActivityCompletionInput,
    terminal = false,
): Promise<void> {
    const row = await store.prisma.workflowRun.findUniqueOrThrow({
        where: { id: request.context.runId },
    });
    const state = JSON.parse(row.stateJson) as Record<string, unknown>;
    const pending = Array.isArray(state.pendingActivities) ? state.pendingActivities : [];
    const record = {
        ...(pending.find((item): item is Record<string, unknown> => (
            typeof item === "object" && item !== null && "key" in item
        )) ?? {}),
        status: completion.status,
        completionFingerprint: fingerprint({
            activityKey: completion.activityKey,
            receipt: completion.receipt,
            reference: completion.reference,
            fingerprint: completion.fingerprint,
            status: completion.status,
            hasResult: Object.prototype.hasOwnProperty.call(completion, "result"),
            result: completion.result === undefined ? null : completion.result,
            hasError: Object.prototype.hasOwnProperty.call(completion, "error"),
            error: completion.error === undefined ? null : completion.error,
        }),
        ...(completion.result === undefined ? {} : { result: { kind: "inline", value: completion.result } }),
        ...(completion.error === undefined ? {} : { error: completion.error }),
        completedAt: "2026-08-14T00:00:00.000Z",
    };
    await store.prisma.workflowRun.update({
        where: { id: row.id },
        data: {
            stateJson: canonicalJson({
                ...state,
                status: terminal ? "completed" : "running",
                pendingActivities: terminal ? [] : state.pendingActivities,
                activityCompletions: [record],
                revision: row.kernelRevision,
            }),
            status: terminal ? "completed" : "running",
        },
    });
}
export async function seedPendingActivity(
    store: PrismaWorkflowHostStore,
    request: ActivityExecutionRequest,
    receipt: string,
): Promise<void> {
    const row = await store.prisma.workflowRun.findUnique({
        where: { id: request.context.runId },
    });
    if (!row) throw new Error("expected WorkflowRun fixture");
    const now = "2026-08-14T00:00:00.000Z";
    const state = {
        runId: row.id,
        definition: {
            key: row.definitionKey,
            version: row.definitionVersion,
            manifestHash: row.manifestHash,
        },
        input: { kind: "inline", value: inputSnapshot },
        extensionContext: {},
        status: "waiting",
        resumeRequired: false,
        cancelRequestedAt: null,
        budget: null,
        checkpoint: null,
        pendingAsks: [],
        pendingWaits: [],
        pendingActivities: [{
            kind: "action",
            key: request.context.activity.key,
            path: request.context.activity.path,
            seq: request.context.activity.seq,
            fingerprint: request.context.activity.fingerprint,
            reference: request.reference,
            receipt,
            reason: "workflow-activity",
            stateRevision: row.kernelRevision,
            createdAt: now,
        }],
        activityCompletions: [],
        logs: [],
        progress: null,
        journal: [],
        revision: row.kernelRevision,
        createdAt: row.createdAt.toISOString(),
        updatedAt: now,
    };
    await store.prisma.workflowRun.update({
        where: { id: row.id },
        data: {
            stateJson: canonicalJson(state),
            status: "waiting",
            resumeRequired: false,
        },
    });
}
