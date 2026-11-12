import { useCallback, useEffect, useRef, useState } from "react";
import type { SystemConfigDto } from "@cosmos/contracts";
import { client } from "@/app/home/page-runtime";

type ConfigClient = Pick<typeof client, "getSystemConfig">;
type ConfigState = { config: SystemConfigDto | null; loading: boolean; failed: boolean };
type StoryAgentConfigStatus = "loading" | "failed" | "unconfigured" | "unavailable" | "ready";

export function getStoryAgentConfigState(state: ConfigState): StoryAgentConfigStatus {
    if (state.loading) return "loading";
    if (state.failed) return "failed";
    if (!state.config?.defaultModelId) return "unconfigured";
    if (state.config.defaultModel?.id !== state.config.defaultModelId) return "unavailable";
    return "ready";
}

export function useStoryAgentConfig(api: ConfigClient) {
    const [config, setConfig] = useState<SystemConfigDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const requestId = useRef(0);
    const mounted = useRef(false);

    const refresh = useCallback(async () => {
        const currentRequest = ++requestId.current;
        if (mounted.current) {
            setLoading(true);
            setFailed(false);
        }
        try {
            const value = await api.getSystemConfig();
            if (mounted.current && currentRequest === requestId.current) {
                setConfig(value);
                setFailed(false);
            }
            return mounted.current && currentRequest === requestId.current ? value : null;
        } catch {
            if (mounted.current && currentRequest === requestId.current) {
                setConfig(null);
                setFailed(true);
            }
            return null;
        } finally {
            if (mounted.current && currentRequest === requestId.current) setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        mounted.current = true;
        void Promise.resolve().then(() => { if (mounted.current) void refresh(); });
        const onFocus = () => { void refresh(); };
        window.addEventListener("focus", onFocus);
        return () => {
            mounted.current = false;
            requestId.current += 1;
            window.removeEventListener("focus", onFocus);
        };
    }, [refresh]);

    return { config, loading, failed, refresh, status: getStoryAgentConfigState({ config, loading, failed }) };
}
