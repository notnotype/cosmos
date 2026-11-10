import { describe, expect, it } from "vitest";
import { withTestDatabase } from "./index.fixtures.js";
import { createRunningRun, createStore, definition, inputSnapshot, productRun } from "./workflow-host-store.fixtures.js";

describe("Run control (RUN-004 / ADR-0016)", () => {
    it("cancelWorkflowRun terminalizes a running Run, clears the lease and fences heartbeat", async () => {
        await withTestDatabase("workflow-host", async (database) => {
            const store = createStore(database);
            const lease = await createRunningRun(store, "run-cancel");

            const envelope = await store.cancelWorkflowRun({ runId: lease.runId });
            expect(envelope.status).toBe("cancelled");

            const row = await store.prisma.workflowRun.findUniqueOrThrow({ where: { id: lease.runId } });
            expect(row.status).toBe("cancelled");
            expect(row.runLeaseOwner).toBeNull();
            expect(row.runLeaseToken).toBeNull();
            expect(row.runLeaseExpiresAt).toBeNull();
            expect(row.resumeRequired).toBe(false);
            expect(row.finishedAt).not.toBeNull();
            expect(row.errorMessage).toBe("用户取消");

            await expect(store.heartbeatRun({ ...lease, leaseMs: 60_000 })).resolves.toBe(false);
            await expect(store.prisma.domainEvent.count({
                where: { workflowRunId: lease.runId, type: "run.cancelled.v1" },
            })).resolves.toBe(1);
        });
    });

    it("cancelWorkflowRun rejects a missing or terminal Run", async () => {
        await withTestDatabase("workflow-host", async (database) => {
            const store = createStore(database);
            await expect(store.cancelWorkflowRun({ runId: "missing" }))
                .rejects.toMatchObject({ code: "not_found" });

            const envelope = await store.createWorkflowEnvelope({
                runId: "run-cancel-terminal",
                idempotencyKey: "cancel-terminal",
                definition,
                inputSnapshot,
                productRun,
            });
            await store.prisma.workflowRun.update({
                where: { id: envelope.runId },
                data: { status: "completed" },
            });
            await expect(store.cancelWorkflowRun({ runId: envelope.runId }))
                .rejects.toMatchObject({ code: "conflict" });
        });
    });

    it("recoverWorkflowRun marks a lease-less Run resume-required", async () => {
        await withTestDatabase("workflow-host", async (database) => {
            const store = createStore(database);
            const envelope = await store.createWorkflowEnvelope({
                runId: "run-recover",
                idempotencyKey: "recover",
                definition,
                inputSnapshot,
                productRun,
            });
            const recovered = await store.recoverWorkflowRun({ runId: envelope.runId });
            expect(recovered.status).toBe("queued");
            const row = await store.prisma.workflowRun.findUniqueOrThrow({ where: { id: envelope.runId } });
            expect(row.resumeRequired).toBe(true);
            expect(row.runLeaseOwner).toBeNull();
        });
    });

    it("recoverWorkflowRun rejects a missing, terminal or actively-executing Run", async () => {
        await withTestDatabase("workflow-host", async (database) => {
            const store = createStore(database);
            await expect(store.recoverWorkflowRun({ runId: "missing" }))
                .rejects.toMatchObject({ code: "not_found" });

            const lease = await createRunningRun(store, "run-recover-active");
            await expect(store.recoverWorkflowRun({ runId: lease.runId }))
                .rejects.toMatchObject({ code: "conflict" });

            const terminal = await store.createWorkflowEnvelope({
                runId: "run-recover-terminal",
                idempotencyKey: "recover-terminal",
                definition,
                inputSnapshot,
                productRun,
            });
            await store.prisma.workflowRun.update({
                where: { id: terminal.runId },
                data: { status: "failed" },
            });
            await expect(store.recoverWorkflowRun({ runId: terminal.runId }))
                .rejects.toMatchObject({ code: "conflict" });
        });
    });

    it("listWorkflowRuns returns recent runs newest-first, limited and source-filtered", async () => {
        await withTestDatabase("workflow-host", async (database) => {
            const store = createStore(database);
            // WorkflowRun 的来源外键要求筛选目标先落库，不能只在 envelope 中虚构来源 id。
            await store.prisma.sourceInstance.createMany({
                data: ["source-a", "source-b"].map((id) => ({
                    id,
                    name: id,
                    kind: "fixture-rss",
                    sourceDefinitionRef: "source.fixture-rss@1",
                    operationId: "fetch",
                    configJson: "{}",
                })),
            });
            await store.createWorkflowEnvelope({
                runId: "run-old",
                idempotencyKey: "run-old",
                definition,
                inputSnapshot,
                productRun,
                sourceId: "source-a",
                createdAt: "2026-09-09T00:00:00.000Z",
            });
            await store.createWorkflowEnvelope({
                runId: "run-new-a",
                idempotencyKey: "run-new-a",
                definition,
                inputSnapshot,
                productRun,
                sourceId: "source-a",
                createdAt: "2026-09-10T00:00:00.000Z",
            });
            await store.createWorkflowEnvelope({
                runId: "run-new-b",
                idempotencyKey: "run-new-b",
                definition,
                inputSnapshot,
                productRun,
                sourceId: "source-b",
                createdAt: "2026-09-10T01:00:00.000Z",
            });

            const all = await store.listWorkflowRuns({ limit: 10 });
            expect(all.map((envelope) => envelope.runId)).toEqual(["run-new-b", "run-new-a", "run-old"]);

            const limited = await store.listWorkflowRuns({ limit: 2 });
            expect(limited.map((envelope) => envelope.runId)).toEqual(["run-new-b", "run-new-a"]);

            const filtered = await store.listWorkflowRuns({ sourceId: "source-a", limit: 10 });
            expect(filtered.map((envelope) => envelope.runId)).toEqual(["run-new-a", "run-old"]);
        });
    });
});
