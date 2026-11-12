import { messages } from "@/copy/messages";

export const STORY_AGENT_TIMEOUT_DEFAULT = 300;
export const STORY_AGENT_TIMEOUT_MIN = 30;
export const STORY_AGENT_TIMEOUT_MAX = 1800;

export type StoryAgentTimeoutUpdate = { storyAgentTimeoutSeconds: number };
export type StoryAgentTimeoutClient = {
    getSystemConfig: () => Promise<{ storyAgentTimeoutSeconds?: number }>;
    updateSystemConfig: (input: StoryAgentTimeoutUpdate) => Promise<{ storyAgentTimeoutSeconds?: number }>;
};

export function storyAgentTimeoutSeconds(value: number | null | undefined): number {
    return Number.isInteger(value) && value! >= STORY_AGENT_TIMEOUT_MIN && value! <= STORY_AGENT_TIMEOUT_MAX
        ? value!
        : STORY_AGENT_TIMEOUT_DEFAULT;
}

export async function saveStoryAgentTimeout(client: Pick<StoryAgentTimeoutClient, "updateSystemConfig">, seconds: number) {
    if (!Number.isInteger(seconds) || seconds < STORY_AGENT_TIMEOUT_MIN || seconds > STORY_AGENT_TIMEOUT_MAX) {
        throw new Error(messages.pages.settings.storyAgentTimeout.invalid);
    }
    const result = await client.updateSystemConfig({ storyAgentTimeoutSeconds: seconds });
    return storyAgentTimeoutSeconds(result.storyAgentTimeoutSeconds ?? seconds);
}
