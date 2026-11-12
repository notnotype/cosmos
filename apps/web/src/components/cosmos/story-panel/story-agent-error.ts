import { messages } from "@/copy/messages";

const copy = messages.reading.candidates;

export function storyAgentErrorCopy(errorCode: unknown): string {
    switch (errorCode) {
        case "timeout":
            return copy.generationErrors.timeout;
        case "authentication_required":
            return copy.generationErrors.authentication_required;
        case "rate_limited":
            return copy.generationErrors.rate_limited;
        case "budget_exhausted":
            return copy.generationErrors.budget_exhausted;
        case "invalid_configuration":
            return copy.generationErrors.invalid_configuration;
        case "dependency_unavailable":
            return copy.generationErrors.dependency_unavailable;
        case "malformed_payload":
            return copy.generationErrors.malformed_payload;
        default:
            return copy.generationFailed;
    }
}
