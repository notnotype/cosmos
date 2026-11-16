import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { RetryPolicy } from "@cosmos/contracts";
import { canonicalJson, type ActivityExecutionRequest, type DeferredActivityStartResult } from "@notnotype/nb-workflow";
import { WorkflowHostConflictError, WorkflowHostError, type ConsumeActivityDispatchInput, type ConsumeActivityDispatchResult, type WorkflowActivityJobPayload } from "@cosmos/application";
import { ACTIVITY_KIND, DEFAULT_MAX_ATTEMPTS, type ActivityJobRow, type WorkflowRunRow, assertValidDate, isTerminalRunStatus, isUniqueConstraintError, parseJson } from "./internals-core.js";
import { activityIdentityJson, existingActionResult, normalizeActivityJobLease, normalizeActivityRequest, normalizeRunLease, parseActivityPayload, pendingActivityForState } from "./internals-activity.js";
import { hasCurrentRunLease } from "./internals-events-lease.js";

/**
 * 执行协作类：把 Kernel 发起的 Activity 落成待执行 Job，并消费一次派发授权。
 *
 * startAction 只创建 pending receipt；consumeActivityDispatch 由当前 Job lease 持有者把
 * Job 升格为「允许外呼」。授权列（dispatchAuthorizedAt）一经写入不可回退，认领侧据此
 * 拒绝自动重放，所以这个写入点必须只有这里一个。
 */
export class ActivityExecutionOperations {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly actionRetryPolicies?: Readonly<Record<string, RetryPolicy>>,
    ) {}

    async startAction(
        request: ActivityExecutionRequest,
    ): Promise<DeferredActivityStartResult> {
        const normalized = normalizeActivityRequest(request);
        const retryPolicy = this.actionRetryPolicies?.[normalized.reference];
        const payload: WorkflowActivityJobPayload = {
            runId: normalized.runId,
            activity: normalized.activity,
            reference: normalized.reference,
            input: normalized.input,
            options: normalized.options,
            idempotencyKey: normalized.idempotencyKey,
            ...(retryPolicy === undefined ? {} : { retryPolicy }),
        };
        const payloadJson = canonicalJson(payload);
        const identityJson = activityIdentityJson(payload);

        try {
            return await this.prisma.$transaction(async (tx) => {
                const run = await tx.workflowRun.findUnique({
                    where: { id: normalized.runId },
                });
                if (!run) {
                    throw new WorkflowHostError(
                        "not_found",
                        `Workflow run ${normalized.runId} was not found.`,
                    );
                }
                if (isTerminalRunStatus(run.status)) {
                    throw new WorkflowHostConflictError(
                        `Cannot start Activity on terminal Workflow run ${normalized.runId} (${run.status}).`,
                    );
                }

                const existing = await tx.job.findUnique({
                    where: { idempotencyKey: normalized.idempotencyKey },
                });
                if (existing) {
                    return existingActionResult(
                        existing as ActivityJobRow,
                        normalized,
                        identityJson,
                    );
                }
                const row = await tx.job.create({
                    data: {
                        id: randomUUID(),
                        runId: null,
                        stepId: null,
                        workflowRunId: normalized.runId,
                        workflowKernelRevision: null,
                        kind: ACTIVITY_KIND,
                        status: "queued",
                        payloadJson,
                        resultJson: null,
                        idempotencyKey: normalized.idempotencyKey,
                        attempts: 0,
                        maxAttempts: retryPolicy?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
                        leaseOwner: null,
                        leaseToken: null,
                        leaseExpiresAt: null,
                        nextAttemptAt: null,
                        errorCode: null,
                        errorMessage: null,
                    },
                });
                return {
                    status: "pending",
                    receipt: row.id,
                    reason: "workflow-activity",
                } satisfies DeferredActivityStartResult;
            });
        } catch (error) {
            if (!isUniqueConstraintError(error)) {
                throw error;
            }
            const winner = await this.prisma.job.findUnique({
                where: { idempotencyKey: normalized.idempotencyKey },
            });
            if (!winner) {
                throw new WorkflowHostError(
                    "unavailable",
                    "Activity creation lost its unique-key race without a durable winner.",
                    { cause: error },
                );
            }
            return existingActionResult(
                winner as ActivityJobRow,
                normalized,
                identityJson,
            );
        }
    }

    async consumeActivityDispatch(
        input: ConsumeActivityDispatchInput,
    ): Promise<ConsumeActivityDispatchResult> {
        const now = input.now ?? new Date();
        assertValidDate(now, "now");
        const jobLease = normalizeActivityJobLease(input.jobLease);
        const runLease = normalizeRunLease(input.runLease);
        return this.prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id: jobLease.jobId } });
            if (!job || job.kind !== ACTIVITY_KIND || job.workflowRunId !== runLease.runId) {
                return { accepted: false, alreadyConsumed: false };
            }
            if (job.dispatchAuthorizedAt !== null) {
                return { accepted: false, alreadyConsumed: true };
            }
            if (
                job.status !== "leased"
                || job.leaseOwner !== jobLease.owner
                || job.leaseToken !== jobLease.leaseToken
                || !job.leaseExpiresAt
                || job.leaseExpiresAt.getTime() <= now.getTime()
            ) return { accepted: false, alreadyConsumed: false };
            const run = await tx.workflowRun.findUnique({ where: { id: runLease.runId } });
            if (!run || isTerminalRunStatus(run.status) || !hasCurrentRunLease(run as WorkflowRunRow, runLease, now)) {
                return { accepted: false, alreadyConsumed: false };
            }
            const payload = parseActivityPayload(job.payloadJson, job.id);
            const state = parseJson(run.stateJson, `Workflow run ${run.id} state`);
            if (job.workflowKernelRevision !== run.kernelRevision || !pendingActivityForState(state, payload, job.id)) {
                return { accepted: false, alreadyConsumed: false };
            }
            const updated = await tx.job.updateMany({
                where: {
                    id: job.id,
                    kind: ACTIVITY_KIND,
                    status: "leased",
                    leaseOwner: jobLease.owner,
                    leaseToken: jobLease.leaseToken,
                    leaseExpiresAt: { gt: now },
                    workflowRunId: runLease.runId,
                    workflowKernelRevision: run.kernelRevision,
                    dispatchAuthorizedAt: null,
                },
                data: { dispatchAuthorizedAt: now },
            });
            if (updated.count !== 1) return { accepted: false, alreadyConsumed: false };
            return { accepted: true, alreadyConsumed: false };
        });
    }
}
