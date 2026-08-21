import type {ReactNode} from "react";

export type LabPrimitive = boolean | number | string;
export type LabProps = Readonly<Record<string, LabPrimitive>>;

export type LabControlDefinition =
    | {
        name: string;
        label: string;
        kind: "boolean" | "color" | "length" | "text";
        defaultValue: LabPrimitive;
    }
    | {
        name: string;
        label: string;
        kind: "select";
        defaultValue: string;
        options: readonly string[];
    };

export type LabTokenName = `--${string}`;

export type LabTokenDefinition = {
    name: LabTokenName;
    label: string;
    kind: "color" | "length";
    defaultValue: string;
    description?: string;
};

export type LabScene = {
    id: string;
    label: string;
    description?: string;
    props: LabProps;
};

export type LabComponentDefinition = {
    id: string;
    label: string;
    category: string;
    modulePath: string;
    defaultSceneId: string;
    controls: readonly LabControlDefinition[];
    scenes: readonly LabScene[];
    tokens: readonly LabTokenName[];
    render: (props: LabProps) => ReactNode;
};

export type LabThemeId = "cosmos";
export type LabColorwayId = "dark" | "light";
export type LabViewportId = "responsive" | "wide";
