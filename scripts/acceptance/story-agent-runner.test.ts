import { afterEach, expect, it, vi } from "vitest";
import { FileSecretStore, PrismaCosmosRepository, PrismaSystemConfigRepository } from "@cosmos/storage-prisma";
import { prepareStoryIsolation } from "./story-agent-isolation.js";
import { access, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { acceptancePlan, createOfflineStoryTransport, runStoryAcceptance } from "./story-agent-runner.js";
import { ContentQuery } from "@cosmos/application";
import { prepareStoryAgentRequest } from "../../packages/application/src/story-agent-preparation.js";
import { configureStoryConnection, storySnapshot } from "./story-agent-plan.js";

it("configures an isolated model that the current worker resolver can load without a model connection", async () => {
    const { root, repository, secretRefs } = await prepareStoryIsolation();
    roots.push(root);
    try {
        const columns = await repository.prisma.$queryRaw<Array<{ name: string }>>`PRAGMA table_info("ConfiguredModel")`;
        expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
            "inputPricePerMillion", "outputPricePerMillion",
        ]));
        const configured = await configureStoryConnection(repository, "synthetic-task40-key");
        await expect(configured.models.resolve(configured.modelId)).resolves.toMatchObject({
            modelId: acceptancePlan.model, providerId: "task40-acceptance-provider",
            maxOutputTokens: acceptancePlan.maxOutputTokens,
        });
        await expect(configured.models.resolve(null)).resolves.toBeNull();
        const fallback = await repository.prisma.configuredModel.create({ data: {
            id: "task40-default-model", providerId: "task40-acceptance-provider", modelId: "synthetic-default-model",
            name: "Isolated default model", contextWindow: 8_192, maxOutputTokens: 512,
        } });
        await new PrismaSystemConfigRepository(repository.prisma).setDefaultModelId(fallback.id);
        await expect(configured.models.resolve(null)).resolves.toMatchObject({ modelId: fallback.modelId });
        await expect(configured.models.resolve(configured.modelId)).resolves.toMatchObject({ modelId: acceptancePlan.model });
        await expect(configured.models.resolve("missing-model")).resolves.toBeNull();
        expect(await repository.prisma.connectionInstance.count()).toBe(0);
    } finally {
        for (const ref of secretRefs) await repository.secrets.delete(ref);
        await repository.close();
    }
});

it("discloses the exact no-source prompt built by the current preparation owner", async () => {
    const prepared = await prepareStoryAgentRequest({ readStory: async () => storySnapshot },
        new ContentQuery({ readContentSource: async () => null }),
        { storyId: storySnapshot.storyId, task: "story.summarize" },
        { modelId: "synthetic-model", authority: { allowedProfiles: ["summary-only"] },
            budget: { maxDurationMs: 60_000, maxOutputTokens: 512, maxToolCalls: 0 } });
    expect(acceptancePlan.messages).toEqual(prepared.input.messages);
});

it.each(["delayed", "never"] as const)("aborts a %s transport at the shorter generation deadline and still removes its secret", async (outcome) => {
    const offline = createOfflineStoryTransport("valid");
    const result = await runStoryAcceptance({ credential: "synthetic-task40-key",
        maxDurationMs: 500, transport: async (input, init) => {
            if (outcome === "never") return new Promise<Response>(() => {});
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return offline(input, init);
        } });
    roots.push(result.root);
    expect(result.report).toMatchObject({ status: "failed", stage: "generation_timeout", transportSends: 1,
        formalUnchanged: true, secretCleanup: "completed", disconnect: "completed" });
    expect(await readdir(join(result.root, "data", "secrets"))).toEqual([]);
}, 15_000);

it("closes and removes only its newly created root when preparation fails", async () => {
    vi.spyOn(PrismaCosmosRepository.prototype, "initialize").mockImplementationOnce(async function (this: PrismaCosmosRepository) {
        roots.push(dirname(this.roots.dataRoot));
        throw new Error("PRIVATE-PREPARATION-FAILURE");
    });
    const close = vi.spyOn(PrismaCosmosRepository.prototype, "close");
    await expect(prepareStoryIsolation()).rejects.toThrow("Isolated");
    expect(close).toHaveBeenCalledOnce();
    await expect(access(roots.at(-1)!)).rejects.toMatchObject({ code: "ENOENT" });
});

const roots: string[] = [];
it("cleans staged credentials if configuration fails after the file write", async () => {
    const put = FileSecretStore.prototype.put;
    vi.spyOn(FileSecretStore.prototype, "put").mockImplementationOnce(async function (this: FileSecretStore, ref, value) {
        await put.call(this, ref, value);
        throw new Error("PRIVATE-CONFIGURATION-FAILURE");
    });
    const result = await runStoryAcceptance({ credential: "synthetic-task40-key", transport: createOfflineStoryTransport("valid") });
    roots.push(result.root);
    expect(result.report).toMatchObject({ status: "failed", stage: "configuration", transportSends: 0,
        secretCleanup: "completed", disconnect: "completed" });
    expect(JSON.stringify(result.report)).not.toContain("PRIVATE-CONFIGURATION-FAILURE");
    expect(await readdir(join(result.root, "data", "secrets"))).toEqual([]);
});
afterEach(async () => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it("runs the real durable Story/SDK chain once offline, rejects the pending proposal and removes its secret", async () => {
    const requests: unknown[] = [];
    const result = await runStoryAcceptance({ credential: "synthetic-task40-key", transport: createOfflineStoryTransport("valid", requests) });
    roots.push(result.root);
    expect(result.report).toMatchObject({ status: "completed", transportSends: 1, pendingCount: 1,
        decision: "rejected", formalUnchanged: true, secretCleanup: "completed", disconnect: "completed" });
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests)).toContain(acceptancePlan.model);
    const retained = await readFile(join(result.root, "result.json"), "utf8");
    expect(retained).not.toContain("synthetic-task40-key");
    expect(retained).not.toContain("Offline generated suggestion");
    expect((await readdir(join(result.root, "data", "secrets"), { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile())).toEqual([]);
    const plan = JSON.parse(await readFile(join(result.root, "request-plan.json"), "utf8"));
    expect(plan).toEqual(acceptancePlan);
});

it.each(["invalid", "network"] as const)("retains a safe failed report without a second transport send: %s", async (outcome) => {
    const result = await runStoryAcceptance({ credential: "synthetic-task40-key", transport: createOfflineStoryTransport(outcome) });
    roots.push(result.root);
    expect(result.report).toMatchObject({ status: "failed", transportSends: 1, pendingCount: 0,
        formalUnchanged: true, secretCleanup: "completed", disconnect: "completed" });
    expect(JSON.stringify(result.report)).not.toContain("PRIVATE-SYNTHETIC-FAILURE");
    expect((await readdir(join(result.root, "data", "secrets"), { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile())).toEqual([]);
});
