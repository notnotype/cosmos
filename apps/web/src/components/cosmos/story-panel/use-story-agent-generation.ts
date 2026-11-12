import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { storyAgentGenerationRequestSchema, type StoryAgentGeneration, type StoryAgentGenerationRequest } from "@cosmos/contracts";
import { CosmosTransportError } from "@cosmos/transport-http";
import { client } from "@/app/home/page-runtime";
import { messages } from "@/copy/messages";
import { storyAgentErrorCopy } from "./story-agent-error";

const pendingSchema = z.object({
    version: z.literal(1), key: z.string().min(1), request: storyAgentGenerationRequestSchema,
    runId: z.string().min(1).optional(),
}).strict();
type Pending = z.infer<typeof pendingSchema>;
export type GenerationClient = Pick<typeof client, "proposeStoryAgentCandidate" | "storyAgentGeneration">;
const terminal = (generation: StoryAgentGeneration | null) => generation !== null
    && ["completed", "failed", "cancelled"].includes(generation.status);
const copy = messages.reading.candidates;
const serverStorageSnapshot: unique symbol = Symbol("server-session-storage");
const unavailableStorageSnapshot: unique symbol = Symbol("unavailable-session-storage");
type StorageSnapshot = string | null | typeof serverStorageSnapshot | typeof unavailableStorageSnapshot;
const storageListeners = new Map<string, Set<() => void>>();

function readStorageSnapshot(key: string): string | null | typeof unavailableStorageSnapshot {
    try { return sessionStorage.getItem(key); }
    catch { return unavailableStorageSnapshot; }
}

function subscribeToStorage(key: string, listener: () => void) {
    const listeners = storageListeners.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    storageListeners.set(key, listeners);
    const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener("storage", onStorage);
        listeners.delete(listener);
        if (listeners.size === 0) storageListeners.delete(key);
    };
}

function notifyStorageListeners(key: string) {
    for (const listener of storageListeners.get(key) ?? []) listener();
}

function writeStorage(key: string, value: string) {
    sessionStorage.setItem(key, value);
    notifyStorageListeners(key);
}

function removeStorage(key: string) {
    sessionStorage.removeItem(key);
    notifyStorageListeners(key);
}

function getServerStorageSnapshot(): typeof serverStorageSnapshot {
    return serverStorageSnapshot;
}

export function useStoryAgentGeneration(storyId: string, api: GenerationClient, onSettled: () => void) {
    const storageKey = `cosmos.story-generation.v1:${encodeURIComponent(storyId)}`;
    const subscribe = useCallback((listener: () => void) => subscribeToStorage(storageKey, listener), [storageKey]);
    const getSnapshot = useCallback((): StorageSnapshot => readStorageSnapshot(storageKey), [storageKey]);
    const storageSnapshot = useSyncExternalStore<StorageSnapshot>(subscribe, getSnapshot, getServerStorageSnapshot);
    let pending: Pending | null = null;
    let invalidStoredValue = false;
    if (typeof storageSnapshot === "string") {
        try { pending = storageSnapshot === "" ? null : pendingSchema.parse(JSON.parse(storageSnapshot)); }
        catch { invalidStoredValue = true; }
    }
    const [generation, setGeneration] = useState<StoryAgentGeneration | null>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [storageUnavailable, setStorageUnavailable] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const mounted = useRef(false);
    const locked = useRef(false);
    const ready = storageSnapshot !== serverStorageSnapshot
        && storageSnapshot !== unavailableStorageSnapshot
        && !invalidStoredValue
        && !storageUnavailable;
    const recoveryError = storageSnapshot === unavailableStorageSnapshot || invalidStoredValue || storageUnavailable
        ? copy.recoveryUnavailable
        : ready && pending !== null && !pending.runId && !sending
            ? copy.generationUnknown
            : null;
    const visibleError = recoveryError ?? error;
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const send = useCallback(async (record: Pending) => {
        // Persist the exact intent before POST; a lost response must replay the same key, never mint another paid request.
        try { writeStorage(storageKey, JSON.stringify(record)); }
        catch { setStorageUnavailable(true); setError(copy.recoveryUnavailable); return; }
        setSending(true);
        setError(null);
        try {
            setGeneration(null);
            const result = await api.proposeStoryAgentCandidate(storyId, record.request, record.key);
            const next = { ...record, runId: result.runId };
            writeStorage(storageKey, JSON.stringify(next));
            if (mounted.current) {
                setGeneration(result);
                if (terminal(result)) onSettled();
            }
        } catch (caught) {
            if (!mounted.current) return;
            if (caught instanceof CosmosTransportError && [400, 404, 409].includes(caught.status)) {
                try { removeStorage(storageKey); }
                catch { setStorageUnavailable(true); setError(copy.recoveryUnavailable); return; }
                locked.current = false;
                setError(storyAgentErrorCopy(null));
            } else setError(copy.generationUnknown);
        } finally { if (mounted.current) setSending(false); }
    }, [storageKey, storyId, api, onSettled]);

    useEffect(() => {
        if (!pending?.runId || generation?.status === "completed" || generation?.status === "cancelled"
            || (generation?.status === "failed" && attempt === 0)) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {
                const value = await api.storyAgentGeneration(storyId, pending.runId!);
                if (!active) return;
                setGeneration(value);
                setError(null);
                if (terminal(value)) onSettled();
                if (!terminal(value)) timer = setTimeout(() => void poll(), 1000);
            } catch { if (active) setError(storyAgentErrorCopy(null)); }
        };
        void poll();
        return () => { active = false; clearTimeout(timer); };
    }, [pending?.runId, storyId, api, onSettled, attempt]);

    const start = (request: StoryAgentGenerationRequest) => {
        if (!mounted.current || !ready || sending || ((locked.current || pending !== null) && !terminal(generation))) return;
        locked.current = true;
        return send({ version: 1, key: crypto.randomUUID(), request });
    };
    const retry = () => {
        if (sending || !pending) return;
        if (pending.runId) { setError(null); setAttempt((value) => value + 1); }
        else void send(pending);
    };
    return { start, retry, generation, error: visibleError, ready, sending,
        active: sending || (pending !== null && !terminal(generation)),
        recoverable: ready && pending !== null && (visibleError !== null || generation?.status === "failed"),
    };
}
