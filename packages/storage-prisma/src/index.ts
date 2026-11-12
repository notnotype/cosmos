import { PrismaCosmosRepositoryConnectorStateExport } from "./repository/connector-state-export.js";
import type { CosmosRepository } from "@cosmos/application";

export class PrismaCosmosRepository extends PrismaCosmosRepositoryConnectorStateExport implements CosmosRepository {}

export { PrismaContentRebuildRepository } from "./repository/content-rebuild.js";
export { PrismaContentQueryRepository } from "./repository/content-query.js";
export { PrismaContentSelectionRepository } from "./repository/content-commands.js";
export { PrismaStoryAgentCandidateRepository } from "./repository/story-agent-candidates.js";
export { PrismaStoryAgentFailureCodeReader } from "./story-agent-failure-code.js";
export { PrismaWorkflowBackend } from "./workflow-backend.js";
export { PrismaWorkflowHostStore } from "./workflow-host-store.js";
export { PrismaWorkflowEventSink } from "./workflow-event-sink.js";
export { FileSecretStore } from "./secret-store.js";
export { PrismaConnectorStateStore } from "./connector-state-store.js";
export { PrismaProviderCredentialRepository } from "./model-provider-credential-repository.js";
export { PrismaModelProviderQueryRepository } from "./model-provider-query-repository.js";
export { PrismaConfiguredModelRepository } from "./configured-model-repository.js";
export { PrismaProviderDiscoveryReader } from "./provider-discovery-reader.js";
export { PrismaModelProviderRemovalRepository } from "./model-provider-removal-repository.js";
export { PrismaAgentModelResolver } from "./agent-model-resolver.js";
export { withModelConfigurationLock } from "./model-configuration-lock.js";
export type { SystemConfigRepository, SystemConfigSnapshot } from "./system-config.js";
export { PrismaSystemConfigRepository } from "./system-config.js";

export { type StorageRoots, resolveStorageRoots, createPrismaClient, resolveContainedPath } from "./storage-root.js";
