import { WorkflowHostConflictError, WorkflowHostError, type CancelWorkflowRunInput, type MarkResumeRequiredInput, type RecoveryRunsInput, type RecoverWorkflowRunInput, type ListWorkflowRunsInput, type WorkflowEnvelope, type FailWorkflowRunInput } from "@cosmos/application";
import { isWorkflowEnvelopeMarker } from "../workflow-envelope-marker.js";
import { PrismaWorkflowHostCompletionDeliveryStore } from "./completion-delivery-store.js";
import { RECOVERABLE_RUN_STATUSES, type WorkflowRunRow, assertValidDate, invalidState, isTerminalRunStatus, parseJson, requireNonEmptyString } from "./internals-core.js";
import { normalizeRunLease, toEnvelope } from "./internals-activity.js";
import { terminalRunProjection } from "./terminal-projection.js";
import { appendWorkflowRunCancelledEvent, appendWorkflowRunFailedEvent, hasCurrentRunLease } from "./internals-events-lease.js";

export class PrismaWorkflowHostRunLifecycleStore extends PrismaWorkflowHostCompletionDeliveryStore {
    async failWorkflowRun(input: FailWorkflowRunInput): Promise<boolean> {
        const now = input.now ?? new Date();
        assertValidDate(now, "now");
        const runLease = normalizeRunLease(input.runLease);
        const error = requireNonEmptyString(input.error, "error");
        return this.prisma.$transaction(async (tx) => {
            const run = await tx.workflowRun.findUnique({
                where: { id: runLease.runId },
            });
            if (!run || isTerminalRunStatus(run.status)
                || !hasCurrentRunLease(run as WorkflowRunRow, runLease, now)) {
                return false;
            }
            const updated = await tx.workflowRun.updateMany({
                where: {
                    id: runLease.runId,
                    status: run.status,
                    kernelRevision: run.kernelRevision,
                    runLeaseOwner: runLease.owner,
                    runLeaseToken: runLease.leaseToken,
                    runLeaseExpiresAt: { gt: now },
                },
                data: terminalRunProjection(run as WorkflowRunRow, "failed", error, now),
            });
            if (updated.count !== 1) return false;
            await appendWorkflowRunFailedEvent(tx, {
                workflowRunId: runLease.runId,
                error,
            });
            return true;
        });
    }


    async cancelWorkflowRun(input: CancelWorkflowRunInput): Promise<WorkflowEnvelope> {
        const now = input.now ?? new Date();
        assertValidDate(now, "now");
        const runId = requireNonEmptyString(input.runId, "runId");
        const reason = input.reason ?? "用户取消";
        return this.prisma.$transaction(async (tx) => {
            const run = await tx.workflowRun.findUnique({ where: { id: runId } });
            if (!run) {
                throw new WorkflowHostError(
                    "not_found",
                    `Workflow run ${runId} was not found.`,
                );
            }
            if (isTerminalRunStatus(run.status)) {
                throw new WorkflowHostConflictError(
                    `Cannot cancel terminal Workflow run ${runId} (${run.status}).`,
                );
            }
            // User override: the CAS on `status` fences out a concurrent Worker
            // terminalization, and clearing the lease stops in-flight writes.
            const updated = await tx.workflowRun.updateMany({
                where: {
                    id: runId,
                    status: run.status,
                    kernelRevision: run.kernelRevision,
                },
                data: terminalRunProjection(run as WorkflowRunRow, "cancelled", reason, now),
            });
            if (updated.count !== 1) {
                throw new WorkflowHostConflictError(
                    `Workflow run ${runId} changed state and was not cancelled.`,
                );
            }
            await appendWorkflowRunCancelledEvent(tx, {
                workflowRunId: runId,
                reason,
            });
            const row = await tx.workflowRun.findUnique({ where: { id: runId } });
            return toEnvelope(row as WorkflowRunRow);
        });
    }

    async recoverWorkflowRun(input: RecoverWorkflowRunInput): Promise<WorkflowEnvelope> {
        const now = input.now ?? new Date();
        assertValidDate(now, "now");
        const runId = requireNonEmptyString(input.runId, "runId");
        return this.prisma.$transaction(async (tx) => {
            const run = await tx.workflowRun.findUnique({ where: { id: runId } });
            if (!run) {
                throw new WorkflowHostError(
                    "not_found",
                    `Workflow run ${runId} was not found.`,
                );
            }
            if (isTerminalRunStatus(run.status)) {
                throw new WorkflowHostConflictError(
                    `Cannot recover terminal Workflow run ${runId} (${run.status}).`,
                );
            }
            if (run.runLeaseExpiresAt !== null && run.runLeaseExpiresAt.getTime() > now.getTime()) {
                throw new WorkflowHostConflictError(
                    `Workflow run ${runId} is actively executing; there is nothing to recover.`,
                );
            }
            const updated = await tx.workflowRun.updateMany({
                where: {
                    id: runId,
                    status: run.status,
                },
                data: {
                    resumeRequired: true,
                    runLeaseOwner: null,
                    runLeaseToken: null,
                    runLeaseExpiresAt: null,
                    updatedAt: now,
                },
            });
            if (updated.count !== 1) {
                throw new WorkflowHostConflictError(
                    `Workflow run ${runId} changed state and was not recovered.`,
                );
            }
            const row = await tx.workflowRun.findUnique({ where: { id: runId } });
            return toEnvelope(row as WorkflowRunRow);
        });
    }

    async markResumeRequired(input: MarkResumeRequiredInput): Promise<boolean> {
        const now = input.now ?? new Date();
        assertValidDate(now, "now");
        const runLease = normalizeRunLease(input.runLease);
        const run = await this.prisma.workflowRun.findUnique({
            where: { id: runLease.runId },
        });
        if (!run || isTerminalRunStatus(run.status)) {
            return false;
        }
        if (!hasCurrentRunLease(run as WorkflowRunRow, runLease, now)) {
            return false;
        }
        const updated = await this.prisma.workflowRun.updateMany({
            where: {
                id: runLease.runId,
                status: run.status,
                runLeaseOwner: runLease.owner,
                runLeaseToken: runLease.leaseToken,
                runLeaseExpiresAt: { gt: now },
            },
            data: { resumeRequired: true },
        });
        if (updated.count === 1 && input.reason) {
            this.logger?.warn("workflow.run.resume_required", {
                runId: runLease.runId,
                reason: input.reason,
            });
        }
        return updated.count === 1;
    }

    async listRunsForRecovery(
        input: RecoveryRunsInput = {},
    ): Promise<readonly WorkflowEnvelope[]> {
        const limit = input.limit === undefined ? 100 : input.limit;
        if (!Number.isSafeInteger(limit) || limit < 1) {
            throw invalidState("Recovery limit must be a positive integer.");
        }
        const rows = await this.prisma.workflowRun.findMany({
            where: {
                status: { in: ["queued", "running", "waiting"] },
            },
            orderBy: [
                { updatedAt: "asc" },
                { id: "asc" },
            ],
            take: Math.max(limit * 4, limit),
        });
        const recovered: WorkflowEnvelope[] = [];
        for (const raw of rows) {
            const row = raw as WorkflowRunRow;
            const parsed = parseJson(row.stateJson, `Workflow run ${row.id} state`);
            const marker = isWorkflowEnvelopeMarker(parsed, row.id);
            if (!marker && !(
                row.resumeRequired
                && RECOVERABLE_RUN_STATUSES.includes(
                    row.status as (typeof RECOVERABLE_RUN_STATUSES)[number],
                )
            )) {
                continue;
            }
            recovered.push(toEnvelope(row));
            if (recovered.length >= limit) {
                break;
            }
        }
        return recovered;
    }

    async listWorkflowRuns(input: ListWorkflowRunsInput = {}): Promise<readonly WorkflowEnvelope[]> {
        const limit = input.limit === undefined ? 20 : input.limit;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw invalidState("Run list limit must be an integer between 1 and 100.");
        }
        const rows = await this.prisma.workflowRun.findMany({
            where: input.sourceId ? { sourceInstanceId: input.sourceId } : {},
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: limit,
        });
        return rows.map((row) => toEnvelope(row as WorkflowRunRow));
    }
}
