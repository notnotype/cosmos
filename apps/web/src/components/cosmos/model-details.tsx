import type { ConfiguredModelSnapshot } from "@cosmos/contracts";
import { messages } from "@/copy/messages";

const copy = messages.pages.settings.defaultModel;

export function ModelDetails({ model, providerName }: { model: ConfiguredModelSnapshot; providerName: string }) {
    return (
        <div className="flex min-w-0 flex-col gap-2 rounded border border-border p-3 text-[12px] [overflow-wrap:anywhere]">
            <p className="text-[13px] font-medium">{model.name} <span className="font-normal text-muted-foreground">{model.modelId}</span></p>
            <dl className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
                <div><dt className="inline">{copy.provider}：</dt><dd className="inline">{providerName}</dd></div>
                <div><dt className="inline">{copy.contextWindow}：</dt><dd className="inline">{model.contextWindow.toLocaleString()} tokens</dd></div>
                <div><dt className="inline">{copy.outputLimit}：</dt><dd className="inline">{model.maxOutputTokens.toLocaleString()} tokens</dd></div>
                {model.inputPricePerMillion !== undefined && <div><dt className="inline">{copy.inputPrice}：</dt><dd className="inline">${model.inputPricePerMillion} {copy.priceUnit}</dd></div>}
                {model.outputPricePerMillion !== undefined && <div><dt className="inline">{copy.outputPrice}：</dt><dd className="inline">${model.outputPricePerMillion} {copy.priceUnit}</dd></div>}
            </dl>
            {model.inputPricePerMillion === undefined && model.outputPricePerMillion === undefined && (
                <p className="text-muted-foreground">{copy.unknownPrice}</p>
            )}
            <details className="text-muted-foreground">
                <summary className="cursor-pointer">{copy.metadata}</summary>
                <dl className="mt-1 grid gap-1">
                    <div><dt className="inline">{copy.version}：</dt><dd className="inline">{model.version}</dd></div>
                    <div><dt className="inline">{copy.createdAt}：</dt><dd className="inline"><time dateTime={model.createdAt}>{model.createdAt}</time></dd></div>
                    <div><dt className="inline">{copy.updatedAt}：</dt><dd className="inline"><time dateTime={model.updatedAt}>{model.updatedAt}</time></dd></div>
                </dl>
            </details>
        </div>
    );
}
