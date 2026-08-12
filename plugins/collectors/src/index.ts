import {
    ConnectorExecutionError,
    ConnectorRegistry,
    type LoggerPort,
    type IngestConnector,
} from "@cosmos/application";
import {
    aiHotSourceConfigSchema,
    bilibiliSourceConfigSchema,
    type SourceSnapshot,
} from "@cosmos/contracts";
import type {
    ContentMetrics,
    NormalizedAssetInput,
    NormalizedIngestItem,
} from "@cosmos/domain";
import {
    createTemporalValue,
    normalizePublisher,
} from "@cosmos/domain";
import {
    assertOpenCliDoctor,
    assertOpenCliVersion,
    createNodeOpenCliRunner,
    type OpenCliRunner,
} from "@cosmos/plugin-opencli";
import {
    createFixtureRssConnector,
    createRssConnector,
} from "@cosmos/plugin-rss";

export const bilibiliConnectorId = "bilibili";
export const aiHotConnectorId = "aihot";
export const aiHotItemsUrl = "https://aihot.virxact.com/api/v1/items";

export interface OpenCliConnectorOptions {
    executable?: string;
    runner?: OpenCliRunner;
    timeoutMs?: number;
    maxBufferBytes?: number;
    preflight?: boolean;
    checkVersion?: boolean;
    logger?: LoggerPort;
}

export function createBilibiliConnector(
    options: OpenCliConnectorOptions = {},
): IngestConnector {
    const runner = options.runner ?? createNodeOpenCliRunner({
        executable: options.executable,
        timeoutMs: options.timeoutMs,
        maxBufferBytes: options.maxBufferBytes,
        logger: options.logger,
    });
    const preflight = options.preflight ?? true;
    const checkVersion = options.checkVersion ?? true;
    let versionChecked = false;

    return {
        id: bilibiliConnectorId,
        description: "Collect Bilibili hot or followed-feed items through OpenCLI.",
        configVersion: "v1",
        capabilities: ["bilibili", "opencli", "browser-bridge"],
        validate(source) {
            parseBilibiliConfig(source);
        },
        async fetchItems({ source }) {
            const config = parseBilibiliConfig(source);
            const args = [
                "bilibili",
                config.mode,
                "--limit",
                String(config.limit),
                "-f",
                "json",
            ];
            const env = {
                OPENCLI_PROFILE: config.profile,
            };
            if (checkVersion && !versionChecked) {
                const version = await runner.run(["--version"], { env });
                assertOpenCliVersion(version.stdout, version.exitCode);
                versionChecked = true;
            }
            if (preflight) {
                const doctor = await runner.run(["doctor"], { env });
                assertOpenCliDoctor(doctor.stdout);
            }
            const result = await runner.run(args, {
                env,
            });
            if (result.exitCode === 66) {
                return { items: [], nextCursor: null };
            }
            return {
                items: normalizeBilibiliOutput(result.stdout, config.mode),
                nextCursor: null,
            };
        },
    };
}

export const createOpenCliConnector = createBilibiliConnector;

export interface AiHotConnectorOptions {
    fetch?: typeof globalThis.fetch;
    logger?: LoggerPort;
}

export function createAiHotConnector(
    options: AiHotConnectorOptions = {},
): IngestConnector {
    const fetcher = options.fetch ?? globalThis.fetch;

    return {
        id: aiHotConnectorId,
        description: "Collect public AI HOT items from the verified API.",
        configVersion: "v1",
        capabilities: ["aihot", "http", "public"],
        validate(source) {
            parseAiHotConfig(source);
        },
        async fetchItems({ source, cursor }) {
            parseAiHotConfig(source);
            const url = new URL(aiHotItemsUrl);
            if (cursor) {
                url.searchParams.set("cursor", cursor);
            }
            const startedAt = Date.now();
            options.logger?.debug("connector.transport.started", {
                connectorId: aiHotConnectorId,
                sourceKind: source.kind,
                cursorPresent: cursor !== null,
            });
            let response: Response;
            try {
                response = await fetcher(url);
            } catch (error) {
                options.logger?.error("connector.transport.failed", {
                    connectorId: aiHotConnectorId,
                    sourceKind: source.kind,
                    durationMs: Date.now() - startedAt,
                }, error);
                throw error;
            }
            if (!response.ok) {
                options.logger?.warn("connector.transport.failed", {
                    connectorId: aiHotConnectorId,
                    sourceKind: source.kind,
                    status: response.status,
                    durationMs: Date.now() - startedAt,
                });
                throw new ConnectorExecutionError(
                    response.status === 429
                        ? "rate_limited"
                        : "dependency_unavailable",
                    `AI HOT request failed with HTTP ${response.status}.`,
                    response.status >= 500 || response.status === 429,
                );
            }

            let output = "";
            let payload: {
                items: readonly Record<string, unknown>[];
                nextCursor: string | null;
            };
            try {
                output = await response.text();
                payload = parseAiHotResponse(output);
                const items = payload.items.map((item) => normalizeAiHotItem(item));
                options.logger?.info("connector.transport.completed", {
                    connectorId: aiHotConnectorId,
                    sourceKind: source.kind,
                    status: response.status,
                    itemCount: items.length,
                    responseBytes: Buffer.byteLength(output, "utf8"),
                    durationMs: Date.now() - startedAt,
                });
                return {
                    items,
                    nextCursor: payload.nextCursor,
                };
            } catch (error) {
                options.logger?.error("connector.transport.failed", {
                    connectorId: aiHotConnectorId,
                    sourceKind: source.kind,
                    status: response.status,
                    responseBytes: Buffer.byteLength(output, "utf8"),
                    durationMs: Date.now() - startedAt,
                    errorCode: error instanceof ConnectorExecutionError
                        ? error.code
                        : "malformed_payload",
                }, error);
                throw error;
            }
        },
    };
}

export function createBuiltInConnectorRegistry(options: {
    workspaceRoot?: string;
    fetch?: typeof globalThis.fetch;
    openCliExecutable?: string;
    openCliRunner?: OpenCliRunner;
    logger?: LoggerPort;
} = {}): ConnectorRegistry {
    return new ConnectorRegistry([
        createRssConnector({
            fetch: options.fetch,
            logger: options.logger,
        }),
        createFixtureRssConnector({
            rootDirectory: options.workspaceRoot,
            logger: options.logger,
        }),
        createBilibiliConnector({
            executable: options.openCliExecutable,
            runner: options.openCliRunner,
            logger: options.logger,
        }),
        createAiHotConnector({
            fetch: options.fetch,
            logger: options.logger,
        }),
    ]);
}

function parseBilibiliConfig(source: SourceSnapshot) {
    try {
        return bilibiliSourceConfigSchema.parse(source.config);
    } catch (error) {
        throw new ConnectorExecutionError(
            "invalid_configuration",
            "Bilibili source configuration is invalid.",
            false,
            { cause: error },
        );
    }
}

function parseAiHotConfig(source: SourceSnapshot) {
    try {
        return aiHotSourceConfigSchema.parse(source.config);
    } catch (error) {
        throw new ConnectorExecutionError(
            "invalid_configuration",
            "AI HOT source configuration is invalid.",
            false,
            { cause: error },
        );
    }
}

function normalizeBilibiliOutput(
    output: string,
    mode: "hot" | "feed",
): readonly NormalizedIngestItem[] {
    const rows = extractRows(parseJsonDocument(output));
    return rows.map((row, index) => {
        const externalId = firstText(
            row.bvid,
            row.id,
            row.aid,
            row.video_id,
        );
        const title = firstText(row.title, row.name) || "Untitled Bilibili item";
        const author = firstText(
            row.author,
            row.author_name,
            readRecordValue(row.author, "name"),
            readRecordValue(row.owner, "name"),
        );
        const owner = asRecord(row.owner);
        const description = firstText(
            row.description,
            row.desc,
            row.summary,
        );
        const webUrl = firstUrl(
            row.url,
            row.link,
            row.web_url,
            externalId?.startsWith("BV")
                ? `https://www.bilibili.com/video/${externalId}`
                : null,
        );
        const publishedAtRaw = firstText(
            row.published_at,
            row.publishedAt,
            row.pubdate,
            row.time,
        );
        const asset = createMetadataAsset(
            "cover",
            firstUrl(row.cover, row.pic, row.thumbnail, row.cover_url),
        );
        const metrics = normalizeContentMetrics({
            likes: firstText(row.likes, row.like),
            views: firstText(row.views, row.view),
            reposts: firstText(row.reposts, row.repost),
            comments: firstText(row.comments, row.comment),
            collects: firstText(row.collects, row.favorite, row.favorites),
            score: firstText(row.score),
        });

        return {
            externalId,
            title,
            summary: description || null,
            contentText: description || title,
            webUrl,
            kind: mode === "hot" ? "listing" : "video",
            publisher: normalizePublisher({
                platformId: firstText(
                    row.mid,
                    row.uid,
                    row.author_id,
                    readRecordValue(owner, "mid"),
                    readRecordValue(owner, "uid"),
                ),
                name: author,
                kind: "user",
                profileUrl: firstUrl(
                    row.author_url,
                    readRecordValue(owner, "url"),
                ),
            }),
            metrics,
            publishedAt: createTemporalValue({
                exact: publishedAtRaw,
                raw: publishedAtRaw,
                timezone: "Asia/Shanghai",
            }),
            updatedAt: null,
            sourceLocator: {
                provider: "bilibili",
                mode,
                rank: index + 1,
                externalId,
            },
            rawPayload: JSON.stringify(row),
            rawPayloadMimeType: "application/json",
            assets: asset ? [asset] : [],
        };
    });
}

function normalizeAiHotItem(
    item: Record<string, unknown>,
): NormalizedIngestItem {
    const externalId = firstText(item.id);
    const title = firstText(item.title);
    if (!externalId || !title) {
        throw new ConnectorExecutionError(
            "malformed_payload",
            "AI HOT returned an item without id or title.",
            false,
        );
    }

    const links = asRecord(item.links);
    const source = asRecord(item.source);
    const summary = firstText(item.summary, item.description);
    const publishedAtRaw = firstText(
        item.publishedAt,
        item.published_at,
        item.discoveredAt,
    );
    const originalUrl = firstUrl(
        links?.original,
        links?.url,
        item.url,
    );
    const aiHotUrl = firstUrl(links?.aihot);
    const imageUrl = firstUrl(
        links?.image,
        links?.thumbnail,
        item.image,
        item.thumbnail,
    );
    const metrics = normalizeContentMetrics({
        likes: firstText(item.likes, item.like),
        views: firstText(item.views, item.view),
        reposts: firstText(item.reposts, item.repost),
        comments: firstText(item.comments, item.comment),
        collects: firstText(item.collects, item.collectsCount),
        score: firstText(item.score),
    });

    return {
        externalId,
        title,
        summary: summary || null,
        contentText: firstText(item.content, item.text, summary, title) ?? title,
        webUrl: originalUrl ?? aiHotUrl,
        kind: "article",
        publisher: normalizePublisher({
            platformId: firstText(
                item.authorId,
                item.author_id,
                asRecord(item.author)?.id,
            ),
            name: firstText(
                item.author,
                item.authorName,
                asRecord(item.author)?.name,
                source?.name,
            ),
            kind: "unknown",
        }),
        metrics,
        publishedAt: createTemporalValue({
            exact: publishedAtRaw,
            raw: publishedAtRaw,
            timezone: "UTC",
        }),
        updatedAt: null,
        sourceLocator: {
            provider: "aihot",
            itemId: externalId,
            category: firstText(item.category) || null,
            sourceName: firstText(source?.name) || null,
            links,
        },
        rawPayload: JSON.stringify(item),
        rawPayloadMimeType: "application/json",
        assets: imageUrl
            ? [createMetadataAsset("image", imageUrl)!]
            : [],
    };
}

function parseAiHotResponse(output: string): {
    items: readonly Record<string, unknown>[];
    nextCursor: string | null;
} {
    let value: unknown;
    try {
        value = JSON.parse(output) as unknown;
    } catch (error) {
        throw new ConnectorExecutionError(
            "malformed_payload",
            "AI HOT returned invalid JSON.",
            false,
            { cause: error },
        );
    }
    if (!isRecord(value) || !Array.isArray(value.items)) {
        throw new ConnectorExecutionError(
            "malformed_payload",
            "AI HOT response is missing an items array.",
            false,
        );
    }
    const items = value.items.filter(isRecord);
    if (items.length !== value.items.length) {
        throw new ConnectorExecutionError(
            "malformed_payload",
            "AI HOT response contains a non-object item.",
            false,
        );
    }
    const page = asRecord(value.page);
    const nextCursor = firstText(page?.nextCursor) || null;
    return {
        items,
        nextCursor,
    };
}

function parseJsonDocument(output: string): unknown {
    const trimmed = output.trim();
    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        for (let index = 0; index < trimmed.length; index += 1) {
            if (trimmed[index] !== "[" && trimmed[index] !== "{") {
                continue;
            }
            const candidate = extractJsonCandidate(trimmed, index);
            if (!candidate) {
                continue;
            }
            try {
                return JSON.parse(candidate) as unknown;
            } catch {
                continue;
            }
        }
    }
    throw new ConnectorExecutionError(
        "malformed_payload",
        "OpenCLI returned no valid JSON payload.",
        false,
    );
}

function extractRows(value: unknown): readonly Record<string, unknown>[] {
    if (Array.isArray(value) && value.every(isRecord)) {
        return value;
    }
    if (isRecord(value)) {
        for (const key of ["items", "data", "results"]) {
            const rows = value[key];
            if (Array.isArray(rows) && rows.every(isRecord)) {
                return rows;
            }
        }
        return [value];
    }
    throw new ConnectorExecutionError(
        "malformed_payload",
        "OpenCLI returned an unsupported JSON shape.",
        false,
    );
}

function extractJsonCandidate(input: string, start: number): string | null {
    const opening = input[start];
    const closing = opening === "[" ? "]" : "}";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < input.length; index += 1) {
        const character = input[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === "\"") {
                inString = false;
            }
            continue;
        }
        if (character === "\"") {
            inString = true;
        } else if (character === opening) {
            depth += 1;
        } else if (character === closing) {
            depth -= 1;
            if (depth === 0) {
                return input.slice(start, index + 1);
            }
        }
    }
    return null;
}

function createMetadataAsset(
    kind: string,
    sourceUrl: string | null,
): NormalizedAssetInput | null {
    return sourceUrl
        ? {
            kind,
            sourceUrl,
            status: "metadata_only",
            mimeType: null,
            byteSize: null,
            content: null,
        }
        : null;
}

function normalizeContentMetrics(input: {
    likes?: string | null;
    views?: string | null;
    reposts?: string | null;
    comments?: string | null;
    collects?: string | null;
    score?: string | null;
}): ContentMetrics | null {
    const values: ContentMetrics["values"] = {};
    const raw: Record<string, string> = {};
    const entries = Object.entries(input) as Array<
        [keyof ContentMetrics["values"], string | null | undefined]
    >;

    for (const [key, rawValue] of entries) {
        if (!rawValue) {
            continue;
        }
        raw[key] = rawValue;
        const numeric = Number(rawValue.replaceAll(",", ""));
        if (Number.isFinite(numeric)) {
            values[key] = numeric;
        }
    }

    return Object.keys(raw).length > 0
        ? {
            values,
            raw,
            reliability: "unknown",
            capturedAt: new Date().toISOString(),
        }
        : null;
}

function readRecordValue(
    value: unknown,
    key: string,
): unknown {
    return isRecord(value) ? value[key] : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstText(...values: readonly unknown[]): string | null {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
        if (typeof value === "number" || typeof value === "boolean") {
            return String(value);
        }
    }
    return null;
}

function firstUrl(...values: readonly unknown[]): string | null {
    for (const value of values) {
        if (
            typeof value === "string"
            && (value.startsWith("http://") || value.startsWith("https://"))
        ) {
            return value;
        }
    }
    return null;
}
