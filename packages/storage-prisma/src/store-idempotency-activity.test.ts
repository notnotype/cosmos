import { canonicalJson } from "@notnotype/nb-workflow";
import { expect, it } from "vitest";
import { withTestDatabase } from "./index.fixtures.js";
import { activityRequest, completionFor, createRunningRun, createStore, definition, inputSnapshot, productRun, seedPendingActivity } from "./workflow-host-store.fixtures.js";

it("finds an envelope by idempotency key and rejects identity changes", async () => {
    await withTestDatabase("workflow-host", async (database) => {
        const store = createStore(database);
        const first = await store.createWorkflowEnvelope({
            runId: "workflow-run-1",
            idempotencyKey: "enqueue-1",
            definition,
            inputSnapshot,
            productRun,
            createdAt: "2026-08-14T00:00:00.000Z",
        });
        const queuedEvents = await store.prisma.domainEvent.findMany({
            where: {
                workflowRunId: first.runId,
                type: "run.queued.v1",
            },
        });
        expect(queuedEvents).toHaveLength(1);
        expect(queuedEvents[0]).toMatchObject({
            type: "run.queued.v1",
            version: "v1",
            aggregateType: "WorkflowRun",
            aggregateId: first.runId,
            runId: null,
            workflowRunId: first.runId,
            idempotencyKey: `workflow-run:${first.runId}:queued`,
        });
        expect(JSON.parse(queuedEvents[0].payloadJson)).toEqual({
            runId: first.runId,
            sourceId: "source-1",
            triggerKind: "manual",
        });

        await expect(store.createWorkflowEnvelope({
            runId: "another-run-id",
            idempotencyKey: "enqueue-1",
            definition,
            inputSnapshot,
            productRun,
        })).resolves.toEqual(first);
        const duplicateQueuedEvents = await store.prisma.domainEvent.findMany({
            where: {
                workflowRunId: first.runId,
                type: "run.queued.v1",
            },
        });
        expect(duplicateQueuedEvents).toHaveLength(1);

        await expect(store.createWorkflowEnvelope({
            runId: "another-run-id",
            idempotencyKey: "enqueue-1",
            definition,
            inputSnapshot: { ...inputSnapshot, cursor: "changed" },
            productRun,
        })).rejects.toMatchObject({ code: "conflict" });

        await expect(store.loadWorkflowEnvelope(first.runId)).resolves.toMatchObject({
            runId: first.runId,
            status: "queued",
            resumeRequired: false,
        });
    });
});

it("rejects late Activity completion for terminal Runs while the old lease is still valid", async () => {
    await withTestDatabase("workflow-host", async (database) => {
        const store = createStore(database);
        for (const status of ["completed", "cancelled"] as const) {
            const run = await createRunningRun(store, `workflow-run-late-${status}`, "activity-worker");
            const request = activityRequest(run.runId, `late-completion-${status}`);
            const pending = await store.startAction(request);
            if (pending.status !== "pending") throw new Error("expected pending Activity receipt");
            await seedPendingActivity(store, request, pending.receipt);
            const job = await store.claimActivityJob({
                owner: "activity-worker",
                leaseMs: 10_000,
            });
            if (!job) throw new Error("expected Activity claim");
            await store.prisma.workflowRun.update({
                where: { id: run.runId },
                data: { status },
            });

            await expect(store.completeActivity({
                jobLease: { jobId: job.id, leaseToken: job.leaseToken, owner: job.leaseOwner },
                runLease: run,
                result: { status: "succeeded", result: { late: true } },
                completion: completionFor(request, job.id, {
                    status: "completed",
                    result: { late: true },
                }),
            })).resolves.toMatchObject({ accepted: false, jobStatus: "leased", completion: null });
            await expect(store.prisma.job.findUnique({ where: { id: job.id } }))
                .resolves.toMatchObject({ status: "leased", leaseToken: job.leaseToken });
            await expect(store.prisma.workflowCompletion.findUnique({ where: { jobId: job.id } }))
                .resolves.toBeNull();
        }
    });
});

it("rejects terminal startAction and does not create a Job", async () => {
    await withTestDatabase("workflow-host", async (database) => {
        for (const status of ["completed", "cancelled"] as const) {
            const store = createStore(database);
            const run = await createRunningRun(store, `workflow-run-start-${status}`, "activity-worker");
            await store.prisma.workflowRun.update({ where: { id: run.runId }, data: { status } });
            await expect(store.startAction(activityRequest(run.runId, `terminal-start-${status}`)))
                .rejects.toMatchObject({ code: "conflict" });
            await expect(store.prisma.job.count({ where: { workflowRunId: run.runId } }))
                .resolves.toBe(0);
        }
    });
});

it("fences completion on Kernel revision and pending-activity identity", async () => {
    await withTestDatabase("workflow-host", async (database) => {
        const store = createStore(database);
        const run = await createRunningRun(store, "workflow-run-state-fence", "activity-worker");
        const request = activityRequest(run.runId, "state-fence");
        const pending = await store.startAction(request);
        if (pending.status !== "pending") throw new Error("expected pending Activity receipt");
        await seedPendingActivity(store, request, pending.receipt);
        const job = await store.claimActivityJob({ owner: "activity-worker", leaseMs: 10_000 });
        if (!job) throw new Error("expected Activity claim");
        await store.prisma.workflowRun.update({
            where: { id: run.runId },
            data: { kernelRevision: job.kernelRevision + 1 },
        });
        const completion = completionFor(request, job.id, { status: "completed", result: { ok: true } });
        const input = {
            jobLease: { jobId: job.id, leaseToken: job.leaseToken, owner: job.leaseOwner },
            runLease: run,
            result: { status: "succeeded" as const, result: { ok: true } },
            completion,
        };
        await expect(store.completeActivity(input)).resolves.toMatchObject({ accepted: false });
        await store.prisma.workflowRun.update({
            where: { id: run.runId },
            data: {
                kernelRevision: job.kernelRevision,
                stateJson: canonicalJson({
                    runId: run.runId,
                    definition,
                    input: { kind: "inline", value: inputSnapshot },
                    extensionContext: {},
                    status: "waiting",
                    resumeRequired: false,
                    cancelRequestedAt: null,
                    budget: null,
                    checkpoint: null,
                    pendingAsks: [],
                    pendingWaits: [],
                    pendingActivities: [],
                    activityCompletions: [],
                    progress: null,
                    journal: [],
                    revision: job.kernelRevision,
                    createdAt: "2026-08-14T00:00:00.000Z",
                    updatedAt: "2026-08-14T00:00:00.000Z",
                }),
            },
        });
        await expect(store.completeActivity(input)).resolves.toMatchObject({ accepted: false });
        await expect(store.prisma.job.findUnique({ where: { id: job.id } }))
            .resolves.toMatchObject({ status: "leased", workflowKernelRevision: job.kernelRevision });
        await expect(store.prisma.workflowCompletion.findUnique({ where: { jobId: job.id } }))
            .resolves.toBeNull();
    });
});

it("leaves an orphan queued Activity Job unclaimed", async () => {
    await withTestDatabase("workflow-host", async (database) => {
        const store = createStore(database);
        const run = await createRunningRun(store, "workflow-run-orphan", "activity-worker");
        const request = activityRequest(run.runId, "orphan");
        const pending = await store.startAction(request);
        if (pending.status !== "pending") throw new Error("expected pending Activity receipt");
        expect(await store.claimActivityJob({ owner: "activity-worker", leaseMs: 10_000 })).toBeNull();
        await expect(store.prisma.job.findUnique({ where: { id: pending.receipt } }))
            .resolves.toMatchObject({ status: "queued", workflowRunId: run.runId });
    });
});

