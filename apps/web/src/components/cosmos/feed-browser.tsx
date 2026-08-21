import {ExternalLink, Search} from "lucide-react";
import type {FormEventHandler} from "react";
import type {UseFormReturn} from "react-hook-form";
import {z} from "zod";

import type {FeedItem, SourceSnapshot} from "@cosmos/contracts";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {Input} from "@/components/ui/input";

export const searchSchema = z.object({
    text: z.string().trim().max(500).default(""),
    sourceId: z.string().default(""),
    publishedAfter: z.string().default(""),
    publishedBefore: z.string().default(""),
});

export type SearchFormValues = z.input<typeof searchSchema>;

type FeedBrowserProps = {
    feed: readonly FeedItem[];
    loading: boolean;
    nextCursor: string | null;
    onLoadMore: () => Promise<void>;
    onOpenStory: (storyId: string) => Promise<void>;
    onSubmit: FormEventHandler<HTMLFormElement>;
    searchForm: UseFormReturn<SearchFormValues>;
    sources: readonly SourceSnapshot[];
};

export function FeedBrowser({
    feed,
    loading,
    nextCursor,
    onLoadMore,
    onOpenStory,
    onSubmit,
    searchForm,
    sources,
}: FeedBrowserProps) {
    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold">Story Feed</h2>
                    <p className="text-sm text-muted-foreground">
                        Phase 1 使用保守 Story projection，不提前实现跨来源聚类。
                    </p>
                </div>
                <form className="flex w-full max-w-3xl flex-col gap-2" onSubmit={onSubmit}>
                    <div className="flex flex-col gap-2 md:flex-row">
                        <Input
                            aria-label="搜索已保存内容"
                            placeholder="搜索标题或正文"
                            {...searchForm.register("text")}
                        />
                        <select
                            aria-label="搜索来源"
                            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                            {...searchForm.register("sourceId")}
                        >
                            <option value="">全部来源</option>
                            {sources.map((source) => (
                                <option key={source.id} value={source.id}>
                                    {source.name}
                                </option>
                            ))}
                        </select>
                        <Input
                            aria-label="开始日期"
                            type="date"
                            {...searchForm.register("publishedAfter")}
                        />
                        <Input
                            aria-label="结束日期"
                            type="date"
                            {...searchForm.register("publishedBefore")}
                        />
                        <Button type="submit" variant="outline">
                            <Search data-icon="inline-start" />
                            搜索
                        </Button>
                    </div>
                </form>
            </div>
            {loading ? (
                <Card>
                    <CardContent className="py-8 text-sm text-muted-foreground">
                        正在读取本地 Feed…
                    </CardContent>
                </Card>
            ) : feed.length === 0 ? (
                <Card>
                    <CardContent className="py-8 text-sm text-muted-foreground">
                        暂无已保存内容，请先创建来源并触发录入。
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {feed.map((item) => (
                        <Card key={item.storyId}>
                            <CardHeader>
                                <div className="flex items-center justify-between gap-4">
                                    <Badge variant="secondary">{item.storyKind}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {item.sourceName}
                                    </span>
                                </div>
                                <CardTitle>{item.title}</CardTitle>
                                <CardDescription>{item.summary ?? "暂无摘要"}</CardDescription>
                            </CardHeader>
                            <CardFooter>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void onOpenStory(item.storyId)}
                                >
                                    <ExternalLink data-icon="inline-start" />
                                    打开 Story
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
            {nextCursor && (
                <div className="flex justify-center">
                    <Button variant="outline" onClick={() => void onLoadMore()}>
                        加载更多
                    </Button>
                </div>
            )}
        </section>
    );
}
