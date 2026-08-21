import {Play} from "lucide-react";

import type {SourceSnapshot} from "@cosmos/contracts";

import {Button} from "@/components/ui/button";

type SourceActionsProps = {
    onRun: (source: SourceSnapshot) => Promise<void>;
    sources: readonly SourceSnapshot[];
};

export function SourceActions({onRun, sources}: SourceActionsProps) {
    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold">来源与录入</h2>
                    <p className="text-sm text-muted-foreground">
                        {sources.length === 0 ? "创建第一个 fixture 来源。" : "选择来源执行一次手动录入。"}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {sources.map((source) => (
                        <Button
                            key={source.id}
                            size="sm"
                            variant="outline"
                            disabled={!source.enabled}
                            onClick={() => void onRun(source)}
                        >
                            <Play data-icon="inline-start" />
                            {source.name}
                        </Button>
                    ))}
                </div>
            </div>
        </section>
    );
}
