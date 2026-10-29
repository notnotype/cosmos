import { bodySource } from "./story-body-plan.js";

/** Synthetic SSE only: this helper never contacts a provider or reads credentials. */
export function createBodyOfflineTransport(): typeof fetch {
    return async () => {
        const proposal = { task: "story.summarize", title: "Synthetic map-reading workshop",
            summary: "Cedar Library offers 18 free seats for a workshop on 14 November 2026 at 10:30.",
            keyFacts: [{ text: "Registration closes on 11 November; bring a pencil.", evidence: [{
                entryId: bodySource.entryId, entryRevisionId: bodySource.entryRevisionId,
                representationVersion: 1, blockId: "block-1",
            }] }] };
        const event = { id: "synthetic-body", object: "chat.completion.chunk", created: 1_793_000_000,
            model: "gpt-6-luna", choices: [{ index: 0, delta: { role: "assistant", content: JSON.stringify(proposal) }, finish_reason: null }] };
        return new Response(`data: ${JSON.stringify(event)}\n\ndata: ${JSON.stringify({ ...event, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
            { headers: { "content-type": "text/event-stream" } });
    };
}
