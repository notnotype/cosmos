// 验收门禁纯函数，从 runner 提取以支持独立测试。
// 不包含网络、数据库或文件 I/O。

export interface IngestGateStats {
    itemCount: number;
    imageRichItems: number;
    mediaDownloadRate: number | null;
    completeCount: number;
    partialCount: number;
    failedCount: number;
    totalBlocks: number;
}

export interface IngestGateExpectations {
    minItemCount: number;
    minImageRichItems: number;
    minMediaDownloadRate: number;
    maxFailedRepresentationRate: number;
}

export function containsDangerousHtml(value: unknown): boolean {
    if (typeof value === "string") {
        return /<\s*(?:script|iframe)\b|javascript\s*:/i.test(value);
    }
    if (Array.isArray(value)) {
        return value.some(containsDangerousHtml);
    }
    if (value !== null && typeof value === "object") {
        return Object.values(value).some(containsDangerousHtml);
    }
    return false;
}

export function countBlockTypes(value: unknown, counts: { text: number; image: number }): void {
    if (Array.isArray(value)) {
        for (const item of value) countBlockTypes(item, counts);
        return;
    }
    if (value === null || typeof value !== "object") return;
    const block = value as Record<string, unknown>;
    if (block.type === "text") counts.text++;
    if (block.type === "image") counts.image++;
    for (const child of Object.values(block)) countBlockTypes(child, counts);
}

export function evaluateIngestGate(stats: IngestGateStats, expectations: IngestGateExpectations): boolean {
    const failedRate = stats.itemCount > 0 ? stats.failedCount / stats.itemCount : 1;
    const passed =
        stats.itemCount >= expectations.minItemCount &&
        stats.imageRichItems >= expectations.minImageRichItems &&
        (stats.mediaDownloadRate === null || stats.mediaDownloadRate >= expectations.minMediaDownloadRate) &&
        (stats.completeCount + stats.partialCount) > 0 &&
        failedRate <= expectations.maxFailedRepresentationRate &&
        stats.totalBlocks > 0;
    return passed;
}
