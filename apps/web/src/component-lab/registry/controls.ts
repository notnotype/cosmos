import type {LabControlDefinition} from "../types";
import {
    badgeVariants,
    buttonSizes,
    buttonVariants,
    cardSizes,
    control,
    orientations,
} from "./shared";

export const buttonControls = [
    control("label", "Label", "text", "Button"),
    control("variant", "Variant", "select", "default", buttonVariants),
    control("size", "Size", "select", "default", buttonSizes),
    control("disabled", "Disabled", "boolean", false),
] as const satisfies readonly LabControlDefinition[];

export const badgeControls = [
    control("label", "Label", "text", "Badge"),
    control("variant", "Variant", "select", "default", badgeVariants),
] as const satisfies readonly LabControlDefinition[];

export const cardControls = [
    control("title", "Title", "text", "Card title"),
    control("description", "Description", "text", "Card description"),
    control("size", "Size", "select", "default", cardSizes),
] as const satisfies readonly LabControlDefinition[];

export const fieldControls = [
    control("label", "Label", "text", "Field label"),
    control("placeholder", "Placeholder", "text", "Type something"),
    control("value", "Value", "text", "Preview value"),
    control("invalid", "Invalid", "boolean", false),
    control("disabled", "Disabled", "boolean", false),
] as const satisfies readonly LabControlDefinition[];

export const inputControls = [
    control("placeholder", "Placeholder", "text", "Type something"),
    control("value", "Value", "text", "Preview value"),
    control("invalid", "Invalid", "boolean", false),
    control("disabled", "Disabled", "boolean", false),
] as const satisfies readonly LabControlDefinition[];

export const labelControls = [
    control("label", "Label", "text", "Label"),
] as const satisfies readonly LabControlDefinition[];

export const separatorControls = [
    control("orientation", "Orientation", "select", "horizontal", orientations),
] as const satisfies readonly LabControlDefinition[];

export const textareaControls = [
    control("placeholder", "Placeholder", "text", "Type something"),
    control("value", "Value", "text", "Preview value"),
    control("invalid", "Invalid", "boolean", false),
    control("disabled", "Disabled", "boolean", false),
] as const satisfies readonly LabControlDefinition[];
export const sourceFormControls = [
    control("name", "Name", "text", "Cosmos RSS"),
    control("feedUrl", "Feed URL", "text", "https://example.com/feed.xml"),
    control("definitionState", "Definition state", "select", "ready", ["ready", "loading", "error"]),
    control("probeState", "Probe state", "select", "idle", ["idle", "running", "succeeded", "failed", "timeout"]),
] as const satisfies readonly LabControlDefinition[];

export const statusSummaryControls = [
    control("sourceSummary", "Source summary", "text", "尚未配置来源"),
    control("health", "Health", "select", "unknown", ["unknown", "ready", "failed"]),
    control("eventStreamState", "Event stream", "select", "connecting", ["connecting", "connected", "unavailable"]),
] as const satisfies readonly LabControlDefinition[];

export const collectionPlanListControls = [
    control("sourceName", "Plan name", "text", "Cosmos fixture"),
    control("state", "State", "select", "configured", ["configured", "untimed", "empty", "disabled", "media-policy"]),
    control("enabled", "Enabled", "boolean", true),
    control("grouped", "Grouped by connection", "boolean", false),
] as const satisfies readonly LabControlDefinition[];

export const runControlControls = [
    control("status", "Run status", "select", "failed", ["queued", "running", "succeeded", "failed", "cancelled"]),
] as const satisfies readonly LabControlDefinition[];

export const runHistoryControls = [
    control("state", "State", "select", "populated", ["populated", "empty"]),
] as const satisfies readonly LabControlDefinition[];

export const connectionPanelControls = [
    control("state", "State", "select", "populated", ["populated", "empty"]),
] as const satisfies readonly LabControlDefinition[];

export const feedBrowserControls = [
    control("title", "Story title", "text", "Cosmos fixture story"),
    control("state", "State", "select", "populated", ["loading", "empty", "populated"]),
] as const satisfies readonly LabControlDefinition[];

export const storyPanelControls = [
    control("title", "Story title", "text", "Cosmos fixture story"),
    control("contentText", "Content", "text", "A synthetic Story body for component inspection."),
    control("state", "State", "select", "revision", ["revision", "empty", "splittable", "split", "legacy-subtype", "representation", "entry-relations", "human-protected"]),
] as const satisfies readonly LabControlDefinition[];

export const topicPanelControls = [
    control("title", "Topic title", "text", "Cosmos fixture topic"),
    control("state", "State", "select", "members", ["members", "empty", "removed"]),
] as const satisfies readonly LabControlDefinition[];

export const entityPanelControls = [
    control("name", "Entity name", "text", "Jeff Dean"),
    control("type", "Type", "select", "person", ["person", "organization", "model"]),
    control("state", "State", "select", "linked", ["linked", "empty"]),
] as const satisfies readonly LabControlDefinition[];
