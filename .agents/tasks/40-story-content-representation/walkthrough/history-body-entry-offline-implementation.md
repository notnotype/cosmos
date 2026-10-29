# 正文摘要与 Web 人工决定入口：离线实施历史

本册封口后只读；从主 walkthrough 归档，仅修正移动后的两个相对链接。记录 `34e0b29` 之前的实施和验证，不是当前验证或真实调用授权。

### 2026-10-29：正文摘要与 Web 人工决定入口（仅离线实施）

基线 `master/c3441e4` 干净；维护者确认方案 A，本轮只实现与离线验证并本地提交，真实外呼仍未授权。唯一写入者使用当前工作区；不建 goal/branch/worktree，不操作用户数据或远端。工具不能指定 `jijiapi/gpt-6-luna` 子代理路由，本轮不派代理。

计划：新增独立入口/固定全文计划、合成种子和会话编排，复用旧入口的隔离 schema、凭据与单次传输保护，不改变 summary-only 入口或产品合同。先以离线测试观察缺失行为失败，再补真实 API 入队→现有 Worker durable Host/@2/SDK→pending；Host 在入口进程中执行（非完整 Node Worker 进程验收）。来源使用固定 ID/时间与现有 Normalizer，ContentQuery 实读必须与事先公开全文逐字相同；模型配置 512 限额且 wire 层再次检查，60s 只计生成。成功生成后立即清理凭据、停止执行 Host，仅保留隔离 API/生产 Web 供维护者手动查看、接受和刷新，脚本不替人决定。

先验证 `--plan` 无库/凭据/联网；正文不能由旧摘要推知、精确版本/块证据、pending 正式不变、单次 POST/重定向与失败截止、人工决定前不自动落库、退出清理。离线合成响应与自动化决定只证明入口安全/接线，不冒称真人或真实模型验收。门禁：聚焦/相关回归、全量测试/类型、隔离浏览器、文档链接/Markdown/diff/大小；失败与未运行项按实际追加。保留固定字段报告和隔离库模型输出；费用/Provider 留存未知，强杀可能残留本地明文凭据，运行须另获逐次授权并在已提交干净终端输入。

### 正文入口：实施结果与验证边界

- RED：`Body acceptance is not implemented`。随后修正旧 seed 字段（`Source definition is not available: undefined`）、messages 计划不一致及预取消接线。拒绝测试的 `expected 201 to be 200` 按既有 HTTP 合同改为 201；最终重跑聚焦/全量，未改产品合同。
- 按上节独立入口方案实现；`--plan` 无凭据/建库/联网。真实模式须干净提交、本地 TTY 和 SHA 确认，重建 API 后无回显读 key；单 POST、无重定向/重试。复用层只增可选批准 messages/Story 与取消信号，旧入口默认和回归保留。
- 真实 API 入队，现有 Host/@2/SDK 在入口进程执行（不是独立 Worker 验收）；ContentQuery 与计划逐字比对。pending 正式行不变，生成后删 SecretRef、停 Host、启 loopback 生产 Web。真人刷新/决定后 `FINISH` 核对 API；接受核对 Revision/标题/摘要/事实，拒绝核对原行不变，未决定不通过。失败/取消清理凭据/进程/连接，不自动重跑；固定报告/计划/隔离库保留，强杀风险同上。
- 离线模型产出旧摘要没有的 18 席/日期及块引用；生产 Web 实验核对正文/输入版本/证据、pending 不变、接受/刷新/持久化，无 page error/外部请求。拒绝、失败、非法输出、截止/取消均核对清理与发送次数；不等于真实理解或真人决定。

以下 PowerShell 命令最终均 exit 0；各命令失败即停。同一 API 构建供聚焦/全量使用；Web 实验每次按动态 API 地址构建，不启动独立 Worker，不改浏览器预算。

```powershell
$env:BUN_BINARY='C:\Program Files\nodejs\node_modules\bun\bin\bun.exe'
bun run build:api
bunx vitest run scripts/acceptance/story-agent-runner.test.ts scripts/acceptance/story-body-runner.test.ts scripts/acceptance/story-body-acceptance.test.ts
bun run test
bun run typecheck
bunx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --verbatimModuleSyntax scripts/acceptance/story-body-acceptance.ts scripts/acceptance/story-body-runner.test.ts scripts/acceptance/story-body-browser.offline.ts scripts/acceptance/story-body-acceptance.test.ts
bun run scripts/acceptance/story-body-acceptance.ts --plan
bun run scripts/acceptance/story-body-browser.offline.ts
```

- 聚焦 **3 文件/16 项，55.85s**；全量 **208 文件/1176 项，188.84s**。全仓类型与额外覆盖验收脚本的严格类型检查通过；API/隔离生产 Web 构建通过。`--plan` 及独立浏览器实验 exit 0，凭据为测试专用假值，无真实 Provider 请求。固定计划不是本轮真实调用授权。
- 五轴自审：正确性（真实 API/正式不变/决定持久化）；简单性（复用原隔离与单次传输）；架构（DTO/HTTP/@2，不改产品）；安全（正文不可信/固定请求/凭据清理）；性能（无产品 bundle/预算变化，构建不计生成截止）。未发现 Critical/Important；非独立 review，工具不能固定指定路由，未派子 Agent。
- 归档已完成预算过程至[历史分册](history-js-budget-acceptance.md)，只移历史，当前结论/有效决定仍在主文档；归档与 `c3441e4` 原文对比，未改阈值或治理基线。文档门禁结果在下面追加。
- **未运行**：本轮完整默认浏览器、Node E2E、组件实验室、property、lint、真实来源/Provider/真人决定、用户库迁移与部署。不把历史 RSS10/summary-only、先前 Node/浏览器绿灯当本轮。Task40 仍 active；下一步先审阅已提交入口的 `--plan`，逐次批准全文、模型/端点、预算、费用与留存，再由维护者真实终端执行一次；关系/质量与真实来源组合、completion 分类及旧 spec 仍未收口。
- 文档初检链接 1221 文件、原文/结构通过；diff 的 EOF 空行 exit 2 已修正。大小两次失败（约 9.6k/9.3k token），精简重复文字并将已完成显式组合原文移至[历史册](history-reading-decision-combination.md)，保留有效结论、校验与基线一致；未改阈值/基线。最终门禁命令：

```powershell
bun run docs:check
bun .agent/tmp/task40-archive-check.ts
bun .agent/tmp/task40-markdown-check.ts
git diff --check
$env:PYTHONUTF8='1'
python scripts/size-governance.py --check --cat docs --baseline docs/doc-governance/docs-baseline.json --fail-on-new
```

最终上述门禁均 exit 0：链接 1222 文件零失败，三段历史原文校验一致，Markdown 十文件通过，diff 通过；大小 PASS（403 文件、5 项基线 warning，含测试规范既存增长）。主文档及新增分册在健康区，未放宽门槛。
