"use client";

import { useState } from "react";
import type { ConfiguredModelSnapshot } from "@cosmos/contracts";
import { CosmosTransportError, type HttpCosmosClient } from "@cosmos/transport-http";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messages } from "@/copy/messages";
import { newRequestKey } from "@/lib/request-key";
const copy = messages.models;
import { ModelDetails } from "../model-details";
import { modelDraftFromSnapshot, writeFailureNotice, toUpdateModelCommand,
    type ModelDraftValues, type ModelFormErrors } from "../provider-model-draft";
import { ModelPricingFields } from "./model-pricing-fields";

type Props = {
    client: HttpCosmosClient;
    model: ConfiguredModelSnapshot;
    providerName: string;
    isDefault: boolean;
    disabled: boolean;
    onRemove: () => void;
    onSaved: () => Promise<void>;
};

export function ConfiguredModelRow({ client, model, providerName, isDefault, disabled, onRemove, onSaved }: Props) {
    const [editing, setEditing] = useState(false);
    const [values, setValues] = useState(() => modelDraftFromSnapshot(model));
    const [base, setBase] = useState(model);
    const [errors, setErrors] = useState<ModelFormErrors>({});
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);
    const change = <K extends keyof ModelDraftValues>(field: K, value: ModelDraftValues[K]) => {
        setValues((previous) => ({ ...previous, [field]: value }));
        setErrors((previous) => ({ ...previous, [field]: undefined, form: undefined }));
    };
    const begin = () => {
        setBase(model); setValues(modelDraftFromSnapshot(model)); setEditing(true);
        setErrors({}); setNotice(null); setConflict(false);
    };
    const reload = async () => {
        if (!window.confirm(copy.models.reloadConfirm)) return;
        setBusy(true);
        try {
            const snapshot = await client.getConfiguredModel(model.providerId, model.id);
            setBase(snapshot); setValues(modelDraftFromSnapshot(snapshot)); setErrors({}); setConflict(false);
            setNotice(copy.models.reloaded);
            await onSaved();
        } catch { setNotice(copy.notices.unavailable); }
        finally { setBusy(false); }
    };
    const save = async () => {
        const draft = toUpdateModelCommand(base, values);
        if (!draft.ok) { setErrors(draft.errors); return; }
        setBusy(true); setNotice(null);
        try {
            const snapshot = await client.updateConfiguredModel(model.providerId, model.id, draft.command, newRequestKey());
            setBase(snapshot); setValues(modelDraftFromSnapshot(snapshot)); setEditing(false); setConflict(false);
            await onSaved();
        } catch (error) {
            const reason = error instanceof CosmosTransportError ? writeFailureNotice(error.status, error.body) : "unavailable";
            if (reason === "versionConflict") {
                setConflict(true); setNotice(copy.models.versionConflict);
            } else setNotice(copy.notices[reason]);
        } finally { setBusy(false); }
    };
    const fields = [
        ["modelId", copy.models.modelId], ["name", copy.models.name],
        ["contextWindow", copy.models.contextWindow], ["maxOutputTokens", copy.models.maxOutputTokens],
    ] as const;
    return <li className="grid gap-3 rounded-lg border border-border bg-background p-3">
        <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><ModelDetails model={model} providerName={providerName} /></div>
            <div className="flex gap-1">
                {isDefault ? <span className="self-center text-xs text-muted-foreground">{copy.models.systemDefault}</span> : null}
                <Button type="button" variant="ghost" size="icon-sm" aria-label={copy.models.editLabel(model.name)}
                    disabled={disabled || busy} onClick={begin}><Pencil className="size-3" /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`${copy.models.remove} ${model.name}`}
                    disabled={disabled || busy || isDefault} onClick={onRemove}><Trash2 className="size-3" /></Button>
            </div>
        </div>
        {editing ? <fieldset aria-label={copy.models.editLabel(model.name)} disabled={disabled || busy} className="grid gap-3 border-t border-border pt-3">
            <div className="grid gap-3 sm:grid-cols-2">{fields.map(([field, label]) => <div key={field}>
                <Label className="text-xs" htmlFor={`edit-${model.id}-${field}`}>{label}</Label>
                <Input id={`edit-${model.id}-${field}`} value={values[field]} className="h-9 text-xs" aria-invalid={errors[field] !== undefined}
                    type={field === "contextWindow" || field === "maxOutputTokens" ? "number" : "text"}
                    onChange={(event) => change(field, event.target.value)} />
                {errors[field] ? <p role="alert" className="text-xs text-destructive">{copy.errors[field]}</p> : null}
            </div>)}</div>
            <ModelPricingFields id={`edit-${model.id}`} values={values} errors={errors} disabled={disabled || busy} onChange={change} />
            {errors.form ? <p role="alert" className="text-xs text-destructive">{copy.errors.unchanged}</p> : null}
            <div className="flex gap-2"><Button type="button" size="sm" disabled={busy || conflict} onClick={() => void save()}>{copy.models.saveChanges}</Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>{copy.models.cancelEdit}</Button>
                {conflict ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void reload()}>{copy.models.reload}</Button> : null}
            </div>
        </fieldset> : null}
        {notice ? <p role="status" className="text-xs text-muted-foreground">{notice}</p> : null}
    </li>;
}
