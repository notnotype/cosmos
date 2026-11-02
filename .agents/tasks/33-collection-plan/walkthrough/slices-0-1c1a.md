# Task 33 Walkthrough 分册：定义阶段与数据面切片（1a～1c-1c-a）

本册是 Task 33 walkthrough 的历史分册，只搬位置、不改写条目。后续记录继续写在主文件 [walkthrough.md](../walkthrough.md)。

## 2026-09-20：定义阶段（Proposal → ADR → Task → API Draft）

- **本轮切片**：把已 accepted 的采集计划决定落成可执行的合同与切片计划，**不写代码**。
- **前置**：`Phase-2-UNDO.md` 的 P0-1 复核结论——架构 §4.6 早已冻结 `CollectionPlan`，§4.7 记录了 Phase 1 的收窄，实现里始终缺席；数据面的隔离（Run／错误／重试／游标按来源）已具备。
- **落地**：
  1. Proposal [`collection-plan-v1`](../../../../docs/proposals/collection-plan-v1.md) 起草后经维护者确认 5 项待裁定（全部按建议），转 `accepted` 并记录决策；
  2. PRD 勘误台账 [`ERRATA.md`](../../../../docs/requirements/0002-product-requirements/ERRATA.md) 新增 AUT-010 行；
  3. 架构主文档 §19 决定 85、§21 不变量 63；
  4. 新增 ADR [`0023`](../../../../docs/adr/0023-collection-plan-v1.md) 并登记进 [`docs/adr/README.md`](../../../../docs/adr/README.md)；
  5. 新建本 Task（编号 33 由 Agent 建议、待维护者确认）；
  6. API Draft 补 v1 落地范围：[`0002`](../../../../docs/api/0002-product-service-api/part-02-04.md#43-collectionplan) §4.3、[`0003`](../../../../docs/api/0003-product-dtos.md) §2 落地注记、[`0006`](../../../../docs/api/0006-scenarios-and-conformance.md) S03。
- **偏差**：无范围偏差。一个发现：API Draft 早已规划 CollectionPlan 的端点、DTO 与 S03 场景，因此本轮只补「v1 落地范围」而不重写目标合同；`docs/api/0003-product-dtos/part-02-04.md` 已封口，按治理规则把更正登记在 0003 主文档的落地注记节。
- **验证**：`bun run docs:check` 711 文件 0 失败、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` PASS（含基线内增长 warning）。未运行 typecheck／单元测试／浏览器 E2E——本阶段没有代码改动。
- **下一步**：切片 1a（expand）。开工前需要维护者确认 Task 编号，并给出 worktree 与提交授权（仓库规则：创建 worktree／分支与 commit 各自需要授权）。

## 2026-09-20：切片 1a（expand）—— 计划表与可空计划列

- **本轮切片**：ADR-0023 决策 2 的第 1 步。只加表与可空列，不改任何读取路径；假设「回填与读取切换之前，按来源调度/读取的旧路径必须继续可用」，所以计划引用列一律可空。
- **改动文件**：
  1. `packages/contracts/src/collection-plan.ts`（新）：计划快照读投影、创建/更新命令、v1 重叠策略枚举（只有 `forbid`）。
  2. `packages/contracts/src/index.ts`、`entry-surface.txt`、`MODULE.md`：导出面 +8（4 schema / 4 类型），既有导出零增删零改名（`entry-surface.txt` 用生成脚本重写，diff 只有 8 行新增）。
  3. `packages/storage-prisma/prisma/schema.prisma`：新增 `CollectionPlan` 模型；`Run`／`WorkflowRun`／`Checkpoint`／`TriggerBinding` 增加可空 `planId` 与索引；`SourceInstance`／`ConnectionInstance` 补反向关系。
  4. `packages/storage-prisma/prisma/migrations/20260920120000_collection_plan_v1/migration.sql`（新）。
  5. 测试：`packages/contracts/src/collection-plan.test.ts`、`packages/storage-prisma/src/collection-plan-migration.test.ts`（新）。
- **RED → GREEN**：
  - RED（实现前实跑）：contracts `4 failed`（schema 不存在，`Cannot read properties of undefined`）；storage `2 failed`（`CollectionPlan` 表不存在 → `expected [] to deeply equal ArrayContaining`；`prisma.collectionPlan` undefined）。
  - GREEN（实现后实跑）：contracts 该文件 **4/4**；storage **2/2**；`bunx vitest run packages/contracts` **13 文件 / 72 用例全绿**（含冻结导出面守卫）。
- **门禁**：`bun run db:validate` 通过；`bun run typecheck` 全仓 **0**；`bunx madge --circular --extensions ts packages/contracts/src/index.ts` **0 环**；`bun run test` **110 文件 / 643 用例全绿**（切片前基线 108 文件 / 637 用例）。
- **决定与偏差**：
  - `CollectionPlan` 新表的 `sourceId`／`connectionId` 带数据库级外键（`CREATE TABLE` 不受限）；四处 `planId` 是 `ALTER TABLE ADD COLUMN`，按仓库先例不加外键（与 `SourceInstance.connectionId`、`WorkflowRun.sourceInstanceId` 同例）。
  - v1 一对一用唯一索引 `CollectionPlan_sourceId_key` 在数据库层表达，不靠调用方自觉。
  - 合同的媒体预算字段叫 `mediaPolicy`（ADR-0014 语义）；API Draft 目标合同的 `budget: WorkflowBudget` 属通用预算切片，v1 不用——Draft 的 v1 注记同批补上（[`0002`](../../../../docs/api/0002-product-service-api/part-02-04.md#43-collectionplan) §4.3、[`0003`](../../../../docs/api/0003-product-dtos.md) §2）。
  - 未新增 storage 包导出：仓库方法仍挂在既有 `PrismaCosmosRepository` 上，冻结入口契约不受影响。
- **未运行**：浏览器产品 E2E、真实来源验收（切片 1a 没有用户可观察行为变化，属后续切片的验收面）。
- **下一步**：切片 1b（backfill）——为每个既有来源生成默认计划，回填三处计划引用并重写状态命名空间；开工前在 walkthrough 记录回填的幂等与失败停止条件。

## 2026-09-20：切片 1b（backfill）—— 默认计划与计划引用回填

- **本轮切片**：ADR-0023 决策 2 的第 2 步。假设：回填只写新列；来源侧字段与状态命名空间在读取切换之前仍是唯一读取方，所以这一步不动它们（可独立部署、可回滚）。
- **改动文件**：
  1. `packages/storage-prisma/prisma/migrations/20260920140000_collection_plan_backfill/migration.sql`（新）：为每个既有来源（含墓碑）生成 `plan:<sourceId>` 默认计划，继承连接、媒体策略与启用状态；回填 `Run`／`WorkflowRun`／`Checkpoint`／`TriggerBinding` 的计划引用。
  2. `packages/storage-prisma/src/collection-plan-backfill.test.ts`（新）：按真实迁移顺序两段部署——先部署到 expand 步、播种子数据，再部署含 backfill 的全量迁移。
- **RED → GREEN**：RED（实现前实跑）**1 failed**（`20260920140000_collection_plan_backfill 必须存在`）；GREEN（实现后实跑）**1/1**。
- **门禁**：`bun run test` **111 文件 / 644 用例全绿**（切片 1a 后基线 110 / 643）。
- **决定与偏差**：
  - **偏差（相对 ADR-0023 决策 2 的措辞）**：ADR 把「状态命名空间按计划重写」写在 backfill 步；实现把它推到切片 1c 的读取切换。理由：命名空间改的是**读取方**要查的键，回填期提前重写会让仍按来源读取的旧路径查不到状态（等于丢掉 ETag／游标，虽可重建但要白付一次全量抓取）。同一理由，`SourceInstance.config.media` 与 `SourceInstance.connectionId` 在这一步只被**复制**、不被移除，移除与读取切换同批。
  - 墓碑来源的计划写成 `enabled=false`（来源行可能仍留 `enabled=1`），避免读取切换后把已删除来源重新调度起来。
  - 计划 id 用 `plan:<sourceId>` 派生，映射可复现、便于核对与回滚。
  - 回填不幂等（重复插入会撞 `CollectionPlan_sourceId_key` 而失败）：这是有意的失败停止，不静默生成第二份计划。
- **未运行**：浏览器 E2E、真实来源验收（本切片仍无用户可观察行为变化）。
- **下一步**：切片 1c 拆两段——1c-1 数据面读取切换（调度、ingest、checkpoint、状态命名空间与媒体策略读取改读计划，并同批重写命名空间、移除来源侧 media）；1c-2 计划的产品面（API CRUD、读投影、transport）。

## 2026-09-20：切片 1c-1a —— 来源与默认计划同批创建

- **本轮切片**：读取切换的前置。回填只覆盖切换前已存在的来源，新建来源若没有计划，切换后会失去调度与状态归属。
- **改动文件**：
  1. `packages/storage-prisma/src/repository/sources.ts`：`createSource` 在同一事务里建出 `plan:<sourceId>` 默认计划（继承名称与媒体策略），调度绑定同时写上 `planId`；新增文件内 `extractMediaPolicy` helper。
  2. `packages/storage-prisma/src/collection-plan-repository.test.ts`（新）：两条行为测试（有媒体策略 / 无媒体策略）。
- **RED → GREEN**：RED（实现前实跑）**2 failed**（计划数为 0）；GREEN（实现后实跑）**2/2**。
- **门禁**：`bun run typecheck` 全仓 **0**；`bun run test` **112 文件全绿**（1b 后基线 111 文件 / 644 用例）。
- **连带修正**：切片 1a 的 `collection-plan-migration.test.ts` 原本假设「来源没有计划、由测试自己插入第一条计划」；本切片让创建来源自动带出默认计划后，那条测试的第一步就撞上唯一约束。已按新行为改写为「创建来源已带出默认计划，第二个计划必须被数据库拒绝」，默认值断言由新的 repository 测试承担——两处不重复。
- **决定**：
  - 计划 id 与回填保持一致用 `plan:<sourceId>`：迁移路径与创建路径产生同一形态，便于核对与排障。
  - 计划名在创建时复制来源名，**不**在 `updateSource` 写回（避免同一事实两个所有者）；计划改名归 1c-2 的计划端点，`PATCH /sources/{id}` 与 `PATCH /collection-plans/{id}` 的字段边界同批冻结。
  - 媒体策略是**复制**而不是搬走：来源配置仍是当前读取方，移除与读取切换同批（与 1b 的偏差记录同一理由）。
  - 媒体策略缺省写 `null`（表示跟随全局默认），不写空对象。
- **未运行**：浏览器 E2E、真实来源验收（本切片仍无用户可观察行为变化）。
- **下一步**：切片 1c-1b 调度与 ingest 读取切换——`listScheduleTriggers` 改按计划取数、Run／WorkflowRun 写 `planId`、checkpoint 按计划读写、ConnectorState 命名空间解析取计划 id；同批加迁移重写状态命名空间并从来源配置移除 `media`。

## 2026-09-20：切片 1c-1b —— 调度按计划取数、运行归属计划

- **本轮切片**：读取切换的第一段（数据面）。假设：计划与目标 v1 一对一，因此调度改读计划、运行改记计划归属，都不改变用户可见行为。
- **改动文件**：
  1. `packages/storage-prisma/src/repository/sources.ts`：`listScheduleTriggers` 改为按计划取数（计划 → 调度绑定；来源只决定可执行性：启用且未删除），返回 `planId` + `sourceId` + `intervalMs` + `lastRunAt`；`lastRunAt` 按计划查最近一次运行。
  2. `apps/worker/src/scheduling.ts`：`ScheduleTrigger` 增加 `planId`；入队携带 `planId`；幂等键改为 `schedule:<planId>:<bucket>`（同一连接下的两个计划不会互相顶掉窗口）；日志带上 `planId`。
  3. `packages/application/src/workflow-control.ts`：`enqueue` 接受可选 `planId`，写进产品 Run 投影并传给 envelope。
  4. `packages/application/src/workflow-host.ts`：`CreateWorkflowEnvelopeInput` 增加可选 `planId`。
  5. `packages/storage-prisma/src/workflow-host-store/`（`internals-activity.ts`、`envelope-store.ts`）：规范化 `planId`；创建 envelope 时写 `WorkflowRun.planId`，调用方没给就按来源解析。
  6. `packages/storage-prisma/src/repository/runs.ts`：`createRun`／`createQueuedRun` 写 `Run.planId`（同一个解析 helper）。
  7. `packages/logging/src/index.ts`：`LogContext` 增加 `planId`。
  8. 测试：`apps/worker/src/scheduling.test.ts` 新增「同一连接下的两个计划各按自己的间隔入队」；`packages/storage-prisma/src/collection-plan-repository.test.ts` 新增「调度按计划取数」；`trigger-binding.test.ts` 的期望值随读取口径补 `planId`。
- **RED → GREEN**：RED（实现前实跑）调度测试 **3 failed**（仍按来源入队、键里没有计划）；GREEN 调度 **5/5**、collection-plan repository **3/3**、worker-pipeline + scheduling **11/11**。
- **门禁**：`bun run typecheck` 全仓 **0**；`bun run test` **112 文件 / 648 用例全绿**（本切片前 112 文件 / 646 用例）。
- **决定与偏差**：
  - 本切片只切换**调度与运行归属**。以下四项仍留在来源侧，作为 1c-1c 的内容：连接器状态命名空间解析（仍取来源 id）、checkpoint 归属（仍按来源读写）、媒体策略读取（仍读 `config.media`）、来源启用状态（仍是可执行性判据）。理由：这四项同时连着**产品写入口**（来源端点与 Web 的来源行），在计划端点（1c-2）落地前切换会出现「产品写进去、调度读不到」。
  - `planId` 在 envelope 创建时按来源解析，而不是要求所有调用方显式传：手动运行、重跑等既有路径不必改签名；历史或测试夹具来源解析不到时保持 null，不让旧路径失败。
  - `trigger-binding.test.ts` 的期望值随读取口径更新（补 `planId`），不是放宽断言。
- **未运行**：浏览器 E2E、真实来源验收（本切片无用户可观察行为变化）。
- **下一步**：切片 1c-2（计划的产品面：CRUD、读投影、transport，以及来源端点与计划端点的字段边界），随后 1c-1c（命名空间／checkpoint／媒体策略／启用状态的归属切换与迁移）。

## 2026-09-20：切片 1c-2a —— 计划的读接口

- **本轮切片**：产品面要能按计划回答「挂在哪个连接、多久采集一次、什么媒体预算」。只读，不写计划。
- **改动文件**：
  1. `packages/contracts/src/collection-plan.ts`：计划快照增加 `scheduleIntervalMs`（计划自己的调度间隔；没有调度绑定时为 null）。
  2. `packages/storage-prisma/src/repository/sources.ts`：新增 `listCollectionPlans`／`getCollectionPlan` 与投影；`updateSource` 增加**过渡期写穿透**（名字与连接同时写进计划），并给后补的调度绑定补上计划归属。
  3. `packages/storage-prisma/src/repository/repository-internals.ts`：`resolvePlanId` 提为共享 helper，`runs.ts` 改为引用。
  4. `packages/application/src/repository-port.ts`：声明两个读方法与新的调度形状。
  5. `apps/api/src/app.controller/sources.ts`：`GET /collection-plans`、`GET /collection-plans/:planId`。
  6. `packages/transport-http/src/client-sources.ts`：客户端两个方法。
  7. `.agents/tasks/governance/G03-api-controller/route-snapshot-app.controller.txt`：路由快照 120 → 122 条（新增两条计划读路由）。
  8. 测试：repository（读投影、写穿透、后补调度挂计划）、contracts fixture、transport client、API controller。
- **RED → GREEN**：RED（实现前实跑）**2 failed**（`listCollectionPlans is not a function`；后补绑定的 `planId` 为 `null`）；GREEN repository **5/5**、contracts **4/4**、transport **7/7**、API controller **2/2**、路由表守卫 **3/3**。
- **门禁**：`bun run typecheck` 全仓 **0**；`bun run test` **113 文件全绿**。
- **决定与偏差**：
  - **修掉一个真实缺陷**：`updateSource` 后补调度绑定时没有写 `planId`，读取切换之后这类来源会永远不被调度——这是 1c-1a 只改创建路径留下的缝，本切片补上并有回归测试。
  - 过渡期写穿透：来源端点是产品当前唯一的编辑入口，它写的名字与连接同时落进计划，保证计划读投影与来源行一致；计划自己的写路径在 1c-2b 落地。这期间同一事实在库里有两份列，由 ADR-0023 决策 2 的第 4 步（contract）收掉。
  - `POST /collection-plans` 在 v1 **不做**：计划与目标一对一且随来源创建自动生成，独立创建没有合法语义。API Draft 的 v1 落地范围已同批写明。
  - 计划级「最近一次运行／失败」摘要**未纳入**本切片：v1 计划与来源一对一，来源健康行已表达同一事实；等计划视图真正需要时再加，避免现在就把 WorkflowRun 投影搬进读模型。
- **未运行**：浏览器 E2E、真实来源验收（读接口本身没有新的用户可观察行为，浏览器验收属于切片 2）。
- **下一步**：1c-2b（计划的写接口：改名／连接／媒体预算，并与来源端点冻结字段边界），或先做 1c-1c（媒体策略、启用状态、游标与状态命名空间的归属切换）。

## 2026-09-20：切片 1c-1c-a —— 媒体预算写穿透

- **本轮切片**：修过渡期里的一处不一致——来源端点改了 `config.media`，计划的 `mediaPolicyJson` 仍停在创建时那份，计划读投影因此一直显示旧值。
- **改动文件**：
  1. `packages/storage-prisma/src/repository/sources.ts`：`updateSource` 把 `config.media` 一并写进计划（沿用 `extractMediaPolicy`；没有 media 时写 `null`，表示跟随全局默认）。
  2. `packages/storage-prisma/src/collection-plan-repository.test.ts`：新增一条测试（改策略后计划同步、移除策略后回到 `null`）。
- **RED → GREEN**：RED（实现前实跑）**1 failed**（计划仍是旧值）；GREEN **6/6**。
- **门禁**：`bun run typecheck` 全仓 **0**；`bun run test` **113 文件 / 654 用例全绿**。
- **仍未切换（留在来源侧）**：媒体策略的**读取**（ingest 与媒体获取仍读 `config.media`）、启用状态、游标与状态命名空间。理由与 1c-1b 的记录相同——这些读取的切换必须与产品写入口同批，否则会出现「产品写进去、运行读不到」。
- **下一步**：切片 2（Web：在一个连接下建出第二个计划，看到各自的频率与最近失败）与切片 3（连接器选择与 schema 驱动表单）；1c-1c 的读取切换与 1c-2b 的计划写接口随后。
