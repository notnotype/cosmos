# 测试入口与验收边界

本文是 Cosmos 测试层级、fixture、验收、临时数据和验证证据合同的真相源。当前默认门禁离线、可重复，不读取用户真实 `.cosmos` 数据，也不要求 Docker、公网来源或 OpenCLI；具体某次运行结果和未运行项只在对应 Task 与 [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md) 记录。

## 分层入口

| 层级          | 命令                                                                         | 当前覆盖                                                                                                       |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 单元          | `bun run test`                                                               | 包内和应用单元行为测试；默认配置排除 `*.property.test.ts`                                                       |
| 属性          | `bun run test:property`                                                      | 独立收集 `packages/**` 与 `apps/**` 下的 `*.property.test.ts`，覆盖幂等、租约 fencing 和 Worker recovery priority |
| 类型/数据库   | `bun run typecheck`、`bun run db:validate`、`bun run db:generate`            | 全仓 TypeScript、Prisma schema 与 Client                                                                       |
| 构建          | `bun run build`                                                              | packages、API、Worker、Next Web 生产产物                                                                       |
| Node 进程 E2E | `bun run test:e2e`                                                           | 构建后的真实 API/Worker、隔离 SQLite、HTTP、SSE、结构化日志；包含 ingest、Admin、跨进程 recovery、调度失败隔离 |
| 浏览器 E2E    | `bun run test:browser`、`bun run test:browser:component-lab` | 真实 Next/API/Worker Stack 产品流；开发态组件实验室交互、props、提交阻断、token 和隔离验收 |
| Windows smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-node.ps1` | Windows Node API/Worker、迁移、health、fixture、Feed/Search/Story、SSE、requestId 和脱敏日志                   |

`bun run test:e2e` 使用独立的 `vitest.e2e.config.ts`，先构建 API/Worker，再串行运行 `e2e/**/*.e2e.test.ts`。默认 `vitest.config.ts` 明确排除 `*.property.test.ts`；`bun run test:property` 使用独立的 `vitest.property.config.ts`，只收集当前三份 property 文件：`apps/worker/src/runtime.property.test.ts`、`packages/application/src/workflow-control.property.test.ts` 和 `packages/storage-prisma/src/workflow-host-store.property.test.ts`，不会扫描普通单元测试。

## 文档治理

组件实验室的自动化验证分为两层。单元层比较 `apps/web/src/components/ui/*.tsx`、`apps/web/src/components/cosmos/*.tsx` 的公共组件模块与实验室注册表，拒绝未登记组件、不存在的模块、重复组件/场景 id、缺少默认场景、无效控件默认值和未登记 token；URL、localStorage 和 JSON 快照解析以 `unknown` 进入 Zod 边界，并覆盖非法输入不替换既有有效状态。该层属于默认 `bun run test` 与 CI Quality。

实验室新增或改变交互时必须在真实开发 Web 表面验证 `/dev/components`：组件/场景/视口/主题/配色 URL 可复现，前进后退正确，token 覆盖只影响预览画布，本地草稿可恢复，非法 JSON 导入保持原状态。浏览器验收覆盖 320、768、1024、1440 px、键盘与焦点、console、page error 和失败网络请求。生产 Web 还需在 build/start 后确认 `/dev/components` 返回 404，且实验室没有 Product API、SSE 或用户数据请求；开发态通过不能替代生产隔离验收。

`bun run docs:check` 要求治理入口存在且根 README 可达 Agent 治理入口，检查根目录、`docs/`（排除原始需求与 research）、`.agents/`、`.local/README.md` 和 `.github/` 中活跃 Markdown 的相对目标文件或目录，并拒绝退休路径、反斜杠、仓库越界和 Windows 盘符绝对路径。query 和 fragment 不参与目标路径解析，门禁不校验标题锚点或代码行号是否存在。它不执行应用代码，也不替代类型检查、行为测试、构建或运行时验收；文档迁移和治理规则变更必须运行该命令。

## 隔离与进程

Node E2E 通过 `scripts/e2e/helpers.ts` 为每个场景创建 `.agent/tmp/<name>-<uuid>/`，分别放置 Data、Blob 和 Log Root，并调用 Prisma migration。API、Worker 和 Worker Admin 使用动态端口；测试不能假设 `9091` 空闲。Windows 停止进程树使用 `taskkill /t /f`，POSIX 使用进程组终止；所有测试在 finally 中停止服务。

受控 RSS recovery 使用 `scripts/e2e/controlled-rss.ts` 的真实 HTTP 请求、请求到达和 lease expiry 同步，不使用固定 sleep 伪造接管。验证从 API、SQLite、结构化日志和最终 Feed/Run 读取，不接受进程自报成功。

浏览器 Stack 由 `scripts/e2e/web-stack.ts` 管理隔离 API/Worker/Next 进程。动态 API 端口在 Next production build 前注入，Web 使用 same-origin `/api` rewrite；需要先安装 Chromium：

```text
bunx playwright install chromium
```

测试监听 `pageerror`、未预期 console error 和网络失败，并在 teardown 清理全部子进程。截图和 trace 位于被忽略的 `test-results/`，不作为业务状态来源。

## 可选验收

Docker 只通过显式命令执行：

```text
bun run test:docker
```

命令检查 Docker CLI/daemon，执行 `docker compose -f docker/compose.yml up --build -d`，等待 API/Web/Worker，完成 fixture Run 和 Feed 验收，最后执行 `down --volumes --remove-orphans`。Docker 不属于 `test`、`test:e2e` 或默认 CI；缺少 Docker 前置时命令明确失败。

真实来源只通过显式命令执行，并且每种来源独立校验前置：

```text
COSMOS_REAL_RSS_URL=<url> bun run test:real:rss
COSMOS_ALLOW_REAL_NETWORK=true bun run test:real:aihot
COSMOS_ALLOW_REAL_NETWORK=true COSMOS_OPENCLI_PATH=<path> OPENCLI_PROFILE=<profile> bun run test:real:bilibili
```

真实来源脚本使用隔离 API/Worker/SQLite，要求 Run 成功、item count 在 bounded 范围内并通过日志脱敏检查。缺变量、联网许可或 OpenCLI/Browser Bridge 前置时立即失败；这些命令不进入默认 CI，也不把网络错误解释为离线 Worker 回归。

## CI 分层

`.github/workflows/ci.yml` 将质量、Node E2E、浏览器 E2E 和 Windows smoke 分为独立 job。质量 job 依次执行 `bun run docs:check`、数据库检查、类型检查、单元测试、属性测试、Web lint 和构建；Node/browser/smoke job 分别报告自己的结果。Docker 和真实来源没有加入默认 CI。

## 证据边界

测试通过只证明对应层的可观察合同：单元测试不替代进程 E2E，Node E2E 不替代浏览器验收，浏览器验收不替代 Docker 或真实来源。受控 RSS、SSE 消费和结构化日志是当前 Cosmos 的可复现测试边界；当前哪些层级已通过或未运行，以 [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md) 为准。本文不引入 Agent/LLM replay。
