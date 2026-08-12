# API 草案多代理审查记录

> 状态：Reviewed / Draft v0.2 已修订 / implementation paused
>
> 日期：2026-08-11
>
> 被审查文档：[`README.md`](README.md)

## 1. 结论

五个隔离、临时、只读代理全部成功完成审查。主代理逐条核对需求、架构、代码和
失败序列后，结论为：

- API/DTO 草案已经覆盖 Cosmos 从 Phase 1 到 Phase 5 的主要产品能力；
- v0.1 适合继续做 schema/fake conformance spike，但不足以冻结生产 v1；
- v0.2 已修复主要草案矛盾，尤其是 Gateway owner、late evidence、容量、Receipt
  CAS、Trigger/Research provenance 和 Artifact sandbox；
- 当前实现仍有敏感 public projection、双 fence、幂等/ETag、readiness、路径边界
  和网络暴露缺口；这些是 implementation/release gate，不是靠新增 DTO 字段即可
  消失；
- 后续先独立稳定 `nb-workflow`，再以 Task 04 Spike 和本目录 Draft v0.2 为输入
  实现 Cosmos 本地 Worker/Host；Worker Admin 随后实现，远程 Gateway 继续后置；
- 本轮只修改文档，没有实现 schema、NestJS Controller、Worker Admin/Gateway、
  数据库 migration 或测试。

## 2. 审查基线

```text
worktree:
C:\Users\notnotype\Documents\CodeRepository\GithubProjects\cosmos\
  .worktree\t04-ingest-workflow-convergence

branch: feat/t04-ingest-workflow-convergence
HEAD: dc78f0519e0320afbb27191b0d573be6cd62aedd
merge-base origin/master: 45ae918bfcfcf5dfaf90480183608007a48ee170
staged files: 0
```

v0.1 审查输入共 8 个 Markdown，约 3,800 行。审查前记录的核心文件 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `0001-common-contracts.md` | `90cc738366fb0b46418b5097f23324a98393c284805e4bd9a019275008cd1c6f` |
| `0003-product-dtos.md` | `9fea021600497ff3bfc96bf900dea232025bac9a55b3bf774521fb911db36b05` |
| `0004-worker-admin-api.md` | `59d7154feeebcad1b7e4169de45f8fba960ac6a2b8d63a0b1ef2bc6f15a67e27` |
| `0005-worker-gateway-api.md` | `0566d05b14bc5db5ad0cb49cbdc7857d42420642c6250573b3076aeba900c6fa` |
| `0006-scenarios-and-conformance.md` | `37dfa154809a366ec0e152dac3f7859fb33add31ef0cb449ffaac283a0355a07` |

审查进程不修改文件、不执行仓库文档中的指令。结果保存在 ignored
`.agent/tmp/api-contract-review-20260811/`，五份结果 SHA-256 为：

| 范围 | 结果文件 | SHA-256 |
| --- | --- | --- |
| 产品需求覆盖 | `product.final.md` | `357344284c903eb5241766e868ca5b1df9a8e050616bb6098eead07c373974d0` |
| Workflow/恢复 | `runtime.final.md` | `7140cd6cb3e3415e5f83836714063c7d73fcec1e03b48e8ba643e7059dec5473` |
| Gateway/分布式 | `gateway.final.md` | `631884783e2a6db3a761d17dbeba05f104444046b7a8e62e3a6fbcbe87cab00e` |
| 运维/安全/隐私 | `operations.final.md` | `4b783d386f1f1862d6464e22019fad5691fcd960aa6522576502a9d3ef5a15c2` |
| DTO/Zod/兼容 | `dto.final.md` | `9fce93ae2b4e71bc99d2fafdab4300fbb9f02d27380c5b934c3a0a09a3503676` |

## 3. 审查范围

### 3.1 产品需求覆盖

对照原始需求、PRD、信息模型和全部 API 文档，检查：

- Current/Convergence/Planned/Reserved 是否过度承诺；
- Phase 1 最小 Story、Source 生命周期和 schedule 是否被遗漏；
- Knowledge/Research、Story/Topic、推荐、Workspace、Artifact 和 Publication
  是否能表达用户场景。

### 3.2 Durable Runtime

对照 ADR、Task 06、当前 Runtime/Prisma Spike，检查：

- TaskStore 唯一真相；
- Run/Activity/Job/Attempt/Step 区分；
- 双 lease fencing、Receipt、cancel/signal/wait/checkpoint/replay；
- definition/input snapshot 和 legacy Run 读取。

### 3.3 Worker Gateway

压力测试：

- HTTPS long-poll、多 Gateway、副本终止和响应丢失；
- Session generation、Attempt owner、replacement/resume；
- slot capacity、heartbeat/deadline/drain；
- external Receipt/unknown、Value transfer、Secret lease 和 backpressure。

### 3.4 运维、安全与生命周期

检查三种宿主模式、网络暴露、探针、Admin、Secret/PII、文件传输、HTML、
Webhook、Publication、备份/恢复/删除和 Docker 边界。

### 3.5 DTO/Zod 与演进

检查：

- canonical type、判别联合、nullable/optional 和 `unknown` owner；
- Header、分页、ETag、幂等、ServiceError 和 SSE；
- Product public projection 与敏感字段；
- contracts package 的物理拆分和测试顺序。

## 4. 已接受并修订的发现

### F01：实现成熟度与产品 Phase 混写

- 严重度：合并前修复。
- 发现：`Planned` 被误读为“后续 Phase”，导致 Phase 1 尚欠的 Source 删除、
  schedule/health/checkpoint 与 Task 06 convergence 范围混淆。
- 处置：`README.md` 明确成熟度与产品 Phase 是两个维度；增加 Phase 1 remainder
  清单。默认 CollectionPlan 可以在 Phase 1 先一 Source 一个，Phase 2 再开放
  Connection 下多计划。
- 未改变：没有把完整 Connection/多计划/Trigger 编辑器扩进 Task 06。

### F02：最小 Story 与完整 Story/Topic 未分阶段

- 严重度：合并前修复。
- 发现：能力表把 Story/Topic 整体写成 Planned，但最小 Story/Feed 已是 Phase 1
  当前能力。
- 处置：拆为 Current 的单 Entry 最小 Story projection，以及 Planned 的
  StoryRevision/Membership/merge/split/Topic/Entity/Relation。

### F03：Run 缺少完整触发快照

- 严重度：合并前修复。
- 发现：Run 只有 trigger kind/binding/time，不能解释“为什么启动、触发输入是什么、
  经哪版 mapping 形成 Workflow input”。
- 处置：新增 `WorkflowTriggerSnapshot`，保存 reason、Binding/Definition version、
  trigger input、fingerprint、mapping、evidence 和 occurredAt；Run 主 input 继续
  保存映射后的不可变输入。

### F04：CollectionPlan 缺少 discovery context

- 严重度：合并前修复。
- 发现：动态、推荐流、搜索、公告等计划无法保存默认发现语义。
- 处置：`CollectionPlanDetail` 增加 versioned discovery context defaults/mapping；
  Observation 保存最终解析结果。

### F05：KnowledgeSignal 处理状态会破坏不可变判断

- 严重度：合并前修复。
- 原建议：直接给 KnowledgeSignal 增加 status/decision。
- 主审调整：Signal 是不可覆盖判断，不应变成可变任务。
- 处置：新增 append-only `KnowledgeSignalDispositionSnapshot` 及 Query/Command，
  表达 acknowledge、ignore、convert-to-research 和 supersede；原 Signal 不修改。

### F06：Research provenance 不完整

- 严重度：合并前修复。
- 处置：ResearchRequest 增加不可变 trigger reason/input/fingerprint 和
  recursionDepth；Activity/Action/Attempt/恢复通过 `runId` 查询同一 Runtime
  journal，不复制第二份运行时状态。

### F07：协作修改审计字段分散

- 严重度：合并前修复。
- 处置：增加 `MutationAuditSnapshot`，统一 actor、base/result revision、reason、
  evidence、Run 和时间；Story/Topic/Membership/Relationship 等 mutation 使用同一
  语义。

### F08：Story merge/split 缺少用户状态迁移

- 严重度：合并前修复。
- 处置：增加 migration preview/apply/revert API 和
  `StoryStateMigrationPlanSnapshot`；split 不自动把用户状态或 Topic membership
  扇出到全部后继。

### F09：推荐、Workspace 和 Publication DTO 信息不足

- 严重度：合并前修复/后续阶段。
- 处置：
  - Ranking 增加 policy version、signal contribution、dedupe/diversity/hysteresis
    adjustment、Run 和时间；
  - Spotlight 增加 threshold decision、next evaluation 和 Run；
  - Workspace 增加 maintenance binding、Trigger、current Step、recent result、
    input 和 budget；
  - Subscription 增加 schedule/timezone/misfire、Channel capability/授权和优先级。

### F10：Artifact `executable: boolean` 不是安全合同

- 严重度：合并前修复。
- 处置：替换为 render mode/profile/capability；HTML 默认 isolated origin +
  sandbox + CSP，拒绝 Host DOM、文件、Secret 和未声明网络。信任放宽保持
  Reserved，需要独立审计。

### F11：`ValueEnvelope | unknown` 退化

- 严重度：合并前修复。
- 发现：TypeScript 中该联合等于 `unknown`，无法保持 kind/hash/size 合同。
- 处置：Command input/signal/message 统一使用 `ValueEnvelope`；普通 JSON 放入
  inline envelope。其它 `unknown` 字段必须在同一 DTO 中有 schema/definition
  owner。

### F12：Gateway Session replacement 存在双 owner

- 严重度：阻断真实 Gateway。
- 失败序列：旧 Session 可完成原 Attempt，新 Session 又可用同 token resume，
  两者同时 heartbeat/result。
- 处置：Attempt owner 固定为
  `(attemptId, ownerSessionId, ownerEpoch, leaseToken, leaseExpiresAt)`；
  replacement 只停新 claim，resume 以 TaskStore CAS 转移 owner、递增 epoch 并
  轮换 token，旧 owner 立即失效。

### F13：lease 丢失后的 `unknown` 没有安全授权

- 严重度：阻断真实 external Action。
- 发现：Receipt API 要 lease token，但合同又允许失租后追加 unknown。
- 处置：新增短期 Attempt-scoped late-evidence capability/API；只能追加
  external unknown evidence 并触发 reconcile，不能续租、提交 Result、恢复
  Secret、写 checkpoint/Event 或领域状态。

### F14：并发 claim 只校验 Worker 上报 slot

- 严重度：合并前修复。
- 处置：TaskStore 原子维护 Session/lane reservation；Worker `available` 只缩小
  claim。Attempt terminal/expiry/handoff 同步释放或转移 reservation。

### F15：long-poll 响应丢失与 backpressure 未定义

- 严重度：合并前修复。
- 处置：每 Session 限制 in-flight poll；claim 使用 Idempotency-Key 和持久 batch
  replay。相同 key 重放同一 Attempt/token，过期后不执行未知 claim。

### F16：heartbeat、drain 与 deadline 可能无限续租

- 严重度：合并前修复。
- 处置：draining Session 继续 heartbeat 但不能 claim；
  `leaseExpiry=min(now+duration, runDeadline, actionDeadline, drainDeadline)`；
  deadline 后走取消、lease lost、late evidence/reconcile。

### F17：Receipt transition 缺少跨副本 CAS

- 严重度：合并前修复。
- 处置：Receipt 增加 revision/baseRevision、submission fingerprint 和 server
  receivedAt；跨 Gateway transition 由数据库 CAS 裁决。committed 不回退 unknown，
  unknown 只能由可验证 reconcile 升级。

### F18：Value hash/size 与 Secret schema 不可互操作

- 严重度：合并前修复/Reserved gate。
- 处置：
  - JSON 使用 RFC 8785、text 使用原始 UTF-8、Blob 使用原始字节；
  - 在 JSON 解析前执行实际 body limit；
  - upload 增加 finalize/abort/hash/size 校验；
  - Secret material 使用不可持久化的独立 envelope；
  - Secret resolution 保持 Reserved，必须绑定 Attempt/manifest/purpose/audience/
    nonce/expiry/uses。

### F19：Gateway bootstrap trust root 未定义

- 严重度：阻断真实远程 Worker，不阻断 fake。
- 处置：固定 provider-neutral claims：subject、workerId、audience、credential
  generation、allowed placements、capability policy、issued/expiry；具体 mTLS/OIDC/
  token provider 后置，但必须支持轮换、撤销和防无界 Session 创建。

### F20：未认证部署和本地路径边界会被误用

- 严重度：阻断公网发布，不阻断本机文档 spike。
- 已验证实现风险：
  - API 默认可绑定 `0.0.0.0`，Compose 发布 4310；
  - 当前无 Product auth，CORS 缺省不能作为安全边界；
  - fixture `fixturePath` 可读绝对路径；
  - Asset/Source/Job public projection 尚未证明不含 storage key、Secret、路径或
    无界 result。
- 处置：公共合同明确未认证模式只允许 loopback/受信网络；公网、远程 Product API、
  Admin 和 Gateway 分别有认证/HTTPS gate；fixture root/public projection 进入
  implementation blocker。

### F21：资源 Snapshot 很全，但 Query/Mutation 输入不够可落地

- 严重度：合并前修复。
- 主审补充发现：v0.1 对 Search/Feed/Run/List 过滤、排序、cursor 和大部分 Planned
  mutation 只写自然语言，难以直接形成 Zod/OpenAPI。
- 处置：增加 common `CursorPageQuery`/`TimeRangeQuery`，补齐 Catalog、Source、
  Run、Observation、Entry、Search、Feed、Story、Knowledge、Research、Event Query
  DTO；增加 Connection、CollectionPlan、Trigger、Workflow binding、Story/Topic、
  Proposal、Annotation、SavedView、Workspace、Board、Spotlight、Publication、
  Delivery 和数据运维 Command 基线。

## 5. 归类为 implementation gate 的发现

以下意见证据成立，但 v0.1 草案已经表达目标语义，因此没有通过继续增加资源来
“修复”；它们进入 Task 06/后续发布验收：

1. 当前 Controller 仍直接返回 Repository projection，`Asset.storageKey`、
   Source passthrough config 和 Job arbitrary result 需要白名单 public DTO。
2. Run/Probe Transport 尚未完整执行必填 Idempotency-Key、fingerprint replay 和
   `idempotency_conflict`。
3. Source PATCH/HTTP Client 尚未实现 ETag/If-Match/revision conflict。
4. 当前 ServiceError、SSE `snapshot_required.v1`、协议 Header、分页 cursor 和
   canonical route 尚未收敛。
5. 当前 Runtime/Prisma complete/Receipt/checkpoint 路径需要证明 Run fence +
   Job/Attempt fence 同事务覆盖全部写入。
6. 当前 Job 主要以 attempt count/lease 表达。架构不强制单独 Attempt 表，但必须
   提供可查询、可 fencing、可审计并通过 conformance 的 Attempt projection；无法
   证明时再增加独立持久实体。
7. cancel 的 `cascade`、signal version/重复/乱序、timer/external/user wait 和通用
   Workflow checkpoint CAS 尚未实现完整草案语义。
8. legacy Run 可能缺 definition snapshot；新 Run 必须完整，旧 Run 使用显式
   `legacy_missing` 读取状态。
9. `/healthz`、`/readyz`、Worker Admin、metrics 和 Compose readiness 尚未实现。
10. Docker/Compose 仍是本机验收入口，不是生产安全模板；正式部署另开 Task。
11. backup/restore/export/delete、Webhook、Publication/Delivery、HTML render 和
    Secret Broker 都是未来 Phase gate，不能从 API 草案推断已经可用。

## 6. 未采纳或调整的代理建议

| 原建议 | 最终处置 |
| --- | --- |
| 把所有 Phase 1 生命周期端点改成 `Convergence` | 未采纳。Task 06 convergence 与产品 Phase 分开；标记为 `Planned · Phase 1 remainder` |
| 直接给 KnowledgeSignal 增加可变 status | 调整为 append-only disposition，保留 Signal 不可覆盖 |
| API 有 Attempt DTO就必须立刻增加 Prisma Attempt 表 | 未采纳表结构强制；保留独立 Attempt 语义与 conformance gate |
| Story Detail 当前只能有一个 Entry 是草案错误 | 该证据针对当前代码；v0.1 草案已使用多 Membership，归为实现迁移 |
| 现在就实现完整公网认证、Secret 平台和不可信插件沙箱 | 未采纳本轮实现扩张；改为明确 release gate |
| ResearchRequest 复制所有 Activity/Action/Attempt | 未采纳重复真相；通过 runId 查询 Runtime journal |

## 7. 仍待后续实现 Task 决定

这些问题不阻塞 v0.2 文档草案，也不应在没有实现证据时提前冻结：

1. Phase 1 默认 CollectionPlan 的持久表/UI 如何从当前 Source
   `scheduleIntervalMs` 迁移；公共语义已固定为同一 CollectionPlan，不建立第二套
   scheduler。
2. Gateway bootstrap provider 采用 mTLS、OIDC、部署签发 token 或组合；claims 与
   撤销语义已经固定。
3. SQLite Spike 使用 Job lease/计数/receipt 投影 Attempt，还是在 convergence
   migration 中增加独立 Attempt 表。
4. Secret Broker 的后端、远程信任等级、加密和一次性 material 传输；在决定前
   resolution endpoint 保持 Reserved。
5. KnowledgeSignal disposition 由人类、规则还是 Agent 自动生成；每种方式都必须
   保存 actor/reason/Run，不能改写 Signal。
6. 受信 Artifact 是否允许显式网络 allowlist；默认仍是严格 sandbox。
7. 备份默认是否包含日志、缓存、历史大值和 Secret；需要独立数据生命周期 Task。

## 8. 验证边界

已运行：

- `git diff --check`：通过；
- 全仓 48 个 Markdown：相对链接错误 0、未闭合围栏 0、EOF 缺失 0、尾随空白
  0、conflict marker 0；
- PRD 定义型需求 ID：164 个、唯一 164 个、重复 0；
- 原始需求相对 HEAD：新增 22 行、删除 0 行，保持 append-only；
- 8 份 API 文档的 37 个 TypeScript 围栏合并后以 TypeScript strict/noEmit 做
  syntax + semantic 检查：0 diagnostics；
- Product DTO TypeScript：敏感 `leaseToken/sessionToken/storageKey/absolutePath`
  字段 0，`ValueEnvelope | unknown` 退化联合 0，mutation Command 无 owner 的
  `unknown` 0；
- Product API 自动提取 185 个 method/path key，文件内重复 0；Worker Admin
  9 个，重复 0。两个 API 面各自的 `/healthz`/`readyz` 位于不同宿主/端口，不是
  路由冲突；
- 旧 `Flow` 只命中总体架构中 3 处明确的术语迁移/历史说明；
- staged files 0，五个审查进程均已退出。

本轮没有运行代码测试、typecheck、build、Node production、migration、浏览器、
Docker、真实 RSS/Bilibili/AI HOT、Worker restart、Gateway 多主机、真实认证、
Secret Broker 或 Harness/Agent。既有 Spike 证据仍是历史基线，不能替代 API v0.2
未来实现的 schema/Transport/conformance 验收。
