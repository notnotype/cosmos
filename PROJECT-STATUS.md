# Cosmos Project Status

> 当前基线（2026-11-04）：HEAD `839e874`；`master` 比 `origin/master` 超前 3 个提交。**代码树同 `5e760e2`：类型检查、构建、全仓 1,245 用例、文档门禁通过；浏览器、真实来源、远端 CI 未验证。`710c2b1` 仅为 Task 36 历史验收基线。** Phase 1 无未闭合项；Phase 2 十四条切片和平台面四块已交付，需求表有 1 项未闭合：LIB-004（延后 Phase 3）。G01–G08 暂停，Phase 1 后置债按 2026-09-07 保留。
>
> **Task [`36`](.agents/tasks/36-reading-layout-and-object-details/README.md) 已完成并合并：`9fccfcb`（实现）＋ `2257480`（切片 C/D/E 专属浏览器用例）以 `--no-ff` 合并为 `710c2b1` 并推送（2026-10-05）；该 SHA 是历史验收基线，不代表当前代码基线，维护者验收通过。本地分支与 worktree 已清理；远端分支 `origin/feat/t36-reading-layout-and-object-details` 仍在。

## 历史分册索引

历史切片与审查记录已按月/主题归档到 `PROJECT-STATUS/` 子目录(每册 ≤30 KB,封口后只读,勘误记入本文件勘误节或同级 [`ERRATA.md`](PROJECT-STATUS/ERRATA.md));
主文档只保留当前快照、活跃边界与分册索引——滚动归档只切历史,不切当前状态和有效决定。

| 分册 | 覆盖范围 | 大小 |
|---|---|---|
| [history-2026-09-5.md](PROJECT-STATUS/history-2026-09-5.md) | 2026-09-21 ~ 2026-09-18(5 节) | 3.4 KB |
| [history-2026-09-4.md](PROJECT-STATUS/history-2026-09-4.md) | 2026-09-16 ~ 2026-09-15(3 节) | 5.3 KB |
| [history-2026-09-3.md](PROJECT-STATUS/history-2026-09-3.md) | 2026-09-15 ~ 2026-09-11(2 节,含 2026-08-24 被取代快照原文) | 7.8 KB |
| [history-2026-09-1.md](PROJECT-STATUS/history-2026-09-1.md) | 2026-09-10 ~ 2026-09-09(9 节) | 22.7 KB |
| [history-2026-09-2.md](PROJECT-STATUS/history-2026-09-2.md) | 2026-09-09 ~ 2026-09-08(6 节) | 15.5 KB |
| [history-2026-09-phase1.md](PROJECT-STATUS/history-2026-09-phase1.md) | 2026-09-07 ~ 2026-09-01(5 节) | 13.1 KB |
| [history-2026-08-legacy.md](PROJECT-STATUS/history-2026-08-legacy.md) | 无日期 ~ (8 节，含 2026-09-15 移入的「2026-08-15 之前的历史基线」) | 12.6 KB |
| [history-2026-08-completed.md](PROJECT-STATUS/history-2026-08-completed.md) | 无日期 ~ (1 节) | 12.3 KB |
| [history-2026-08-reviews.md](PROJECT-STATUS/history-2026-08-reviews.md) | 2026-08-08 ~ 2026-08-15(7 节) | 15.7 KB |

## 一句话结论

Source 身份/revision 持久化合同仍以「`sourceDefinitionRef + operationId + config` 创建默认停用 Source、再以 revision CAS activation command 启用」为产品路径，产品路径不提交 `kind`、`enabled` 或 `fixturePath`。Phase 2 已收口：十四条切片与平台面四块全部落地，PRD §12 Phase 2 的四条验收标准中前三条（按来源/分类/时间/全文/Topic 浏览、多来源 Story 的时间线与相关内容、可调整看板且删除 Block 不删除底层信息）已有实现、浏览器自动化与真人验收三层证据，第三条的专问由维护者明确回答「完好」。第四条「重分析不覆盖用户批注和人工关系修正」**已在 Phase 2 被真正考验**：勘误台账 2026-09-24 行裁定「重分析」包含 ingest 的 Entry→Story 确定性投影，那已是一条自动写入路径（来源修订时改写 `Story.kind` 并用 Entry 标题/摘要顶掉当前 Revision），该路径已由 ADR [`0028`](docs/adr/0028-user-truth-protection-v1.md) 纳入保护并补回归测试；Knowledge Workflow 的派生分析仍属 Phase 3，其降级规则（只能产生候选 Revision）已在同一 ADR 冻结。ORG-021 已改标 Phase 3。本轮验证数字与未运行项见「验证边界」。

> 本条原为 2026-08-24 的 Source 身份/revision clean cutover 快照；留存注记见 [history-2026-09-5.md](PROJECT-STATUS/history-2026-09-5.md)。

## 当前运维边界

- Worker Admin 的 `activePollCount` 只统计 `beginPoll` 到 `endPoll` 的 poll；`activeAttemptCount` 只统计 runtime 明确登记的真实 Attempt。Drain 等待 active poll/Attempt，deadline 到达返回 `timed_out` 且 `resourcesClosed=false`。
- `SIGINT`、`SIGTERM` 和 Admin drain 共用 WorkerRuntime shutdown 状态机；正常退出码为 0，force/failed shutdown 为 1。
- WorkflowRun 的 `sourceInstanceId`、`errorMessage` 是 durable projection 字段；来源查询同时考虑 legacy Run 和 WorkflowRun，不从 Kernel stateJson 猜错误文本。
- 旧 IngestionWorker 路径保留；显式 `COSMOS_WORKFLOW_HOST_ENABLED=false` 才回退旧路径。Gateway、Redis、多主机和远程 Worker 不属于当前实现。
- 远端 `master` 当前**没有分支保护或 ruleset**（2026-09-17 用 GitHub API 核实，`branches/master/protection` 返回 404、rulesets 为空）：CI 只是事后信号，不阻止直接推送或合并；是否启用 required checks 待维护者决定。
- 产品当前 **PC 优先、不做移动端适配**（维护者 2026-09-17：移动端等 PC 端做好后再适配）：390px 页面级横向溢出检查**暂停执行**，PC/平板宽度（768/1024/1440px）继续断言；恢复条件写在 `e2e/support/viewports.ts`，恢复前先给两处溢出断言补失败现场打印（见已知不稳定用例表第 2、3 条）。
- 工具链与依赖源已固定（2026-09-17，Task 29）：bun 版本 **1.4.2** 在 `package.json` 的 `packageManager`、CI 的 `BUN_VERSION`、`docker/Dockerfile` 基础镜像三处一致；依赖源显式写在 `bunfig.toml`（npmmirror，与 `bun.lock` 里 1,026 条地址一致，实测已有条目不会被改写、配置只决定新解析条目写哪个地址）；锁文件仅补回 `configVersion` 一行，依赖解析零变化。Docker 基础镜像的版本切换**未做容器实跑**（本机无 Docker CLI，tag 存在性已用 API 核实）。

## 当前下一步

**Task [40](.agents/tasks/40-story-content-representation/README.md) 仍在验收中**：旧库升级、Node recovery、原 JS 预算及显式降级/候选决定已有隔离证据。维护者确认一次真实 Provider 合成正文摘要→Web 人工接受/持久化通过，内容和证据正确；非 Agent 独立复验，此前格式失败保留。Host 在入口进程，不替代独立 Worker 验收。真实来源复验、关系/质量任务及通用分类/旧 spec 仍待收口，新外呼须逐次授权，Task40 不关闭；详见 [walkthrough](.agents/tasks/40-story-content-representation/walkthrough.md)。

**Task 38（Agent Invocation 基础接入 v1）已完成**（2026-10-08）：新增版本化 `agent.invoke@1` Workflow Action、JSON-safe Agent Invocation 合同、Invocation Port 与确定性 Fake Adapter；复用现有 Activity Worker 的 Run/Job/Lease、取消、重试和 completion 语义。全量单元测试 139 个文件/798 个测试、全仓 typecheck、共享包构建和 docs:check 均通过。真实 `pi-ai` Adapter 已由 Task 39 承接交付；`neuro-agent-harness`、`nb-memory`、工具执行、Artifact、Workspace、Knowledge/Research 仍未实现，另开后续 Task。

**Task [39](.agents/tasks/39-pi-ai-adapter/README.md)（Pi-ai Adapter 与 Provider/model 配置）已完成**（2026-10-26）：新增 `@cosmos/agent-pi-ai` 真实 SDK 适配、模型页配置、Provider 独占凭证与清理补偿、模型型 Connection 单选、Worker `@2` 消费；旧部署 profile 与 `agent.invoke@1` 注册已退出，模型与凭证一律按调用时的 Connection 解析（`@1` 契约保留但无生产注册，Story 当前消费 `@2`）。1134 用例、typecheck、lint、`bun run build` 通过；组件实验室验收 45 项；真实 Provider `@1`/`@2` 各一次 HTTP 200；隔离迁移 2/2。边界：默认库升级与生产部署未运行；`test:browser` 58/60（两条失败均早于本 Task）；Provider 删除是同步 204。偏差见 Task walkthrough。

Task 36 已完成并通过真人验收；实现、合并与验收证据见 [Task36 完成历史](PROJECT-STATUS/history-2026-10-task36.md)。当前仍保留右栏 240 px 下限与首屏预算约束，分支和 worktree 尚未清理。

**前端界面从 0 重新设计已落地（Task [`35`](.agents/tasks/35-frontend-redesign/README.md)，2026-10-01）**：外壳（顶栏 + 悬浮侧栏）+ 十个路由取代「单页 + Story 抽屉」，单一明暗轴 `data-cosmos-appearance` 取代 `theme × colorway` 两套轴，SSE 提升到外壳层且全程恰好一条，用户可见文案集中到 `apps/web/src/copy/` 并有禁用词与内联文案只减不增门禁；版面/预算/行为三类门禁落在 `e2e/browser/layout-and-budget.spec.ts` 与 `story-live-refresh.spec.ts`。真人验收做了 6 条中的 3 条，剩余 3 条由 Task 36 承接；Task 35 移交的四项均已在 Task 36 落地。仍不随 Task 36 修的：`/automation` 三条交互诉求与组件级文案迁移 772 处。

**2026-09-18 复核与决定（文档口径、公开投影安全项、Phase 1 缺口收口）**：完整记录移入 [`PROJECT-STATUS/history-2026-09-5.md`](PROJECT-STATUS/history-2026-09-5.md)；仍然有效的结论是 PRD §7／§12 表内无未闭合项、两项修复均已推送。
**Phase 2 收口与尾巴的完成记录（2026-09-15/16/23/24）**：完整记录已移入
[`PROJECT-STATUS/history-2026-09-4.md`](PROJECT-STATUS/history-2026-09-4.md)；
仍然有效的是下面「本次未纳入、仍开着的项」与「Phase 3 入口条件」。

**本次未纳入、仍开着的项**（不随 Phase 2 收口顺带执行）：

- Entity merge/dedup；批注的正文片段字符级锚点；**代码规模行数门禁已由 G08 修复**（2026-10-08 复测：完整口径下只剩 **1 个**文件超 800 行——`product-fixtures.tsx`（1192 行，留待组件实验室重做），非 UI 侧已清零；入口 2 个超 300 行，均已在 size 基线内登记。G09–G16 已治理 `packages/domain`、`media-acquisition`、`workflow-host-runtime`、`worker-admin`、`collectors`、`workflow-backend` 与 `workflow-ingest` 测试）。
- **搜索 FTS5 语法字符导致 500：已合并**（`04ecbfc`）——`-` 等 FTS5 运算符会让用户输入变成畸形查询；现按维护者裁定「全当字面文本」处理（按空白切词、每段作字面短语、多词保持 AND、无词可搜时退回无文本条件）。**代价**：搜索框不再是 FTS5 查询接口。
- **已知不稳定的测试用例**（2026-09-24 更新）：`phase2-organization.spec.ts:539` 搜索用例**已归因并修复**（根因是 Feed 卡片列表的 React key 重复，改用 `entryId`），同一次排查还修掉一个陈旧刷新覆盖搜索结果的竞态；过程见 Task [`30`](.agents/tasks/30-feed-stale-response-race/README.md)。2026-09-23 另修掉一个**确定性**布局缺陷（`webhook-entry.spec.ts` 的点击被溢出的连接面板拦截），它不是抖动。**仍未归因且失败点漂移**：8 轮整套里 4 轮失败，落点分别在 `source-lifecycle-and-search-filters.spec.ts`（`locator.fill` 卡满 300 秒、整轮 7.2 分钟）、`collection-plan-multi.spec.ts`、`phase2-organization.spec.ts`（`:103`/`:417` 与拆分场景）——症状集中在 DOM/前端层。**Task [`34`](.agents/tasks/34-sqlite-lock-observation/README.md) 已证伪「SQLite 锁/慢操作同根因」这条候选路径**（3/4 个失败轮次慢操作总数为 0）；下一步看 Playwright 的失败 trace。两处 390px 断言随移动端适配后置**暂停执行**。症状与建议次序只在 [`known-unstable-cases.md`](docs/testing/known-unstable-cases.md) 维护。**2026-10-03 追加（Task 36）**：`locator.fill` 卡满 300 秒那类症状在 `story-live-refresh.spec.ts:104` 又出现一次（整套 8.1 分钟、单跑正常），**落点继续漂移**；同轮实验室 `connection-panel.spec.ts` 也出现一次瞬时双预览的严格模式冲突。
- ING-009 剩余后置项（历史媒体回填、音频/视频下载实体、单条目媒体数量上限、全局默认值 env 化）按 ADR-0015 Revisit Gate 评估。
- Read State 驱动的「未读」过滤、相关内容的服务端排序与更大候选集（当前 Web 侧组合既有读端点、上限 5 条）属 Phase 4 推荐体系；批注的 Artifact 目标属 Phase 3。
- Phase 1 后置债（Docker/Compose、发布部署、真实公网长时定时抓取、非 Windows 平台 smoke、长时间故障恢复）按维护者 2026-09-07 划线保留；其中任一项需要提前补做时单独开 Task/申请授权，不随后续切片顺带执行。

**Phase 3 入口状态（2026-10-08，2026-10-23 补记）**：Phase 3 第一切片已由 Proposal [`agent-invocation-v1`](docs/proposals/agent-invocation-v1.md)、ADR [`0030`](docs/adr/0030-agent-invocation-v1.md) 和 Task [`38`](.agents/tasks/38-agent-invocation/README.md) 收敛并完成；真实 `pi-ai` Adapter 与 Provider/model 产品配置已由 Task [`39`](.agents/tasks/39-pi-ai-adapter/README.md) 交付。`neuro-agent-harness`、`nb-memory`、Artifact/Workspace/Agent Session 数据模型仍未实现，PRD §12 Phase 3 其余范围仍需分批排期。`.agents/learning/phase3-tech/` 的技术预研材料保留为后续技术决策输入。

## 当前架构基线

以下是 v0.21 的 Phase 0/Phase 1B/1C 基线；后续需求仍可通过记录理由调整：

- 服务器部署优先的模块化单体；逻辑上分 Web、API、Worker 和一次性 Migrator。
  当前 Web 可以独立部署，API/Worker 仍共享 SQLite/Data Root，只支持同机或共享卷。
- Web 使用 React + Next.js App Router；API 使用 NestJS；UI 初步使用 Tailwind、shadcn/ui、React Hook Form 和 Zod。
- Bun 用于开发，Node 用于生产；共享包和 Worker 运行路径保持 Node-compatible。
- Prisma + SQLite 保存核心元数据、关系、任务与用户状态；FTS5/BM25、虚拟表和
  触发器通过受控 SQL Adapter 使用。WAL/busy timeout 是 Local Durable 目标，
  当前尚未在代码/migration 中显式验证。
- `nb-workflow@0.2.0` 已提供稳定的规范脚本/Activity replay 语义；Task 07 合入提交
  `5ce628690ab0110b0525e8ebcbacbe673ced9c55` 已接入 Prisma Backend、Blob ValueStore、
  Durable Host、固定 Ingest durable path 和 Worker Admin direct loopback。完整 parity、
  跨进程 recovery、长时 fencing、SIGTERM 活跃 Attempt deadline 和部署/真实来源验收仍
  未完成或未验证。
- TaskStore 是 SQL 中的任务权威；本地默认自适应 polling，不要求 Redis。WakeupBus/Redis
  只做可选通知，真正多主机目标是 PostgreSQL + S3/MinIO + 可选 Redis；Redis、多主机
  实现当前不存在。
- 当前 Product API 已有 catalog/公开投影路径，Worker 独占 executable；manifest-only
  边界已有代码和测试，但完整 Docker/browser/真实来源生产验收仍未完成。
- 对外合同拆成 Product Service、Worker Admin 和 Worker Gateway。远程 Worker
  使用 HTTPS long-poll；Attempt owner 由 Session/owner epoch/lease token/expiry
  的持久 tuple 决定，resume 必须 TaskStore CAS 转移并轮换 token。真实 Gateway
  尚未实现。
- 服务器、客户端、客户端与服务分离三种模式共用版本化 Service Endpoint、Command、Query、Event 和 SSE Transport；客户端不直接访问 Prisma、SQLite 或 Data Root。
- 内容寻址 Blob Store 保存原始 payload、图片和附件；Artifact Root 保存版本化生成产物，Cache Root 可重建。
- 运行日志不写入 SQLite；API、Worker、Web 分别写入 `api.jsonl`、`worker.jsonl`、`web.jsonl`，默认使用 `<Data Root>/logs`，也可由 `COSMOS_LOG_ROOT` 指定，stdout + 文件双写，7 天保留和 256 MiB 总量上限。
- 原始 Observation 不可变，外部 URL 可选；派生分析和索引可重建并保留 provenance。
- Entry 是稳定信息条目；每个 Entry 默认拥有一个主 Story，Story 使用稳定 kind 和受管理 subtype 注册表；Topic 只组织 Story。
- Workspace 保存长期体验、维护策略和交互状态；Artifact 保存不可变的版本化输出。
- Topic、Workspace、Spotlight 和 Feed 等上层体验以 Story 为内容单位，不直接使用 Entry。
- Story 聚类与相关推荐使用不同判定；第一版推荐以显式关注、BM25、Entity/关系、时间、引用、新颖性和本地反馈为主，不使用 embedding。
- Agent 自动创建 Topic 需要两个不同 Story 或明确跟踪规则；Topic 不自动过期。
- 人类、Agent 和系统均作为协作者，每次修改记录 actor、revision、理由和关联 Run。
- 第一版预算只限制全局日额度、单次 Run 的时间/token/工具调用和紧急保留预算，超预算时降级。
- TopicMaintenanceBinding、BoardPlacement、SpotlightPlacement 和 Subscription 相互独立；自动 Spotlight 使用可续期 TTL。
- Entry 可通过 evidence_for/mentions 关联多个其它 Story；Story/Topic merge 保留 canonical ID 与 alias。
- Story split 保留旧历史壳和 `replaced_by[]`；Topic v1 不使用父子层级，Topic membership 只有一个当前角色并保存 revision history。
- Story 当前表示由不可变 Story Revision 和 `current_revision_id` 维护；历史产物引用精确 Revision。
- Feed 反馈与被排序的 Story/surface 对齐；Agent 对人类确认的 Topic 成员只能提出移除建议。
- Workspace 输入是多对多 binding，可有主要锚点；Workspace Update/Run、生命周期、内容新鲜度、Placement 和 Interaction State 分开。
- Spotlight 自动策略保存分离信号、policy/version、迟滞和 TTL，人工覆盖优先。
- Workspace Update 失败/取消不替换上一成功版本；人类保护字段优先于 Agent 候选 Revision。
- Read State 使用 `last_seen_revision_id`；merge/split 的状态迁移保持 canonical 与历史壳边界。
- v1 和默认产品合同是个人本地优先，不实现多人同步、多租户或复杂权限系统。
- 当前单用户阶段知识管理者和 Agent 按最大产品权限运行，不建设审批 UI 或细粒度权限模型；未来再叠加远端/多人/不可信扩展的权限策略。
- 第一版扩展按本地可信代码处理，但继续使用 SDK/Command/Query/Event；Phase 1 从 RSS/RSSHub + fixture 开始。
- Phase 1B 的 Collector 核心只保存统一 `NormalizedIngestItem`：内容使用 `ContentKind`，作者使用允许空 `platformId` 的 `Publisher`，指标保存为 Entry 当前快照，时间使用证据优先的 `TemporalValue`；Connector 不直接访问 Prisma、SQLite 或 Blob Root。
- Bilibili v1 只支持受管 `hot`/`feed` 场景；AI HOT 只支持固定公开 endpoint 和服务 cursor。
- Ingest 通过固定 Durable Workflow 的 Run/StepRun/Action Job 执行，Probe
  暂时通过旧持久 Job 执行；两者的外部访问都只发生在 Worker，API 不执行
  Connector。
- 看板优先于推送实现；推送边界仍在架构中保留。
- Phase 1 只实现一个 Entry → 一个最小 Story projection；跨来源聚类、Story merge/split、Topic 维护和完整推荐后置。
- Phase 1 直接使用 `pi-ai`；`neuro-agent-harness` 继续独立去领域化演进，稳定后再接入 Cosmos。
- Agent 调用目标通过可选 `wf.agents.invoke` Extension 映射到
  `agent.invoke@1`；Harness 负责 Invocation/Session/Profile/Model，不能持有
  Cosmos Job durable truth。
- Workflow 是主动行为核心；脚本式 Workflow 是底层执行形态，Graph/IR/Comfy 类表达转换为脚本语义，不建立第二套 Runtime。
- Ingest、Knowledge、Research、Maintenance、Delivery 和 Interaction 使用同一 Runtime 的 `kind + tags` 分类。
- Ingest 先保存 Observation/Entry/Revision/Asset；Entry → Story 由可配置 Knowledge Workflow 处理，Research Workflow 通过 Research Request/Trigger 独立运行。
- `nb-memory` 作为 Knowledge Manager 的共享长期记忆/知识库候选；Cosmos 通过 Adapter/Port 接入，不直接依赖其内部文件。
- Knowledge Manager 的 Web Chat、`cosmos cli`、多个分身和 ingest/research 参与属于后续 Phase 3 方向，不是当前 Phase 1 已实现能力。
- 个性化配置由 Agent 记忆、Cosmos 行为观察和未来其它信号生成；平台推荐流可作为候选来源，但平台推荐信号暂不进入独立偏好模型。

## 后置决定

- “分类”是稳定导航分区、自由标签，还是二者的上位概念。
- 同一 Workspace 的并发更新、重复触发合并和取消/接管语义。
- Agent 候选 Revision 的接受/拒绝界面和字段保护最小实现。
- `updated_since_last_seen` 在不同 surface、Story split 和 merge 后的投影规则。
- 显式 state migration command 的批量操作、撤销和用户确认边界。
- 文本、图片、视频、私信和历史修订的默认保留预算。
- BiliBili 更深场景、X、Telegram、公众号、QQ群以及平台条款和长期稳定性。
- 多 Board、公网摘要链接、推送渠道和跨平台发布策略。
- Source、Trigger、Workflow、Action 的产品关系已确认；更细的实现边界、版本合同和持久运行行为统一转入 Workflow Runtime Task。
- Bun 开发与 Node 生产在 Next、Nest、Prisma、Worker 和 Harness Adapter 上的完整兼容矩阵。
- Prisma/SQLite 的 FTS5 migration、触发器、Raw SQL Adapter 和未来存储替换边界。
- 三种宿主模式的认证、Service Endpoint、SSE 恢复、Blob/Artifact 访问和版本协商。
- Desktop Shell 的具体技术、安装/升级/卸载生命周期，以及 `pi-ai` 到 Harness 的迁移门槛。
- SecretStore 第一版后端，以及 Adapter SecretRef/StateStore 的具体公共接口。
- 脚本优先 Workflow API、Context、Action 调用、Child Workflow、Journal、Graph/IR 转换和 kind/tags。
- Knowledge Manager Web Chat、`cosmos cli`、多分身共享记忆和 ingest 参与的具体运行合同；当前不建设审批 UI。
- Research Request、Trigger、Research Workflow、外部渠道访问、结果重新入库和失败恢复语义。
- `nb-memory` Adapter、存储根目录、tick/instant 映射和 Node 生产兼容性。
- Agent 记忆、行为观察和未来信号生成程序可读个性化配置的 schema、更新频率和人工覆盖边界。
- Entry → Story Proposal 的自动接受门槛、用户确认界面和 StoryMembership 迁移。
- Admission、Ranking、Impression、Feedback 和 LLM 异步特征的第一版预算。

## 尚未实现

- Docker/Compose 实际容器启动、共享卷和 healthcheck 验收；2026-09-23 首次实跑 `test:docker` **失败**（镜像构建缺 Prisma client 生成步骤），根因、证据、候选修复与未验证项见 [`docs/research/2026-09-23-docker-acceptance-run.md`](docs/research/2026-09-23-docker-acceptance-run.md)；修复待单开 Task。
- 真实 RSS/RSSHub 的**长时定时抓取**与更长时间的 Worker 重启演练。真实公网 RSS 的完整采集链路已于 2026-09-18 通过验收（阮一峰源，item count 3）；跨平台 Node 由远端 CI 的 Windows Node smoke job 覆盖。
- Bilibili 登录态 feed 的限流、长期稳定性和跨环境登录态验收；feed 场景已于 2026-09-04 通过真实数据 E2E（`itemCount=20`），2026-09-22 的 Task 33 验收在同一连接下同时跑通 hot 与 feed 两个计划（各 20 items），2026-09-23 的 EXT-006 验收另跑通登录探测与匿名 `search`（20 条真实搜索结果）；限流与跨环境登录态仍未验。
- 完整的 Source/Trigger/Workflow/Action 产品配置模型；Phase 1 只把固定 Ingest Workflow 接入生产，不包含用户自定义 Workflow 编辑/安装/管理。
- **Phase 1 收口五切片（Task [`32`](.agents/tasks/32-phase1-closure/README.md)，合并 `cd7f7bb`，完整记录见 [`history-2026-09-5.md`](PROJECT-STATUS/history-2026-09-5.md)）**：仍然有效的是 Gateway（RUN-010/011、OPS-010）改标 `Phase 3`、OPS-002 的「预算」收窄为媒体预算、`EXT-008` 与 AUT-001「删除凭据」已收口。
- Activity Host 的跨进程 durable recovery、双 Worker 长时 fencing、Worker Admin SIGTERM/活跃 Attempt deadline 和完整生产 executable registration 验收；当前代码/测试已有部分 Activity Job、lease、completion 和 direct loopback 证据，不能替代这些边界。
- 固定 `cosmos.ingest@1` parity、Source snapshot/checkpoint 的完整矩阵验收；Worker Host 默认入口已统一开启，显式 `COSMOS_WORKFLOW_HOST_ENABLED=false` 才关闭。
- manifest-only API、executable-only Worker 和独立 Migrator 的完整生产验收；相应代码路径已有 Node smoke/focused 证据与行为测试（`packages/application/src/catalog-manifest-only.test.ts` 覆盖 EXT-008 的前两条验收条件），但尚未完成 Docker 与独立构建/部署实跑——EXT-008 的第三条验收条件并入本条，不在需求表单独计。
- API/DTO Draft v0.2 的 Zod schema、Product/Application/Transport 迁移、Gateway fake conformance、owner handoff、late evidence、Receipt CAS 和真实 bootstrap identity。
- SQLite WAL/busy timeout 的显式配置与并发行为验收。
- 真实认证 Adapter 的登录生命周期**已交付**（连接承载登录态 + 探测，Task 22 切片 4a／4b）；仍未做的是**第一个真实凭证来源**（SecretRef 载体）、Checkpoint 迁移与加密-at-rest。
- 通用 Workflow 插件/管理产品面、LLM 子任务和 Proposal/Provenance。
- 推荐系统（Admission/Ranking/Impression/Feedback、推荐页、相关内容的服务端排序）；跨来源重复/转载关系只做人工标记与展示，不参与排序和去重（ADR-0022）。
- Agent 分析、Artifact、Workspace 和交互状态。
- 推送、摘要图片和网页发布（Phase 5）；看板已随 Phase 2 交付（可配置 Board/Section/Block、Spotlight 人工固定、区块拖拽排序）。

## 验证边界（历史证据与当前未验证项分开）

**当前验证**：各切片的完整命令与数字在对应 Task walkthrough（Task 10 的切片 4、Task 14 拖拽排序、Task 17/20 的 split 用户状态迁移、Task 26 的 ING-006、**Task 36 的 Round 1–24 与分册**）；本节只留仍然有效的边界与缺口。**Task 36 的分支内门禁已全绿**（`test:browser` 53、实验室 21、vitest 32、tsc、lint、`docs:check`），数字与未运行项见其 walkthrough。

- **更早的全量证据**（2026-09-23 主工作区、2026-10-01 Task 35 worktree）的逐条数字在 Task 22／23 与
  Task 35 的 walkthrough，本文件为守 9k token 不再复述；仍然有效的一条：**schema 变更合并后必须先
  `bun run db:generate`**。
- **公开 Asset 投影的内部 Blob key 已剥离**（Task [`31`](.agents/tasks/31-public-asset-projection/README.md)，合入 `3ded765`；完整记录见 [`history-2026-09-5.md`](PROJECT-STATUS/history-2026-09-5.md)）。
- **浏览器产品 E2E 仍有间歇失败**（`:103`/`:186`/`:417`/`:539` 之间漂移、单跑即过）：`:539` 根因已修复（Task [`30`](.agents/tasks/30-feed-stale-response-race/README.md)）；2026-09-23 又确认 `webhook-entry.spec.ts` 那次**不是抖动而是确定性布局缺陷**（侧栏溢出，已修）；其余（含 `ingest.spec.ts:119` 的 `toBeFocused`）仍未归因。症状与观察次数只在 [`known-unstable-cases.md`](docs/testing/known-unstable-cases.md) 维护。
- 拖拽手势已自动化（2026-10-03，Task 36）：`phase2-organization.spec.ts` 用真实指针拖拽并断言
  落点与顺序。指针坐标在该布局下不可靠（拖动期间页面会滚动），用例的处理是先滚到分区顶部、
  再按 dnd-kit 的 `over` 反推期望 position。
- 本机未运行：Docker/Compose、发布部署、长时定时抓取与长时 Worker 重启演练；`test:property`、Node 进程 E2E、组件实验室套件已于 2026-09-20 在本机跑通，Windows Node smoke 由远端 CI 覆盖。

2026-08-15 之前的历史基线与 Spike 证据（含当时的分册完成记录、Task 05/07 基线与浏览器
验收数字、Round 7/8 的 worktree 证据）整段移入 [`PROJECT-STATUS/history-2026-08-legacy.md`](PROJECT-STATUS/history-2026-08-legacy.md) 的
「2026-08-15 之前的历史基线（自 PROJECT-STATUS 主文档移入）」一节；本次分册切片只切历史，
不改动当前快照与有效决定。
