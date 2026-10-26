import { randomUUID } from "node:crypto";
import {
    BadRequestException,
    ConflictException,
    Bind,
    Get,
    NotFoundException,
    Param,
    Post,
    Query,
    Body,
    StreamableFile,
    HttpCode,
    Headers,
} from "@nestjs/common";
import {
    entryListQuerySchema,
    structuredContentViewSchema,
    contentSelectionCommandSchema,
    contentSelectionResultSchema,
    contentRebuildCommandSchema,
    contentRebuildResultSchema,
    storyAgentCandidateRecordSchema,
    storyAgentCandidateDecisionSchema,
    storyAgentGenerationRequestSchema,
    storyAgentGenerationSchema,
    searchQuerySchema,
    mergeStoriesCommandSchema,
    migrateStoryUserStateCommandSchema,
    moveEntryToStoryCommandSchema,
    splitStoryCommandSchema,
    storySubtypeQuerySchema,
    addTopicMemberCommandSchema,
    createTopicCommandSchema,
    mergeTopicsCommandSchema,
    removeTopicMemberCommandSchema,
    restoreTopicMemberCommandSchema,
    updateTopicCommandSchema,
    updateTopicMemberRoleCommandSchema,
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
    updateStoryRevisionCommandSchema,
} from "@cosmos/contracts";
import { ContentCommandError, StoryAgentCandidateError, WorkflowHostError } from "@cosmos/application";
import { ZodError } from "zod";
import "reflect-metadata";
import { AppControllerRuns } from "./runs.js";
import { validationError, sourceCommandError, clampLimit, catalogPage } from "./internals.js";
import {
    toPublicEntryDetail,
    toPublicPage,
    toPublicRevisionDetail,
    toPublicStoryDetail,
} from "./public-projection.js";

function storyGenerationError(error: unknown): never {
    if (error instanceof ZodError) throw new BadRequestException({ code: "validation_failed", message: "Invalid Story generation input.", retryable: false });
    if (!(error instanceof WorkflowHostError)) throw error;
    const response = { code: error.code, message: error.message, retryable: false };
    if (error.code === "not_found") throw new NotFoundException(response);
    if (error.code === "invalid_state") throw new BadRequestException(response);
    throw new ConflictException(response);
}

export class AppControllerContent extends AppControllerRuns {
    @Get("revisions/:revisionId/content")
    @Bind(Param("revisionId"), Query())
    async revisionContent(revisionId: string, query: Record<string, unknown> = {}) {
        const version = query.representationVersion;
        if (Object.keys(query).some((key) => key !== "representationVersion") ||
            (version !== undefined && (typeof version !== "string" || !/^[1-9]\d*$/.test(version) || !Number.isSafeInteger(Number(version))))) {
            throw new BadRequestException({ code: "validation_failed", message: "Expected a positive representationVersion only.", retryable: false });
        }
        if (!this.contentQuery) {
            throw new ConflictException({ code: "conflict", message: "Content reading is not enabled.", retryable: false });
        }
        const result = await this.contentQuery.structuredContent({
            entryRevisionId: revisionId,
            ...(version === undefined ? {} : { representationVersion: Number(version) }),
        }, { allowedProfiles: ["structured-content"] });
        if (!result) {
            throw new NotFoundException({ code: "not_found", message: `Revision not found: ${revisionId}`, retryable: false });
        }
        return structuredContentViewSchema.parse(result);
    }

    @Post("revisions/:revisionId/content/rebuild")
    @Bind(Param("revisionId"), Body())
    async rebuildRevisionContent(revisionId: string, body: unknown) {
        if (!contentRebuildCommandSchema.safeParse(body).success) {
            throw new BadRequestException({ code: "validation_failed", message: "Invalid content rebuild command.", retryable: false });
        }
        if (!this.contentRebuild) throw new ConflictException({ code: "conflict", message: "Content rebuild is not enabled.", retryable: false });
        try {
            return contentRebuildResultSchema.parse(await this.contentRebuild.rebuild(revisionId, { actorId: "user", canManageRepresentations: true }));
        } catch (error) {
            if (!(error instanceof ContentCommandError)) throw error;
            const response = { code: error.code, message: error.message, retryable: false };
            if (error.code === "not_found") throw new NotFoundException(response);
            if (error.code === "invalid_command") throw new BadRequestException(response);
            throw new ConflictException(response);
        }
    }

    @Post("revisions/:revisionId/content/selection")
    @Bind(Param("revisionId"), Body())
    async selectRevisionContent(revisionId: string, body: unknown) {
        const parsed = contentSelectionCommandSchema.safeParse(body);
        if (!parsed.success) throw new BadRequestException({ code: "validation_failed", message: "Invalid content selection command.", retryable: false });
        if (!this.contentCommands) throw new ConflictException({ code: "conflict", message: "Content management is not enabled.", retryable: false });
        try {
            return contentSelectionResultSchema.parse(await this.contentCommands.select({
                ...parsed.data, entryRevisionId: revisionId,
            }, { actorId: "user", canManageRepresentations: true }));
        } catch (error) {
            if (!(error instanceof ContentCommandError)) throw error;
            const response = { code: error.code, message: error.message, retryable: false };
            if (error.code === "not_found") throw new NotFoundException(response);
            if (error.code === "invalid_command") throw new BadRequestException(response);
            throw new ConflictException(response);
        }
    }

    @Post("stories/:storyId/agent-candidates")
    @HttpCode(202)
    @Bind(Param("storyId"), Body(), Headers("idempotency-key"))
    async proposeStoryAgentCandidate(storyId: string, body: unknown, idempotencyKey?: string) {
        const parsed = storyAgentGenerationRequestSchema.safeParse(body);
        if (!parsed.success || !idempotencyKey?.trim() || idempotencyKey.length > 200) throw new BadRequestException({ code: "validation_failed", message: "A valid generation request and Idempotency-Key are required.", retryable: false });
        if (!this.storyAgentControl) throw new ConflictException({ code: "conflict", message: "Story Agent generation is not configured.", retryable: false });
        try {
            return storyAgentGenerationSchema.parse(await this.storyAgentControl.enqueue({ storyId, ...parsed.data, idempotencyKey }));
        } catch (error) { storyGenerationError(error); }
    }

    @Get("stories/:storyId/agent-generations/:runId")
    @Bind(Param("storyId"), Param("runId"))
    async storyAgentGeneration(storyId: string, runId: string) {
        if (!this.storyAgentControl) throw new ConflictException({ code: "conflict", message: "Story Agent generation is not configured.", retryable: false });
        try { return storyAgentGenerationSchema.parse(await this.storyAgentControl.read(storyId, runId)); }
        catch (error) { storyGenerationError(error); }
    }

    @Get("stories/:storyId/agent-candidates")
    @Bind(Param("storyId"))
    async listStoryAgentCandidates(storyId: string) {
        if (!this.storyAgentCandidates) throw new ConflictException({ code: "conflict", message: "Story candidates are not enabled.", retryable: false });
        return storyAgentCandidateRecordSchema.array().parse(await this.storyAgentCandidates.list(storyId, { allowedProfiles: ["summary-only"] }));
    }

    @Post("story-agent-candidates/:candidateId/decision")
    @Bind(Param("candidateId"), Body())
    async decideStoryAgentCandidate(candidateId: string, body: unknown) {
        const parsed = storyAgentCandidateDecisionSchema.safeParse(body);
        if (!parsed.success) throw new BadRequestException({ code: "validation_failed", message: "Invalid Story candidate decision.", retryable: false });
        if (!this.storyAgentCandidates) throw new ConflictException({ code: "conflict", message: "Story candidates are not enabled.", retryable: false });
        try {
            return storyAgentCandidateRecordSchema.parse(await this.storyAgentCandidates.decide(candidateId, parsed.data.decision, { actorId: "user", canManageCandidates: true }));
        } catch (error) {
            if (!(error instanceof StoryAgentCandidateError)) throw error;
            const response = { code: error.code, message: error.message, retryable: false };
            if (error.code === "not_found") throw new NotFoundException(response);
            throw new ConflictException(response);
        }
    }

    @Get("feed")
    @Bind(Query("cursor"), Query("limit"))
    async feed(cursor?: string, limit?: string) {
        return toPublicPage(await this.repository.feed({
            cursor,
            limit: clampLimit(limit),
        }));
    }

    @Get("search")
    @Bind(Query())
    async search(query: Record<string, unknown>) {
        try {
            return toPublicPage(await this.repository.search(searchQuerySchema.parse(query)));
        } catch (error) {
            validationError(error);
        }
    }

    @Get("entries")
    @Bind(Query())
    async entries(query: Record<string, unknown>) {
        try {
            const parsed = entryListQuerySchema.parse(query);
            return toPublicPage(await this.repository.entries({
                sourceId: parsed.sourceId,
                cursor: parsed.cursor,
                limit: parsed.limit,
            }));
        } catch (error) {
            validationError(error);
        }
    }

    @Get("stories/:storyId")
    @Bind(Param("storyId"))
    async story(storyId: string) {
        const result = await this.repository.story(storyId);
        if (!result) {
            throw new NotFoundException({
                code: "not_found",
                message: `Story not found: ${storyId}`,
                retryable: false,
            });
        }
        return toPublicStoryDetail(result);
    }

    @Post("stories/:storyId/entry-moves")
    @Bind(Param("storyId"), Body())
    async moveEntryToStory(storyId: string, body: unknown) {
        try {
            const parsed = moveEntryToStoryCommandSchema.parse(body);
            const result = await this.repository.moveEntryToStory({
                entryId: parsed.entryId,
                storyId,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
            if (!result) {
                throw new NotFoundException({
                    code: "not_found",
                    message: `Entry not found: ${parsed.entryId}`,
                    retryable: false,
                });
            }
            return result;
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("stories/:storyId/revisions")
    @Bind(Param("storyId"), Body())
    async updateStoryRevision(storyId: string, body: unknown) {
        try {
            const parsed = updateStoryRevisionCommandSchema.parse(body);
            const result = await this.repository.updateStoryRevision({
                storyId,
                baseRevisionId: parsed.baseRevisionId,
                title: parsed.title,
                summary: parsed.summary ?? null,
                kind: parsed.kind,
                subtype: parsed.subtype ?? null,
                timeRange: parsed.timeRange ?? null,
                keyFacts: parsed.keyFacts ?? [],
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
            return result;
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("stories/merges")
    @Bind(Body())
    async mergeStories(body: unknown) {
        try {
            const parsed = mergeStoriesCommandSchema.parse(body);
            const result = await this.repository.mergeStories({
                canonicalStoryId: parsed.canonicalStoryId,
                obsoleteStoryIds: parsed.obsoleteStoryIds,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
            return result;
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("stories/:storyId/splits")
    @Bind(Param("storyId"), Body())
    async splitStory(storyId: string, body: unknown) {
        try {
            const parsed = splitStoryCommandSchema.parse(body);
            const result = await this.repository.splitStory({
                storyId,
                successors: parsed.successors.map((successor) => ({
                    title: successor.title,
                    summary: successor.summary ?? null,
                    kind: successor.kind,
                    subtype: successor.subtype ?? null,
                    timeRange: successor.timeRange ?? null,
                    keyFacts: successor.keyFacts ?? [],
                    entryIds: successor.entryIds,
                    evidenceEntryIds: successor.evidenceEntryIds,
                    entityIds: successor.entityIds,
                    topicIds: successor.topicIds,
                })),
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
            return result;
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("stories/:storyId/user-state-migrations")
    @Bind(Param("storyId"), Body())
    async migrateStoryUserState(storyId: string, body: unknown) {
        try {
            const parsed = migrateStoryUserStateCommandSchema.parse(body);
            return await this.repository.migrateStoryUserState({
                sourceStoryId: storyId,
                targetStoryId: parsed.targetStoryId,
                favorite: parsed.favorite,
                labelIds: parsed.labelIds,
                collectionIds: parsed.collectionIds,
                annotationIds: parsed.annotationIds,
                spotlightPlacementIds: parsed.spotlightPlacementIds,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
                basis: parsed.basis ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Get("story-subtypes")
    @Bind(Query("kind"))
    async listStorySubtypes(kind?: string) {
        try {
            const parsed = storySubtypeQuerySchema.parse({ kind });
            const items = await this.repository.listStorySubtypes({ kind: parsed.kind });
            return catalogPage(items);
        } catch (error) {
            validationError(error);
        }
    }

    @Get("topics")
    @Bind(Query("cursor"), Query("limit"))
    async listTopics(cursor?: string, limit?: string) {
        return this.repository.listTopics({
            cursor,
            limit: clampLimit(limit),
        });
    }

    @Get("topics/:topicId")
    @Bind(Param("topicId"))
    async topic(topicId: string) {
        const result = await this.repository.topic(topicId);
        if (!result) {
            throw new NotFoundException({
                code: "not_found",
                message: `Topic not found: ${topicId}`,
                retryable: false,
            });
        }
        return result;
    }

    @Post("topics")
    @Bind(Body())
    async createTopic(body: unknown) {
        try {
            const parsed = createTopicCommandSchema.parse(body);
            return await this.repository.createTopic({
                title: parsed.title,
                purpose: parsed.purpose,
                scope: parsed.scope ?? null,
                seedStoryId: parsed.seedStoryId ?? null,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("topics/:topicId/revisions")
    @Bind(Param("topicId"), Body())
    async updateTopic(topicId: string, body: unknown) {
        try {
            const parsed = updateTopicCommandSchema.parse(body);
            return await this.repository.updateTopic({
                topicId,
                baseRevisionId: parsed.baseRevisionId,
                title: parsed.title,
                purpose: parsed.purpose,
                scope: parsed.scope ?? null,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("topics/merges")
    @Bind(Body())
    async mergeTopics(body: unknown) {
        try {
            const parsed = mergeTopicsCommandSchema.parse(body);
            return await this.repository.mergeTopics({
                canonicalTopicId: parsed.canonicalTopicId,
                obsoleteTopicIds: parsed.obsoleteTopicIds,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("topics/:topicId/members")
    @Bind(Param("topicId"), Body())
    async addTopicMember(topicId: string, body: unknown) {
        try {
            const parsed = addTopicMemberCommandSchema.parse(body);
            return await this.repository.addTopicMember({
                topicId,
                storyId: parsed.storyId,
                role: parsed.role,
                reason: parsed.reason ?? null,
                actor: parsed.actor ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("topics/:topicId/member-role-updates")
    @Bind(Param("topicId"), Body())
    async updateTopicMemberRole(topicId: string, body: unknown) {
        try {
            const parsed = updateTopicMemberRoleCommandSchema.parse(body);
            return await this.repository.updateTopicMemberRole({
                topicId,
                storyId: parsed.storyId,
                role: parsed.role,
                reason: parsed.reason ?? null,
                actor: parsed.actor ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("topics/:topicId/member-removals")
    @Bind(Param("topicId"), Body())
    async removeTopicMember(topicId: string, body: unknown) {
        try {
            const parsed = removeTopicMemberCommandSchema.parse(body);
            return await this.repository.removeTopicMember({
                topicId,
                storyId: parsed.storyId,
                reason: parsed.reason ?? null,
                actor: parsed.actor ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("topics/:topicId/member-restorations")
    @Bind(Param("topicId"), Body())
    async restoreTopicMember(topicId: string, body: unknown) {
        try {
            const parsed = restoreTopicMemberCommandSchema.parse(body);
            return await this.repository.restoreTopicMember({
                topicId,
                storyId: parsed.storyId,
                role: parsed.role,
                reason: parsed.reason ?? null,
                actor: parsed.actor ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Get("entities")
    @Bind(Query("cursor"), Query("limit"))
    async listEntities(cursor?: string, limit?: string) {
        return this.repository.listEntities({
            cursor,
            limit: clampLimit(limit),
        });
    }

    @Get("entities/:entityId")
    @Bind(Param("entityId"))
    async entity(entityId: string) {
        const result = await this.repository.entity(entityId);
        if (!result) {
            throw new NotFoundException({
                code: "not_found",
                message: `Entity not found: ${entityId}`,
                retryable: false,
            });
        }
        return result;
    }

    @Post("entities")
    @Bind(Body())
    async createEntity(body: unknown) {
        try {
            const parsed = createEntityCommandSchema.parse(body);
            return await this.repository.createEntity({
                name: parsed.name,
                type: parsed.type,
                alias: parsed.alias ?? null,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("entities/:entityId/revisions")
    @Bind(Param("entityId"), Body())
    async updateEntity(entityId: string, body: unknown) {
        try {
            const parsed = updateEntityCommandSchema.parse(body);
            return await this.repository.updateEntity({
                entityId,
                baseRevisionId: parsed.baseRevisionId,
                name: parsed.name,
                type: parsed.type,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("entities/:entityId/aliases")
    @Bind(Param("entityId"), Body())
    async addEntityAlias(entityId: string, body: unknown) {
        try {
            const parsed = addEntityAliasCommandSchema.parse(body);
            return await this.repository.addEntityAlias({
                entityId,
                name: parsed.name,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("entities/:entityId/alias-removals")
    @Bind(Param("entityId"), Body())
    async removeEntityAlias(entityId: string, body: unknown) {
        try {
            const parsed = removeEntityAliasCommandSchema.parse(body);
            return await this.repository.removeEntityAlias({
                entityId,
                name: parsed.name,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("story-entity-links")
    @Bind(Body())
    async linkStoryEntity(body: unknown) {
        try {
            const parsed = linkStoryEntityCommandSchema.parse(body);
            return await this.repository.linkStoryEntity({
                storyId: parsed.storyId,
                entityId: parsed.entityId,
                producer: parsed.producer ?? null,
                producerVersion: parsed.producerVersion ?? null,
                confidence: parsed.confidence ?? null,
                evidence: parsed.evidence ?? null,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("story-entity-links/removals")
    @Bind(Body())
    async unlinkStoryEntity(body: unknown) {
        try {
            const parsed = unlinkStoryEntityCommandSchema.parse(body);
            return await this.repository.unlinkStoryEntity({
                storyId: parsed.storyId,
                entityId: parsed.entityId,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("entry-story-links")
    @Bind(Body())
    async linkEntryStory(body: unknown) {
        try {
            const parsed = linkEntryStoryCommandSchema.parse(body);
            return await this.repository.linkEntryStory({
                entryId: parsed.entryId,
                storyId: parsed.storyId,
                relationType: parsed.relationType,
                producer: parsed.producer ?? null,
                producerVersion: parsed.producerVersion ?? null,
                confidence: parsed.confidence ?? null,
                evidence: parsed.evidence ?? null,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("entry-story-links/removals")
    @Bind(Body())
    async unlinkEntryStory(body: unknown) {
        try {
            const parsed = unlinkEntryStoryCommandSchema.parse(body);
            return await this.repository.unlinkEntryStory({
                entryId: parsed.entryId,
                storyId: parsed.storyId,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("entry-relations")
    @Bind(Body())
    async linkEntryRelation(body: unknown) {
        try {
            const parsed = linkEntryRelationCommandSchema.parse(body);
            return await this.repository.linkEntryRelation({
                fromEntryId: parsed.fromEntryId,
                toEntryId: parsed.toEntryId,
                relationType: parsed.relationType,
                producer: parsed.producer ?? null,
                producerVersion: parsed.producerVersion ?? null,
                confidence: parsed.confidence ?? null,
                evidence: parsed.evidence ?? null,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("entry-relations/removals")
    @Bind(Body())
    async unlinkEntryRelation(body: unknown) {
        try {
            const parsed = unlinkEntryRelationCommandSchema.parse(body);
            return await this.repository.unlinkEntryRelation({
                fromEntryId: parsed.fromEntryId,
                toEntryId: parsed.toEntryId,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("entity-relations")
    @Bind(Body())
    async createEntityRelation(body: unknown) {
        try {
            const parsed = createEntityRelationCommandSchema.parse(body);
            return await this.repository.createEntityRelation({
                fromEntityId: parsed.fromEntityId,
                toEntityId: parsed.toEntityId,
                relationType: parsed.relationType,
                producer: parsed.producer ?? null,
                producerVersion: parsed.producerVersion ?? null,
                confidence: parsed.confidence ?? null,
                evidence: parsed.evidence ?? null,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Post("entity-relations/removals")
    @Bind(Body())
    async removeEntityRelation(body: unknown) {
        try {
            const parsed = removeEntityRelationCommandSchema.parse(body);
            return await this.repository.removeEntityRelation({
                fromEntityId: parsed.fromEntityId,
                toEntityId: parsed.toEntityId,
                relationType: parsed.relationType,
                actor: parsed.actor ?? null,
                reason: parsed.reason ?? null,
            });
        } catch (error) {
            sourceCommandError(error);
        }
    }

    @Get("entries/:entryId")
    @Bind(Param("entryId"))
    async entry(entryId: string) {
        const result = await this.repository.entry(entryId);
        if (!result) {
            throw new NotFoundException({
                code: "not_found",
                message: `Entry not found: ${entryId}`,
                retryable: false,
            });
        }
        return toPublicEntryDetail(result);
    }

    @Get("revisions/:revisionId")
    @Bind(Param("revisionId"))
    async revision(revisionId: string) {
        const result = await this.repository.revision(revisionId);
        if (!result) {
            throw new NotFoundException({
                code: "not_found",
                message: `Revision not found: ${revisionId}`,
                retryable: false,
            });
        }
        return toPublicRevisionDetail(result);
    }

    @Get("assets/:assetId")
    @Bind(Param("assetId"))
    async asset(assetId: string) {
        const asset = await this.repository.readAsset(assetId);
        if (!asset) {
            throw new NotFoundException({
                code: "not_found",
                message: `Asset not found: ${assetId}`,
                retryable: false,
            });
        }
        return new StreamableFile(Buffer.from(asset.content), {
            type: asset.mimeType,
        });
    }
}
