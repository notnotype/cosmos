# Task 09：React 组件实验室

## User Request / Topic

用户要求搭建 Cosmos UI 组件调试实验室，并要求后续所有受管组件都能在其中调节。

已接受方案：[`docs/proposals/react-component-lab.md`](../../../docs/proposals/react-component-lab.md)。本次没有关联 GitHub Issue；用户在当前会话直接接受 Proposal，作为内部实现授权来源，不伪造 Issue 编号。

## Goal

建立仅开发模式可用的 React 组件实验室，让所有 `components/ui` 公共模块和无副作用 Cosmos 产品组件具有可复现、可调节、可分享且受 CI 约束的真实场景，同时保持产品页面的数据访问和运行时行为不变。

## Scope / Non-goals

范围：

- 组件/场景/控件/token/fixture 的静态注册合同；
- 注册表一致性、URL 会话和 JSON 快照的行为测试；
- `/dev/components` 开发态工作台；
- props、状态、主题/配色和已登记 token 调节；
- URL 分享、localStorage 草稿、JSON 原子导入/导出；
- 当前 8 个 shadcn primitive 与 5 个 Cosmos 展示组件场景；从首页提取的组件与实验室复用同一实现；
- 真实开发浏览器和生产 404 验收；
- 对应架构、测试、当前 Web spec、Task 和项目状态同步。
不在范围：

- 独立 React UI 包、npm 发布或跨仓库共享合同；
- NeuroBook/macOS/第三方主题或 `nb-ui` 源码与资产；
- Storybook、视觉快照托管平台或独立实验室应用；
- 任意 CSS、浏览器写源码、动态外部模块或代码执行；
- Product API、SSE、数据库、Blob/Artifact Root 或真实用户数据访问；
- Route、Layout、Provider、数据请求容器、测试 helper 和一次性内部实现登记；
- 改变 Product API、Transport DTO、Prisma schema、Worker 或现有首页业务语义；
- commit、push、PR、merge、发布、部署和 worktree 清理，除非分别获得授权。
## Current State
生命周期阶段：实现代码、产品接入、P1 修复、本地运行时验证和修复后五轴审查已完成；远端 CI run `32464307892` attempt 2 已验证通过。实现提交 `c130be8fba412dfdb1f5e2272ba3a579d30e63a8` 已 commit 并 push 到 `origin/feat/t09-react-component-lab`，PR #10 已创建且保持 OPEN；当前不执行 merge。

本 worktree 已实现静态 registry 与双目录登记门禁（8 个 `components/ui`、5 个 `components/cosmos`）、
URL 会话/浏览器历史、token 快照与 localStorage 草稿、开发态 `/dev/components`、生产 404、
五个无副作用 Cosmos 展示组件及首页复用。`page.tsx` 继续持有 HttpCosmosClient、SSE、
React Hook Form 提交、搜索/分页/Story 状态；实验室 fixture 不访问 Product API。

实现位于独立 `.worktree/react-component-lab` / `feat/t09-react-component-lab`；实现提交 `c130be8fba412dfdb1f5e2272ba3a579d30e63a8` 已 commit 并 push；PR #10 已创建并保持 OPEN；merge、发布、部署或 worktree 清理未执行。

- 继续以仓库内 shadcn primitive 源码为实现基座，不增加无意义的 Button 等转发包装层。
- 产品展示组件进入 `components/cosmos`，只接受 DTO/展示状态/回调，不导入 Product API client 或建立 SSE。
- 注册单位是公共组件模块，不是每个 export；Card 等组合模块由一个定义覆盖多个子组件和场景。
- 首期环境只提供 `cosmos` theme 与 `light`/`dark` colorway；这不是第三方主题包 API。
- 调节状态由 workbench 共同父组件控制；URL 和 localStorage 只作为外部系统同步，不复制第二份 React 真相。
- 开发路由由 Server Component 检查 `process.env.NODE_ENV`，非 development 直接调用 `notFound()`；client workbench 的 `useSearchParams()` 置于 Suspense 边界内。
- token 覆盖写在预览画布根节点，不写 `:root`，不污染实验室 chrome 或产品页面。
- 不新增 React DOM 测试依赖。纯合同使用 Vitest；真实组件交互、视觉、响应式和生产隔离使用浏览器/生产 smoke。只有实际复杂交互无法由浏览器验收稳定守护时再单独决定测试依赖。
- shadcn CLI `info --json` 在计划阶段确认当前栈，没有产生 lockfile diff；其输出的 “Saved lockfile” 是 CLI 依赖解析提示，不是仓库变更。

## Implementation Record（2026-08-20）

按 contract → workbench → adoption 顺序完成：

- Slice 1–2：8 个 UI primitive 与 5 个 Cosmos presentation module 的静态登记、URL 归一化、
  版本化 token snapshot、localStorage 损坏回退和原子 JSON 校验；
- Slice 3–4：开发 `/dev/components`、目录/画布/检查器、URL push/replace 历史、预览根 token
  覆盖、草稿恢复、导入/导出和生产 404；
- Slice 5：提取 `SourceForm`、`StatusSummary`、`SourceActions`、`FeedBrowser`、`StoryPanel`，
  页面继续独占 Transport/SSE/表单提交/搜索分页/Story 请求，实验室使用合成 fixture。

实现过程中修正两项行为证据：用户会话操作使用 `router.push` 以保留前进/后退；token 输入改为
本地临时值、失焦校验提交，避免合法中间值触发检查器重挂载并截断逐字符输入。
P1 修复（2026-08-21）：token 未编辑失焦保留持久 override；registry 现在校验控件默认值、场景值、select options、boolean 类型及 token 默认值；SourceForm fixture 使用 RHF `values` 使 Inspector props 实时同步。

已完成的运行时证据：实验室 URL 选择、前进/后退、props、Light/Dark、token 作用域与刷新恢复、
非法/合法 JSON 导入、320/768/1024/1440 视口、无 Product API/SSE 请求、五个产品组件 fixture、
生产 HTTP 404，以及既有 Playwright ingest → Feed → Story 流程。具体命令结果同步到本文末尾和
`PROJECT-STATUS.md`；Docker、真实来源、Windows smoke、发布和部署仍未运行。

## Source-verified Framework Constraints

- Next.js 16.3.1：`notFound()` 可在 Server Component 渲染路径抛出 404 并终止 segment；不需要 `return`。来源：<https://nextjs.org/docs/app/api-reference/functions/not-found>。
- Next.js 16.3.1：`useSearchParams()` 是 Client Component hook；静态生产构建使用时必须处于 Suspense 边界，否则构建失败。来源：<https://nextjs.org/docs/app/api-reference/functions/use-search-params>。
- Next.js 16.3.1：非 `NEXT_PUBLIC_` 环境变量只在服务端可读，`next dev` 缺省 `NODE_ENV=development`，其它 Next 命令缺省为 production。来源：<https://nextjs.org/docs/app/guides/environment-variables>。
- React：需要协调的组件状态提升到最近共同父组件；组件由 props 成为受控组件。来源：<https://react.dev/learn/sharing-state-between-components>。
- React：Effect 用于同步 browser API 等 React 外部系统；纯派生状态不应通过 Effect 再复制。来源：<https://react.dev/learn/synchronizing-with-effects>。

## Capability Map and Build Order

| 模块 ID | 责任 | 依赖 |
| --- | --- | --- |
| `component-lab-contract` | 定义受管组件、场景、控件、fixture、token、会话和快照合同；提供 CI 一致性检查 | 无 |
| `component-lab-workbench` | 实现开发态路由、目录、画布、检查器、视口、URL 会话、草稿和快照 | `component-lab-contract` |
| `cosmos-component-adoption` | 登记 primitive；提取并登记首页无副作用产品组件 | 前两者 |

实施顺序严格为 contract → workbench → adoption。每个模块内部再按下面的小切片执行 `RED → GREEN → REFACTOR → runtime VERIFY`。

## Implementation Slices

### Slice 0：实施基线与 worktree

- **生命周期阶段**：上下文与 Git 隔离。
- **目标**：从包含已接受 Proposal、稳定文档和 Task 的最新目标基线创建独立工作区。
- **可观察验收**：目标基线与 `origin/master` 关系明确；新分支名为 `feat/t09-react-component-lab`；工作树没有继承无关 dirty 改动。
- **依赖**：本计划获用户批准；当前治理提交和未提交治理改动已由其负责人完成、提交或明确排除。
- **预计核心文件**：无产品文件；仅 Git worktree/branch 元数据。
- **验证层级**：`git status --short --branch`、base SHA、worktree 列表。

### Slice 1：`component-lab-contract` 注册与门禁

- **生命周期阶段**：规格已接受，进入 RED/GREEN。
- **目标**：建立最小静态注册合同，并用失败测试强制受管组件模块与定义一一对应。
- **可观察验收**：
  1. 当前 8 个 `components/ui` 模块均有唯一定义、默认场景和至少一个关键状态场景；
  2. 删除定义、重复组件/场景 id、缺默认场景或引用未登记 token 时聚焦测试失败；
  3. 注册模块不导入 HttpCosmosClient、EventSource 或网络 fixture。
- **依赖**：Slice 0。
- **受影响合同**：Proposal `component-lab-contract`、架构 3.8、测试规范组件实验室单元层。
- **预计核心文件**：`apps/web/src/component-lab/contract.ts`、`registry.tsx`、`tokens.ts`、`registry.test.ts`，以及只为场景所需的 fixture 文件。
- **验证层级**：聚焦 Vitest RED/GREEN、typecheck、默认 unit 收集。

### Slice 2：URL 会话与 token 快照

- **生命周期阶段**：contract 的第二个行为切片。
- **目标**：把 URL query 和本地 token 草稿变成两个经过校验、可独立测试的边界。
- **可观察验收**：
  1. 非法/缺失 component、scene、viewport、theme、colorway 被归一化到注册表默认值；合法值序列化后可往返；
  2. 快照只接受版本、已登记 token 和该 token 的允许值，任何非法项使整份导入失败且旧状态保持；
  3. localStorage 损坏值可报告并回退，不进入组件 render 状态。
- **依赖**：Slice 1。
- **受影响合同**：Proposal URL/localStorage/JSON 边界。
- **预计核心文件**：`session.ts`、`snapshot.ts`、对应两个测试文件；不写 React UI。
- **验证层级**：聚焦 Vitest RED/GREEN、typecheck。

### Slice 3：`component-lab-workbench` 开发路由与基础工作台

- **生命周期阶段**：workbench 首个垂直切片。
- **目标**：用户能在真实开发 Web 打开实验室，选择组件/场景/视口并调节注册表提供的 props。
- **可观察验收**：
  1. `next dev` 下 `/dev/components` 显示目录、工具栏、预览画布和属性检查器，首个组件/场景可操作；
  2. component、scene、viewport、theme、colorway 与 URL 双向同步，刷新和前进/后退可复现；
  3. 键盘可达，320/768/1024/1440 画布稳定，console/page errors/network failures 为 0。
- **依赖**：Slice 2。
- **受影响合同**：架构 3.8、Proposal workbench 验收。
- **预计核心文件**：`app/dev/components/page.tsx`、`component-lab/workbench.tsx`、`lab-nav.tsx`、`lab-stage.tsx`、`lab-inspector.tsx`；必要 shadcn primitive 用 CLI dry-run/docs 后加入，单个组件源文件不计为新抽象。
- **验证层级**：聚焦逻辑测试、typecheck、lint:web、真实浏览器开发表面。

### Slice 4：token 草稿、快照与生产 404

- **生命周期阶段**：workbench 第二个垂直切片。
- **目标**：完成 token 调节闭环和生产隔离。
- **可观察验收**：
  1. token 覆盖只改变预览画布，实验室 chrome 和正常首页计算样式不变；
  2. 刷新恢复版本化 localStorage 草稿，JSON 导出可重新导入，非法导入不改变旧状态；
  3. `next build && next start` 后 `/dev/components` 返回真实 HTTP 404，且没有实验室 Product API/SSE 请求。
- **依赖**：Slice 3。
- **受影响合同**：Proposal token 与生产隔离、测试规范浏览器/生产层。
- **预计核心文件**：workbench/inspector、token override hook、开发路由及浏览器验收文件；不新增写文件 API。
- **验证层级**：聚焦测试、build:web、生产 start smoke、真实浏览器。

### Slice 5：`cosmos-component-adoption` 第一批产品组件

- **生命周期阶段**：保持首页行为的提取切片。
- **目标**：把首页展示从请求容器中分离，并让首页与实验室复用真实组件。
- **可观察验收**：
  1. `SourceForm`、`StatusSummary`、`SourceActions`、`FeedBrowser`、`StoryPanel` 均可用 DTO/展示状态/回调和合成 fixture 独立渲染；
  2. `page.tsx` 继续独占 HttpCosmosClient、SSE、React Hook Form 提交、搜索与分页状态，现有请求和文案语义不变；
  3. 五个产品组件均有正常、空/长文本及相关 loading/error/disabled 场景，并通过四档视口与键盘验收。
- **依赖**：Slice 4。
- **受影响合同**：Web 架构 3.8、当前 Web spec。
- **预计核心文件**：`components/cosmos/source-form.tsx`、`status-summary.tsx`、`source-actions.tsx`、`feed-browser.tsx`、`story-panel.tsx`、`app/page.tsx`、产品 fixture/registry。预计超过五个核心文件，因此执行时按 Source/Status → Feed → Story 三个连续小提交，不把页面一次性重写。
- **验证层级**：首页现有 Playwright ingest 流程、实验室浏览器场景、typecheck、lint:web、build:web。

### Slice 6：完成门禁、当前事实与五轴审查

- **生命周期阶段**：审查与交付。
- **目标**：证明组件登记长期门禁、开发表面和产品首页同时成立，并同步当前事实。
- **可观察验收**：
  1. 新增一个未登记的临时受管模块时聚焦门禁按预期失败，移除临时文件后恢复绿色；
  2. 默认 unit、property、typecheck、lint、build、现有浏览器产品流和实验室验收分别有准确结果；
  3. Web spec、测试规范、Task 和 `PROJECT-STATUS.md` 只记录实际实现与验证，不扩大到未运行 Docker/真实来源。
- **依赖**：Slice 5。
- **受影响合同**：`docs/spec/interfaces/0005-web-client.md`、`docs/testing/README.md`、本 Task、`PROJECT-STATUS.md`。
- **预计核心文件**：测试/CI（仅若默认测试无法收集门禁）、Web spec、本 Task、项目状态。
- **验证层级**：`bun run docs:check`、聚焦测试、`bun run test`、`bun run test:property`、`bun run typecheck`、`bun run lint:web`、`bun run build:web`、开发/生产浏览器验收、`git diff --check`。

## Checkpoints

### Contract checkpoint

Slice 1–2 完成后必须先审查注册合同和 schema。若需要任意 CSS、动态 import 或通用插件 API 才能继续，停止并回到 Proposal，不在 workbench 中临时扩权。

### Workbench checkpoint

Slice 3–4 完成后，实验室自身必须可用且生产 404。未通过前不开始拆首页，否则无法证明提取出的组件在真实调试表面可复用。

### Adoption checkpoint

每个产品组件小提交结束时，首页和实验室都必须实际渲染；不得先抽空页面再集中补场景。

## Verification

本轮已执行：

- `bun run test`：30 个测试文件、217 个测试通过；
- `bun run --cwd apps/web tsc --noEmit`：通过；`bun run lint:web`：通过；
- `bun run build`：通过，packages、API、Worker 和 Next Web 生产产物完成；
- `bun run test:browser`：1 个既有 Playwright ingest 流程通过（创建来源、录入、Feed、Story）；
- `bun run test:browser:component-lab`：4 个开发态 Playwright 回归通过，覆盖 SourceForm 的 `name`/`fixturePath` props 同步、SourceForm fixture 提交阻断、FeedBrowser 搜索提交阻断和 token 恢复后无操作失焦；
- 真实开发浏览器：实验室 URL/props/配色、前进后退、token 作用域/恢复/非法导入、五个产品 fixture、
  P1 修复回归、320/768/1024/1440 视口和无 API/SSE 请求通过；生产 `curl` 对 `/dev/components` 返回 HTTP 404；
- `bun run test -- apps/web/src/component-lab/draft.test.ts apps/web/src/component-lab/registry.test.ts apps/web/src/component-lab/snapshot.test.ts`：3 个文件、24 个测试通过，覆盖 13 个公共模块登记合同；

最终本地收口命令已通过：`bun run docs:check`（`failures=[]`、`checkedFiles=283`）、`bun run test:property`（3 files / 4 tests）、`bun run typecheck`、`bun run lint:web`、`bun run build`、`bun run test:browser`（1/1）、`bun run test:browser:component-lab`（4/4）和 `git diff --check`（无输出）。修复后五轴审查：Correctness、Readability、Architecture、Security、Performance 均通过；SourceForm 与 FeedBrowser fixture 提交阻断均有专用浏览器回归。
PR #10（OPEN，`https://github.com/notnotype/cosmos/pull/10`）已验证远端 run `32464307892` attempt 2（head `e3b75d132b086c57472035d0cd093a07594e05bc`）completed/success：Quality、Node process E2E、Browser E2E 和 Windows Node smoke 全部通过；Browser E2E 已执行 `bun run test:browser:component-lab`，各隔离下游 job 已执行 `bun run db:generate`。前一轮 run `32459370422` 的 Prisma Client 构建失败已由该 CI 修复后的远端通过结果闭环；attempt 1 曾因 5 个 Vitest 测试超出 5 秒超时而失败，重跑后通过；PR 保持 OPEN，当前不执行 merge。
`fixturePath` 任意路径属于 HEAD 既有基线风险，未纳入本轮 patch findings。

## Follow-ups

- 实现、CI 修复、PR Scope 和状态记录均已形成独立提交并 push 到 `origin/feat/t09-react-component-lab`；PR #10 已创建并保持 OPEN；远端 run `32464307892` attempt 2 全部通过，merge、发布、部署和 worktree 清理未执行。
- NeuroBook/macOS 主题、跨仓库 token、React UI 包和许可证边界仍需另行 Proposal。
