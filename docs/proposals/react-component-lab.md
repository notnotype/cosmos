# React 组件实验室

## 状态

`accepted`

## 问题

Cosmos 当前 Web 使用 React 19、Next.js App Router、Tailwind CSS v4、shadcn `base-nova` 和 Base UI。基础组件位于 `apps/web/src/components/ui/`，当前产品页面的大部分展示与数据请求仍集中在 `apps/web/src/app/page.tsx`。

现有代码缺少一个稳定表面来独立观察组件的 props、状态、响应式边界、主题语义和设计 token。组件只能在真实页面与 API 状态中调试，会带来三个问题：

1. 组件边界状态难以稳定复现，例如长文本、空态、错误、加载、禁用、无效和窄屏；
2. 视觉调整容易直接落入页面 class，无法证明对其它组件和主题状态的影响；
3. 后续新增组件是否覆盖必要场景只能靠评审记忆，容易遗漏。

## 目标

建立一个长期维护的 React 组件实验室，供 Cosmos 前端开发者和评审者使用：

- 开发模式通过 `/dev/components` 独立预览可复用组件；
- 所有 `components/ui` primitive 和无副作用的 Cosmos 产品组件都登记可复现场景；
- 调节组件 props、交互状态、主题、配色和已登记设计 token；
- 组件、场景、视口、主题和配色写入 URL，形成可分享状态；
- token 草稿保存在浏览器 localStorage，并支持导入、导出 JSON 快照；
- CI 自动拒绝未登记组件、重复 id、缺少默认场景和非法 token；
- 实验室与真实产品复用同一组件实现，不维护演示副本。

## 非目标

- 不建立独立 React UI 包或发布 `@notnotype/nb-ui-react`；
- 不引入或派生 NeuroBook `nb-ui` 源码、CSS、主题资源或组件合同；
- 不在本轮接入 NeuroBook、macOS 或第三方主题；
- 不替换现有 shadcn/Base UI primitives；
- 不开放任意 CSS 编辑器；
- 不从浏览器直接写入源码；
- 不为 Route、Layout、Provider、数据请求容器或一次性内部 helper 创建场景；
- 不连接 Cosmos API、SSE、数据库、Blob Root 或用户数据；
- 不建立视觉快照基线平台或发布独立实验室应用。

## 当前行为与证据

- `apps/web/components.json` 使用 `base-nova`、Base UI、Tailwind CSS variables 和 lucide；
- `apps/web/src/app/globals.css` 维护当前亮暗语义色、半径和字体映射；
- `apps/web/src/components/ui/` 当前包含 Button、Badge、Card、Field、Input、Label、Separator 和 Textarea 等 primitive 模块；
- `apps/web/src/app/page.tsx` 同时负责 Product API/SSE 状态与 Feed、Source、Search、Story 等界面展示；
- `docs/spec/interfaces/0005-web-client.md` 将当前 Web 定义为单个 client-side 页面，并明确 UI 只通过 Transport 访问产品能力；
- 当前没有组件注册表、组件场景、开发态实验室路由或组件登记 CI 门禁。

## 原始需求与方案形成

2026-08-20，用户原话确认的需求是：搭建 Cosmos UI 组件调试实验室，后续所有组件都需要能在其中调节。

本轮对话中，用户通过交互选项选择了 Agent 提出的以下方向；这些选项的完整实现后果已随本 Proposal 的整体接受生效：

- “属性、状态与 Token”；
- “可复用 UI 与产品组件”；
- “仅开发模式”；
- “URL 加本地草稿”；
- “CI 强制登记”。

下文是 2026-08-20 被整体接受的方案。接受前它们不是当前产品、架构或实现合同；接受后由稳定架构、测试规范和实施 Task 承接。

## 能力地图

| 模块 ID | 责任 | 依赖 |
| --- | --- | --- |
| `component-lab-contract` | 定义受管组件、场景、props 控件、fixture、token 和覆盖门禁；提供注册表类型与一致性检查 | 无 |
| `component-lab-workbench` | 实现开发态路由、目录、画布、视口、URL 会话、token 草稿、JSON 快照和生产 404 | `component-lab-contract` |
| `cosmos-component-adoption` | 登记现有 primitive；从 `page.tsx` 提取无副作用产品组件并登记真实场景 | `component-lab-contract`、`component-lab-workbench` |

构建顺序：`component-lab-contract` → `component-lab-workbench` → `cosmos-component-adoption`。用户在本轮对话中先选择“批准能力地图”，随后通过接受本 Proposal 使模块职责、依赖和验收正式生效。

## 方案

### 1. 继续以 shadcn 为组件实现基座

Cosmos 继续维护 `components/ui/*` 中的 shadcn 源码。实验室消费真实组件，不增加只转发 props 的包装层。产品展示组件进入 `components/cosmos/*`，负责稳定的 Cosmos 语义和组合边界。

产品组件只消费 Cosmos/shadcn 语义 token；不引用 NeuroBook 私有变量，不写与主题绑定的字面颜色。后续换色、圆角、密度或字体优先修改全局 token 和 primitive，产品组件不随之重写。

### 2. 以公共组件模块作为登记单位

CI 管理以下目录中的公共组件模块：

- `apps/web/src/components/ui/*.tsx`；
- `apps/web/src/components/cosmos/*.tsx`。

每个公共模块恰好对应一个实验室定义。一个模块可以导出组合所需的多个子组件，例如 Card 模块的一组结构组件，由同一个定义中的多个场景覆盖。测试文件、类型文件和显式标记为内部实现的文件不进入公共模块目录。

每个实验室定义至少包含：

- 稳定、唯一的组件 id；
- 分类和用户可见名称；
- 默认场景；
- 一个或多个固定 fixture 场景；
- 可调 props/状态 schema；
- 可调节的已登记 token 子集；
- 预览目标和支持的视口。

### 3. 注册表使用显式、静态定义

注册表采用 TypeScript 静态对象，不从字符串动态加载组件，不执行外部模块，不允许 fixture 访问网络。组件 render 函数与 fixture 均由仓库源码显式导入。

CI 测试比较受管目录中的公共组件模块和注册表来源，拒绝：

- 受管组件没有定义；
- 定义引用不存在的组件模块；
- 重复组件 id 或场景 id；
- 没有默认场景；
- 控件默认值不满足 schema；
- 使用未登记 token。

### 4. 首期主题与配色保持最小合同

实验室会话保留 `themeId` 和 `colorwayId` 两个维度，但首期只登记：

- theme：`cosmos`，表示当前 shadcn `base-nova` 组件基座；
- colorway：`light`、`dark`，对应当前全局亮暗语义变量。

这只是一份本仓静态环境注册表，不是第三方主题包 API。新增 NeuroBook/macOS 主题、主题市场或组件实现覆盖必须另行 Proposal。

### 5. token 覆盖限定在预览画布

可调 token 来自显式登记表，登记项包含变量名、分组、输入类型、允许范围和默认来源。实验室把覆盖值应用到预览画布根节点，不写到 `:root`，因此实验室导航和检查器保持稳定，也不会污染其它页面。

JSON 快照只允许已登记 token 和受支持值。导入以 `unknown` 接收并通过 Zod 原子校验：整份快照有效才替换当前草稿，任何非法项都拒绝且保留旧状态。

### 6. URL 与本地草稿职责分开

URL query 保存可分享、长度有界的会话状态：

- `component`；
- `scene`；
- `viewport`；
- `theme`；
- `colorway`。

非法或缺失 query 使用注册表默认值归一化，并通过 replace 修正 URL。大量 token 覆盖不进入 URL，避免地址过长；它们保存在版本化 localStorage key 中，并可复制为 JSON 快照。

localStorage 数据只是开发草稿，不是产品数据或实现合同。解析失败时清除或忽略损坏草稿并显示本地错误，不影响实验室其它能力。

### 7. 开发态路由与生产隔离

`/dev/components` 使用 server page 作为环境门禁。非开发构建调用 Next.js `notFound()`，不渲染实验室 client workbench。实验室不加入产品导航，不读取 Product API client，也不建立 EventSource。

固定 fixture 只使用脱敏、合成数据，覆盖正常、空、长文本、错误、加载、禁用和窄屏等可观察状态。

## 可观察验收

### `component-lab-contract`

1. 受管组件模块与注册表一一对应；缺失、重复、无默认场景或非法 token 会使聚焦测试失败；
2. 场景与控件输入经过类型和 Zod 边界校验，非法 URL/快照不能进入渲染状态；
3. 注册表不导入 API client，不访问网络或用户数据。

### `component-lab-workbench`

1. 开发模式可通过 `/dev/components` 选择组件、场景、视口、主题和配色，URL 可复现同一会话；
2. 已登记 token 只改变预览画布，刷新后从 localStorage 恢复，并能原子导入/导出 JSON；
3. 生产构建访问 `/dev/components` 返回 404，实验室不出现在产品导航或产品运行时请求中。

### `cosmos-component-adoption`

1. 当前所有 `components/ui` 模块均有默认场景和关键状态场景；
2. Feed、Source、Search、Story 和状态摘要等无副作用产品组件从数据容器中拆出，并由首页与实验室复用；
3. 320、768、1024、1440 px 视口下无不合理溢出或遮挡，键盘可达，浏览器控制台无错误。

## 测试策略

- 小型行为测试：注册表一致性、URL 归一化、快照校验、token 作用域和生产门禁逻辑；
- 组件测试：只覆盖本仓组件合同，不测试 React、Next、shadcn 或 Base UI 自身实现；
- 浏览器验收：真实运行 `bun run dev:web`，检查开发路由、键盘路径、URL 前进/后退、localStorage 恢复、JSON 导入失败原子性和四档视口；
- 生产验收：`bun run build:web` 后启动生产 Web，确认 `/dev/components` 返回 404；
- 仓库门禁：`bun run docs:check`、聚焦测试、`bun run typecheck`、`bun run lint:web`、`bun run test`、`bun run build:web` 和 `git diff --check`。

## 数据影响

- 不修改 Prisma schema、SQLite、Blob Root、Artifact Root 或产品数据；
- localStorage 仅保存版本化的实验室 token 草稿；
- fixture 为源码中的合成数据，不包含真实用户内容。

## 接口影响

- 新增的是 Cosmos 仓库内部开发接口：组件定义、场景定义、控件 schema、token 登记和静态环境注册表；
- 不新增 Product API、Worker Admin API、Transport DTO 或公开 npm 包；
- 初期注册表不承诺第三方兼容，行为落地后由 Web 实现规格记录当前合同。

## 安全与隐私影响

- 生产环境返回 404，不把实验室作为隐藏但可访问的产品路由；
- 不提供写文件、执行代码、任意 CSS、动态 import URL 或网络 fixture 能力；
- URL、localStorage 和 JSON 导入均视为不可信输入，在边界校验；
- fixture 不包含 Secret、真实信息库内容、私信、邮件、群聊或未经脱敏的 payload。

## 迁移影响

- 现有 shadcn primitive 保持原文件和导入路径；
- 产品页面按可独立验收切片提取展示组件，Transport 和页面状态语义保持不变；
- 不要求一次迁移所有页面容器，只要求当前受管公共组件和本轮提取的产品组件在每个切片结束时登记完整；
- 后续新增受管组件必须同时提交实验室定义，否则 CI 失败。

## 发布与部署影响

- 不修改版本号，不发布 npm 包，不部署实验室；
- 生产构建必须证明开发路由返回 404；
- 发布、部署和远端治理变更仍需独立授权。

## 回滚

实验室为附加开发能力，无数据库或产品数据迁移。若实现引入不可接受的构建或维护成本，可整体移除开发路由、注册表和门禁，并把已提取的无副作用产品组件保留在正常页面中。回滚不得把产品组件重新塞回数据请求容器，也不得破坏当前 Web 行为。

## 预期文档变更

Proposal 接受后、实现开始前：

- 在 `docs/requirements/0002-product-requirements.md` 仅保留 shadcn 可替换实现基座的产品技术约束；组件实验室本身属于工程开发能力，不新增终端用户需求编号；
- 更新 `docs/architecture/0001-cosmos-foundation.md` 的 Web 展示层边界，记录数据容器、产品组件、primitive 和开发工具分层；
- 在维护者分配编号后创建或复用 `.agents/tasks/` Task，记录三个模块和实施切片；
- 若实现最终改变现有 Web 当前行为或结构合同，更新 `docs/spec/interfaces/0005-web-client.md`；
- 更新 `docs/testing/README.md`，记录组件登记测试与浏览器实验室验收边界；
- 状态变化时更新 `PROJECT-STATUS.md`，区分开发工具验证与产品 runtime 验证。

本方案不立即写 ADR。只有第三方主题包、跨仓库共享 token、独立 React UI 包或稳定组件覆盖 API 被接受时，才需要 ADR 记录长期公共边界。

## 方案取舍

### Storybook

本方案不采用。当前组件数量和 Next 应用规模不需要第二套构建、插件和部署体系；内置开发路由能直接复用项目 token、字体和真实产品组件。出现多个独立 React 消费方、需要托管组件文档或成熟视觉回归服务时可重新评估。

### 立即移植 NeuroBook `nb-ui`

本方案不采用。当前 `nb-ui` 的组件、store 和主题覆盖包含 Vue 类型与 `.vue` 实现；逐组件翻译会制造两套交互和无障碍合同。本轮也不判断其许可证是否允许 Cosmos 的预期使用与分发，该问题只在未来实际复用源码或资产时作为独立门禁调查。

### 任意 CSS 编辑器

本方案不采用。任意 CSS 无法形成稳定 schema，难以迁移和审查，也会让实验室成为第二套样式源码。显式 token 登记可以提供足够的视觉调节，同时保持可校验合同。

### 浏览器直接写源码

本方案不采用。它需要开发服务器文件写入接口、路径授权和格式化协调，安全面和维护成本高于复制 JSON 后人工回写的收益。

## 决策记录

| 日期 | 决策者 | 决定 |
| --- | --- | --- |
| 2026-08-20 | 用户 | 原始需求：搭建 Cosmos UI 组件调试实验室，后续所有组件都需要能在其中调节。 |
| 2026-08-20 | Agent 候选 | 当时将交互选项展开为 props/状态/token、受管组件范围、开发态隔离、URL/localStorage/JSON 和 CI 登记门禁；后由本 Proposal 整体接受生效。 |
| 2026-08-20 | Agent 候选 | 当时将实现拆成 `component-lab-contract` → `component-lab-workbench` → `cosmos-component-adoption`；后由本 Proposal 整体接受生效。 |
| 2026-08-20 | 当时待决定 | 是否接受本 Proposal，并从接受时起授权更新稳定文档、创建 Task 和进入计划阶段；下一行记录最终决定。 |
| 2026-08-20 | 用户 | 接受本 Proposal 整体方案，授权更新稳定文档、创建 Task 和进入计划阶段；未授权实施代码、commit、push 或 PR。 |
