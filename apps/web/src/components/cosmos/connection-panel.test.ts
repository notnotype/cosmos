import { describe, expect, it } from "vitest";

import type { ConnectionInstance } from "@cosmos/contracts";

import { externalConnections, isExternalConnector } from "./connection-panel";

function connection(connectorId: string): ConnectionInstance {
    return {
        id: `connection-${connectorId}`,
        name: connectorId,
        connectorId,
        account: null,
        scopeJson: null,
        configJson: null,
        status: "active",
        secretRef: null,
        lastError: null,
        lastCheckedAt: null,
        modelId: null,
        version: 1,
        createdAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-20T00:00:00.000Z",
    };
}

describe("external connector boundary", () => {
    it("rejects the deprecated model connector even with surrounding whitespace", () => {
        expect(isExternalConnector("cosmos.agent")).toBe(false);
        expect(isExternalConnector("  cosmos.agent  ")).toBe(false);
    });

    it("keeps external extensions and the existing blank connector default available", () => {
        for (const connectorId of ["bilibili", "rss", "imap", "custom-platform", ""]) {
            expect(isExternalConnector(connectorId)).toBe(true);
        }
    });
});

describe("external platform connection list", () => {
    it("omits deprecated model connections while preserving external platforms in order", () => {
        const bilibili = connection("bilibili");
        const rss = connection("rss");
        const imap = connection("imap");
        const legacy = { ...connection("cosmos.agent"), modelId: "model-1" };
        const list = [bilibili, legacy, rss, connection("cosmos.agent"), imap];

        expect(externalConnections(list)).toEqual([bilibili, rss, imap]);
        expect(list).toHaveLength(5);
    });

    it("treats a legacy-only response as an empty connection list", () => {
        expect(externalConnections([connection("cosmos.agent")])).toEqual([]);
        expect(externalConnections([])).toEqual([]);
    });
});
