# Task 40 历史：显式阅读降级与候选决定验收

已完成于 `c3441e4`；以下仅保存当时过程，不代表当前运行证据。当前状态与有效决定见[主记录](../walkthrough.md)。历史原文封口保留，文内链接只调整相对层级。

### 2026-10-27：剩余清单复核与隔离组合计划

基线 `master` / `8353a50`，工作区干净。复核目标设计 §4.1 十二点和本 Task 阶段 3–8：升级/recovery/JS 预算已有后续证据，剩余阅读降级显式复验、真实来源和 Agent 正文/关系/质量/Web 组合；completion 分类及旧 spec 待独立评估。

本轮授权仅覆盖有界证据与本地提交，不含新外呼。真实来源需显式来源/联网前置；真实 Agent 须逐次批准模型/端点、全文、预算费用、留存，并由维护者终端输入临时凭据。旧 RSS/summary-only 授权不可复用。不外呼，不操作用户数据、goal/branch/worktree/部署。工具无法固定 `jijiapi/gpt-6-luna`，不派代理或换模型。

选定 `COSMOS_E2E_READING_DEGRADATION=1`：新隔离栈组合阅读降级（1024/1440）、媒体降级及候选接受/拒绝/证据失效。真实 API/Worker/生产 Web、本地来源、合成模型，不代表真实模型理解。先构建；失败保留诊断不重跑抹除；无缺口不改业务/测试。只更新当前文档、运行门禁并提交。

### 隔离组合结果与剩余边界

以下 PowerShell 命令 exit 0；构建失败即停止，Playwright 无自动重试。本轮仅文档落盘，无生产代码、测试或 schema 修改，不制造 RED 或虚报修复。

```powershell
$env:BUN_BINARY='C:\Program Files\nodejs\node_modules\bun\bin\bun.exe'
$env:COSMOS_E2E_READING_DEGRADATION='1'
bun run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
bunx playwright test --config playwright.config.ts e2e/browser/story-reading-degradation.spec.ts e2e/browser/story-media-degradation.spec.ts e2e/browser/story-agent-generation.spec.ts
```

- 构建 API/Worker/共享包与生产 Web 通过；隔离 Web Stack 再按其动态 API 地址构建通过。组合 **5 通过/0 跳过/0 失败，37.5s**：阅读降级 1024/1440 各一项，媒体降级同宽度各一项，候选生成/人工决定一项。仅输出颜色环境 warning，无测试失败。
- 首开/刷新：旧 HTML 无脚本/跟踪图；坏/失败表示不偷换正文；缺 Asset 保序及安全外链；音视频仅元数据，图片被拦/空正文诚实提示。候选 pending 不改 Story，接受写入、旧正文版本候选禁接受/可拒绝、刷新保持决定。合成 SSE 不证明真实模型理解。
- 清单 #4/#10/#11/#12 的上述组合有本轮证据；#8 真实模型分层读取及其它真实来源/任务/Web 组合仍缺。历史两项跳过保留，不拼成一次 67 项全绿。
- 五轴自审：正确性查 API/刷新/不变；简单性复用测试；架构走生产栈；安全隔离/本地/合成；性能无代码/预算变化。非独立审查。未运行完整浏览器、全量单元/独立类型、Node E2E、组件实验室、property、真实来源/Agent、用户库升级/部署；旧证据不冒称本轮。
- Task40 active；下一步先准备“带来源正文的摘要→人工决定”真实请求计划，披露全文/模型/端点/预算费用/留存清理风险后逐次申请授权；当前 summary-only 入口不支持该组合，不直接执行或复用旧凭据。关系/质量、completion 分类和旧 spec 后续独立评估。
- 文档预检：约 9.2k token 失败，升级过程[原文归档](history-old-schema-upgrade.md)且保留有效结论；对基线校验通过，仅调链接深度。两次 diff 因 EOF 空行 exit 2，修正后 exit 0；大小仍约 9.0k 失败，再精简本轮重复文字。未改阈值/基线。最终以下命令均 exit 0：链接 1210 文件零失败，归档原文一致，Markdown 七文件通过，diff 通过，大小 PASS（401 文件、5 项既存 warning）。

```powershell
bun run docs:check
bun .agent/tmp/task40-archive-check.ts
bun .agent/tmp/task40-markdown-check.ts
git diff --check
$env:PYTHONUTF8='1'
python scripts/size-governance.py --check --cat docs --baseline docs/doc-governance/docs-baseline.json --fail-on-new
```
