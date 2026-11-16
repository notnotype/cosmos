import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { WorkflowHostConflictError, type CompleteActivityInput, type CompleteActivityResult, type WorkflowJobStatus } from "@cosmos/application";
import { ACTIVITY_KIND, DEFAULT_COMPLETION_MAX_ATTEMPTS, type ActivityJobRow, type WorkflowCompletionRow, type WorkflowRunRow, assertValidDate, encodeJson, invalidState, isTerminalRunStatus, isUniqueConstraintError, normalizeRetryDelay, parseJson } from "./internals-core.js";
import { normalizeActivityJobLease, normalizeRunLease, parseActivityPayload, pendingActivityForState, rejectedActivityResult, sameCompletionIdentity, toCompletion, validateActivityTerminalResult, validateCompletionForJob } from "./internals-activity.js";
import { appendActivityLifecycleEvent, hasCurrentRunLease } from "./internals-events-lease.js";

/**
 * 完成协作类：把一次 Attempt 的终态结果落成 Job 终态与至多一条 durable Completion。
 *
 * 与 Completion dispatcher（另一个消费方）的分界：这里只写 completion 的 queued 记录，
 * 不 claim、不 delivery，也不判断 Kernel 是否已接受。terminal 结果与 Completion 必须
 * 在同一事务里产生，否则 Crash 会留下「Job 已成功但没有可投递结果」的空洞。
 */
export class ActivityCompletionOperations {
    constructor(private readonly prisma: PrismaClient) {}

    async completeActivity(input: CompleteActivityInput): Promise<CompleteActivityResult> {
        const now = input.now ?? new Date();
        assertValidDate(now, "now");
        validateActivityTerminalResult(input.result);
        const jobLease = normalizeActivityJobLease(input.jobLease);
        const runLease = normalizeRunLease(input.runLease);

        return this.prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id: jobLease.jobId } });
            if (!job || job.kind !== ACTIVITY_KIND) {
                return rejectedActivityResult(job?.status);
            }
            if (!job.workflowRunId || job.workflowRunId !== runLease.runId) {
                return rejectedActivityResult(job.status);
            }
            const payload = parseActivityPayload(job.payloadJson, job.id);
            const completion = validateCompletionForJob(
                input.result,
                input.completion,
                payload,
                job.id,
            );
            const run = await tx.workflowRun.findUnique({ where: { id: job.workflowRunId } });
            if (!run || isTerminalRunStatus(run.status) || !hasCurrentRunLease(run as WorkflowRunRow, runLease, now)) {
                return rejectedActivityResult(job.status);
            }
            const jobRow = job as ActivityJobRow;
            const state = parseJson(run.stateJson, `Workflow run ${run.id} state`);
            const pending = pendingActivityForState(state, payload, job.id);
            if (
                jobRow.workflowKernelRevision === null
                || jobRow.workflowKernelRevision !== run.kernelRevision
                || !pending
            ) {
                return rejectedActivityResult(job.status);
            }

            const jobLeaseCurrent = job.status === "leased"
                && job.leaseOwner === jobLease.owner
                && job.leaseToken === jobLease.leaseToken
                && job.leaseExpiresAt !== null
                && job.leaseExpiresAt.getTime() > now.getTime();
            if (!jobLeaseCurrent) {
                // 已消费派发授权的 Attempt 结果一律作废：它可能对应一次真实外呼，
                // 而 Run 已被判定为 outcome_unknown，晚到的成功不能回填成结果。
                if (job.dispatchAuthorizedAt !== null) {
                    return rejectedActivityResult(job.status);
                }
                if (
                    completion
                    && input.result.status !== "retry_wait"
                    && ["succeeded", "failed_terminal", "cancelled"].includes(job.status)
                ) {
                    const existing = await tx.workflowCompletion.findUnique({ where: { jobId: job.id } });
                    if (existing) {
                        const persisted = toCompletion(existing as WorkflowCompletionRow);
                        if (!sameCompletionIdentity(persisted.completion, completion)) {
                            throw new WorkflowHostConflictError(
                                `Activity completion identity conflicts with existing Job ${job.id} completion.`,
                            );
                        }
                        return {
                            accepted: true,
                            jobStatus: job.status as WorkflowJobStatus,
                            completion: persisted,
                        } satisfies CompleteActivityResult;
                    }
                }
                return rejectedActivityResult(job.status);
            }

            if (input.result.status !== "retry_wait") {
                const existing = await tx.workflowCompletion.findUnique({ where: { jobId: job.id } });
                if (existing) {
                    const persisted = toCompletion(existing as WorkflowCompletionRow);
                    if (!completion || !sameCompletionIdentity(persisted.completion, completion)) {
                        throw new WorkflowHostConflictError(
                            `Activity completion identity conflicts with existing Job ${job.id} completion.`,
                        );
                    }
                    return {
                        accepted: true,
                        jobStatus: job.status as WorkflowJobStatus,
                        completion: persisted,
                    } satisfies CompleteActivityResult;
                }
            }

            const nextAttemptAt = input.result.status === "retry_wait"
                ? new Date(now.getTime() + normalizeRetryDelay(input.result.retryDelayMs))
                : null;
            const updated = await tx.job.updateMany({
                where: {
                    id: job.id,
                    kind: ACTIVITY_KIND,
                    workflowRunId: job.workflowRunId,
                    status: "leased",
                    leaseOwner: jobLease.owner,
                    leaseToken: jobLease.leaseToken,
                    leaseExpiresAt: { gt: now },
                    workflowKernelRevision: run.kernelRevision,
                },
                data: {
                    status: input.result.status,
                    resultJson: input.result.result === undefined
                        ? null
                        : encodeJson(input.result.result, "Activity result"),
                    errorCode: input.result.errorCode ?? null,
                    errorMessage: input.result.error ?? null,
                    leaseOwner: null,
                    leaseToken: null,
                    leaseExpiresAt: null,
                    nextAttemptAt,
                },
            });
            if (updated.count !== 1) return rejectedActivityResult(job.status);

            await appendActivityLifecycleEvent(tx, {
                workflowRunId: job.workflowRunId,
                jobId: job.id,
                attempt: job.attempts,
                owner: jobLease.owner,
                expiresAt: null,
                status: input.result.status,
                ...(input.result.error ? { error: input.result.error } : {}),
                idempotencyKey: `${job.id}:attempt:${job.attempts}:terminal`,
            });
            if (input.result.status === "retry_wait") {
                return {
                    accepted: true,
                    jobStatus: "retry_wait",
                    completion: null,
                } satisfies CompleteActivityResult;
            }
            if (!completion) throw invalidState("Terminal Activity result was not given a completion.");
            try {
                const completionRow = await tx.workflowCompletion.create({
                    data: {
                        id: randomUUID(),
                        workflowRunId: job.workflowRunId,
                        jobId: job.id,
                        activityKey: completion.activityKey,
                        receipt: completion.receipt,
                        reference: completion.reference,
                        fingerprint: completion.fingerprint,
                        completionJson: encodeJson(completion, "Activity completion"),
                        status: "queued",
                        attempts: 0,
                        maxAttempts: DEFAULT_COMPLETION_MAX_ATTEMPTS,
                        availableAt: now,
                        leaseOwner: null,
                        leaseToken: null,
                        leaseExpiresAt: null,
                        lastError: null,
                    },
                });
                return {
                    accepted: true,
                    jobStatus: input.result.status,
                    completion: toCompletion(completionRow as WorkflowCompletionRow),
                } satisfies CompleteActivityResult;
            } catch (error) {
                if (!isUniqueConstraintError(error)) throw error;
                const existing = await tx.workflowCompletion.findUnique({ where: { jobId: job.id } });
                if (!existing) throw error;
                const persisted = toCompletion(existing as WorkflowCompletionRow);
                if (!sameCompletionIdentity(persisted.completion, completion)) {
                    throw new WorkflowHostConflictError(
                        `Activity completion identity conflicts with existing Job ${job.id} completion.`,
                        { cause: error },
                    );
                }
                return {
                    accepted: true,
                    jobStatus: job.status as WorkflowJobStatus,
                    completion: persisted,
                } satisfies CompleteActivityResult;
            }
        });
    }
}
