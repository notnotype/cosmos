export type LabUrlState = {
    component: string;
    scene: string;
    viewport: string;
    theme: string;
    colorway: string;
};

export type LabUrlContext = {
    componentIds: readonly string[];
    scenesByComponent: Readonly<Record<string, readonly string[]>>;
    defaultSceneByComponent: Readonly<Record<string, string>>;
    viewportIds: readonly string[];
    themeIds: readonly string[];
    colorwayIds: readonly string[];
    defaults: LabUrlState;
};

export type LabQuery = {
    get: (name: string) => string | null;
};

function supportedValue(
    query: LabQuery,
    name: string,
    allowed: readonly string[],
    fallback: string,
): string {
    const value = query.get(name);
    return value !== null && allowed.includes(value) ? value : fallback;
}

export function normalizeLabQuery(query: LabQuery, context: LabUrlContext): LabUrlState {
    const component = supportedValue(
        query,
        "component",
        context.componentIds,
        context.defaults.component,
    );
    const sceneOptions = context.scenesByComponent[component] ?? [];
    const sceneFallback = context.defaultSceneByComponent[component]
        ?? context.defaults.scene;

    return {
        component,
        scene: supportedValue(query, "scene", sceneOptions, sceneFallback),
        viewport: supportedValue(
            query,
            "viewport",
            context.viewportIds,
            context.defaults.viewport,
        ),
        theme: supportedValue(query, "theme", context.themeIds, context.defaults.theme),
        colorway: supportedValue(
            query,
            "colorway",
            context.colorwayIds,
            context.defaults.colorway,
        ),
    };
}

export function serializeLabUrlState(state: LabUrlState): URLSearchParams {
    return new URLSearchParams([
        ["component", state.component],
        ["scene", state.scene],
        ["viewport", state.viewport],
        ["theme", state.theme],
        ["colorway", state.colorway],
    ]);
}
