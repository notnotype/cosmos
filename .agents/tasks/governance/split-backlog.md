# 拆分待办台账

本文件记录**已越线但本轮（Task 39 收尾）不拆**的文件，供后续单独开一轮治理任务处理。数值是 2026-10-23 实测，来源 `python scripts/size-governance.py -c <cat> --json`。

判定口径见 [`docs/proposals/code-size-governance-v1.md`](../../../docs/proposals/code-size-governance-v1.md) 与 [`docs/proposals/oversized-doc-splitting-v1.md`](../../../docs/proposals/oversized-doc-splitting-v1.md)：源码/测试红线 >800 行或 >50 KB 或 >15k token，警戒线 30 KB / 9k token；入口文件红线 >300 行。CI 用 `--fail-on-new`，因此**未登记进基线文件**的越线会直接把 job 判红。

台账本身不消红：登记在这里只表示「已记录、待单独治理」，Docs job 在拆完之前仍会失败。拆文件属于 G 系列治理，需要单独开 Task 并获批准；不得用把文件加进 `code-baseline.json` 的方式绕过（登记值只减不增）。

## 1. 当前阻塞 CI（未登记，门禁判 FAIL）

| 文件 | 行 | 字节 | 与 Task 39 的关系 |
| --- | --- | --- | --- |
| `apps/web/src/components/cosmos/connection-panel.tsx` | 700 | 35042 | 本轮新增模型单选 UI（+176 行），从 24.58 KB 越线 |
| `packages/application/src/workflow-host-runtime.test.ts` | 915 | 33354 | 本轮只 +29 行；**`origin/master` 上已 31.44 KB / 886 行**，从未登记 |
| `.agents/tasks/40-story-content-representation/walkthrough.md` | 253 | 41737 | 与本轮无关，`d511d79` 提交时即未登记 |

前两个走代码门禁（`-c code tests`），最后一个走文档门禁（`-c docs`）。

**master 侧已在红**（2026-10-23 实测）：把 `origin/master` 导出到仓库外目录跑 CI 同一命令，唯一违规就是 `packages/application/src/workflow-host-runtime.test.ts`（`[fail] 新增红线文件 … 31.44 KB / 约 8.0k token`，`结果: FAIL（1 项违规）`）。也就是说 Docs job 在 master 上本来就失败，不是本轮新增的破窗——但它也不是「记进台账就消失」，要等拆分或降字节才恢复。

## 2. 已登记进基线、但本轮继续增长（只报 warning，不阻塞）

| 文件 | 行 | 现在 | 登记 |
| --- | --- | --- | --- |
| `apps/web/src/component-lab/product-fixtures.tsx` | 1258 | 47034 | 43966 |
| `apps/web/src/components/cosmos/collection-plan-list.tsx` | 770 | 45504 | 41708 |
| `e2e/browser/phase2-organization.spec.ts` | 822 | 45086 | 33431 |
| `packages/storage-prisma/src/repository/sources.ts` | 682 | 33758 | 31120 |
| `plugins/rss/src/index.ts` | 637 | 22777 | 21771 |

`product-fixtures.tsx` 本轮已把模型夹具拆到 `apps/web/src/component-lab/model-fixtures.tsx`（9813 B / 252 行），但主文件仍从 46284 涨到 47034——**因为同时新增了模型面板的三态夹具**，净增。真正的降幅要按域拆 connection/story/board 三组才够，且它 1258 行已过 800 行红线。

## 3. 建议拆分接缝

- **`connection-panel.tsx`**：模型选择块是天然接缝——纯逻辑已在 `connection-model-selection.ts`，把 `modelChoices` / `modelState` / `selectionNotice` 的呈现部分抽成 `connection-model-picker.tsx` 即可，父组件只保留编排。目标 ≤400 行。
- **`activity-store.ts`（已完成，2026-11-17）**：656 行 / 31,312 B 拆成门面 + 三个协作类，按「认领 / 执行 / 完成」分阶段。门面 `activity-store.ts`（50 行 / 2,612 B）留在原继承链位置并委托；`activity-claim.ts`（342 行 / 15,957 B）认领、续租、释放与 fence 终结；`activity-execution.ts`（166 行 / 7,832 B）`startAction` 与派发授权；`activity-completion.ts`（198 行 / 10,180 B）终态结果与 Completion。四个文件均在健康区（≤400 行、≤25 KB）。验证：`bun run --cwd packages/storage-prisma typecheck` exit 0；`bun run test -- packages/storage-prisma/src` 73 文件 / 305 用例全通过（其中 `workflow-backend.test.ts` 24 条 = backend conformance 7 / runner conformance 2 / deferred Activity conformance 7 / 其它 8）；`bun run test:property -- packages/storage-prisma` 1 文件 / 1 用例通过；`bun run build:storage` exit 0；`entry-contract.test.ts` 通过（`PrismaWorkflowHostStore` 入口导出零 diff）；`bunx madge --circular --extensions ts packages/storage-prisma/src/index.ts` 0 环（72 文件）。文档影响：`packages/storage-prisma/MODULE.md` 已同步（模块地图与禁区）；`docs/spec/storage/0003-workflow-host-store.md` 行为未变，无需更新（其「实现与测试锚点」仍指向本轮之前已不存在的 `workflow-host-store.test.ts`，属历史漂移，未改动）；`docs/doc-governance/repo-map.json` 未重新生成——该图 2026-10-08 生成后已整体漂移（`moduleDocBytes` 2940 对实际 3820），重生成会把本轮之外的改动并进同一 diff。
- **`workflow-host-runtime.test.ts`**：按 `describe` 拆成 2–3 个测试文件，与 `workflow-host-runtime.ts` 已拆的 6 个分册对齐；同时确认拆出的每个文件的用例数守恒（G15 的教训：拆分后必须全量重跑，只看聚焦测试会漏掉并发抖动）。
- **`product-fixtures.tsx`**：按域拆，`connection-fixtures.tsx` / `story-fixtures.tsx` / `board-fixtures.tsx`，模型夹具已经拆出去可作为样板。
- **`e2e/browser/phase2-organization.spec.ts`**：它是 822 行单文件，本轮未触碰；拆分时按「组织 / 成员 / 关系」三段走，注意 `e2e/support/` 的共享装置已经存在，别复制。

## 4. 拆分时必须同时做的事

- 导出面零 diff：所有 `index.ts` 门面与 `entry-surface.txt` 冻结清单同步，跑 `entry-contract.test.ts`。
- 循环依赖：拆完跑 `madge --circular`（仓库既有做法），G10 的教训是「结果类型家族放错边就会成环」。
- 文档锚点：`docs/spec/` 与 `docs/testing/` 里指向被拆文件的行号区间要同批修正，否则 `docs:check` 断链。
- 基线只减不增：拆完把对应条目从 `docs/doc-governance/code-baseline.json` 或 `docs-baseline.json` 删掉，**不要**把新文件往里加。
- 拆分顺序固定为桶文件 → 测试 → 单体（`code-size-governance-v1.md`）。

## 5. 不在本台账范围

- `.worktrees/fix-t39-provider-feedback/` 下的同名副本：该目录被 `.gitignore` 忽略，CI 克隆里不存在。**2026-10-26 已修掉导致它反复报警的脚本缺陷**：`scripts/size-governance.py` 的 `git ls-files --others --ignored` 对整目录被忽略的情况只返回目录条目（带尾斜杠），原实现用 `rel in skip` 按文件路径精确比对、永不命中，`SKIP_DIRS` 里也只有 `.worktree`（单数）；现改为 `is_ignored()` 同时支持等值与前缀匹配，并把 `.worktrees` 加入 `SKIP_DIRS`。修后本地门禁不再出现这批幻影 FAIL。
- `docs/spec/interfaces/0005-web-client.md`（68.50 KB）、`docs/spec/storage/0001-prisma-repository.md`（58.11 KB）、`docs/spec/interfaces/0002-product-api-http.md`（57.24 KB）、`docs/spec/contracts/0001-public-contracts.md`（52.50 KB）：都在基线内，原为「属文档治理队列，不在代码拆分台账」。**2026-10-26 起已由文档治理任务 [`G17-doc-splitting-batch3/`](G17-doc-splitting-batch3/) 承接，且当日已收口**：四份各拆成主文档 + 同级分册，主文档 7.85 / 4.23 / 4.57 / 4.59 KB，19 个分册全部 ≤30 KB，四条的基线登记已移除（`docs-baseline.json` 12 → 8 条）。本台账不再跟这四个文件的状态。
