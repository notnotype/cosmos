import {parseLabOverrideSnapshot, serializeLabOverrideSnapshot} from "./snapshot";
import type {LabTokenDefinition} from "./types";

export const LAB_TOKEN_DRAFT_STORAGE_KEY = "cosmos.component-lab.token-draft.v1";

export type LabDraftStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
};

export type LabDraftReadResult = {
    error: string | null;
    overrides: Record<string, string>;
};

export type LabDraftWriteResult = {
    error: string | null;
};

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}
export function resolveLabTokenValueOnBlur(
    draftValues: Readonly<Record<string, string>>,
    overrides: Readonly<Record<string, string>>,
    name: string,
): string {
    return draftValues[name] ?? overrides[name] ?? "";
}

export function readLabTokenDraft(
    raw: string | null,
    tokenDefinitions: readonly LabTokenDefinition[],
): LabDraftReadResult {
    if (raw === null) {
        return {error: null, overrides: {}};
    }
    try {
        return {
            error: null,
            overrides: parseLabOverrideSnapshot(raw, tokenDefinitions),
        };
    } catch (error) {
        return {
            error: errorMessage(error, "invalid token draft"),
            overrides: {},
        };
    }
}

export function loadLabTokenDraft(
    storage: LabDraftStorage,
    tokenDefinitions: readonly LabTokenDefinition[],
): LabDraftReadResult {
    try {
        return readLabTokenDraft(storage.getItem(LAB_TOKEN_DRAFT_STORAGE_KEY), tokenDefinitions);
    } catch (error) {
        return {
            error: errorMessage(error, "unable to read token draft"),
            overrides: {},
        };
    }
}

export function saveLabTokenDraft(
    storage: LabDraftStorage,
    overrides: Readonly<Record<string, string>>,
): LabDraftWriteResult {
    try {
        storage.setItem(
            LAB_TOKEN_DRAFT_STORAGE_KEY,
            serializeLabOverrideSnapshot(overrides),
        );
        return {error: null};
    } catch (error) {
        return {error: errorMessage(error, "unable to save token draft")};
    }
}
