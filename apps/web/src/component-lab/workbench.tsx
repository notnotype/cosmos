"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";

import {Badge} from "@/components/ui/badge";
import {Card, CardContent} from "@/components/ui/card";

import {labComponentDefinitions} from "./registry";
import {saveLabTokenDraft} from "./draft";
import {LabInspector} from "./lab-inspector";
import {normalizeLabQuery, serializeLabUrlState, type LabUrlContext, type LabUrlState} from "./session";
import {parseLabOverrideSnapshot, serializeLabOverrideSnapshot} from "./snapshot";
import {LabNav} from "./lab-nav";
import {LabStage} from "./lab-stage";
import {notifyLabTokenDraftChange, useLabTokenDraft} from "./use-token-draft";
import {labTokenDefinitions} from "./tokens";
import type {LabColorwayId, LabProps, LabTokenName, LabViewportId} from "./types";

const labContext: LabUrlContext = {
    componentIds: labComponentDefinitions.map((definition) => definition.id),
    scenesByComponent: Object.fromEntries(
        labComponentDefinitions.map((definition) => [
            definition.id,
            definition.scenes.map((scene) => scene.id),
        ]),
    ),
    defaultSceneByComponent: Object.fromEntries(
        labComponentDefinitions.map((definition) => [definition.id, definition.defaultSceneId]),
    ),
    viewportIds: ["responsive", "wide"],
    themeIds: ["cosmos"],
    colorwayIds: ["light", "dark"],
    defaults: {
        component: labComponentDefinitions[0]?.id ?? "button",
        scene: labComponentDefinitions[0]?.defaultSceneId ?? "default",
        viewport: "responsive",
        theme: "cosmos",
        colorway: "light",
    },
};

export function ComponentLabWorkbench() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const session = useMemo(
        () => normalizeLabQuery(searchParams, labContext),
        [searchParams],
    );
    const definition = labComponentDefinitions.find((item) => item.id === session.component)
        ?? labComponentDefinitions[0]!;
    const scene = definition.scenes.find((item) => item.id === session.scene)
        ?? definition.scenes[0]!;

    const normalizedQuery = useMemo(
        () => serializeLabUrlState(session).toString(),
        [session],
    );

    useEffect(() => {
        if (searchParams.toString() !== normalizedQuery) {
            router.replace(`${pathname}?${normalizedQuery}`);
        }
    }, [normalizedQuery, pathname, router, searchParams]);

    const updateSession = useCallback((next: Partial<LabUrlState>) => {
        const nextSession = {...session, ...next};
        if (next.component !== undefined && next.component !== session.component) {
            nextSession.scene = labContext.defaultSceneByComponent[next.component]
                ?? labContext.defaults.scene;
        }
        router.push(`${pathname}?${serializeLabUrlState(nextSession).toString()}`);
    }, [pathname, router, session]);

    return (
        <main className="min-h-screen bg-muted/30 text-foreground">
            <header className="border-b bg-background">
                <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
                    <div className="flex items-center gap-3">
                        <Badge variant="secondary">DEV</Badge>
                        <div>
                            <h1 className="font-semibold">Cosmos Component Lab</h1>
                            <p className="text-xs text-muted-foreground">真实组件 · 固定 fixture · 不连接服务</p>
                        </div>
                    </div>
                    <p className="min-w-0 max-w-full break-all text-right text-xs text-muted-foreground">{normalizedQuery}</p>
                </div>
            </header>
            <LabSurface
                definition={definition}
                key={`${definition.id}:${scene.id}`}
                onSessionChange={updateSession}
                scene={scene}
                session={session}
            />
        </main>
    );
}

type LabSurfaceProps = {
    definition: (typeof labComponentDefinitions)[number];
    onSessionChange: (next: Partial<LabUrlState>) => void;
    scene: (typeof labComponentDefinitions)[number]["scenes"][number];
    session: LabUrlState;
};

function LabSurface({definition, onSessionChange, scene, session}: LabSurfaceProps) {
    const [props, setProps] = useState<LabProps>(() => scene.props);
    const [tokenWriteError, setTokenWriteError] = useState<string | null>(null);
    const [tokenRevision, setTokenRevision] = useState(0);
    const tokenDefinitions = useMemo(
        () => labTokenDefinitions.filter((token) => definition.tokens.includes(token.name)),
        [definition],
    );
    const draft = useLabTokenDraft(tokenDefinitions);
    const updateProp = useCallback((name: string, value: LabProps[string]) => {
        setProps((current) => ({...current, [name]: value}));
    }, []);
    const updateToken = useCallback((name: LabTokenName, value: string) => {
        const normalizedValue = value.trim();
        const next = {...draft.overrides};
        if (normalizedValue.length === 0) {
            delete next[name];
        } else {
            try {
                const parsed = parseLabOverrideSnapshot(
                    serializeLabOverrideSnapshot({[name]: normalizedValue}),
                    tokenDefinitions,
                );
                Object.assign(next, parsed);
            } catch (error) {
                setTokenWriteError(error instanceof Error ? error.message : "invalid token value");
                return;
            }
        }
        const result = saveLabTokenDraft(window.localStorage, next);
        setTokenWriteError(result.error);
        if (result.error === null) {
            setTokenRevision((current) => current + 1);
            notifyLabTokenDraftChange();
        }
    }, [draft.overrides, tokenDefinitions]);
    const importTokens = useCallback((raw: string) => {
        try {
            const next = parseLabOverrideSnapshot(raw, tokenDefinitions);
            const result = saveLabTokenDraft(window.localStorage, next);
            setTokenWriteError(result.error);
            if (result.error === null) {
                setTokenRevision((current) => current + 1);
                notifyLabTokenDraftChange();
            }
        } catch (error) {
            setTokenWriteError(error instanceof Error ? error.message : "invalid token snapshot");
        }
    }, [tokenDefinitions]);

    return (
        <>
            <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 md:p-6 lg:grid-cols-[14rem_minmax(0,1fr)_18rem]">
                <LabNav
                    definitions={labComponentDefinitions}
                    onSelect={(component) => onSessionChange({component})}
                    selectedId={definition.id}
                />
                <LabStage
                    colorway={session.colorway as LabColorwayId}
                    definition={definition}
                    onColorwayChange={(colorway) => onSessionChange({colorway})}
                    onSceneChange={(sceneId) => onSessionChange({scene: sceneId})}
                    onViewportChange={(viewport) => onSessionChange({viewport})}
                    props={props}
                    scene={scene}
                    tokenOverrides={draft.overrides}
                    viewport={session.viewport as LabViewportId}
                />
                <LabInspector
                    definition={definition}
                    key={tokenRevision}
                    onChange={updateProp}
                    onImport={importTokens}
                    onTokenChange={updateToken}
                    props={props}
                    tokenDefinitions={tokenDefinitions}
                    tokenError={draft.error ?? tokenWriteError}
                    tokenOverrides={draft.overrides}
                />
            </div>
            <Card className="mx-auto mb-6 max-w-[1600px] border-dashed">
                <CardContent className="p-4 text-xs text-muted-foreground">
                    URL 保存组件、场景、画布、主题和配色；token 草稿版本化保存在 localStorage，可导入或导出 JSON。
                </CardContent>
            </Card>
        </>
    );
}
