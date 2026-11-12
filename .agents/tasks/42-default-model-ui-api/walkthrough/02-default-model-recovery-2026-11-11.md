---
parent: .agents/tasks/42-default-model-ui-api/walkthrough.md
range: 默认模型失效生成修复（2026-11-11）
sealed_at: 2026-11-12
tags: [task, default-model, walkthrough, archive]
tokens_est: 2300
---

# Task 42 Walkthrough

## 默认模型失效生成修复（2026-11-11）

维护者在只读诊断后要求：“现在开始修复问题，修复完成后我会去手动试用，测试功能是否正常。”复用 Task 42，因为默认模型设置、Story 生成入口和提示均在其原范围；本轮不创建分支/worktree、不提交或部署。开始时 branch `master`，base `5e92aea072459e9d1fc9f586dffb92d5f7ea801b`，仅无关未跟踪 `CON` 和 `({id`，均不读取或处理。Leader 为当前父 Agent，全部 writer 共用此 repository/worktree。

阶段：RED → GREEN → 验证。目标：没有可用默认模型时明确引导用户重新选择，不再创建注定失败的生成任务。验收：①区分未设置、失效和读取失败，阻止生成且能刷新恢复；②后端入队前校验模型存在与 Provider active，拒绝时不创建任务，已存在幂等请求仍可读取；③配置有效时原生成/候选/费用行为保持。

合同：保留 API 0009 的删除后默认 ID 保留、详情 null 约定，不修改 schema/公共 DTO、不自动选择唯一模型、不修改真实配置或读取 .cosmos；本轮不存在历史操作证据证明用户曾删除重建模型。运行中已核实默认 ID 悬空，失败作业记录 selected model unavailable；真实 Provider 请求不在本轮验证范围。

所有权：后端 writer 仅 application Story 控制、API 装配及相关后端测试；前端 writer 仅 Story 面板/成本提示、copy 和相关 React 测试；测试 writer 仅 e2e/browser/story-agent-generation.spec.ts；Leader 唯一维护本 walkthrough，文档 writer 仅相关 API/Web spec 与项目状态。测试仅使用既有隔离 fixture 根。文档影响：需更新，记录准确的生成前置条件与配置恢复交互，不改默认模型持久化约定。

### 本轮实施与验证结果

实现：后端新增必需的 SystemConfig 窄读口，在既有幂等结果返回之后、准备 Story/source 和创建 envelope 之前检查显式或默认模型存在与 Provider active；配置冲突使用既有 `WorkflowHostConflictError` → 409 `conflict`，不改变其它 `invalid_state` → 400。API 装配、两个 acceptance runner 和 Worker/API 测试构造点全部接入。前端配置 hook 保存完整默认 ID 与模型状态，处理 focus 重读、请求序号和卸载；缺少/失效/读取失败状态阻止生成且提供设置与重读入口。点击生成先 fresh GET，有效才读来源/POST；无效配置直接展示配置状态，不留下重复的通用错误。未固化默认 ID，Worker 仍执行时解析；没有模型/schema/迁移和真实配置写入。

RED：后端新增拒绝用例先证未配置、悬空、inactive 会继续创建任务，显式选择未读取；前端新增模块测试先证模块缺失。浏览器首轮 3/4 通过，主链因 ready 态测试点击仅错误态存在的重读按钮而超时，改成真实 focus 入口；第二轮全部功能断言走完，末尾把受控注入 503 的浏览器资源错误误当成产品错误。最终测试精确断言恰一条预期 503，单独断言没有 pageerror，仅消费该条；正常流程仍严格要求无错误。未放宽功能断言或超时。

完整验证命令（Windows 会话以 PATH 加入已安装 Bun 目录并设置 BUN_BINARY/NODE_BINARY；没有安装新依赖）：

| 验证 | 命令 | 实际结果 |
| --- | --- | --- |
| 后端聚焦 | `node node_modules/vitest/vitest.mjs run apps/api/src/app.controller.structured-content.test.ts apps/worker/src/story-agent-workflow.test.ts` | 2 files / 15 tests passed；最后 API 类型化 fixture 单跑 13/13 passed |
| 前端聚焦 | `node node_modules/vitest/vitest.mjs run apps/web/src/components/cosmos/story-panel/use-story-agent-config.test.ts apps/web/src/components/cosmos/story-panel/story-generation-cost.test.ts apps/web/src/components/cosmos/story-panel/agent-candidates.test.ts` | 3 files / 40 tests passed；最终 alert/无效配置返回调整后复跑 40/40 |
| 类型 | `bun run typecheck` | 全仓 exit 0；application/API/Worker 和 Web 亦分别通过 |
| 构建 | `bun run build:api && bun run build:worker` | 依赖包、API、Worker exit 0；各轮隔离浏览器内部 `bun run build:web` 均通过 |
| 全仓回归 | `bun run test` | 231 files / 1455 tests passed，250.05s |
| 浏览器矩阵 | `COSMOS_E2E_WEB_PORT=4174 bun x playwright test --config playwright.config.ts story-agent-generation.spec.ts default-model-settings.spec.ts` | 第二轮设置流程与两条阈值计费 3 条通过；主流程仅受控 503 的末尾错误收集断言失败，功能链全部已走完 |
| 最终主流程 | `COSMOS_E2E_WEB_PORT=4174 bun x playwright test --config playwright.config.ts story-agent-generation.spec.ts --grep 'persists actual cost'` | 1/1 passed，25.8s；无默认/悬空禁用、直接 POST409且不增 Run、设置页恢复、清配置后来源/POST不发生、focus恢复、503重读恢复、生成前配置读取顺序、Worker生成/接受/费用持久化均通过 |
| Web 变更 lint | 在 `apps/web` 执行 `eslint src/components/cosmos/story-panel/agent-candidates.tsx src/components/cosmos/story-panel/story-generation-cost.tsx src/components/cosmos/story-panel/story-generation-cost.test.ts src/components/cosmos/story-panel/use-story-agent-config.ts src/components/cosmos/story-panel/use-story-agent-config.test.ts src/copy/areas/reading.ts` | exit 0，writer 最终前端调整后复跑 |
| 格式 | `git diff --check` | exit 0 |
| 文档 | `bun run docs:check --base HEAD` | exit 1，仍仅 22 条未修改 Task 40 历史断链；本轮变更没有新失败 |

代码独立五轴只读审查无 Required/Critical 阻断；Optional 是未来补同 key 并发创建与显式 inactive 矩阵，不属于本次新增故障或交付门槛。源码/测试代理全已停止写入。文档代理两次启动失败未写文件，由 Leader 完成 API/Web spec、项目状态最小同步；文档影响结论仍为“需更新”，已完成，不改变删除后保留默认 ID 的既有设计。执行器两次临时 Bash 准备失败均未执行命令，没有换壳/提权绕过；后续正常工具调用完成核对。

未运行：真实 Provider/来源调用、真实用户数据迁移、发布/部署、远端 CI、额外 property 或全量浏览器套件。真实模型可用性由维护者手动验收；先让本地服务加载最新代码，再在设置页重新选择当前模型并保存，返回 Story 生成。当前用户配置仍悬空，未自动改选模型；无 commit、push 或 merge。
