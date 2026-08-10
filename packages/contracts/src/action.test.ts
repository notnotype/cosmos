import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
    actionDefinitionSchema,
    actionDescriptorSchema,
    actionErrorCodeSchema,
    actionKindSchema,
    actionRefSchema,
} from "./index.js";

describe("action contracts", () => {
    it("accepts valid {namespace}.{verb} action refs", () => {
        for (const ref of ["rss.poll", "http.fetch", "agent.run", "artifact.publish"]) {
            expect(actionRefSchema.parse(ref)).toBe(ref);
        }
    });

    it("rejects malformed action refs", () => {
        for (const ref of ["rss", "Rss.poll", "rss.poll.extra", "rss..poll", "rss.pol l", "-rss.poll"]) {
            expect(() => actionRefSchema.parse(ref)).toThrow();
        }
    });

    it("covers the ten action kinds from the architecture", () => {
        expect(actionKindSchema.options).toEqual([
            "connector", "transform", "library", "query", "control",
            "script", "agent", "artifact", "render", "delivery",
        ]);
    });

    it("covers the connector error codes and the new registry errors", () => {
        expect(actionErrorCodeSchema.options).toEqual([
            "dependency_unavailable", "authentication_required", "timeout",
            "rate_limited", "malformed_payload", "unsupported_version",
            "invalid_configuration", "invalid_input", "unknown_action",
            "internal_error",
        ]);
    });

    it("accepts a full definition with declared execution contract", () => {
        const inputSchema = z.object({ cursor: z.string().nullable() });
        const outputSchema = z.object({ items: z.array(z.unknown()) });

        const definition = actionDefinitionSchema.parse({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: ["source:rss.read"],
            inputSchema,
            outputSchema,
            execution: {
                idempotent: true,
                supportsCancellation: false,
                timeoutMs: null,
                retryPolicy: null,
            },
        });

        expect(definition.execution).toEqual({
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        });
    });

    it("accepts a declared retry policy with retryable error codes", () => {
        expect(actionDefinitionSchema.parse({
            ref: "http.fetch",
            kind: "connector",
            description: "Fetch a URL.",
            version: "v1",
            capabilities: ["network:http"],
            inputSchema: z.unknown(),
            outputSchema: z.unknown(),
            execution: {
                idempotent: false,
                supportsCancellation: true,
                timeoutMs: 30_000,
                retryPolicy: {
                    maxAttempts: 3,
                    backoffMs: 1_000,
                    retryableErrors: ["timeout", "rate_limited"],
                },
            },
        })).toMatchObject({ ref: "http.fetch" });
    });

    it("requires the execution contract fields", () => {
        expect(() => actionDefinitionSchema.parse({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: [],
            inputSchema: z.unknown(),
            outputSchema: z.unknown(),
        })).toThrow();
    });

    it("rejects inputSchema values that are not zod schemas", () => {
        expect(() => actionDefinitionSchema.parse({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: [],
            inputSchema: { not: "a schema" },
            outputSchema: z.unknown(),
            execution: {
                idempotent: true,
                supportsCancellation: false,
                timeoutMs: null,
                retryPolicy: null,
            },
        })).toThrow();
    });

    it("serializes a descriptor without schema objects", () => {
        const descriptor = actionDescriptorSchema.parse({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: ["source:rss.read"],
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        });

        expect(descriptor).toEqual({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: ["source:rss.read"],
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        });
    });
});
