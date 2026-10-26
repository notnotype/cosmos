---
parent: docs/spec/interfaces/0005-web-client.md
range: React 组件实验室
sealed_at: 2026-10-26
tags: [spec, web-client, component-lab]
tokens_est: 1840
---

## React 组件实验室

组件实验室是 `/dev/components` 下的开发工具，不属于 Product API 或产品导航。Server Component
先检查 `process.env.NODE_ENV`，非 development 调用 `notFound()`；开发态通过 Suspense 承载
使用 `useSearchParams()` 的 client workbench。实验室不创建 `HttpCosmosClient`、EventSource，
不读取 Prisma、SQLite、Data Root、Blob Root 或用户数据。

受管公共模块位于 `apps/web/src/components/ui/*.tsx` 与
`apps/web/src/components/cosmos/*.tsx`，每个模块在静态 registry 中有唯一 id、默认场景、
控件 schema、合成 fixture、token 子集和 render 目标。`registry-integrity.ts` 比较两个目录与
注册表，拒绝缺失、重复、无默认场景、缺控件值或未登记 token；当前登记 8 个 UI primitive 和
6 个 Cosmos 展示组件。

实验室全局 chrome 使用持久化外观偏好（`ThemeSwitcher`）；URL `appearance=light|dark`
只控制预览根节点，缺省确定性 `light`。

Task 35 之后**没有单一的数据请求容器**：`HttpCosmosClient` 与 SSE 在各自的边界上——client 由
`app/page-runtime.ts` 暴露，SSE 只在外壳的 `LiveProvider` 里开一条；数据状态按域分在
`app/home/use-*-workspace.ts` 五个 hook 里，每个页面只挂载自己那几个（`use-story-workspace`、
`use-feed-workspace`、`use-source-workspace`、`use-topic-workspace`、`use-entity-workspace`），
表单状态留在页面自己的 React Hook Form 实例里。无副作用展示组件只接收共享 DTO、展示状态和
回调：页面与实验室复用同一实现，实验室使用固定 synthetic fixture，不复制演示组件。

当前产品展示组件边界：

- `SourceForm`：接收来源表单 `UseFormReturn`、来源定义状态（含 manifest）、提交事件、
  测试回调与 probe 状态、目录重试回调，展示 catalog 加载/错误、Zod 字段错误、submitting
  状态与 probe 四态反馈；
- `StatusSummary`：接收 health、source summary 和 connecting/connected/unavailable 状态；
- `SourceActions`：接收 `SourceSnapshot[]`、run 回调与启用/停用回调（含进行中行 id），
  展示空、configured（含定时）、untimed（启用无定时）和 disabled 状态及行内启停按钮，
  每行解释启用徽章、定时语义、上次运行与最近错误；
- `FeedBrowser`：接收 Feed、Source、搜索表单、loading、cursor 与 Story 回调；
- `BoardView`：接收 `BoardDetail`、transport client、页面持有的 `feedSlot`/`sourceActionsSlot`（ReactNode 插槽）与 Topic 列表/打开回调，按 Section 顺序渲染可见 Block；首个可见 `feed` Block 渲染页面传入的完整阅读流，其余 Block 按 type 分发（`spotlight` 自取本 Board 的固定列表、`source-health` 渲染来源健康插槽、`topic-list` 渲染 Topic 列表、`collection` 自取收藏夹详情并渲染成员 Story）；未知 type 与悬空 `savedViewId`/`collectionId` 降级为占位，不阻断其它 Block（ADR-0010）。`editable` 打开编辑控件：分区标题/上移/下移/删除、区块拖拽排序/上移/下移/隐藏/复制/删除/跨分区移动/条数与绑定配置、添加区块与添加分区；非编辑模式下隐藏的 Block 完全不渲染（编辑模式保留“已隐藏”占位以便恢复）；
- `BoardBlockList`（`components/cosmos/board-sortable-blocks.tsx`）：编辑模式下包裹一个 Section 的区块列表，只提供 `SortableContext`、拖动按钮与逐区块的 `useSortable`；拖动上下文、浮层与落点解析由罩住整个看板的 `BoardDndProvider` 提供（同一文件），落点计算在 `board-drag.ts`（纯函数，含单测）。浏览模式不经过该组件；
- `StoryPanel`：接收 `StoryDetail`、关闭回调与 `onUpdateStoryRevision`/`onMergeStory`
  回调，展示 revision/observation 元数据与来源成员/操作区；回调由宿主注入（真实页
  面调用 transport client，组件实验室用 stub，不发 Product API 请求）。

首页（`/`）首载调用 `ensureDefaultBoard` 幂等 seed 默认看板并按 Board 树渲染；看板加载失败时主区回退为完整阅读流，不阻断阅读。Task 35 之后首页**只剩看板与系统产出**：页头、右状态栏、检索区与来源表单都已移除，检索整套搬到 `/library`，来源与采集计划的创建只在 `/automation`（ADR-0029 决策 1）；侧栏只有分组导航，不再承载服务状态、Entities 列表或表单。采集计划与 Topic 列表在对应 Block 内（区块 type 键仍为 `source-health`，显示标签为「采集计划」）。

实验室 URL 只保存 `component`、`scene`、`viewport`、`appearance`；非法值归一化并以
`replace` 修正，用户操作以 `push` 保留浏览器前进/后退。已登记 token 的临时输入在失焦时校验，
版本化快照写入 `localStorage`，JSON 导入整份原子校验；覆盖只写预览根节点的 inline custom
properties，不写 `:root`，因此实验室 chrome 与产品页面不受污染。

实现入口：[`apps/web/src/component-lab/registry.tsx`](../../../../apps/web/src/component-lab/registry.tsx)、
[`apps/web/src/component-lab/workbench.tsx`](../../../../apps/web/src/component-lab/workbench.tsx)、
[`apps/web/src/app/dev/components/page.tsx`](../../../../apps/web/src/app/dev/components/page.tsx)。
组件登记、URL/快照/草稿测试和实验室浏览器/生产验收边界见
[`docs/testing/README.md`](../../../testing/README.md) 与
[`Task 09`](../../../../.agents/tasks/09-react-component-lab/README.md)。
