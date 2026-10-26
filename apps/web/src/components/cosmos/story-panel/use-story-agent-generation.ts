import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { storyAgentGenerationRequestSchema, type StoryAgentGeneration, type StoryAgentGenerationRequest } from "@cosmos/contracts";
import { CosmosTransportError } from "@cosmos/transport-http";
import { client, readError } from "@/app/home/page-runtime";
import { messages } from "@/copy/messages";

const pendingSchema = z.object({
    version: z.literal(1), key: z.string().min(1), request: storyAgentGenerationRequestSchema,
    runId: z.string().min(1).optional(),
}).strict();
type Pending = z.infer<typeof pendingSchema>;
export type GenerationClient = Pick<typeof client, "proposeStoryAgentCandidate" | "storyAgentGeneration">;
const terminal = (generation: StoryAgentGeneration | null) => generation !== null
    && ["completed", "failed", "cancelled"].includes(generation.status);
const copy = messages.reading.candidates;

export function useStoryAgentGeneration(storyId: string, api: GenerationClient, onSettled: () => void) {
    const storageKey = `cosmos.story-generation.v1:${encodeURIComponent(storyId)}`;
    const [pending, setPending] = useState<Pending | null>(null);
    const [generation, setGeneration] = useState<StoryAgentGeneration | null>(null);
    const [ready, setReady] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const mounted = useRef(false);
    const locked = useRef(false);
    useEffect(() => {
        mounted.current = true;
        try {
            const raw = sessionStorage.getItem(storageKey);
            const restored = raw ? pendingSchema.parse(JSON.parse(raw)) : null;
            setPending(restored);
            locked.current = restored !== null;
            if (restored && !restored.runId) setError(copy.generationUnknown);
            setReady(true);
        } catch { setError(copy.recoveryUnavailable); }
        return () => { mounted.current = false; };
    }, [storageKey]);

    const send = useCallback(async (record: Pending) => {
        // Persist the exact intent before POST; a lost response must replay the same key, never mint another paid request.
        try { sessionStorage.setItem(storageKey, JSON.stringify(record)); }
        catch { setReady(false); setError(copy.recoveryUnavailable); return; }
        setSending(true);
        setError(null);
        try {
            setPending(record);
            setGeneration(null);
            const result = await api.proposeStoryAgentCandidate(storyId, record.request, record.key);
            const next = { ...record, runId: result.runId };
            sessionStorage.setItem(storageKey, JSON.stringify(next));
            if (mounted.current) {
                setPending(next);
                setGeneration(result);
                if (terminal(result)) onSettled();
            }
        } catch (caught) {
            if (!mounted.current) return;
            if (caught instanceof CosmosTransportError && [400, 404, 409].includes(caught.status)) {
                try { sessionStorage.removeItem(storageKey); }
                catch { setReady(false); setError(copy.recoveryUnavailable); return; }
                locked.current = false;
                setPending(null);
                setError(readError(caught));
            } else setError(copy.generationUnknown);
        } finally { if (mounted.current) setSending(false); }
    }, [storageKey, storyId, api, onSettled]);

    useEffect(() => {
        if (!pending?.runId || terminal(generation)) return;
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
            } catch { if (active) setError(copy.generationReadFailed); }
        };
        void poll();
        return () => { active = false; clearTimeout(timer); };
    }, [pending?.runId, storyId, api, onSettled, attempt]);

    const start = (request: StoryAgentGenerationRequest) => {
        if (!mounted.current || !ready || sending || (locked.current && !terminal(generation))) return;
        locked.current = true;
        return send({ version: 1, key: crypto.randomUUID(), request });
    };
    const retry = () => {
        if (sending || !pending) return;
        if (pending.runId) { setError(null); setAttempt((value) => value + 1); }
        else void send(pending);
    };
    return { start, retry, generation, error, ready, sending,
        active: sending || (pending !== null && !terminal(generation)),
        recoverable: ready && pending !== null && error !== null,
    };
}
