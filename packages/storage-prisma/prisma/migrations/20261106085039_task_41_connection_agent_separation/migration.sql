/*
  Warnings:

  - You are about to drop the column `modelId` on the `ConnectionInstance` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "EntryStoryLink_storyId_idx";

-- AlterTable
ALTER TABLE "ConfiguredModel" ADD COLUMN "inputPricePerMillion" DECIMAL DEFAULT 0;
ALTER TABLE "ConfiguredModel" ADD COLUMN "outputPricePerMillion" DECIMAL DEFAULT 0;

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "defaultModelId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Checkpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceInstanceId" TEXT NOT NULL,
    "planId" TEXT,
    "cursor" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "workflowRunId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Checkpoint_sourceInstanceId_fkey" FOREIGN KEY ("sourceInstanceId") REFERENCES "SourceInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Checkpoint_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CollectionPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Checkpoint_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Checkpoint" ("cursor", "id", "planId", "revision", "sourceInstanceId", "updatedAt", "workflowRunId") SELECT "cursor", "id", "planId", "revision", "sourceInstanceId", "updatedAt", "workflowRunId" FROM "Checkpoint";
DROP TABLE "Checkpoint";
ALTER TABLE "new_Checkpoint" RENAME TO "Checkpoint";
CREATE UNIQUE INDEX "Checkpoint_sourceInstanceId_key" ON "Checkpoint"("sourceInstanceId");
CREATE UNIQUE INDEX "Checkpoint_planId_key" ON "Checkpoint"("planId");
CREATE TABLE "new_ConnectionInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "account" TEXT,
    "scopeJson" TEXT,
    "configJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "secretRef" TEXT,
    "lastError" TEXT,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "new_ConnectionInstance" ("account", "configJson", "connectorId", "createdAt", "id", "lastCheckedAt", "lastError", "name", "scopeJson", "secretRef", "status", "updatedAt", "version") SELECT "account", "configJson", "connectorId", "createdAt", "id", "lastCheckedAt", "lastError", "name", "scopeJson", "secretRef", "status", "updatedAt", "version" FROM "ConnectionInstance";
DROP TABLE "ConnectionInstance";
ALTER TABLE "new_ConnectionInstance" RENAME TO "ConnectionInstance";
CREATE TABLE "new_Entity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "currentRevisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entity_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "EntityRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Entity" ("createdAt", "currentRevisionId", "id", "type", "updatedAt") SELECT "createdAt", "currentRevisionId", "id", "type", "updatedAt" FROM "Entity";
DROP TABLE "Entity";
ALTER TABLE "new_Entity" RENAME TO "Entity";
CREATE UNIQUE INDEX "Entity_currentRevisionId_key" ON "Entity"("currentRevisionId");
CREATE TABLE "new_Observation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceInstanceId" TEXT NOT NULL,
    "runId" TEXT,
    "workflowRunId" TEXT,
    "ingestCommandId" TEXT,
    "ingestResultJson" TEXT,
    "entryId" TEXT,
    "externalId" TEXT,
    "externalKey" TEXT NOT NULL,
    "externalRevision" TEXT NOT NULL DEFAULT '0',
    "eventKind" TEXT NOT NULL DEFAULT 'create',
    "sourceLocatorJson" TEXT NOT NULL,
    "discoveryContextJson" TEXT,
    "webUrl" TEXT,
    "payloadBlobKey" TEXT,
    "contentSourceBlobKey" TEXT,
    "title" TEXT,
    "contentText" TEXT,
    "contentFingerprint" TEXT,
    "contentKind" TEXT NOT NULL DEFAULT 'article',
    "publisherJson" TEXT,
    "metricsJson" TEXT,
    "publishedAtJson" TEXT,
    "updatedAtJson" TEXT,
    "sourcePublishedAt" DATETIME,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Observation_sourceInstanceId_fkey" FOREIGN KEY ("sourceInstanceId") REFERENCES "SourceInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Observation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Observation_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Observation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Observation" ("capturedAt", "contentFingerprint", "contentKind", "contentSourceBlobKey", "contentText", "discoveryContextJson", "entryId", "eventKind", "externalId", "externalKey", "externalRevision", "id", "ingestCommandId", "ingestResultJson", "metricsJson", "payloadBlobKey", "publishedAtJson", "publisherJson", "runId", "sourceInstanceId", "sourceLocatorJson", "sourcePublishedAt", "title", "updatedAtJson", "webUrl", "workflowRunId") SELECT "capturedAt", "contentFingerprint", "contentKind", "contentSourceBlobKey", "contentText", "discoveryContextJson", "entryId", "eventKind", "externalId", "externalKey", "externalRevision", "id", "ingestCommandId", "ingestResultJson", "metricsJson", "payloadBlobKey", "publishedAtJson", "publisherJson", "runId", "sourceInstanceId", "sourceLocatorJson", "sourcePublishedAt", "title", "updatedAtJson", "webUrl", "workflowRunId" FROM "Observation";
DROP TABLE "Observation";
ALTER TABLE "new_Observation" RENAME TO "Observation";
CREATE UNIQUE INDEX "Observation_ingestCommandId_key" ON "Observation"("ingestCommandId");
CREATE INDEX "Observation_sourceInstanceId_externalKey_capturedAt_idx" ON "Observation"("sourceInstanceId", "externalKey", "capturedAt");
CREATE INDEX "Observation_workflowRunId_capturedAt_idx" ON "Observation"("workflowRunId", "capturedAt");
CREATE UNIQUE INDEX "Observation_sourceInstanceId_runId_externalKey_key" ON "Observation"("sourceInstanceId", "runId", "externalKey");
CREATE TABLE "new_Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceInstanceId" TEXT NOT NULL,
    "planId" TEXT,
    "triggerKind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdEntryCount" INTEGER NOT NULL DEFAULT 0,
    "revisedEntryCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateObservationCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    CONSTRAINT "Run_sourceInstanceId_fkey" FOREIGN KEY ("sourceInstanceId") REFERENCES "SourceInstance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Run_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CollectionPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Run" ("createdAt", "createdEntryCount", "duplicateObservationCount", "errorCode", "errorMessage", "finishedAt", "id", "itemCount", "planId", "revisedEntryCount", "sourceInstanceId", "startedAt", "status", "triggerKind") SELECT "createdAt", "createdEntryCount", "duplicateObservationCount", "errorCode", "errorMessage", "finishedAt", "id", "itemCount", "planId", "revisedEntryCount", "sourceInstanceId", "startedAt", "status", "triggerKind" FROM "Run";
DROP TABLE "Run";
ALTER TABLE "new_Run" RENAME TO "Run";
CREATE INDEX "Run_sourceInstanceId_createdAt_idx" ON "Run"("sourceInstanceId", "createdAt");
CREATE INDEX "Run_planId_createdAt_idx" ON "Run"("planId", "createdAt");
CREATE TABLE "new_SourceInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceDefinitionRef" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "connectionId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceInstance_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SourceInstance" ("configJson", "connectionId", "createdAt", "deletedAt", "enabled", "id", "kind", "name", "operationId", "revision", "sourceDefinitionRef", "updatedAt") SELECT "configJson", "connectionId", "createdAt", "deletedAt", "enabled", "id", "kind", "name", "operationId", "revision", "sourceDefinitionRef", "updatedAt" FROM "SourceInstance";
DROP TABLE "SourceInstance";
ALTER TABLE "new_SourceInstance" RENAME TO "SourceInstance";
CREATE INDEX "SourceInstance_connectionId_idx" ON "SourceInstance"("connectionId");
CREATE TABLE "new_Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currentRevisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Topic_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "TopicRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Topic" ("createdAt", "currentRevisionId", "id", "updatedAt") SELECT "createdAt", "currentRevisionId", "id", "updatedAt" FROM "Topic";
DROP TABLE "Topic";
ALTER TABLE "new_Topic" RENAME TO "Topic";
CREATE UNIQUE INDEX "Topic_currentRevisionId_key" ON "Topic"("currentRevisionId");
CREATE TABLE "new_TopicMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "currentRevisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TopicMembership_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TopicMembership_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TopicMembership_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "TopicMembershipRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TopicMembership" ("createdAt", "currentRevisionId", "id", "storyId", "topicId", "updatedAt") SELECT "createdAt", "currentRevisionId", "id", "storyId", "topicId", "updatedAt" FROM "TopicMembership";
DROP TABLE "TopicMembership";
ALTER TABLE "new_TopicMembership" RENAME TO "TopicMembership";
CREATE UNIQUE INDEX "TopicMembership_currentRevisionId_key" ON "TopicMembership"("currentRevisionId");
CREATE UNIQUE INDEX "TopicMembership_topicId_storyId_key" ON "TopicMembership"("topicId", "storyId");
CREATE TABLE "new_TriggerBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "planId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'schedule',
    "configJson" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "webhookToken" TEXT,
    "secretRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TriggerBinding_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TriggerBinding_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CollectionPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TriggerBinding" ("configJson", "createdAt", "enabled", "id", "kind", "planId", "revision", "secretRef", "sourceId", "updatedAt", "webhookToken") SELECT "configJson", "createdAt", "enabled", "id", "kind", "planId", "revision", "secretRef", "sourceId", "updatedAt", "webhookToken" FROM "TriggerBinding";
DROP TABLE "TriggerBinding";
ALTER TABLE "new_TriggerBinding" RENAME TO "TriggerBinding";
CREATE UNIQUE INDEX "TriggerBinding_webhookToken_key" ON "TriggerBinding"("webhookToken");
CREATE UNIQUE INDEX "TriggerBinding_sourceId_kind_key" ON "TriggerBinding"("sourceId", "kind");
CREATE UNIQUE INDEX "TriggerBinding_planId_kind_key" ON "TriggerBinding"("planId", "kind");
CREATE TABLE "new_WorkflowRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stateJson" TEXT NOT NULL,
    "kernelRevision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "resumeRequired" BOOLEAN NOT NULL DEFAULT false,
    "sourceInstanceId" TEXT,
    "planId" TEXT,
    "errorMessage" TEXT,
    "definitionKey" TEXT NOT NULL,
    "definitionVersion" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "inputSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "productRunJson" TEXT NOT NULL DEFAULT '{}',
    "runLeaseOwner" TEXT,
    "runLeaseToken" TEXT,
    "runLeaseExpiresAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowRun_sourceInstanceId_fkey" FOREIGN KEY ("sourceInstanceId") REFERENCES "SourceInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkflowRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CollectionPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkflowRun" ("createdAt", "definitionKey", "definitionVersion", "errorMessage", "finishedAt", "id", "idempotencyKey", "inputSnapshotJson", "kernelRevision", "manifestHash", "planId", "productRunJson", "resumeRequired", "runLeaseExpiresAt", "runLeaseOwner", "runLeaseToken", "sourceInstanceId", "startedAt", "stateJson", "status", "updatedAt") SELECT "createdAt", "definitionKey", "definitionVersion", "errorMessage", "finishedAt", "id", "idempotencyKey", "inputSnapshotJson", "kernelRevision", "manifestHash", "planId", "productRunJson", "resumeRequired", "runLeaseExpiresAt", "runLeaseOwner", "runLeaseToken", "sourceInstanceId", "startedAt", "stateJson", "status", "updatedAt" FROM "WorkflowRun";
DROP TABLE "WorkflowRun";
ALTER TABLE "new_WorkflowRun" RENAME TO "WorkflowRun";
CREATE UNIQUE INDEX "WorkflowRun_idempotencyKey_key" ON "WorkflowRun"("idempotencyKey");
CREATE INDEX "WorkflowRun_status_updatedAt_idx" ON "WorkflowRun"("status", "updatedAt");
CREATE INDEX "WorkflowRun_sourceInstanceId_createdAt_idx" ON "WorkflowRun"("sourceInstanceId", "createdAt");
CREATE INDEX "WorkflowRun_planId_createdAt_idx" ON "WorkflowRun"("planId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DomainEvent_workflowRunId_occurredAt_idx" ON "DomainEvent"("workflowRunId", "occurredAt");
