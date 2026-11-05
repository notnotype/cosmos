import { describe, expect, it } from "vitest";
import {
    containsDangerousHtml,
    countBlockTypes,
    evaluateIngestGate,
} from "./real-source-ingest-gate.js";

const expectations = {
    minItemCount: 5,
    minImageRichItems: 2,
    minMediaDownloadRate: 0.8,
    maxFailedRepresentationRate: 0.2,
};

const passingStats = {
    itemCount: 10,
    imageRichItems: 3,
    mediaDownloadRate: 0.9,
    completeCount: 7,
    partialCount: 2,
    failedCount: 1,
    totalBlocks: 12,
};

describe("containsDangerousHtml", () => {
    it("returns false for plain text", () => {
        expect(containsDangerousHtml("A regular article paragraph.")).toBe(false);
    });

    it("detects script tags", () => {
        expect(containsDangerousHtml("<script>alert(1)</script>")).toBe(true);
    });

    it("detects iframe tags", () => {
        expect(containsDangerousHtml("<iframe src=\"https://example.com\"></iframe>")).toBe(true);
    });

    it("detects javascript URLs", () => {
        expect(containsDangerousHtml("javascript:alert(1)")).toBe(true);
    });

    it("detects case-insensitive tag variants", () => {
        expect(containsDangerousHtml("<SCRIPT>alert(1)</SCRIPT>")).toBe(true);
    });

    it("detects dangerous strings nested in arrays and objects", () => {
        expect(containsDangerousHtml({ content: [{ nested: ["safe", "<iframe>"] }] })).toBe(true);
    });

    it("returns false for safe nested structures", () => {
        expect(containsDangerousHtml({ content: [{ nested: ["plain text", 4, null] }] })).toBe(false);
    });

    it.each([null, 42, true, false])("returns false for non-string scalar %s", (value) => {
        expect(containsDangerousHtml(value)).toBe(false);
    });
});

describe("countBlockTypes", () => {
    it("keeps counts unchanged for an empty array", () => {
        const counts = { text: 0, image: 0 };
        countBlockTypes([], counts);
        expect(counts).toEqual({ text: 0, image: 0 });
    });

    it("counts a text block", () => {
        const counts = { text: 0, image: 0 };
        countBlockTypes([{ type: "text" }], counts);
        expect(counts).toEqual({ text: 1, image: 0 });
    });

    it("counts an image block", () => {
        const counts = { text: 0, image: 0 };
        countBlockTypes([{ type: "image" }], counts);
        expect(counts).toEqual({ text: 0, image: 1 });
    });

    it("accumulates mixed block types", () => {
        const counts = { text: 0, image: 0 };
        countBlockTypes([{ type: "text" }, { type: "image" }, { type: "text" }], counts);
        expect(counts).toEqual({ text: 2, image: 1 });
    });

    it("finds blocks nested inside other fields", () => {
        const counts = { text: 0, image: 0 };
        countBlockTypes({ wrapper: { children: [{ type: "text" }, { media: { type: "image" } }] } }, counts);
        expect(counts).toEqual({ text: 1, image: 1 });
    });
});

describe("evaluateIngestGate", () => {
    it("passes when every acceptance condition is met", () => {
        expect(evaluateIngestGate(passingStats, expectations)).toBe(true);
    });

    it("fails when item count is below the minimum", () => {
        expect(evaluateIngestGate({ ...passingStats, itemCount: 4 }, expectations)).toBe(false);
    });

    it("fails when image-rich item count is below the minimum", () => {
        expect(evaluateIngestGate({ ...passingStats, imageRichItems: 1 }, expectations)).toBe(false);
    });

    it("skips the media download threshold when there are no image assets", () => {
        expect(evaluateIngestGate({ ...passingStats, mediaDownloadRate: null }, expectations)).toBe(true);
    });

    it("fails when media download rate is below the minimum", () => {
        expect(evaluateIngestGate({ ...passingStats, mediaDownloadRate: 0.79 }, expectations)).toBe(false);
    });

    it("fails when there are no complete or partial representations", () => {
        expect(evaluateIngestGate({ ...passingStats, completeCount: 0, partialCount: 0 }, expectations)).toBe(false);
    });

    it("passes when the failed representation rate equals the maximum", () => {
        expect(evaluateIngestGate({ ...passingStats, itemCount: 10, failedCount: 2 }, expectations)).toBe(true);
    });

    it("fails when the failed representation rate exceeds the maximum", () => {
        expect(evaluateIngestGate({ ...passingStats, itemCount: 10, failedCount: 3 }, expectations)).toBe(false);
    });

    it("fails closed when item count is zero", () => {
        expect(evaluateIngestGate({ ...passingStats, itemCount: 0 }, expectations)).toBe(false);
    });

    it("fails when there are no blocks", () => {
        expect(evaluateIngestGate({ ...passingStats, totalBlocks: 0 }, expectations)).toBe(false);
    });
});
