import { describe, expect, it, vi } from "vitest";

import { DeferredActivityNotFoundError } from "@notnotype/nb-workflow";

import { ActionExecutionError, ActionRegistry } from "./action.js";
import { createAgentInvocationAction, FakeAgentInvocationAdapter } from "./agent-invocation.js";
import { WorkflowActivityWorker } from "./workflow-activity-worker.js";
import { WorkflowCompletionDispatcher } from "./workflow-completion-dispatcher.js";
import { WorkflowRunLane } from "./workflow-run-lane.js";
import type {
    CompleteActivityInput,
    CompleteActivityResult,
    WorkflowActivityJobClaim,
    WorkflowRunLease,
} from "./workflow-host.js";
import {
    actionDefinition,
    activityJob,
    agentInput,
    agentOutput,
    clock,
    completion,
    definition,
    fakeStore,
    runLease,
    runnerFactory,
    view,
} from "./workflow-host-runtime.fixtures.js";
describe("Workflow Host runtime", () => {
    it("requeues a completion when durable delivery returns false", async () => {
        let requeued: unknown;
        const dispatcher = new WorkflowCompletionDispatcher({
            store: fakeStore({
                deliverWorkflowCompletion: async () => false,
                requeueWorkflowCompletion: async (input: unknown) => {
                    requeued = input;
                    return true;
                },
            }),
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            completionRetryDelayMs: 0,
            now: () => clock,
            runnerFactory: runnerFactory(() => undefined),
        });
        await expect(dispatcher.pollOnce()).resolves.toBeNull();
        expect(requeued).toMatchObject({ completionId: "completion-1" });
    });

    it("returns null when no completion is claimable", async () => {
        let created = false;
        const dispatcher = new WorkflowCompletionDispatcher({
            store: fakeStore({ claimWorkflowCompletion: async () => null }),
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            runnerFactory: runnerFactory(() => { created = true; }),
        });
        await expect(dispatcher.pollOnce()).resolves.toBeNull();
        expect(created).toBe(false);
    });

    it("requeues a completion when its Run claim is unavailable", async () => {
        let requeued: unknown;
        let deadLettered = false;
        const dispatcher = new WorkflowCompletionDispatcher({
            store: fakeStore({
                claimRun: async () => null,
                requeueWorkflowCompletion: async (input: unknown) => {
                    requeued = input;
                    return true;
                },
                deadLetterWorkflowCompletion: async () => {
                    deadLettered = true;
                    return true;
                },
            }),
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            completionRetryDelayMs: 0,
            runnerFactory: runnerFactory(() => undefined),
        });
        await expect(dispatcher.pollOnce()).resolves.toBeNull();
        expect(requeued).toMatchObject({
            completionId: "completion-1",
            error: "Workflow Run lease is unavailable.",
        });
        expect(deadLettered).toBe(false);
    });

    it("dead-letters completion after max delivery attempts", async () => {
        let deadLettered: unknown;
        const dispatcher = new WorkflowCompletionDispatcher({
            store: fakeStore({
                claimWorkflowCompletion: async () => ({ ...completion(), attempts: 5, maxAttempts: 5 }),
                deadLetterWorkflowCompletion: async (input: unknown) => {
                    deadLettered = input;
                    return true;
                },
                requeueWorkflowCompletion: async () => {
                    throw new Error("must not requeue exhausted completion");
                },
            }),
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            runnerFactory: runnerFactory(() => undefined, {
                completeActivity: async () => { throw new Error("transient"); },
            }),
        });
        await expect(dispatcher.pollOnce()).resolves.toBeNull();
        expect(deadLettered).toMatchObject({ completionId: "completion-1", error: "transient" });
    });

    it("rejects a legacy Activity kind before claiming its Run", async () => {
        let claimedRun = false;
        const legacy = { ...activityJob(), kind: "source-ingest" } as unknown as WorkflowActivityJobClaim;
        const dispatcher = new WorkflowActivityWorker({
            store: fakeStore({
                claimActivityJob: async () => legacy,
                claimRun: async () => {
                    claimedRun = true;
                    return runLease;
                },
            }),
            actions: new ActionRegistry(),
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
        });
        await expect(dispatcher.pollOnce()).resolves.toBeNull();
        expect(claimedRun).toBe(false);
    });

    it("returns null when the Run lane has no claim", async () => {
        let created = false;
        const lane = new WorkflowRunLane({
            store: fakeStore({ claimRun: async () => null }),
            owner: runLease.owner,
            heartbeatMs: 0,
            now: () => clock,
            resolveDefinition: () => definition,
            runnerFactory: runnerFactory(() => { created = true; }),
        });
        await expect(lane.pollOnce()).resolves.toBeNull();
        expect(created).toBe(false);
    });

    it("executes agent.invoke@1 through the Activity Worker and completes with JSON-safe output", async () => {
        let completed: CompleteActivityInput | undefined;
        const actions = new ActionRegistry([
            createAgentInvocationAction(new FakeAgentInvocationAdapter({
                kind: "success",
                output: agentOutput,
            })),
        ]);
        const job = {
            ...activityJob(),
            payload: {
                ...activityJob().payload,
                reference: "agent.invoke@1",
                input: agentInput,
            },
        };
        const worker = new WorkflowActivityWorker({
            store: fakeStore({
                claimActivityJob: async () => job,
                completeActivity: async (input: CompleteActivityInput) => {
                    completed = input;
                    return { accepted: true, jobStatus: input.result.status, completion: null };
                },
            }),
            actions,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
        });

        await expect(worker.pollOnce()).resolves.toMatchObject({ accepted: true, jobStatus: "succeeded" });
        expect(completed).toMatchObject({
            result: { status: "succeeded" },
            completion: { status: "completed", result: agentOutput },
        });
    });

    it("requeues retryable Agent Adapter errors using the existing Activity policy", async () => {
        let completed: CompleteActivityInput | undefined;
        const actions = new ActionRegistry([
            createAgentInvocationAction(new FakeAgentInvocationAdapter({
                kind: "error",
                code: "dependency_unavailable",
                message: "No fake provider configured.",
                retryable: true,
            })),
        ]);
        const job = {
            ...activityJob(),
            attempts: 1,
            maxAttempts: 3,
            payload: {
                ...activityJob().payload,
                reference: "agent.invoke@1",
                input: agentInput,
            },
        };
        const worker = new WorkflowActivityWorker({
            store: fakeStore({
                claimActivityJob: async () => job,
                completeActivity: async (input: CompleteActivityInput) => {
                    completed = input;
                    return { accepted: true, jobStatus: input.result.status, completion: null };
                },
            }),
            actions,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            retryDelayMs: 250,
        });

        await expect(worker.pollOnce()).resolves.toMatchObject({ accepted: true, jobStatus: "retry_wait" });
        expect(completed).toMatchObject({
            result: {
                status: "retry_wait",
                errorCode: "dependency_unavailable",
                error: "No fake provider configured.",
                retryDelayMs: 1_000,
            },
        });
        expect(completed).not.toHaveProperty("completion");
    });

    it("maps retryable Activity failures below exhaustion to retry_wait", async () => {
        let completed: CompleteActivityInput | undefined;
        const actions = new ActionRegistry();
        actions.register(actionDefinition(), async () => {
            throw new ActionExecutionError("rate_limited", "try later", true);
        });
        const worker = new WorkflowActivityWorker({
            store: fakeStore({
                claimActivityJob: async () => ({ ...activityJob(), attempts: 1, maxAttempts: 3 }),
                completeActivity: async (input: CompleteActivityInput) => {
                    completed = input;
                    return { accepted: true, jobStatus: input.result.status, completion: null };
                },
            }),
            actions,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            retryDelayMs: 250,
        });
        await expect(worker.pollOnce()).resolves.toMatchObject({ accepted: true, jobStatus: "retry_wait" });
        expect(completed).toMatchObject({ result: {
            status: "retry_wait",
            errorCode: "rate_limited",
            error: "try later",
            retryDelayMs: 250,
        } });
        expect(completed).not.toHaveProperty("completion");
    });

    it("enforces an Action manifest retryableErrors allow-list", async () => {
        let completed: CompleteActivityInput | undefined;
        const actions = new ActionRegistry();
        actions.register({
            ...actionDefinition(),
            execution: {
                ...actionDefinition().execution,
                retryPolicy: {
                    maxAttempts: 5,
                    backoffMs: 700,
                    retryableErrors: ["timeout"],
                },
            },
        }, async () => {
            throw new ActionExecutionError("rate_limited", "not allowed by policy", true);
        });
        const worker = new WorkflowActivityWorker({
            store: fakeStore({
                claimActivityJob: async () => ({ ...activityJob(), attempts: 1, maxAttempts: 5 }),
                completeActivity: async (input: CompleteActivityInput) => {
                    completed = input;
                    return { accepted: true, jobStatus: input.result.status, completion: null };
                },
            }),
            actions,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            retryDelayMs: 1,
        });
        await expect(worker.pollOnce()).resolves.toMatchObject({ accepted: true, jobStatus: "failed_terminal" });
        expect(completed).toMatchObject({
            result: { status: "failed_terminal", errorCode: "rate_limited" },
            completion: { status: "failed", error: "not allowed by policy" },
        });
    });

    it("classifies retryable Activity failures at exhaustion without completion", async () => {
        let completed: CompleteActivityInput | undefined;
        const job = { ...activityJob(), attempts: 3, maxAttempts: 3 };
        const actions = new ActionRegistry();
        actions.register(actionDefinition(), async () => {
            throw new ActionExecutionError("rate_limited", "slow down", true);
        });
        const worker = new WorkflowActivityWorker({
            store: fakeStore({
                claimActivityJob: async () => job,
                completeActivity: async (input: CompleteActivityInput) => {
                    completed = input;
                    return { accepted: true, jobStatus: input.result.status, completion: null };
                },
            }),
            actions,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
        });
        await expect(worker.pollOnce()).resolves.toMatchObject({ accepted: true, jobStatus: "failed_terminal" });
        expect(completed?.result).toMatchObject({ status: "failed_terminal", errorCode: "rate_limited" });
        expect(completed).toMatchObject({ completion: { status: "failed", error: "slow down" } });
    });

    it("maps AbortError and cancelled errors to a cancelled completion", async () => {
        const outcomes: readonly unknown[] = [
            new DOMException("aborted", "AbortError"),
            { code: "cancelled", message: "stopped" },
        ];
        for (const failure of outcomes) {
            let completed: CompleteActivityInput | undefined;
            const actions = new ActionRegistry();
            actions.register(actionDefinition(), async () => ({ echoed: "ignored" }));
            vi.spyOn(actions, "dispatch").mockRejectedValue(failure);
            const worker = new WorkflowActivityWorker({
                store: fakeStore({
                    completeActivity: async (input: CompleteActivityInput) => {
                        completed = input;
                        return { accepted: true, jobStatus: input.result.status, completion: null };
                    },
                }),
                actions,
                owner: runLease.owner,
                leaseMs: 10_000,
                heartbeatMs: 0,
                now: () => clock,
            });
            await worker.pollOnce();
            expect(completed).toMatchObject({
                result: { status: "cancelled", errorCode: "cancelled" },
                completion: { status: "cancelled" },
            });
            vi.restoreAllMocks();
        }
    });

    it("releases an Activity Job when its Run claim is unavailable", async () => {
        let released: unknown;
        const store = fakeStore({
            claimRun: async () => null,
            releaseActivityJob: async (input: unknown) => { released = input; return true; },
        });
        const worker = new WorkflowActivityWorker({
            store,
            actions: new ActionRegistry(),
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
        });
        await expect(worker.pollOnce()).resolves.toBeNull();
        expect(released).toMatchObject({ jobId: "job-1", reason: "Workflow Run lease is unavailable." });
    });

    it("returns null and does not complete when the Activity heartbeat is lost", async () => {
        let completed = false;
        let resolveAction: (value: unknown) => void = () => undefined;
        const actionGate = new Promise<unknown>((resolve) => {
            resolveAction = resolve;
        });
        const actions = new ActionRegistry();
        actions.register(actionDefinition(), async () => actionGate);
        const store = fakeStore({
            heartbeatRun: async () => false,
            completeActivity: async () => {
                completed = true;
                return { accepted: true, jobStatus: "succeeded", completion: null };
            },
        });
        const worker = new WorkflowActivityWorker({
            store,
            actions,
            owner: runLease.owner,
            leaseMs: 10,
            heartbeatMs: 1,
            now: () => clock,
        });
        vi.useFakeTimers();
        try {
            const pending = worker.pollOnce();
            const rejection = expect(pending).rejects.toMatchObject({ code: "lease_lost" });
            await vi.advanceTimersByTimeAsync(1);
            await rejection;
        } finally {
            resolveAction({ ok: true });
            vi.useRealTimers();
        }
        expect(completed).toBe(false);
    });
    it("uses the claimed Run id for begin and releases with the injected clock", async () => {
        const released: WorkflowRunLease[] = [];
        let createdOptions: Record<string, unknown> | undefined;
        const store = fakeStore({
            releaseRun: async (input: WorkflowRunLease & { now?: Date }) => {
                released.push(input);
                return true;
            },
        });
        const lane = new WorkflowRunLane({
            store,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            resolveDefinition: () => definition,
            runnerFactory: runnerFactory((options) => {
                createdOptions = options;
            }),
        });

        const result = await lane.pollOnce();

        expect(result?.runId).toBe(runLease.runId);
        expect(released).toEqual([{ ...runLease, now: clock }]);
        const idsValue = createdOptions?.ids;
        expect(idsValue && typeof idsValue === "object" && "nextId" in idsValue
            && typeof idsValue.nextId === "function"
            ? idsValue.nextId("run")
            : undefined).toBe(runLease.runId);
    });

    it("reruns adopted Kernel state after a crash instead of beginning twice", async () => {
        let beginCalls = 0;
        let rerunCalls = 0;
        const store = fakeStore({ hasWorkflowKernelState: async () => true });
        const lane = new WorkflowRunLane({
            store,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            resolveDefinition: () => definition,
            runnerFactory: runnerFactory(() => undefined, {
                begin: async () => {
                    beginCalls += 1;
                    return view("completed");
                },
                rerun: async () => {
                    rerunCalls += 1;
                    return view("completed");
                },
            }),
        });

        await lane.pollOnce();

        expect(beginCalls).toBe(0);
        expect(rerunCalls).toBe(1);
    });

    it("dispatches an Activity with the durable identity and atomically completes it", async () => {
        let completed: CompleteActivityInput | undefined;
        const store = fakeStore({
            completeActivity: async (input: CompleteActivityInput): Promise<CompleteActivityResult> => {
                completed = input;
                return {
                    accepted: true,
                    jobStatus: input.result.status,
                    completion: null,
                };
            },
        });
        const actions = new ActionRegistry();
        actions.register(actionDefinition(), async (input) => {
            if (typeof input !== "object" || input === null || !("value" in input)
                || typeof input.value !== "string") {
                throw new Error("schema did not validate input");
            }
            return { echoed: input.value };
        });
        const worker = new WorkflowActivityWorker({
            store,
            actions,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
        });

        const result = await worker.pollOnce();

        expect(result).toMatchObject({ accepted: true, jobStatus: "succeeded" });
        expect(completed).toMatchObject({
            jobLease: {
                jobId: "job-1",
                leaseToken: "job-token",
                owner: "worker-1",
            },
            runLease,
            result: { status: "succeeded", result: { echoed: "hello" } },
            completion: {
                activityKey: "root#0",
                receipt: "job-1",
                reference: "demo.echo@1",
                fingerprint: "sha256:activity",
                status: "completed",
                result: { echoed: "hello" },
            },
            now: clock,
        });
    });

    it("does not invoke an action when dispatch authorization was already consumed", async () => {
        let actionCalls = 0;
        let completeCalls = 0;
        const actions = new ActionRegistry();
        actions.register(actionDefinition(), async () => {
            actionCalls += 1;
            return { echoed: "hello" };
        });
        const worker = new WorkflowActivityWorker({
            store: fakeStore({
                consumeActivityDispatch: async () => ({ accepted: false, alreadyConsumed: true }),
                completeActivity: async () => {
                    completeCalls += 1;
                    return { accepted: false, jobStatus: "leased", completion: null };
                },
            }),
            actions,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
        });

        await expect(worker.pollOnce()).rejects.toMatchObject({ code: "lease_lost" });
        expect(actionCalls).toBe(0);
        expect(completeCalls).toBe(0);
    });

    it("passes a host-only fence without leaking lease fields to public payloads", async () => {
        let observed: unknown;
        const actions = new ActionRegistry();
        actions.register(actionDefinition("host"), async (_input, received) => {
            observed = received;
            return { echoed: "hello" };
        });
        const worker = new WorkflowActivityWorker({
            store: fakeStore(),
            actions,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
        });

        await worker.pollOnce();

        expect(observed).toMatchObject({
            idempotencyKey: "run-1:root#0:sha256:activity",
            fence: {
                workflowRunId: "run-1",
                kernelRevision: 1,
                activity: activityJob().payload.activity,
                jobId: "job-1",
                attempt: 1,
                jobLeaseToken: "job-token",
                runLeaseToken: "run-token",
            },
        });
        expect(observed).not.toHaveProperty("leaseToken");
        expect(activityJob().payload).not.toHaveProperty("jobLeaseToken");
        expect(activityJob().payload).not.toHaveProperty("runLeaseToken");
    });

    it("requeues a completion when durable delivery is temporarily rejected", async () => {
        let requeued = 0;
        let deadLettered = 0;
        const store = fakeStore({
            deliverWorkflowCompletion: async () => false,
            requeueWorkflowCompletion: async (input: { availableAt?: string }) => {
                requeued += 1;
                expect(input.availableAt).toBe(new Date(clock.getTime() + 1_000).toISOString());
                return true;
            },
            deadLetterWorkflowCompletion: async () => {
                deadLettered += 1;
                return true;
            },
        });
        const dispatcher = new WorkflowCompletionDispatcher({
            store,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            runnerFactory: runnerFactory(() => undefined),
        });
        await dispatcher.pollOnce();
        expect(requeued).toBe(1);
        expect(deadLettered).toBe(0);
    });

    it("delivers the final Activity after Kernel execution becomes terminal", async () => {
        let delivered = 0;
        let deadLettered = 0;
        const store = fakeStore({
            deliverWorkflowCompletion: async () => {
                delivered += 1;
                return true;
            },
            deadLetterWorkflowCompletion: async () => {
                deadLettered += 1;
                return true;
            },
        });
        const dispatcher = new WorkflowCompletionDispatcher({
            store,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            runnerFactory: runnerFactory(() => undefined, {
                completeActivity: async () => view("completed"),
            }),
        });
        await expect(dispatcher.pollOnce()).resolves.toMatchObject({ status: "completed" });
        expect(delivered).toBe(1);
        expect(deadLettered).toBe(0);
    });

    it("dead-letters deterministic Kernel completion errors and requeues transient errors", async () => {
        let requeued = 0;
        let deadLettered = 0;
        const store = fakeStore({
            requeueWorkflowCompletion: async () => {
                requeued += 1;
                return true;
            },
            deadLetterWorkflowCompletion: async () => {
                deadLettered += 1;
                return true;
            },
        });
        const deterministic = new WorkflowCompletionDispatcher({
            store,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            runnerFactory: runnerFactory(() => undefined, {
                completeActivity: async () => {
                    throw new DeferredActivityNotFoundError("root#0");
                },
            }),
        });
        await deterministic.pollOnce();
        expect(deadLettered).toBe(1);

        const transient = new WorkflowCompletionDispatcher({
            store,
            owner: runLease.owner,
            leaseMs: 10_000,
            heartbeatMs: 0,
            now: () => clock,
            runnerFactory: runnerFactory(() => undefined, {
                completeActivity: async () => {
                    throw new Error("database unavailable");
                },
            }),
        });
        await transient.pollOnce();
        expect(requeued).toBe(1);
    });
});
