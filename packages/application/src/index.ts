/**
 * 包入口:只做导出与模块地图,不放实现。
 * 公共面由 `entry-surface.txt` 冻结、`entry-contract.test.ts` 看守;改导出前先看 `MODULE.md`。
 */

export { ModelProviderQuery, type ModelProviderQueryRepository, type ModelProviderOperationSnapshot } from "./model-provider-query.js";
export { ConfiguredModels, type ConfiguredModelRepository } from "./configured-models.js";
export { SystemConfigService, type SystemConfigReader, type SystemConfigRepository } from "./system-config.js";
export { ModelProviderRemovals, type ModelProviderRemovalRepository } from "./model-provider-removals.js";
export { ModelProviderCredentials } from "./model-provider-credentials.js";
export {
    ProviderDiscoveryConflictError, ProviderDiscoveryNotFoundError, ProviderModelDiscoveryUnavailableError,
    ProviderModelDiscoveryRunner,
    type ProviderDiscoveryIdGenerator, type ProviderDiscoveryClock, type ProviderDiscoveryReader,
    type ProviderDiscoveryTarget,
    type ProviderModelDiscoveryOptions,
} from "./provider-discovery.js";
export {
    ProviderModelDirectoryError,
    type ProviderModelDirectoryPort, type ProviderModelDirectoryRequest,
    type ProviderModelDirectoryResponse,
} from "./provider-model-directory.js";
export {
    createHttpsProviderModelDirectory, PROVIDER_DIRECTORY_MAX_BYTES, PROVIDER_DIRECTORY_TIMEOUT_MS,
    type HttpsProviderModelDirectoryOptions, type ProviderModelDirectoryEgress,
    type ProviderModelDirectoryEgressRequest, type ProviderModelDirectoryEgressResponse,
    type ProviderModelDirectoryHostResolver,
} from "./provider-model-directory-https.js";
export {
    parseProviderModelCatalog, providerModelCatalogLimits,
    type ProviderModelCatalogResult,
} from "./provider-model-catalog.js";
export {
    type ProviderCredentialFields, type ProviderCredentialState, type ProviderCredentialOperation,
    type ProviderCredentialReceipt, type ProviderCredentialRepository,
} from "./model-provider-credential-port.js";
export {
    createAgentInvocationAction, FakeAgentInvocationAdapter, getAgentInvocationDefinition,
    type AgentInvocationContext, type AgentInvocationPort, type FakeAgentInvocationResponse,
} from "./agent-invocation.js";
export {
    createAgentInvocationV2Action, getAgentInvocationV2Definition,
    type AgentInvocationV2Port, type AgentModelResolver, type AgentModelSnapshot,
} from "./agent-invocation-v2.js";
export {
    ActionExecutionError, ActionRegistry, type ActionExecutionContext,
    type HostActionExecutionFence, type HostActionExecutionContext, type ActionHandler,
    type HostActionHandler, type RegisteredAction,
} from "./action.js";
export {
    StaticCatalog, createBuiltinManifestCatalog, type ManifestHash, type JsonSchemaRef,
    type SourceOperationManifest, type SourceAuthManifest, type SourceDefinitionManifest,
    type WorkflowDefinitionManifest, type ActionDefinitionManifest, type CatalogPort,
} from "./catalog.js";
export {
    mediaDownloadCapability, mediaAcquisitionDefaults, mediaRetryDefaults,
    resolveMediaPolicy, parseAllowedHosts, type MediaAcquisitionLimits, type MediaPolicy,
} from "./media-policy.js";
export {
    type HostResolver, type MediaAcquirerOptions, type MediaAcquisitionContext,
    type MediaAcquirer, type MediaRetryCandidate, type MediaRetryOutcome,
    type MediaRetryContext, type MediaRetrier,
} from "./media-ports.js";
export {
    acquireItemsSkippingUnchanged, createMediaAcquirer,
} from "./media-acquirer.js";
export { isPublicAddress } from "./public-address.js";
export { bindContentBlocks, type ContentAssetBinding } from "./content-binding.js";
export { type ContentDraft } from "./content-normalizer.js";
export { ContentRebuild, type ContentRebuildRepository, type ContentRebuildState } from "./content-rebuild.js";
export { requireContentProfile, type ContentReadAuthority } from "./content-access-policy.js";
export { StoryAgentWorkflowControl } from "./story-agent-workflow-control.js";
export { createStoryAgentWorkflowDefinition, createStoryAgentSaveAction, type StoryAgentGeneratedCandidateStore } from "./story-agent-workflow.js";
export { StoryAgentService } from "./story-agent-service.js";
export {
    StoryAgent, type StoryAgentSnapshot, type StoryAgentSnapshotReader,
    type StoryAgentRequest, type StoryAgentHost,
} from "./story-agent.js";
export {
    StoryAgentCandidates, StoryAgentCandidateError, type StoryAgentCandidateStatus, type StoryAgentCandidateRecord,
    type StoryAgentCandidateRepository, type StoryAgentCandidateAuthority,
} from "./story-agent-candidates.js";
export {
    ContentCommands, ContentCommandError, type ContentSelectionCommand, type ContentSelectionState,
    type ContentSelectionRepository, type ContentCommandAuthority,
} from "./content-commands.js";
export {
    ContentQuery, type ContentReadTarget, type ContentReadSource,
    type ContentQueryRepository, type StructuredContentView,
} from "./content-query.js";
export {
    stageIngestBlobs, type IngestBlobReference, type IngestBlobWriter, type StagedIngestBlobs,
} from "./ingest-blob-staging.js";
export {
    shouldPromoteRepresentation, validateRepresentationRollback, type RepresentationSelection,
} from "./representation-policy.js";
export {
    WorkflowHostError, WorkflowHostConflictError, type WorkflowRunStatus,
    type WorkflowJobStatus, type WorkflowCompletionStatus, type WorkflowActivityJobKind,
    type WorkflowActionReference, type CreateWorkflowEnvelopeInput, type WorkflowEnvelope,
    type WorkflowRunLease, type WorkflowRunClaimPurpose, type ClaimWorkflowRunInput,
    type HeartbeatWorkflowRunInput, type ReleaseWorkflowRunInput,
    type WorkflowRunLeasePort, type WorkflowActivityJobPayload, type WorkflowActivityJob,
    type WorkflowActivityJobClaim, type WorkflowRuntimeAttempt, type ClaimActivityJobInput,
    type HeartbeatActivityJobInput, type ReleaseActivityJobInput, type ActivityJobLease,
    type ActivityJobTerminalResult, type ConsumeActivityDispatchInput,
    type ConsumeActivityDispatchResult, type CompleteActivityInput,
    type CompleteActivityResult, type WorkflowActivityJobPort, type WorkflowCompletion,
    type WorkflowCompletionClaim, type ClaimWorkflowCompletionInput,
    type HeartbeatWorkflowCompletionInput, type DeliverWorkflowCompletionInput,
    type RequeueWorkflowCompletionInput, type DeadLetterWorkflowCompletionInput,
    type WorkflowCompletionPort, type MarkResumeRequiredInput, type FailWorkflowRunInput,
    type CancelWorkflowRunInput, type RecoverWorkflowRunInput, type RecoveryRunsInput,
    type ListWorkflowRunsInput, type WorkflowHostStore, type WorkflowHostOptions,
    type WorkflowHostErrorCode,
} from "./workflow-host.js";
export {
    FixedRunIdGenerator, type WorkflowRunnerLike, type WorkflowRunnerFactory,
    type WorkflowRuntimeDependencies, type WorkflowLeaseRuntimeOptions,
    type WorkflowRunLaneOptions, type WorkflowActivityWorkerOptions,
    type WorkflowCompletionDispatcherOptions, type WorkflowRunLaneResult,
    type WorkflowActivityWorkerResult, type WorkflowCompletionDispatcherResult,
} from "./workflow-host-runtime-types.js";
export { WorkflowRunLane } from "./workflow-run-lane.js";
export { WorkflowActivityWorker } from "./workflow-activity-worker.js";
export { WorkflowCompletionDispatcher } from "./workflow-completion-dispatcher.js";
export {
    type SecretStorePort,
} from "./secret-store.js";
export {
    ConnectorStateConflictError, type ConnectorStateEntry,
    type ConnectorStateNamespaceRegistration, type ConnectorStateOwner,
    type ConnectorStateStorePort,
} from "./connector-state-store.js";

export {
    type PersistIngestItemResult, type MediaCleanupCandidate, type WorkflowAttemptSnapshot,
    type RepositoryHealth,
} from "./result-types.js";
export {
    type LoggerContext, type LoggerPort,
} from "./logger.js";
export {
    SourceNotFoundError, SourceRevisionConflictError, ConnectionNotFoundError,
    ConnectionVersionConflictError, InvalidModelSelectionError,
    CollectionPlanNotFoundError, CollectionPlanRevisionConflictError,
    ConnectorStateImportRejectedError,
    StoryNotFoundError, StoryRevisionConflictError, StoryMergeConflictError,
    StorySplitConflictError, StorySubtypeInvalidError, StoryUserStateMigrationConflictError,
    TopicNotFoundError,
    TopicRevisionConflictError, TopicMergeConflictError, TopicMembershipNotFoundError,
    EntityNotFoundError, EntityRevisionConflictError, EntityRelationConflictError,
    EntityAliasConflictError, LabelNotFoundError, LabelConflictError,
    CollectionNotFoundError, EntryNotFoundError, EntryStoryLinkConflictError,
    EntryRelationConflictError,
    AnnotationNotFoundError, SavedViewNotFoundError, BoardNotFoundError,
    BoardNameConflictError, BoardSectionNotFoundError, BoardBlockNotFoundError,
    SpotlightPlacementNotFoundError,
} from "./errors.js";
export {
    type EntityLinkProvenanceInput, type CosmosRepository,
    type CollectionPlanWebhookEntryTarget,
} from "./repository-port.js";
export {
    ConnectorExecutionError, type JobLease, type IngestConnector, type ConnectorErrorCode,
    type ConnectorResolver, type ConnectorStateHandle,
} from "./connector-ports.js";
export {
    ConnectorRegistry,
} from "./connector-registry.js";
export {
    ConnectorProbeService, SourceConfigProbeService,
} from "./connector-probe.js";
export {
    ConnectionProbeService,
} from "./connection-probe.js";
export {
    ConnectionUpdateInvalidError, resolveModelConnectionWrite, type ModelConnectionWrite,
} from "./connection-model-selection.js";
export {
    IngestionService, type IngestionWorkerOptions, type WorkerJobResult,
} from "./ingestion-service.js";
export {
    IngestionWorker,
} from "./ingestion-worker.js";
export {
    createHealthSnapshot,
} from "./health.js";
