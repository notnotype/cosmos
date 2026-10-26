# Task40 完整 Story 产品接线历史

返回 [walkthrough](../walkthrough.md)。本册为已完成过程与当时授权的历史记录，不是当前执行指令。

### 2026-10-26：完整产品接线实施计划

- 维护者要求完成接线，并确认在候选区每次明确选择已有模型连接，不新增全局默认。leader 在原 master/主工作区、base `31d957779150e4e8b41be9038a315137f60ef666` 上继续；保留既有 dirty，无 goal/Git 生命周期/真实数据/真实模型请求。工具不能为普通子 Agent 指定批准路由，本轮不委派。
- 冻结合同：生成 POST 增加必填 connectionId 和 Idempotency-Key，返回 202 与安全任务快照；新增按 Story/runId 查询状态。API 通过 ContentQuery 固定 Story/来源版本、预算和受管权限，仅入既有 WorkflowHost，不加载模型 SDK。Worker 注册 `cosmos.story-agent@1`，经既有 `agent.invoke@2` 后执行 fenced/idempotent 候选保存；无 schema migration、第二任务平台或自动接受。
- 可观察验收：① 明确连接→202/同键同请求同任务→真实 durable Host 和真实 @2 Adapter（合成 SDK）→单个 pending 候选；② 断开/无效结果/取消或失效 fence 不写正式事实，刷新能查状态；③ 接受/拒绝及过期基线沿用原子命令，默认摘要、显式正文授权和版本引用保持。
- 文件职责/顺序：先补 Contracts、Application control/workflow 与 Worker 隔离组合 RED；抽出共享准备/提案校验，入队快照不含密钥；Storage 新增 fenced 保存（复用候选表），Worker main 注册；API module/controller 接入及 202/400/409/404 测试；Transport 及 Web 候选区改为连接选择、任务状态和安全轮询，保留响应不确定时的同一幂等键与刷新恢复；最后浏览器/回归/类型/docs/diff 分层报告。所有者分别为 `packages/contracts/src/story-agent.ts`、`packages/application/src/story-agent*.ts`、`packages/storage-prisma/src/repository/story-agent-candidates.ts`、`apps/worker/src/story-agent*.ts`、`apps/api/src/app.controller/content.ts`、`packages/transport-http/src/client-content.ts`、`apps/web/src/components/cosmos/story-panel/agent-candidates.tsx`；leader 唯一公共合同/记录写入者，测试只用临时根。
- 计划验证：显式文件列表的聚焦 Vitest、`bun run typecheck`、`bun run test`、受控浏览器验收、`bun run docs:check`、大小治理、`git diff --check`。真实 Agent 验收仍逐次另获授权，不以 Fake 代替。

### 2026-10-26：完整产品接线结果

- 三条计划验收均通过本轮隔离证据：用户每次明确选择已有连接；API 冻结安全输入、同键入队返回 202；Worker 在既有 Host 经 @2 调用并 fenced/idempotent 保存 pending；接受才更新正式内容、拒绝不写。默认摘要、显式正文授权及精确版本不变。无新任务平台、migration、全局默认或 API SDK。
- 浏览器先保存请求键；丢响应只恢复同一请求，已知 Run 刷新只 GET。连接在执行时失效、坏提案、外呼失败和取消均安全终止。任务失败可能晚于候选提交，因此所有终态查询实际候选；回执丢失只留原候选，不自动重复外呼。过期 fence 保存被拒绝。
- 验收暴露共享存储旧缺陷：`status projection is inconsistent`，SQL 终态而 Kernel 仍 waiting。修复在存储 owner，同事务同步终态、推进 revision 并撤销 lease，保留不确定外呼的禁止重发门禁；补 Kernel-backed 取消/失败及旧 lease 回归。严格校验暴露旧 fixture 缺 `logs`，只补 fixture、不放宽验证。公开导出冻结仅加新 schema/types/control/definition/action，旧导出与 G03 路由历史不变。
- 完整产品模型 fixture 只在隔离 Worker fetch 层拦截保留域名，真实 API/Worker/SDK/Next 与数据库继续运行；不改 HTTPS/主机安全规则，不发外部模型请求。配置写入测试仅放行自身精确 Origin/Authority。它证明生产组合，不证明真实 Provider。

验证命令与结果（浏览器可在 `bun run build:api`、`bun run build:worker` 后复现）：

| 命令 | 实际结果 |
| --- | --- |
| `bun run test` | 201 文件 / 1148 测试通过，178.57s；本轮复验 pwsh-44ebba2362ed47dd，exit 0。 |
| `bun run typecheck` | 全仓通过；与上述单元复验串行执行，pwsh-44ebba2362ed47dd，exit 0。 |
| `bun run vitest run packages/contracts/src/entry-contract.test.ts packages/application/src/entry-contract.test.ts apps/api/src/app.controller.route-table.test.ts` | 3 文件 / 5 测试通过，pwsh-ee8cf026a7c74f5f，exit 0；本轮默认全套再次覆盖这些冻结检查。 |
| `bunx playwright test --config playwright.config.ts e2e/browser/story-agent-generation.spec.ts` | 完整产品 1 项通过，31.9s；本轮复验 pwsh-6878b6538c52497b，exit 0。202、同键重放、接受/拒绝、显式正文、刷新和浏览器错误检查通过。 |
| `bun run test:browser:component-lab e2e/component-lab/story-agent-candidates.spec.ts` | 7 项通过，23.4s；本轮复验 pwsh-716dd1d271b244d1，exit 0。四宽度、响应丢失恢复、失败后显式新意图、提交后回执丢失仍显示候选。 |

- RED/调查：API/Transport 先在同步旧合同失败；组件先在未强制连接选择失败；另有“提交后失败但隐藏候选”的红色回归。首次完整单元 4 处仅因新增导出/路由未冻结，定向增量冻结后全绿。浏览器曾因缺测试 Origin/Authority 被 403、随后因测试未编码 Story ID 等不到已成功的 202；仅修测试边界/匹配，未放宽安全或业务断言。API/Worker/包构建通过，完整浏览器含生产 Next 构建/start；未部署。
- 文档已同步 Task README、API、Invocation/Adapter spec、架构与 PROJECT-STATUS；更早图片修复及 goal 过程 5,628 字节原文移入历史分册，当前状态/有效决定保留主记录。收口时 PROJECT-STATUS 首次触发 9k token 门禁，仅精简本 Task 重复概述后通过；未修改预算/基线。`bun run docs:check`（1183 文件、0 失败）、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 均通过（pwsh-c70be84284614a9c，exit 0）；保留 5 项既存基线增长 warning。
- 未运行：完整浏览器整套、属性/进程 E2E 专项、真实来源、真实 Agent、用户旧库升级、独立审查；无真实数据/Git 外部操作/goal。信心 B：本条接线和隔离验收完成，Task40 仍实施与验收中。下一步独立审查，再核对媒体/精确版本剩余清单；真实请求须逐次新的费用/凭据/网络授权，不以合成输出替代。
