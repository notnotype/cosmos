import { describe, expect, it, vi } from "vitest";

import { createLogger } from "@cosmos/logging";
import type { SourceSnapshot } from "@cosmos/contracts";
import type { OpenCliRunner } from "@cosmos/plugin-opencli";

import {
    createAiHotConnector,
    createBilibiliConnector,
    createBuiltInConnectorRegistry,
} from "./index.js";

function source(input: {
    kind: string;
    config: Record<string, unknown>;
}): SourceSnapshot {
    return {
        id: `source-${input.kind}`,
        name: input.kind,
        kind: input.kind,
        config: input.config,
        enabled: true,
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
        lastRunAt: null,
        lastError: null,
    };
}

describe("built-in collectors", () => {
    it("normalizes a fixed Bilibili OpenCLI hot scenario", async () => {
        const run = vi.fn<OpenCliRunner["run"]>()
            .mockResolvedValueOnce({
                stdout: "1.8.6",
                stderr: "",
                exitCode: 0,
            })
            .mockResolvedValueOnce({
                stdout: "[OK] Extension: connected\n[OK] Connectivity: passed",
                stderr: "",
                exitCode: 0,
            })
            .mockResolvedValueOnce({
                stdout: JSON.stringify([{
                    rank: 1,
                    title: "一个 B 站视频",
                    author: "Cosmos",
                    bvid: "BV1COSMOS",
                    url: "https://www.bilibili.com/video/BV1COSMOS",
                    pubdate: 1_786_170_123,
                    cover: "https://i.example.test/cover.jpg",
                }]),
                stderr: "",
                exitCode: 0,
            });
        const connector = createBilibiliConnector({
            runner: { run },
        });

        const result = await connector.fetchItems({
            source: source({
                kind: "bilibili",
                config: {
                    mode: "hot",
                    limit: 20,
                },
            }),
            cursor: null,
        });

        expect(run).toHaveBeenNthCalledWith(1, ["--version"], {
            env: {
                OPENCLI_PROFILE: undefined,
            },
        });
        expect(run).toHaveBeenNthCalledWith(2, ["doctor"], {
            env: {
                OPENCLI_PROFILE: undefined,
            },
        });
        expect(run).toHaveBeenNthCalledWith(3, [
            "bilibili",
            "hot",
            "--limit",
            "20",
            "-f",
            "json",
        ], {
            env: {
                OPENCLI_PROFILE: undefined,
            },
        });
        expect(result.items).toMatchObject([{
            externalId: "BV1COSMOS",
            title: "一个 B 站视频",
            summary: null,
            contentText: "一个 B 站视频",
            kind: "listing",
            publisher: {
                platformId: null,
                name: "Cosmos",
                kind: "user",
            },
            metrics: null,
            webUrl: "https://www.bilibili.com/video/BV1COSMOS",
            assets: [{
                kind: "cover",
                status: "metadata_only",
            }],
        }]);
        expect(result.items[0]?.publishedAt).toMatchObject({
            exact: "2026-08-08T06:22:03.000Z",
            exactPrecision: "second",
            fallback: null,
        });
        expect(result.nextCursor).toBeNull();
    });

    it("normalizes a Bilibili feed video with publisher id and metrics", async () => {
        const connector = createBilibiliConnector({
            runner: {
                run: async (args) => ({
                    stdout: args[0] === "--version"
                        ? "1.8.6"
                        : args[0] === "doctor"
                            ? "[OK] Extension: connected\n[OK] Connectivity: passed"
                            : JSON.stringify([{
                                bvid: "BV1FEED",
                                title: "Feed video",
                                owner: {
                                    mid: 9988,
                                    name: "Feed author",
                                },
                                view: 100,
                                like: 8,
                                favorite: 3,
                                pubdate: 1_786_170_123,
                            }]),
                    stderr: "",
                    exitCode: 0,
                }),
            },
        });

        const result = await connector.fetchItems({
            source: source({
                kind: "bilibili",
                config: {
                    mode: "feed",
                    profile: "chrome-main",
                    limit: 1,
                },
            }),
            cursor: null,
        });

        expect(result.items[0]).toMatchObject({
            kind: "video",
            publisher: {
                platformId: "9988",
                name: "Feed author",
            },
            metrics: {
                values: {
                    views: 100,
                    likes: 8,
                    collects: 3,
                },
            },
        });
    });

    it("keeps the logged-in Bilibili feed bound to a named profile", () => {
        const connector = createBilibiliConnector({
            runner: {
                run: async () => ({
                    stdout: "[]",
                    stderr: "",
                    exitCode: 0,
                }),
            },
        });

        expect(() => connector.validate(source({
            kind: "bilibili",
            config: { mode: "feed", limit: 20 },
        }))).toThrow();
        expect(() => connector.validate(source({
            kind: "bilibili",
            config: { mode: "feed", profile: "chrome-main", limit: 20 },
        }))).not.toThrow();
    });

    it("reports a disconnected Browser Bridge before running a source command", async () => {
        const connector = createBilibiliConnector({
            runner: {
                run: async (args) => ({
                    stdout: args[0] === "--version"
                        ? "1.8.6"
                        : args[0] === "doctor"
                            ? "[MISSING] Extension: not connected"
                            : "[]",
                    stderr: "",
                    exitCode: 0,
                }),
            },
        });

        await expect(connector.fetchItems({
            source: source({
                kind: "bilibili",
                config: { mode: "hot" },
            }),
            cursor: null,
        })).rejects.toMatchObject({
            code: "dependency_unavailable",
            retryable: true,
        });
    });

    it("collects AI HOT items with the fixed endpoint and persistent cursor", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            schemaVersion: 1,
            items: [{
                id: "aihot-1",
                title: "AI HOT 条目",
                summary: "来自公开 API 的摘要。",
                source: { name: "示例来源" },
                links: {
                    aihot: "https://aihot.virxact.com/items/aihot-1",
                    original: "https://example.com/original",
                },
                publishedAt: "2026-08-08T02:00:00.000Z",
                category: "industry",
            }],
            page: {
                nextCursor: "cursor-2",
            },
        }), {
            status: 200,
            headers: { "content-type": "application/json" },
        }));
        const connector = createAiHotConnector({
            fetch: fetcher,
        });

        const result = await connector.fetchItems({
            source: source({
                kind: "aihot",
                config: {},
            }),
            cursor: "cursor-1",
        });

        expect(fetcher).toHaveBeenCalledOnce();
        const requestUrl = String(fetcher.mock.calls[0]?.[0]);
        expect(requestUrl).toBe(
            "https://aihot.virxact.com/api/v1/items?cursor=cursor-1",
        );
        expect(result.nextCursor).toBe("cursor-2");
        expect(result.items[0]).toMatchObject({
            externalId: "aihot-1",
            title: "AI HOT 条目",
            summary: "来自公开 API 的摘要。",
            webUrl: "https://example.com/original",
        });
    });

    it("logs malformed AI HOT responses at the transport boundary", async () => {
        const lines: string[] = [];
        const logger = createLogger({
            service: "collector-test",
            output: "stdout",
            stdoutWriter: (line) => lines.push(line),
        });
        const connector = createAiHotConnector({
            fetch: vi.fn().mockResolvedValue(new Response("not-json", {
                status: 200,
            })),
            logger,
        });

        await expect(connector.fetchItems({
            source: source({
                kind: "aihot",
                config: {},
            }),
            cursor: null,
        })).rejects.toMatchObject({
            code: "malformed_payload",
        });
        await logger.close();

        const failed = lines
            .map((line) => JSON.parse(line) as Record<string, unknown>)
            .find((record) => record.event === "connector.transport.failed");
        expect(failed).toMatchObject({
            connectorId: "aihot",
            errorCode: "malformed_payload",
            status: 200,
        });
    });

    it("registers business source kinds instead of the OpenCLI executor", () => {
        const registry = createBuiltInConnectorRegistry({
            fetch: vi.fn() as never,
            openCliRunner: {
                run: async () => ({
                    stdout: "[]",
                    stderr: "",
                    exitCode: 0,
                }),
            },
        });

        expect(registry.descriptors().map((item) => item.id)).toEqual([
            "rss",
            "fixture-rss",
            "bilibili",
            "aihot",
        ]);
        expect(() => registry.resolve(source({
            kind: "opencli",
            config: {},
        }))).toThrow();
    });
});
