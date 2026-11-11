import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ContentRebuild, ContentCommands, ContentQuery, StoryAgentWorkflowControl, StoryAgentCandidates, ConfiguredModels, SystemConfigService, ModelProviderCredentials, ModelProviderQuery, ModelProviderRemovals, ProviderModelDiscoveryRunner, createHttpsProviderModelDirectory } from "@cosmos/application";
import { createBuiltinManifestCatalog } from "@cosmos/application/catalog";
import { MediaCleanupWorkflowControlService } from "@cosmos/application/media-cleanup";
import { IngestWorkflowControlService } from "@cosmos/application/workflow-control";
import { createLogger } from "@cosmos/logging";
import {
    PrismaCosmosRepository,
    PrismaContentQueryRepository,
    PrismaContentRebuildRepository,
    PrismaContentSelectionRepository,
    PrismaStoryAgentCandidateRepository,
    PrismaWorkflowHostStore,
    PrismaProviderCredentialRepository,
    PrismaModelProviderQueryRepository,
    PrismaModelProviderRemovalRepository,
    PrismaConfiguredModelRepository,
    PrismaSystemConfigRepository,
    PrismaProviderDiscoveryReader,
    withModelConfigurationLock,
} from "@cosmos/storage-prisma";

import { AppController } from "./app.controller.js";
import { HookController } from "./hook.controller.js";
import { SourceProbeService } from "./source-probe.service.js";
import { ModelConfigurationModule } from "./model-configuration.module.js";
import { resolveModelConfigurationTrust } from "./model-configuration-trust.js";
import { SystemConfigController } from "./system-config.controller.js";

export const cosmosLogger = createLogger({
    service: "cosmos-api",
    fileName: "api",
});
export const cosmosCatalog = createBuiltinManifestCatalog();
export const cosmosRepository = new PrismaCosmosRepository({
    logger: cosmosLogger,
    catalog: cosmosCatalog,
});
export const cosmosWorkflowStore = new PrismaWorkflowHostStore(cosmosRepository.prisma, {
    logger: cosmosLogger,
});
export const cosmosIngestControl = new IngestWorkflowControlService({
    store: cosmosWorkflowStore,
    getSourceExecutionSnapshot: async (sourceId) => {
        const source = await cosmosRepository.getSource(sourceId);
        return source ?? null;
    },
    getCheckpointSnapshot: (planId) => cosmosRepository.getCheckpointSnapshot(planId),
});
export const cosmosContentRebuild = new ContentRebuild(new PrismaContentRebuildRepository(cosmosRepository.prisma, cosmosRepository.blobs));
export const cosmosContentQuery = new ContentQuery(new PrismaContentQueryRepository(cosmosRepository.prisma));
export const cosmosContentCommands = new ContentCommands(new PrismaContentSelectionRepository(cosmosRepository.prisma));
export const cosmosSystemConfig = new SystemConfigService(new PrismaSystemConfigRepository(cosmosRepository.prisma));
export const cosmosStoryAgentCandidates = new StoryAgentCandidates(new PrismaStoryAgentCandidateRepository(cosmosRepository.prisma));
export const cosmosStoryAgentControl = new StoryAgentWorkflowControl({
    store: cosmosWorkflowStore, content: cosmosContentQuery,
    candidates: new PrismaStoryAgentCandidateRepository(cosmosRepository.prisma),
    stories: { readStory: async (storyId) => {
        const detail = await cosmosRepository.story(storyId);
        if (!detail) return null;
        const entries = [...detail.entries, ...(detail.entry ? [detail.entry] : [])];
        return { storyId: detail.story.id, storyRevisionId: detail.story.revisionId,
            title: detail.story.title, summary: detail.story.summary ?? "",
            entryRevisionIds: [...new Set(entries.flatMap((entry) => entry.revisions.map((revision) => revision.id)))] };
    } },
});
export const cosmosMediaCleanupControl = new MediaCleanupWorkflowControlService({
    store: cosmosWorkflowStore,
});

@Module({
    imports: [ModelConfigurationModule.register({
        trust: resolveModelConfigurationTrust({
            COSMOS_ALLOWED_ORIGIN: process.env.COSMOS_ALLOWED_ORIGIN,
            COSMOS_MODEL_CONFIGURATION_AUTHORITIES: process.env.COSMOS_MODEL_CONFIGURATION_AUTHORITIES,
        }),
        query: new ModelProviderQuery(new PrismaModelProviderQueryRepository(cosmosRepository.prisma)),
         models: new ConfiguredModels(new PrismaConfiguredModelRepository(cosmosRepository.prisma)),
        removals: new ModelProviderRemovals({
            repository: new PrismaModelProviderRemovalRepository(cosmosRepository.prisma),
            secrets: cosmosRepository.secrets,
            // 行已删除即视为删除成功；残留密钥文件只记 warn，重试删除是幂等的。
            onCleanupFailure: ({ secretRef, error }) => cosmosLogger.warn("model_provider.secret.delete_failed", {
                secretRef,
                message: error instanceof Error ? error.message : String(error),
            }),
        }),
        credentials: new ModelProviderCredentials({
            repository: new PrismaProviderCredentialRepository(cosmosRepository.prisma),
            secrets: cosmosRepository.secrets,
            lock: (id, use) => withModelConfigurationLock(cosmosRepository.roots.dataRoot, id, use),
            operationId: randomUUID,
        }),
        discovery: new ProviderModelDiscoveryRunner({
            reader: new PrismaProviderDiscoveryReader(cosmosRepository.prisma),
            secrets: cosmosRepository.secrets,
            directory: createHttpsProviderModelDirectory(),
            ids: { nextId: (prefix) => `${prefix}-${randomUUID()}` },
            clock: { now: () => new Date() },
        }),
    })],
    controllers: [AppController, HookController, SystemConfigController],
    providers: [
        {
            provide: "COSMOS_SYSTEM_CONFIG",
            useValue: cosmosSystemConfig,
        },
        {
            provide: "COSMOS_PRODUCT_PORT",
            useValue: cosmosRepository,
        },
        {
            provide: "COSMOS_LOGGER",
            useValue: cosmosLogger,
        },
        {
            provide: "COSMOS_CATALOG",
            useValue: cosmosCatalog,
        },
        {
            provide: "COSMOS_WORKFLOW_CONTROL",
            useValue: cosmosIngestControl,
        },
        {
            provide: "COSMOS_WORKFLOW_STORE",
            useValue: cosmosWorkflowStore,
        },
        {
            provide: "COSMOS_MEDIA_CLEANUP_CONTROL",
            useValue: cosmosMediaCleanupControl,
        },
        {
            provide: "COSMOS_CONTENT_QUERY",
            useValue: cosmosContentQuery,
        },
        {
            provide: "COSMOS_CONTENT_COMMANDS",
            useValue: cosmosContentCommands,
        },
        {
            provide: "COSMOS_STORY_AGENT_CANDIDATES",
            useValue: cosmosStoryAgentCandidates,
        },
        {
            provide: "COSMOS_CONTENT_REBUILD",
            useValue: cosmosContentRebuild,
        },
        {
            provide: "COSMOS_STORY_AGENT_WORKFLOW_CONTROL",
            useValue: cosmosStoryAgentControl,
        },
        SourceProbeService,
    ],
})
export class AppModule {}
