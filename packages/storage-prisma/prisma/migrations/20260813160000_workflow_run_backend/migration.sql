-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stateJson" TEXT NOT NULL,
    "kernelRevision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "resumeRequired" BOOLEAN NOT NULL DEFAULT false,
    "definitionKey" TEXT NOT NULL,
    "definitionVersion" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "WorkflowRun_status_updatedAt_idx" ON "WorkflowRun"("status", "updatedAt");
