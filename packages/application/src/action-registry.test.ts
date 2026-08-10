import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ActionDefinition } from "@cosmos/contracts";

import { ActionExecutionError, ActionRegistry, ConnectorExecutionError } from "./index.js";

function definition(input: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        ref: "demo.echo",
        kind: "transform",
        description: "Echo input.",
        version: "v1",
        capabilities: [],
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ echoed: z.string() }),
        execution: {
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        },
        ...input,
    };
}

describe("ActionRegistry", () => {
    it("registers, resolves and lists actions", () => {
        const registry = new ActionRegistry();
        const def = definition();
        const handler = async () => ({ echoed: "hi" });

        registry.register(def, handler);

        expect(registry.resolve("demo.echo")).toEqual({ definition: def, handler });
        expect(registry.descriptors()).toEqual([{
            ref: "demo.echo",
            kind: "transform",
            description: "Echo input.",
            version: "v1",
            capabilities: [],
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        }]);
    });

    it("rejects duplicate action refs", () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => ({}));

        expect(() => registry.register(definition(), async () => ({}))).toThrow(
            /Duplicate action ref/,
        );
    });

    it("throws unknown_action for an unregistered ref", () => {
        const registry = new ActionRegistry();

        expect(() => registry.resolve("missing.action")).toThrowError(
            new ActionExecutionError("unknown_action", "Unknown action ref: missing.action", false),
        );
    });

    it("validates input and returns the parsed output", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async (input) => ({ echoed: (input as { value: string }).value }));

        await expect(registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" }))
            .resolves.toEqual({ echoed: "ok" });
    });

    it("rejects invalid input with invalid_input and retryable=false", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => ({ echoed: "" }));

        const error = await registry.call("demo.echo", { value: 42 }, { idempotencyKey: "k" })
            .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("invalid_input");
        expect((error as ActionExecutionError).retryable).toBe(false);
    });

    it("rejects malformed output with malformed_payload", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => ({ unexpected: true }));

        const error = await registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" })
            .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("malformed_payload");
    });

    it("passes through ActionExecutionError thrown by the handler", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => {
            throw new ActionExecutionError("rate_limited", "slow down", true);
        });

        await expect(registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" }))
            .rejects.toEqual(new ActionExecutionError("rate_limited", "slow down", true));
    });

    it("wraps unexpected handler errors as internal_error", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => {
            throw new Error("boom");
        });

        const error = await registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" })
            .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("internal_error");
        expect((error as ActionExecutionError).retryable).toBe(false);
    });

    it("wraps non-Error handler throws as internal_error", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => {
            throw "boom";
        });

        const error = await registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" })
            .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("internal_error");
        expect((error as ActionExecutionError).retryable).toBe(false);
    });

    it("rejects with unknown_action for an unregistered ref", async () => {
        const registry = new ActionRegistry();

        await expect(registry.call("missing.action", {}, { idempotencyKey: "k" }))
            .rejects.toEqual(
                new ActionExecutionError("unknown_action", "Unknown action ref: missing.action", false),
            );
    });

    it("maps ConnectorExecutionError preserving code and retryable", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => {
            throw new ConnectorExecutionError("rate_limited", "slow down", true);
        });

        const error = await registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" })
            .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("rate_limited");
        expect((error as ActionExecutionError).message).toBe("slow down");
        expect((error as ActionExecutionError).retryable).toBe(true);
    });
});
