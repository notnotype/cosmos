import type {ComponentProps, ReactNode} from "react";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Field,
    FieldDescription,
    FieldLabel,
} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";
import {Textarea} from "@/components/ui/textarea";
import {
    renderFeedBrowserLab,
    renderSourceActionsLab,
    renderSourceFormLab,
    renderStatusSummaryLab,
    renderStoryPanelLab,
} from "./product-fixtures";

import type {LabComponentDefinition, LabControlDefinition, LabProps} from "./types";

export {labTokenDefinitions} from "./tokens";

const sharedTokens = [
    "--background",
    "--foreground",
    "--primary",
    "--primary-foreground",
    "--muted",
    "--muted-foreground",
    "--border",
    "--radius",
] as const;

const buttonVariants = [
    "default",
    "destructive",
    "ghost",
    "link",
    "outline",
    "secondary",
] as const satisfies readonly NonNullable<ComponentProps<typeof Button>["variant"]>[];

const buttonSizes = [
    "default",
    "lg",
    "sm",
    "xs",
] as const satisfies readonly NonNullable<ComponentProps<typeof Button>["size"]>[];

const badgeVariants = [
    "default",
    "destructive",
    "ghost",
    "link",
    "outline",
    "secondary",
] as const satisfies readonly NonNullable<ComponentProps<typeof Badge>["variant"]>[];

const cardSizes = ["default", "sm"] as const;
const orientations = ["horizontal", "vertical"] as const;

function textProp(props: LabProps, name: string, fallback: string): string {
    const value = props[name];
    return typeof value === "string" ? value : fallback;
}

function booleanProp(props: LabProps, name: string, fallback = false): boolean {
    const value = props[name];
    return typeof value === "boolean" ? value : fallback;
}

function optionProp<T extends string>(
    props: LabProps,
    name: string,
    fallback: T,
    options: readonly T[],
): T {
    const value = props[name];
    return typeof value === "string" && options.includes(value as T)
        ? value as T
        : fallback;
}

function control(
    name: string,
    label: string,
    kind: LabControlDefinition["kind"],
    defaultValue: string | boolean,
    options?: readonly string[],
): LabControlDefinition {
    if (kind === "select") {
        return {name, label, kind, defaultValue: String(defaultValue), options: options ?? []};
    }
    return {name, label, kind, defaultValue};
}

function renderButton(props: LabProps): ReactNode {
    const variant = optionProp(props, "variant", "default", buttonVariants);
    const size = optionProp(props, "size", "default", buttonSizes);
    return (
        <Button
            disabled={booleanProp(props, "disabled")}
            size={size}
            variant={variant}
        >
            {textProp(props, "label", "Button")}
        </Button>
    );
}

function renderBadge(props: LabProps): ReactNode {
    const variant = optionProp(props, "variant", "default", badgeVariants);
    return <Badge variant={variant}>{textProp(props, "label", "Badge")}</Badge>;
}

function renderCard(props: LabProps): ReactNode {
    const size = optionProp(props, "size", "default", cardSizes);
    return (
        <Card size={size} className="w-full max-w-md">
            <CardHeader>
                <CardTitle>{textProp(props, "title", "Card title")}</CardTitle>
                <CardDescription>
                    {textProp(props, "description", "Card description")}
                </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
                A stable card fixture for spacing, hierarchy, and long text.
            </CardContent>
        </Card>
    );
}

function renderField(props: LabProps): ReactNode {
    const invalid = booleanProp(props, "invalid");
    return (
        <Field data-invalid={invalid} className="w-full max-w-md">
            <FieldLabel htmlFor="component-lab-field">
                {textProp(props, "label", "Field label")}
            </FieldLabel>
            <Input
                id="component-lab-field"
                aria-invalid={invalid}
                disabled={booleanProp(props, "disabled")}
                placeholder={textProp(props, "placeholder", "Type something")}
                readOnly
                value={textProp(props, "value", "Preview value")}
            />
            <FieldDescription>
                {invalid ? "This field contains an error." : "Supporting field description."}
            </FieldDescription>
        </Field>
    );
}

function renderInput(props: LabProps): ReactNode {
    const invalid = booleanProp(props, "invalid");
    return (
        <Input
            aria-invalid={invalid}
            className="max-w-md"
            disabled={booleanProp(props, "disabled")}
            placeholder={textProp(props, "placeholder", "Type something")}
            readOnly
            value={textProp(props, "value", "Preview value")}
        />
    );
}

function renderLabel(props: LabProps): ReactNode {
    return <Label htmlFor="component-lab-label-input">{textProp(props, "label", "Label")}</Label>;
}

function renderSeparator(props: LabProps): ReactNode {
    const orientation = optionProp(props, "orientation", "horizontal", orientations);
    return <Separator orientation={orientation} className={orientation === "vertical" ? "h-12" : "w-full max-w-md"} />;
}

function renderTextarea(props: LabProps): ReactNode {
    const invalid = booleanProp(props, "invalid");
    return (
        <Textarea
            aria-invalid={invalid}
            className="max-w-md"
            disabled={booleanProp(props, "disabled")}
            placeholder={textProp(props, "placeholder", "Type something")}
            readOnly
            value={textProp(props, "value", "Preview value")}
        />
    );
}

const buttonControls = [
    control("label", "Label", "text", "Button"),
    control("variant", "Variant", "select", "default", buttonVariants),
    control("size", "Size", "select", "default", buttonSizes),
    control("disabled", "Disabled", "boolean", false),
] as const satisfies readonly LabControlDefinition[];

const badgeControls = [
    control("label", "Label", "text", "Badge"),
    control("variant", "Variant", "select", "default", badgeVariants),
] as const satisfies readonly LabControlDefinition[];

const cardControls = [
    control("title", "Title", "text", "Card title"),
    control("description", "Description", "text", "Card description"),
    control("size", "Size", "select", "default", cardSizes),
] as const satisfies readonly LabControlDefinition[];

const fieldControls = [
    control("label", "Label", "text", "Field label"),
    control("placeholder", "Placeholder", "text", "Type something"),
    control("value", "Value", "text", "Preview value"),
    control("invalid", "Invalid", "boolean", false),
    control("disabled", "Disabled", "boolean", false),
] as const satisfies readonly LabControlDefinition[];

const inputControls = [
    control("placeholder", "Placeholder", "text", "Type something"),
    control("value", "Value", "text", "Preview value"),
    control("invalid", "Invalid", "boolean", false),
    control("disabled", "Disabled", "boolean", false),
] as const satisfies readonly LabControlDefinition[];

const labelControls = [
    control("label", "Label", "text", "Label"),
] as const satisfies readonly LabControlDefinition[];

const separatorControls = [
    control("orientation", "Orientation", "select", "horizontal", orientations),
] as const satisfies readonly LabControlDefinition[];

const textareaControls = [
    control("placeholder", "Placeholder", "text", "Type something"),
    control("value", "Value", "text", "Preview value"),
    control("invalid", "Invalid", "boolean", false),
    control("disabled", "Disabled", "boolean", false),
] as const satisfies readonly LabControlDefinition[];
const sourceFormControls = [
    control("name", "Name", "text", "Cosmos fixture"),
    control("fixturePath", "Fixture path", "text", "fixtures/rss/basic.xml"),
] as const satisfies readonly LabControlDefinition[];

const statusSummaryControls = [
    control("sourceSummary", "Source summary", "text", "尚未配置来源"),
    control("health", "Health", "select", "unknown", ["unknown", "ready", "failed"]),
    control("eventStreamState", "Event stream", "select", "connecting", ["connecting", "connected", "unavailable"]),
] as const satisfies readonly LabControlDefinition[];

const sourceActionsControls = [
    control("sourceName", "Source name", "text", "Cosmos fixture"),
    control("state", "State", "select", "configured", ["configured", "empty", "disabled"]),
    control("enabled", "Enabled", "boolean", true),
] as const satisfies readonly LabControlDefinition[];

const feedBrowserControls = [
    control("title", "Story title", "text", "Cosmos fixture story"),
    control("state", "State", "select", "populated", ["loading", "empty", "populated"]),
] as const satisfies readonly LabControlDefinition[];

const storyPanelControls = [
    control("title", "Story title", "text", "Cosmos fixture story"),
    control("contentText", "Content", "text", "A synthetic Story body for component inspection."),
    control("state", "State", "select", "revision", ["revision", "empty"]),
] as const satisfies readonly LabControlDefinition[];

export const labComponentDefinitions = [
    {
        id: "badge",
        label: "Badge",
        category: "Display",
        modulePath: "components/ui/badge.tsx",
        defaultSceneId: "default",
        controls: badgeControls,
        scenes: [
            {id: "default", label: "Default", props: {label: "Badge", variant: "default"}},
            {id: "status", label: "Status", props: {label: "Ready", variant: "secondary"}},
            {id: "danger", label: "Danger", props: {label: "Failed", variant: "destructive"}},
        ],
        tokens: sharedTokens,
        render: renderBadge,
    },
    {
        id: "button",
        label: "Button",
        category: "Controls",
        modulePath: "components/ui/button.tsx",
        defaultSceneId: "default",
        controls: buttonControls,
        scenes: [
            {id: "default", label: "Default", props: {label: "Continue", variant: "default", size: "default", disabled: false}},
            {id: "destructive", label: "Destructive", props: {label: "Delete", variant: "destructive", size: "default", disabled: false}},
            {id: "disabled", label: "Disabled", props: {label: "Unavailable", variant: "default", size: "default", disabled: true}},
        ],
        tokens: sharedTokens,
        render: renderButton,
    },
    {
        id: "card",
        label: "Card",
        category: "Layout",
        modulePath: "components/ui/card.tsx",
        defaultSceneId: "default",
        controls: cardControls,
        scenes: [
            {id: "default", label: "Default", props: {title: "Card title", description: "Card description", size: "default"}},
            {id: "long-content", label: "Long content", props: {title: "A deliberately long card title that tests wrapping", description: "A longer description lets the laboratory expose hierarchy, wrapping, and panel width without a network fixture.", size: "default"}},
            {id: "compact", label: "Compact", props: {title: "Compact card", description: "Small card spacing", size: "sm"}},
        ],
        tokens: sharedTokens,
        render: renderCard,
    },
    {
        id: "field",
        label: "Field",
        category: "Forms",
        modulePath: "components/ui/field.tsx",
        defaultSceneId: "default",
        controls: fieldControls,
        scenes: [
            {id: "default", label: "Default", props: {label: "Name", placeholder: "Your name", value: "Cosmos", invalid: false, disabled: false}},
            {id: "invalid", label: "Invalid", props: {label: "Email", placeholder: "name@example.com", value: "invalid", invalid: true, disabled: false}},
            {id: "disabled", label: "Disabled", props: {label: "Locked field", placeholder: "Unavailable", value: "Read only", invalid: false, disabled: true}},
        ],
        tokens: sharedTokens,
        render: renderField,
    },
    {
        id: "input",
        label: "Input",
        category: "Forms",
        modulePath: "components/ui/input.tsx",
        defaultSceneId: "default",
        controls: inputControls,
        scenes: [
            {id: "default", label: "Default", props: {placeholder: "Search", value: "", invalid: false, disabled: false}},
            {id: "invalid", label: "Invalid", props: {placeholder: "Search", value: "Bad query", invalid: true, disabled: false}},
            {id: "disabled", label: "Disabled", props: {placeholder: "Unavailable", value: "", invalid: false, disabled: true}},
        ],
        tokens: sharedTokens,
        render: renderInput,
    },
    {
        id: "label",
        label: "Label",
        category: "Forms",
        modulePath: "components/ui/label.tsx",
        defaultSceneId: "default",
        controls: labelControls,
        scenes: [
            {id: "default", label: "Default", props: {label: "Field label"}},
            {id: "long-text", label: "Long text", props: {label: "A label with enough text to test wrapping and readable spacing"}},
        ],
        tokens: sharedTokens,
        render: renderLabel,
    },
    {
        id: "separator",
        label: "Separator",
        category: "Layout",
        modulePath: "components/ui/separator.tsx",
        defaultSceneId: "default",
        controls: separatorControls,
        scenes: [
            {id: "default", label: "Horizontal", props: {orientation: "horizontal"}},
            {id: "vertical", label: "Vertical", props: {orientation: "vertical"}},
        ],
        tokens: sharedTokens,
        render: renderSeparator,
    },
    {
        id: "textarea",
        label: "Textarea",
        category: "Forms",
        modulePath: "components/ui/textarea.tsx",
        defaultSceneId: "default",
        controls: textareaControls,
        scenes: [
            {id: "default", label: "Default", props: {placeholder: "Write a note", value: "Preview text", invalid: false, disabled: false}},
            {id: "long-text", label: "Long text", props: {placeholder: "Write a note", value: "A long multiline value helps verify wrapping and the fixed control boundary in narrow viewports.", invalid: false, disabled: false}},
            {id: "invalid", label: "Invalid", props: {placeholder: "Required", value: "", invalid: true, disabled: false}},
        ],
        tokens: sharedTokens,
        render: renderTextarea,
    },
    {
        id: "feed-browser",
        label: "FeedBrowser",
        category: "Cosmos",
        modulePath: "components/cosmos/feed-browser.tsx",
        defaultSceneId: "populated",
        controls: feedBrowserControls,
        scenes: [
            {id: "populated", label: "Populated", props: {title: "Cosmos fixture story", state: "populated"}},
            {id: "loading", label: "Loading", props: {title: "Cosmos fixture story", state: "loading"}},
            {id: "empty", label: "Empty", props: {title: "Cosmos fixture story", state: "empty"}},
        ],
        tokens: sharedTokens,
        render: renderFeedBrowserLab,
    },
    {
        id: "source-actions",
        label: "SourceActions",
        category: "Cosmos",
        modulePath: "components/cosmos/source-actions.tsx",
        defaultSceneId: "configured",
        controls: sourceActionsControls,
        scenes: [
            {id: "configured", label: "Configured", props: {sourceName: "Cosmos fixture", state: "configured", enabled: true}},
            {id: "empty", label: "Empty", props: {sourceName: "Cosmos fixture", state: "empty", enabled: true}},
            {id: "disabled", label: "Disabled", props: {sourceName: "Cosmos fixture", state: "disabled", enabled: false}},
        ],
        tokens: sharedTokens,
        render: renderSourceActionsLab,
    },
    {
        id: "source-form",
        label: "SourceForm",
        category: "Cosmos",
        modulePath: "components/cosmos/source-form.tsx",
        defaultSceneId: "default",
        controls: sourceFormControls,
        scenes: [
            {id: "default", label: "Default", props: {name: "Cosmos fixture", fixturePath: "fixtures/rss/basic.xml"}},
            {id: "long-text", label: "Long text", props: {name: "A source name long enough to test wrapping", fixturePath: "fixtures/rss/a-long-fixture-path.xml"}},
        ],
        tokens: sharedTokens,
        render: renderSourceFormLab,
    },
    {
        id: "status-summary",
        label: "StatusSummary",
        category: "Cosmos",
        modulePath: "components/cosmos/status-summary.tsx",
        defaultSceneId: "default",
        controls: statusSummaryControls,
        scenes: [
            {id: "default", label: "Default", props: {sourceSummary: "2 个来源，1 个启用", health: "ready", eventStreamState: "connected"}},
            {id: "unavailable", label: "Unavailable", props: {sourceSummary: "尚未配置来源", health: "unknown", eventStreamState: "unavailable"}},
            {id: "failed", label: "Failed", props: {sourceSummary: "1 个来源，0 个启用", health: "failed", eventStreamState: "connecting"}},
        ],
        tokens: sharedTokens,
        render: renderStatusSummaryLab,
    },
    {
        id: "story-panel",
        label: "StoryPanel",
        category: "Cosmos",
        modulePath: "components/cosmos/story-panel.tsx",
        defaultSceneId: "default",
        controls: storyPanelControls,
        scenes: [
            {id: "default", label: "Default", props: {title: "Cosmos fixture story", contentText: "A synthetic Story body for component inspection.", state: "revision"}},
            {id: "empty", label: "Empty revision", props: {title: "Story without revision", contentText: "", state: "empty"}},
            {id: "long-text", label: "Long text", props: {title: "A long Story title that tests wrapping", contentText: "A long synthetic body lets the laboratory verify readable wrapping and metadata spacing.", state: "revision"}},
        ],
        tokens: sharedTokens,
        render: renderStoryPanelLab,
    },
] as const satisfies readonly LabComponentDefinition[];
