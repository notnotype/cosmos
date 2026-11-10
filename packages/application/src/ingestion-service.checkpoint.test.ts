import { describe, expect, it } from "vitest";

import type { RunSnapshot } from "@cosmos/contracts";

import type { IngestConnector } from "./connector-ports.js";
import { IngestionService } from "./ingestion-service.js";
import type { CosmosRepository } from "./repository-port.js";
import { source } from "./test-support.js";

describe("IngestionService checkpoint ownership", () => {
    it.each(["runSource", "runExistingRun"] as const)(
        "%s resumes and advances the checkpoint owned by source.planId",
        async (entrypoint) => {
            const snapshot = source({ planId: "independent-collection-plan" });
            const checkpoints = new Map<string, string | null>([
                [snapshot.planId, "previous-cursor"],
            ]);
            const receivedCursors: Array<string | null> = [];
            const run: RunSnapshot = {
                id: "run-checkpoint",
                sourceId: snapshot.id,
                triggerKind: "manual",
                status: "queued",
                createdAt: snapshot.createdAt,
                startedAt: null,
                finishedAt: null,
                itemCount: 0,
                createdEntryCount: 0,
                revisedEntryCount: 0,
                error: null,
            };
            const repository: Pick<CosmosRepository,
                | "getSource" | "createRun" | "getRun" | "startRun"
                | "getCheckpoint" | "setCheckpoint" | "completeRun"
            > = {
                getSource: async () => snapshot,
                createRun: async () => ({ ...run, status: "running" }),
                getRun: async () => run,
                startRun: async () => ({ ...run, status: "running" }),
                getCheckpoint: async (planId) => checkpoints.get(planId) ?? null,
                setCheckpoint: async (planId, cursor) => {
                    checkpoints.set(planId, cursor);
                },
                completeRun: async () => ({ ...run, status: "succeeded" }),
            };
            const connector: IngestConnector = {
                id: snapshot.connectorId,
                description: "Checkpoint fixture",
                configVersion: "v1",
                capabilities: [],
                validate: () => undefined,
                async fetchItems({ cursor }) {
                    receivedCursors.push(cursor);
                    return { items: [], nextCursor: "next-cursor" };
                },
            };
            const service = new IngestionService(
                repository as CosmosRepository,
                () => connector,
            );

            const result = await service[entrypoint](
                entrypoint === "runSource" ? snapshot.id : run.id,
            );

            expect(result.run.status).toBe("succeeded");
            expect({
                receivedCursors,
                planCursor: checkpoints.get(snapshot.planId),
                sourceCheckpointExists: checkpoints.has(snapshot.id),
            }).toEqual({
                receivedCursors: ["previous-cursor"],
                planCursor: "next-cursor",
                sourceCheckpointExists: false,
            });
        },
    );
});
