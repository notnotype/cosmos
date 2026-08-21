import {describe, expect, it} from "vitest";

import {
    assertRegistryIntegrity,
    discoverPublicComponentModules,
} from "./registry-integrity";
import {
    labComponentDefinitions,
    labTokenDefinitions,
} from "./registry";

const expectedPublicModules = [
    "components/ui/badge.tsx",
    "components/ui/button.tsx",
    "components/ui/card.tsx",
    "components/ui/field.tsx",
    "components/ui/input.tsx",
    "components/ui/label.tsx",
    "components/ui/separator.tsx",
    "components/ui/textarea.tsx",
    "components/cosmos/feed-browser.tsx",
    "components/cosmos/source-actions.tsx",
    "components/cosmos/source-form.tsx",
    "components/cosmos/status-summary.tsx",
    "components/cosmos/story-panel.tsx",
] as const;

describe("component lab registry", () => {
    it("registers every reusable public module with a default scene", () => {
        const report = assertRegistryIntegrity({
            componentDefinitions: labComponentDefinitions,
            tokenDefinitions: labTokenDefinitions,
            publicModules: expectedPublicModules,
        });

        expect(report.failures).toEqual([]);
        expect(labComponentDefinitions).toHaveLength(expectedPublicModules.length);
        expect(labComponentDefinitions.every((definition) => definition.defaultSceneId.length > 0)).toBe(true);
    });

    it("has one definition for each public module", () => {
        const modulePaths = labComponentDefinitions.map((definition) => definition.modulePath);

        expect(new Set(modulePaths).size).toBe(modulePaths.length);
        expect(modulePaths.toSorted()).toEqual(expectedPublicModules.toSorted());
    });

    it("uses unique component and scene identifiers", () => {
        const componentIds = labComponentDefinitions.map((definition) => definition.id);
        const sceneIds = labComponentDefinitions.flatMap((definition) =>
            definition.scenes.map((scene) => `${definition.id}:${scene.id}`),
        );

        expect(new Set(componentIds).size).toBe(componentIds.length);
        expect(new Set(sceneIds).size).toBe(sceneIds.length);
    });

    it("keeps scenario defaults inside each control schema", () => {
        for (const definition of labComponentDefinitions) {
            for (const scene of definition.scenes) {
                for (const control of definition.controls) {
                    expect(Object.hasOwn(scene.props, control.name)).toBe(true);
                }
            }
        }
    });

    it("only exposes registered design tokens", () => {
        const knownTokens = new Set(labTokenDefinitions.map((token) => token.name));

        for (const definition of labComponentDefinitions) {
            for (const token of definition.tokens) {
                expect(knownTokens.has(token)).toBe(true);
            }
        }
    });

    it("discovers the same public modules that the registry owns", () => {
        const discovered = discoverPublicComponentModules(
            new URL("../../../../", import.meta.url),
        );

        expect(discovered).toEqual(expectedPublicModules.toSorted());
        expect(labComponentDefinitions.map((definition) => definition.modulePath).toSorted())
            .toEqual(discovered.toSorted());
    });
    it("reports duplicate component identifiers", () => {
        const first = labComponentDefinitions[0];
        const report = assertRegistryIntegrity({
            componentDefinitions: [
                ...labComponentDefinitions,
                {...first},
            ],
            tokenDefinitions: labTokenDefinitions,
            publicModules: expectedPublicModules,
        });

        expect(report.failures.some((failure) => failure.includes("multiple definitions"))).toBe(true);
    });

    it("reports a missing default scene", () => {
        const first = labComponentDefinitions[0];
        const report = assertRegistryIntegrity({
            componentDefinitions: [
                {...first, defaultSceneId: "missing-scene"},
                ...labComponentDefinitions.slice(1),
            ],
            tokenDefinitions: labTokenDefinitions,
            publicModules: expectedPublicModules,
        });

        expect(report.failures.some((failure) => failure.includes("default scene"))).toBe(true);
    });

    it("rejects a select default outside its options", () => {
        const first = labComponentDefinitions.find((definition) => definition.id === "status-summary")!;
        const report = assertRegistryIntegrity({
            componentDefinitions: [{
                ...first,
                controls: first.controls.map((control) => control.name === "health"
                    ? {...control, defaultValue: "invalid"}
                    : control),
            }, ...labComponentDefinitions.filter((definition) => definition !== first)],
            tokenDefinitions: labTokenDefinitions,
            publicModules: expectedPublicModules,
        });

        expect(report.failures.some((failure) => failure.includes("default value"))).toBe(true);
    });

    it("rejects a select scene value outside its options", () => {
        const first = labComponentDefinitions.find((definition) => definition.id === "status-summary")!;
        const report = assertRegistryIntegrity({
            componentDefinitions: [{
                ...first,
                scenes: first.scenes.map((scene, index) => index === 0
                    ? {...scene, props: {...scene.props, health: "invalid"}}
                    : scene),
            }, ...labComponentDefinitions.filter((definition) => definition !== first)],
            tokenDefinitions: labTokenDefinitions,
            publicModules: expectedPublicModules,
        });

        expect(report.failures.some((failure) => failure.includes("scene value"))).toBe(true);
    });

    it("rejects a boolean scene value with the wrong primitive type", () => {
        const first = labComponentDefinitions.find((definition) => definition.id === "source-actions")!;
        const report = assertRegistryIntegrity({
            componentDefinitions: [{
                ...first,
                scenes: first.scenes.map((scene, index) => index === 0
                    ? {...scene, props: {...scene.props, enabled: "true"}}
                    : scene),
            }, ...labComponentDefinitions.filter((definition) => definition !== first)],
            tokenDefinitions: labTokenDefinitions,
            publicModules: expectedPublicModules,
        });

        expect(report.failures.some((failure) => failure.includes("boolean"))).toBe(true);
    });

    it("rejects an invalid registered token default", () => {
        const report = assertRegistryIntegrity({
            componentDefinitions: labComponentDefinitions,
            tokenDefinitions: labTokenDefinitions.map((token, index) => index === 0
                ? {...token, defaultValue: "red; color: blue"}
                : token),
            publicModules: expectedPublicModules,
        });

        expect(report.failures.some((failure) => failure.includes("invalid default value"))).toBe(true);
    });
});
