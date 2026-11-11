import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { messages } from "@/copy/messages";
const copy = messages.models;
import type { ModelDraftValues, ModelFormErrors } from "../provider-model-draft";

const baseFields = [
    ["inputPricePerMillion", copy.pricing.inputPricePerMillion],
    ["outputPricePerMillion", copy.pricing.outputPricePerMillion],
    ["cacheWritePricePerMillion", copy.pricing.cacheWritePricePerMillion],
    ["cacheReadPricePerMillion", copy.pricing.cacheReadPricePerMillion],
] as const;
const highFields = [
    ["highInputPricePerMillion", copy.pricing.highInputPricePerMillion],
    ["highOutputPricePerMillion", copy.pricing.highOutputPricePerMillion],
    ["highCacheWritePricePerMillion", copy.pricing.highCacheWritePricePerMillion],
    ["highCacheReadPricePerMillion", copy.pricing.highCacheReadPricePerMillion],
] as const;

type Props = {
    id: string;
    values: ModelDraftValues;
    errors: ModelFormErrors;
    disabled: boolean;
    onChange: <K extends keyof ModelDraftValues>(field: K, value: ModelDraftValues[K]) => void;
};

export function ModelPricingFields({ id, values, errors, disabled, onChange }: Props) {
    const priceField = ([field, label]: (typeof baseFields)[number] | (typeof highFields)[number]) => (
        <div key={field}>
            <Label htmlFor={`${id}-${field}`} className="text-xs">{label}</Label>
            <Input id={`${id}-${field}`} type="number" min="0" step="any" required value={values[field]}
                onChange={(event) => onChange(field, event.target.value)} disabled={disabled}
                aria-invalid={errors[field] !== undefined} className={cn("h-9 text-xs", errors[field] && "border-destructive")} />
            {errors[field] && <p role="alert" className="mt-1 text-xs text-destructive">{copy.errors[field]}</p>}
        </div>
    );
    return (
        <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-3">
                <div><Label htmlFor={`${id}-currency`} className="text-xs">{copy.pricing.currency}</Label>
                    <select id={`${id}-currency`} value={values.currency} disabled={disabled}
                        onChange={(event) => onChange("currency", event.target.value === "CNY" ? "CNY" : "USD")}
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="USD">USD</option><option value="CNY">CNY</option>
                    </select>
                </div>
                <p className="text-xs text-muted-foreground">{copy.pricing.unitHint(values.currency)}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{baseFields.map(priceField)}</div>
            <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={values.tieredPricingEnabled} disabled={disabled}
                    onChange={(event) => onChange("tieredPricingEnabled", event.target.checked)} />{copy.pricing.enableTier}
            </label>
            {values.tieredPricingEnabled ? <div className="grid gap-3 rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">{copy.pricing.tierRule}</p>
                <div><Label htmlFor={`${id}-threshold`} className="text-xs">{copy.pricing.threshold}</Label>
                    <Input id={`${id}-threshold`} type="number" min="1" step="1" required value={values.tieredPricingThreshold}
                        disabled={disabled} onChange={(event) => onChange("tieredPricingThreshold", event.target.value)}
                        aria-invalid={errors.tieredPricingThreshold !== undefined} className="h-9 text-xs" />
                    {errors.tieredPricingThreshold && <p role="alert" className="text-xs text-destructive">{copy.errors.tieredPricingThreshold}</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">{highFields.map(priceField)}</div>
            </div> : null}
        </div>
    );
}
