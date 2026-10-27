import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { StoryAgentWorkflowControl } from "@cosmos/application";
import type { WorkflowHostComposition } from "../../apps/worker/src/workflow-host.js";
import { withBoundedProviderTransport } from "../../.agents/tasks/39-pi-ai-adapter/connection-smoke-harness.js";
import { acceptancePlan, storySnapshot } from "./story-agent-plan.js";
import { abortable } from "./story-agent-deadline.js";

const wireRequest = z.object({ model: z.literal("gpt-6-luna"), messages: z.array(z.object({ role: z.string(), content: z.string() }).passthrough()),
    max_tokens: z.literal(512).optional(), max_completion_tokens: z.literal(512).optional(),
    stream: z.literal(true), tools: z.array(z.unknown()).optional() }).passthrough()
    .refine((body) => (body.max_tokens === 512) !== (body.max_completion_tokens === 512));

export class GenerationDeadlineError extends Error {}

export async function runStoryGeneration(options: {
    host: WorkflowHostComposition; control: StoryAgentWorkflowControl; runId: string;
    credential: string; transport: typeof fetch; maxDurationMs: number; onSend: () => void;
}): Promise<void> {
    const controller = new AbortController();
    const deadline = performance.now() + options.maxDurationMs;
    const expire = () => {
        if (controller.signal.aborted) return;
        controller.abort(new DOMException("Generation deadline exceeded.", "AbortError"));
        options.host.activityWorker.abortActive(controller.signal.reason);
    };
    const check = () => {
        if (performance.now() >= deadline) expire();
        controller.signal.throwIfAborted();
    };
    const timer = setTimeout(expire, options.maxDurationMs);
    try {
        // Keep the one-send guard installed until the active SDK call has unwound, even after cancellation.
        await withBoundedProviderTransport(async () => {
            for (let tick = 0; tick < 100; tick++) {
                check();
                await abortable(controller.signal, () => options.host.runLane.pollOnce({ runId: options.runId }));
                check();
                await options.host.activityWorker.pollOnce();
                check();
                await abortable(controller.signal, () => options.host.completionDispatcher.pollOnce());
                const state = await abortable(controller.signal, () => options.control.read(storySnapshot.storyId, options.runId));
                if (["completed", "failed", "cancelled"].includes(state.status)) break;
                await delay(25, undefined, { signal: controller.signal });
            }
        }, async (input, init) => {
            check();
            const body = wireRequest.parse(JSON.parse(String(init?.body)));
            if (JSON.stringify(body.messages) !== JSON.stringify(acceptancePlan.messages) || body.tools?.length ||
                new Headers(init?.headers).get("authorization") !== `Bearer ${options.credential}`) throw new Error("Unapproved request payload");
            options.onSend();
            const signals = init?.signal ? [controller.signal, init.signal] : [controller.signal];
            return abortable(controller.signal, () => options.transport(input, { ...init, signal: AbortSignal.any(signals) }));
        });
        check();
    } catch (error) {
        if (controller.signal.aborted) throw new GenerationDeadlineError("Generation deadline exceeded.");
        throw error;
    } finally { clearTimeout(timer); }
}
