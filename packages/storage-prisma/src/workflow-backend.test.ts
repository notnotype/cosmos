import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
    WorkflowBackendConflictError,
    WorkflowRunNotFoundError,
    type WorkflowRunState,
    workflowBackendConformanceCases,
    workflowRunnerBackendConformanceCases,
} from "@notnotype/nb-workflow";
import { PrismaClient } from "@prisma/client";

import {
    PrismaWorkflowBackend,
    WorkflowStateIntegrityError,
} from "./workflow-backend.js";

const roots: string[] = [];
const clients = new Set<PrismaClient>();
const databasePaths = new WeakMap<PrismaWorkflowBackend, string>();

afterEach(async () => {
    await Promise.all([...clients].map((client) => client.$disconnect()));
    clients.clear();
    await Promise.all(roots.splice(0).map((root) => rm(root, {
        recursive: true,
        force: true,
    })));
});

describe("PrismaWorkflowBackend", () => {
    for (const testCase of workflowBackendConformanceCases) {
        it(`backend conformance: ${testCase.name}`, async () => {
            const backend = await createBackend();
            await testCase.run(() => backend);
        });
    }

    for (const testCase of workflowRunnerBackendConformanceCases) {
        it(`runner conformance: ${testCase.name}`, async () => {
            const backend = await createBackend();
            await testCase.run(() => backend);
        });
    }

    it("round-trips state across Prisma clients and rejects stale revisions", async () => {
        const backend = await createBackend();
        const initial = sampleRun("restart-round-trip");
        await backend.createRun(initial);
        const saved = await backend.saveRun({
            ...initial,
            status: "completed",
            result: { kind: "inline", value: { ok: true } },
            updatedAt: "2026-08-13T00:00:01.000Z",
        }, 0);
        expect(saved.revision).toBe(1);
        const databasePath = databasePathFor(backend);
        await backend.prisma.$disconnect();
        clients.delete(backend.prisma);

        const client = new PrismaClient({
            datasources: { db: { url: `file:${databasePath}` } },
        });
        clients.add(client);
        const reopened = new PrismaWorkflowBackend(client);
        await expect(reopened.loadRun(initial.runId)).resolves.toMatchObject({
            status: "completed",
            revision: 1,
        });
        await expect(reopened.saveRun({
            ...saved,
            logs: ["stale"],
            updatedAt: "2026-08-13T00:00:02.000Z",
        }, 0)).rejects.toBeInstanceOf(WorkflowBackendConflictError);
    });

    it("rejects immutable identity changes and missing runs", async () => {
        const backend = await createBackend();
        const initial = sampleRun("immutable");
        await backend.createRun(initial);
        await expect(backend.saveRun({
            ...initial,
            input: { kind: "inline", value: { changed: true } },
            updatedAt: "2026-08-13T00:00:01.000Z",
        }, 0)).rejects.toBeInstanceOf(WorkflowStateIntegrityError);
        await expect(backend.saveRun({
            ...initial,
            runId: "missing",
        }, 0)).rejects.toBeInstanceOf(WorkflowRunNotFoundError);
    });

    it("fails closed when persisted state JSON or projection is corrupt", async () => {
        const backend = await createBackend();
        const initial = sampleRun("corrupt");
        await backend.createRun(initial);
        await backend.prisma.workflowRun.update({
            where: { id: initial.runId },
            data: { stateJson: "not-json" },
        });
        await expect(backend.loadRun(initial.runId)).rejects.toBeInstanceOf(WorkflowStateIntegrityError);
    });
});

async function createBackend(): Promise<PrismaWorkflowBackend> {
    const root = await mkdtemp(join(tmpdir(), "cosmos-workflow-backend-"));
    roots.push(root);
    const databasePath = join(root, "cosmos.sqlite");
    const client = new PrismaClient({
        datasources: { db: { url: `file:${databasePath}` } },
    });
    clients.add(client);
    const backend = new PrismaWorkflowBackend(client);
    databasePaths.set(backend, databasePath);
    // Test setup uses the checked-in migration without touching a user's database.
    execFileSync(process.execPath, [
        resolve(process.cwd(), "packages/storage-prisma/node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        resolve(process.cwd(), "packages/storage-prisma/prisma/schema.prisma"),
    ], {
        env: {
            ...process.env,
            DATABASE_URL: `file:${databasePath}`,
        },
        stdio: "ignore",
    });
    return backend;
}

function databasePathFor(backend: PrismaWorkflowBackend): string {
    const path = databasePaths.get(backend);
    if (!path) {
        throw new Error("SQLite database path was not registered.");
    }
    return path;
}


function sampleRun(runId: string, createdAt = "2026-08-13T00:00:00.000Z"): WorkflowRunState {
    return {
        runId,
        definition: {
            key: "conformance",
            version: "1",
            manifestHash: "sha256:conformance",
        },
        input: {
            kind: "inline",
            value: { case: runId },
        },
        extensionContext: {},
        status: "running",
        resumeRequired: false,
        cancelRequestedAt: null,
        budget: null,
        checkpoint: null,
        pendingAsks: [],
        pendingWaits: [],
        pendingActivities: [],
        activityCompletions: [],
        logs: [],
        progress: null,
        journal: [],
        revision: 0,
        createdAt,
        updatedAt: createdAt,
    };
}
