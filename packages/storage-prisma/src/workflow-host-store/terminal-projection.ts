import type { Prisma } from "@prisma/client";
import { isWorkflowEnvelopeMarker } from "../workflow-envelope-marker.js";
import { toUpdateData } from "../workflow-state-codec.js";
import { normalizeState } from "../workflow-state-validation.js";
import { assertKernelStateProjection } from "./internals-activity.js";
import { parseJson, type WorkflowRunRow } from "./internals-core.js";

export function terminalRunProjection(
    row: WorkflowRunRow,
    status: "failed" | "cancelled",
    error: string,
    now: Date,
): Prisma.WorkflowRunUpdateManyMutationInput {
    const data: Prisma.WorkflowRunUpdateManyMutationInput = {
        status, errorMessage: error, finishedAt: now, updatedAt: now,
        runLeaseOwner: null, runLeaseToken: null, runLeaseExpiresAt: null, resumeRequired: false,
    };
    const raw = parseJson(row.stateJson, `Workflow run ${row.id} state`);
    if (isWorkflowEnvelopeMarker(raw, row.id)) return data;
    assertKernelStateProjection(row, raw);
    const revision = row.kernelRevision + 1;
    const previous = normalizeState(raw, row.kernelRevision);
    // Host overrides invalidate Kernel writers too; a row-only terminal state cannot be read or safely replayed.
    const state = normalizeState({ ...previous, status, error, resumeRequired: false,
        updatedAt: now.toISOString(), cancelRequestedAt: status === "cancelled" ? now.toISOString() : previous.cancelRequestedAt,
    }, revision);
    return { ...data, ...toUpdateData(state, revision) };
}
