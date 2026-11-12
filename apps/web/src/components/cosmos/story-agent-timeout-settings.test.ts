import { describe, expect, it, vi } from "vitest";

import { saveStoryAgentTimeout, storyAgentTimeoutSeconds, STORY_AGENT_TIMEOUT_DEFAULT, STORY_AGENT_TIMEOUT_MAX, STORY_AGENT_TIMEOUT_MIN } from "./story-agent-timeout-settings";

describe("Story Agent timeout settings", () => {
    it("uses 300 seconds when the server value is absent or invalid", () => {
        expect(storyAgentTimeoutSeconds(undefined)).toBe(300);
        expect(storyAgentTimeoutSeconds(0)).toBe(300);
        expect(storyAgentTimeoutSeconds(30.5)).toBe(300);
        expect(storyAgentTimeoutSeconds(STORY_AGENT_TIMEOUT_DEFAULT)).toBe(300);
    });

    it.each([29, 1801, -1, 30.5])("rejects out-of-range timeout %s without sending a write", async (value) => {
        const updateSystemConfig = vi.fn();
        await expect(saveStoryAgentTimeout({ updateSystemConfig }, value)).rejects.toThrow("30 到 1800 秒");
        expect(updateSystemConfig).not.toHaveBeenCalled();
    });

    it.each([STORY_AGENT_TIMEOUT_MIN, 300, STORY_AGENT_TIMEOUT_MAX])("saves valid %s as a single-field update", async (seconds) => {
        const updateSystemConfig = vi.fn(async () => ({ storyAgentTimeoutSeconds: seconds }));
        await expect(saveStoryAgentTimeout({ updateSystemConfig }, seconds)).resolves.toBe(seconds);
        expect(updateSystemConfig).toHaveBeenCalledExactlyOnceWith({ storyAgentTimeoutSeconds: seconds });
    });
});
