# Task Walkthroughs

重大功能、数据合同、扩展协议、运行时恢复或用户主流程使用一个持续更新的 Task。

目录名使用 `{NN}-{kebab-case-name}`。同一功能后续调整继续更新原 Task，不创建碎片化记录。

每个 Task 至少记录：

- User Request / Topic
- Goal
- Scope / Non-goals
- Current State
- Decisions and Deviations
- Implementation Walkthrough
- Verification
- Follow-ups

活跃 Task 的当前实施切片还必须记录：生命周期阶段、一个连贯目标、最多三条可观察验收、依赖、受影响合同、预计核心文件和验证层级。切片规则与完成条件以[仓库开发生命周期](../../docs/standards/repository-workflow.md#开发生命周期)为准；同一 Task 可顺序追加多个小切片，不为每个切片创建新 Task。
- 复用 Task 时优先选择仍 active 且明确覆盖受影响合同和文件的 Task；多个候选时把选择理由写入当前 Task；无匹配 Task 时由维护者决定是否新建编号。

跨 Task 的产品 TODO 在建立远端 Issue 系统后迁移到 Issue；在此之前由 `PROJECT-STATUS.md` 汇总。

Task 导航：

- [`02-rss-ingestion/`](02-rss-ingestion/)：Phase 1 RSS/RSSHub、fixture 录入、离线查询与最小 Story projection。
- [`03-runtime-logging/`](03-runtime-logging/)：API、Worker、Connector、存储和 Web 服务端的结构化运行日志。
- [`04-workflow-runtime/`](04-workflow-runtime/)：Durable Workflow、Job 恢复、Connection/Adapter、Knowledge/Research 和 Harness 边界的持续研究与实现记录。
- [`05-normalized-content-model/`](05-normalized-content-model/)：`NormalizedIngestItem`、Publisher、ContentKind、ContentMetrics 和 TemporalValue 合同。
- [`06-nb-workflow-kernel-convergence/`](06-nb-workflow-kernel-convergence/)：`nb-workflow` Kernel 与 Cosmos Host 的收敛记录。
- [`07-deferred-workflow-host/`](07-deferred-workflow-host/)：Deferred Activity、Cosmos Durable Host、Activity Job、固定 Ingest parity 和 Worker Admin 实施记录。
- [`08-project-governance/`](08-project-governance/)：治理目录、Proposal、工程标准、测试流程、Task 路径和文档门禁收敛。
- [`09-react-component-lab/`](09-react-component-lab/)：React 组件实验室、组件/场景登记合同、开发态工作台和现有 Web 产品组件采用。
- [`10-story-domain/`](10-story-domain/)：Phase 2 首切片 Story 域模型 v1——多 Entry 主归属、版本化 Story Revision、人工 merge canonical/alias 与多来源 Story 详情。
- [`11-topic-domain/`](11-topic-domain/)：Phase 2 第二切片 Topic 域模型 v1——Topic 不可变 Revision、Membership 角色 + revision/tombstone、Topic merge canonical/alias 与从 Story 侧发起的成员编排。
- [`12-entity-relation/`](12-entity-relation/)：Phase 2 第三切片 Entity/关系 v1——Entity 不可变 Revision + 名称别名、Story↔Entity 关联、Entity↔Entity 类型化关系（手动优先 + provenance）。
- [`13-user-organization/`](13-user-organization/)：Phase 2 第四切片用户组织 v1——Label 分类标签、Collection 命名收藏夹 + 轻量收藏、Annotation 批注、Saved View 持久查询视图。
- [`14-board-section-block/`](14-board-section-block/)：Phase 2 第五切片可配置看板 v1——Board/Section/Block 三层展示配置、四类 Block（Feed 绑定 SavedView/Spotlight/来源健康/Topic 与 Collection 列表）、多 Board 实体 + 默认 Board seed、Spotlight 人工固定。
- [`15-phase2-acceptance/`](15-phase2-acceptance/)：Phase 2 验收补完——Web 分类（Label）/Topic 浏览与 Saved View 条件、Story 时间线、Story 相关内容（REC-008 v1），无 Prisma/合同/API 变化。
- [`16-entry-story-evidence/`](16-entry-story-evidence/)：Phase 2 第六切片 Entry↔Story 证据关系 v1——`(entryId, storyId)` 唯一当前关系 + 受管类型 `evidence_for`/`mentions` + provenance，Story/Entry 双向读取投影与 merge/move 一致性。
- [`17-story-split/`](17-story-split/)：Phase 2 第七切片 Story split v1——`StoryReplacement` 历史壳 + `replaced_by[]` 投影、单命令显式迁移主成员/证据链接/Story↔Entity/Topic 成员、用户状态留在历史壳、壳写边界（编号 17 经维护者 2026-09-21 确认）。
- [`18-story-subtype-registry/`](18-story-subtype-registry/)：Phase 2 第八切片 Story subtype 受管注册表 v1——代码内静态注册表（kind/version/label/status/identityPolicy/owner）、写入侧只接受该 kind 下 `active` 注册项、既有未知值继续降级、只读目录接口与 Web 下拉。
- [`19-per-source-media-policy/`](19-per-source-media-policy/)：Phase 2 第九切片按来源的媒体策略 v1——`Source.config.media` 的图片下载开关与单文件/单次预算（只能收紧、缺省跟随全局默认）、fetch 时从来源快照解析、Web 来源行编辑；保留期/清理与失败重试后置。
- [`20-media-retry-retention/`](20-media-retry-retention/)：Phase 2 第十切片媒体失败重试与保留期清理 v1（ING-009 剩余部分）——采集 Run 内的 `media.retry@1` 自动重试（机器可读 `errorCode` + 每来源尝试上限，只改写 Asset 行不产生新 Revision）、每来源保留期 + 显式清理命令（先预览再确认，只删字节并回退 `metadata_only`，删除前引用检查）与 durable 维护 Workflow；编号 20 经维护者 2026-09-21 确认。
- [`21-run-control/`](21-run-control/)：Phase 2 第十一切片 Run 控制 v1（RUN-004）——`POST /runs/:id/cancellations|recoveries|re-runs` 三个控制动作（取消 = 用户覆盖式终态化 + fence、重新运行 = 复用采集入队产生全新 Run、恢复 = 送回恢复队列由 Kernel `rerun()` 续跑），响应携带 `reuse`/`sideEffects` 说明，公共 Run 五态不变、零数据迁移；编号 21 经维护者 2026-09-21 确认。
- [`22-connection-state-store/`](22-connection-state-store/)：Phase 2 第十二切片 Connection/SecretStore/StateStore v1（AUT-009/ING-012/OPS-009）——`ConnectionInstance` 实体 + `SourceInstance.connectionId` 可空外键、SecretStore 第一版（受限权限明文文件 + 不透明 SecretRef）、`ConnectorStateStore`（命名空间化版本化 KV + version CAS，不迁 Checkpoint）与 Secret 脱敏/所有权边界；CollectionPlan/Checkpoint 迁移/加密后置；编号 22 经维护者 2026-09-21 确认。
- [`23-trigger-sdk/`](23-trigger-sdk/)：Phase 2 第十三切片 Trigger/SDK v1（AUT-004/EXT-006/007）——`TriggerBinding` 实体（单绑定 schedule/manual）+ 从 `SourceInstance.config.scheduleIntervalMs` 迁出（调度循环改读 `listScheduleTriggers`）、`SourceDefinitionManifest` 扩展 `auth`/`operations`（external key/discovery/media/stateStore 命名空间）；webhook/事件触发、自定义 Trigger/Action 插件运行时、多计划后置；编号 23 经维护者 2026-09-21 确认。
- [`24-ops-storage/`](24-ops-storage/)：Phase 2 第十四切片存储占用统计与备份/恢复 v1（OPS-003/004）——`GET /storage-stats` 分层统计（raw/user/rebuildable/cleanable）、`POST/GET /backups`（`VACUUM INTO` 复制 SQLite，不依赖源码 checkout）+ `POST /backups/:id/restores`（覆盖 + 恢复前保护）、清理沿用 media-cleanup；导出/Artifact 清理/Blob 备份后置；编号 24 经维护者 2026-09-21 确认。
- [`26-entry-duplicate-relations/`](26-entry-duplicate-relations/)：Phase 2 尾巴第二切片 Entry 跨来源重复/转载关系 v1（ING-006）——`EntryRelation`（`(fromEntryId, toEntryId)` 唯一 + 受管类型 `duplicate_of`/`syndicated_from`/`near_duplicate_of` + provenance）、对称类型按条目 id 字典序归一化并双向读取、关系挂条目内容身份（`mergeStories`/`splitStory` 不迁移）、只人工写入且不参与 Feed 排序与搜索；「归入同一 Story」由既有归并/引用关系承担；编号 26 由维护者 2026-09-16 分配。
- [`27-prisma-cli-resolution/`](27-prisma-cli-resolution/)：远端 CI 恢复——Prisma CLI 的 27 处引用（`scripts/prisma.ts`、Docker 入口、3 处文档描述与 21 个 storage/worker 测试夹具）不再假定固定路径，改由 `packages/storage-prisma/src/prisma-cli.ts` 的 `resolvePrismaCliPath()` 按候选位置解析（包内 / 工作区根 / bun store），找不到时明确报错；不改行为、不动 `bun.lock` 与 CI 版本；编号 27 由维护者 2026-09-16 分配。
- [`28-mobile-gate-and-retry-isolation/`](28-mobile-gate-and-retry-isolation/)：移动端门禁后置（维护者 2026-09-17 裁定 PC 优先）——390px 页面级横向溢出检查暂停执行（PC/平板宽度 768/1024/1440 继续），保留代码、理由与恢复条件；同时修 `e2e/browser/ingest.spec.ts` 的重试不幂等（固定来源名在重试时产生重复卡片，把首次失败放大成硬失败）；编号 28 由维护者 2026-09-17 分配。
- [`29-toolchain-drift/`](29-toolchain-drift/)：工具链与依赖源固定——新增 `bunfig.toml` 显式声明国内镜像（实测：已有锁条目不会被改写，配置决定新解析条目写哪个地址）；bun 版本在 `packageManager`、CI、Dockerfile 三处统一到 1.4.2；锁文件补回 `configVersion` 一行（零依赖变化）；编号 29 由维护者 2026-09-17 分配。
- [`30-feed-stale-response-race/`](30-feed-stale-response-race/)：首页 Feed 的两个已修缺陷——①`phase2-organization.spec.ts:539` 的真实根因是卡片列表用 `storyId` 当 React key：同一 Story 可以有多张成员卡片（ADR-0022 决定 4/6），重复 key 让其中一张卡的 DOM 节点脱离 React，列表整体替换后残留成"幽灵卡片"（改用条目身份 `entryId`，回归断言在 `phase2-entry-relation.spec.ts` 红→绿）；②搜索提交后、早于它发起的陈旧刷新会覆盖搜索结果（版本号丢弃，回归用例 `feed-search-race.spec.ts`）。已合并 master `699ff5a`，公开记录 [#4](https://github.com/Otirik-handi/cosmos/issues/4)；编号 30 由维护者 2026-09-17 分配。
- [`31-public-asset-projection/`](31-public-asset-projection/)：公开 Asset 投影剥离内部 Blob key——六条公开读路由经 `toPublicAsset` 逐个挑字段，contracts 新增 `publicAssetSnapshotSchema`（公开读 DTO 用它，客户端同 schema 校验不会因字段缺失失败），回归测试逐路由断言整份响应 JSON 不含该字段名；同时校准 BRD-006 口径、spec 的 migration 顺序与 `PROJECT-STATUS` 的基线/未实现清单；编号 31 由维护者 2026-09-18 分配。按[准入决策表](../../docs/standards/repository-workflow.md#准入决策表)第 25 行（违反当前安全合同）处理：不开公开 Issue，记录只写脱敏结论。
- [`32-phase1-closure/`](32-phase1-closure/)：Phase 1 收口——让 PRD §7 中仍标 `Phase 1`／`Phase 1B`／`Phase 1C` 而未闭合的需求行全部收口，五个顺序切片：LIB-001 搜索补作者/媒体类型/录入状态三个过滤维度、ING-004 受管发现渠道落到 Observation、AUT-003 RSS 条件请求（ETag/Last-Modified + ConnectorStateStore）、AUT-001「删除来源」命令、OPS-002 Job/Attempt 产品面入口；RUN-010/RUN-011/OPS-010（Gateway）与 ING-008 按维护者 2026-09-18 裁定排除在本次之外；已 `--no-ff` 合入 master `cd7f7bb`。
- [`33-collection-plan/`](33-collection-plan/)：采集计划 v1（AUT-010）——把架构 §4.6 已冻结、实现里一直缺席的 `CollectionPlan` 落地为用户可见的独立采集计划：三步迁移（expand／backfill／read switch）让连接、触发器、媒体预算、checkpoint 与连接器状态命名空间全部归计划，计划写端点与读投影上线，产品面按连接分组并可用 manifest 驱动的表单建出 Bilibili 双计划；第 4 步 contract（从来源移除旧列）单独排期；编号 33 由维护者 2026-09-21 分配。
- [`35-frontend-redesign/`](35-frontend-redesign/)：前端界面重做 v1——按 [`docs/前端设计流程.md`](../../docs/前端设计流程.md) 走完第 0/1/1.5 三层后落地：token 换装与单一明暗轴、顶栏 + 悬浮侧栏版面骨架、十个页面取代「单页 + 抽屉」、8 个新 primitive 入库、四个只读查询、版面门禁 + 预算门禁 + 禁用词扫描。设计合同见 Proposal [`frontend-redesign-v1`](../../docs/proposals/frontend-redesign-v1.md)（accepted）与 ADR [`0029`](../../docs/adr/0029-ui-surface-layout-and-visual-direction-v1.md)；编号 35 由维护者 2026-09-24 分配（**不复用 25**，避免与已作废分支的「Task 25」混淆）；当前状态：**已建立，未开始实现**。

治理类任务（文档/代码规模治理等）使用**独立编号体系**，位于 [`governance/`](governance/)（`G{NN}` 编号，不占用上述产品 Task 编号），章程与任务索引见 [`governance/README.md`](governance/README.md)。

- [`36-reading-layout-and-object-details/`](36-reading-layout-and-object-details/)：Story 阅读页两栏版面与对象详情页补完——阅读页改成「左内容 / 右操作编辑」两栏 3:2 居中版面并拆开 `StoryEditSurface`（只读归左栏、可写归右栏、媒体移出编辑面）、归并从粘贴 Story ID 改成可搜索选择（复用 `GET /search`）、`/topics/:id` 与 `/entities/:id` 从占位变可用、标签改名补成完整竖切；编号 36 由维护者 2026-10-02 分配。
- [`37-automation-interaction-polish/`](37-automation-interaction-polish/)：自动化页交互补完——Task 35 记录的两条交互缺口：连接创建从常驻内联表单改成「新建连接」按钮 + 模态框（表单 + 确认/取消），连接区常驻内容变成连接列表并补空状态；采集计划行的纯图标按钮（启用/停用、运行、Webhook 入口、媒体策略、删除）加 `Tooltip`，悬停与键盘聚焦都能看到，文案与既有 `sr-only` 同源。无数据合同变更，`Dialog` 与 `Tooltip` 组件均已存在；编号 37 由维护者 2026-10-08 分配。
- [`38-agent-invocation/`](38-agent-invocation/)：Phase 3 第一切片 Agent Invocation 基础接入——版本化 `agent.invoke@1` 普通 Workflow Action、Invocation Port、`trusted_worker` 执行位置与 Fake Adapter 先行；复用现有 Run/Activity/Job/Attempt/Lease/取消/重试/completion durable truth。真实 `pi-ai`、`neuro-agent-harness`、`nb-memory`、Artifact、Workspace、Knowledge/Research 后置；编号 38 由维护者 2026-10-08 分配。

- [`39-pi-ai-adapter/`](39-pi-ai-adapter/)：真实 pi-ai Adapter，承接 Task 38；编号 39 由维护者分配，当前状态与验证见任务记录。
- [`40-story-content-representation/`](40-story-content-representation/)：Story 内容表示与多模态阅读——有序内容块、版本化投影、统一 Web/Agent 读取与候选接受；编号 40 由维护者分配。内容表示、阅读、候选决定及 Story 生成接线已实现，隔离完整产品链路已验收；独立审查及预算修复复核已完成；真实 Agent 与剩余整体验收未完成，证据和缺口见同一 walkthrough。

当前提交基线、验证结果和未完成边界只在 [`../../PROJECT-STATUS.md`](../../PROJECT-STATUS.md) 维护。

实现规格入口：[`../../docs/spec/README.md`](../../docs/spec/README.md)。先读 spec 索引与公共合同，再按组件读取
spec 和测试锚点；Task walkthrough 记录过程与偏差，不替代已合入实现规格。
