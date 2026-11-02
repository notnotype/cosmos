export type CheckMode = "workspace" | "staged" | "ci";

export interface CheckOptions {
    mode?: CheckMode;
    base?: string;
    all?: boolean;
    eventName?: string;
    event?: unknown;
}

export interface DocumentationCheckReport {
    failures: string[];
    checkedFiles: number;
}

export interface IncrementalReport extends DocumentationCheckReport {
    mode: CheckMode;
    baseline: string;
    baselineReason: string;
    snapshot: string;
    changedFiles: string[];
    addedFiles: string[];
    anchorSources: string[];
    metadataFiles: string[];
    whitespaceFiles: string[];
    uncovered: string[];
}

export const uncovered = [
    "锚点仅覆盖变更的活跃 Markdown 来源及指向变更 Markdown 目标的入链；--all 可扩为全部活跃来源。",
    "原始需求与 research 历史不作为活跃导航来源；历史未变分册元数据不迁移。",
    "新增 Markdown 检查空白；既有文件不追溯空白债务。",
    "源码行号片段仅检查路径；架构真实性、外部 URL、完整 CommonMark/HTML 渲染不在静态检查范围。",
];
