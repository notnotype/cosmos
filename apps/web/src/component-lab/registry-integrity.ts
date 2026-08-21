import {readdirSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

import {isSafeLabTokenValue} from "./snapshot";
import type {LabComponentDefinition, LabTokenDefinition} from "./types";

export type RegistryIntegrityInput = {
    componentDefinitions: readonly LabComponentDefinition[];
    tokenDefinitions: readonly LabTokenDefinition[];
    publicModules: readonly string[];
};

export type RegistryIntegrityReport = {
    failures: readonly string[];
};

function duplicateValues(values: readonly string[]): string[] {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([value]) => value);
}

function isControlValueValid(
    control: LabComponentDefinition["controls"][number],
    value: unknown,
): boolean {
    if (control.kind === "boolean") {
        return typeof value === "boolean";
    }
    if (control.kind === "select") {
        return typeof value === "string" && control.options.includes(value);
    }
    if (control.kind === "text") {
        return typeof value === "string";
    }
    return typeof value === "string" && isSafeLabTokenValue(value, control.kind);
}

function rootPath(root: string | URL): string {
    return root instanceof URL ? fileURLToPath(root) : root;
}

/** Discover public component modules in the UI and Cosmos presentation directories. */
export function discoverPublicComponentModules(root: string | URL): readonly string[] {
    const rootDirectory = rootPath(root);
    return [
        [join(rootDirectory, "apps", "web", "src", "components", "cosmos"), "components/cosmos"],
        [join(rootDirectory, "apps", "web", "src", "components", "ui"), "components/ui"],
    ].flatMap(([directory, prefix]) =>
        readdirSync(directory, {withFileTypes: true})
            .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
            .map((entry) => `${prefix}/${entry.name}`),
    ).toSorted();
}

export function assertRegistryIntegrity(
    input: RegistryIntegrityInput,
): RegistryIntegrityReport {
    const failures: string[] = [];
    const componentIds = input.componentDefinitions.map((definition) => definition.id);
    const modulePaths = input.componentDefinitions.map((definition) => definition.modulePath);
    const publicModules = [...input.publicModules];
    const tokenNames = input.tokenDefinitions.map((token) => token.name);

    for (const id of duplicateValues(componentIds)) {
        failures.push(`multiple definitions for component "${id}"`);
    }
    for (const modulePath of duplicateValues(modulePaths)) {
        failures.push(`multiple definitions for module "${modulePath}"`);
    }
    for (const modulePath of duplicateValues(publicModules)) {
        failures.push(`multiple public modules "${modulePath}"`);
    }
    for (const tokenName of duplicateValues(tokenNames)) {
        failures.push(`multiple token definitions for "${tokenName}"`);
    }

    const definitionModules = new Set(modulePaths);
    const discoveredModules = new Set(publicModules);
    for (const modulePath of publicModules) {
        if (!definitionModules.has(modulePath)) {
            failures.push(`public module "${modulePath}" has no lab definition`);
        }
    }
    for (const modulePath of modulePaths) {
        if (!discoveredModules.has(modulePath)) {
            failures.push(`lab definition references missing module "${modulePath}"`);
        }
    }

    const knownTokens = new Set(tokenNames);
    for (const token of input.tokenDefinitions) {
        if (!/^--[a-z][a-z0-9-]*$/u.test(token.name)) {
            failures.push(`invalid token name "${token.name}"`);
        }
        if (!isSafeLabTokenValue(token.defaultValue, token.kind)) {
            failures.push(`token "${token.name}" has invalid default value`);
        }
    }

    for (const definition of input.componentDefinitions) {
        if (definition.id.trim() === "") {
            failures.push("component id cannot be empty");
        }
        if (definition.modulePath.trim() === "") {
            failures.push(`component "${definition.id}" has an empty module path`);
        }
        if (typeof definition.render !== "function") {
            failures.push(`component "${definition.id}" has no render function`);
        }
        if (definition.scenes.length === 0) {
            failures.push(`component "${definition.id}" has no scenes`);
        }
        if (!definition.scenes.some((scene) => scene.id === definition.defaultSceneId)) {
            failures.push(`component "${definition.id}" has no default scene "${definition.defaultSceneId}"`);
        }

        const sceneIds = definition.scenes.map((scene) => scene.id);
        for (const sceneId of duplicateValues(sceneIds)) {
            failures.push(`component "${definition.id}" has multiple scenes "${sceneId}"`);
        }

        const controlNames = definition.controls.map((control) => control.name);
        for (const controlName of duplicateValues(controlNames)) {
            failures.push(`component "${definition.id}" has multiple controls "${controlName}"`);
        }
        for (const control of definition.controls) {
            if (control.kind === "select") {
                if (control.options.length === 0) {
                    failures.push(`control "${definition.id}.${control.name}" has no options`);
                }
                for (const option of duplicateValues(control.options)) {
                    failures.push(`control "${definition.id}.${control.name}" has duplicate option "${option}"`);
                }
            }
            if (!isControlValueValid(control, control.defaultValue)) {
                failures.push(`control "${definition.id}.${control.name}" has invalid default value`);
            }
            for (const scene of definition.scenes) {
                if (!Object.hasOwn(scene.props, control.name)) {
                    failures.push(`scene "${definition.id}.${scene.id}" has no value for control "${control.name}"`);
                } else if (!isControlValueValid(control, scene.props[control.name])) {
                    failures.push(`scene "${definition.id}.${scene.id}" has invalid scene value for control "${control.name}" (${control.kind})`);
                }
            }
        }
        for (const tokenName of definition.tokens) {
            if (!knownTokens.has(tokenName)) {
                failures.push(`component "${definition.id}" uses unregistered token "${tokenName}"`);
            }
        }
    }

    return {failures};
}
