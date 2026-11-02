import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAnchors } from "./documentation-check/anchors.js";
import { baseline, changes } from "./documentation-check/git.js";
import { checkGovernance } from "./documentation-check/governance.js";
import { checkMetadata } from "./documentation-check/metadata.js";
import { gitSnapshot, workspace } from "./documentation-check/scope.js";
import { checkWhitespace } from "./documentation-check/whitespace.js";
import { uncovered, type CheckOptions, type DocumentationCheckReport, type IncrementalReport } from "./documentation-check/report.js";

export type { DocumentationCheckReport } from "./documentation-check/report.js";

// Explicit paths retain the original non-Git fixture API and its path-only contract.
export function checkDocumentation(repoRoot: string, paths?: readonly string[]): DocumentationCheckReport {
    const snapshot = workspace(resolve(repoRoot), paths);
    const failures: string[] = [];
    checkGovernance(snapshot, failures);
    return { failures, checkedFiles: snapshot.files.length };
}

export function runDocumentationCheck(repoRoot: string, options: CheckOptions = {}): IncrementalReport {
    const root = resolve(repoRoot);
    const mode = options.mode ?? "workspace";
    const comparison = baseline(root, options);
    const delta = changes(root, comparison.ref, mode);
    const snapshot = mode === "workspace" ? workspace(root) : gitSnapshot(root, mode);
    const previous = gitSnapshot(root, "ci", comparison.ref);
    const failures: string[] = [];
    checkGovernance(snapshot, failures);
    const anchorSources = checkAnchors(snapshot, delta.changed, options.all ?? false, failures);
    const metadataFiles = checkMetadata(snapshot, delta.changed, failures, previous);
    const whitespaceFiles = checkWhitespace(snapshot, delta.added, failures);
    return {
        failures, checkedFiles: snapshot.files.length, mode,
        baseline: comparison.label, baselineReason: comparison.reason,
        snapshot: mode === "workspace" ? "working tree including untracked files" : mode === "staged" ? "complete Git index" : "HEAD tree",
        changedFiles: delta.changed, addedFiles: delta.added, anchorSources, metadataFiles, whitespaceFiles,
        uncovered: [...uncovered],
    };
}

function cliOptions(args: readonly string[]): { root: string; options: CheckOptions } {
    let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const options: CheckOptions = {};
    let modeChosen = false;
    for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (flag === "--staged" || flag === "--ci") {
            if (modeChosen) throw new Error("--staged 与 --ci 不能重复或同时使用");
            options.mode = flag === "--ci" ? "ci" : "staged";
            modeChosen = true;
        } else if (flag === "--all") options.all = true;
        else if (flag === "--root" || flag === "--base") {
            const value = args[++index];
            if (!value || value.startsWith("--")) throw new Error(`${flag} 缺少参数`);
            if (flag === "--root") root = resolve(value);
            else options.base = value;
        } else throw new Error(`未知参数：${flag}`);
    }
    if (options.mode === "ci") {
        options.eventName = process.env.GITHUB_EVENT_NAME;
        const eventPath = process.env.GITHUB_EVENT_PATH;
        if (eventPath && !options.base) {
            const event: unknown = JSON.parse(readFileSync(eventPath, "utf8"));
            options.event = event;
        }
    }
    return { root, options };
}

const invoked = process.argv[1];
if (invoked && realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url))) {
    try {
        const { root, options } = cliOptions(process.argv.slice(2));
        const report = runDocumentationCheck(root, options);
        console.log(JSON.stringify(report, null, 2));
        if (report.failures.length) process.exitCode = 1;
    } catch (error: unknown) {
        console.error(JSON.stringify({ failures: [error instanceof Error ? error.message : String(error)] }, null, 2));
        process.exitCode = 1;
    }
}
