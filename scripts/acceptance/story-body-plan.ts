import { ContentQuery, bindContentBlocks } from "@cosmos/application";
import { normalizeContent } from "../../packages/application/src/content-normalizer.js";
import { prepareStoryAgentRequest } from "../../packages/application/src/story-agent-preparation.js";
import { acceptancePlan } from "./story-agent-plan.js";

export const bodyStory = { storyId: "task40-body-story", storyRevisionId: "task40-body-story-revision",
    title: "Synthetic library event", summary: "A library announced an event.", entryRevisionIds: ["task40-body-entry-revision"] };
export const sourceText = "The synthetic Cedar Library will hold a map-reading workshop on 14 November 2026 at 10:30.\n\nThe workshop has 18 seats. Registration closes on 11 November. Entry is free and participants should bring a pencil.";
const draft = normalizeContent({ format: "plain-text", text: sourceText });
export const bodyRepresentation = { id: "task40-body-representation", entryRevisionId: bodyStory.entryRevisionIds[0]!,
    representationVersion: 1, ...draft, blocks: bindContentBlocks(draft.blocks, []),
    supersedesRepresentationId: null, createdAt: "2026-10-29T00:00:00.000Z" };
export const bodySource = { entryId: "task40-body-entry", entryRevisionId: bodyRepresentation.entryRevisionId,
    contentText: draft.contentText, currentRepresentationId: bodyRepresentation.id,
    representation: bodyRepresentation, evidenceStatus: "available" as const };
export const bodyBindings = [{ entryRevisionId: bodyRepresentation.entryRevisionId, representationVersion: 1 }];

// The same preparation owner builds both the disclosure and the actual queued request.
export async function bodyAcceptancePlan() {
    const prepared = await prepareStoryAgentRequest({ readStory: async () => bodyStory },
        new ContentQuery({ readContentSource: async () => bodySource }),
        { storyId: bodyStory.storyId, task: "story.summarize", sources: bodyBindings },
        { connectionId: "task40-body-plan", authority: { allowedProfiles: ["summary-only", "structured-content"] },
            budget: { maxDurationMs: 60_000, maxOutputTokens: 512, maxToolCalls: 0 } });
    return { ...acceptancePlan, version: 2, sources: [bodySource], sourceText, messages: prepared.input.messages,
        decision: "Only a human in the isolated Web may accept/reject. No automatic decision. Refresh and confirm persistence before ending the terminal session.",
        runtime: "Real API queue; existing Worker Host/@2/SDK in this terminal process; production Web. Not a full Worker-process acceptance." };
}
