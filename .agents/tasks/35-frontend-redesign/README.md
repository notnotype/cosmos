# Task 35：前端界面重做 v1（版面骨架、视觉方向与页面级对象入口）

> 编号 35 由维护者 2026-09-24 分配。**不复用编号 25**：`ui-surface-ownership-v1` 曾建议复用，但 25 已被作废分支 `feat/t25-ui-surface-ownership` 的「Task 25」占用，复用会让历史引用歧义。

## User Request / Topic

2026-09-24 维护者指令：

> @docs/前端设计流程.md 项目现在要从0开始重新设计前端界面，技术栈底座还是React + Tailwind CSS。按照流程一步步与我进行讨论。

执行依据 [`docs/standards/frontend-design-process.md`](../../../docs/standards/frontend-design-process.md)（v0.4）。流程 §0 适用判断为「多页面 / 有路由」→ 四层全做；§8 硬闸门为「三层设计获批前不写代码」。第 0、1、1.5 层走完后，维护者同轮**接受设计**并授权更新稳定文档与创建本 Task；**未授权**实现代码、worktree、分支、commit、push、PR、merge、发布或部署。

## Goal

把已冻结的三层设计落成可运行的前端：

```text
主题 token 换装（单一明暗轴）+ 版面骨架（顶栏 + 悬浮侧栏 + 路由组）
-> 8 个新 primitive 入库并登记组件实验室
-> 十个页面取代「单页 + 五个抽屉」：首页看板 / 信息库 / 话题 / Entity / 系统产出 / 整理 / 自动化 / 设置 / Story 阅读页
-> 补齐四个只读查询，使话题页、Entity 页、整理页有真实数据可渲染
-> 版面门禁 + 预算门禁 + 禁用词扫描上线，让版面和文案回归对门禁可见
```

## 权威合同

- Proposal [`frontend-redesign-v1`](../../../docs/proposals/frontend-redesign-v1.md)（**accepted**）与四份分册：
  - [`layer-0-product-structure.md`](../../../docs/proposals/frontend-redesign/layer-0-product-structure.md)（P0–P6、路由表、数据缺口）
  - [`layer-1-visual-design.md`](../../../docs/proposals/frontend-redesign/layer-1-visual-design.md)（V0/V3/V5/V6）
  - [`layer-1-v4-design-system.md`](../../../docs/proposals/frontend-redesign/layer-1-v4-design-system.md)（token 清单、组件规范）
  - [`layer-1-5-engineering.md`](../../../docs/proposals/frontend-redesign/layer-1-5-engineering.md)（E1–E7）
- ADR [`0029`](../../../docs/adr/0029-ui-surface-layout-and-visual-direction-v1.md)（界面职责、版面骨架与视觉方向）
- 信息架构：[`ui-surface-ownership-v1`](../../../docs/proposals/ui-surface-ownership-v1.md)（accepted，含 2026-09-24 勘误节）
- 文案判据与术语表：[`ui-copy-review-v1`](../../../docs/proposals/ui-copy-review-v1.md)（reviewing；术语表 A–E 组已逐行裁定）
- 组件实验室：[`react-component-lab.md`](../../../docs/proposals/react-component-lab.md)（accepted，CI 强制登记）
- 代码规模治理：[`code-size-governance-v1.md`](../../../docs/proposals/code-size-governance-v1.md)（accepted）

## Scope / Non-goals

Scope：

- **切片 1（地基）**：token 换装 + 主题轴收敛；`AppShell`（顶栏 + 悬浮侧栏）；路由骨架与两个路由组；外壳级单条 SSE 连接与事件→topic 映射。
- **切片 2（组件库）**：8 个 primitive 入库 + 组件实验室登记；`globals.css` 正式 token；三档断点的版面规则。
- **切片 3（页面搬迁）**：十个页面；四个只读查询（E3）；首页纯看板化；信息库独立成页。
- **切片 4（文案与门禁）**：集中文案模块 + 禁用词扫描测试；版面门禁（三档断点）；预算门禁（SSE 恰好 1 条、事件 300 ms 合并、首屏 JS 增量）。
- **文档**：行为落地后更新 `docs/spec/interfaces/0005-web-client.md`、`docs/api/`（四个查询）、`docs/testing/`、`PROJECT-STATUS.md`。

Non-goals：

- Phase 3 对象页面（Workspace / Artifact / 知识管理者 Web Chat / Agent 调研）——一律不做。
- 移动端适配（PC 优先已裁定）；1024 px 以下只显示「窗口过窄」提示。
- 权限体系与权限 UI（单用户最大权限）。
- 多语言 / i18n 框架（非目标维持；文案走集中模块）。
- 批量操作、看板撤销（后者已裁定为额外需求）。
- 发布与部署（既有后置债）。

## Current State

**Task 35 之后（2026-10-01）**：`apps/web/src/app/` 是外壳 + 十个路由——顶栏 + 悬浮侧栏
（`(shell)/layout.tsx`）与唯一例外 `(reading)/stories/[id]`；页面为 `/`（纯看板 + 系统产出）、
`/library`（信息库与检索工作台）、`/topics`、`/entities`、`/organize`、`/automation`、`/settings`、
`/system`、`/stories/:id`、`/dev/components`（实验室）。Story 抽屉已删除，阅读页是 Story 的唯一可写
入口；创建只在对象页、关联就地（ADR-0029 决策 1）。主题是单一 `data-cosmos-appearance`；SSE 在外壳层
且全程恰好一条；用户可见文案集中在 `src/copy/` 并有禁用词与内联文案门禁。三个原超线文件已回线内
（`board-view.tsx` 194 行桶文件 + 4 分片、`(shell)/page.tsx` 287 行、`story-panel.tsx` 删除、
实验室 registry 15 行）。未完成项与移交清单见 Follow-ups。

**评审当时的现状（Task 35 开始前，完整证据见第 0 层分册）**：

- 首页 `apps/web/src/app/page.tsx`（802 行）是唯一产品页面，Story / 话题 / Entity 都以抽屉盖在其上；无路由、无全局导航。
- 侧栏是首页正文网格的第二行，上方压着页头和搜索区——上次「导航落在页面下方、切页后侧栏消失」的结构成因。
- 三个文件在代码规模红线内：`page.tsx` 802 行、`board-view.tsx` 917 行、`story-panel.tsx` 815 行；`product-fixtures.tsx` 42.9 KB。**本次必须让被重做的文件回到线内。**
- `components/ui/` 只有 8 个 primitive；无 dialog / menu / tabs / toast / select / combobox / tooltip。
- `client.openEventStream()` 每次调用新建一个 `EventSource`；当前只在首页订阅一次，六个事件类型每个都触发全量重读 Feed + 采集计划。
- 主题为 `data-cosmos-theme="neurobook"` × `data-cosmos-colorway="macos-*"` 两套轴。

## Decisions and Deviations

- 本 Task 的**全部设计决定**来自已 accepted 的 Proposal 与 ADR-0029，不在实施中重新决定。实施若发现设计缺陷，按 [`repository-workflow.md`](../../../docs/standards/repository-workflow.md) 回到 Proposal 修订，不就地打补丁。
- **已知代价（维护者明确选择，非缺陷）**：悬浮侧栏高度由内容撑开，将来每增加一个导航项卡片会长高、其下方内容位置随之变化。
- **唯一框架例外**：`/stories/:id` 隐藏左侧栏。必须有对应门禁断言，否则会被读成「侧栏消失」回归。
- **不得复制探针做法**：V5 探针用任意值语法 `bg-[var(--p-*)]` 是因为 Tailwind v4 的 `@theme` 不能写在运行时注入的 `<style>` 里；**正式 token 必须写进根布局导入的 `globals.css`**。

## Implementation Walkthrough

按切片顺序推进；每切片的 RED/GREEN、实际命令与结果、偏差写入 [`walkthrough.md`](walkthrough.md)（唯一过程记录位置）。
### 切片 1 · 地基 / 切片 2 · 组件库

两片的实施与验收记录已移入分册 [`README/slices-1-2.md`](README/slices-1-2.md)。
### 切片 3 · 页面搬迁 / 切片 4 · 文案与门禁

两片的逐片记录（判据、状态、与原文的差异、门禁落点）已移入分册
[`README/slices-3-4.md`](README/slices-3-4.md)。**当前结论**：两片的全部判据均已达成——
切片 3 的 3a①-③、3b①-③、3c①-②、3d①-③、3e①-③，以及切片 4 的五项（集中文案与禁用词、
版面门禁、预算门禁、行为门禁、V6 复审清单收口）都有证据；未完成项、移交新 task 的四项与
审查留下的可选改进见 Follow-ups。

## Verification

分四层报告，不互相替代：聚焦测试 → 全量测试与类型检查 → 浏览器验收（含新门禁）→ 真人验收（关键任务不看说明走一遍）。

**当前四层状态**（Round 13 收尾，2026-10-01）：

| 层 | 状态 | 证据 |
| --- | --- | --- |
| 1 聚焦测试 | ✅ | 各切片按域跑（文案门禁 5 条、合并窗口、实验室 21 条） |
| 2 全量测试与类型检查 | ✅ | `bun run test` 137 文件 / **785 用例**；`bun run typecheck` 0 错误；`bun run lint` 0 error |
| 3 浏览器验收（含新门禁） | ✅ | **全量 `playwright test` 51 通过 / 0 失败**；实验室 21 通过；`bun run test:e2e` 6 文件 / 12 用例 |
| 4 真人验收 | ⚠️ **部分** | 6 条关键任务中 1/2/3 通过；4/5/6 因 Story 页排版问题延后到新 task（维护者裁定） |

**独立五轴审查已完成**（Round 13，只读审查者，`612bc87..HEAD` 179 文件）：无 Critical、安全轴无发现；
**4 条 Required 已全部修复**（禁用词门禁不覆盖 `copy/**`、同页两个收藏写入口、占位页显示裸 ID、
预算门禁量绝对值而非增量），其余 Optional/Nit 与覆盖缺口进 Follow-ups。

**关键任务清单**（P0 成功指标的具体条目）**已于 2026-10-01 与维护者冻结**。判据来源：维护者在设计流程 P0 环节选定的成功指标「**真人走一遍关键任务不迷路 + 版面门禁断言**」（[`0001-original-requirements.md`](../../../docs/requirements/0001-original-requirements.md) 的 2026-09-24 条目），任务内容取自 PRD §9 在 Phase 2 范围内的用例（UC-02 / UC-05 / UC-06 / UC-07）。

| # | 任务（用户视角） | 起点 | 通过判据 | 对应 |
| --- | --- | --- | --- | --- |
| 1 | 看一眼今天有什么 | 首页 | 不靠说明就能分辨哪些是系统/Agent 产出的；能一步进信息库 | UC-05 |
| 2 | 配一个来源并让它跑起来 | 任意 | 自己找到配置位置 → 建计划 → 启用 → 手动录入 → 在信息库看到内容 | UC-06 |
| 3 | 按标签筛一遍并留住条件 | 任意 | 找到标签筛选 → 筛出结果 → 保存成视图 → 清除筛选恢复全量 | UC-05 ① |
| 4 | 读一条内容并判断可信度 | 任意 | 看到时间线、来源成员（系统/人工标记）、关键事实及其出处；相关内容不伪装成同一事件 | UC-02 ③、UC-07 ④ |
| 5 | 把两条内容合成一条、再拆开 | 任意 | 找到「编辑与关联」→ 归并后成员变 2 → 拆分出后继并留下历史壳 | UC-07、§8.3 |
| 6 | 给内容打标签、写批注、加入话题、关联 Entity | 任意 | 能挂到已有对象上；新建话题/Entity/标签/收藏夹知道该去对象页 | UC-07 ③ |

每条只记三件事：① 不看说明能否找到入口（「不迷路」判据）；② 做完是否看到预期结果；③ 中途有没有出现让人怀疑「我是不是点错了」的地方（原话记录，这类最有价值）。**结果与偏差记在 walkthrough，不回改本清单。**

未运行项、已知限制与失败现场按 [`docs/testing/README.md`](../../../docs/testing/README.md) 记录；每个切片完成时在本 Task 的 `walkthrough.md` 追加实际命令、结果与偏差。

## Follow-ups

- **V1 线框与 V2 逐页状态设计未做**：骨架已冻结，逐页的空态/错误/加载文案在实施各页时确定并回填 Proposal。已知缺口之一：`/library` 没有**页级**标题（其余九页都有；它只有阅读流自己的 `Story Feed` 小标题），等 V2 决定它的页头形状。
- **`/topics/:id` 与 `/entities/:id` 详情页仍是占位**（Round 8 补了占位路由，不再 404）：话题改标题与目的、成员改角色/移除、Entity 别名与关系、解除关联都还没有归属页面（3b/3c 的创建入口已在对象页补上，Round 7）。
- **3b 验收 ③ 的回归证据已补齐**（Round 8）：旧 Phase 2 浏览器套件按新 IA 重写后全绿，
  含「录入→阅读→改标题→归并」的服务端落库断言。
- **旧浏览器套件已按新 IA 重写**（Round 8）：20 个 spec 里 **16 个**曾驱动已删除的旧单页 UI
  （Story 抽屉、首页来源入口、首页检索区、连接面板、存储面板、旧主题两套轴）。
  现在全部搬到新 IA 并通过；判定口径见 walkthrough Round 8——**按关键词筛陈旧 spec 不可靠，
  只有跑一遍全量才算数**（我按关键词筛过两次，分别得出 6 个和 12 个，实际 16 个）。
- **首页来源表单的残留**：`(shell)/page.tsx` 仍挂载 `useSourceWorkspace`（只为看板的「采集计划」
  区块），并因此需要一个从不渲染的 `sourceForm` 实例。hook 把「来源表单」与「计划列表」两类关注
  捆在一起，值得拆开。
- **文案组件级 772 处未迁**：`copy/inline-copy-baseline.json` 只减不增，新增内联文案已被门禁拦住；
  剩余集中在 `components/cosmos/**`（board-view 分片、collection-plan-list、connection-panel、
  source-form、story-panel 子区块、topic/entity panel）与 `lib/**`（media-policy、story-time-range-draft 等）。
- **编辑中的详情页不被事件覆盖（切片 4 行为门禁）已在 Round 9 落地**：阅读页订阅 `stories` topic，
  未编辑时静默重读、编辑中只提示「有新变化，重新读取？」。门禁 `story-live-refresh.spec.ts`。
- **话题与 Entity 的详情页未建**（见上）；**标签目录读取**已在 Round 8 补进阅读页与信息库
  （此前 Story 页无法打标签、信息库无法按标签筛选）。
- **「并入本 Story 的 Story ID」是判据 R3 的违规**：要用户粘贴内部编号才能归并。
  改成可搜索的选择列表需要新增「可作为归并目标的 Story 列表」只读查询，
  `ui-copy-review-v1` 明确不夹带进纯文案批次；已登记为禁用词门禁的例外（带理由）。
  **2026-10-01 维护者裁定：归到「Story 页排版」新 task 同批处理**（两者都在 Story 页上，
  4/5/6 的人工复验也要等那一轮，同批只需复验一次）。
- **真人验收发现的三条交互缺口（2026-10-01 维护者裁定：本 task 只记录，不在本 task 修）**：
  ① `/automation` 的「新建计划」应改成**模态框**；② 「创建连接」同样改成按钮 → 模态框 → 表单 →
  确认/取消，并把现在的连接表单位置改成**连接列表（要有空状态）**；③ 采集计划列表行的操作按钮
  （启动/暂停等）**只有图标没有文字，需要 tooltip**。
- **跨目标批注列表的标题投影已在 Round 10 补齐**：`Annotation` 增加读取侧 `targetTitle`（目标已删除为
  `null`），整理页显示「（目标已不可读）」。收藏与批注共用同一个批量解析器，不再各写一份。
- **标签改名仍缺**：`updateLabel` 这条命令在合同、应用端口、仓库与 API 里都不存在，界面因此没有入口。
  补它是一条完整竖切（合同 + 命令 + 领域事件 + 路由 + 界面 + 测试），不是纯界面工作。
  （收藏夹改名与改描述已在 Round 11 补齐；收藏夹加成员按 ADR-0029 §3 属 Story 页的关联动作，不是缺口。）
- **全量跑的偶发**：`phase2-organization` 的 feed 区块用例曾在一次全量里单独挂过（单跑与随后两次全量
  都通过，未定性）；`layout-and-budget` 的「断言有效性自证」同类偶发已用 `expect.poll` 修掉（Round 11）。
  门禁里还有未定性的偶发这件事本身值得盯着。
- **`docs/spec/interfaces/0005-web-client.md` 已同步到当前行为（2026-10-01），但已 59.5 KB**：它在
  `docs-baseline.json` 里是存量登记债，本轮为同步新 IA 又增了约 3 KB。建议按文档治理拆成
  「外壳与路由 / 各页行为 / 主题与实验室」三册；拆分前它的增长只报 warning。
- **实验室夹具仍超线**：`component-lab/product-fixtures.tsx` 42.9 KB / 1192 行在基线里（存量债）。
- **独立审查留下的 Optional/Nit（Round 13，未修）**：① 纯拉丁禁用词对内联文案仍不可达（`copy/**`  已覆盖）；② 「取消收藏」与「删除已保存视图」各有两个入口（收藏夹加成员那条已说明，这两条未登记取舍）；
  ③ 实验室登记门禁（CI 强制）不扫本 Task 新增的 `components/shell/**`（5 个文件）；
  ④ 事件合并窗口是**去抖**不是节流，同一 topic 持续高频事件时永不 flush（无 maxWait）；
  ⑤ 点「重新读取」靠换 `key` 重挂载编辑面，副作用是编辑面连带收回折叠态；
  ⑥ 路由切换预算余量只有 2.7×（首屏那条 12.6×）；⑦ `listAnnotations` 只给 `targetType` 时静默降级成
  「列出全部」（fail-open，当前无调用方踩到）；⑧ 40+ prop 压成一两行，行数达标但可读性下降；
  ⑨ `live-provider` 的 context value 未 memo。
- **独立审查指出的测试覆盖缺口（Round 13，未补）**：① 「编辑中不被覆盖」只验了标题一个字段，
  另四份草稿（类型/细分类型/时间范围/关键事实）无门禁；② 「SSE 恰好 1 条」未覆盖唯一例外路由
  `/stories/:id`，300 ms 合并也只有假定时器单测、无端到端证据；③ 「不把裸 ID 当标题显示」在 storage
  单测里 entry 那一类的期望值恰好等于裸 ID（无法区分「解析出的标题」与「回显 ID」）；
  ④ 「外部内容按纯文本渲染」没有载荷 fixture，目前只有代码阅读作证；⑤ 「断言有效性自证」证明的是纯函数
  而不是定位器接线；⑥ `e2e/` 与 `scripts/` 不在 `bun run typecheck` 覆盖内。
- **E7 的「增量 ≤ 30 KB gzip」已在 Round 12 实测**：回基线提交 `da147a5` 构建后与当前版同口径对比，
  首屏 JS 由 298.1 KB 降到 **289.7 KB（−8.4 KB，在预算内）**。**口径提醒**：必须量到 `load` 事件为止；
  新外壳的导航预取会在 `load` 之后再加 7 个脚本（+73.5 KB），等几秒再量会得出「重了 65 KB」的错误结论。
- **docs 侧存量债**：`Phase-2-UNDO.md` 与 `docs/proposals/ui-surface-ownership-v1.md` 已登记进
  `docs-baseline.json`（越过 9k token 警戒线，本轮之前就存在）；前者是历史回滚记录，
  后者在信息架构收口后应缩回并移除登记。
- **侧栏高度代价**：导航项增长到影响定位稳定性时，按 ADR-0029 的 Revisit Gate 重新评估。
- **四个只读查询**：落地后 `docs/api/` 与 `docs/spec/` 同步。
