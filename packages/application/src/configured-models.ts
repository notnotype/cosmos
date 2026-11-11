import {
    configuredModelSnapshotSchema,
    createConfiguredModelCommandSchema,
    updateConfiguredModelCommandSchema,
    type ConfiguredModelSnapshot,
    type CreateConfiguredModelCommand,
    type UpdateConfiguredModelCommand,
} from "@cosmos/contracts";
import { z } from "zod";

const identifier = z.string().min(1).max(200).refine((value) => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value));

export interface ConfiguredModelRepository {
    list(providerId: string): Promise<unknown[]>;
    get(providerId: string, id: string): Promise<unknown | null>;
    create(input: { id: string; providerId: string; fields: CreateConfiguredModelCommand }): Promise<unknown>;
    update(input: { id: string; providerId: string; expectedVersion: number; fields: Omit<UpdateConfiguredModelCommand, "expectedVersion"> }): Promise<unknown>;
    delete(input: { id: string; providerId: string; expectedVersion: number }): Promise<void>;
}

function failure(code: "invalid_input" | "not_found" | "already_exists" | "in_use" | "version_conflict" | "dependency_unavailable"): never {
    throw Object.assign(new Error("Configured model operation failed."), { code });
}

function id(value: string): string {
    return identifier.safeParse(value).success ? value : failure("invalid_input");
}

function snapshot(value: unknown): ConfiguredModelSnapshot {
    try { return configuredModelSnapshotSchema.parse(value); } catch { return failure("dependency_unavailable"); }
}

function safeFailure(error: unknown): never {
    let code: "not_found" | "already_exists" | "in_use" | "version_conflict" | "dependency_unavailable" = "dependency_unavailable";
    try {
        const candidate = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        if (candidate === "not_found" || candidate === "already_exists" || candidate === "in_use" || candidate === "version_conflict") code = candidate;
    } catch { /* Dependency errors must not expose throwing error accessors. */ }
    return failure(code);
}

export class ConfiguredModels {
    constructor(
        private readonly repository: ConfiguredModelRepository,
        private readonly modelId: () => string = () => crypto.randomUUID(),
    ) {}

    async list(providerId: string): Promise<ConfiguredModelSnapshot[]> {
        const provider = id(providerId);
        try { return (await this.repository.list(provider)).map(snapshot); } catch (error) { return safeFailure(error); }
    }

    async get(providerId: string, modelId: string): Promise<ConfiguredModelSnapshot> {
        const provider = id(providerId);
        const model = id(modelId);
        try {
            const value = await this.repository.get(provider, model);
            return value === null ? failure("not_found") : snapshot(value);
        } catch (error) { return safeFailure(error); }
    }

    async create(providerId: string, command: CreateConfiguredModelCommand): Promise<ConfiguredModelSnapshot> {
        const provider = id(providerId);
        const parsed = createConfiguredModelCommandSchema.safeParse(command);
        if (!parsed.success) return failure("invalid_input");
        try { return snapshot(await this.repository.create({ id: id(this.modelId()), providerId: provider, fields: parsed.data })); }
        catch (error) { return safeFailure(error); }
    }

    async update(providerId: string, modelId: string, command: UpdateConfiguredModelCommand): Promise<ConfiguredModelSnapshot> {
        const provider = id(providerId);
        const model = id(modelId);
        const parsed = updateConfiguredModelCommandSchema.safeParse(command);
        if (!parsed.success) return failure("invalid_input");
        try {
            const current = await this.repository.get(provider, model);
            if (current === null) return failure("not_found");
            const existing = snapshot(current);
            const { expectedVersion, ...fields } = parsed.data;
            const contextWindow = fields.contextWindow ?? existing.contextWindow;
            const maxOutputTokens = fields.maxOutputTokens ?? existing.maxOutputTokens;
            if (maxOutputTokens > contextWindow) return failure("invalid_input");
            return snapshot(await this.repository.update({ id: model, providerId: provider,
                expectedVersion, fields }));
        } catch (error) { return safeFailure(error); }
    }

    async delete(providerId: string, modelId: string, expectedVersion: number): Promise<void> {
        const provider = id(providerId);
        const model = id(modelId);
        if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return failure("invalid_input");
        try { await this.repository.delete({ providerId: provider, id: model, expectedVersion }); }
        catch (error) { return safeFailure(error); }
    }
}
