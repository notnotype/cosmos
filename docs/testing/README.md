# 测试入口与验收边界

本文是 Cosmos 测试层级、fixture、验收、临时数据和验证证据合同的真相源。当前默认门禁离线、可重复，不读取用户真实 `.cosmos` 数据，也不要求 Docker、公网来源或 OpenCLI；具体某次运行结果和未运行项只在对应 Task 与 [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md) 记录。

## 分层入口

| 层级          | 命令                                                                         | 当前覆盖                                                                                                       |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 单元          | `bun run test`                                                               | 包内和应用单元行为测试；默认配置排除 `*.property.test.ts`                                                       |
| 属性          | `bun run test:property`                                                      | 独立收集 `packages/**` 与 `apps/**` 下的 `*.property.test.ts`，覆盖幂等、租约 fencing 和 Worker recovery priority |
| 类型/数据库   | `bun run typecheck`、`bun run db:validate`、`bun run db:generate`            | 全仓 TypeScript、Prisma schema 与 Client                                                                       |
| 构建          | `bun run build`                                                              | packages、API、Worker、Next Web 生产产物                                                                       |
| Node 进程 E2E | `bun run test:e2e`                                                           | 构建后的真实 API/Worker、隔离 SQLite、HTTP、SSE、结构化日志；包含 ingest、Admin、跨进程 recovery、调度失败隔离 |
| 浏览器 E2E    | `bun run test:browser`、`bun run test:browser:component-lab` | 真实 Next/API/Worker Stack 产品流与首页主题偏好持久化/明暗跟随；开发态组件实验室交互、props、提交阻断、token、全局外观切换与隔离验收 |
| Windows smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-node.ps1` | Windows Node API/Worker、迁移、受控 HTTP RSS、Feed/Search/Story、SSE、requestId 和脱敏日志                    |

`bun run test:e2e` 使用独立的 `vitest.e2e.config.ts`，先构建 API/Worker，再串行运行 `e2e/**/*.e2e.test.ts`。默认 `vitest.config.ts` 明确排除 `*.property.test.ts`；`bun run test:property` 使用独立的 `vitest.property.config.ts`，只收集当前三份 property 文件：`apps/worker/src/runtime.property.test.ts`、`packages/application/src/workflow-control.property.test.ts` 和 `packages/storage-prisma/src/workflow-host-store.property.test.ts`，不会扫描普通单元测试。

浏览器新增或改变用户流程时，回归测试落在 `e2e/browser/*.spec.ts`；可抽取的 URL 编解码、排序或状态转换等纯逻辑留在 unit 层。Task 必须把响应式与可访问性验收写成可观察条件；实际浏览器验证至少覆盖受影响 viewport、键盘操作、焦点/标签、console、page error 和失败网络请求。`test-results/` 中截图和 trace 被忽略，PR 通过外部附件提交必要的脱敏证据。

组件实验室的自动化验证分为两层。单元层比较 `apps/web/src/components/ui/*.tsx`、`apps/web/src/components/cosmos/*.tsx` 的公共组件模块与实验室注册表，拒绝未登记组件、不存在的模块、重复组件/场景 id、缺少默认场景、无效控件默认值和未登记 token；URL、localStorage 和 JSON 快照解析以 `unknown` 进入 Zod 边界，并覆盖非法输入不替换既有有效状态。该层属于默认 `bun run test` 与 CI Quality。

实验室新增或改变交互时必须在真实开发 Web 表面验证 `/dev/components`：组件/场景/视口/主题/配色 URL 可复现，前进后退正确，token 覆盖只影响预览画布，本地草稿可恢复，非法 JSON 导入保持原状态。浏览器验收覆盖 320、768、1024、1440 px、键盘与焦点、console、page error 和失败网络请求。生产 Web 还需在 build/start 后确认 `/dev/components` 返回 404，且实验室没有 Product API、SSE 或用户数据请求；开发态通过不能替代生产隔离验收。

数据迁移类改动必须在 `.agent/tmp/<name>-<uuid>/` 构造包含旧数据的隔离数据库：从受影响历史 schema 或最小 legacy seed 建库，执行待交付 migration，再断言字段映射、约束、索引和应用读取。全新空库 migration 只证明安装路径，不能替代旧数据升级。destructive contract 还需单独验证备份恢复和旧字段无活跃引用；具体命令与 seed 由 Task 记录，在形成稳定公共入口前不伪造通用脚本。

StoryRevision 版本化与 merge alias 的迁移升级以 `packages/storage-prisma/src/story-revision-versioning.test.ts` 为锚点（legacy 库 → backfill per-story revision → 唯一约束）；Story 编排命令行为（move/update/merge、alias 重定向与冲突）由 `story-orchestration.test.ts` 使用隔离库 seed 覆盖。浏览器产品流程中的归并/标题更新/旧 ID 重定向由 `e2e/browser/ingest.spec.ts` 覆盖。

Topic 域模型 v1（ADR-0007）的迁移为全新表（`20260908000000_topic_domain_v1`），无旧数据 backfill，仍按门禁跑 fresh + 旧库 upgrade 两态。Topic 语义（TopicRevision 指纹、membership revision/tombstone、merge 去重、Story merge 的 membership 迁移）由 `packages/storage-prisma/src/topic-domain.test.ts` 使用隔离库 seed 覆盖；角色枚举的写入校验/读取降级由 `packages/contracts/src/index.test.ts` 覆盖；API 错误映射由 `apps/api/src/app.controller.story-domain.test.ts` 覆盖；Web 组件由 `apps/web/src/component-lab/registry.test.ts` 登记。

Entity/关系 v1（ADR-0008）的迁移为全新表（`20260908120000_entity_relation_v1`），无旧数据 backfill，仍按门禁跑 fresh + 旧库 upgrade 两态。Entity 语义（EntityRevision 指纹/no-op、Story↔Entity 幂等 link/unlink 与 provenance、Entity↔Entity 类型化关系与唯一约束、Story merge 的 StoryEntity 迁移 move/collision）由 `packages/storage-prisma/src/entity-relation-domain.test.ts` 使用隔离库 seed 覆盖；类型枚举写入校验/读取降级与命令 schema 由 `packages/contracts/src/index.test.ts` 覆盖；API 错误映射与 transport client 由 `apps/api/src/app.controller.story-domain.test.ts`、`packages/transport-http/src/index.test.ts` 覆盖；Web EntityPanel/StoryPanel 关联入口由 `apps/web/src/component-lab/registry.test.ts` 登记。

用户组织 v1（ADR-0009）子切片 A（Label/Collection/Favorite）的迁移为全新表（`20260908140000_user_organization_v1`），无旧数据 backfill，仍按门禁跑 fresh + 旧库 upgrade 两态。Label 唯一命名与多态附加、Collection 成员幂等与 `containsStory` 投影、Favorite 幂等与 Story 详情投影、Story merge 的 `CollectionItem`/`Favorite`/`LabelAssignment` 迁移由 `packages/storage-prisma/src/user-organization-domain.test.ts` 使用隔离库 seed 覆盖；`targetTypes`/`favoriteTargetTypes` 受管枚举由 `packages/domain/src/index.test.ts` 覆盖，命令 schema 与读取侧放宽由 `packages/contracts/src/index.test.ts` 覆盖；transport client 路径由 `packages/transport-http/src/index.test.ts` 覆盖；API 回执与 404/409 映射由 `apps/api/src/app.controller.user-organization.test.ts` 覆盖。子切片 B（Annotation）的迁移为全新表（`20260908160000_annotation_v1`），批注的创建/编辑/删除、`targetRevisionId` 写入捕获与 Story merge 的 targetId 重定向由同一 storage 测试文件覆盖，命令 schema 与读取侧放宽由 contracts 测试覆盖。子切片 C（Saved View）的迁移为全新表（`20260908180000_saved_view_v1`），SavedView CRUD 与 `search` 的 `labelIds`/`topicIds` any-of 过滤（含移除成员后不再命中）由同一 storage 测试文件覆盖；命令 schema 与 `SearchQuery` 扩展由 contracts 测试覆盖，transport 路径与 API 回执由 `packages/transport-http/src/index.test.ts`、`apps/api/src/app.controller.user-organization.test.ts` 覆盖。

可配置看板 v1（ADR-0010）子切片 A 的迁移为全新表（`20260909100000_board_section_block_v1`），子切片 B 的 Spotlight 迁移同样为全新表（`20260909120000_spotlight_placement_v1`），均无旧数据 backfill，仍按门禁跑 fresh + 旧库 upgrade 两态。默认 Board 幂等 seed、Board 唯一名与缺失错误、按类型 config 白名单（未知 type 拒绝、非法 config 抛 ZodError）、跨 Section move 重排与 visible 切换、duplicate 原位副本、删除 Block 不删除被绑定 SavedView、Spotlight 幂等 pin/解除与目标标题解析、Story merge 的 placement 重定向（含同 Board 冲突丢弃）由 `packages/storage-prisma/src/board-domain.test.ts` 使用隔离库覆盖；`blockTypes`/`spotlightTargetTypes` 枚举由 `packages/domain/src/index.test.ts` 覆盖，命令/读取侧 schema、`blockConfigSchemaFor` 与 pin 目标枚举由 `packages/contracts/src/index.test.ts` 覆盖；transport 路径由 `packages/transport-http/src/index.test.ts` 覆盖，API 端点与错误映射由 `apps/api/src/app.controller.user-organization.test.ts` 覆盖；Web `BoardView`（含编辑模式与 Spotlight 区块）由 `apps/web/src/component-lab/registry.test.ts` 登记，浏览器侧由 `e2e/browser/ingest.spec.ts` 覆盖隐藏/恢复与固定/解除流程。

阅读流区块独立取数（ADR-0010 决定 5 的 2026-09-15 收窄，Task 14 追加切片）无 Prisma/schema/合同变更，是 Web 内部取数位置与布局的改动，因此没有新增 unit：浏览器侧由 `e2e/browser/phase2-organization.spec.ts` 新增用例覆盖——未绑定的阅读流区块渲染最新内容流（而非占位）、再绑定一个匹配不到内容的 Saved View 后两个区块各取各的数据（绑定的显示「没有匹配的内容」而未绑定的不受影响），同时断言搜索与已保存视图位于页面级 section 而不是某个区块内；组件实验室的 `board-view` fixture 给 `feed` 一个固定响应，使自取数区块在实验室里渲染内容而不是失败占位。

搜索文本按字面处理（2026-09-15 修复，Task 02 Bug：把用户输入直接交给 FTS5 `MATCH` 会让含语法字符的词返回 500）由 `packages/storage-prisma/src/search-query.test.ts` 使用隔离库 + 真实 ingest 路径覆盖：语法字符（`-`、引号、括号）当普通字符、带连字符的词可被搜到、多词保持 AND、`OR`/`*` 不再是运算符、只有 `-`/`()`/空白的输入退回「无文本条件」且 rank 为 0。该文件把语义固定在「字面关键词、不是 FTS5 查询语言」上——要恢复操作符能力需要连同本测试一起重新评审。真实 HTTP 表面由 `e2e/browser/phase2-organization.spec.ts` 的新用例覆盖（带连字符的词打接口返回 200、UI 搜索路径正常渲染）。

区块拖拽排序（ADR-0010 决定 7，Task 14 追加切片）无 Prisma/schema/公共合同/API 变更——服务端 `moveBlock` 早已支持分区内重排与跨分区移动，本轮只补编辑模式界面。落点解析是纯函数，由 `apps/web/src/components/cosmos/board-drag.test.ts` 覆盖：`resolveDropTarget` 把 dnd-kit 的 `over` 翻成 `moveBlock` 参数（原地不动/未知区块返回 null、跨分区取目标区块所属分区、隐藏区块仍占数组下标），并有一条**不变量用例**断言「对任意 12 组（被拖区块，落点区块），本地落定结果都等于 arrayMove 预览」——这条不变量是本切片两次返工的根因护栏：曾经提交用的是自算的指针几何、预览用的是 dnd-kit 碰撞结果，导致预览 `[A,C,B,D]` 而落库 `[A,C,D,B]`、向上拖时被算成 no-op。`applyLocalMove` 覆盖同分区重排后 `position` 连续化、跨分区移动并重排两边、缺省目标分区、越界下标收敛到末尾、未知区块/分区原样返回（乐观更新与服务端语义必须一致，否则会出现"先跳回旧顺序再跳到新顺序"的闪烁）。拖拽组件本身（键盘传感器、拖动按钮、拖动浮层、一次 `moveBlock` 写回）由组件实验室新增的 `board-sortable-blocks` 登记提供渲染护栏；「把 A 移到 B 下方落在 B 与 C 之间」以及刷新后顺序保持、拖动入口指向正确区块、上移/下移按钮仍可用由 `e2e/browser/phase2-organization.spec.ts` 覆盖（纯 `moves` 命令调用，不依赖指针坐标）。

Phase 2 验收补完（分类/Topic 浏览、Story 时间线、相关内容）不新增 Prisma 模型、migration、合同或 API 端点，只把既有读能力接出 Web 入口：时间线投影（多来源成员 Revision/Observation 展平排序、TemporalValue 退化与无时间回退）由 `apps/web/src/lib/story-timeline.test.ts` 覆盖，相关内容组合（共享分类/共享实体的去重、排除当前 Story、5 条上限、单信号失败降级）由 `apps/web/src/lib/related-stories.test.ts` 覆盖；分类/Topic 筛选与 Saved View 条件回填属于 `apps/web/src/components/cosmos/feed-browser.tsx` 与 `apps/web/src/app/page.tsx` 的行为，浏览器侧由 `e2e/browser/phase2-organization.spec.ts` 覆盖（分类筛选 + 保存/套用带分类条件的视图、时间线事件、相关内容共享分类、Topic/Entity/收藏/收藏夹/批注流程与 Topic 成员改角色/移除/恢复）。

Entry↔Story 证据关系 v1（ADR-0011）的迁移为全新表（`20260909140000_entry_story_evidence_v1`），无旧数据 backfill，仍按门禁跑 fresh + 旧库 upgrade 两态。关联命令的幂等/覆盖写、指向自己主 Story 的 409、Story/Entry 双向投影、Story merge 的重定向与 self-link 清理、`moveEntryToStory` 后的冗余删除，以及旧库 upgrade 后新表可用与 `(entryId, storyId)` 唯一约束由 `packages/storage-prisma/src/entry-story-evidence.test.ts` 使用隔离库覆盖；`entryStoryRelationTypes` 枚举由 `packages/domain/src/index.test.ts` 覆盖，命令 schema 与读取侧放宽由 `packages/contracts/src/index.test.ts` 覆盖；transport 路径由 `packages/transport-http/src/index.test.ts` 覆盖，API 回执与 400/404/409 映射由 `apps/api/src/app.controller.story-domain.test.ts` 覆盖；浏览器侧由 `e2e/browser/phase2-organization.spec.ts` 覆盖（从另一条 Story 的条目添加证据、反向视图与解除）。

Story split v1（ADR-0012）的迁移为全新表（`20260909160000_story_split_v1`），无旧数据 backfill，仍按门禁跑 fresh + 旧库 upgrade 两态。拆分命令的显式映射校验（非当前成员/跨后继重复/自关联/未知实体或 Topic）、历史壳投影（`status`/`replacedBy`/可零成员）、四类关系只按显式清单迁移而用户状态留在壳、历史壳拒绝 merge/改 Revision/再次 split，以及旧库 upgrade 后零成员历史壳仍可读由 `packages/storage-prisma/src/story-split.test.ts` 使用隔离库覆盖；`SplitStoryCommand` 与 `StoryDetail` 新字段由 `packages/contracts/src/index.test.ts` 覆盖；transport 路径与请求体由 `packages/transport-http/src/index.test.ts` 覆盖，API 回执与 400/409 映射由 `apps/api/src/app.controller.story-domain.test.ts` 覆盖；组件实验室新增 Splittable/Historical shell 场景，浏览器侧由 `e2e/browser/phase2-organization.spec.ts` 覆盖（归并成双成员 Story 后拆分、壳视图与后继打开）。

Story subtype 受管注册表 v1（ADR-0013）无 Prisma schema/migration 变更，注册表是 `packages/domain` 的代码常量。注册项命名空间/唯一性、`checkStorySubtype` 的四类拒绝与 `listStorySubtypes` 的状态过滤由 `packages/domain/src/index.test.ts` 覆盖；写入侧「新赋值必须是该 kind 的 `active` 注册项、未注册旧值可原样保留、kind 变化或换值必须合法、后继不接受未注册 subtype」以及 kind/subtype 写回 Story 行由 `packages/storage-prisma/src/story-subtype-registry.test.ts` 使用隔离库覆盖（先红后绿：移除校验后 5 例全部失败）；目录 DTO 与查询 schema 由 `packages/contracts/src/index.test.ts` 覆盖，transport 路径与 kind 过滤由 `packages/transport-http/src/index.test.ts` 覆盖，API 目录页与 400 `validation_failed` 映射由 `apps/api/src/app.controller.story-domain.test.ts` 覆盖；组件实验室新增 Legacy subtype 场景，浏览器侧由 `e2e/browser/phase2-organization.spec.ts` 覆盖（改类型为媒体并选中「漫画」后徽章变化、API 提交未注册 subtype 返回 400 且 Story 不变）。

Story 用户状态迁移 v1（ADR-0020）无 Prisma schema/migration 变更（不建迁移账本、不迁 Checkpoint），迁移是既有行在一个事务内的改指与去重删除。只迁移 Story 级状态、家族内任意方向、命名不在来源 Story 上的行被拒、唯一键碰撞让目标侧优先、批注 `targetRevisionId` 不被改写、Entry 级标记完全不参与、空选择是 no-op 且不写事件，由 `packages/storage-prisma/src/story-user-state-migration.test.ts` 使用隔离库覆盖（7 例；先红后绿：短路迁移事务后 4 例失败，另 3 例断言拒绝与空选择 no-op，本就不需要迁移发生）；命令 schema 与结果 DTO 由 `packages/contracts` 覆盖，transport 路径由 `packages/transport-http` 覆盖，API 回执与 400/404/409 映射由 `apps/api/src/app.controller.story-domain.test.ts` 覆盖；路由表守卫 `apps/api/src/app.controller.route-table.test.ts` 的快照由 114 条更新为 115 条；浏览器侧并入 `e2e/browser/phase2-organization.spec.ts` 的拆分场景（拆分前留下标签与收藏 → 拆分后从壳迁到后继并核对两端 API 状态 → 反向迁回即撤销）；组件实验室沿用既有 `story-panel` 的 `split` 场景（该场景本就是历史壳），由 fixture 提供来源读取与提交回调，不新增场景。

Story 表示扩展 v1（ADR-0021）只在 `StoryRevision` 上新增两个可空列、不回填。组件实验室渲染见 `e2e/component-lab/story-edit-panel.spec.ts` 的 `default` 场景（时间范围两端与事实编辑器），阅读页侧的只读展示由 `e2e/browser/story-reading.spec.ts` 覆盖。**注意**：`e2e/browser/story-representation.spec.ts` 仍驱动切片 3d 之前的单页 UI（首页 feed 卡片 + `打开 Story` 抽屉），已随 Task 35 的 Follow-ups 记为待重写，当前不代表有效覆盖。

条目↔条目重复/转载关系 v1（ADR-0022）的迁移为全新表（`20260916140000_entry_relation_v1`），无旧数据 backfill，仍按门禁跑 fresh + 旧库 upgrade 两态。按无序对查找已有行带来的语义（对称类型反向提交命中同一行、改类型是覆盖写、有向反向提交与自关联 409、重复提交不追加事件、Story 成员行两侧方向相反、未知类型读侧降级仍不按对称排序、条目删除级联）以及 `mergeStories`/`splitStory` 前后关系逐字段不变，由 `packages/storage-prisma/src/entry-relation-domain.test.ts` 使用隔离库覆盖（12 例）；枚举与方向归一化由 `packages/domain/src/index.test.ts` 覆盖，命令 schema 与 `EntryDetail.relations` 读取侧放宽由 `packages/contracts/src/entry-relation.test.ts` 覆盖；transport 两条路径与写前拒绝由 `packages/transport-http/src/client-relation.test.ts` 覆盖，API 透传与 400/404/409 映射由 `apps/api/src/app.controller.entry-relation.test.ts` 覆盖，路由表守卫快照由 115 条更新为 117 条；方向措辞与对端候选过滤由 `apps/web/src/lib/entry-relations.test.ts` 覆盖，组件实验室渲染见 `e2e/component-lab/story-reading-content.spec.ts` 的 `entry-relations` 场景，浏览器侧由 `e2e/browser/phase2-entry-relation.spec.ts` 覆盖（归并出双成员 Story → 成员行标记转载 → 两侧徽章方向相反 → 刷新后仍在 → Feed 顺序与搜索结果不变 → 重复提交/反向/自关联/未知类型的 409、409、409、400 → 解除后两侧消失）。

用户真相保护 v1（ADR-0028）新增一次 migration `20260924100000_story_revision_producer`（`StoryRevision.producer` 加列 + 按 `story.revision_created.v1` 领域事件回填 `human`）。**这是 PRD §12 Phase 2 第 4 条与 LIB-003 的唯一验收层**：人工编辑过表示的 Story 在来源重发布该 Entry 后标题/kind/时间范围/关键事实逐项不变、人工 merge 出的多 Entry Story 在成员被重发布后同样不变、未编辑的 Story 仍跟随来源（保护没有把正常路径弄死）、`producer` 按写入方取值且冻结只在本该写入时记 `story.representation_projection_skipped.v1`，由 `packages/storage-prisma/src/story-human-protection.test.ts` 使用隔离库 + 真实 ingest 路径覆盖（4 例；先红后绿：实现前 2 例失败）；split 后继的 `producer = "human"` 由 `packages/storage-prisma/src/story-split.test.ts` 断言，`StoryDetail.story.producer` 的读取侧 schema 由 `packages/contracts/src/entity-relation.test.ts` 与 `packages/transport-http/src/client-story.test.ts` 覆盖；组件实验室新增 `human-protected` 场景（`e2e/component-lab/story-reading-content.spec.ts` 登记：成员行的「人工编辑过 / 系统创建」标记），阅读页侧的「自动更新已暂停」提示由 `e2e/browser/story-reading.spec.ts` 覆盖。

性能修复使用 Task 记录的确定性 seed 或本地生成器，数据位于 `.agent/tmp/`。修复前后必须使用同一数据形状、规模、环境、命令和测量口径并重复采样；墙钟阈值不进入默认 `bun run test`，优先用查询次数、查询计划/索引、复杂度或有界结果等确定性断言防回归。原始基准输出不入库，Task/PR 记录完整命令、数据规模、环境、样本统计、波动和结论。

## 文档治理

组件实验室的自动化验证分为两层。单元层比较 `apps/web/src/components/ui/*.tsx`、`apps/web/src/components/cosmos/*.tsx` 的公共组件模块与实验室注册表，拒绝未登记组件、不存在的模块、重复组件/场景 id、缺少默认场景、无效控件默认值和未登记 token；URL、localStorage 和 JSON 快照解析以 `unknown` 进入 Zod 边界，并覆盖非法输入不替换既有有效状态。该层属于默认 `bun run test` 与 CI Quality。

实验室新增或改变交互时必须在真实开发 Web 表面验证 `/dev/components`：组件/场景/视口/主题/配色 URL 可复现，前进后退正确，token 覆盖只影响预览画布，本地草稿可恢复，非法 JSON 导入保持原状态。浏览器验收覆盖 320、768、1024、1440 px、键盘与焦点、console、page error 和失败网络请求。生产 Web 还需在 build/start 后确认 `/dev/components` 返回 404，且实验室没有 Product API、SSE 或用户数据请求；开发态通过不能替代生产隔离验收。

外观主题回归边界：生产表面验证无存储时跟随系统、显式 Night 刷新保持并压过后续系统变化、“跟随系统”清除 key 后即时响应 `prefers-color-scheme`，以及 `<html>` 首帧属性正确；实验室表面验证同一持久偏好驱动 chrome，URL `theme/colorway` 仅控制预览根，token override 不泄漏。两类表面均监听 hydration/server-rendered HTML 匹配的 console/page error，并在 PC/平板宽度断言无页面级横向溢出；移动端 390px 随「移动端适配后置」（2026-09-17）暂停，见 `e2e/support/viewports.ts`。

`bun run docs:check` 要求治理入口存在、根 README 可达 Agent 治理入口，并锁定 canonical workflow 同时保留私密安全报告与普通非安全 Bug 的公开 Issue 路由。它检查根目录、`docs/`（排除原始需求与 research）、`.agents/`、`.local/README.md` 和 `.github/` 中活跃 Markdown 的相对目标文件或目录，并拒绝退休路径、反斜杠、仓库越界和 Windows 盘符绝对路径。query 和 fragment 不参与目标路径解析，门禁不校验标题锚点或代码行号是否存在。它不执行应用代码，也不替代类型检查、行为测试、构建或运行时验收；文档迁移和治理规则变更必须运行该命令。Markdown 结构、代码围栏和链接语义由 diff 人工审查，尾随空白由 `git diff --check` 检查。

## 隔离与进程

Node E2E 通过 `scripts/e2e/helpers.ts` 为每个场景创建 `.agent/tmp/<name>-<uuid>/`，分别放置 Data、Blob 和 Log Root，并调用 Prisma migration。API、Worker 和 Worker Admin 使用动态端口；测试不能假设 `9091` 空闲。Windows 停止进程树使用 `taskkill /t /f`，POSIX 使用进程组终止；所有测试在 finally 中停止服务。

受控 RSS recovery 使用 `scripts/e2e/controlled-rss.ts` 的真实 HTTP 请求、请求到达和 lease expiry 同步，不使用固定 sleep 伪造接管。验证从 API、SQLite、结构化日志和最终 Feed/Run 读取，不接受进程自报成功。

默认 ingest、scheduling、浏览器和 Windows smoke 通过受控本地 HTTP RSS 服务验证产品 `source.rss@1/fetch + feedUrl` 合同；Source 创建默认停用，测试必须再调用 activation command。`fixture-rss` 只保留在 Connector/迁移层测试，不得作为 Product API 或 Web 配置入口。

媒体获取测试使用 `fixtures/rss/basic.xml`（含不可达 enclosure 触发 `skipped`）和 `fixtures/rss/media-av.xml`（音视频 `metadata_only`）覆盖降级分支。Worker 通过 `COSMOS_MEDIA_ALLOWED_HOSTS` 环境变量放行测试媒体源，默认为空即拦截私网；该变量仅用于测试环境，不进入产品 Source 配置（ADR-0005）。

按来源的媒体策略 v1（ADR-0014）无 Prisma schema/migration 变更，策略写在 `Source.config.media`。上界与「只能收紧」由 `packages/contracts/src/index.test.ts` 覆盖（`sourceMediaPolicySchema` 拒绝超默认值/未知键/非法枚举，`rssSourceConfigSchema` 接受可选 `media`）；`resolveMediaPolicy` 的缺省与封顶、`images: metadata_only` 不触发下载、来源级文件/单次预算生效由 `packages/application/src/media-acquisition.test.ts` 覆盖（先红后绿：移除策略生效逻辑后 4 例失败）；「策略从 Run 的来源快照解析」由 `apps/worker/src/workflow-ingest.media.test.ts` 端到端覆盖（来源配置 `media.images=metadata_only` → 不发起媒体请求、asset 保持 `metadata_only`）；Web 表单的 MB 换算、收紧校验与摘要文案由 `apps/web/src/lib/media-policy.test.ts` 覆盖，组件实验室新增 Media policy tightened 场景，浏览器侧由 `e2e/browser/media-policy.spec.ts` 覆盖（超默认值本地拒绝、保存后刷新仍生效、关闭图片下载后新采集的图片保持元数据终态）。

媒体失败重试与保留期清理 v1（ADR-0015）新增一次 migration `20260909200000_media_retry_retention_v1`（`Asset.errorCode`/`attemptCount`/`lastAttemptAt`，无回填）。契约边界由 `packages/contracts/src/action.test.ts` 与 `index.test.ts` 覆盖（原因码受管枚举、retry 上限/保留天数边界、`AssetSnapshot` 新字段、retry outcome 的 BlobRef/errorCode 约束、`sourceFetchOutputSchema.mediaBytesUsed` 向后兼容）；错误码映射与 `retryAssets` 行为由 `packages/application/src/media-acquisition.test.ts` 覆盖；重试候选查询、原地改写不产生新 Revision、`(assetId, attemptCount)` CAS、保留期候选与「最后一个引用者才删字节」由 `packages/storage-prisma/src/media-retry.test.ts` 覆盖；「下一次采集自动恢复失败媒体」由 `apps/worker/src/workflow-ingest.media.test.ts` 端到端覆盖；清理端点由 `apps/api/src/app.controller.runs.test.ts` 覆盖（缺省 dryRun、确认命令、未知字段 400、未知 Run 404）；Web 表单与摘要由 `apps/web/src/lib/media-policy.test.ts` 覆盖。浏览器侧清理预览/确认流程见下方 E2E 清单。

浏览器 Stack 由 `scripts/e2e/web-stack.ts` 管理隔离 API/Worker/Next 进程。动态 API 端口在 Next production build 前注入，Web 使用 same-origin `/api` rewrite；需要先安装 Chromium：

```text
bunx playwright install chromium
```

测试监听 `pageerror`、未预期 console error 和网络失败，并在 teardown 清理全部子进程。截图和 trace 位于被忽略的 `test-results/`，不作为业务状态来源。

浏览器断网场景（`e2e/browser/offline.spec.ts`）使用本地受控 RSS 与本地 SVG 图片（`fixtures/rss/offline-media.xml`、`fixtures/rss/media/fixture-image.svg`），不依赖真实外网；Browser 栈通过 `COSMOS_MEDIA_ALLOWED_HOSTS=127.0.0.1` 放行该测试媒体源，Playwright 再以路由拦截模拟断网并验证站内 `/api/v1/assets` 图片加载。

安全漏洞的完整复现命令、载荷和原始证据只留在 `.agent/tmp/` 或批准的私密报告渠道。公开测试使用能证明授权、containment 或校验边界的泛化输入；Task、PR、截图和日志只写脱敏摘要，不能为了“完整命令”暴露漏洞细节。

## 可选验收

Docker 只通过显式命令执行：

```text
bun run test:docker
```

命令检查 Docker CLI/daemon，执行 `docker compose -f docker/compose.yml up --build -d`，等待 API/Web/Worker 与 Compose 内受控 RSS 服务，按 `source.rss@1/fetch` 完成激活、Run 和 Feed 验收，最后执行 `down --volumes --remove-orphans`。Docker 不属于 `test`、`test:e2e` 或默认 CI；缺少 Docker 前置时命令明确失败。

真实来源只通过显式命令执行，并且每种来源独立校验前置：

```text
COSMOS_REAL_RSS_URL=<url> bun run test:real:rss
COSMOS_ALLOW_REAL_NETWORK=true bun run test:real:aihot
COSMOS_ALLOW_REAL_NETWORK=true COSMOS_OPENCLI_PATH=<path> OPENCLI_PROFILE=<profile> bun run test:real:bilibili
COSMOS_ALLOW_REAL_NETWORK=true COSMOS_OPENCLI_PATH=<path> bun run test:real:bilibili-search
```

`test:real:bilibili` 是同一连接下的 hot+feed 双计划验收；`test:real:bilibili-search` 走 Bilibili 的第二个 operation（EXT-006），**不需要 profile**（搜索匿名可用），并断言读回的 `operationId` 与配置字段都在。

真实来源脚本使用隔离 API/Worker/SQLite，要求 Run 成功、item count 在 bounded 范围内并通过日志脱敏检查。缺变量、联网许可或 OpenCLI/Browser Bridge 前置时立即失败；这些命令不进入默认 CI，也不把网络错误解释为离线 Worker 回归。

### 受控 Story Agent 验收

[`story-agent-acceptance.ts`](../../scripts/acceptance/story-agent-acceptance.ts) 是需另获逐次授权的终端入口，不进入 CI，也不自动读取用户配置。先用 `bun run scripts/acceptance/story-agent-acceptance.ts --plan` 只读打印完整请求；此模式不读凭据、不建库、不联网。入口离线回归为 `bun run vitest run scripts/acceptance/story-agent-runner.test.ts`，使用真实 SDK 与 durable Host、合成 SSE，不能代替真实 Provider 或产品浏览器验收。

仅在明确批准本次 Provider/model、完整文本、预算、费用与留存后，由维护者在干净已提交工作区的真实本地终端运行 `bun run scripts/acceptance/story-agent-acceptance.ts`。输入包含当前提交号的二次确认，再无回显输入临时 API Key；不通过聊天、参数、环境变量或重定向提供凭据。入口只向计划中的固定端点发送最多一条 POST，不跟随重定向、不自动重试；生成截止时间 60s，SDK 取消收尾及隔离库准备不包含在该时间承诺内。遇到超时、失败或结果未知，不得未经新授权重跑。

每次新建 `.agent/tmp/task40-story-*` 隔离根，固定 schema/migration 来自入口声明的提交，显式 datasource 不读继承的数据库地址。成功生成仅保存 pending，再在该合成库拒绝，正式 Story 不变。保留数据库（含校验后的模型输出）、请求计划和固定字段结果，不记录原始 HTTP 响应/头或凭据。临时 SecretStore 为本地明文文件，Windows 权限仅尽力保护；正常/失败退出清理全部新 SecretRef 并断开数据库，准备失败删除本次新根；强制终止/断电仍可能残留，因此不在共享机器运行。此入口不部署产品、不升级用户库，也不证明用户环境已配置。

正文摘要与人工 Web 决定使用独立 [`story-body-acceptance.ts`](../../scripts/acceptance/story-body-acceptance.ts)：先运行 `bun run scripts/acceptance/story-body-acceptance.ts --plan` 披露合成来源全文、精确版本/块、实际提示词及同一模型/端点/预算。**实现与离线通过不构成真实调用授权**；须另获本次完整计划、费用与留存许可后，在干净已提交工作区的本地真实终端无参数运行。确认后、读凭据前本地重建 API。入队走真实 HTTP，生成复用现有 Worker Host/@2/SDK，但 Host 在入口进程中手动驱动，不是独立 Worker 进程验收。保留的请求计划含代码与 schema 提交号。

该入口不自动接受或拒绝：生成后核对 pending 时正式数据不变并立即删凭据，停止驱动 Host，再构建和启动仅 loopback 的生产 Web。维护者检查正文、输入版本和候选证据，手动决定并刷新，再在终端输入 `FINISH`；入口仅从 API 核对接受的正式标题/摘要/关键事实与新 Revision，或拒绝后的正式行不变。未决定退出保留 pending 并返回非通过；异常/取消关闭 API/Web、删凭据、断开库，不自动重试。生成 60s 不包含本地构建与清理，Provider 留存/费用未知及强杀残留风险同上；正文是合成 seed，不是真实来源 ingest 验收。

离线回归为 `bunx vitest run scripts/acceptance/story-body-runner.test.ts scripts/acceptance/story-body-acceptance.test.ts`。显式 `bun run scripts/acceptance/story-body-browser.offline.ts` 使用真实 API/生产 Web 和合成 SDK 响应自动点击决定（须先 `bun run build:api`），不调用 Provider、不读真实凭据；它仅证明产品接线，不是真人/真实模型验收。固定字段报告记录正文引用数与人工决定后的持久化核验，不据此自动判断摘要质量或关闭 Task。

## CI 分层

`.github/workflows/ci.yml` 将质量、Node E2E、浏览器 E2E 和 Windows smoke 分为独立 job。质量 job 依次执行 `bun run docs:check`、数据库检查、类型检查、单元测试、属性测试、Web lint 和构建；Node/browser/smoke job 分别报告自己的结果。当前 workflow 未按路径跳过 job，因此纯文档 PR 在远端仍运行完整默认 CI；本地最短路径只要求文档门禁、人工 diff 审查和 `git diff --check`。Docker 和真实来源没有加入默认 CI。

## 证据边界

测试通过只证明对应层的可观察合同：单元测试不替代进程 E2E，Node E2E 不替代浏览器验收，浏览器验收不替代 Docker 或真实来源。受控 RSS、SSE 消费和结构化日志是当前 Cosmos 的可复现测试边界；当前哪些层级已通过或未运行，以 [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md) 为准。本文不引入 Agent/LLM replay。**会「同一条用例既过又挂」的情况登记在 [`known-unstable-cases.md`](known-unstable-cases.md)**：报出某层绿灯前先看那里，已登记的不稳定用例不要用重跑结案。浏览器验收 33 条用例按「断言到底在查什么」分成产品契约 / UI 机制 / 外观三桶，见 [`browser-acceptance-triage.md`](browser-acceptance-triage.md)——**重做 UI 之前先看它**，避免把产品契约断言连同界面形状一起丢掉。
