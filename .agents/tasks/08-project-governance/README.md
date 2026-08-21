# Task 08：项目治理目录与流程收敛

## User Request / Topic

参考相邻 `neuro-book` 的治理方式调整 Cosmos，但不照搬完整体系：将 `docs/tasks/` 迁入 `.agents/tasks/`，建立 `.local/`、`docs/proposals/`、`docs/standards/` 和 `docs/testing/`，并按 Cosmos 当前规模收敛流程。

批准的执行输入为 `local://cosmos-governance-plan.md`；本次没有关联 GitHub Issue，不伪造 Issue 编号。

## Goal

让需求、方案、工程流程、测试合同、当前实现规格、执行记录和本地资产各有唯一入口；所有活跃链接一次性切换，并由轻量文档检查阻止旧路径回流和断链。

## Scope / Non-goals

范围包括治理目录、入口文档、现有 Task 物理迁移、活跃链接切换、文档检查脚本及质量 CI 门禁。

本 Task 不引入 NeuroBook 的四角色体系、五位 Task 编号、Spec frontmatter、迁移 hash 清单或 monorepo 专属规则；不改变 Cosmos 运行时行为、产品数据、版本、发布或部署状态。

## 2026-08-20 实施切片：Agent Skills 生命周期与 CI 绿色基线

- **生命周期阶段**：本地实现、验证与五轴审查完成，等待分别授权的 commit/push/PR；权威执行输入为 `local://agent-skills-workflow-plan.md`。
- **目标**：把 Agent Skills 的开发顺序收敛到现有仓库流程，同时先修复已知 Quality 红灯并让 unit/property 测试层真实分离。
- **可观察验收**：clean install 语义下 `apps/worker/src/runtime.test.ts` 可解析 `@cosmos/worker-admin`；`bun run test` 不收集 property tests，而 `bun run test:property` 只收集仓库现有三份 property 文件；所有 Agent、Task、贡献和 PR 入口只路由到 `docs/standards/repository-workflow.md` 的唯一生命周期与完成定义。
- **依赖与合同**：复用本 Task、现有准入表、`docs/testing/` 和 CI job 拓扑；不创建新 Proposal、Task、ADR、tracker 或产品 spec。
- **预计核心文件**：Vitest/CI 配置、仓库流程与测试标准、Agent/Task/贡献/PR 入口、根 README、文档检查及其测试、`PROJECT-STATUS.md` 和本 Task。
- **验证层级**：文档检查 RED/GREEN、原失败 worker suite、独立 unit/property 收集、完整本地 Quality 顺序、文档边界与五轴审查；产品 Node E2E、浏览器、Docker 和真实来源不运行，因为本切片不改变产品运行时行为。
- **外部边界**：GitHub branch protection/ruleset 只读核验，不修改；commit、push、PR、merge、发布、部署和 worktree 清理仍需分别授权。

## Current State

已完成仓库内实施。`.local/`、`.agents/`、Proposal、工程标准、仓库流程和测试规范入口已经建立；本轮进一步把 Agent Skills 顺序、最短链、阶段门禁和唯一 Definition of Done 收敛到 `docs/standards/repository-workflow.md`，其它 Agent、Task、贡献和 PR 入口只保留触发摘要。根 README 不再缓存动态 SHA/测试/worktree 状态，文档门禁阻止 SHA 回流。Vitest 已修复 `@cosmos/worker-admin` clean-install 解析并真实分离 unit/property 收集，CI Quality 显式执行两层测试。

## Decisions and Deviations

- 采用正确拼写 `docs/standards/`，不创建 `docs/standars/` 兼容目录。
- 保留 Cosmos 现有 `docs/spec/` 当前实现模型和 `{NN}-{kebab-case-name}` Task 编号。
- `.local/README.md` 是 `.local/` 唯一入库文件；其它内容由用户管理并被 Git 忽略。
- 历史 walkthrough 中作为审计事实的旧路径纯文本保留；可点击链接切到当前目标。
- 文档门禁使用仓库内 TypeScript 和 Node 标准库，不新增 Markdown 解析依赖。
- 在 `docs/standards/repository-workflow.md` 建立 Proposal、公开 Issue、Task 和项目状态要求的唯一准入决策表；其它入口只保留链接和触发摘要。
- Task README 维护当前摘要，已有 walkthrough 时由 walkthrough 独占追加过程、偏差和验证。
- `PROJECT-STATUS.md` 独占当前提交、验证结果和未运行项；测试规范与文档索引只保留稳定合同和链接。
- 文档门禁验证目标文件或目录，不验证 fragment 内容；扫描范围包含治理用 `.local/README.md` 和 `.github/` Markdown，并拒绝 POSIX/Windows 绝对路径。
- 本轮复用 Task 08，不建立新 Task、Proposal、ADR 或通用 `tasks/plan.md`/`tasks/todo.md`；Skill 只作为现有生命周期的执行规则。
- `vitest.property.config.ts` 原计划外发现必须补充 `apps/**/src/**/*.property.test.ts`，否则会漏收 `apps/worker/src/runtime.property.test.ts`；该修正属于三份 property 文件验收的必要实现。
- 2026-08-20 GitHub API 核验 `master` 无 branch protection、rulesets 为空；用户选择只修改仓库内流程，因此未改变任何远端设置。

## Implementation Walkthrough

1. 建立 `.local/` 忽略边界和 `.agents/` 治理入口。
2. 建立 Proposal、工程标准、仓库流程和测试规范入口。
3. 迁移 Task 并修复因目录深度变化而失效的链接。
4. 切换根文档、需求、架构、ADR、API 和当前 spec 的活跃 Task 引用。
5. 先写文档检查行为测试，再实现脚本并接入质量 CI。
6. 根据五路只读审查统一流程合同与真相源，补齐 Windows/POSIX 绝对路径、治理文档扫描和根入口可达性回归测试。
7. 先复现 `@cosmos/worker-admin` 解析失败和 worker property 漏收，再补源码 alias、扩展 Vitest 默认 exclude，并让 property 配置覆盖 `apps/**`。
8. 在 Quality 中加入独立 property step，同步测试规范；建立 Agent Skills 唯一生命周期、最短路由、阶段完成条件和 DoD。
9. 更新 Agent/Task/双语贡献/PR 入口，移除根 README 动态状态缓存，并以行为测试阻止 Git SHA 回流。
10. 按 CI 顺序执行本地 Quality，记录远端失败仍未重跑、远端保护只读核验和未运行 runtime 层。

## Verification

2026-08-19 在仓库根执行：

- `bun run test -- scripts/check-documentation.test.ts`：通过，1 个文件 / 8 个测试；覆盖必需入口、根入口可达性、文件/目录/图片/引用式链接、代码区排除、append-only 原始需求排除、`.local`/`.github` 治理文档、断链、POSIX/Windows 越界、反斜杠、URL 编码路径和退休路径。fragment 只参与目标路径分离，不校验锚点内容。
- `bun run docs:check`：通过，JSON 为 `failures=[]`、`checkedFiles=256`。
- `bun run typecheck`：通过，packages 与 apps 全部 TypeScript 检查退出码 0。
- `bun run test`：通过，29 个文件 / 193 个测试。
- `git diff --check`：通过，无输出。
- 导航核对：根 README 可达 `.agents/README.md`，`docs/README.md`、Task、Proposal、standards 和 testing 入口均可沿相对链接到达；活跃退休路径扫描为 0，移动后 Task 相对链接扫描为 0 个断链。

运行时 build、Node E2E、浏览器、Docker 和真实来源验收未运行；本次只改变治理文档、文档检查脚本和 CI 质量门禁，不改变 Cosmos 运行时行为。

2026-08-20 在隔离 worktree 执行：

- RED：`bun run test -- scripts/check-documentation.test.ts` 的新增根 README SHA 案例失败，`expected [] to include '根 README 不得缓存 Git 提交 SHA；当前基线与验证结果只写入…'`；GREEN：同命令 1 个文件 / 9 个测试通过。
- 原失败路径：修改前 `bunx vitest run apps/worker/src/runtime.test.ts` 因 `Cannot find package '@cosmos/worker-admin'` 失败；修改后 1 个文件 / 6 个测试通过。
- 收集证据：修改前 property list 只有 application/storage 两个文件；修改后 `bunx vitest list --config vitest.property.config.ts` 恰好列出 worker/application/storage 三个文件。默认 `bunx vitest list` 无 `.property.test.ts`。
- `bun install --frozen-lockfile`：通过，lockfile 无变化；`bun run docs:check`：`checkedFiles=256`、`failures=[]`；`bun run db:validate`、`bun run db:generate`、`bun run typecheck`：通过。
- `bun run test`：26 个 unit 文件 / 190 个测试通过；`bun run test:property`：3 个文件 / 4 个测试通过；`bun run lint:web`、`bun run build`：通过。
- 根 README Git SHA 正则扫描为 0；中英文贡献指南八阶段逐项对应；文档链接和唯一 DoD 导航由 `docs:check` 覆盖。
- Node process E2E、Playwright 浏览器、Windows smoke、Docker、真实来源、真实 Agent、发布和部署未运行；本轮不改变产品运行时行为，完整 runtime 证据继续锚定 `3af886a`。
- 远端 `a3b962f` CI run `32241661044` 仍为 failure 且未重跑；本地绿色不替代远端结果。commit、push、PR、merge、Issue 关闭、worktree 清理和远端保护修改均未执行。
- 五轴审查：正确性上准入、生命周期、CI 和测试收集一致；简单性上只有一个 canonical lifecycle，无第二 tracker 或共享 Vitest 抽象；架构上动态状态、过程和当前产品行为分别由 `PROJECT-STATUS.md`、Task 和 spec 持有；安全上无 Secret、用户数据或远端写操作；性能上 property 文件从 unit 层移除后只在独立 Quality step 执行一次。未解决 `Critical`/`Required` finding：0。

## Follow-ups

获得相应授权后才能 commit、push 或创建 PR；push 后观察新的 Quality、Node process E2E、Browser E2E 和 Windows Node smoke。远端保护状态未改变，不把仓库内 CI 描述为已强制。
