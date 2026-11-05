import { snapshotCommit } from "./story-agent-isolation.js";

/**
 * 真实来源扩大验收计划（Task 40 阶段 1）
 * 
 * 本计划验证完整的 RSS ingest → 内容解析 → 版本存储 → Story 阅读链路。
 */
export interface RealSourceIngestPlan {
    version: number;
    description: string;
    schemaCommit: string;
    rssUrls: string[];
    expectations: {
        minItemCount: number;
        minImageRichItems: number;
        minMediaDownloadRate: number;
        maxFailedRepresentationRate: number;
    };
    checks: string[];
    isolation: {
        rootPrefix: string;
        dataRoot: string;
        secretStore: string;
    };
}

export async function realSourceIngestPlan(): Promise<RealSourceIngestPlan> {
    const defaultRssUrl = "https://www.prisma.io/blog/feed.xml";
    const envUrls = process.env.COSMOS_REAL_RSS_URL?.trim();
    const rssUrls = envUrls 
        ? envUrls.split(",").map(u => u.trim()).filter(Boolean)
        : [defaultRssUrl];

    return {
        version: 1,
        description: "Real RSS source ingest acceptance for Task 40 - validates full ingest → parse → persist → read chain",
        schemaCommit: snapshotCommit,
        rssUrls,
        expectations: {
            minItemCount: 5,
            minImageRichItems: 2,
            minMediaDownloadRate: 0.8,
            maxFailedRepresentationRate: 0.2,
        },
        checks: [
            "RSS fetch succeeds (HTTP 200)",
            "WorkflowRun completes successfully",
            "Entry count >= 5 (if feed contains enough items)",
            "Image-rich items >= 2",
            "Representation status is complete or partial for at least 80% of entries",
            "Representation blocks are non-empty JSON and free of <script>/<iframe>/javascript: patterns (scoped check, not a full HTML sanitizer audit)",
            "Media download success rate >= 80% when image assets exist",
            "Story reading API is verified during browser acceptance",
        ],
        isolation: {
            rootPrefix: ".agent/tmp/task40-real-source-",
            dataRoot: "data/",
            secretStore: "data/secrets/",
        },
    };
}
