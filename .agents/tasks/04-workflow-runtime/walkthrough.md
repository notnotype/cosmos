# Workflow Runtime Spike Walkthrough

> 本文件是 `docs/tasks/04-workflow-runtime/README.md` 的 append-only 实施记录。
>
> 每一轮只记录已经执行的动作、验证证据、偏差和下一步；未验证内容不得写成完成。

## 历史分册索引

更早的 Round 记录已按大小切分归档到 `walkthrough/` 子目录(每册 ≤30 KB,封口后只读,勘误记入本文件勘误节或同级 `ERRATA.md`);
当前状态与有效决定以主文档保留记录和 Task README 为准。每册头部带 front matter(parent/range/sealed_at/tags/tokens_est)。

| 分册 | 覆盖范围 | 大小 | 内容 |
|---|---|---|---|
| [rounds-0000-0010.md](walkthrough/rounds-0000-0010.md) | Round 0–10 | 22.7 KB | 文档基线与分支建立…per-Consumer Group |
| [rounds-0011-0091.md](walkthrough/rounds-0011-0091.md) | Round 11–14、Round 89–91 | 20.7 KB | bounded retry 与 ex…持久 Consumer Regist |
| [rounds-0015-0021.md](walkthrough/rounds-0015-0021.md) | Round 15–21 | 21.0 KB | Consumer Binding r…runtime-level stal |
| [rounds-0022-0028.md](walkthrough/rounds-0022-0028.md) | Round 22–28 | 21.5 KB | 可停止的 Workflow Work…统一 terminal Applic |
| [rounds-0029-0036.md](walkthrough/rounds-0029-0036.md) | Round 29–36 | 20.5 KB | child cancellation…父子 Workflow 的级联取消 |
| [rounds-0037-0045.md](walkthrough/rounds-0037-0045.md) | Round 37–45 | 21.6 KB | Action effect rece…Worker bootstrap 的 |
| [rounds-0046-0058.md](walkthrough/rounds-0046-0058.md) | Round 46–58 | 22.7 KB | Worker bootstrap 的…Prisma Outbox abor |
| [rounds-0059-0065.md](walkthrough/rounds-0059-0065.md) | Round 59–65 | 21.2 KB | Ingest Observation…真实 Node Worker dis |
| [rounds-0066-0069.md](walkthrough/rounds-0066-0069.md) | Round 66–69 | 21.9 KB | Workflow enqueue a…Workflow Run defin |
| [rounds-0070-0074.md](walkthrough/rounds-0070-0074.md) | Round 70–74 | 22.4 KB | 持久 catalog 接入 Runt…Application Comman |
| [rounds-0075-0079.md](walkthrough/rounds-0075-0079.md) | Round 75–79 | 21.6 KB | Transaction-aware …active Worker capa |
| [rounds-0080-0085.md](walkthrough/rounds-0080-0085.md) | Round 80–85 | 20.1 KB | 多 Worker admission…多 Worker availabil |
| [rounds-0086-0093.md](walkthrough/rounds-0086-0093.md) | Round 86–88、Round 92–93 | 19.9 KB | 版本化 Worker capabil…registration obser |
| [rounds-0094-0098.md](walkthrough/rounds-0094-0098.md) | Round 94–98 | 20.4 KB | checkedAt Registry…最新主线收敛基线与 Ingest p |
| [rounds-0099-0104.md](walkthrough/rounds-0099-0104.md) | Round 99–104 | 22.0 KB | 固定 Ingest Workflow…Migration squash、最 |
| [rounds-0105-0106.md](walkthrough/rounds-0105-0106.md) | Round 105–106 | 15.3 KB | Project quality au…`nb-workflow` Kern |
| [rounds-0107.md](walkthrough/rounds-0107.md) | Round 107 | 11.5 KB | Product Service…Gateway 与 DTO 草案 |

## Round 108：Worker Registry 主线/归档边界纠偏

日期：2026-09-01

目标：核对 `PROJECT-STATUS.md`、ADR-0001、总体架构和 Task 04 当前摘要中的 Worker Registry 描述，避免把归档 WIP 当作当前 `master` 能力。

事实核对：

- 当前 `master` 核对基线为 `9c6f513`；主线没有 `WorkflowWorkerRegistration`、对应 Prisma migration、`GET /api/v1/workflow-workers`、capability evaluator 或独立 capability projection 源文件。
- 当前 `packages/worker-admin` 只提供 Worker 进程内的管理/观测服务；`WorkerStatusSnapshot.registrationGeneration` 固定为 `null`，当前 Prisma schema 只有 `WorkerHeartbeat`，没有持久 Worker Registry。
- 完整注册表、TTL/heartbeat、能力投影和查询实现存在于归档标签 `archive/t04-workflow-runtime-spike-wip-20260818` 的 `b8a1701`；`b8a1701` 不在当前 `master` 祖先链中。
- 当前实现规格 [`docs/spec/runtime/0003-worker-admin.md`](../../../docs/spec/runtime/0003-worker-admin.md) 已准确描述进程内 Worker Admin；归档 Round 78–97 保留为历史 WIP，不作为当前实现证据。

实际修改：

- 修正 `PROJECT-STATUS.md`、`CONTEXT.md`、总体架构、ADR-0001、Task 04 README 和 Product API 草案中的当前/目标边界；保留归档 walkthrough 的历史原文，并明确其来源与状态。
- 本轮不恢复归档代码，不修改运行时、数据库、migration、依赖或 Product API 实现。

验证命令与结果：

- `git show master:packages/storage-prisma/src/workflow-worker-registry.ts`：当前主线不存在该文件。
- `git show b8a1701:packages/storage-prisma/src/workflow-worker-registry.ts`：归档提交包含该文件；同一归档提交也包含 registration migration 和 Runtime registration 测试。
- `git merge-base --is-ancestor b8a1701 master`：不成立；归档实现未进入当前主线。
- 当前工作区代码与文档搜索确认：注册相关命中只剩进程内 Worker Admin 类型/字段及文档中的目标或历史说明。

偏差：发现活跃状态文档曾把归档 WIP 的验证结果写成当前主线证据，已在本轮纠正。

leader 判定：当前主线状态已与代码一致；若未来恢复 Worker Registry，必须在当前基线上重新实现持久模型、生命周期、API 和行为验收，不能直接把归档提交合并当作完成证明。

## Round 109：用户真相保护 v1（P2-1 / §12 Phase 2 第 4 条 / LIB-003 / ADR-0028）

日期：2026-09-24

**复用本 Task 的理由**：本切片要冻结的是「自动写入方在人工结果面前如何降级」，这正是 Phase 3 Knowledge Workflow 的入口硬前置，落在本 Task 的 Knowledge/Research 边界职责内。候选 Task 10（Story 域）、12（Entity/关系）、13（用户组织）各自只覆盖一个真相面，任一单点 Task 都会把合同写窄。

**目标**：把 P2-1 从「无法判定」变成有判据、有数据、有回归测试。

**复核结论（本轮第一个发现）**：`Phase-2-UNDO.md` 的「Phase 2 里没有任何自动重分析写入路径，所以只是结构上成立」**不成立**。Knowledge 路径确实不存在，但 ingest 的 Entry→Story 投影（`helpers-4.ts`）已经是一条自动写入路径：来源发布内容修订时它无条件改写 `Story.kind`，用 Entry 的标题/摘要新建 StoryRevision 顶掉 `currentRevisionId`，新 Revision 的时间范围与关键事实落 `NULL`。它不检查写入者身份，全仓也没有对应测试。九条 ADR 的 Revisit Gate 都指向同一个未定义合同。

**范围**：`StoryRevision.producer` + 回填 + 投影冻结与跳过事件 + DTO/Web 可见性 + 回归测试 + 稳定文档。
**不在范围**：Knowledge Workflow 与任何自动重分析；候选 Revision 模型与接受/拒绝界面（ORG-019）；字段级保护掩码；关系表的人工行守卫（按裁定只进合同，v1 不实现，因为没有自动写入方会碰那些行）。

**合同（ADR-0028）**：判据是写入者身份（服务端按写入方赋值，调用方不可传；`actorJson` 今天区分不了人工与自动，因为 Web 编辑根本不传它）；v1 保护粒度是整条当前 Revision（含 `Story.kind`）；自动结果**按写入方分两类降级**——确定性投影跳过并记事件，派生分析只能产生候选 Revision；`producer = "human"` 的关系行不可被自动方删除或改写。

**RED**：新增 `packages/storage-prisma/src/story-human-protection.test.ts`，未改实现前 **2 例失败**（人工编辑后被来源重发布、人工 merge 后成员被重发布，断言当前 Revision 未变），第 3 例（未编辑的 Story 仍跟随来源）通过——证明覆盖行为真实存在，且正常路径可作反向约束。

**GREEN**：migration `20260924100000_story_revision_producer`（加列 + 按 `story.revision_created.v1` 事件回填 `human`；该事件只由 `updateStoryRevision` 与 `splitStory` 的后继发出，投影不发）；`updateStoryRevision`/`splitStory` 写 `human`，投影写 `system` 且只在本该写入时记 `story.representation_projection_skipped.v1`；`StoryDetail.story.producer` 进公开读合同；Story 面板显示「人工已修改 · 自动更新已暂停」。

**实际修改**：26 个文件修改 + 4 个新增（`docs/adr/0028-user-truth-protection-v1.md`、migration 目录、`story-human-protection.test.ts`、`story-revision-producer-migration.test.ts`）。核心在 `helpers-4.ts`（投影冻结）、`stories.ts`（两处 `producer`）、`schema.prisma` + migration、`contracts/src/story.ts`、`story-panel/representation.tsx` 与 `story-panel.tsx`，其余是四处 spec、ERRATA、架构勘误节、ADR 索引、testing README、PROJECT-STATUS 与受影响夹具。

**验证（全部实际运行）**：

- `bun run typecheck` → 0；
- `bun run test` → **126 文件 / 731 用例全绿**（含新增 5 例；新增迁移回填测试把「有匹配事件才算人工」钉在数据上，含一条同 Story 不同 revision 的诱饵事件）；
- `bun run test:browser:component-lab` → **20 passed**（新增 `human-protected` 场景断言，并断言未受保护场景不出现标记）；
- `bun run test:browser` → **33 passed**（`story-representation.spec.ts` 新增「保存表示前无标记 → 保存后出现」）；
- `bun run docs:check` → 766 文件 0 失败；`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` → PASS（含 warning）；`git diff --check` → 干净；`bun run build` → 0。

**偏差与代价（如实）**：

- 整条 Revision 级保护的代价是「人工改过标题后该 Story 的自动投影停更」；这是「人工优先」的定义，已用 Web 标记说明而不是静默行为变化。
- 回填依赖 DomainEvent 未被裁剪：事件缺失的库对应行回填为 `system`，即历史人工编辑要重新编辑一次才受保护（反向误判会让所有既有 Story 停止跟随来源，代价更大）。
- 首次并发跑组件实验室与产品浏览器两套 Playwright 时，`entry-relations` 场景报 1 例失败；单独重跑 20/20 通过，确认是两套运行争用同一 Web 服务，不是本切片缺陷。
- `PROJECT-STATUS.md` 已逼近文档体积警戒线（约 9.0k token）：为不触发门禁，本轮那条记录压到了最短。**下次改动该文件前应先按治理规则把更早的历史条目切进 `PROJECT-STATUS/history-*.md`。**
- 本文件追加本轮后为 22.5 KB（健康区内，门禁未拦），已越过「接近 20 KB 即滚动归档」的触发线：**下一次追加前应先把 Round 107 整段移入 `walkthrough/rounds-0107.md` 并在原位留链接**（移动时注意所有相对链接要多一级 `../`）。

**未运行**：Node 进程 E2E（`bun run test:e2e`）、真实来源验收（`test:real:*`）、Docker、发布部署。本切片不触碰连接器、Worker 运行路径与外部来源，故未跑真实来源；Node 进程 E2E 未跑属本次边界，合并前可按需补。

**合并（2026-09-24）**：分支 `feat/t04-user-truth-protection` 已 `--no-ff` 合入 `master`（合并提交 `f66ee27`）并推送 `origin`；合并后按仓库教训先 `bun run db:generate` 再重跑门禁全绿——typecheck 0、单元 126 文件／731 用例、`docs:check` 776 文件 0 失败、size 门禁 PASS、`git diff --check` 干净。worktree 与分支已清理：`git worktree remove` 注销成功但目录残留，原因是浏览器验收时从该 worktree 启动的 opencli daemon（`node_modules/@jackwener/opencli/.../daemon.js`）仍持有句柄，结束该进程后目录删除成功。**未做**：`20260924100000_story_revision_producer` 未对真实数据根执行（迁移属数据生命周期变更，需单独授权）；推送只到 `origin`，未推 `upstream`。

**下一步**：ORG-019 落地时按 ADR-0028 的 Revisit Gate 把判据细化为字段掩码，并在第一个派生分析写入方落地时实现候选 Revision 降级。

## Round 110：`listSources()` 批量投影（来源列表读）

日期：2026-11-02。分支 `fix/t04-list-sources-batch-projection`，base `354e9f9`（本地 `master`；`git fetch origin` 失败于代理不可达，未与 `origin/master` 的 `b07286b` 同步）。

### 目标

偿还 README §7「仍缺」里的 `listSources()` 债务：来源列表读的查询量随来源数线性增长。触发点是 P3-3 的文档治理演练——该 Task 是开发者指定的对象，切片本身是仓库自认的待办，不是为演练制造的需求。

### 实施

- `packages/storage-prisma/src/repository/sources.ts`：`listSources()` 改四批读——来源、计划（含触发器与连接）、legacy `Run`、`WorkflowRun`，内存归并后调纯投影；`getSource()` 仍走单条读。
- `packages/storage-prisma/src/repository/source-projection.ts`（新建）：`requireSourceManifest`、`mergeRunDiagnostics`、`firstRunPerSource`、`projectSourceSnapshot`、`latestRunRowsPerSource`。单条读与列表读共用同一投影，同一事实不会有两个答案。
- `packages/storage-prisma/src/repository/helpers-4.ts`：`latestRunDiagnostics`／`toSourceSnapshot` 改调共享实现，删掉搬走的重复代码。
- `packages/storage-prisma/src/index.fixtures.ts`：`withRepository` 第三参可传 `clientOptions`（构造参数打开 `query` 事件），`datasources` 仍由夹具独占决定，避免用例改错库。

**行数上界**（`latestRunRowsPerSource`）：`ROW_NUMBER() OVER (PARTITION BY sourceInstanceId ORDER BY createdAt DESC)` 在 SQL 层分组，返回行数上界等于来源数。`findMany` 的 `take` 是整批全局上限、`distinct` 不在 SQL 层分组（整批读回内存再挑），两者都做不到，注释里写明了理由。`EXPLAIN QUERY PLAN` 实测走 `Run_sourceInstanceId_createdAt_idx`；`WorkflowRun.sourceInstanceId` 可空由 `IN (…)` 与 `firstRunPerSource` 的 null 判断双重排除；并列 `createdAt` 与旧 `findFirst` 同样未定义，不造新语义。

### 验证

- `bunx vitest run packages/storage-prisma/src/source-list-projection.test.ts packages/storage-prisma/src/source-deletion.test.ts` → 9/9（主代理独立复跑，EXIT=0）。
- `bun run --cwd packages/storage-prisma typecheck` → 0；`git diff --check` → 干净。
- `bunx vitest run packages/storage-prisma/src`（带 `TMPDIR` 指 worktree）→ 68 文件通过／1 失败：`prisma-cli.test.ts` 3 例，因临时目录被指进 worktree 使测试先命中 worktree 的 `node_modules/prisma`；用系统临时目录单跑该文件 7/7 通过，不是代码回归。
- 新用例 6 条钉两件事：查询次数与来源数无关（5 个来源仍等于 1 个来源，且 ≤6）；运行行读取行数有界——两来源历史不对称（40 条 / 3 条且更近），无界实现与「全局 take N 行」的假修复都会失败（后者让长历史来源丢掉最新一条）。

### 偏差与代价

- 旧实现实测是 `1 + 4N`（无连接）／`1 + 5N`（含连接）：每来源除 Run、WorkflowRun、计划外，SQLite 下 `include: { triggerBindings }` 还被 Prisma 拆成一条。README 与封口分册里的 `1 + 2N` 从来不准。
- 来源定义非法时，列表读会先付批量查询的代价再抛错；只影响错误路径，换来的是一条查询服务全部来源。
- `listCollectionPlans()` 的逐计划查询**未**在本轮处理，债务保留在 README §7，只有来源列表这一半被偿还。
- 行数上界用例靠「SQL 参数里出现 `-1`」判无界；将来若有人写出不带 `LIMIT` 但语义上整批读回的裸 SQL，这条启发式抓不到，目前靠「不对称历史 + 每来源最新一条仍被选中」的语义断言兜底（局限已写在测试注释里）。
- Round 107 已按上一轮的触发线移入 `walkthrough/rounds-0107.md`，只在分册索引表登记，未在原位留占位行——与 105–106 等既有分册一致。

### 文档影响

代码实现中主代理发现两处文档失真，按「代码代理只提建议、主代理审核、另派文档代理落笔」处理：

- `.agents/tasks/04-workflow-runtime/README.md`：删掉来源列表的 `1 + 2N` 债务，改记计划侧未偿还；「已存在」补一条来源列表批量投影（不写死固定次数，精确数字指向测试）。
- `docs/spec/storage/0001-prisma-repository.md` 及其 `ERRATA.md`：`part-01-domain-model.md:38` 只写了 legacy `Run` 一路、漏记 `WorkflowRun` 合并，且该分册已封口；按「勘误不改历史分册」登记到同级台账，主文加分册勘误登记小节与索引行。

### 未运行

全仓测试、`bun run build`、浏览器／组件实验室、E2E、Node production、真实来源验收、远端 CI。本切片不触碰连接器、Worker 运行路径与外部来源；合并前应补全仓门禁。

### 下一步

合并前：`bun run db:generate` 后跑全仓 typecheck／test／build 与文档门禁；`listCollectionPlans()` 的计划侧批量投影可另起切片。`docs/spec/storage/0001-prisma-repository/part-01-domain-model.md` 的正文保持封口原样，后续如需重写只能出新版本分册。

### 合并与合并后门禁

2026-11-02，维护者授权合并进 `master` 并按流程补齐文档。实现提交 `046a374`，以 `--no-ff` 合并为 `f148f28`（基 `354e9f9`）；未 push、未清理分支与 worktree。

合并后在主工作区 `D:/Otirik/Workstation/cosmos` 复跑：全仓 `bun run typecheck` exit 0；`bun run build` exit 0；`bun run docs:check` exit 0（1,228 文件）与文档大小门禁 PASS；聚焦两项测试（`source-list-projection`、`source-deletion`）9 用例通过。

`bun run test` 首次带隔离 `TMPDIR` 跑时，209 文件／1,191 用例中 3 个失败全在 `packages/storage-prisma/src/prisma-cli.test.ts`：该测试从临时目录向上找 `node_modules`，当 `TMPDIR` 指进仓库时会先命中仓库自己的 `node_modules/prisma`。去掉 `TMPDIR`、用系统临时目录重跑全仓 `bun run test` 后 209 文件／1,191 用例全部通过，故这 3 个失败是环境登记口径问题，不是本切片的回归。工作区注入 `TMPDIR` 会给实现用例提隔离数据根，重跑全仓前要先取消它。

未运行：浏览器／组件实验室、E2E、Node production、真实来源验收、远端 CI（`git fetch origin` 失败于代理不可达，本地 `master` 仍领先未同步）。
