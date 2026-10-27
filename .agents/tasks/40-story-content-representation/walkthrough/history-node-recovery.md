# Task 40 历史：Node recovery 独立诊断

> 已完成过程归档，来自主 walkthrough；除本分册的相对链接层级外，原记录不变。当前状态与有效决定见[主记录](../walkthrough.md)。本分册封口只读。

### 2026-10-27：Node recovery 独立诊断计划

基线 `master` / `b883f30`，工作区干净。维护者授权单独诊断并本地中文提交；只用新建隔离根、本地受控 RSS 和真实 Node API/Worker，不操作用户数据、外呼、goal、分支/worktree 或远端。先原样构建/复现，再对照 Worker/Host/SQL 租约与请求边界取证；只按单一已验证根因补测试/最小修复，不放宽等待上限。当前仅知第二 Worker 请求等待超时，尚不判定产品或测试缺陷。JS 预算和真实来源/Agent 不在本步。随后运行聚焦 recovery、相关回归、完整 Node E2E、单元/类型与文档门禁，并记录未运行项。

### 2026-10-27：Node recovery 诊断结果

根因是旧测试预期失效，不是 Worker 未接管。批准的 [Host 派发保护](../../../../docs/aegis/plans/2026-10-18-task39-provider-discovery.md)禁止结果未知时自动重发；[持久 owner](../../../../packages/storage-prisma/src/workflow-host-store/activity-store.ts)消费派发授权后，崩溃/租约过期必须终止为 `outcome_unknown`。该规则通用于 Activity，包含 RSS，不只模型请求。原测试仍等第二个 HTTP 请求，故确定超时；未改产品或放宽等待上限。

证据/测试过程：

- 原样构建及 recovery RED：`Timed out waiting for second Worker started and reclaimed RSS`。隔离 DB 显示唯一 Job `failed_terminal`/`outcome_unknown`/attempts=1、Run `failed`、无 Entry/Observation；第二 Worker 已启动。请求已到本地 RSS，但响应尚未释放。
- 改 [recovery E2E](../../../../e2e/recovery.e2e.test.ts)：观察真实 Job/Run 租约过期替代固定 1250ms sleep；断言已消费派发授权、第二 Worker 完成未知结果终止、清除租约且不再尝试。释放旧响应后等待 completion 安全排空，仍仅一次请求、一个 Job、零来源事实/空 Feed；日志脱敏和隔离清理保留，主要行为移入实际测试用例。初版曾误把配置 Worker ID 当作租约 owner，已按真实带 PID 的 instanceId 修正断言。
- 终止 Run 的失败 completion 会经当前错误分类重试至 `dead_letter`，日志出现 `Workflow run is not pending: failed.`。这是现有排空路径，不是第二次外呼；本步明确断言排空后无新增事实，未顺手修改该生命周期。通用 completion 分类/减少无用重试留后续评估。
- Windows 验证前置曾受默认 `BUN_BINARY=bun` 的 `spawnSync bun EINVAL` 阻断；外层命令指定已核实的 Bun 可执行文件后继续，未改仓库路径默认值。所有 API/Worker 仍运行真实 Node dist，RSS 为本地合成源，无真实来源或模型请求。

| 完整命令 | 本步结果 |
| --- | --- |
| `$env:BUN_BINARY='C:\Program Files\nodejs\node_modules\bun\bin\bun.exe'; bunx vitest run --config vitest.e2e.config.ts e2e/recovery.e2e.test.ts` | 原预期 exit 1；最终 1 文件/1 项通过（9.79s），实际崩溃/接管约 2.70s。 |
| `$env:BUN_BINARY='C:\Program Files\nodejs\node_modules\bun\bin\bun.exe'; bun run test:e2e` | 最终 exit 0，包含包/API/Worker 构建，7 文件/13 项通过（58.14s）。 |
| `bunx vitest run packages/storage-prisma/src/store-dispatch-fence.test.ts packages/storage-prisma/src/workflow-backend.test.ts packages/application/src/workflow-host-runtime.test.ts apps/worker/src/workflow-host.test.ts` | 4 文件/50 项通过（89.32s）。 |
| `bun run test` | 206 文件/1167 项通过（176.95s）。 |
| `bun run typecheck` | 全包及 API/Worker/Web exit 0。 |

五轴自查（非独立审查）：正确性——真实 Node/SQLite/HTTP 验证持久状态且不重复请求；简单性——仅测试 owner 改动；架构——遵循既有派发保护；安全——全新隔离根、日志脱敏、不接触用户数据；性能——等待真实租约、不增加超时，无产品热路径变化。工具无法指定要求路由，未使用子 Agent 或替代模型。

文档门禁：`bun run docs:check` 1208 文件/零失败；`bun .agent/tmp/task40-markdown-check.ts` 五文件标题/围栏/尾随空白通过，表格/结构人工复核；`$env:PYTHONUTF8='1'; python scripts/size-governance.py --check --cat docs --baseline docs/doc-governance/docs-baseline.json --fail-on-new` PASS（399 文件、5 项既存 warning）。`git diff --check` 初次报 `new blank line at EOF`，删除多余空行后复验 exit 0。已核对归档与 HEAD 历史原文完全一致，当前状态/有效决定仍在主文档；未改阈值/基线。

未运行浏览器/组件实验室、property、真实来源/Agent、用户库升级或部署。当前 `docs/spec/README.md` 的“接管和最终 Feed”旧表述需后续 owner 同步，本步只改 Task40 记录和状态入口，不改稳定合同。Task40 仍 active；下一步单独处理首屏 JS 预算（不放宽），随后复验目标浏览器及真实来源/Agent 未覆盖组合。
