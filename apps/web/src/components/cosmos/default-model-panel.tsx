"use client";

import { useEffect, useState } from "react";
import type { SystemConfigDto } from "@cosmos/contracts";
import { Button } from "@/components/ui/button";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { messages } from "@/copy/messages";
import {
    defaultModelErrorMessage, loadDefaultModelSettings,
    type DefaultModelOption, type ModelSettingsClient,
} from "./default-model-settings";
import { ModelDetails } from "./model-details";

const copy = messages.pages.settings.defaultModel;

function useDefaultModelSettings(client: ModelSettingsClient) {
    const [config, setConfig] = useState<SystemConfigDto | null>(null);
    const [options, setOptions] = useState<DefaultModelOption[] | null>(null);
    const [selected, setSelected] = useState("");
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let active = true;
        void loadDefaultModelSettings(client).then((result) => {
            if (!active) return;
            setConfig(result.config);
            setOptions(result.options);
            setSelected(result.config.defaultModelId ?? "");
        }).catch(() => { if (active) setError(copy.loadFailed); });
        return () => { active = false; };
    }, [client, reload]);

    function refresh() {
        setConfig(null);
        setOptions(null);
        setError(null);
        setNotice(null);
        setReload((value) => value + 1);
    }

    async function save() {
        const defaultModelId = selected || null;
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            const result = await client.updateSystemConfig({ defaultModelId });
            setConfig((current) => current ? {
                ...current,
                defaultModelId: result.defaultModelId ?? null,
                defaultModel: options?.find((option) => option.model.id === result.defaultModelId)?.model ?? null,
            } : current);
            setSelected(result.defaultModelId ?? "");
            setNotice(copy.saved);
        } catch (failure) {
            setError(defaultModelErrorMessage(failure));
        } finally {
            setSaving(false);
        }
    }

    return {
        config, options, selected, saving, notice, error, save, refresh,
        select: (value: string) => { setSelected(value); setNotice(null); setError(null); },
    };
}

export function DefaultModelPanel({ client }: { client: ModelSettingsClient }) {
    const state = useDefaultModelSettings(client);
    const [confirmClear, setConfirmClear] = useState(false);
    const { config, options, selected, saving, notice, error } = state;
    if (!config || !options) {
        return error ? (
            <div className="flex items-center gap-3">
                <p className="text-[12px] text-destructive" role="alert">{error}</p>
                <Button size="sm" variant="outline" onClick={state.refresh}>{copy.retry}</Button>
            </div>
        ) : <p className="text-[12px] text-muted-foreground" role="status">{copy.loading}</p>;
    }
    const currentOption = options.find((option) => option.model.id === config.defaultModelId);
    const chosen = options.find((option) => option.model.id === selected);
    const missingCurrent = config.defaultModelId !== null && !currentOption;
    const isDirty = selected !== (config.defaultModelId ?? "");

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[12px] text-muted-foreground">{copy.hint}</p>
            <section aria-label={copy.current} className="flex flex-col gap-2">
                <h3 className="text-[13px] font-medium">{copy.current}</h3>
                {config.defaultModel ? <ModelDetails model={config.defaultModel} providerName={currentOption?.provider.name ?? copy.providerUnavailable} /> : (
                    <p className="text-[12px] text-muted-foreground">{config.defaultModelId ? copy.missing : copy.none}</p>
                )}
                {config.defaultModel && missingCurrent && <p className="text-[12px] text-muted-foreground">{copy.unavailable}</p>}
            </section>
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex max-w-full flex-col gap-2 text-[13px] sm:flex-row sm:items-center">
                    {copy.label}
                    <select aria-label={copy.label} className="w-full min-w-0 max-w-full rounded border border-border bg-background px-2 py-1 text-[13px] sm:w-auto sm:max-w-[32rem]" disabled={saving} onChange={(event) => state.select(event.target.value)} value={selected}>
                        <option value="">{copy.none}</option>
                        {missingCurrent && <option disabled value={config.defaultModelId ?? ""}>{config.defaultModel?.name ?? config.defaultModelId}（{copy.providerUnavailable}）</option>}
                        {options.map(({ model, provider }) => (
                            <option key={model.id} value={model.id}>{model.name}（{provider.name} · {model.contextWindow.toLocaleString()} tokens）{model.id === config.defaultModelId ? ` · ${copy.currentMarker}` : ""}</option>
                        ))}
                    </select>
                </label>
                <Button disabled={saving || !isDirty} onClick={() => selected === "" ? setConfirmClear(true) : void state.save()} size="sm">{saving ? copy.saving : copy.save}</Button>
                <Button disabled={saving} onClick={state.refresh} size="sm" variant="outline">{copy.retry}</Button>
            </div>
            {chosen && isDirty && <section aria-label={copy.selected}><ModelDetails model={chosen.model} providerName={chosen.provider.name} /></section>}
            {notice && <p className="text-[12px] text-muted-foreground" role="status">{notice}</p>}
            {error && <p className="text-[12px] text-destructive" role="alert">{error}</p>}
            {options.length === 0 && <p className="text-[12px] text-muted-foreground">{copy.noModels}</p>}
            <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
                <AlertDialogContent>
                    <AlertDialogTitle>{copy.clearTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{copy.clearDescription}</AlertDialogDescription>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void state.save()}>{copy.clearConfirm}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
