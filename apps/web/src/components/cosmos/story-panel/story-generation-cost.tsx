import type { AgentInvocationOutput, ConfiguredModelSnapshot } from "@cosmos/contracts";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { messages } from "@/copy/messages";

const copy = messages.reading.candidates.cost;
const assumptions = (inputMin: number, inputMax: number, outputMin: number, outputMax: number) =>
    `${copy.assumptions(inputMin, inputMax, outputMin, outputMax)} ${copy.noCacheAssumption}`;
const amount = (value: number) => {
    if (value > 0 && value < 0.00000001) return "<0.00000001";
    return value.toFixed(8).replace(/\.?0+$/, "") || "0";
};

export function estimateStoryGenerationCost(model: ConfiguredModelSnapshot) {
    const validPrice = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value >= 0;
    const basePrices = [model.inputPricePerMillion, model.outputPricePerMillion];
    if (!basePrices.every(validPrice) || !Number.isSafeInteger(model.contextWindow) || model.contextWindow < 2
        || !Number.isSafeInteger(model.maxOutputTokens) || model.maxOutputTokens < 1
        || (model.currency !== undefined && model.currency !== "USD" && model.currency !== "CNY")) return null;
    if (model.tieredPricingEnabled && (!Number.isSafeInteger(model.tieredPricingThreshold) || (model.tieredPricingThreshold ?? 0) < 1
        || ![model.highInputPricePerMillion, model.highOutputPricePerMillion, model.highCacheWritePricePerMillion, model.highCacheReadPricePerMillion].every(validPrice))) return null;
    // These are rough text-only scenarios, not tokenization or a bound on the eventual bill.
    const outputMax = Math.min(1024, model.maxOutputTokens, model.contextWindow - 1);
    const outputMin = Math.min(256, outputMax);
    const inputMax = Math.min(4000, model.contextWindow - outputMax);
    const inputMin = Math.min(1000, inputMax);
    const endpointCost = (input: number, output: number) => {
        const high = model.tieredPricingEnabled && input > (model.tieredPricingThreshold ?? Infinity);
        const inputPrice = high ? model.highInputPricePerMillion : model.inputPricePerMillion;
        const outputPrice = high ? model.highOutputPricePerMillion : model.outputPricePerMillion;
        return (input * (inputPrice ?? 0) + output * (outputPrice ?? 0)) / 1_000_000;
    };
    return {
        inputMin, inputMax, outputMin, outputMax,
        minimum: endpointCost(inputMin, outputMin),
        maximum: endpointCost(inputMax, outputMax),
    };
}

export function StoryGenerationEstimate({ model, loading = false, failed = false, explicit = false, defaultModelId, onRefresh }: {
    model: ConfiguredModelSnapshot | null; loading?: boolean; failed?: boolean; explicit?: boolean;
    defaultModelId?: string | null; onRefresh?: () => void;
}) {
    const actions = <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link className="underline underline-offset-2" href="/settings">{copy.settings}</Link>
        {onRefresh && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={loading} onClick={onRefresh}>{copy.refresh}</Button>}
    </div>;
    if (loading) return <div className="space-y-2"><p role="status" className="text-xs text-muted-foreground">{copy.loading}</p>{actions}</div>;
    if (failed) return <div className="space-y-2"><p role="alert" className="text-xs text-muted-foreground">{copy.failed}</p>{actions}</div>;
    if (defaultModelId != null && model?.id !== defaultModelId) return <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{copy.unavailableDefault}</p>{actions}
    </div>;
    if (!model) return <div className="space-y-2"><p className="text-xs text-muted-foreground">{copy.noDefault}</p>{actions}</div>;
    const estimate = estimateStoryGenerationCost(model);
    return <div className="space-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        <p>{explicit ? copy.explicitModel : copy.defaultModel}：{model.name} · {model.modelId}</p>
        {estimate ? <>
            <p>{copy.estimated}：{model.currency ?? "USD"} {amount(estimate.minimum)} – {amount(estimate.maximum)}</p>
            <p>{assumptions(estimate.inputMin, estimate.inputMax, estimate.outputMin, estimate.outputMax)}</p>
        </> : <p>{copy.unavailable}</p>}
    </div>;
}

export function StoryGenerationActualCost({ cost }: { cost?: AgentInvocationOutput["cost"] }) {
    if (!cost) return null;
    return <div className="space-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        <p>{copy.actual}：{amount(cost.total)} {cost.currency}（{copy.input}：{amount(cost.input)}，{copy.output}：{amount(cost.output)}{cost.cacheWrite !== undefined ? copy.cacheWriteAmount(amount(cost.cacheWrite)) : ""}{cost.cacheRead !== undefined ? copy.cacheReadAmount(amount(cost.cacheRead)) : ""}）</p>
        <p>{copy.actualBasis}</p>
    </div>;
}
