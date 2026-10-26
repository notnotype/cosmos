import { z } from "zod";
import { evidenceRefSchema } from "./content-representation.js";
import { entryRelationTypeSchema } from "./entry-relation.js";

export const storyAgentTaskSchema = z.enum([
    "story.summarize", "story.extract-relations", "story.review-content-quality",
]);

export const storyAgentSourceBindingSchema = z.object({
    entryRevisionId: z.string().min(1),
    representationVersion: z.number().int().positive().safe(),
}).strict();

export const storyAgentRequestSchema = z.object({
    task: storyAgentTaskSchema,
    sources: storyAgentSourceBindingSchema.array().max(100).optional(),
}).strict();

export const storyAgentGenerationRequestSchema = storyAgentRequestSchema.extend({
    connectionId: z.string().trim().min(1).max(200),
}).strict();

export const storyAgentGenerationSchema = z.object({
    runId: z.string().min(1), storyId: z.string().min(1), task: storyAgentTaskSchema,
    connectionId: z.string().min(1),
    status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
    candidateId: z.string().nullable(),
    errorCode: z.enum(["generation_failed"]).nullable(),
}).strict();
export type StoryAgentGenerationRequest = z.infer<typeof storyAgentGenerationRequestSchema>;
export type StoryAgentGeneration = z.infer<typeof storyAgentGenerationSchema>;

const evidence = evidenceRefSchema.array().max(100);
export const storyAgentProposalSchema = z.discriminatedUnion("task", [
    z.object({
        task: z.literal("story.summarize"),
        title: z.string().trim().min(1).max(300),
        summary: z.string().trim().min(1).max(10000),
        keyFacts: z.object({ text: z.string().trim().min(1).max(500), evidence }).strict().array().max(20),
    }).strict(),
    z.object({
        task: z.literal("story.extract-relations"),
        relations: z.object({
            sourceEntryId: z.string().min(1),
            targetEntryId: z.string().min(1),
            type: entryRelationTypeSchema,
            reason: z.string().trim().min(1).max(2000),
            evidence,
        }).strict().array().max(100),
    }).strict(),
    z.object({
        task: z.literal("story.review-content-quality"),
        findings: z.object({
            severity: z.enum(["info", "warning", "error"]),
            message: z.string().trim().min(1).max(2000),
            evidence,
        }).strict().array().max(100),
    }).strict(),
]);

/** Provenance is supplied by the host after validating the model proposal. */
export const storyAgentCandidateSchema = z.object({
    id: z.string().min(1),
    storyId: z.string().min(1),
    storyRevisionId: z.string().min(1),
    producer: z.literal("agent"),
    producerVersion: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    inputSources: storyAgentSourceBindingSchema.array().max(100),
    confidence: z.number().min(0).max(1).nullable(),
    proposal: storyAgentProposalSchema,
    createdAt: z.string().datetime(),
}).strict();

export const storyAgentCandidateRecordSchema = z.object({
    candidate: storyAgentCandidateSchema,
    status: z.enum(["pending", "accepted", "rejected"]),
}).strict();

export const storyAgentCandidateDecisionSchema = z.object({
    decision: z.enum(["accept", "reject"]),
}).strict();

export type StoryAgentCandidateRecordContract = z.infer<typeof storyAgentCandidateRecordSchema>;
export type StoryAgentTask = z.infer<typeof storyAgentTaskSchema>;
export type StoryAgentSourceBinding = z.infer<typeof storyAgentSourceBindingSchema>;
export type StoryAgentProposal = z.infer<typeof storyAgentProposalSchema>;
export type StoryAgentCandidate = z.infer<typeof storyAgentCandidateSchema>;
