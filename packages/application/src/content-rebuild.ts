import { contentSourceSchema } from "@cosmos/contracts";
import { normalizeContent, type ContentDraft } from "./content-normalizer.js";
import { ContentCommandError, type ContentCommandAuthority } from "./content-commands.js";

export interface ContentRebuildState {
    currentRepresentationId: string | null;
    locked: boolean;
    source: unknown;
}

export interface ContentRebuildRepository {
    readRebuildSource(entryRevisionId: string): Promise<ContentRebuildState | null>;
    commitRebuild(input: {
        entryRevisionId: string;
        expectedCurrentId: string | null;
        expectedLocked: boolean;
        draft: ContentDraft;
        actorId: string;
    }): Promise<{ representationId: string; representationVersion: number; promoted: boolean }>;
}

export class ContentRebuild {
    constructor(private readonly repository: ContentRebuildRepository) {}

    async rebuild(entryRevisionId: string, authority: ContentCommandAuthority) {
        if (!authority.canManageRepresentations || !authority.actorId.trim()) {
            throw new ContentCommandError("access_denied", "Content rebuild access denied");
        }
        if (!entryRevisionId.trim()) throw new ContentCommandError("invalid_command", "Invalid content source revision");
        const state = await this.repository.readRebuildSource(entryRevisionId);
        if (!state) throw new ContentCommandError("not_found", "Content source revision not found");
        // Missing declared input is not permission to reinterpret an arbitrary raw payload.
        if (state.source === null) throw new ContentCommandError("conflict", "Content rebuild input unavailable");
        const source = contentSourceSchema.safeParse(state.source);
        if (!source.success) throw new ContentCommandError("conflict", "Content rebuild input unavailable or invalid");
        return this.repository.commitRebuild({
            entryRevisionId,
            expectedCurrentId: state.currentRepresentationId,
            expectedLocked: state.locked,
            draft: normalizeContent(source.data),
            actorId: authority.actorId,
        });
    }
}
