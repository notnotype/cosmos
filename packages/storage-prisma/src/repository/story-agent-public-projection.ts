const publicFailureMessages: Record<string, string> = {
    timeout: "Story Agent generation timed out.",
    authentication_required: "Story Agent requires an active provider credential.",
    rate_limited: "Story Agent provider is rate limited.",
    budget_exhausted: "Story Agent request exceeded its budget.",
    invalid_configuration: "Story Agent configuration is invalid.",
    dependency_unavailable: "Story Agent dependency is unavailable.",
    malformed_payload: "Story Agent returned an invalid proposal.",
    generation_failed: "Story Agent generation failed.",
};

export type StoryAgentPublicFailureCode = keyof typeof publicFailureMessages;
const publicFailureCodeSet = new Set<string>(Object.keys(publicFailureMessages));

export function storyAgentPublicFailure(errorCode: string | null): {
    errorCode: StoryAgentPublicFailureCode;
    message: string;
} {
    const safeCode = errorCode !== null && publicFailureCodeSet.has(errorCode)
        ? errorCode as StoryAgentPublicFailureCode
        : "generation_failed";
    return { errorCode: safeCode, message: publicFailureMessages[safeCode] };
}

export function projectOrphanWorkflowActivityFailure(input: {
    status: string;
}): { errorCode: string | null; error: string | null } {
    if (input.status === "cancelled") return { errorCode: null, error: null };
    if (input.status === "failed_terminal") {
        return { errorCode: "generation_failed", error: "Workflow activity failed." };
    }
    return { errorCode: null, error: null };
}

export function projectStoryAgentJobFailure(input: {
    status: string;
    errorCode: string | null;
    error: string | null;
}): { errorCode: string | null; error: string | null } {
    if (input.status === "cancelled") return { errorCode: null, error: null };
    if (input.status !== "failed_terminal" && input.errorCode === null && input.error === null) {
        return { errorCode: null, error: null };
    }
    const failure = storyAgentPublicFailure(input.errorCode);
    return { errorCode: failure.errorCode, error: failure.message };
}
