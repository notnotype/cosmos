# 测试入口与验收边界

本文是 Cosmos 测试层级、fixture、验收、临时数据和验证证据合同的真相源。当前默认门禁离线、可重复，不读取用户真实 `.cosmos` 数据，也不要求 Docker、公网来源或 OpenCLI；具体某次运行结果和未运行项只在对应 Task 与 [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md) 记录。

维护者先按分层入口选命令，再按主题读分册。测试只用隔离库与文件根，进程使用动态端口并在结束时清理。各册继承离线、隔离和证据边界；可选验收须遵守册内前置与逐次授权。未来有效规则变化由入口指向新增或替代册；封口册仅保历史证据，勘误记于入口。

| 分册 | 用途与读者 | 标签 | 大小 / token | 封口状态 |
| --- | --- | --- | --- | --- |
| [测试层与浏览器合同](README/01-layers-browser-contracts.md) | 测试、迁移、性能、浏览器与CI维护者；含文档门禁和隔离 | testing/browser/component-lab/migration/performance/ci | 8991B / 2948 | 封口 2026-11-02 |
| [Story 与 Entry](README/02-story-entry-anchors.md) | 核对版本、证据、拆分、状态迁移与用户真相保护 | testing/story/entry/evidence/user-truth | 8889B / 2790 | 封口 2026-11-02 |
| [组织与看板](README/03-organization-board-anchors.md) | 核对Topic、Entity、组织、看板与搜索 | testing/topic/entity/organization/board/search | 8856B / 2806 | 封口 2026-11-02 |
| [媒体策略](README/04-media-policy-anchors.md) | 核对来源策略、重试与保留期清理 | testing/media/retry/retention | 2791B / 873 | 封口 2026-11-02 |
| [可选验收](README/05-optional-acceptance.md) | 准备Docker、真实来源或受控Story Agent验收 | testing/acceptance/docker/real-source/story-agent | 6081B / 1982 | 封口 2026-11-02 |

## 分层入口

| 层级          | 命令                                                                         | 当前覆盖                                                                                                       |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 单元          | `bun run test`                                                               | 包内和应用单元行为测试；默认配置排除 `*.property.test.ts`                                                       |
| 属性          | `bun run test:property`                                                      | 独立收集 `packages/**` 与 `apps/**` 下的 `*.property.test.ts`，覆盖幂等、租约 fencing 和 Worker recovery priority |
| 类型/数据库   | `bun run typecheck`、`bun run db:validate`、`bun run db:generate`            | 全仓 TypeScript、Prisma schema 与 Client                                                                       |
| 构建          | `bun run build`                                                              | packages、API、Worker、Next Web 生产产物                                                                       |
| Node 进程 E2E | `bun run test:e2e`                                                           | 构建后的真实 API/Worker、隔离 SQLite、HTTP、SSE、结构化日志；包含 ingest、Admin、跨进程 recovery、调度失败隔离 |
| 浏览器 E2E    | `bun run test:browser`、`bun run test:browser:component-lab` | 真实 Next/API/Worker Stack 产品流与首页主题偏好持久化/明暗跟随；开发态组件实验室交互、props、提交阻断、token、全局外观切换与隔离验收 |
| Windows smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-node.ps1` | Windows Node API/Worker、迁移、受控 HTTP RSS、Feed/Search/Story、SSE、requestId 和脱敏日志                    |

## 证据边界

测试通过只证明对应层的可观察合同：单元测试不替代进程 E2E，Node E2E 不替代浏览器验收，浏览器验收不替代 Docker 或真实来源。受控 RSS、SSE 消费和结构化日志是当前 Cosmos 的可复现测试边界；当前哪些层级已通过或未运行，以 [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md) 为准。本文不引入 Agent/LLM replay。**会「同一条用例既过又挂」的情况登记在 [`known-unstable-cases.md`](known-unstable-cases.md)**：报出某层绿灯前先看那里，已登记的不稳定用例不要用重跑结案。浏览器验收 33 条用例按「断言到底在查什么」分成产品契约 / UI 机制 / 外观三桶，见 [`browser-acceptance-triage.md`](browser-acceptance-triage.md)——**重做 UI 之前先看它**，避免把产品契约断言连同界面形状一起丢掉。

## Task 42 Story 成本浏览器验收

[Story 生成用例](../../e2e/browser/story-agent-generation.spec.ts)与[默认模型设置用例](../../e2e/browser/default-model-settings.spec.ts)运行隔离数据库、真实浏览器/API/Worker；模型响应由 Worker 内仅匹配 `story-agent.e2e.invalid` 的 HTTP fixture 提供，并断言合成 key/body，不向真实 Provider 外呼。费用按 usage 与调用时配置价格计算，不是服务商账单；覆盖 completed 且候选身份匹配才投影 generation 费用、持久候选显示、刷新恢复及改价不重算。离线探测以 Node 替代 OpenCLI，验证合成执行失败后的 `lastError`/`lastCheckedAt` 写回与 UI 一致；不访问 BrowserBridge 或真实账号，不证明登录成功，也不归因为版本校验失败。最终运行结果与未验证项只记于 [Task 42](../../.agents/tasks/42-default-model-ui-api/README.md)和[项目状态](../../PROJECT-STATUS.md)，本文不宣称本轮已通过。

## 勘误

[测试层与浏览器合同](README/01-layers-browser-contracts.md)“文档治理”与“CI 分层”节中“不校验标题锚点”“空白仅由 diff 检查”“文档命令在质量 job”的表述仅保留为封口历史，不再代表当前门禁。现有增量锚点、分册元数据、新增 Markdown 空白、快照/基线及独立 docs job 的唯一当前合同见[文档治理入口](../doc-governance/README.md#文档检查当前合同)；检查通过仍不能证明架构真实性或替代其它验收层。
