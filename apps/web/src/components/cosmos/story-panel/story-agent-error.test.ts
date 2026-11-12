import { describe, expect, it } from "vitest";

import { storyAgentErrorCopy } from "./story-agent-error";

describe("Story Agent error copy", () => {
    it.each([
        ["timeout", "时限"],
        ["authentication_required", "凭证"],
        ["rate_limited", "稍后"],
        ["budget_exhausted", "预算"],
        ["invalid_configuration", "配置"],
        ["dependency_unavailable", "不可用"],
        ["malformed_payload", "结果"],
    ])("maps %s to safe recovery guidance", (code, expected) => {
        const message = storyAgentErrorCopy(code);
        expect(message).toContain(expected);
        expect(message).not.toContain(code);
        expect(message).not.toContain("provider_secret");
        expect(message).not.toContain("internal");
    });

    it.each(["generation_failed", null, undefined, "provider_secret_dump"])("uses generic Chinese recovery guidance for %s", (code) => {
        expect(storyAgentErrorCopy(code)).toBe("生成未能完成，请检查设置或稍后重试。");
    });
});
