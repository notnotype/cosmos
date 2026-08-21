import type {LabTokenDefinition, LabTokenName} from "./types";

export const labTokenDefinitions = [
    {
        name: "--background",
        label: "背景",
        kind: "color",
        defaultValue: "oklch(1 0 0)",
    },
    {
        name: "--foreground",
        label: "前景文字",
        kind: "color",
        defaultValue: "oklch(0.145 0 0)",
    },
    {
        name: "--primary",
        label: "主色",
        kind: "color",
        defaultValue: "oklch(0.205 0 0)",
    },
    {
        name: "--primary-foreground",
        label: "主色文字",
        kind: "color",
        defaultValue: "oklch(0.985 0 0)",
    },
    {
        name: "--muted",
        label: "弱化背景",
        kind: "color",
        defaultValue: "oklch(0.97 0 0)",
    },
    {
        name: "--muted-foreground",
        label: "弱化文字",
        kind: "color",
        defaultValue: "oklch(0.556 0 0)",
    },
    {
        name: "--border",
        label: "边框",
        kind: "color",
        defaultValue: "oklch(0.922 0 0)",
    },
    {
        name: "--radius",
        label: "圆角",
        kind: "length",
        defaultValue: "0.625rem",
    },
] as const satisfies readonly LabTokenDefinition[];

export const labTokenNames = labTokenDefinitions.map(
    (token): LabTokenName => token.name,
);
