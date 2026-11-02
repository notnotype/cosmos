import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const fixtureParent = resolve(repositoryRoot, ".agent/tmp/G19-P3-2-doc-check-33cfaf90");
const roots: string[] = [];

export function put(root: string, path: string, content: string): void {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
}

export function git(root: string, ...args: string[]): string {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
    if (result.status !== 0 || result.error) {
        throw new Error(`fixture git ${args.join(" ")}: ${result.stderr} ${result.error ?? ""}`);
    }
    return result.stdout.trim();
}

export function commit(root: string): string {
    git(root, "add", ".");
    git(root, "-c", "user.name=Documentation fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-qm", "fixture");
    return git(root, "rev-parse", "HEAD");
}

export function fixture(files: Readonly<Record<string, string>> = {}, committed = true): string {
    mkdirSync(fixtureParent, { recursive: true });
    const root = mkdtempSync(resolve(fixtureParent, "case-"));
    roots.push(root);
    const indexes = [".agents/README.md", ".agents/tasks/README.md", ".agents/tasks/AGENTS.md", ".local/README.md", "docs/README.md", "docs/proposals/README.md", "docs/standards/README.md", "docs/testing/README.md", ".github/SECURITY.md"];
    for (const path of indexes) put(root, path, "# Index\n");
    put(root, "README.md", "# Fixture\n\n[agents](.agents/README.md)\n");
    put(root, "docs/standards/repository-workflow.md", [
        "# Workflow", "[security](../../.github/SECURITY.md)",
        "| 改动类型 | Proposal | 公开 Issue |", "| --- | --- | --- |",
        "| 违反当前安全合同的漏洞 | 不需要 | 禁止；按[安全政策](../../.github/SECURITY.md)私密报告 |",
        "| 当前合同可判定的局部非安全 Bug | 不需要 | 需要 |", "",
    ].join("\n"));
    for (const [path, content] of Object.entries(files)) put(root, path, content);
    git(root, "init", "-q");
    git(root, "config", "core.autocrlf", "false");
    if (committed) commit(root);
    return root;
}

export function cleanFixtures(): void {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

export function volume(parent = "docs/book.md", extra = ""): string {
    return `---\nrange: 1-20\nsealed_at: 2026-02-28\ntags: [testing, governance]\ntokens_est: 123\nparent: ${parent}\n${extra}---\n# Volume\n`;
}

let bunRuntime: string | undefined;

export function cli(root: string | undefined, ...args: string[]) {
    return runCli(root, args);
}

export function runCli(root: string | undefined, args: readonly string[], env: NodeJS.ProcessEnv = {}) {
    if (!bunRuntime) {
        const probe = process.platform === "win32"
            ? spawnSync("bun --print process.execPath", { shell: true, encoding: "utf8", windowsHide: true })
            : spawnSync("bun", ["--print", "process.execPath"], { encoding: "utf8" });
        if (probe.status !== 0 || probe.error || !probe.stdout.trim()) {
            throw new Error(`Cannot resolve Bun from PATH: ${probe.stderr} ${probe.error ?? ""}`);
        }
        bunRuntime = probe.stdout.trim();
    }
    return spawnSync(bunRuntime, [resolve(repositoryRoot, "scripts/check-documentation.ts"), ...(root ? ["--root", root] : []), ...args], {
        cwd: fixtureParent, encoding: "utf8", windowsHide: true,
        env: { ...process.env, GITHUB_EVENT_NAME: "", GITHUB_EVENT_PATH: "", ...env },
    });
}
