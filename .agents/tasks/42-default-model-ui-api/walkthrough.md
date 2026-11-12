# Task 42：默认模型配置 UI 与 API 实现

## 历史分册

- [2026-11-11：缓存价格与整请求阶梯计费](walkthrough/01-cache-tiered-pricing-2026-11-11.md)：方案、实施、验收及本地提交/合并记录。
- [2026-11-11：默认模型失效生成修复](walkthrough/02-default-model-recovery-2026-11-11.md)：修复决定、实施证据与验证。

## Story Agent 超时与错误展示（2026-11-12）

用户原话：

> 接下来请你和你的子Agent先封装常见错误，然后在前端页面上正确的展示错误信息，同时增加一个新功能：用户可以在设置界面配置超时时间，默认设置成300秒。

用户确认按建议合同实施，并明确要求沿用 Task 42。虽然 Task 42 的早期切片已关闭，本切片复用理由是它覆盖 SystemConfig 设置/API、Story Agent 生成与 Web 行为；不另建 Task 编号。

### 当前切片

阶段：合同已确认，准备 RED → GREEN → 验收。目标：Story Agent 每次生成使用系统配置的超时时间，默认 300 秒；识别并安全展示常见生成失败原因。验收：

1. 设置页可读取、修改并持久化超时秒数；默认 300，范围 30–1800 秒，越界或非整数拒绝；新请求快照使用配置预算，旧幂等重放保留原请求预算。
2. Story Generation API 保留终态失败白名单码：`timeout`、`authentication_required`、`rate_limited`、`budget_exhausted`、`invalid_configuration`、`dependency_unavailable`、`malformed_payload`；用户取消仍是 cancelled 状态；HTTP、Provider 原文、密钥和内部异常细节不进入 UI。
3. Story 页面将分类映射为可操作的简体中文提示；未知错误显示通用提示，并提供适当的设置/重试入口。

产品决定：仅 Story Agent 生成受该设置控制；单位为秒；默认 300；范围 30–1800。一次尝试按该配置计时，重试可能令任务总耗时超过单次时长。

### 工作区与所有权

- repository/worktree：`D:/Otirik/Workstation/cosmos` 当前主工作区；branch `master`；base `5e92aea072459e9d1fc9f586dffb92d5f7ea801b`。维护者授权沿用 Task 42 和当前工作区；不创建分支/worktree、不提交、不部署。开始时已有修改：Task42 walkthrough、PROJECT-STATUS、API/Worker 测试与装配、Story Web 面板/费用、API 与 Web spec、Story workflow budget、两个 acceptance runner，及未跟踪的 `CON`、`({id`、`use-story-agent-config` 文件；这些均视为已有内容，修改前逐项理解并叠加。
- Leader 唯一维护本 walkthrough 和 Task README。
- 后端 writer：仅写 `packages/contracts/**`、`packages/application/**` 中配置/Story workflow 所属代码与对应测试、`packages/storage-prisma/prisma/schema.prisma`、本切片新迁移、`packages/storage-prisma/src/system-config*`、新增 `packages/storage-prisma/src/story-agent-failure-code.ts` 与对应测试、`apps/api/src/system-config*`、`packages/transport-http/src/client-system-config*`、Story Workflow Worker 组合/行为代码与对应测试；唯一公共 DTO/schema/migration writer。数据库测试使用 `.agent/tmp/task42-story-agent-timeout/<uuid>/` 隔离根，不访问用户数据。
- React writer：仅写 `apps/web/src/**` 中设置控件、错误文案、组件/hook 与前端测试，以及 `e2e/browser/story-agent-generation.spec.ts`、`e2e/browser/default-model-settings.spec.ts`；只消费已冻结合同，不写后端/文档。浏览器使用隔离数据库和动态端口。
- 文档 owner：文档角色代理三次启动失败，未修改文件；Leader 接手原始需求、accepted Proposal、受影响架构/spec/API/Web 文档及必要入口，且唯一维护本 walkthrough/README 与最终 `PROJECT-STATUS.md`。前后端代码代理不得自行改文档。
- 所有 writer 共用本仓库、`master`、上述 base 和当前工作区；无独立 Git worktree。不得扩大文件范围、清理或恢复既有改动。
- 文档影响：**需更新**。新增持久 SystemConfig 字段、Story budget 行为与用户可见错误分类，需要同步原始需求、Proposal、公共合同、API 和 Web 当前规格。

### 实施顺序

1. 后端补合同/配置/错误传递 RED，完成 schema 与迁移、API/HTTP transport、入队 budget snapshot 与持久终态 errorCode；不得将 Workflow `lastError` 或 Provider 原文当作公开合同。
2. React writer 基于冻结合同完成 Settings 控件与 Story 错误映射；按 Web 项目规则先读相关 Next 指南；提示使用固定文案。
3. Leader 维护原始需求、accepted Proposal、架构及代码完成后的当前 API/Contract/Web spec。
4. 验证 contracts、application/storage/API/Worker/Web 聚焦测试，类型检查、构建、Story 与 Settings 浏览器流程、文档检查和 `git diff --check`；独立检查长请求 heartbeat、重试、旧行默认值及脱敏。真实 Provider、用户数据迁移、部署不在本轮。

### 阶段证据

待实施与验证后追加；本计划不代表代码或验收已完成。

#### 实施与独立审查进展

- 后端 writer `4db99d34` 完成公共 DTO、迁移、SystemConfig 字段级原子更新、入队预算快照、save Action 分类与持久读码器/API 装配后冻结。API/Worker 全依赖构建 `bun run build:api && bun run build:worker` exit 0；全仓单元回归进行中。
- React writer `b9478bf9` 完成设置/错误展示，初次前端聚焦 6 files / 65 tests 与 Web tsc 通过。首次设置 browser 保存返回 400，测试使用的 API dist 尚未包含新合同；该次不得作为有效集成通过，已由统一重建后复测取代。
- 只读前端 reviewer `65b35c11` 指出当前设置秒数不能代表旧任务预算、空值未标无效、错误文案分散。Leader 已移除动态秒数文案并归入 copy；补救 React writer `8980b9d2` 沿用本工作区/branch/base，仅写本切片 UI/copy/tests 和 default-model-settings E2E，核对空值 aria-invalid/描述及重跑聚焦验证。
- 测试 writer `83822786` 沿用上述工作区/branch/base，仅新增 `e2e/browser/story-agent-errors.spec.ts`；通过隔离浏览器与 HTTP 合成 DTO 验证七类安全错误、未知/原始文本降级和取消中性状态，不声称这些拦截覆盖真实 Worker 错误链。真实 Workflow 失败/保存链已有后端行为测试。
- 后端只读 reviewer `7086f75a` 检查预算/取消、续租、事务/迁移和持久码边界；无生产/文档写权限。
- 文档 owner 已同步原始需求、accepted Proposal、架构/ADR-0033、当前 Contract/API/transport/Web 规格和 Story API 补充。首轮 docs:check 为既有 Task40 22 条断链加一条新增需求锚点错误；新增错误已修正，最终门禁待复测。

#### 回归偏差与补救写集

- 前端补救 writer `8980b9d2` 最终仅修正设置 E2E 的空值提示与关联描述定位；6 files / 65 tests、Web tsc 与 diff check 均再次通过，随即冻结。后端补救前原聚焦最终为 9 files / 84 tests，六个相关包/应用 typecheck 通过。
- Web `bun run build:web` exit 0；首次最新栈 browser `COSMOS_E2E_WEB_PORT=4297 bunx playwright test --config=playwright.config.ts e2e/browser/default-model-settings.spec.ts e2e/browser/story-agent-generation.spec.ts e2e/browser/story-agent-errors.spec.ts`：4 passed / 1 failed。设置持久保存、Story 生成/费用/两档单价均通过，错误测试七码断言通过；cancelled 时刷新中的双 loading status 导致测试 locator strict violation。测试 writer 将定位收窄为取消文本，不能删除中性状态/无 alert 断言。
- 首轮全仓 `bun run test` exit 1：新增 reader 测试在启动时仍取旧 fixture（缺 stateJson），其后 writer 已更正；两个 acceptance runner 的多项测试为 configuration 阶段失败、0 transport sends。定点重跑 `bunx vitest run packages/storage-prisma/src/story-agent-failure-code.test.ts scripts/acceptance/story-agent-runner.test.ts scripts/acceptance/story-body-runner.test.ts` 中 reader 已过，16 项 runner 失败；从代码定位到隔离迁移只列旧定价 overlay，漏 timeout migration。测试 writer 追加登记 `scripts/acceptance/story-agent-isolation.ts` 与 runner 测试写集，改为显式覆盖两条迁移并保持 hash manifest。该故障只在隔离验收 DB，修复不迁移用户数据。
- 后端 reviewer 确认专用 Generation DTO 无 raw message，但通用 Run Job 产品 API 把 Story Activity errorMessage 透传为公开 error。接受重要 finding；后端 owner 扩写集为 `packages/storage-prisma/src/repository/runs.ts`、相关公开映射/Attempt 模块和行为测试，仅收敛 Story Workflow 范围的公开错误，不改变内部持久诊断。迁移测试同时补 legacy singleton 行保留与默认300。完成后须重做相关构建和最终审查。
- Reviewer 检查确认 Story 两 Activity 串行执行，按 Run 下最新终态错误取码当前无歧义；30min 调用可通过 Run/Activity combined heartbeat 续租。尚未进行 30min 实时等待验收，不能用静态检查替代。

#### 冻结后复核与治理

- 测试 writer 修复 overlay 与 locator 后，指定 runner+reader 三套 20 tests passed（94.48s）。Leader 独立 `COSMOS_E2E_WEB_PORT=4298 bunx playwright test --config=playwright.config.ts e2e/browser/story-agent-errors.spec.ts`：1 passed（20.7s），覆盖七码/取消/未知降级/无原文；Web生产构建同步通过。
- 后端补救 `run-jobs.test.ts` 与 `system-config.test.ts`：2 files / 16 tests passed；storage与API typecheck过，随后再独立复审。Reviewer 发现无父 Job 的孤立 Activity events 会绕过Story分类，要求不存在/无法证明所属Workflow时闭锁，不回传原始诊断；后端writer继续在同一登记范围修复并补测试。其它Job single/list与Attempt有父关联路径已确认脱敏。
- 第二次 `bun run test` exit 1，共报15项失败；末尾确认新顶层timeout设置组件漏登记Component Lab。Leader委派React补救writer `8ba30905`（同repo/master/base），开始仅补测试期望，13 tests仍3 failed显示生产definition也缺失；扩写集为组件Lab registry/对应fixture与registry.test，必须按现有配置Lab方式补场景，不能只放宽测试。后续全仓回归写结构化报告到隔离临时目录，避免输出截断丢失失败清单。
- 文档角色override `49e5403b` 完成历史完整分册并冻结：主walkthrough9,151bytes，两历史册23,175/6,831bytes；architecture/API压缩重复措辞并保留有效决定。正式docs尺寸门禁剩Task40既有分册一项，CONTEXT为既有增长warning；`docs:check --base HEAD`仅Task40历史22条断链；diff check过。主文不复制历史证据，封口分册不改。

#### 最终验收轮次（进行中）

- Lab 补救 writer `8ba30905` 冻结 6 个 Web 文件：超时设置 Lab 加 `default` 与 `read-failure` 离线场景；默认模型 fixture 读写完整 SystemConfig DTO；面板重试在 click 开始 loading；生成恢复用 `useSyncExternalStore` 订阅 sessionStorage，保留 SSR 首帧/幂等记录/错误锁定。相关 11 Vitest、Lab 29 Vitest、Web TypeScript、全 Web lint（0 errors/20 warnings）通过；设置与 Story error 浏览器用例 2 passed（22.3s）。React 独立审查无确认缺陷，记录了 hydration/storage/过期轮询缺少 hook 级专测的覆盖建议。
- 后端最终修复无 Job 与 orphan Workflow relation 的事件不能回传 Attempt/原错误；只有当前 Attempt 用当前 Job.errorCode，历史 Attempt 固定 `generation_failed`；取消无错误。孤立与重试误分类回归、storage/API typecheck、独立审查通过。
- 冻结代码后的 `bun run test` 运行 235 files / 1492 tests，11 failed / 1481 passed。10 个失败文件均是全仓固定 migration count/hash/导出期望或 SystemConfig projection 未纳入新 timeout migration/DTO；故事错误/超时功能测试通过。完整隔离输出留在 `.agent/tmp/t42-unit-final.log`。测试工程师更新当前 migration snapshot 与截至 price migration 的历史截点，并同步完整 SystemConfig 字段和新增 reader 公共导出。待其冻结后复跑；下一次 Bash executor 准备报告 `EXECUTOR_UNAVAILABLE` 且无命令执行，后续 build/typecheck/全量复跑暂阻，不切换 shell 绕过。
- 文档影响：需更新；原话、Proposal、PRD、ADR、架构及当前 API/storage spec 已同步 300 秒默认、30–1800 秒范围、旧 Run 快照、错误 whitelist/redaction 与孤立/历史 Attempt 降级。封口 spec 分册只读未改。真实 Provider、30 分钟等待、用户数据库 migration、提交/推送/部署均未执行。

#### 写集冻结与待复跑清单

- 测试 writer `21d5aca4` 已冻结，仅修改 10 个测试文件。6 个 current 集成/客户端迁移快照纳入新超时 migration（45 项）；Provider migration 测试审计边界扩至新 migration；定价历史测试显式过滤至 price migration，保留 44/43 项；公共入口清单增加 `PrismaStoryAgentFailureCodeReader`；配置投影断言补充无行/已选/丢失/null 下的默认 300 秒。Leader 分段只读核对以上差异；修改后的聚焦/全仓测试未运行，不能据此认定已绿。测试 writer 报告 `git diff --check` 通过；最后状态文档写入后的差异检查未运行。
- React writer 的最终命令：`bun run --cwd apps/web tsc --noEmit` 通过；`bun run --cwd apps/web lint` 为 0 errors / 20 warnings；`bunx playwright test --config playwright.config.ts story-agent-errors.spec.ts default-model-settings.spec.ts` 为 2 passed（22.3s，包含 Web 生产构建）。全仓命令 `bun run test > .agent/tmp/t42-unit-final.log 2>&1` 的上述 11 failures 为修正前结果；不可引用前轮全绿作为本轮全绿。
- 阻塞：OPS Bash 在准备 Windows 执行树 hardlink 时返回 `EXECUTOR_UNAVAILABLE`、effectState=none，`git status --short` 与 `git diff --stat` 均未执行；工具要求先解决运行时条件，未切换 shell、未请求提权或修改 DSH。文档收尾代理 `6e202f2c` 启动失败，核对无部分写入后由 Leader 更新现状摘要与本记录。
- 最近文档门禁：`bun run docs:check --base HEAD > .agent/tmp/t42-docs-final.log 2>&1` exit 1，仅 Task40 既有 22 条断链；`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` exit 1，仅 Task40 历史分册 30.35 KB / 约 9.9k token，另有 CONTEXT 既有增长 warning。末次状态文档追加后两项均未复跑，最终代码尺寸检查未运行。
- 待执行（运行时恢复后）：`bun run test`；`bun run typecheck`；`bun run build`；`COSMOS_E2E_WEB_PORT=4298 bunx playwright test --config=playwright.config.ts e2e/browser/default-model-settings.spec.ts e2e/browser/story-agent-errors.spec.ts e2e/browser/story-agent-generation.spec.ts`；重跑文档门禁、正式 docs/code 尺寸检查和 `git diff --check`。全部沿用隔离数据；真实来源、真实 Provider、用户库升级、远端 CI 仍未运行。Task/目标保持未完成验收，不宣称发布就绪。

#### 最终验收结果（2026-11-12）

- 修正后的 `bun run test > .agent/tmp/t42-unit-round1.log 2>&1`：235 files / 1492 tests 全通过。`bun run typecheck > .agent/tmp/t42-typecheck-round1.log 2>&1` 与 `bun run build > .agent/tmp/t42-build-round1.log 2>&1` 均 exit 0；完整 build 覆盖 packages、API、Worker、Web。
- `COSMOS_E2E_WEB_PORT=4298 bunx playwright test --config=playwright.config.ts e2e/browser/default-model-settings.spec.ts e2e/browser/story-agent-errors.spec.ts e2e/browser/story-agent-generation.spec.ts`：5 passed / 37.5s，含设置、错误提示、生成持久化及两个计价阈值场景。Web lint 0 errors / 20 warnings；全仓 `git diff --check` exit 0。
- `bun run docs:check --base HEAD` exit 1；核对仍仅为 Task40 历史 22 条断链。本轮新增文档链接未出现在 failures。文档尺寸门禁现只报 Task40 walkthrough 既有 30.35 KB 警戒项及 CONTEXT 基线增长 warning；此前 PROJECT-STATUS 曾因新段落触线，已压缩回健康区并复验消失。代码尺寸门禁的 2 项是未改动的 `workflow-host-runtime.test.ts` 与 `activity-store.ts`，均在本轮工作区 diff 之外。以上历史债务均未改动。
- 需求/Proposal/PRD、ADR、架构和当前 API/storage 合同已更新；真实 Provider、用户数据库迁移、远端 CI、发布部署未运行。旧的“待复跑”过程记录作为发生时证据保留；本结果取代其待执行清单。验收门禁与实际运行日志证据均已记录；Task 完成。

#### 执行器恢复后的统一终验

- 自动续轮 1 先读取当前目标与工作区记录；`pwd` 已成功，先前 Bash 准备故障不再复现。`git status --short` 确认 writer 均冻结，保留全部既有 dirty/untracked 文件。启动 `bun run test > .agent/tmp/t42-unit-round1.log 2>&1` 与 `bun run typecheck > .agent/tmp/t42-typecheck-round1.log 2>&1`，补验最后一轮仅测试的迁移边界和 DTO/导出期望改动。此轮不修改产品合同与行为；文档状态待实际结果更新。

#### 维护者真人验收与闭合

- 2026-11-12，维护者确认刚刚亲自使用 Agent 生成建议一次并成功，判断原有问题已修复。这是一次真实使用的通过证据，不等同重复/长时间稳定性验证；之前记录的真实 Provider 未运行，指自动化最终验收阶段，并不覆盖此后维护者手动验收。依据该结果关闭 Task 42。本次仅记录，不调用 Provider、不读取用户内容。

#### Claude 文档代理诊断与恢复

- 三次 `subagent_role(role="docs-writer", provider="jijiapi-claude-kiro", model="claude-sonnet-5")` 均以通用 `subagent run failed` 结束，`list_agents` 显示对应子代理 inactive，无收尾消息或文档写入。工具未提供每次失败的子代理日志；在 DSH 用户目录只检索到插件安装日志和 skills 管理日志，未找到与这些启动对应的日志文件。因此无法确认角色启动通道内的具体异常。模型目录可见 Claude Sonnet 5 路由；相同模型通过普通 `subagent(provider, model)` 成功启动并完成只读诊断与指定文档更新，故障范围指向 docs-writer 角色启动路径，而非 Claude provider/model 整体不可用。
- 恢复方式：在普通 Claude 子代理中显式声明 docs-only 写集与 Task/代码文件边界，完成 README 和 PROJECT-STATUS 文案。Leader复核后移除被放入 Task README 的代理调试过程，将真人验收事实保留为摘要，将路由诊断留在本 walkthrough；项目状态的“真实 Provider 未运行”也改为只说明未做用户库迁移和部署。未修改 DSH 安装或其代码。

#### 本地提交与合并

- 维护者批准后创建 `feat/t42-story-agent-timeout-errors`，仅暂存 Task 42 的实现、测试、合同与任务文档（88 files）；根目录未跟踪项 `CON` 与 `({id` 保持未暂存。功能提交 `2037131`：`feat(task-42): configure Story Agent timeout and safe errors`。切回 `master` 后 `git merge --ff-only origin/master` 返回 Already up to date，以 `--no-ff` 本地合并；当前 `master` merge commit 同时记录此闭合说明。未 push。
