# Task 40 历史：首屏 JS 预算验收

已完成于 `8353a50`；仅保存当时过程，不代表当前运行证据。当前状态与有效决定见[主记录](../walkthrough.md)。以下历史原文封口保留。

### 2026-10-27：首屏 JS 预算切片计划

基线 `master` / `83f7e64`，工作区干净。按维护者授权只处理原预算并复验浏览器，本地中文提交；不改门槛/测量窗口，不操作用户数据、goal、分支或远端。Windows / Node v24.14.0 / Bun 1.4.2，以同一隔离浏览器栈重复采样。现有门禁两次均为 401954 > 335974 bytes；先追静态依赖，再以单一假设做最小修复，保持阅读/编辑能力和边界校验。完成后跑聚焦重复采样、完整浏览器、相关回归/全量测试/类型及文档门禁；真实来源/Agent 不在本步。

依赖图发现两份 Zod 4.4.3：contracts/Web 解析到 Bun 管理的安装，transport 的 `client-configured-models.ts:11` 却因未声明直接依赖而借用根安装。下一小步在 transport 声明已有 Zod 依赖并由包管理器更新锁定关系，验证消除重复；不加构建 alias，不删输入/响应校验。

### 首屏预算：诊断与聚焦验证

- RED：原预算测试两次 401954 > 335974 bytes。Board 浏览入口静态导入仅编辑用的拖拽库；模块级 `next/dynamic` 后两次 385227，仍失败。
- contracts 的 `sideEffects: false` 实验两次 386549，无收益，已撤回。一轮构建撞上声明移动中间态，报 `Cannot find name 'BoardDndProvider'` / `Cannot find name 'BoardBlockList'`；稳定源重跑排除，不算验收通过。
- `bun run --cwd apps/web next experimental-analyze --output` exit 0。诊断数据中两个 Zod 4.4.3 并存：contracts → `.bun/zod@4.4.3`，transport → 根实体安装。transport 直接 import 却漏声明依赖；补依赖，Bun 锁定关系增一行，无版本升级、alias 或校验删减。
- `bun install --ignore-scripts` exit 0，但混合布局未重连；`bun install --linker isolated --ignore-scripts --frozen-lockfile` exit 0 后三方解析同一安装。后者是本次复验前置，不把编辑清单当既有安装已修复；未改安装源。
- GREEN：最终源两次 313.1 KB / 15 脚本，可交互 207/212 ms、路由切换 171/100 ms。阈值、`load` 窗口及测试未改；仅编辑时加载拖拽，完整浏览器复验指针排序。

```powershell
$env:BUN_BINARY='C:\Program Files\nodejs\node_modules\bun\bin\bun.exe'
bun run build
bunx playwright test --config playwright.config.ts e2e/browser/layout-and-budget.spec.ts --grep '首屏可交互与路由切换' --repeat-each=2
```

上面同一命令用于基线 RED、各单变量实验与最终 GREEN；构建失败即停止，不把旧构建当新结果。

### 首屏预算：最终门禁与边界

以下命令最终均 exit 0（PowerShell 各步失败即停止）；同上 `BUN_BINARY`：

```powershell
bun run test:browser
bunx vitest run packages/transport-http/src/client-configured-models.test.ts packages/transport-http/src/client-board.test.ts apps/web/src/components/cosmos/board-drag.test.ts
bun run test
bun run typecheck
bun run docs:check
bun .agent/tmp/task40-archive-check.ts
bun .agent/tmp/task40-markdown-check.ts
$env:PYTHONUTF8='1'
python scripts/size-governance.py --check --cat docs --baseline docs/doc-governance/docs-baseline.json --fail-on-new
git diff --check
```

- 完整浏览器：65 通过/2 跳过/0 失败，4.2m；首屏 313.1 KB、242 ms，切页 231 ms，原预算通过。真实指针排序及 Story 生成/版本用例通过。跳过为未开 `COSMOS_E2E_READING_DEGRADATION=1` 的 1024/1440 阅读降级两例，不能计入通过。
- 相关回归 3 文件/19 项；全量 206 文件/1167 项（211.17s）；全仓类型通过。文档链接/Markdown 初次通过；大小门禁因本文 29.99 KB / 约 10.0k token 失败，仅归档已完成 recovery 过程。原文与 HEAD 对比通过（只调相对链接层级），有效结论保留；最终链接 1209 文件零失败、结构六文件通过、diff exit 0、大小 PASS（400 文件/5 项既存 warning），主文档及新分册均在健康区；未改阈值/基线。
- 五轴自审：合同无改；用户事实/持久化未动；外部输入校验保留；编辑依赖实测可用；预算窗口与阈值未改。无 Critical/Important 自审发现；工具不能指定 `jijiapi/gpt-6-luna`，未派子 Agent，非独立 review。
- 未运行：本步 Node E2E、显式降级播种、组件实验室、真实来源/Provider/Agent 复验及部署；真实 RSS/摘要历史不升级为新证据。未操作用户数据或历史 migration。Task40 active；下一步核对批准清单与真实验收授权，另评估 completion 分类和旧 spec，不宣称整体关闭。
