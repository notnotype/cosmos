import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkDocumentation } from "./check-documentation.js";

const temporaryRoots: string[] = [];
const requiredFiles = [
    ".agents/README.md",
    ".agents/tasks/README.md",
    ".agents/tasks/AGENTS.md",
    ".local/README.md",
    "docs/README.md",
    "docs/proposals/README.md",
    "docs/standards/README.md",
    "docs/standards/repository-workflow.md",
    "docs/testing/README.md",
    ".github/SECURITY.md",
] as const;

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => (
        rm(root, { recursive: true, force: true })
    )));
});

describe("documentation governance check", () => {
    it("accepts required indexes and valid active Markdown navigation", async () => {
        const fixture = await createFixture({
            "README.md": [
                "# Fixture",
                "",
                "[document](docs/README.md)",
                "[agent governance](.agents/README.md)",
                "[directory](docs/testing/)",
                "[heading](docs/README.md#responsibilities)",
                "[external](https://example.com/docs)",
                "![image](docs/image.png)",
                "[standard][workflow]",
                "",
                "[workflow]: docs/standards/repository-workflow.md",
                "",
                "`[inline code](missing-inline.md)`",
                "",
                "```text",
                "[fenced code](missing-fenced.md)",
                "```",
            ].join("\n"),
            "docs/image.png": "fixture",
            "docs/research/history.md": "[historical path](missing-history.md)\n",
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toEqual([]);
        expect(result.checkedFiles).toBe(fixture.paths.length);
    });

    it.each(["#100%", "existing.md#100%", "#bad\\fragment"])(
        "keeps legacy path-only validation for fragment %s",
        async (url) => {
            const fixture = await createFixture({
                "docs/source.md": `[fragment](${url})\n`,
                "docs/existing.md": "# Existing\n",
            });
            expect(checkDocumentation(fixture.root, fixture.paths).failures).toEqual([]);
        },
    );

    it("still rejects invalid paths when legacy fragments are ignored", async () => {
        const fixture = await createFixture({
            "docs/source.md": "[encoding](bad%ZZ.md#100%)\n[missing](missing.md#100%)\n[escape](../../outside.md#100%)\n",
        });
        expect(checkDocumentation(fixture.root, fixture.paths).failures).toEqual([
            expect.stringContaining("相对链接 URL 编码无效：docs/source.md -> bad%ZZ.md#100%"),
            expect.stringContaining("相对链接目标不存在：docs/source.md -> missing.md#100%"),
            expect.stringContaining("相对链接越出仓库：docs/source.md -> ../../outside.md#100%"),
        ]);
    });

    it("does not treat append-only original requirements as navigation", async () => {
        const fixture = await createFixture({
            "docs/requirements/0001-original-requirements.md": String.raw`[local input](C:\Users\person\private.md)`,
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toEqual([]);
    });

    it("accepts links into Next route groups whose paths contain balanced parentheses", async () => {
        const fixture = await createFixture({
            "README.md": [
                "# Fixture",
                "",
                "[agent governance](.agents/README.md)",
                "[page](apps/web/src/app/(shell)/page.tsx)",
                "[encoded](apps/web/src/app/%28shell%29/page.tsx)",
                "",
                "[definition][route]",
                "",
                "[route]: apps/web/src/app/(shell)/page.tsx",
                "",
            ].join("\n"),
            "apps/web/src/app/(shell)/page.tsx": "fixture",
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toEqual([]);
    });

    it("does not silently swallow a link whose parentheses are nested", async () => {
        // 配对的单层括号是 CommonMark 允许的地址写法，嵌套括号不是。这里锁定
        // 「嵌套括号不会被解析成合法目标」——否则它会被当成通过而掩盖真断链。
        const fixture = await createFixture({
            "README.md": [
                "# Fixture",
                "",
                "[agent governance](.agents/README.md)",
                "[nested](apps/web/src/app/(shell)/x(y)/page.tsx)",
                "",
            ].join("\n"),
            "apps/web/src/app/(shell)/page.tsx": "fixture",
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).not.toContain(
            expect.stringContaining("apps/web/src/app/(shell)/x(y)/page.tsx"),
        );
    });

    it("reports every missing required governance index", async () => {
        const fixture = await createFixture();
        const paths = fixture.paths.filter((path) => path !== "docs/proposals/README.md");
        await rm(join(fixture.root, "docs/proposals/README.md"));

        const result = checkDocumentation(fixture.root, paths);

        expect(result.failures).toContain(
            "缺少文档治理入口：docs/proposals/README.md",
        );
    });

    it("rejects missing, escaping, backslash, and absolute links", async () => {
        const fixture = await createFixture({
            "README.md": [
                "[agent governance](.agents/README.md)",
                "[missing](docs/missing.md)",
                "[escape](../outside.md)",
                String.raw`[backslash](docs\README.md)`,
                "[encoded backslash](docs%5CREADME.md)",
                "[absolute](/outside.md)",
                "[encoded absolute](%2Foutside.md)",
                "[windows absolute](C:/Windows/System32)",
                "[encoded windows absolute](C%3A/Windows/System32)",
            ].join("\n"),
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toEqual(expect.arrayContaining([
            expect.stringContaining("相对链接目标不存在：README.md -> docs/missing.md"),
            expect.stringContaining("相对链接越出仓库：README.md -> ../outside.md"),
            expect.stringContaining(String.raw`相对链接必须使用正斜杠：README.md -> docs\README.md`),
            expect.stringContaining("相对链接必须使用正斜杠：README.md -> docs%5CREADME.md"),
            expect.stringContaining("相对链接越出仓库：README.md -> /outside.md"),
            expect.stringContaining("相对链接越出仓库：README.md -> %2Foutside.md"),
            expect.stringContaining("相对链接越出仓库：README.md -> C:/Windows/System32"),
            expect.stringContaining("相对链接越出仓库：README.md -> C%3A/Windows/System32"),
        ]));
    });

    it("checks local and GitHub governance links", async () => {
        const fixture = await createFixture({
            ".local/README.md": "[missing local](missing.md)\n",
            ".github/SECURITY.md": "[missing policy](missing.md)\n",
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toEqual(expect.arrayContaining([
            expect.stringContaining(".local/README.md -> missing.md"),
            expect.stringContaining(".github/SECURITY.md -> missing.md"),
        ]));
    });

    it("requires a root navigation link to the Agent governance index", async () => {
        const fixture = await createFixture({
            "README.md": "[documentation](docs/README.md)\n",
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toContain(
            "根文档入口缺少 Agent 治理链接：README.md -> .agents/README.md",
        );
    });

    it("rejects Git commit SHAs in the root README", async () => {
        const fixture = await createFixture({
            "README.md": [
                "[agent governance](.agents/README.md)",
                "Current baseline: a3b962f",
            ].join("\n"),
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toContain(
            "根 README 不得缓存 Git 提交 SHA；当前基线与验证结果只写入 PROJECT-STATUS.md",
        );
    });

    it("requires the canonical workflow to link to the private security policy", async () => {
        const fixture = await createFixture({
            "docs/standards/repository-workflow.md": "# Workflow without a security route\n",
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toContain(
            "仓库流程缺少私密安全报告链接：docs/standards/repository-workflow.md -> .github/SECURITY.md",
        );
    });

    it("requires both private security and public non-security bug routes", async () => {
        const fixture = await createFixture({
            "docs/standards/repository-workflow.md": [
                "# Workflow",
                "",
                "[private security policy](../../.github/SECURITY.md)",
                "| 改动类型 | Proposal | 公开 Issue | Task walkthrough | PROJECT-STATUS.md |",
                "| --- | --- | --- | --- | --- |",
                "| 违反当前安全合同的漏洞 | 不需要 | 禁止；按安全政策私密报告 | 披露前由私密报告承载 | 修复或协调披露后更新 |",
            ].join("\n"),
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toContain(
            "仓库流程缺少非安全 Bug 公开 Issue 路由：docs/standards/repository-workflow.md",
        );
    });

    it("rejects route keywords when admission table semantics are reversed", async () => {
        const fixture = await createFixture({
            "docs/standards/repository-workflow.md": [
                "# Workflow",
                "",
                "[private security policy](../../.github/SECURITY.md)",
                "| 改动类型 | Proposal | 公开 Issue | Task walkthrough | PROJECT-STATUS.md |",
                "| --- | --- | --- | --- | --- |",
                "| 违反当前安全合同的漏洞 | 不需要 | 禁止；按安全政策私密报告 | 披露前由私密报告承载 | 修复或协调披露后更新 |",
                "| 当前合同可判定的局部非安全 Bug | 不需要 | 禁止 | 通常复用相关 Task | 已知缺陷关闭或模块状态改变时更新 |",
                "公开 Issue",
            ].join("\n"),
        });

        const result = checkDocumentation(fixture.root, fixture.paths);

        expect(result.failures).toEqual(expect.arrayContaining([
            "仓库流程缺少私密安全报告路由：docs/standards/repository-workflow.md",
            "仓库流程缺少非安全 Bug 公开 Issue 路由：docs/standards/repository-workflow.md",
        ]));
    });

    it.each([
        ["docs/tasks/README.md", "docs/tasks/"],
        ["docs/testing.md", "docs/testing.md"],
    ])(
        "rejects the retired physical path %s",
        async (fixturePath, retiredPath) => {
            const fixture = await createFixture({ [fixturePath]: "# Retired\n" });

            const result = checkDocumentation(fixture.root, fixture.paths);

            expect(result.failures).toContain(`已退休文档路径仍然存在：${retiredPath}`);
        },
    );
});

async function createFixture(
    additionalFiles: Readonly<Record<string, string>> = {},
): Promise<{ root: string; paths: string[] }> {
    const parent = resolve(process.cwd(), ".agent", "tmp", "G19-P3-2-doc-check-33cfaf90");
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, `docs-check-${randomUUID()}-`));
    temporaryRoots.push(root);

    const files: Record<string, string> = Object.fromEntries(
        requiredFiles.map((path) => [path, `# ${path}\n`]),
    );

    files["docs/standards/repository-workflow.md"] = [
        "# Workflow",
        "",
        "[private security policy](../../.github/SECURITY.md)",
        "| 改动类型 | Proposal | 公开 Issue | Task walkthrough | PROJECT-STATUS.md |",
        "| --- | --- | --- | --- | --- |",
        "| 当前合同可判定的局部非安全 Bug | 不需要 | 需要 | 通常复用相关 Task | 已知缺陷关闭或模块状态改变时更新 |",
        "| 违反当前安全合同的漏洞 | 不需要 | 禁止；按[安全政策](../../.github/SECURITY.md)私密报告 | 披露前由私密报告承载 | 修复或协调披露后更新 |",
        "安全政策",
        "",
    ].join("\n");
    Object.assign(files, additionalFiles);

    await Promise.all(Object.entries(files).map(async ([path, content]) => {
        const absolutePath = join(root, path);
        await mkdir(resolve(absolutePath, ".."), { recursive: true });
        await writeFile(absolutePath, content, "utf8");
    }));

    return { root, paths: Object.keys(files).sort() };
}
