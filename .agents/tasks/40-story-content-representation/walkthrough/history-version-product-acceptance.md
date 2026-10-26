# Task40 历史：表示版本产品验收与首次提交核对

返回[当前 walkthrough](../walkthrough.md)。本册为已完成步骤的原文历史；其中授权与未完成状态只对应记录当时。

### 2026-10-26：表示版本产品验收计划

沿用已批准的精确版本、质量推进与人工保护合同。本轮只新增 `e2e/browser/story-representation-versions.spec.ts`，复用现有隔离 RSS→API/Worker→Web 栈及公开内容管理 API；不改业务、schema 或 UI，不操作真实来源/模型/数据。当前 Web 只有当前表示阅读，没有历史管理按钮；API 命令加阅读页刷新不冒称按钮验收。Leader 单独写本记录，不启动无法指定已批准模型的子 Agent。

1. **锁定与稳定输入**：受控 RSS 落库得到 v1；锁定后重建 v2，不晋升当前。两版本同解析器/正文/块，原 EntryRevision、Observation 和 Story 版本不变。
2. **精确引用与冲突**：显式 v1/v2 读到各自身份；不存在版本明确 unavailable，不退为 current/legacy。过时当前 ID、锁状态及跨来源回退分别拒绝，当前指针不变。
3. **回退与产品阅读**：解锁后重建 v3 晋升；回退 v1 自动锁定，后续 v4 不晋升。1024/1440 实际阅读页刷新读取相应当前 ID、正文可读、原文链接可聚焦、无横向溢出及非预期浏览器错误。

先编写并运行该验收，用运行结果识别缺陷；若确有业务缺陷，先报告实际行为/预期/证据，再决定修复，不为绿灯改合同。验证命令：`bun run build:api`、`bun run build:worker` 后 `bunx playwright test --config playwright.config.ts e2e/browser/story-representation-versions.spec.ts`；另跑已有 ContentQuery/重建/选择的聚焦回归和文档门禁。独立审查、其他媒体降级和真实 Agent 仍分层未完成。

### 2026-10-26：表示版本产品验收结果

- 三条断言均有本轮运行证据：v1 锁定后 v2 不晋升；按精确版本返回不同表示身份、同解析器输入得到相同正文/块；缺失版本返回 unavailable，不读 current/legacy。过时指针/锁状态及跨来源回退为 409，缺失目标为 404，均不改变当前表示。解锁后 v3 晋升，回退 v1 自动锁定，后续 v4 不晋升；原 EntryRevision、Observation 与 Story 快照完全相同。
- 两个实际 viewport（1024/1440）都通过生产阅读页刷新捕获真实 GET 的当前表示 ID，验证正文、原文链接键盘焦点、无页面横向溢出；完整过程 pageerror/console error/requestfailed 均为空。无 API 响应伪造、数据库直写或业务改动。本轮补的是已有能力的完整产品证据，不是实现新的历史管理 UI。
- `bun run build:api` → `bun run build:worker` → `bunx playwright test --config playwright.config.ts e2e/browser/story-representation-versions.spec.ts` 全部 exit 0（pwsh-fea9b2f9055b416e）；API/Worker/共享包构建通过，浏览器含生产 Web 构建/start，2 项通过、23.6s。隔离数据库/Blob/受控 RSS，不访问真实用户数据或模型。
- `bun run vitest run packages/application/src/content-query.test.ts packages/application/src/content-commands.test.ts packages/application/src/content-rebuild.test.ts packages/storage-prisma/src/content-query.test.ts packages/storage-prisma/src/representation-selection.test.ts apps/api/src/app.controller.structured-content.test.ts`：6 文件 / 20 测试通过，7.92s，pwsh-f23612e9f0784d7e，exit 0。
- 当前状态已同步 Task README 与 PROJECT-STATUS；`bun run docs:check`（1184 文件、0 失败）、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 均通过（pwsh-bd62bab8695d431f，exit 0），保留 5 项既存基线增长 warning；主记录 26,656 字节（本句补记前）。未运行本轮默认单元全套、单独全仓 typecheck、完整浏览器整套、真实来源/Agent、旧用户库升级、独立审查；构建中的类型检查不冒称单独全仓 typecheck。解析器升级、不同质量候选与 Agent 旧证据演进不由同解析器重建验收替代。信心 B，本切片完成、Task40 仍 active；下一步媒体/读取状态的剩余产品验收及独立审查。无 goal/子 Agent/Git 外部操作/部署。

### 2026-10-26：逐步提交授权与既有基线核对

维护者要求继续 Task40，每完成一个可独立验收的步骤作一次本地 Git 提交，并附简要中文说明。此授权不包含 push、分支/worktree、部署、真实数据或真实模型请求；不创建/恢复 goal。先把已完成但未提交的内部 @2、完整 Story 接线及表示版本验收合为连贯基线，之后媒体验收独立提交；不使用 `git add -A`。

- 本轮 `bun run test` 后串行 `bun run typecheck` 均 exit 0（pwsh-68940fe8713b4907）：201 文件 / 1148 测试通过、175.08s，全仓类型通过。上一轮产品与组件浏览器证据保留以上分层结果，本轮未重跑浏览器。
- Leader 按正确性、简单性、架构、安全、性能五轴核对候选持久化/正式决定、既有队列复用、API/Worker 装配、连接与版本权限、终态/fence、同键恢复及有界轮询；未识别新增 Critical/Required blocker。不把此次自查当独立审查：普通子 Agent 工具无法指定 `jijiapi/gpt-6-luna`，未使用默认路由，独立审查继续未完成。
- 仅 Task40 相关 32 个既有改动及其新文件进入候选范围，当前 master 基于 `31d9577`；公共导出为显式增量冻结，未改旧路由历史。旧内部计划/结果 5,325 字节原文移入历史分册，当前决定和有效结果不移走。文档链接 1185 文件、大小治理及 diff 门禁通过（pwsh-1536d396c5d548da，exit 0），保留 5 项既存增长 warning。首次 staged diff 发现 3 个新归档的末尾分隔空行，仅规范最后换行、不改历史正文；提交前复查。
