import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { artifactRoot, selectExpiredArtifacts } from "./test-artifacts.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

describe("test artifact cleanup", () => {
    it("selects only the roots at or beyond the retention window", () => {
        const now = Date.UTC(2026, 10, 16, 12);
        const entries = [
            { name: "expired", mtimeMs: now - 8 * DAY_MS },
            // 边界含等号：mtime 正好等于窗口时也回收，避免"差一分钟永远不删"。
            { name: "exactly-at-window", mtimeMs: now - 7 * DAY_MS },
            { name: "fresh", mtimeMs: now - 1 * DAY_MS },
        ];

        expect(selectExpiredArtifacts(entries, now, 7 * DAY_MS).map((entry) => entry.name))
            .toEqual(["expired", "exactly-at-window"]);
    });

    it("keeps every root when none is old enough", () => {
        expect(selectExpiredArtifacts([{ name: "fresh", mtimeMs: 999 }], 1_000, 7 * DAY_MS)).toEqual([]);
        expect(selectExpiredArtifacts([], 1_000, 7 * DAY_MS)).toEqual([]);
    });

    it("only ever targets the repository's .agent/tmp", () => {
        expect(artifactRoot(join("repo"))).toBe(join("repo", ".agent", "tmp"));
    });
});
