import {useMemo} from "react";
import {zodResolver} from "@hookform/resolvers/zod";
import {useForm} from "react-hook-form";

import type {
    FeedItem,
    HealthResponse,
    SourceSnapshot,
    StoryDetail,
} from "@cosmos/contracts";

import {FeedBrowser, searchSchema, type SearchFormValues} from "@/components/cosmos/feed-browser";
import {SourceActions} from "@/components/cosmos/source-actions";
import {
    SourceForm,
    sourceFormSchema,
    type SourceFormValues,
} from "@/components/cosmos/source-form";
import {
    StatusSummary,
    type EventStreamState,
} from "@/components/cosmos/status-summary";
import {StoryPanel} from "@/components/cosmos/story-panel";

import type {LabProps} from "./types";

const fixtureTimestamp = "2026-01-01T00:00:00.000Z";

function textProp(props: LabProps, name: string, fallback: string): string {
    const value = props[name];
    return typeof value === "string" ? value : fallback;
}

function optionProp<T extends string>(props: LabProps, name: string, fallback: T, options: readonly T[]): T {
    const value = props[name];
    return typeof value === "string" && options.includes(value as T) ? value as T : fallback;
}

function booleanProp(props: LabProps, name: string, fallback = false): boolean {
    const value = props[name];
    return typeof value === "boolean" ? value : fallback;
}

export function renderSourceFormLab(props: LabProps) {
    return <SourceFormLabFixture props={props} />;
}

function SourceFormLabFixture({props}: {props: LabProps}) {
    const name = textProp(props, "name", "Cosmos fixture");
    const fixturePath = textProp(props, "fixturePath", "fixtures/rss/basic.xml");
    const values = useMemo<SourceFormValues>(() => ({name, fixturePath}), [fixturePath, name]);
    const form = useForm<SourceFormValues>({
        resolver: zodResolver(sourceFormSchema),
        defaultValues: values,
        values,
    });
    return <SourceForm form={form} onSubmit={(event) => event.preventDefault()} />;
}

export function renderStatusSummaryLab(props: LabProps) {
    const healthState = optionProp(props, "health", "unknown", ["unknown", "ready", "failed"] as const);
    const eventStreamState = optionProp(
        props,
        "eventStreamState",
        "connecting",
        ["connecting", "connected", "unavailable"] as const,
    );
    const health: HealthResponse | null = healthState === "unknown"
        ? null
        : {
            status: "ok",
            service: "Cosmos fixture",
            version: "0.1.0",
            protocolVersion: "v1",
            workerStatus: healthState === "ready" ? "ready" : "stopped",
            storageStatus: healthState === "ready" ? "ready" : "failed",
            migrationStatus: healthState === "ready" ? "ready" : "failed",
            timestamp: fixtureTimestamp,
        };
    return (
        <StatusSummary
            eventStreamState={eventStreamState as EventStreamState}
            health={health}
            sourceSummary={textProp(props, "sourceSummary", "尚未配置来源")}
        />
    );
}

export function renderSourceActionsLab(props: LabProps) {
    const state = optionProp(props, "state", "configured", ["configured", "empty", "disabled"] as const);
    const sources: readonly SourceSnapshot[] = state === "empty"
        ? []
        : [{
            id: "source-fixture",
            name: textProp(props, "sourceName", "Cosmos fixture"),
            kind: "fixture-rss",
            config: {fixturePath: "fixtures/rss/basic.xml"},
            enabled: state !== "disabled" && booleanProp(props, "enabled", true),
            createdAt: fixtureTimestamp,
            updatedAt: fixtureTimestamp,
            lastRunAt: null,
            lastError: state === "disabled" ? "Fixture source disabled" : null,
        }];
    return <SourceActions onRun={async () => undefined} sources={sources} />;
}

export function renderFeedBrowserLab(props: LabProps) {
    return <FeedBrowserLabFixture props={props} />;
}

function FeedBrowserLabFixture({props}: {props: LabProps}) {
    const form = useForm<SearchFormValues>({
        resolver: zodResolver(searchSchema),
        defaultValues: {
            text: "",
            sourceId: "",
            publishedAfter: "",
            publishedBefore: "",
        },
    });
    const state = optionProp(props, "state", "populated", ["loading", "empty", "populated"] as const);
    const feed: readonly FeedItem[] = state === "populated"
        ? [{
            storyId: "story-fixture",
            storyKind: "document",
            title: textProp(props, "title", "Cosmos fixture story"),
            summary: "A synthetic Feed item for the component laboratory.",
            entryId: "entry-fixture",
            sourceId: "source-fixture",
            sourceName: "Cosmos fixture",
            sourceKind: "fixture-rss",
            revisionId: "revision-fixture",
            publishedAt: fixtureTimestamp,
            assets: [],
        }]
        : [];
    return (
        <FeedBrowser
            feed={feed}
            loading={state === "loading"}
            nextCursor={state === "populated" ? "fixture-next" : null}
            onLoadMore={async () => undefined}
            onOpenStory={async () => undefined}
            onSubmit={(event) => event.preventDefault()}
            searchForm={form}
            sources={[{
                id: "source-fixture",
                name: "Cosmos fixture",
                kind: "fixture-rss",
                config: {fixturePath: "fixtures/rss/basic.xml"},
                enabled: true,
                createdAt: fixtureTimestamp,
                updatedAt: fixtureTimestamp,
                lastRunAt: null,
                lastError: null,
            }]}
        />
    );
}

export function renderStoryPanelLab(props: LabProps) {
    const state = optionProp(props, "state", "revision", ["revision", "empty"] as const);
    const title = textProp(props, "title", "Cosmos fixture story");
    const contentText = textProp(props, "contentText", "A synthetic Story body for component inspection.");
    const story: StoryDetail = {
        story: {
            id: "story-fixture",
            kind: "document",
            subtype: null,
            revisionId: "revision-fixture",
            title,
            summary: "A synthetic Story summary.",
        },
        entry: {
            id: "entry-fixture",
            sourceId: "source-fixture",
            sourceName: "Cosmos fixture",
            sourceKind: "fixture-rss",
            currentRevisionId: "revision-fixture",
            metrics: null,
            revisions: state === "empty" ? [] : [{
                id: "revision-fixture",
                revision: 1,
                title,
                summary: "A synthetic Story summary.",
                contentText,
                webUrl: null,
                contentKind: "article",
                publisher: null,
                publishedAt: null,
                updatedAt: null,
                sourcePublishedAt: null,
                createdAt: fixtureTimestamp,
                assets: [],
            }],
            observations: [{
                id: "observation-fixture",
                externalId: null,
                externalKey: "fixture:story",
                eventKind: "snapshot",
                webUrl: null,
                capturedAt: fixtureTimestamp,
                sourcePublishedAt: null,
            }],
        },
    };
    return <StoryPanel onClose={() => undefined} story={story} />;
}
