"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messages } from "@/copy/messages";
import {
    saveStoryAgentTimeout,
    storyAgentTimeoutSeconds,
    STORY_AGENT_TIMEOUT_DEFAULT,
    STORY_AGENT_TIMEOUT_MAX,
    STORY_AGENT_TIMEOUT_MIN,
    type StoryAgentTimeoutClient,
} from "./story-agent-timeout-settings";

const copy = messages.pages.settings.storyAgentTimeout;
const rangeId = "story-agent-timeout-range";
const errorId = "story-agent-timeout-error";

export function StoryAgentTimeoutPanel({ client }: { client: StoryAgentTimeoutClient }) {
    const [value, setValue] = useState(String(STORY_AGENT_TIMEOUT_DEFAULT));
    const [savedValue, setSavedValue] = useState(STORY_AGENT_TIMEOUT_DEFAULT);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        void client.getSystemConfig().then((config) => {
            if (!active) return;
            const seconds = storyAgentTimeoutSeconds(config.storyAgentTimeoutSeconds);
            setValue(String(seconds));
            setSavedValue(seconds);
            setError(null);
        }).catch(() => {
            if (active) setError(copy.loadFailed);
        }).finally(() => {
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [client, attempt]);

    const seconds = Number(value);
    const valid = Number.isInteger(seconds) && seconds >= STORY_AGENT_TIMEOUT_MIN && seconds <= STORY_AGENT_TIMEOUT_MAX;
    const dirty = valid && seconds !== savedValue;

    async function save() {
        if (!valid || saving) return;
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            const saved = await saveStoryAgentTimeout(client, seconds);
            setValue(String(saved));
            setSavedValue(saved);
            setNotice(copy.saved);
        } catch {
            setError(copy.saveFailed);
        } finally {
            setSaving(false);
        }
    }

    return <div className="flex flex-col gap-3">
        <p className="text-[12px] text-muted-foreground">{copy.hint}</p>
        <div className="flex flex-wrap items-end gap-3">
            <label className="flex max-w-full flex-col gap-2 text-[13px]">
                {copy.label}
                <Input
                    aria-describedby={`${rangeId}${!valid ? ` ${errorId}` : ""}`}
                    aria-label={copy.label}
                    aria-invalid={!valid}
                    className="w-36"
                    disabled={loading || saving}
                    max={STORY_AGENT_TIMEOUT_MAX}
                    min={STORY_AGENT_TIMEOUT_MIN}
                    onChange={(event) => { setValue(event.target.value); setNotice(null); setError(null); }}
                    step={1}
                    type="number"
                    value={value}
                />
                <span className="text-[12px] text-muted-foreground" id={rangeId}>{copy.range}</span>
                {!valid && <span className="text-[12px] text-destructive" id={errorId}>{copy.invalid}</span>}
            </label>
            <Button disabled={loading || saving || !dirty} onClick={() => void save()} size="sm">
                {saving ? copy.saving : copy.save}
            </Button>
            {error && <p className="text-[12px] text-destructive" role="alert">{error}</p>}
            {notice && <p className="text-[12px] text-muted-foreground" role="status">{notice}</p>}
        </div>
        {error === copy.loadFailed && <Button className="self-start" disabled={loading} onClick={() => {
            setLoading(true);
            setAttempt((current) => current + 1);
        }} size="sm" variant="outline">{messages.pages.settings.defaultModel.retry}</Button>}
    </div>;
}
