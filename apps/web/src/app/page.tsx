"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    Plus,
    RefreshCcw,
    X,
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useForm } from "react-hook-form";

import {
    createSourceCommandSchema,
    type FeedItem,
    type HealthResponse,
    type SearchQuery,
    type SourceSnapshot,
    type StoryDetail,
} from "@cosmos/contracts";
import {
    CosmosTransportError,
    HttpCosmosClient,
} from "@cosmos/transport-http";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {SourceActions} from "@/components/cosmos/source-actions";
import {SourceForm, sourceFormSchema, type SourceFormValues} from "@/components/cosmos/source-form";
import {StatusSummary, type EventStreamState} from "@/components/cosmos/status-summary";
import {FeedBrowser, searchSchema, type SearchFormValues} from "@/components/cosmos/feed-browser";
import {StoryPanel} from "@/components/cosmos/story-panel";



const client = new HttpCosmosClient({
    baseUrl: process.env.NEXT_PUBLIC_COSMOS_API_URL ?? "",
});


export default function Home() {
    const [feed, setFeed] = useState<readonly FeedItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [activeSearch, setActiveSearch] = useState<SearchQuery | null>(null);
    const [sources, setSources] = useState<readonly SourceSnapshot[]>([]);
    const [story, setStory] = useState<StoryDetail | null>(null);
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [showSourceForm, setShowSourceForm] = useState(false);
    const [eventStreamState, setEventStreamState] = useState<EventStreamState>("connecting");
    const sourceForm = useForm<SourceFormValues>({
        resolver: zodResolver(sourceFormSchema),
        defaultValues: {
            name: "Cosmos fixture",
            fixturePath: "fixtures/rss/basic.xml",
        },
    });
    const searchForm = useForm<SearchFormValues>({
        resolver: zodResolver(searchSchema),
        defaultValues: {
            text: "",
            sourceId: "",
            publishedAfter: "",
            publishedBefore: "",
        },
    });

    const refresh = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const [nextFeed, nextSources] = await Promise.all([
                activeSearch
                    ? client.search(activeSearch)
                    : client.feed(),
                client.listSources(),
            ]);
            setFeed(nextFeed.items);
            setNextCursor(nextFeed.nextCursor);
            setSources(nextSources);
        } catch (caught) {
            setError(readError(caught));
        } finally {
            setLoading(false);
        }
    }, [activeSearch]);

    useEffect(() => {
        const load = async (): Promise<void> => {
            await refresh();
        };
        void load();
        const closeEvents = client.openEventStream({
            onEvent: (event) => {
                setEventStreamState("connected");
                if (event.type === "snapshot_required") {
                    setNotice("服务要求重新读取快照，正在刷新 Feed。");
                }
                if (
                    event.type === "feed.updated.v1"
                    || event.type === "run.succeeded.v1"
                    || event.type === "run.failed.v1"
                    || event.type === "job.succeeded.v1"
                    || event.type === "job.retry_wait.v1"
                    || event.type === "job.failed_terminal.v1"
                ) {
                    void refresh();
                }
            },
            onError: () => {
                setEventStreamState("unavailable");
            },
        });
        return closeEvents;
    }, [refresh]);

    const sourceSummary = useMemo(() => {
        if (sources.length === 0) {
            return "尚未配置来源";
        }
        return `${sources.length} 个来源，${sources.filter((source) => source.enabled).length} 个启用`;
    }, [sources]);

    const onCreateSource = sourceForm.handleSubmit(async (values) => {
        setError(null);
        try {
            await client.createSource(createSourceCommandSchema.parse({
                name: values.name,
                kind: "fixture-rss",
                config: {
                    fixturePath: values.fixturePath,
                },
                enabled: true,
            }));
            setNotice("来源已创建，可以立即触发一次录入。");
            setShowSourceForm(false);
            sourceForm.reset();
            await refresh();
        } catch (caught) {
            setError(readError(caught));
        }
    });

    const onSearch = searchForm.handleSubmit(async ({
        text,
        sourceId,
        publishedAfter,
        publishedBefore,
    }) => {
        setError(null);
        try {
            const query: SearchQuery = {
                text: text || undefined,
                sourceId: sourceId || undefined,
                publishedAfter: toBoundaryIso(publishedAfter, false),
                publishedBefore: toBoundaryIso(publishedBefore, true),
                limit: 20,
            };
            const result = await client.search(query);
            setActiveSearch(query);
            setFeed(result.items);
            setNextCursor(result.nextCursor);
            setNotice(
                text || sourceId || publishedAfter || publishedBefore
                    ? `搜索到 ${result.items.length} 条结果。`
                    : "已恢复 Feed。",
            );
        } catch (caught) {
            setError(readError(caught));
        }
    });

    const openStory = async (storyId: string): Promise<void> => {
        try {
            setStory(await client.story(storyId));
        } catch (caught) {
            setError(readError(caught));
        }
    };

    const loadMore = async (): Promise<void> => {
        if (!nextCursor) {
            return;
        }
        setError(null);
        try {
            const page = activeSearch
                ? await client.search({
                    ...activeSearch,
                    cursor: nextCursor,
                })
                : await client.feed({ cursor: nextCursor });
            setFeed((current) => [...current, ...page.items]);
            setNextCursor(page.nextCursor);
        } catch (caught) {
            setError(readError(caught));
        }
    };

    const checkService = async (): Promise<void> => {
        setError(null);
        try {
            const result = await client.health();
            setHealth(result);
            setNotice(`服务正常，数据层 ${result.storageStatus}。`);
        } catch (caught) {
            setError(readError(caught));
        }
    };

    const runSource = async (source: SourceSnapshot): Promise<void> => {
        setError(null);
        try {
            const result = await client.triggerSource(source.id);
            setNotice(
                result.status === "queued" || result.status === "running"
                    ? `录入任务已排队（Run ${result.id}），Worker 完成后 Feed 会自动刷新。`
                    : `录入任务状态：${result.status}。`,
            );
            await refresh();
        } catch (caught) {
            setError(readError(caught));
        }
    };

    return (
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 lg:px-8">
            <header className="flex flex-col gap-4 border-b pb-8 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-2">
                    <Badge variant="secondary" className="w-fit">
                        Phase 1 · 本地信息库
                    </Badge>
                    <h1 className="text-4xl font-semibold tracking-tight">
                        Cosmos
                    </h1>
                    <p className="max-w-2xl text-muted-foreground">
                        从 Story 入口浏览已保存的信息，并手动触发 RSS/fixture 录入。
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => setShowSourceForm((value) => !value)}>
                        {showSourceForm ? <X data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                        {showSourceForm ? "关闭表单" : "新建来源"}
                    </Button>
                    <Button variant="outline" onClick={() => void checkService()}>
                        <RefreshCcw data-icon="inline-start" />
                        检查服务
                    </Button>
                </div>
            </header>

            {(notice || error) && (
                <div
                    className={error
                        ? "rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
                        : "rounded-lg border border-border bg-muted/40 p-4 text-sm"}
                    role={error ? "alert" : "status"}
                >
                    {error ?? notice}
                </div>
            )}

            {showSourceForm && (
                <SourceForm form={sourceForm} onSubmit={onCreateSource} />
            )}

            <StatusSummary
                eventStreamState={eventStreamState}
                health={health}
                sourceSummary={sourceSummary}
            />

            <SourceActions onRun={runSource} sources={sources} />

            <FeedBrowser
                feed={feed}
                loading={loading}
                nextCursor={nextCursor}
                onLoadMore={loadMore}
                onOpenStory={openStory}
                onSubmit={onSearch}
                searchForm={searchForm}
                sources={sources}
            />

            {story && <StoryPanel onClose={() => setStory(null)} story={story} />}
        </main>
    );
}

function readError(error: unknown): string {
    if (error instanceof CosmosTransportError) {
        return `服务请求失败（HTTP ${error.status}）。`;
    }
    return error instanceof Error ? error.message : "发生未知错误。";
}

function toBoundaryIso(
    value: string | undefined,
    endOfDay: boolean,
): string | undefined {
    if (!value) {
        return undefined;
    }
    const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
    return new Date(`${value}${suffix}`).toISOString();
}
