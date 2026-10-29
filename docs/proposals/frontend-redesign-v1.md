# Proposal：前端界面重做 v1（产品结构、版面骨架与视觉方向）

> 状态：**accepted**（维护者 2026-09-24 接受；授权更新稳定文档、创建 Task 35。未授权 commit、push、PR、merge、发布或部署，也未授权开始实现代码）
>
> 日期：2026-09-24（起点）
>
> 执行流程：[`../standards/frontend-design-process.md`](../standards/frontend-design-process.md)（v0.4，四层约 30 步）
>
> 需求真相源：[`../requirements/0001-original-requirements.md`](../requirements/0001-original-requirements.md) 的 2026-09-15 条目（界面职责、UI 文案、实现作废三轮原话）
>
> 前序与关联：[`ui-surface-ownership-v1.md`](ui-surface-ownership-v1.md)（accepted，信息架构）、[`ui-surface-ownership/attempt-and-void-2026-09-15.md`](ui-surface-ownership/attempt-and-void-2026-09-15.md)（上次失败记录与重做前置条件）、[`ui-copy-review-v1.md`](ui-copy-review-v1.md)（reviewing，文案判据与术语表）、[`neurobook-theme-system.md`](neurobook-theme-system.md)（accepted，现主题系统）、[`../../PROJECT-STATUS.md`](../../PROJECT-STATUS.md)（当前运维与验证边界）
>
> 分册：[`frontend-redesign/layer-0-product-structure.md`](frontend-redesign/layer-0-product-structure.md)（P0–P6 工作记录与现状证据）；[`frontend-redesign/layer-1-visual-design.md`](frontend-redesign/layer-1-visual-design.md)（V0/V3/V5/V6 完整规格）；[`frontend-redesign/layer-1-v4-design-system.md`](frontend-redesign/layer-1-v4-design-system.md)（V4 token 清单与组件规范）；[`frontend-redesign/layer-1-5-engineering.md`](frontend-redesign/layer-1-5-engineering.md)（E1–E7 工程决策）

## 这份文档是什么

维护者 2026-09-24 指令：**前端界面从 0 重新设计，技术栈底座仍为 React + Tailwind CSS，按 `docs/前端设计流程.md` 逐步讨论。**

流程 §11 原本规定「第 0 层不留档」，但同时自认两条后果：跨会话丢失、非目标无处安放。而 [`attempt-and-void-2026-09-15.md`](ui-surface-ownership/attempt-and-void-2026-09-15.md) 把「**版面骨架没被事先约定**」列为上次失败的第一号原因与重做前置条件。两者相权，维护者 2026-09-24 裁定：**第 0 层结论现在落档，后续各层结论追加到本文同一份**，不另建兄弟文档。

因此本文同时承担两个角色：**设计过程的工作记录**与**待评审的方案**。详细规格见分册；本文保留当前状态与有效决定。

## 问题

### 维护者的原始诉求（2026-09-15 验收原话，未改写）

> 上述功能基本完整，但是都没有完整独立UI，许多功能堆积到Story的UI面板中，这导致功能分散+Story UI混乱，让用户不知所措。一个好的UI应该本身就包含优秀的引导，不要让用户到处探索。UI方面还有一个严重的问题：文案太过于专业化，让用户有所疑惑。UI文案可以专业，但不能太专业，必须保证大部分正常用户能够一眼看懂。

> 这版的布局有问题。

> 整体布局不合理，导航栏出现在页面下方，侧边栏消失不见，后续我会重新进行UI设计，不用着急。

### 已经解决的部分

`ui-surface-ownership-v1`（accepted）冻结了**信息架构**：首页「看」/ 独立页面「管」/ Story「读这一条」三层分工，以及话题页、Entity 页、用户组织页三个新页面。`ui-copy-review-v1`（reviewing）已逐行裁定术语表。**这两块本次不重新推导。**

### 尚未解决的部分（本次要做的）

1. **版面骨架从未被约定**：导航与侧栏的跨页面位置、容器宽度、断点策略。上次由 Agent 自行发挥，结果导航落在页面下方、侧栏消失。
2. **视觉方向需要复审**：现有 NeuroBook 主题 + macOS 明暗配色是 accepted 决定；本次重做是否沿用未定。
3. **门禁对版面零覆盖**：浏览器验收只断言「点得通、文字在、无横向溢出」，从不断言导航与侧栏**出现在哪里**，绿灯不代表版面正常。
4. **搜索工作台长在首页正文里**：`apps/web/src/components/cosmos/feed-browser.tsx`（461 行）承载八个筛选维度、已保存视图、条件 chips 与分页，全部挤在首页。

## 目标与非目标

### 目标

1. **版面骨架先冻结再动页面**：导航位置、容器策略、断点策略写入稳定文档，实施时不再由 Agent 自行决定（上次失败前置条件 1）。
2. **补版面门禁**：断言主导航与侧栏在约定宽度下的**存在与位置**，让版面回归对门禁可见（上次失败前置条件 2）。
3. **建立页面级对象入口**：落地已 accepted 的三层分工，话题页 / Entity 页 / 用户组织页成为各自对象唯一的操作面。
4. **重新评审视觉方向**：NeuroBook + macOS 配色作为候选而非前提，走完整 V3–V6。
5. **界面文案服从已裁定术语表**：界面用「标签」「话题」等已定用户词，`Story`、`Entity` 保留英文。

### 非目标

- **不改变数据合同与业务语义**：本次是界面重做，不是领域重构；写操作调用同一批 Command。
- **不包含 Phase 3 对象**：Workspace、Artifact、知识管理者 Web Chat、Agent 调研页面一律不做（沿用 D5）。
- **不做移动端适配**：产品 PC 优先（维护者 2026-09-17 裁定），390px 断言维持暂停；1024 px 以下不做适配。
- **不做权限 UI**：单用户阶段按最大产品权限运行。
- **不做多语言 / 不引入 i18n 框架**（维护者 2026-09-24 复核后维持）。
- **不做批量操作**（PRD §8.2 提到的批量标签、收藏、导出）。
- **不做看板撤销**（维护者 2026-09-24 已裁定不需要，登记为额外需求）。
- **不重写产品定位与首页叙事**：那是产品文案，不是 UI 文案。

## 方案

### 第 0 层 · 产品结构（已定）

完整工作记录见分册 [`frontend-redesign/layer-0-product-structure.md`](frontend-redesign/layer-0-product-structure.md)。

| 步骤 | 结论 |
| --- | --- |
| **P0** | 重定版面骨架 + 重定视觉语言；受众沿用 PRD §3.1；成功 = 关键任务不迷路 + 版面门禁断言 |
| **P1** | 唯一交互角色是用户；系统/Agent 以「行内来源标记」可见 + 预留「系统产出」区 |
| **P2** | Phase 1–2 已交付能力为必做；Phase 3+ 不做，只留「系统产出」区作接口 |
| **P3** | 跳过（受众对同类工具已有稳定心智） |
| **P4** | 八项主导航、内容/管理两组、侧边栏内分组平铺直达；URL 层级 = 导航层级 |
| **P5** | 主循环：打开 → 扫看板 → 开 Story → 读完 → 就地做一件事；**关联就地、创建去对象页**；十项状态清单（权限不足 N/A） |
| **P6** | 版面骨架 = 顶栏 + 左侧栏常驻框架；Story 页唯一例外；首页纯看板；检索工作台搬 `/library` |

**路由表**：

```text
内容：/            首页看板
      /library     信息库与搜索
      /topics  /topics/:id
      /entities  /entities/:id
      /system      系统产出
管理：/organize    整理（标签/收藏夹/收藏/批注/已保存视图 五分区）
      /automation  自动化（来源/采集计划/连接/运行记录）
      /settings    设置
深入：/stories/:id Story 独立页面（不占导航项）
```

### 第 1 层 · 视觉设计（已定）

完整规格见分册 [`frontend-redesign/layer-1-visual-design.md`](frontend-redesign/layer-1-visual-design.md)。

- **V0**：气质为**分层——外壳仪器 + 阅读区书桌**；边界是「是否在读一条内容」。
- **V3**：概念「一张实验记录台」。8 个命名色（亮/暗）：画布底 `#f4f3ee`/`#141715`、卡片面 `#fffefb`/`#1c201d`、正文 `#1c1f1c`/`#e4e9e3`、次要 `#666a62`/`#939b92`、**强调墨绿 `#2c5f4f`/`#64ab8f`**、机器来源 `#8d5a20`/`#d0a054`、错误 `#9d3529`/`#df7a6c`、阅读面 `#fcfbf6`/`#191d1a`；另需 `on-signal`（亮白/暗深）。两个字族：界面用系统无衬线栈 11–14 px，内容用衬线（标题 30 px、导语 17 px、正文 16 px/1.8、行宽 ≤34em）。**不新增字体下载**。五条原则：颜色只编码信息、结构装置必须编码信息、两套密度一条边界、圆角两档、动效只回应人的动作。
- **V4**：token 结构与组件清单见下节。
- **V5**：用一次性探针出 12 张截图评审后删除；过程中发现并修掉两个真实缺陷（`@theme` 注入位置导致工具类不生成、暗色按钮对比度 2.3:1）。
- **V6**：对照五类 AI 生成设计特征逐条自查，已改掉一处（顶栏的 `A · B · C` 间隔号串）。复审清单：`feed-browser.tsx` 的「分类」与裸 `Topic` 违反术语表；首页徽标与副标题已过时。

#### V4 设计系统与组件库（已定）

完整 token 清单与组件规范见分册 [`frontend-redesign/layer-1-v4-design-system.md`](frontend-redesign/layer-1-v4-design-system.md)。

- **Token 结构收成一套轴**：删除 `colorway` 轴，改为单一 `data-cosmos-appearance="light|dark"`（O5）。
- **V3 配色正好装进 shadcn 语义层**：`canvas→background`、`surface→card`、`ink→foreground`、`graphite→muted-foreground`、`signal→primary`、`on-signal→primary-foreground`、`rule→border`、`alert→destructive`。**现有 primitive 与全部 Cosmos 组件不用改一行 class**。
- **新增 3 个 Cosmos 扩展语义**：`--marker` / `--marker-soft`（只用于系统与 Agent 产生的内容）、`--paper`（阅读区专用表面）。**人操作的地方用 `primary`，机器产生的东西用 `marker`**，两者不互相替代。
- **组件清单**：已有 8 个 primitive；**必做新增 8 个**——`dialog`、`alert-dialog`、`menu`、`tabs`、`toast`、`select`、`combobox`、`tooltip`；其余明确不做。基座为 Base UI + shadcn `base-nova`，走 `shadcn add` 生成。
- **来源与依据的显示**：行内标记用 `marker` 色；**置信度与依据放 tooltip**（键盘可达，且不得只在 tooltip 里放操作）。

### 第 1.5 层 · 工程决策（已定）

完整记录见分册 [`frontend-redesign/layer-1-5-engineering.md`](frontend-redesign/layer-1-5-engineering.md)。

| 步骤 | 结论 |
| --- | --- |
| **E1 技术选型** | 底座不变（Next 16 App Router + Tailwind v4 + Base UI/shadcn + RHF/Zod + `@dnd-kit`）；**不引入状态库、不引入数据获取库、不引入 i18n 框架** |
| **E2 前端工程架构** | 路由组表达外壳：`(shell)` 带侧栏、`(reading)` 仅顶栏；**SSE 连接与事件路由提升到外壳层，全程恰好 1 条连接**；页面 hook 统一返回 `{ data, loading, error, refresh, stale }` |
| **E3 接口约定** | 写入侧零新增；读取侧四个只读查询；一律沿用 `Page<T>` 分页；时间用 ISO 8601；错误按 `CosmosTransportError.status` 分类 |
| **E4 路由与权限** | 十项路由（URL 层级 = 导航层级，整理页分区用 query）；**不建权限体系**；实时刷新边界：列表静默重读、详情编辑中先问 |
| **E5 响应式** | 桌面三档断点（见下）；**1024 px 是支持下限**，更窄显示「窗口过窄」 |
| **E6 可访问性与文案** | 质量下限 + 关键路径键盘可达（不做完整 WCAG 审计）；**文案集中到 `src/copy/messages.ts`**，禁用词扫描写成测试；不做多语言 |
| **E7 性能与安全预算** | 首屏可交互 ≤ 2 s、路由切换 ≤ 300 ms、列表 20 条、**SSE 恰好 1 条**、事件 300 ms 合并、首屏 JS 增量 ≤ 30 KB（gzip）；外部内容一律纯文本渲染，禁止 `dangerouslySetInnerHTML` |

#### E5 断点策略（版面骨架的组成部分）

| 断点 | 宽度 | 悬浮侧栏 | 主内容区 |
| --- | --- | --- | --- |
| 紧凑 | 1024–1279 px | 176 px | 自适应（去掉 1080 上限） |
| 标准 | 1280–1439 px | 196 px | 限宽 1080 px 居中 |
| 宽屏 | ≥ 1440 px | 196 px | 限宽 1080 px 居中，两侧留白增加 |

低于 1024 px 不做适配，显示「窗口过窄」提示。阅读卡片限宽 640 px **三档都不变**（行宽是阅读舒适度约束，不随屏幕变宽而放宽）。

## 被推翻的既有决定

以下五项与已 accepted 的文档冲突，实施前须在稳定文档留注记，否则后续读者会读到过时合同：

| # | 原决定 | 现决定 | 原决定出处 | 理由 |
| --- | --- | --- | --- | --- |
| O1 | NeuroBook 主题 + macOS 明暗配色为已冻结视觉合同 | 由本 Proposal 的 V3 方向取代 | [`neurobook-theme-system.md`](neurobook-theme-system.md) | 维护者裁定本次重定视觉语言，并在三套候选配色中选定墨绿 |
| O2 | Story 以抽屉呈现 | Story 为独立页面 `/stories/:id` | [`ui-surface-ownership-v1.md`](ui-surface-ownership-v1.md) 第 3 层 | 维护者裁定整屏优先；形状（Story 是「读这一条」的独立入口）不变，仅呈现容器改变 |
| O3 | 信息库与搜索是首页正文里的页面级入口 | 独立页面 `/library` | PRD §8.2 落地形态、现有 `page.tsx` | 顶栏已有全局搜索，两处搜索框会造成重复入口 |
| O4 | 「新建标签留在 Story 抽屉、新建收藏夹迁出」的不对称 | 改为**对称**：两者都只在整理页新建 | [`ui-surface-ownership-v1.md`](ui-surface-ownership-v1.md) 接受时未冻结细节 | 维护者 2026-09-24 裁定；与「关联就地、创建去对象页」的归属规则一致 |
| O5 | 主题系统为 `theme × colorway` 两套轴（`neurobook` × `macos-light/macos-night`） | 收成单一轴 `data-cosmos-appearance="light\|dark"` | [`neurobook-theme-system.md`](neurobook-theme-system.md) | 维护者 2026-09-24 裁定；「未来可安装第三方主题」已在原 Proposal 的非目标中排除，两套轴失去预留对象 |

**未推翻的部分**：三层分工、三个对象页的存在、归属规则「关联就地 / 创建去对象页」、术语表 A–E 组裁定、单用户最大权限、PC 优先、「不做多语言」——全部继续有效。

## 影响

- **数据**：**无数据库结构变更、无 migration**。所有搬运都是「同一个写命令换一个界面发起」。
- **接口**：写入侧零新增。读取侧新增四个只读查询（话题成员标题、Entity 关联 Story 标题、收藏列表标题、跨目标批注列表）；均为「把已有数据取出来」，不动写入合同与持久化。新增前端路由不新增对外暴露的数据面。
- **安全**：无新增攻击面（不引入新依赖、不开新端口、不改转发边界）；外部内容一律纯文本渲染；Secret 值不进界面。
- **迁移**：无数据迁移。**界面迁移**纪律沿用 `ui-surface-ownership-v1`：同一件事只保留一个可写入口，不允许长期双写。主题轴收敛后 `localStorage` 存量取值按既有 `parseThemePreference` 回退 `system`，不需要迁移代码。
- **发布**：不涉及发布与部署，属既有后置债。
- **回滚**：回滚 = 代码回滚。因两个界面调用同一批命令，回滚不留下孤立数据。

## 验收草案（设计通过后归 Task）

- **真人验收（主）**：从空库出发走关键任务，不看任何说明；关键任务清单在 I0 与维护者共同确定。
- **版面门禁（新增，本次重点）**：① 八个页面在**三档断点**下主导航均在首屏且位置一致；② 约定出现的页面断言侧栏存在；③ `/stories/:id` 断言左侧栏**不存在**且返回入口存在（例外也要有断言）。
- **预算门禁（E7）**：SSE 连接数恰好 1 条；事件 300 ms 合并；首屏 JS 增量 ≤ 30 KB。
- **行为门禁**：正在编辑的详情页收到事件时表单内容不变且出现提示。
- **可观察的行为等价**：搬迁前后同一操作产生一致的数据与领域事件，用既有 Phase 2 浏览器套件回归证明。
- **文案行为一致性**：禁用词扫描测试通过；界面承诺必须在可达界面落地（判据 R5）。
- **明确不运行**：Docker/Compose、发布部署、真实来源联网、非 Windows 平台 smoke、390px 移动端断言（Phase 1 后置债划线不变）。

## 对稳定文档的预期改动（接受后执行）

- [`ui-surface-ownership-v1.md`](ui-surface-ownership-v1.md)：注记 O2、O3、O4。
- [`neurobook-theme-system.md`](neurobook-theme-system.md)：注记 O1 与 O5，标明主题系统已由本 Proposal 的 V3 方向与 V4 token 结构取代。
- [`../requirements/0002-product-requirements.md`](../requirements/0002-product-requirements.md)：§8.1–8.3、§8.5、§8.6 注记 v1 落地形态（页面清单与路由）；登记「系统产出」为 §8 的落地形态。
- [`../architecture/0001-cosmos-foundation/part-07-12.md`](../architecture/0001-cosmos-foundation/part-07-12.md) §11.4：补注记深入页 v1 落地范围与**版面骨架**（导航位置、容器策略、断点策略）。
- [`../api/`](../api/)：四个只读查询按 Draft 流程更新并补 conformance 场景（E3）。
- `docs/adr/`：**新增 ADR**「界面职责与入口 v1」——沉淀归属规则（看 / 管 / 读三层）、同一件事只有一个可写入口、对象名称即跳转、**版面骨架（顶栏 + 悬浮侧栏、Story 页例外、三档断点）**、视觉方向与双密度边界、外壳级单条 SSE 连接、Workspace/Artifact 页后置。一旦用户形成习惯，改回代价高，符合 ADR 触发条件。
- [`../spec/interfaces/0005-web-client.md`](../spec/interfaces/0005-web-client.md)：行为落地后更新为当前事实。
- `apps/web/src/component-lab/`：主题轴收敛后，`LabThemeId` / `LabColorwayId`、注册表 token 登记与 `theme.test.ts` 同步更新；新增的 8 个 primitive 必须同时提交实验室定义（CI 强制登记）。
- [`../testing/`](../testing/)：登记新增的版面门禁、预算门禁与禁用词扫描的断言类别与恢复条件。
- 新建或复用 Task（编号由维护者分配）记录实施切片；本文维持 `reviewing` 期间不改代码、不建 worktree。

## 待冻结项

1. **V1 低保真原型**：第 0 层已冻结版面骨架（等价于 V1 的骨架部分），逐页的线框未单独出图。
2. **V2 交互细节与状态设计**：十项状态清单与组件级状态要求已定，但**逐页的逐状态设计（空态文案、错误文案、加载骨架、边界情况的具体处理）尚未进行**。
3. **关键任务清单**（P0 成功指标的具体条目）在 I0 与维护者共同确定。
4. **侧栏「高度由内容撑开」的已知后果**（维护者明确选择，非缺陷）：八个导航项时侧栏约 370 px；**将来每增加一个导航项，卡片会长高、其下方内容位置随之变化**。若导航项数量增长到影响定位稳定性，再评估改为固定高度 + 内部滚动。
5. **E7 预算尚未实测**：首屏可交互时间、路由切换耗时、首屏 JS 增量都只是设定值，需在 I3 用真实数据验证或调整。
6. **三档断点未出图**：E5 的三档断点是文字规格，尚未像 V5 那样出截图验证（V5 只覆盖 1440 px）。

## 决策记录

| 日期 | 决策 | 决策者 |
| --- | --- | --- |
| 2026-09-24 | 指令：前端界面从 0 重新设计，技术栈底座仍为 React + Tailwind CSS，按 `docs/前端设计流程.md` 逐步讨论 | 维护者 |
| 2026-09-24 | 适用判断：多页面 / 有路由 → 四层全做；硬闸门确认（三层设计获批前不写代码） | Agent（依据流程 §0/§8） |
| 2026-09-24 | **P0 范围**：重定版面骨架 + 重定视觉语言；NeuroBook + macOS 配色降为候选 | 维护者 |
| 2026-09-24 | **P0 成功指标**：真人走关键任务不迷路 + 版面门禁断言 | 维护者 |
| 2026-09-24 | **P1**：行内区分内容来源 + 预留「系统产出」区 | 维护者 |
| 2026-09-24 | **P3 跳过** | Agent（依据流程 §0 裁剪依据，维护者未反对） |
| 2026-09-24 | **P4**：分组导航（内容 / 管理），侧边栏内分组、组内平铺直达 | 维护者 |
| 2026-09-24 | **P4**：Story 采用独立路由；呈现形式在追问「上下文指什么」后改为**独立页面**（非抽屉） | 维护者 |
| 2026-09-24 | **P5**：读完之后的动作**全部就地完成**；追问后明确为「关联就地、创建去对象页」，与 D2 一致 | 维护者 |
| 2026-09-24 | **P6**：版面骨架为顶栏 + 左侧栏常驻；顶栏搜索跳转信息库 | 维护者 |
| 2026-09-24 | **P6**：Story 页为唯一框架例外——隐藏左侧栏、保留顶栏与返回入口 | 维护者（Agent 指出与「侧栏消失」旧缺陷冲突后裁定） |
| 2026-09-24 | **P6↔E3**：四个数据缺口按「补齐四个只读查询」处理 | 维护者 |
| 2026-09-24 | **P6**：首页为纯看板，整套检索工作台搬到 `/library` | 维护者 |
| 2026-09-24 | **留档**：第 0 层结论现在落档，后续各层结论追加到本文同一份 | 维护者 |
| 2026-09-24 | Agent 落成本文档与第 0 层分册；未改稳定文档、未写产品代码、未建 worktree、未 commit | Agent |
| 2026-09-24 | **V0**：产品气质为「分层——外壳仪器 + 阅读区书桌」 | 维护者 |
| 2026-09-24 | **V3 字体**：中文正文用无衬线，衬线只用于标题与导语；不新增字体下载 | 维护者 |
| 2026-09-24 | **V3 版面修正四条**：配色太单一不合适；三块之间要留间隙；侧栏改悬浮卡片且高度由内容撑开；主内容区居中不占满 | 维护者（看首轮截图后） |
| 2026-09-24 | **V3 配色**：出三套对比后选定**墨绿**（亮 `#2c5f4f` / 暗 `#64ab8f`） | 维护者 |
| 2026-09-24 | **V3 阅读区**：卡片收窄到 640 px | 维护者 |
| 2026-09-24 | **V3 定稿**：亮色与暗色一并定，进 V4 | 维护者 |
| 2026-09-24 | Agent 出探针并发现两个缺陷（`@theme` 注入位置、暗色按钮对比度），修掉后重出图；探针在定稿后删除 | Agent |
| 2026-09-24 | **V4 token 结构**：收成一套轴，删除 `colorway`，改为单一 `data-cosmos-appearance="light\|dark"`（O5） | 维护者 |
| 2026-09-24 | **V4 组件清单**：必做新增 8 个 primitive；来源依据与置信度用 tooltip 显示 | 维护者 |
| 2026-09-24 | Agent 落成 V4 分册（token 清单与组件规范）；未改稳定文档、未写产品代码、未建 worktree、未 commit | Agent |
| 2026-09-24 | **E4 实时刷新边界**：列表静默后台重读；详情页正在编辑时不覆盖，改为提示由用户决定 | 维护者 |
| 2026-09-24 | **E6 文案**：维护者先选「上 i18n 框架」；Agent 指出与既有非目标冲突且代价与收益不匹配后，维护者改选**集中文案模块、不引入框架** | 维护者（经 Agent 质疑后修正） |
| 2026-09-24 | **E6 可访问性**：质量下限 + 关键路径键盘可达，不做完整 WCAG 审计 | 维护者 |
| 2026-09-24 | Agent 落成 E 层分册（E1–E7）；E5 断点策略同时写入本文；未改稳定文档、未写产品代码、未建 worktree、未 commit | Agent |
| 2026-09-24 | Agent 按文档治理把 V3 完整规格移入第 1 层分册（主文档一度越过健康区 9k token） | Agent |
| 2026-09-24 | **接受本 Proposal**（三层设计全部定稿）；授权更新稳定文档与创建 Task **35**（一个 Task 内部分切片）；未授权实现代码、worktree、commit、push、PR、merge、发布或部署 | 维护者 |

## 勘误（2026-10-03，不改写正文与分册）

| 指向 | 原文 | 现行取值 |
| --- | --- | --- |
| 第 1 层分册 §Type 与 §Layout（`layer-1-visual-design.md` 第 42、49 行） | 阅读区「正文列 34em 居中」「行宽 ≤ 34em」 | **废止行宽上限**：Story 阅读页正文跟着左栏撑满（维护者 2026-10-03 裁定）。其余页面的行宽判据不受影响——这条只在阅读页有消费者 |
| 第 1 层分册 §Layout（`layer-1-visual-design.md` 第 48 行） | 外壳「顶栏 56 px」 | **顶栏 64 px**，并与下方框架留 **2.5em（40 px）** 间隔、加 `--surface-toolbar` 底色（维护者 2026-10-03：太矮、间隔小、与页面底融为一体；间隔先定 16 px、再看一轮后加大到 2.5em）。浮卡侧栏与主内容限宽见下一行 |
| 第 1 层分册 §Layout（`layer-1-visual-design.md` 第 48 行）与第 1.5 层分册 §E5（`layer-1-5-engineering.md` 第 169–170 行） | 浮卡侧栏「196 px」 | **侧栏整体等比放大 1.5 倍 = 294 px**（维护者 2026-10-03）：宽度、内边距、行高、间距、字号、图标一起乘 `--nav-scale`（当前 1.5）。整组限宽同步 1120 → **1218 px**；**主内容区仍 880 px，行宽不随侧栏放大而变宽** |

理由与代价（行宽变长、1920 视口下正文实测 1070 px，每行约 67 个汉字）见 `.agents/tasks/36-reading-layout-and-object-details/walkthrough.md` Round 3。阅读页的落实现值与可断言合同以 [`docs/spec/interfaces/0005-web-client.md`](../spec/interfaces/0005-web-client.md) 为准。

理由与代价（行宽变长、1920 视口下正文实测 1070 px，每行约 67 个汉字）见 `.agents/tasks/36-reading-layout-and-object-details/walkthrough.md` Round 3。阅读页的落实现值与可断言合同以 [`docs/spec/interfaces/0005-web-client.md`](../spec/interfaces/0005-web-client.md) 为准。

## 后续追加位置

第 1 层剩余步骤（V1 线框、V2 逐状态设计）与 I0–I5 的结论**追加到本文**；本文接近 20~30 KB 或 9k token 时，把更早的过程记录整段移入 `docs/proposals/frontend-redesign/` 分册，原位留一行链接，当前状态与有效决定不切出去。
