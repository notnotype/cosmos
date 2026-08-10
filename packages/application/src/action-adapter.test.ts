import { describe, expect, it } from "vitest";

import type { SourceSnapshot } from "@cosmos/contracts";

import {
    ActionExecutionError,
    ActionRegistry,
    ConnectorExecutionError,
    IngestConnectorActionAdapter,
    type IngestConnector,
} from "./index.js";

function source(input: Partial<SourceSnapshot> = {}): SourceSnapshot {
    return {
        id: "source-1",
        name: "Fixture RSS",
        kind: "fixture-rss",
        config: {},
        enabled: true,
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
        lastRunAt: null,
        lastError: null,
        ...input,
    };
}

function item(externalId: string) {
    return {
        externalId,
        title: "Title",
        summary: null,
        contentText: "Content",
        webUrl: null,
        kind: "post" as const,
        publisher: null,
        metrics: null,
        publishedAt: null,
        sourceLocator: { provider: "fixture", id: externalId },
        rawPayload: "{}",
        assets: [],
    };
}

function stubConnector(overrides: Partial<IngestConnector> = {}): IngestConnector {
    return {
        id: "fixture-rss",
        description: "Replay a local RSS fixture deterministically.",
        configVersion: "v1",
        capabilities: ["fixture", "rss"],
        validate: () => undefined,
        async fetchItems(input) {
            return input.cursor === null
                ? { items: [item("a"), item("b")], nextCursor: "next" }
                : { items: [], nextCursor: null };
        },
        ...overrides,
    };
}

describe("IngestConnectorActionAdapter", () => {
    it("registers the connector as a connector-kind {id}.poll action", () => {
        const adapter = new IngestConnectorActionAdapter(stubConnector());

        expect(adapter.definition()).toMatchObject({
            ref: "fixture-rss.poll",
            kind: "connector",
            description: "Replay a local RSS fixture deterministically.",
            version: "v1",
            capabilities: ["fixture", "rss"],
            execution: {
                idempotent: true,
                supportsCancellation: false,
                timeoutMs: null,
                retryPolicy: null,
            },
        });
    });

    it("calls fetchItems through the registry and returns normalized items", async () => {
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(stubConnector());
        registry.register(adapter.definition(), adapter.handler());

        const output = await registry.call(
            "fixture-rss.poll",
            { source: source(), cursor: null },
            { idempotencyKey: "run-1" },
        );

        expect(output).toEqual({
            items: [item("a"), item("b")],
            nextCursor: "next",
        });
    });

    it("passes the cursor through for paged polling", async () => {
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(stubConnector());
        registry.register(adapter.definition(), adapter.handler());

        const output = await registry.call(
            "fixture-rss.poll",
            { source: source(), cursor: "next" },
            { idempotencyKey: "run-2" },
        );

        expect(output).toEqual({ items: [], nextCursor: null });
    });

    it("rejects a missing source with invalid_input", async () => {
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(stubConnector());
        registry.register(adapter.definition(), adapter.handler());

        const error = await registry.call(
            "fixture-rss.poll",
            { cursor: null },
            { idempotencyKey: "run-3" },
        ).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("invalid_input");
    });

    it("maps connector validation failures to invalid_configuration", async () => {
        const connector = stubConnector({
            validate() {
                throw new ConnectorExecutionError(
                    "invalid_configuration",
                    "bad config",
                    false,
                );
            },
        });
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(connector);
        registry.register(adapter.definition(), adapter.handler());

        const error = await registry.call(
            "fixture-rss.poll",
            { source: source(), cursor: null },
            { idempotencyKey: "run-4" },
        ).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("invalid_configuration");
        expect((error as ActionExecutionError).retryable).toBe(false);
    });

    it("maps connector execution errors preserving code and retryable", async () => {
        const connector = stubConnector({
            async fetchItems() {
                throw new ConnectorExecutionError("rate_limited", "slow down", true);
            },
        });
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(connector);
        registry.register(adapter.definition(), adapter.handler());

        const error = await registry.call(
            "fixture-rss.poll",
            { source: source(), cursor: null },
            { idempotencyKey: "run-5" },
        ).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("rate_limited");
        expect((error as ActionExecutionError).retryable).toBe(true);
    });

    it("maps connector validation failures when the handler is called directly", async () => {
        const connector = stubConnector({
            validate() {
                throw new ConnectorExecutionError(
                    "invalid_configuration",
                    "bad config",
                    false,
                );
            },
        });
        const adapter = new IngestConnectorActionAdapter(connector);

        const error = await adapter.handler()(
            { source: source(), cursor: null },
            { idempotencyKey: "run-6" },
        ).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("invalid_configuration");
        expect((error as ActionExecutionError).retryable).toBe(false);
    });

    it("describes the registered action through the registry", () => {
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(stubConnector());
        registry.register(adapter.definition(), adapter.handler());

        expect(registry.descriptors()).toEqual([{
            ref: "fixture-rss.poll",
            kind: "connector",
            description: "Replay a local RSS fixture deterministically.",
            version: "v1",
            capabilities: ["fixture", "rss"],
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        }]);
    });
});
