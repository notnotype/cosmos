import { expect, it } from "vitest";
import { boundedJsonByteLength } from "./content-input-budget.js";

it("counts JSON UTF-8 exactly, including control escapes, surrogate pairs and omitted properties", () => {
    const values: unknown[] = [
        null, false, true, 123, -1.5, Infinity,
        "a\"\\\b\t\n\f\r\u0000界😀\ud800\udc00\ud800x\udc00",
        { text: "界😀", absent: undefined, nested: [{ data: "\u0000" }, undefined, null] },
        Array.from({ length: 100 }, (_, index) => ({ [String(index)]: "x".repeat(index) })),
    ];
    for (const value of values) {
        const expected = new TextEncoder().encode(JSON.stringify(value)).byteLength;
        expect(boundedJsonByteLength(value, expected)).toBe(expected);
        expect(boundedJsonByteLength(value, expected - 1)).toBeNull();
    }
});

it("stops oversized strings and rejects pathological node/depth input without recursion overflow", () => {
    expect(boundedJsonByteLength("界".repeat(1_000_000), 10)).toBeNull();
    expect(boundedJsonByteLength(Array.from({ length: 50_001 }, () => null), 1_048_576)).toBeNull();
    let nested: unknown = null;
    for (let depth = 0; depth < 1_000; depth++) nested = [nested];
    expect(boundedJsonByteLength(nested, 1_048_576)).toBeNull();
});
