import type { StoryAgentGeneration } from "@cosmos/contracts";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { messages } from "@/copy/messages";
import { storyAgentErrorCopy } from "./story-agent-error";

const copy = messages.reading.candidates;

export function StoryAgentGenerationNotice({
    generation,
    canRecover,
    recovering,
    onRecover,
}: {
    generation: StoryAgentGeneration;
    canRecover: boolean;
    recovering: boolean;
    onRecover: () => void;
}) {
    if (generation.status !== "failed") {
        return <p role="status" className="text-sm [overflow-wrap:anywhere]">{copy.generationStatuses[generation.status]}</p>;
    }
    return <StoryAgentFailure
        errorCode={generation.errorCode}
        canRecover={canRecover}
        recovering={recovering}
        onRecover={onRecover}
    />;
}

type StoryAgentFailureProps = {
    errorCode: unknown;
    canRecover: boolean;
    recovering: boolean;
    onRecover: () => void;
};

export function StoryAgentFailure({ errorCode, canRecover, recovering, onRecover }: StoryAgentFailureProps) {
    return <div role="alert" className="space-y-2 text-sm">
        <p>{storyAgentErrorCopy(errorCode)}</p>
        <Link className="underline underline-offset-2" href="/settings#story-agent-settings">{copy.timeoutSettings}</Link>
        {canRecover && <Button variant="outline" size="sm" disabled={recovering} onClick={onRecover}>{copy.recover}</Button>}
    </div>;
}
