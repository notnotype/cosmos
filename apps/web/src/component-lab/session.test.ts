import {describe, expect, it} from "vitest";

import {
    normalizeLabQuery,
    serializeLabUrlState,
    type LabUrlContext,
} from "./session";

const context: LabUrlContext = {
    componentIds: ["button", "input"],
    scenesByComponent: {
        button: ["default", "disabled"],
        input: ["default", "invalid"],
    },
    defaultSceneByComponent: {
        button: "default",
        input: "default",
    },
    viewportIds: ["responsive", "wide"],
    themeIds: ["cosmos"],
    colorwayIds: ["light", "dark"],
    defaults: {
        component: "button",
        scene: "default",
        viewport: "responsive",
        theme: "cosmos",
        colorway: "light",
    },
};

describe("component lab URL session", () => {
    it("uses defaults when query values are missing", () => {
        expect(normalizeLabQuery(new URLSearchParams(), context)).toEqual(context.defaults);
    });

    it("normalizes unsupported values and a scene from another component", () => {
        const query = new URLSearchParams({
            component: "input",
            scene: "disabled",
            viewport: "phone",
            theme: "macos",
            colorway: "blue",
        });

        expect(normalizeLabQuery(query, context)).toEqual({
            component: "input",
            scene: "default",
            viewport: "responsive",
            theme: "cosmos",
            colorway: "light",
        });
    });

    it("round-trips a valid state through URLSearchParams", () => {
        const state = {
            component: "input",
            scene: "invalid",
            viewport: "wide",
            theme: "cosmos",
            colorway: "dark",
        } as const;
        const query = serializeLabUrlState(state);

        expect(normalizeLabQuery(query, context)).toEqual(state);
    });
});
