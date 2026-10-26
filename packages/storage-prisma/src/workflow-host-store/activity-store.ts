import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { canonicalJson, fingerprint, type ActivityExecutionRequest, type DeferredActivityCompletionInput, type DeferredActivityStartResult } from "@notnotype/nb-workflow";
import { WorkflowHostConflictError, WorkflowHostError, type ClaimActivityJobInput, type CompleteActivityInput, type CompleteActivityResult, type ConsumeActivityDispatchInput, type ConsumeActivityDispatchResult, type HeartbeatActivityJobInput, type ReleaseActivityJobInput, type WorkflowActivityJobClaim, type WorkflowActivityJobPayload, type WorkflowJobStatus } from "@cosmos/application";
import { isWorkflowEnvelopeMarker } from "../workflow-envelope-marker.js";
import { PrismaWorkflowHostRunLeaseStore } from "./run-lease-store.js";
import { ACTIVITY_KIND, type ActivityJobRow, DEFAULT_COMPLETION_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, TERMINAL_RUN_STATUSES, type WorkflowCompletionRow, type WorkflowRunRow, assertValidDate, encodeJson, invalidState, isTerminalRunStatus, isUniqueConstraintError, normalizeRetryDelay, parseJson, requireNonEmptyString, validateLeaseMs } from "./internals-core.js";
import { activityIdentityJson, existingActionResult, normalizeActivityJobLease, normalizeActivityRequest, normalizeRunLease, parseActivityPayload, pendingActivityForState, previousJobLeaseGuard, rejectedActivityResult, sameCompletionIdentity, toActivityJobClaim, toCompletion, validateActivityTerminalResult, validateCompletionForJob } from "./internals-activity.js";
import { terminalRunProjection } from "./terminal-projection.js";
import { appendActivityLifecycleEvent, appendWorkflowRunFailedEvent, hasCurrentRunLease } from "./internals-events-lease.js";

export class PrismaWorkflowHostActivityStore extends PrismaWorkflowHostRunLeaseStore {
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

    async claimActivityJob(
        input: ClaimActivityJobInput,
    ): Promise<WorkflowActivityJobClaim | null> {
        validateLeaseMs(input.leaseMs);
        const owner = requireNonEmptyString(input.owner, "owner");
        const now = input.now ?? new Date();
        assertValidDate(now, "now");

        return this.prisma.$transaction(async (tx) => {
            const candidates = await tx.job.findMany({
                where: {
                    kind: ACTIVITY_KIND,
                    workflowRun: {
                        is: { status: { notIn: [...TERMINAL_RUN_STATUSES] } },
                    },
                    OR: [
                        {
                            status: { in: ["queued", "retry_wait"] },
                            OR: [
                                { nextAttemptAt: null },
                                { nextAttemptAt: { lte: now } },
                            ],
                        },
                        { status: "leased", leaseExpiresAt: { lte: now } },
                    ],
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: 100,
            });

            for (const candidate of candidates) {
                if (candidate.dispatchAuthorizedAt !== null) {
                    await this.failFencedActivity(tx, candidate as ActivityJobRow, owner, now);
                    continue;
                }
                if (!candidate.workflowRunId) {
                    throw invalidState(`Activity Job ${candidate.id} has no Workflow run.`);
                }
                const payload = parseActivityPayload(candidate.payloadJson, candidate.id);
                const workflowRun = await tx.workflowRun.findUnique({
                    where: { id: candidate.workflowRunId },
                });
                if (!workflowRun) {
                    throw invalidState(`Activity Job ${candidate.id} has no Workflow run.`);
                }
                if (
                    workflowRun.runLeaseExpiresAt
                    && workflowRun.runLeaseExpiresAt.getTime() > now.getTime()
                    && workflowRun.runLeaseOwner !== null
                    && workflowRun.runLeaseOwner !== owner
                ) {
                    continue;
                }
                const state = parseJson(
                    workflowRun.stateJson,
                    `Workflow run ${workflowRun.id} state`,
                );
                const pending = pendingActivityForState(state, payload, candidate.id);
                if (isWorkflowEnvelopeMarker(state, workflowRun.id) || !pending) {
                    // startAction and Kernel persistence are separate transactions;
                    // leave an orphan queued Job for Run recovery instead of executing it.
                    continue;
                }
                if (candidate.dispatchAuthorizedAt !== null || candidate.attempts >= candidate.maxAttempts) {
                    const outcomeUnknown = candidate.dispatchAuthorizedAt !== null;
                    const errorCode = outcomeUnknown ? "outcome_unknown" : "max_attempts";
                    const error = outcomeUnknown
                        ? "Activity dispatch outcome is unknown; automatic replay is blocked."
                        : "Activity Job exceeded its maximum attempts.";
                    const completion: DeferredActivityCompletionInput = {
                        activityKey: payload.activity.key,
                        receipt: candidate.id,
                        reference: payload.reference,
                        fingerprint: payload.activity.fingerprint,
                        status: "failed",
                        error,
                    };
                    const updated = await tx.job.updateMany({
                        where: {
                            id: candidate.id,
                            kind: ACTIVITY_KIND,
                            status: candidate.status,
                            ...previousJobLeaseGuard(candidate as ActivityJobRow),
                        },
                        data: {
                            status: "failed_terminal",
                            resultJson: null,
                            errorCode,
                            errorMessage: error,
                            workflowKernelRevision: workflowRun.kernelRevision,
                            leaseOwner: null,
                            leaseToken: null,
                            leaseExpiresAt: null,
                            nextAttemptAt: null,
                        },
                    });
                    if (updated.count !== 1) continue;
                    await tx.workflowCompletion.create({
                        data: {
                            id: randomUUID(),
                            workflowRunId: candidate.workflowRunId,
                            jobId: candidate.id,
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
                    await appendActivityLifecycleEvent(tx, {
                        workflowRunId: candidate.workflowRunId,
                        jobId: candidate.id,
                        attempt: candidate.attempts,
                        owner,
                        expiresAt: null,
                        status: "failed_terminal",
                        error,
                        idempotencyKey: `${candidate.id}:attempt:${candidate.attempts}:terminal`,
                    });
                    continue;
                }

                const leaseToken = randomUUID();
                const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
                const updated = await tx.job.updateMany({
                    where: {
                        id: candidate.id,
                        kind: ACTIVITY_KIND,
                        workflowRunId: candidate.workflowRunId,
                        status: candidate.status,
                        ...previousJobLeaseGuard(candidate as ActivityJobRow),
                    },
                    data: {
                        status: "leased",
                        workflowKernelRevision: workflowRun.kernelRevision,
                        attempts: { increment: 1 },
                        leaseOwner: owner,
                        leaseToken,
                        leaseExpiresAt,
                        nextAttemptAt: null,
                    },
                });
                if (updated.count !== 1) continue;
                const claimed = await tx.job.findUnique({ where: { id: candidate.id } });
                if (!claimed) {
                    throw new WorkflowHostError(
                        "not_found",
                        `Activity Job ${candidate.id} disappeared after claim.`,
                    );
                }
                const claimedRow = claimed as ActivityJobRow;
                await appendActivityLifecycleEvent(tx, {
                    workflowRunId: candidate.workflowRunId,
                    jobId: candidate.id,
                    attempt: claimedRow.attempts,
                    owner,
                    expiresAt: leaseExpiresAt,
                    status: "leased",
                    idempotencyKey: `${candidate.id}:attempt:${claimedRow.attempts}:leased`,
                });
                return toActivityJobClaim(claimedRow, payload, owner, leaseToken);
            }
            return null;
        });
    }

    private async failFencedActivity(
        tx: Prisma.TransactionClient,
        candidate: ActivityJobRow,
        owner: string,
        now: Date,
    ): Promise<void> {
        if (!candidate.workflowRunId) {
            throw invalidState(`Fenced Activity Job ${candidate.id} has no Workflow run.`);
        }
        const run = await tx.workflowRun.findUnique({ where: { id: candidate.workflowRunId } });
        if (!run) throw invalidState(`Fenced Activity Job ${candidate.id} has no Workflow run.`);
        const payload = parseActivityPayload(candidate.payloadJson, candidate.id);
        const updated = await tx.job.updateMany({
            where: {
                id: candidate.id,
                kind: ACTIVITY_KIND,
                status: candidate.status,
                dispatchAuthorizedAt: { not: null },
                ...previousJobLeaseGuard(candidate),
            },
            data: {
                status: "failed_terminal",
                resultJson: null,
                errorCode: "outcome_unknown",
                errorMessage: "Activity dispatch outcome is unknown; automatic replay is blocked.",
                workflowKernelRevision: run.kernelRevision,
                leaseOwner: null,
                leaseToken: null,
                leaseExpiresAt: null,
                nextAttemptAt: null,
            },
        });
        if (updated.count !== 1) return;
        const error = "Activity dispatch outcome is unknown; the external request may already have been sent.";
        const runFailed = await tx.workflowRun.updateMany({
            where: { id: run.id, status: { notIn: [...TERMINAL_RUN_STATUSES] }, kernelRevision: run.kernelRevision },
            data: terminalRunProjection(run as WorkflowRunRow, "failed", error, now),
        });
        if (runFailed.count === 1) {
            await appendWorkflowRunFailedEvent(tx, { workflowRunId: run.id, error });
        }
        const completion: DeferredActivityCompletionInput = {
            activityKey: payload.activity.key,
            receipt: candidate.id,
            reference: payload.reference,
            fingerprint: payload.activity.fingerprint,
            status: "failed",
            error,
        };
        await tx.workflowCompletion.create({
            data: {
                id: randomUUID(),
                workflowRunId: candidate.workflowRunId,
                jobId: candidate.id,
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
        await appendActivityLifecycleEvent(tx, {
            workflowRunId: candidate.workflowRunId,
            jobId: candidate.id,
            attempt: candidate.attempts,
            owner,
            expiresAt: null,
            status: "failed_terminal",
            error: completion.error,
            idempotencyKey: `${candidate.id}:attempt:${candidate.attempts}:terminal`,
        });
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

    async heartbeatActivityJob(input: HeartbeatActivityJobInput): Promise<boolean> {
        validateLeaseMs(input.leaseMs);
        const now = input.now ?? new Date();
        assertValidDate(now, "now");
        const result = await this.prisma.job.updateMany({
            where: {
                id: requireNonEmptyString(input.jobId, "jobId"),
                kind: ACTIVITY_KIND,
                status: "leased",
                leaseOwner: requireNonEmptyString(input.owner, "owner"),
                leaseToken: requireNonEmptyString(input.leaseToken, "leaseToken"),
                leaseExpiresAt: { gt: now },
            },
            data: {
                leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
            },
        });
        return result.count === 1;
    }

    async releaseActivityJob(input: ReleaseActivityJobInput): Promise<boolean> {
        const now = input.now ?? new Date();
        assertValidDate(now, "now");
        const jobId = requireNonEmptyString(input.jobId, "jobId");
        const owner = requireNonEmptyString(input.owner, "owner");
        const leaseToken = requireNonEmptyString(input.leaseToken, "leaseToken");
        const updated = await this.prisma.job.updateMany({
            where: {
                id: jobId,
                kind: ACTIVITY_KIND,
                status: "leased",
                leaseOwner: owner,
                leaseToken,
                leaseExpiresAt: { gt: now },
            },
            data: {
                status: "queued",
                leaseOwner: null,
                leaseToken: null,
                leaseExpiresAt: null,
                nextAttemptAt: now,
                ...(input.reason === undefined ? {} : {
                    errorCode: "lease_unavailable",
                    errorMessage: input.reason,
                }),
            },
        });
        if (updated.count === 1) {
            const job = await this.prisma.job.findUnique({ where: { id: jobId } });
            if (job?.workflowRunId) {
                await this.prisma.$transaction(async (tx) => {
                    await appendActivityLifecycleEvent(tx, {
                        workflowRunId: job.workflowRunId!,
                        jobId,
                        attempt: job.attempts,
                        owner,
                        expiresAt: null,
                        status: "released",
                        ...(input.reason === undefined ? {} : { error: input.reason ?? undefined }),
                        idempotencyKey: `${jobId}:attempt:${job.attempts}:released:${now.toISOString()}`,
                    });
                });
            }
        }
        return updated.count === 1;
    }

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
