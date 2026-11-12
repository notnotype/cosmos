import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createFixtureSource, withRepository } from "./index.fixtures.js";

/**
 * OPS-002：产品面要能从 Run 走到 Job（状态、重试次数、错误）。Run 投影里没有 job 引用，
 * 所以由 `listRunJobs(runId)` 提供；`runId` 必须同时覆盖 legacy Run 与 durable WorkflowRun
 * 两种外键（两者共用同一个 Run 读端点）。
 */
it("redacts Story Agent job and attempt diagnostics without changing other workflows", async () => {
    await withRepository("story-agent-public-errors", async (repository) => {
        const now = new Date();
        const run = await repository.prisma.workflowRun.create({ data: {
            id: "story-run", stateJson: "{}", status: "failed", definitionKey: "cosmos.story-agent",
            definitionVersion: "1", manifestHash: "test", inputSnapshotJson: "{}", productRunJson: "{}",
            createdAt: now, updatedAt: now,
        } });
        const job = await repository.prisma.job.create({ data: {
            id: "story-job", workflowRunId: run.id, kind: "workflow-activity", status: "failed_terminal",
            errorCode: "private_provider_exception", errorMessage: "PRIVATE_PROVIDER_MESSAGE",
            resultJson: JSON.stringify({ error: "PRIVATE_RESULT_EXCEPTION" }), idempotencyKey: "story-job-key",
        } });
        await repository.prisma.domainEvent.create({ data: {
            eventId: randomUUID(), type: "workflow.activity.failed_terminal.v1", version: "v1",
            payloadJson: JSON.stringify({ attempt: 1, owner: "worker", error: "PRIVATE_ATTEMPT_MESSAGE" }),
            aggregateType: "WorkflowActivityJob", aggregateId: job.id, workflowRunId: run.id,
        } });

        const single = await repository.getJob(job.id);
        expect(single).toMatchObject({ errorCode: "generation_failed", error: "Story Agent generation failed.", result: null });
        expect(JSON.stringify(single)).not.toContain("PRIVATE_");
        const retryJob = await repository.prisma.job.create({ data: {
            id: "story-retry-job", workflowRunId: run.id, kind: "workflow-activity", status: "failed_terminal",
            attempts: 2, errorCode: "timeout", errorMessage: "PRIVATE_FINAL_TIMEOUT", idempotencyKey: "story-retry-key",
        } });
        await repository.prisma.domainEvent.createMany({ data: [
            { eventId: randomUUID(), type: "workflow.activity.retry_wait.v1", version: "v1",
                payloadJson: JSON.stringify({ attempt: 1, owner: "worker", error: "PRIVATE_FIRST_RATE_LIMIT" }),
                aggregateType: "WorkflowActivityJob", aggregateId: retryJob.id, workflowRunId: run.id },
            { eventId: randomUUID(), type: "workflow.activity.failed_terminal.v1", version: "v1",
                payloadJson: JSON.stringify({ attempt: 2, owner: "worker", error: "PRIVATE_FINAL_TIMEOUT" }),
                aggregateType: "WorkflowActivityJob", aggregateId: retryJob.id, workflowRunId: run.id },
        ] });
        const retryAttempts = await repository.listWorkflowAttempts(retryJob.id);
        expect(retryAttempts).toHaveLength(2);
        expect(retryAttempts[0]?.error).toMatchObject({ code: "generation_failed", message: "Story Agent generation failed." });
        expect(retryAttempts[1]?.error).toMatchObject({ code: "timeout", message: "Story Agent generation timed out." });
        expect(JSON.stringify(retryAttempts)).not.toContain("PRIVATE_");
        const timeoutJob = await repository.prisma.job.create({ data: {
            id: "story-timeout-job", workflowRunId: run.id, kind: "workflow-activity", status: "failed_terminal",
            errorCode: "timeout", errorMessage: "PRIVATE_TIMEOUT_DETAIL", idempotencyKey: "story-timeout-key",
        } });
        expect(await repository.getJob(timeoutJob.id)).toMatchObject({
            errorCode: "timeout", error: "Story Agent generation timed out.", result: null,
        });
        const listed = (await repository.listRunJobs(run.id)).find((item) => item.id === job.id);
        expect(listed).toMatchObject({ errorCode: "generation_failed", error: "Story Agent generation failed.", result: null });
        const [attempt] = await repository.listWorkflowAttempts(job.id);
        expect(attempt?.error).toMatchObject({ code: "generation_failed", message: "Story Agent generation failed." });
        expect(JSON.stringify(attempt)).not.toContain("PRIVATE_");
        await expect(repository.getWorkflowAttempt(`${job.id}:attempt:1`)).resolves.toEqual(attempt);

        const cancelledJob = await repository.prisma.job.create({ data: {
            id: "story-cancelled-job", workflowRunId: run.id, kind: "workflow-activity", status: "cancelled",
            errorCode: "cancelled", errorMessage: "USER_CANCELLATION_REASON", idempotencyKey: "story-cancelled-key",
        } });
        await repository.prisma.domainEvent.create({ data: {
            eventId: randomUUID(), type: "workflow.activity.cancelled.v1", version: "v1",
            payloadJson: JSON.stringify({ attempt: 1, owner: "worker", error: "USER_CANCELLATION_REASON" }),
            aggregateType: "WorkflowActivityJob", aggregateId: cancelledJob.id, workflowRunId: run.id,
        } });
        const cancelledSnapshot = await repository.getJob(cancelledJob.id);
        expect(cancelledSnapshot).toMatchObject({ status: "cancelled", errorCode: null, error: null, result: null });
        const [cancelledAttempt] = await repository.listWorkflowAttempts(cancelledJob.id);
        expect(cancelledAttempt).toMatchObject({ status: "cancelled", error: null });

        const orphanEventId = `orphan-event-${randomUUID()}`;
        await repository.prisma.domainEvent.create({ data: {
            eventId: orphanEventId, type: "workflow.activity.failed_terminal.v1", version: "v1",
            payloadJson: JSON.stringify({ attempt: 1, owner: "worker", error: "ORPHANED_EVENT_SECRET" }),
            aggregateType: "WorkflowActivityJob", aggregateId: "deleted-job", workflowRunId: run.id,
        } });
        await expect(repository.listWorkflowAttempts("deleted-job")).resolves.toEqual([]);
        await expect(repository.getWorkflowAttempt("deleted-job:attempt:1")).resolves.toBeNull();

        const orphanJob = await repository.prisma.job.create({ data: {
            id: "orphan-job", kind: "workflow-activity", status: "failed_terminal",
            errorCode: "private_provider_exception", errorMessage: "ORPHANED_JOB_SECRET",
            resultJson: JSON.stringify({ error: "ORPHANED_RESULT_SECRET" }), idempotencyKey: "orphan-job-key",
        } });
        await repository.prisma.domainEvent.create({ data: {
            eventId: randomUUID(), type: "workflow.activity.failed_terminal.v1", version: "v1",
            payloadJson: JSON.stringify({ attempt: 1, owner: "worker", error: "ORPHANED_ATTEMPT_SECRET" }),
            aggregateType: "WorkflowActivityJob", aggregateId: orphanJob.id,
        } });
        await expect(repository.listWorkflowAttempts(orphanJob.id)).resolves.toEqual([]);
        await expect(repository.getWorkflowAttempt(`${orphanJob.id}:attempt:1`)).resolves.toBeNull();
        const orphanSnapshot = await repository.getJob(orphanJob.id);
        expect(orphanSnapshot).toMatchObject({
            errorCode: "generation_failed", error: "Workflow activity failed.", result: null,
        });
        expect(JSON.stringify(orphanSnapshot)).not.toContain("ORPHANED_");
        const otherRun = await repository.prisma.workflowRun.create({ data: {
            id: "other-run", stateJson: "{}", status: "failed", definitionKey: "cosmos.ingest",
            definitionVersion: "1", manifestHash: "test", inputSnapshotJson: "{}", productRunJson: "{}",
            createdAt: now, updatedAt: now,
        } });
        const otherJob = await repository.prisma.job.create({ data: {
            id: "other-job", workflowRunId: otherRun.id, kind: "workflow-activity", status: "failed_terminal",
            errorCode: "internal_error", errorMessage: "OTHER_WORKFLOW_DIAGNOSTIC", idempotencyKey: "other-job-key",
        } });
        const otherSnapshot = await repository.getJob(otherJob.id);
        expect(otherSnapshot?.error).toBe("OTHER_WORKFLOW_DIAGNOSTIC");
        expect(otherSnapshot?.errorCode).toBe("internal_error");
    });
});
it("lists the jobs of a run for both run flavours (OPS-002)", async () => {
    await withRepository("run-jobs", async (repository) => {
        const source = await createFixtureSource(repository, { name: "Run jobs", config: {} });
        const run = await repository.prisma.run.create({
            data: {
                sourceInstanceId: source.id,
                triggerKind: "manual",
                status: "running",
            },
        });

        await repository.prisma.job.create({
            data: {
                kind: "source-ingest",
                status: "queued",
                idempotencyKey: "run-jobs:legacy",
                runId: run.id,
                attempts: 0,
                maxAttempts: 3,
            },
        });
        await repository.prisma.job.create({
            data: {
                kind: "source-ingest",
                status: "queued",
                idempotencyKey: "run-jobs:other-run",
                attempts: 0,
                maxAttempts: 3,
            },
        });

        const jobs = await repository.listRunJobs(run.id);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({ runId: run.id, status: "queued", attempts: 0, maxAttempts: 3 });

        // 未知 Run 不报错，返回空列表（产品面据此显示"这个 Run 没有登记任务"）。
        expect(await repository.listRunJobs("run-does-not-exist")).toEqual([]);
    });
});
