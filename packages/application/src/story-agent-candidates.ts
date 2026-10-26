import { storyAgentCandidateSchema, type StoryAgentCandidate, type StoryAgentCandidateRecordContract } from "@cosmos/contracts";
import { requireContentProfile, type ContentReadAuthority } from "./content-access-policy.js";

export type StoryAgentCandidateStatus = "pending" | "accepted" | "rejected";

export interface StoryAgentCandidateRecord {
    candidate: StoryAgentCandidate;
    status: StoryAgentCandidateStatus;
    sourceStatus?: StoryAgentCandidateRecordContract["sourceStatus"];
}

/** The repository commits the decision, formal command and audit atomically. */
export interface StoryAgentCandidateRepository {
    save(candidate: StoryAgentCandidate): Promise<StoryAgentCandidateRecord>;
    list(storyId: string): Promise<readonly StoryAgentCandidateRecord[]>;
    decide(input: {
        candidateId: string;
        decision: "accept" | "reject";
        actorId: string;
    }): Promise<StoryAgentCandidateRecord>;
}

export interface StoryAgentCandidateAuthority {
    actorId: string;
    canManageCandidates: boolean;
}

export class StoryAgentCandidateError extends Error {
    constructor(readonly code: "not_found" | "conflict" | "unsupported", message: string) {
        super(message);
        this.name = "StoryAgentCandidateError";
    }
}

export class StoryAgentCandidates {
    constructor(private readonly repository: StoryAgentCandidateRepository) {}

    async save(candidate: StoryAgentCandidate): Promise<StoryAgentCandidateRecord> {
        return this.repository.save(storyAgentCandidateSchema.parse(candidate));
    }

    async list(storyId: string, authority: ContentReadAuthority): Promise<readonly StoryAgentCandidateRecord[]> {
        requireContentProfile(authority, "summary-only");
        if (!storyId.trim()) throw new Error("Invalid Story candidate story ID");
        return this.repository.list(storyId);
    }

    async decide(
        candidateId: string,
        decision: "accept" | "reject",
        authority: StoryAgentCandidateAuthority,
    ): Promise<StoryAgentCandidateRecord> {
        if (!authority.canManageCandidates || !authority.actorId.trim()) {
            throw new Error("Story candidate management access denied");
        }
        if (!candidateId.trim() || (decision !== "accept" && decision !== "reject")) {
            throw new Error("Invalid Story candidate decision");
        }
        return this.repository.decide({ candidateId, decision, actorId: authority.actorId });
    }
}
