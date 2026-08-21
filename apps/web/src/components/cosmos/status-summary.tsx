import type {HealthResponse} from "@cosmos/contracts";

import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";

export type EventStreamState = "connecting" | "connected" | "unavailable";

type StatusSummaryProps = {
    eventStreamState: EventStreamState;
    health: HealthResponse | null;
    sourceSummary: string;
};

export function StatusSummary({eventStreamState, health, sourceSummary}: StatusSummaryProps) {
    return (
        <section aria-label="状态摘要" className="grid gap-4 md:grid-cols-4">
            <Card>
                <CardHeader>
                    <CardDescription>服务模式</CardDescription>
                    <CardTitle>服务器部署优先</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    {health ? `${health.service} · ${health.workerStatus}` : "Next.js Web · NestJS API · Worker"}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardDescription>来源</CardDescription>
                    <CardTitle>{sourceSummary}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    手动触发同一套 Ingest 合同。
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardDescription>数据层</CardDescription>
                    <CardTitle>Prisma + SQLite</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    已保存内容在上游断开后仍可查询。
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardDescription>实时状态</CardDescription>
                    <CardTitle>
                        {eventStreamState === "connected"
                            ? "SSE 已连接"
                            : eventStreamState === "connecting"
                                ? "正在连接"
                                : "SSE 不可用"}
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    {eventStreamState === "unavailable"
                        ? "数据仍可手动刷新；服务恢复后会重新连接。"
                        : "Run、Job 和 Feed 更新会自动刷新。"}
                </CardContent>
            </Card>
        </section>
    );
}
