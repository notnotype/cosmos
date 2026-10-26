import {
    feedPageSchema,
    mergeStoriesCommandSchema,
    migrateStoryUserStateCommandSchema,
    moveEntryToStoryCommandSchema,
    splitStoryCommandSchema,
    searchPageSchema,
    storyDetailSchema,
    storySubtypePageSchema,
    storyUserStateMigrationResultSchema,
    topicDetailSchema,
    topicPageSchema,
    addTopicMemberCommandSchema,
    createTopicCommandSchema,
    mergeTopicsCommandSchema,
    removeTopicMemberCommandSchema,
    restoreTopicMemberCommandSchema,
    updateTopicCommandSchema,
    updateTopicMemberRoleCommandSchema,
    updateStoryRevisionCommandSchema,
    entryDetailSchema,
    entryPageSchema,
    revisionDetailSchema,
    structuredContentViewSchema,
    contentSelectionCommandSchema,
    contentSelectionResultSchema,
    contentRebuildCommandSchema,
    contentRebuildResultSchema,
    storyAgentCandidateRecordSchema,
    storyAgentCandidateDecisionSchema,
    storyAgentGenerationRequestSchema,
    storyAgentGenerationSchema,
    type StoryAgentGeneration,
    type StoryAgentGenerationRequest,
    type StoryAgentCandidateRecordContract,
    type StructuredContentViewContract,
    type FeedPage,
    type SearchPage,
    type SearchQuery,
    type StoryDetail,
    type StorySubtype,
    type TopicDetail,
    type TopicPage,
    type AddTopicMemberCommand,
    type CreateTopicCommand,
    type MergeTopicsCommand,
    type RemoveTopicMemberCommand,
    type RestoreTopicMemberCommand,
    type UpdateTopicCommand,
    type UpdateTopicMemberRoleCommand,
    type EntryDetail,
    type EntryListQuery,
    type EntryPage,
    type MergeStoriesCommand,
    type MigrateStoryUserStateCommand,
    type SplitStoryCommand,
    type StoryUserStateMigrationResult,
    type MoveEntryToStoryCommand,
    type RevisionDetail,
    type UpdateStoryRevisionCommand,
    entityDetailSchema,
    entityPageSchema,
    createEntityCommandSchema,
    updateEntityCommandSchema,
    addEntityAliasCommandSchema,
    removeEntityAliasCommandSchema,
    linkStoryEntityCommandSchema,
    unlinkStoryEntityCommandSchema,
    linkEntryStoryCommandSchema,
    unlinkEntryStoryCommandSchema,
    linkEntryRelationCommandSchema,
    unlinkEntryRelationCommandSchema,
    createEntityRelationCommandSchema,
    removeEntityRelationCommandSchema,
    type EntityDetail,
    type EntityPage,
    type CreateEntityCommand,
    type UpdateEntityCommand,
    type AddEntityAliasCommand,
    type RemoveEntityAliasCommand,
    type LinkStoryEntityCommand,
    type UnlinkStoryEntityCommand,
    type LinkEntryStoryCommand,
    type UnlinkEntryStoryCommand,
    type LinkEntryRelationCommand,
    type UnlinkEntryRelationCommand,
    type CreateEntityRelationCommand,
    type RemoveEntityRelationCommand,
} from "@cosmos/contracts";

import { SourcesClient } from "./client-sources.js";
import type {
    CosmosEventSource,
    HttpCosmosClientOptions,
} from "./types.js";
import { CosmosTransportError } from "./types.js";
export class ContentClient extends SourcesClient {
    async revisionContent(revisionId: string, representationVersion?: number): Promise<StructuredContentViewContract> {
        if (representationVersion !== undefined && (!Number.isSafeInteger(representationVersion) || representationVersion < 1)) {
            throw new RangeError("representationVersion must be a positive safe integer.");
        }
        const params = new URLSearchParams();
        if (representationVersion !== undefined) params.set("representationVersion", String(representationVersion));
        const suffix = params.size ? `?${params.toString()}` : "";
        return this.request(`/api/v1/revisions/${encodeURIComponent(revisionId)}/content${suffix}`, {
            schema: structuredContentViewSchema,
        });
    }

    async feed(options: {
        cursor?: string;
        limit?: number;
    } = {}): Promise<FeedPage> {
        const params = new URLSearchParams();
        if (options.cursor) {
            params.set("cursor", options.cursor);
        }
        if (options.limit) {
            params.set("limit", String(options.limit));
        }
        return this.request(`/api/v1/feed?${params.toString()}`, {
            schema: feedPageSchema,
        });
    }

    async search(query: SearchQuery): Promise<SearchPage> {
        const params = new URLSearchParams();
        if (query.text) {
            params.set("text", query.text);
        }
        if (query.sourceId) {
            params.set("sourceId", query.sourceId);
        }
        if (query.publishedAfter) {
            params.set("publishedAfter", query.publishedAfter);
        }
        if (query.publishedBefore) {
            params.set("publishedBefore", query.publishedBefore);
        }
        if (query.labelIds) {
            params.set("labelIds", query.labelIds);
        }
        if (query.topicIds) {
            params.set("topicIds", query.topicIds);
        }
        // LIB-001 的三个过滤维度。
        if (query.author) {
            params.set("author", query.author);
        }
        if (query.contentKind) {
            params.set("contentKind", query.contentKind);
        }
        if (query.assetStatus) {
            params.set("assetStatus", query.assetStatus);
        }
        if (query.cursor) {
            params.set("cursor", query.cursor);
        }
        if (query.limit) {
            params.set("limit", String(query.limit));
        }
        return this.request(`/api/v1/search?${params.toString()}`, {
            schema: searchPageSchema,
        });
    }

    async proposeStoryAgentCandidate(storyId: string, request: StoryAgentGenerationRequest, idempotencyKey: string): Promise<StoryAgentGeneration> {
        if (!idempotencyKey.trim() || idempotencyKey.length > 200) throw new RangeError("A valid Idempotency-Key is required.");
        return this.request(`/api/v1/stories/${encodeURIComponent(storyId)}/agent-candidates`, {
            method: "POST", headers: { "idempotency-key": idempotencyKey },
            body: storyAgentGenerationRequestSchema.parse(request), schema: storyAgentGenerationSchema,
        });
    }

    async storyAgentGeneration(storyId: string, runId: string): Promise<StoryAgentGeneration> {
        return this.request(`/api/v1/stories/${encodeURIComponent(storyId)}/agent-generations/${encodeURIComponent(runId)}`, {
            schema: storyAgentGenerationSchema,
        });
    }

    async rebuildRevisionContent(revisionId: string) {
        return this.request(`/api/v1/revisions/${encodeURIComponent(revisionId)}/content/rebuild`, {
            method: "POST", body: contentRebuildCommandSchema.parse({}), schema: contentRebuildResultSchema,
        });
    }

    async storyAgentCandidates(storyId: string): Promise<StoryAgentCandidateRecordContract[]> {
        return this.request(`/api/v1/stories/${encodeURIComponent(storyId)}/agent-candidates`, {
            schema: storyAgentCandidateRecordSchema.array(),
        });
    }

    async decideStoryAgentCandidate(candidateId: string, decision: "accept" | "reject"): Promise<StoryAgentCandidateRecordContract> {
        return this.request(`/api/v1/story-agent-candidates/${encodeURIComponent(candidateId)}/decision`, {
            method: "POST", body: storyAgentCandidateDecisionSchema.parse({ decision }), schema: storyAgentCandidateRecordSchema,
        });
    }

    async story(storyId: string): Promise<StoryDetail> {
        return this.request(`/api/v1/stories/${encodeURIComponent(storyId)}`, {
            schema: storyDetailSchema,
        });
    }

    async moveEntryToStory(
        storyId: string,
        input: MoveEntryToStoryCommand,
    ): Promise<StoryDetail> {
        const payload = moveEntryToStoryCommandSchema.parse(input);
        return this.request(`/api/v1/stories/${encodeURIComponent(storyId)}/entry-moves`, {
            method: "POST",
            body: payload,
            schema: storyDetailSchema,
        });
    }

    async updateStoryRevision(
        storyId: string,
        input: UpdateStoryRevisionCommand,
    ): Promise<StoryDetail> {
        const payload = updateStoryRevisionCommandSchema.parse(input);
        return this.request(`/api/v1/stories/${encodeURIComponent(storyId)}/revisions`, {
            method: "POST",
            body: payload,
            schema: storyDetailSchema,
        });
    }

    async mergeStories(input: MergeStoriesCommand): Promise<StoryDetail> {
        const payload = mergeStoriesCommandSchema.parse(input);
        return this.request("/api/v1/stories/merges", {
            method: "POST",
            body: payload,
            schema: storyDetailSchema,
        });
    }

    async splitStory(storyId: string, input: SplitStoryCommand): Promise<StoryDetail> {
        const payload = splitStoryCommandSchema.parse(input);
        return this.request(`/api/v1/stories/${encodeURIComponent(storyId)}/splits`, {
            method: "POST",
            body: payload,
            schema: storyDetailSchema,
        });
    }

    async migrateStoryUserState(
        sourceStoryId: string,
        input: MigrateStoryUserStateCommand,
    ): Promise<StoryUserStateMigrationResult> {
        const payload = migrateStoryUserStateCommandSchema.parse(input);
        return this.request(
            `/api/v1/stories/${encodeURIComponent(sourceStoryId)}/user-state-migrations`,
            {
                method: "POST",
                body: payload,
                schema: storyUserStateMigrationResultSchema,
            },
        );
    }

    async listStorySubtypes(query: { kind?: StorySubtype["kind"] } = {}): Promise<readonly StorySubtype[]> {
        const params = new URLSearchParams();
        if (query.kind) {
            params.set("kind", query.kind);
        }
        const page = await this.request(`/api/v1/story-subtypes?${params.toString()}`, {
            schema: storySubtypePageSchema,
        });
        return page.items;
    }

    async listTopics(query: { cursor?: string; limit?: number } = {}): Promise<TopicPage> {
        const params = new URLSearchParams();
        if (query.cursor) {
            params.set("cursor", query.cursor);
        }
        if (query.limit) {
            params.set("limit", String(query.limit));
        }
        return this.request(`/api/v1/topics?${params.toString()}`, {
            schema: topicPageSchema,
        });
    }

    async topic(topicId: string): Promise<TopicDetail> {
        return this.request(`/api/v1/topics/${encodeURIComponent(topicId)}`, {
            schema: topicDetailSchema,
        });
    }

    async createTopic(input: CreateTopicCommand): Promise<TopicDetail> {
        const payload = createTopicCommandSchema.parse(input);
        return this.request("/api/v1/topics", {
            method: "POST",
            body: payload,
            schema: topicDetailSchema,
        });
    }

    async updateTopic(topicId: string, input: UpdateTopicCommand): Promise<TopicDetail> {
        const payload = updateTopicCommandSchema.parse(input);
        return this.request(`/api/v1/topics/${encodeURIComponent(topicId)}/revisions`, {
            method: "POST",
            body: payload,
            schema: topicDetailSchema,
        });
    }

    async mergeTopics(input: MergeTopicsCommand): Promise<TopicDetail> {
        const payload = mergeTopicsCommandSchema.parse(input);
        return this.request("/api/v1/topics/merges", {
            method: "POST",
            body: payload,
            schema: topicDetailSchema,
        });
    }

    async addTopicMember(topicId: string, input: AddTopicMemberCommand): Promise<TopicDetail> {
        const payload = addTopicMemberCommandSchema.parse(input);
        return this.request(`/api/v1/topics/${encodeURIComponent(topicId)}/members`, {
            method: "POST",
            body: payload,
            schema: topicDetailSchema,
        });
    }

    async updateTopicMemberRole(
        topicId: string,
        input: UpdateTopicMemberRoleCommand,
    ): Promise<TopicDetail> {
        const payload = updateTopicMemberRoleCommandSchema.parse(input);
        return this.request(`/api/v1/topics/${encodeURIComponent(topicId)}/member-role-updates`, {
            method: "POST",
            body: payload,
            schema: topicDetailSchema,
        });
    }

    async removeTopicMember(topicId: string, input: RemoveTopicMemberCommand): Promise<TopicDetail> {
        const payload = removeTopicMemberCommandSchema.parse(input);
        return this.request(`/api/v1/topics/${encodeURIComponent(topicId)}/member-removals`, {
            method: "POST",
            body: payload,
            schema: topicDetailSchema,
        });
    }

    async restoreTopicMember(
        topicId: string,
        input: RestoreTopicMemberCommand,
    ): Promise<TopicDetail> {
        const payload = restoreTopicMemberCommandSchema.parse(input);
        return this.request(`/api/v1/topics/${encodeURIComponent(topicId)}/member-restorations`, {
            method: "POST",
            body: payload,
            schema: topicDetailSchema,
        });
    }

    async listEntities(query: { cursor?: string; limit?: number } = {}): Promise<EntityPage> {
        const params = new URLSearchParams();
        if (query.cursor) {
            params.set("cursor", query.cursor);
        }
        if (query.limit) {
            params.set("limit", String(query.limit));
        }
        return this.request(`/api/v1/entities?${params.toString()}`, {
            schema: entityPageSchema,
        });
    }

    async entity(entityId: string): Promise<EntityDetail> {
        return this.request(`/api/v1/entities/${encodeURIComponent(entityId)}`, {
            schema: entityDetailSchema,
        });
    }

    async createEntity(input: CreateEntityCommand): Promise<EntityDetail> {
        const payload = createEntityCommandSchema.parse(input);
        return this.request("/api/v1/entities", {
            method: "POST",
            body: payload,
            schema: entityDetailSchema,
        });
    }

    async updateEntity(entityId: string, input: UpdateEntityCommand): Promise<EntityDetail> {
        const payload = updateEntityCommandSchema.parse(input);
        return this.request(`/api/v1/entities/${encodeURIComponent(entityId)}/revisions`, {
            method: "POST",
            body: payload,
            schema: entityDetailSchema,
        });
    }

    async addEntityAlias(entityId: string, input: AddEntityAliasCommand): Promise<EntityDetail> {
        const payload = addEntityAliasCommandSchema.parse(input);
        return this.request(`/api/v1/entities/${encodeURIComponent(entityId)}/aliases`, {
            method: "POST",
            body: payload,
            schema: entityDetailSchema,
        });
    }

    async removeEntityAlias(entityId: string, input: RemoveEntityAliasCommand): Promise<EntityDetail> {
        const payload = removeEntityAliasCommandSchema.parse(input);
        return this.request(`/api/v1/entities/${encodeURIComponent(entityId)}/alias-removals`, {
            method: "POST",
            body: payload,
            schema: entityDetailSchema,
        });
    }

    async linkStoryEntity(input: LinkStoryEntityCommand): Promise<EntityDetail> {
        const payload = linkStoryEntityCommandSchema.parse(input);
        return this.request("/api/v1/story-entity-links", {
            method: "POST",
            body: payload,
            schema: entityDetailSchema,
        });
    }

    async unlinkStoryEntity(input: UnlinkStoryEntityCommand): Promise<EntityDetail> {
        const payload = unlinkStoryEntityCommandSchema.parse(input);
        return this.request("/api/v1/story-entity-links/removals", {
            method: "POST",
            body: payload,
            schema: entityDetailSchema,
        });
    }

    async linkEntryStory(input: LinkEntryStoryCommand): Promise<StoryDetail> {
        const payload = linkEntryStoryCommandSchema.parse(input);
        return this.request("/api/v1/entry-story-links", {
            method: "POST",
            body: payload,
            schema: storyDetailSchema,
        });
    }

    async unlinkEntryStory(input: UnlinkEntryStoryCommand): Promise<StoryDetail> {
        const payload = unlinkEntryStoryCommandSchema.parse(input);
        return this.request("/api/v1/entry-story-links/removals", {
            method: "POST",
            body: payload,
            schema: storyDetailSchema,
        });
    }

    async linkEntryRelation(input: LinkEntryRelationCommand): Promise<EntryDetail> {
        const payload = linkEntryRelationCommandSchema.parse(input);
        return this.request("/api/v1/entry-relations", {
            method: "POST",
            body: payload,
            schema: entryDetailSchema,
        });
    }

    async unlinkEntryRelation(input: UnlinkEntryRelationCommand): Promise<EntryDetail> {
        const payload = unlinkEntryRelationCommandSchema.parse(input);
        return this.request("/api/v1/entry-relations/removals", {
            method: "POST",
            body: payload,
            schema: entryDetailSchema,
        });
    }

    async createEntityRelation(input: CreateEntityRelationCommand): Promise<EntityDetail> {
        const payload = createEntityRelationCommandSchema.parse(input);
        return this.request("/api/v1/entity-relations", {
            method: "POST",
            body: payload,
            schema: entityDetailSchema,
        });
    }

    async removeEntityRelation(input: RemoveEntityRelationCommand): Promise<EntityDetail> {
        const payload = removeEntityRelationCommandSchema.parse(input);
        return this.request("/api/v1/entity-relations/removals", {
            method: "POST",
            body: payload,
            schema: entityDetailSchema,
        });
    }

    async entries(query: EntryListQuery = {}): Promise<EntryPage> {
        const params = new URLSearchParams();
        if (query.sourceId) {
            params.set("sourceId", query.sourceId);
        }
        if (query.cursor) {
            params.set("cursor", query.cursor);
        }
        if (query.limit) {
            params.set("limit", String(query.limit));
        }
        return this.request(`/api/v1/entries?${params.toString()}`, {
            schema: entryPageSchema,
        });
    }

    async entry(entryId: string): Promise<EntryDetail> {
        return this.request(`/api/v1/entries/${encodeURIComponent(entryId)}`, {
            schema: entryDetailSchema,
        });
    }

    async selectRevisionContent(revisionId: string, command: {
        expectedCurrentId: string | null; expectedLocked: boolean;
        operation: "lock" | "unlock" | "rollback"; representationId?: string;
    }) {
        return this.request(`/api/v1/revisions/${encodeURIComponent(revisionId)}/content/selection`, {
            method: "POST", body: contentSelectionCommandSchema.parse(command), schema: contentSelectionResultSchema,
        });
    }

    async revision(revisionId: string): Promise<RevisionDetail> {
        return this.request(`/api/v1/revisions/${encodeURIComponent(revisionId)}`, {
            schema: revisionDetailSchema,
        });
    }
}
