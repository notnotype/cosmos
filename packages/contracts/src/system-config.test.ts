import { describe, expect, it } from "vitest";
import { systemConfigDtoSchema, updateSystemConfigCommandSchema } from "./index.js";

describe("system config contracts", () => {
    it("accepts a configured model ID or an explicit null", () => {
        for (const defaultModelId of ["model-a", "x".repeat(200), null]) {
            expect(updateSystemConfigCommandSchema.parse({ defaultModelId })).toEqual({ defaultModelId });
        }
        expect(systemConfigDtoSchema.parse({ defaultModelId: null, defaultModel: null }))
            .toEqual({ defaultModelId: null, defaultModel: null });
    });

    it.each([undefined, null, [], {}, { modelId: "model-a" }, { defaultModelId: 42 },
        { defaultModelId: "" }, { defaultModelId: " " }, { defaultModelId: " model-a " },
        { defaultModelId: "a\u0000b" }, { defaultModelId: "x".repeat(201) },
        { defaultModelId: null, unexpected: true },
    ])("rejects malformed commands %#", (value) => {
        expect(updateSystemConfigCommandSchema.safeParse(value).success).toBe(false);
    });

    it("requires both fields and a valid model snapshot", () => {
        for (const value of [{}, { defaultModelId: null }, { defaultModelId: "model-a", defaultModel: {} }]) {
            expect(systemConfigDtoSchema.safeParse(value).success).toBe(false);
        }
    });
});
