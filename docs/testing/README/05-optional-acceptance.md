---
parent: ../README.md
range: "原 README.md L97-L132；Docker、真实来源与受控 Story Agent 验收"
sealed_at: 2026-11-02
tags: [testing, acceptance, docker, real-source, story-agent]
tokens_est: 1982
---

# 可选验收入口与边界

[返回测试入口](../README.md)。适用读者：准备显式运行 Docker、真实来源或受控 Story Agent 验收的维护者；必须遵守本册的前置、逐次授权、隔离和未验证边界。

## 可选验收

Docker 只通过显式命令执行：

```text
bun run test:docker
```

命令检查 Docker CLI/daemon，执行 `docker compose -f docker/compose.yml up --build -d`，等待 API/Web/Worker 与 Compose 内受控 RSS 服务，按 `source.rss@1/fetch` 完成激活、Run 和 Feed 验收，最后执行 `down --volumes --remove-orphans`。Docker 不属于 `test`、`test:e2e` 或默认 CI；缺少 Docker 前置时命令明确失败。

真实来源只通过显式命令执行，并且每种来源独立校验前置：

```text
COSMOS_REAL_RSS_URL=<url> bun run test:real:rss
COSMOS_ALLOW_REAL_NETWORK=true bun run test:real:aihot
COSMOS_ALLOW_REAL_NETWORK=true COSMOS_OPENCLI_PATH=<path> OPENCLI_PROFILE=<profile> bun run test:real:bilibili
COSMOS_ALLOW_REAL_NETWORK=true COSMOS_OPENCLI_PATH=<path> bun run test:real:bilibili-search
```

`test:real:bilibili` 是同一连接下的 hot+feed 双计划验收；`test:real:bilibili-search` 走 Bilibili 的第二个 operation（EXT-006），**不需要 profile**（搜索匿名可用），并断言读回的 `operationId` 与配置字段都在。

真实来源脚本使用隔离 API/Worker/SQLite，要求 Run 成功、item count 在 bounded 范围内并通过日志脱敏检查。缺变量、联网许可或 OpenCLI/Browser Bridge 前置时立即失败；这些命令不进入默认 CI，也不把网络错误解释为离线 Worker 回归。

### 受控 Story Agent 验收

[`story-agent-acceptance.ts`](../../../scripts/acceptance/story-agent-acceptance.ts) 是需另获逐次授权的终端入口，不进入 CI，也不自动读取用户配置。先用 `bun run scripts/acceptance/story-agent-acceptance.ts --plan` 只读打印完整请求；此模式不读凭据、不建库、不联网。入口离线回归为 `bun run vitest run scripts/acceptance/story-agent-runner.test.ts`，使用真实 SDK 与 durable Host、合成 SSE，不能代替真实 Provider 或产品浏览器验收。

仅在明确批准本次 Provider/model、完整文本、预算、费用与留存后，由维护者在干净已提交工作区的真实本地终端运行 `bun run scripts/acceptance/story-agent-acceptance.ts`。输入包含当前提交号的二次确认，再无回显输入临时 API Key；不通过聊天、参数、环境变量或重定向提供凭据。入口只向计划中的固定端点发送最多一条 POST，不跟随重定向、不自动重试；生成截止时间 60s，SDK 取消收尾及隔离库准备不包含在该时间承诺内。遇到超时、失败或结果未知，不得未经新授权重跑。

每次新建 `.agent/tmp/task40-story-*` 隔离根，固定 schema/migration 来自入口声明的提交，显式 datasource 不读继承的数据库地址。成功生成仅保存 pending，再在该合成库拒绝，正式 Story 不变。保留数据库（含校验后的模型输出）、请求计划和固定字段结果，不记录原始 HTTP 响应/头或凭据。临时 SecretStore 为本地明文文件，Windows 权限仅尽力保护；正常/失败退出清理全部新 SecretRef 并断开数据库，准备失败删除本次新根；强制终止/断电仍可能残留，因此不在共享机器运行。此入口不部署产品、不升级用户库，也不证明用户环境已配置。

正文摘要与人工 Web 决定使用独立 [`story-body-acceptance.ts`](../../../scripts/acceptance/story-body-acceptance.ts)：先运行 `bun run scripts/acceptance/story-body-acceptance.ts --plan` 披露合成来源全文、精确版本/块、实际提示词及同一模型/端点/预算。**实现与离线通过不构成真实调用授权**；须另获本次完整计划、费用与留存许可后，在干净已提交工作区的本地真实终端无参数运行。确认后、读凭据前本地重建 API。入队走真实 HTTP，生成复用现有 Worker Host/@2/SDK，但 Host 在入口进程中手动驱动，不是独立 Worker 进程验收。保留的请求计划含代码与 schema 提交号。

该入口不自动接受或拒绝：生成后核对 pending 时正式数据不变并立即删凭据，停止驱动 Host，再构建和启动仅 loopback 的生产 Web。维护者检查正文、输入版本和候选证据，手动决定并刷新，再在终端输入 `FINISH`；入口仅从 API 核对接受的正式标题/摘要/关键事实与新 Revision，或拒绝后的正式行不变。未决定退出保留 pending 并返回非通过；异常/取消关闭 API/Web、删凭据、断开库，不自动重试。生成 60s 不包含本地构建与清理，Provider 留存/费用未知及强杀残留风险同上；正文是合成 seed，不是真实来源 ingest 验收。

离线回归为 `bunx vitest run scripts/acceptance/story-body-runner.test.ts scripts/acceptance/story-body-acceptance.test.ts`。显式 `bun run scripts/acceptance/story-body-browser.offline.ts` 使用真实 API/生产 Web 和合成 SDK 响应自动点击决定（须先 `bun run build:api`），不调用 Provider、不读真实凭据；它仅证明产品接线，不是真人/真实模型验收。固定字段报告记录正文引用数与人工决定后的持久化核验，不据此自动判断摘要质量或关闭 Task。正文入口的 `failureCode` 只做脱敏阶段分类：JSON 无法解析为 `proposal_json_invalid`、既有提案合同拒绝为 `proposal_schema_invalid`、未正常结束或带工具为 `completion_incomplete`；`candidate_save_failed` 仍不能区分证据范围拒绝与存储失败，其它故障保留固定回退码。报告不输出模型文本、原始异常或校验细节，严格校验与失败后禁止自动重跑不变。
