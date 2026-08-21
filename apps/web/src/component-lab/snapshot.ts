import {z} from "zod";

import type {LabTokenDefinition, LabTokenName} from "./types";

const SNAPSHOT_VERSION = 1;

const rawSnapshotSchema = z.object({
    overrides: z.record(z.string(), z.string()),
    version: z.number(),
}).strict();

export function isSafeLabTokenValue(value: string, kind: LabTokenDefinition["kind"]): boolean {
    if (value.length === 0 || value.length > 200 || /[;{}]/u.test(value)) {
        return false;
    }
    if (kind === "length") {
        return /^-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)$/u.test(value);
    }
    return /^#[\da-f]{3,8}$/iu.test(value)
        || /^(?:oklch|rgb|rgba|hsl|hsla)\([^)]{1,180}\)$/iu.test(value);
}

export function serializeLabOverrideSnapshot(
    overrides: Readonly<Record<string, string>>,
): string {
    const sortedOverrides = Object.fromEntries(
        Object.entries(overrides).toSorted(([left], [right]) => left.localeCompare(right)),
    );
    return JSON.stringify({overrides: sortedOverrides, version: SNAPSHOT_VERSION});
}

export function parseLabOverrideSnapshot(
    raw: string,
    tokenDefinitions: readonly LabTokenDefinition[],
): Record<string, string> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch {
        throw new Error("invalid snapshot JSON");
    }

    const result = rawSnapshotSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error("invalid snapshot shape");
    }
    if (result.data.version !== SNAPSHOT_VERSION) {
        throw new Error(`unsupported snapshot version ${result.data.version}`);
    }

    const definitions = new Map(tokenDefinitions.map((token) => [token.name, token]));
    const next: Record<string, string> = {};
    for (const [name, value] of Object.entries(result.data.overrides)) {
        const definition = definitions.get(name as LabTokenName);
        if (definition === undefined) {
            throw new Error(`unregistered token "${name}"`);
        }
        if (!isSafeLabTokenValue(value, definition.kind)) {
            throw new Error(`invalid value for token "${name}"`);
        }
        next[name] = value;
    }
    return next;
}
