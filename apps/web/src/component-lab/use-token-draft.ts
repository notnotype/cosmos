"use client";

import {useSyncExternalStore} from "react";

import {LAB_TOKEN_DRAFT_STORAGE_KEY, readLabTokenDraft} from "./draft";
import type {LabTokenDefinition} from "./types";

const DRAFT_CHANGE_EVENT = "cosmos-component-lab-token-draft-change";

function getSnapshot(): string | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        return window.localStorage.getItem(LAB_TOKEN_DRAFT_STORAGE_KEY);
    } catch {
        return null;
    }
}

function getServerSnapshot(): string | null {
    return null;
}

function subscribe(onStoreChange: () => void): () => void {
    if (typeof window === "undefined") {
        return () => undefined;
    }
    const handleStorage = (event: StorageEvent) => {
        if (event.key === LAB_TOKEN_DRAFT_STORAGE_KEY || event.key === null) {
            onStoreChange();
        }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(DRAFT_CHANGE_EVENT, onStoreChange);
    return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(DRAFT_CHANGE_EVENT, onStoreChange);
    };
}

export function notifyLabTokenDraftChange(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
    }
}

export function useLabTokenDraft(tokenDefinitions: readonly LabTokenDefinition[]) {
    const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return readLabTokenDraft(raw, tokenDefinitions);
}
