import { z } from "zod";

const originalFetch = globalThis.fetch;
const requestSchema = z.object({
    model: z.literal("synthetic-story-model"),
    messages: z.array(z.object({ role: z.string(), content: z.string().nullable().optional() }).passthrough()),
}).passthrough();
let calls = 0;

// Only the isolated browser Worker's preload owns this reserved origin; production configuration and URL policy stay unchanged.
globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== "https://story-agent.e2e.invalid") return originalFetch(input, init);
    const request = new Request(input, init);
    if (url.pathname !== "/v1/chat/completions" || request.method !== "POST"
        || request.headers.get("authorization") !== "Bearer e2e-synthetic-key") {
        return Response.json({ error: { message: "Synthetic fixture request rejected" } }, { status: 400 });
    }
    const body = requestSchema.parse(await request.json());
    const user = body.messages.find((message) => message.role === "user");
    const prompt = z.object({ task: z.literal("story.summarize") }).passthrough().parse(JSON.parse(user?.content ?? "null"));
    calls += 1;
    const proposal = JSON.stringify({ task: prompt.task, title: `Synthetic generated title ${calls}`,
        summary: `Isolated model summary ${calls}`, keyFacts: [] });
    const chunk = (delta, finishReason, usage) => ({ id: `chatcmpl-synthetic-${calls}`, object: "chat.completion.chunk",
        created: 1_793_000_000, model: body.model, choices: [{ index: 0, delta, finish_reason: finishReason }],
        ...(usage ? { usage } : {}) });
    const events = [chunk({ role: "assistant", content: proposal }, null),
        chunk({}, "stop", { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })];
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream" },
    });
};
