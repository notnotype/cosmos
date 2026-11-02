---
parent: .agents/tasks/04-workflow-runtime/walkthrough.md
range: Round 107
sealed_at: 2026-11-02
tags: [workflow-runtime, product-service, worker-admin, gateway, dto, archive]
tokens_est: 3443
---

## Round 107 — Product Service、Worker Admin、Worker Gateway 与 DTO 草案

日期：2026-08-11

### 目标

用户确认：

1. 远程 Worker v1 使用 HTTPS request/response + bounded long-poll；
2. `ActionDefinition.executionPlacement` 使用
   `host`、`trusted_worker`、`remote_worker`；
3. 下一步深入检查原始需求和系统能力，单独形成完整 API/DTO 草案；
4. 草案允许后续实现调整；
5. 草案完成后派发多个子代理从不同链路审查和查漏补缺。

本 Round 只修改文档，不修改代码、Prisma schema、migration 或测试。目标不是把
所有 Planned API 一次实现，而是让后续 schema、Nest Controller、Worker Admin、
Gateway fake 和 conformance 有一套可审查输入。

### 工作区基线

```text
worktree:
C:\Users\notnotype\Documents\CodeRepository\GithubProjects\cosmos\
  .worktree\t04-ingest-workflow-convergence

branch: feat/t04-ingest-workflow-convergence
HEAD: dc78f0519e0320afbb27191b0d573be6cd62aedd
merge-base origin/master: 45ae918bfcfcf5dfaf90480183608007a48ee170
staged files: 0
```

开始时 worktree 已有前序 Spike 的 87 个 dirty 文件，涉及代码、migration squash、
文档和 Playwright 文件。本 Round 没有清理、覆盖或暂存这些用户/前序改动；只编辑
API 及其同步文档。

### 原始需求与能力调查

重新对照：

- `docs/requirements/0001-original-requirements.md`；
- `docs/requirements/0002-product-requirements.md`；
- 两份总体/信息模型架构；
- ADR-0001/0002；
- Task 04/05/06；
- 当前 contracts、Transport、Nest Controller、Worker Runtime、Prisma schema、
  Docker/Compose 和环境配置。

从用户场景反推的公共能力不只包括当前 Source/Feed 路由，而是：

```text
System / Capability / Protocol
Catalog / Plugin / SourceDefinition / ActionDefinition / WorkflowDefinition
Connection / Source / CollectionPlan / Trigger
WorkflowRun / Activity / Step / Job / Attempt / Receipt / Signal
Observation / Entry / Revision / Asset / Blob
Story / Topic / Entity / Relation / Proposal
KnowledgeSignal / ResearchRequest
Feed / Related / Interaction / ReadState / Spotlight
Workspace / Artifact / Agent Conversation
Board
Publication / Subscription / Delivery
Storage / Backup / Restore / Export / Delete / Integrity
```

同时确认三个 API 面：

```text
Product Service API
  -> Web / CLI / Desktop / Knowledge Manager tools

Worker Admin API
  -> health / readiness / status / capability / metrics / drain

Worker Gateway API
  -> Session / long-poll claim / Attempt heartbeat / Receipt / Result
```

Product Service 与 Gateway 初期可由同一 NestJS 宿主承载，但模块、路径和版本独立；
Worker Admin 使用单独内部端口。Admin 不提供同步 Job execute，Gateway 不持有第二
份 Job terminal。

### v0.1 独立草案

新增：

```text
docs/api/README.md
docs/api/0001-common-contracts.md
docs/api/0002-product-service-api.md
docs/api/0003-product-dtos.md
docs/api/0004-worker-admin-api.md
docs/api/0005-worker-gateway-api.md
docs/api/0006-scenarios-and-conformance.md
docs/api/0007-review-findings.md
```

v0.1 约 3,800 行，覆盖 Header、Page、ServiceError、Idempotency、ETag、SSE、
ValueRef、全部 Product 资源、Worker Admin、Gateway Session/claim/lease/
Receipt/Value/Secret/result/replacement/drain，以及产品、故障和 Transport 场景。

同步新增：

- ADR-0003：固定三个 API 面、long-poll、Direct/Gateway 混合和 placement；
- PRD v0.16：增加 Product/Admin/Gateway、remote Worker 和 placement 需求；
- 总体架构 v0.20；
- Task 06 Step 5 的 API/Host convergence 边界；
- 原始需求 append-only 追加本轮用户原话；
- `CONTEXT.md`、文档索引、项目状态和 README 入口。

### 五个隔离只读审查代理

先前一次前台尝试因单次命令 60 秒上限未产出，已清理且不计入结果。随后使用五个
隐藏、ephemeral、read-only `codex exec`，分别读取限定文件并写独立结果：

| 范围 | 结果 | 状态 |
| --- | --- | --- |
| 产品需求覆盖 | `product.final.md` | 成功 |
| Workflow/恢复 | `runtime.final.md` | 成功 |
| Gateway/分布式 | `gateway.final.md` | 成功 |
| 运维/安全/隐私 | `operations.final.md` | 成功 |
| DTO/Zod/兼容 | `dto.final.md` | 成功 |

实际成功数：5/5。代理均未修改仓库文件。结果文件和 SHA-256 记录在
[`docs/api/0007-review-findings.md`](../../../../docs/api/0007-review-findings.md)。

### 主审与 v0.2 修订

主代理没有直接接受代理结论，而是逐条回查 PRD、架构和代码。主要修订：

#### 1. 实现成熟度与产品 Phase 分离

`Current/Convergence/Planned/Reserved` 是实现成熟度，不是产品 Phase。Phase 1
最小闭环已完成，但完整 Phase 1 仍缺 Source 删除、默认定时 CollectionPlan、
Source health/checkpoint、完整 Run/Step、真实 RSS/Docker/长时间恢复。

这些项目标为 `Planned · Phase 1 remainder`，不因此全部扩进 Task 06。

#### 2. Product DTO 补齐

- 最小 Story Current 与完整 Story/Topic Planned 分开；
- Run 增加不可变 Trigger reason/input/fingerprint/definition/mapping/evidence；
- CollectionPlan 增加 discovery context；
- KnowledgeSignal 使用 append-only disposition，不增加可变 status；
- ResearchRequest 增加 trigger input/depth，运行细节通过 runId 查询 Runtime；
- 协作修改统一 `MutationAuditSnapshot`；
- Story merge/split 增加用户状态 migration preview/apply/revert；
- Ranking/Spotlight 增加 policy/version/signal/adjustment/threshold；
- Workspace 增加 maintenance binding、current Step、recent result、input/budget；
- Artifact 使用严格 sandbox render profile，不再用 `executable: boolean`；
- Subscription 增加 schedule/timezone/misfire/channel capability；
- Detail 的集合改为有界 preview，完整历史走分页子资源；
- 删除会退化为纯 `unknown` 的 `ValueEnvelope | unknown`。
- 主审补充 Search/Feed/Run/List Query DTO，以及 Connection/Plan/Trigger、
  Story/Topic、Workspace/Board、Publication/Delivery 和数据运维 mutation Command
  基线，避免只靠自然语言生成 Zod/OpenAPI。

#### 3. Gateway owner 与恢复收口

v0.1 存在真实双 owner 矛盾：旧 Session 可继续 Attempt，新 Session 又可用同 token
resume。v0.2 固定：

```text
Attempt owner
= (attemptId, ownerSessionId, ownerEpoch, leaseToken, leaseExpiresAt)
```

- replacement 只停止旧 Session 新 claim；
- resume 通过 TaskStore CAS 转移 owner、递增 epoch、轮换 token；
- 旧 owner 立即失去 heartbeat/Receipt/Result 权限；
- 没有 resume 时，旧 Session 仍只能完成自己的原 owner tuple。

#### 4. external late evidence

lease 丢失后不能再使用 lease Receipt API。external claim 获得短期、
Attempt-scoped late-evidence capability；它只能追加 `external_effect_unknown`
并触发 reconcile，不能续租、提交 Result、恢复 Secret、写 checkpoint/Event 或
领域状态。

#### 5. 容量、backpressure 与 Receipt CAS

- TaskStore 原子保留 Session/lane slot；Worker `available` 只是提示；
- long-poll 有每 Session in-flight 上限；
- claim 使用 Idempotency-Key 保存 batch replay，响应丢失不再领取第二批；
- Receipt 使用 revision/baseRevision、submission fingerprint 和 server receivedAt；
- heartbeat expiry 被 Run/Action/drain deadline 截断；
- draining Session 继续 heartbeat，但不能 claim。

#### 6. Value、Secret 和身份

- JSON hash 使用 RFC 8785 canonical UTF-8；
- text/blob 使用实际原始字节；
- body limit 在 JSON 解析前执行；
- upload 增加 finalize/abort/hash/size；
- Secret material 不使用可持久化 ValueEnvelope；
- Secret resolution 保持 Reserved；
- Gateway bootstrap 固定 provider-neutral identity claims，具体 mTLS/OIDC/token
  provider 后置。

#### 7. 部署和实现 gate

审查确认当前实现有以下真实风险：

- Product API 无认证并可绑定 `0.0.0.0`，Compose 发布 4310；
- CORS 不能作为认证；
- fixture `fixturePath` 可读取绝对路径；
- Source/Job/Asset public projection 尚未证明移除内部 config/result/storageKey；
- 还没有 `/healthz`/`readyz` 分离、Worker Admin 或真实 Gateway。

v0.2 明确当前未认证模式只适用于本机/受信网络；公网、远程 Product API、Admin、
Gateway、Secret 和文件 transfer 都需要独立 release gate。本 Round 不扩张到实现
完整认证平台。

### 调整或未采纳的建议

- 不把全部 Phase 1 项标成 Task 06 `Convergence`；
- 不把 KnowledgeSignal 改成可变 status；
- 不因 DTO 有 Attempt 就提前强制独立 Prisma Attempt 表；先要求独立语义、
  projection 和 conformance，无法证明再迁移；
- 不在 ResearchRequest 复制第二份 Activity/Job 状态；
- 不把当前代码单 Entry Story projection 误报成 v0.1 草案错误；草案已有多成员
  Membership，当前代码属于实现迁移；
- 不在本轮实现完整公网认证、Secret 平台或不可信插件沙箱。

### 同步文件

v0.2 修订同步到：

- `docs/api/` 全部草案与审查记录；
- ADR-0003；
- 总体架构 v0.21；
- Task 06 fake Gateway/conformance gate；
- `PROJECT-STATUS.md`；
- 根 `README.md`。

PRD 已有 Trigger/Research/Story/推荐/Artifact/运行恢复需求，不为每个协议字段再
制造一批重复技术型 ID。原始需求文件只保留此前 append-only 追加。

### 当前未实现

- v0.2 Zod schema 和 package 拆分；
- Product Controller/Application Port/HTTP Client 迁移；
- canonical route、Header、Page、ETag、ServiceError 和 SSE wire 收敛；
- Worker Admin HTTP Server；
- Gateway fake、owner CAS、late evidence、Receipt CAS、slot reservation、
  backpressure 和 claim replay；
- bootstrap provider、Secret Broker、PostgreSQL/S3 多主机；
- Connection/CollectionPlan/Knowledge/Research/Workspace/Publication 产品实现；
- 公网认证、Docker 生产安全模板和完整数据生命周期。

### 验证

已运行：

- `git diff --check`：通过；
- 全仓 48 个 Markdown：相对链接错误 0、未闭合围栏 0、EOF 缺失 0、尾随空白
  0、conflict marker 0；
- PRD 定义型需求 ID：164 个、重复 0；
- 原始需求相对 HEAD：新增 22 行、删除 0 行；当前 SHA-1
  `74f785a572ecedf150e2ad12ecf0f758f7278671`，HEAD SHA-1
  `c94f7a89f97640dbde5a9bffeee948d6a04a1aec`；
- 8 份 API 文档共 5,158 行，37 个 TypeScript 围栏合并后以 strict/noEmit 做
  syntax + semantic 检查：0 diagnostics；
- Product DTO TypeScript：敏感 lease/session/storage/path 字段 0，
  `ValueEnvelope | unknown` 退化联合 0，mutation Command 无 owner `unknown` 0；
- Product API 自动提取 185 个 method/path key，文件内重复 0；Worker Admin
  9 个，重复 0；
- 旧 `Flow` 只保留在总体架构 3 处明确迁移/历史说明；
- staged files 0，五个审查进程均已退出；
- branch/HEAD/merge-base 仍分别为
  `feat/t04-ingest-workflow-convergence`、
  `dc78f0519e0320afbb27191b0d573be6cd62aedd`、
  `45ae918bfcfcf5dfaf90480183608007a48ee170`。

本轮没有运行代码测试、typecheck、build、Node production、migration、browser、
Docker、真实来源、长时间恢复、Gateway 多主机、真实认证、Secret Broker 或
Harness/Agent。既有 Spike 证据仍是历史基线，不能替代 API v0.2 后续实现的
schema/Transport/conformance 验收。
