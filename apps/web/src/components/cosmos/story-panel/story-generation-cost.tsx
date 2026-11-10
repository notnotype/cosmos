import type { AgentInvocationOutput, ConfiguredModelSnapshot } from "@cosmos/contracts";
import { messages } from "@/copy/messages";

const copy = messages.reading.candidates.cost;
const amount = (value: number) => value.toFixed(8).replace(/\.?0+$/, "") || "0";

export function estimateStoryGenerationCost(model: ConfiguredModelSnapshot) {
    const inputPrice = model.inputPricePerMillion;
    const outputPrice = model.outputPricePerMillion;
    if (inputPrice === undefined || outputPrice === undefined || model.contextWindow < 2) return null;
    // These are rough text-only scenarios, not tokenization or a bound on the eventual bill.
    const outputMax = Math.min(1024, model.maxOutputTokens, model.contextWindow - 1);
    const outputMin = Math.min(256, outputMax);
    const inputMax = Math.min(4000, model.contextWindow - outputMax);
    const inputMin = Math.min(1000, inputMax);
    return {
        inputMin, inputMax, outputMin, outputMax,
        minimum: (inputMin * inputPrice + outputMin * outputPrice) / 1_000_000,
        maximum: (inputMax * inputPrice + outputMax * outputPrice) / 1_000_000,
    };
}

export function StoryGenerationEstimate({ model, loading = false, failed = false, explicit = false }: {
    model: ConfiguredModelSnapshot | null; loading?: boolean; failed?: boolean; explicit?: boolean;
}) {
    if (loading) return <p role="status" className="text-xs text-muted-foreground">{copy.loading}</p>;
    if (failed) return <p className="text-xs text-muted-foreground">{copy.failed}</p>;
    if (!model) return <p className="text-xs text-muted-foreground">{copy.noDefault}</p>;
    const estimate = estimateStoryGenerationCost(model);
    return <div className="space-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        <p>{explicit ? copy.explicitModel : copy.defaultModel}：{model.name} · {model.modelId}</p>
        {estimate ? <>
            <p>{copy.estimated}：USD {amount(estimate.minimum)} – {amount(estimate.maximum)}</p>
            <p>{copy.assumptions(estimate.inputMin, estimate.inputMax, estimate.outputMin, estimate.outputMax)}</p>
        </> : <p>{copy.unavailable}</p>}
    </div>;
}

export function StoryGenerationActualCost({ cost }: { cost?: AgentInvocationOutput["cost"] }) {
    if (!cost) return null;
    return <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {copy.actual}：{amount(cost.total)} {cost.currency}（{copy.input}：{amount(cost.input)}，{copy.output}：{amount(cost.output)}）
    </p>;
}
