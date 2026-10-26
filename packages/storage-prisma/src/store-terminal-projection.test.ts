import { expect, it } from "vitest";
import { withTestDatabase } from "./index.fixtures.js";
import { PrismaWorkflowBackend } from "./workflow-backend.js";
import { PrismaWorkflowHostStore } from "./workflow-host-store.js";
import { activityRequest, createRunningRun, seedPendingActivity } from "./workflow-host-store.fixtures.js";

it("atomically terminalizes Kernel-backed runs and invalidates pre-terminal leases", async () => {
    await withTestDatabase("workflow-terminal-projection", async (database) => {
        database.deploy();
        const store = new PrismaWorkflowHostStore(database.openClient());
        const backend = new PrismaWorkflowBackend(store.prisma);
        for (const status of ["cancelled", "failed"] as const) {
            const lease = await createRunningRun(store, `terminal-${status}`, "worker");
            const request = activityRequest(lease.runId, `terminal-${status}`);
            const pending = await store.startAction(request);
            if (pending.status !== "pending") throw new Error("Expected pending Activity");
            await seedPendingActivity(store, request, pending.receipt);
            const before = await store.prisma.workflowRun.findUniqueOrThrow({ where: { id: lease.runId } });
            const now = new Date();
            if (status === "cancelled") await store.cancelWorkflowRun({ runId: lease.runId, reason: "Test cancellation", now });
            else expect(await store.failWorkflowRun({ runLease: lease, error: "Test failure", now })).toBe(true);
            expect(await store.loadWorkflowEnvelope(lease.runId)).toMatchObject({ status, resumeRequired: false });
            expect(await backend.loadRun(lease.runId)).toMatchObject({ status, revision: before.kernelRevision + 1,
                updatedAt: now.toISOString(), resumeRequired: false });
            expect(await store.heartbeatRun({ ...lease, leaseMs: 1000, now })).toBe(false);
            expect(await store.claimRun({ owner: "new-worker", leaseMs: 1000, runId: lease.runId, now })).toBeNull();
        }
    });
});
