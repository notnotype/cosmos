import {
    assertJsonValue,
    canonicalJson,
    WorkflowBackendConflictError,
    WorkflowRunNotFoundError,
    type BackendCapabilities,
    type JsonValue,
    type WorkflowBackend,
    type WorkflowRunState,
    type WorkflowValue,
} from "@notnotype/nb-workflow";
import {
    PrismaClient,
    type Prisma,
} from "@prisma/client";

export class WorkflowStateIntegrityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WorkflowStateIntegrityError";
    }
}

const durableCapabilities: BackendCapabilities = Object.freeze({
    durability: "durable",
    processRestart: true,
    concurrentExecution: false,
    multiWorker: false,
    leases: false,
    durableSignals: false,
    durableTimers: false,
    childWorkflows: false,
    externalReceipts: false,
    outbox: false,
    valueReferences: true,
});

type WorkflowRunRow = {
    id: string;
    stateJson: string;
    kernelRevision: number;
    status: string;
    resumeRequired: boolean;
    definitionKey: string;
    definitionVersion: string;
    manifestHash: string;
    createdAt: Date;
    updatedAt: Date;
};

export class PrismaWorkflowBackend implements WorkflowBackend {
    readonly capabilities = durableCapabilities;

    constructor(readonly prisma: PrismaClient) {}

    async createRun(initial: WorkflowRunState): Promise<WorkflowRunState> {
        const normalized = normalizeState(initial, 0);
        if (initial.revision !== 0) {
            throw new Error("A new workflow run must start at revision 0.");
        }

        try {
            const row = await this.prisma.workflowRun.create({
                data: toCreateData(normalized),
            });
            return fromRow(row as WorkflowRunRow);
        } catch (error) {
            if (isUniqueConstraintError(error)) {
                const current = await this.prisma.workflowRun.findUnique({
                    where: { id: normalized.runId },
                    select: { kernelRevision: true },
                });
                throw new WorkflowBackendConflictError(
                    normalized.runId,
                    -1,
                    current?.kernelRevision ?? 0,
                );
            }
            throw error;
        }
    }

    async loadRun(runId: string): Promise<WorkflowRunState | null> {
        const row = await this.prisma.workflowRun.findUnique({
            where: { id: runId },
        });
        return row ? fromRow(row as WorkflowRunRow) : null;
    }

    async saveRun(
        next: WorkflowRunState,
        expectedRevision: number,
    ): Promise<WorkflowRunState> {
        return this.prisma.$transaction(async (tx) => {
            const current = await tx.workflowRun.findUnique({
                where: { id: next.runId },
            });
            if (!current) {
                throw new WorkflowRunNotFoundError(next.runId);
            }

            const currentState = fromRow(current as WorkflowRunRow);
            if (current.kernelRevision !== expectedRevision) {
                throw new WorkflowBackendConflictError(
                    next.runId,
                    expectedRevision,
                    current.kernelRevision,
                );
            }
            assertImmutableRunFields(currentState, next);

            const normalized = normalizeState(next, expectedRevision + 1);
            const updated = await tx.workflowRun.updateMany({
                where: {
                    id: next.runId,
                    kernelRevision: expectedRevision,
                },
                data: toUpdateData(normalized, expectedRevision + 1),
            });
            if (updated.count !== 1) {
                const actual = await tx.workflowRun.findUnique({
                    where: { id: next.runId },
                    select: { kernelRevision: true },
                });
                throw new WorkflowBackendConflictError(
                    next.runId,
                    expectedRevision,
                    actual?.kernelRevision ?? expectedRevision,
                );
            }

            const saved = await tx.workflowRun.findUnique({
                where: { id: next.runId },
            });
            if (!saved) {
                throw new WorkflowRunNotFoundError(next.runId);
            }
            return fromRow(saved as WorkflowRunRow);
        });
    }

    async listRuns(): Promise<readonly WorkflowRunState[]> {
        const rows = await this.prisma.workflowRun.findMany({
            orderBy: [
                { createdAt: "asc" },
                { id: "asc" },
            ],
        });
        return rows.map((row) => fromRow(row as WorkflowRunRow));
    }
}

function toCreateData(state: WorkflowRunState): Prisma.WorkflowRunCreateInput {
    return {
        id: state.runId,
        stateJson: canonicalJson(state),
        kernelRevision: 0,
        status: state.status,
        resumeRequired: state.resumeRequired === true,
        definitionKey: state.definition.key,
        definitionVersion: state.definition.version,
        manifestHash: state.definition.manifestHash,
        createdAt: parseDate(state.createdAt, "createdAt"),
        updatedAt: parseDate(state.updatedAt, "updatedAt"),
    };
}

function toUpdateData(
    state: WorkflowRunState,
    revision: number,
): Prisma.WorkflowRunUpdateManyMutationInput {
    return {
        stateJson: canonicalJson(state),
        kernelRevision: revision,
        status: state.status,
        resumeRequired: state.resumeRequired === true,
        definitionKey: state.definition.key,
        definitionVersion: state.definition.version,
        manifestHash: state.definition.manifestHash,
        updatedAt: parseDate(state.updatedAt, "updatedAt"),
    };
}

function fromRow(row: WorkflowRunRow): WorkflowRunState {
    let parsed: unknown;
    try {
        parsed = JSON.parse(row.stateJson) as unknown;
    } catch {
        throw new WorkflowStateIntegrityError(
            `Workflow run ${row.id} contains invalid state JSON.`,
        );
    }
    const state = normalizeState(parsed, row.kernelRevision);
    assertProjection(row, state);
    return structuredClone(state);
}

function normalizeState(
    input: unknown,
    revision: number,
): WorkflowRunState {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new WorkflowStateIntegrityError("Workflow state must be an object.");
    }

    const state = input as Record<string, unknown>;
    const runId = requireString(state, "runId");
    const definitionValue = state.definition;
    if (
        typeof definitionValue !== "object" ||
        definitionValue === null ||
        Array.isArray(definitionValue)
    ) {
        throw new WorkflowStateIntegrityError(`${runId}: definition must be an object.`);
    }
    const definitionRecord = definitionValue as Record<string, unknown>;
    const definition = {
        key: requireString(definitionRecord, "key"),
        version: requireString(definitionRecord, "version"),
        manifestHash: requireString(definitionRecord, "manifestHash"),
    };

    const status = requireString(state, "status");
    if (!["running", "waiting", "completed", "failed", "cancelled"].includes(status)) {
        throw new WorkflowStateIntegrityError(`${runId}: invalid workflow status.`);
    }
    const inputValue = state.input;
    validateWorkflowValue(inputValue, `${runId}.input`);
    const extensionContext = state.extensionContext;
    if (extensionContext === undefined) {
        throw new WorkflowStateIntegrityError(`${runId}: extensionContext is required.`);
    }
    assertJsonValue(extensionContext);
    const cancelRequestedAt = state.cancelRequestedAt;
    if (cancelRequestedAt !== null && typeof cancelRequestedAt !== "string") {
        throw new WorkflowStateIntegrityError(`${runId}: invalid cancelRequestedAt.`);
    }
    const budget = state.budget;
    if (budget !== null) {
        assertJsonValue(budget);
    }
    const checkpoint = state.checkpoint;
    if (checkpoint !== null) {
        validateWorkflowValue(checkpoint, `${runId}.checkpoint`);
    }
    if ("result" in state && state.result !== undefined) {
        validateWorkflowValue(state.result, `${runId}.result`);
    }
    if ("error" in state && state.error !== undefined && typeof state.error !== "string") {
        throw new WorkflowStateIntegrityError(`${runId}: invalid error.`);
    }

    const pendingAsks = requireArray(state, "pendingAsks");
    const pendingWaits = requireArray(state, "pendingWaits");
    const pendingActivities = state.pendingActivities === undefined
        ? []
        : requireArray(state, "pendingActivities");
    const activityCompletions = state.activityCompletions === undefined
        ? []
        : requireArray(state, "activityCompletions");
    const logs = requireArray(state, "logs");
    if (!logs.every((entry) => typeof entry === "string")) {
        throw new WorkflowStateIntegrityError(`${runId}: logs must contain strings.`);
    }
    const progress = state.progress;
    if (progress !== null) {
        assertJsonValue(progress);
    }
    const journal = requireArray(state, "journal");
    const createdAt = requireString(state, "createdAt");
    const updatedAt = requireString(state, "updatedAt");
    parseDate(createdAt, "createdAt");
    parseDate(updatedAt, "updatedAt");

    const normalized = {
        runId,
        definition,
        input: structuredClone(inputValue as WorkflowValue),
        extensionContext: structuredClone(extensionContext),
        status: status as WorkflowRunState["status"],
        resumeRequired: state.resumeRequired === true,
        cancelRequestedAt,
        budget: budget === null ? null : structuredClone(budget),
        checkpoint: checkpoint === null
            ? null
            : structuredClone(checkpoint as WorkflowValue),
        ...(state.result === undefined
            ? {}
            : { result: structuredClone(state.result as WorkflowValue) }),
        ...(state.error === undefined ? {} : { error: state.error as string }),
        pendingAsks: structuredClone(pendingAsks),
        pendingWaits: structuredClone(pendingWaits),
        pendingActivities: structuredClone(pendingActivities),
        activityCompletions: structuredClone(activityCompletions),
        logs: [...(logs as string[])],
        progress: progress === null ? null : structuredClone(progress),
        journal: structuredClone(journal),
        revision,
        createdAt,
        updatedAt,
    } as WorkflowRunState;
    try {
        assertJsonValue(normalized);
    } catch (error) {
        throw new WorkflowStateIntegrityError(
            `${runId}: workflow state is not JSON-safe: ${error instanceof Error ? error.message : "unknown error"}`,
        );
    }
    return normalized;
}

function validateWorkflowValue(value: unknown, path: string): asserts value is WorkflowValue {
    if (!isRecord(value) || (value.kind !== "inline" && value.kind !== "ref")) {
        throw new WorkflowStateIntegrityError(`${path} must be a WorkflowValue.`);
    }
    if (value.kind === "inline") {
        assertJsonValue(value.value);
        return;
    }
    const ref = value.ref;
    if (!isRecord(ref)) {
        throw new WorkflowStateIntegrityError(`${path}.ref must be an object.`);
    }
    const byteSize = ref.byteSize;
    if (
        typeof ref.key !== "string" ||
        typeof ref.hash !== "string" ||
        typeof byteSize !== "number" ||
        !Number.isSafeInteger(byteSize) ||
        byteSize < 0 ||
        ref.mediaType !== "application/json"
    ) {
        throw new WorkflowStateIntegrityError(`${path}.ref is invalid.`);
    }
}

function assertImmutableRunFields(
    current: WorkflowRunState,
    next: WorkflowRunState,
): void {
    const currentIdentity = canonicalJson({
        runId: current.runId,
        definition: current.definition,
        input: current.input,
        extensionContext: current.extensionContext,
        createdAt: current.createdAt,
    });
    const nextIdentity = canonicalJson({
        runId: next.runId,
        definition: next.definition,
        input: next.input,
        extensionContext: next.extensionContext,
        createdAt: next.createdAt,
    });
    if (currentIdentity !== nextIdentity) {
        throw new WorkflowStateIntegrityError(
            `Workflow run immutable fields changed: ${current.runId}`,
        );
    }
}

function assertProjection(row: WorkflowRunRow, state: WorkflowRunState): void {
    if (
        row.id !== state.runId ||
        row.kernelRevision !== state.revision ||
        row.status !== state.status ||
        row.resumeRequired !== (state.resumeRequired === true) ||
        row.definitionKey !== state.definition.key ||
        row.definitionVersion !== state.definition.version ||
        row.manifestHash !== state.definition.manifestHash ||
        row.createdAt.toISOString() !== state.createdAt ||
        row.updatedAt.toISOString() !== state.updatedAt
    ) {
        throw new WorkflowStateIntegrityError(
            `Workflow run ${row.id} projection does not match its state.`,
        );
    }
}

function requireString(
    record: Record<string, unknown>,
    key: string,
): string {
    const value = record[key];
    if (typeof value !== "string" || value.length === 0) {
        throw new WorkflowStateIntegrityError(`${key} must be a non-empty string.`);
    }
    return value;
}

function requireArray(
    record: Record<string, unknown>,
    key: string,
): JsonValue[] {
    const value = record[key];
    if (!Array.isArray(value)) {
        throw new WorkflowStateIntegrityError(`${key} must be an array.`);
    }
    assertJsonValue(value);
    return value;
}

function parseDate(value: string, field: string): Date {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        throw new WorkflowStateIntegrityError(`Invalid ${field} date.`);
    }
    return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueConstraintError(error: unknown): boolean {
    return isRecord(error) && error.code === "P2002";
}
