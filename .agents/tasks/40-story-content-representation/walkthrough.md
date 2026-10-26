# Task 40 Walkthrough

## 历史检查点：Normalizer 阶段（已被后续实施记录替代）

协调者接收 workflow-5 后直接核查并修复了行内空白丢失、引用检索文本重复、深层强调文字丢失，以及链接/code 文本提取带入 script 内容的问题；图片说明的文本投影按来源位置排列，修正了错误的末尾排列测试。CanonicalOwner 为 Application Normalizer，PatchShape 为同一解析 owner 的文本投影修复，未新增消费方 fallback。TDD mode=off / decision=skipped。

最新验证：`bunx vitest run packages/application/src/content-normalizer.test.ts packages/application/src/workflow-ingest.test.ts`，2 文件/16 测试通过；`bun run --filter @cosmos/application typecheck` exit 0；`git diff --check` exit 0。旧 14 测试证据已由这次结果替代。所有测试为内存 fixture，无真实数据；没有活动写入子 Agent。

切片 2 尚未验收：HTML 列表仍需真正保留嵌套结构并以列表层数而非 DOM 深度计预算；structured 输入仍需执行文本/节点/字节预算和受控链接清理；输出块文本预算、未知容器内媒体顺序、音视频 source 子节点等需要行为回归。不得因当前聚焦测试通过就推进存储。下一步继续在 content-normalizer owner 完成这些合同，再由指定模型独立审查。存储/Query/阅读/Agent 均未实现，目标保持 active。

## 当前状态与本轮切片

编号由维护者分配为 40。生命周期：实施与整体验收进行中。解析、版本/历史读取、阅读和人工候选决定已有实现与分层证据；本轮完成显式连接选择→API 202 入队→持久化 Worker @2→pending 候选→人工接受/拒绝，隔离产品浏览器已通过。真实 Agent、剩余媒体/精确版本产品清单及独立审查仍未闭合，Task40 不整体标完成。

当前目标：本轮维护者已授权完成 Story 接线并确认每次显式选已有连接。Task39 保持完成，本 Task 消费其能力，不另建任务平台。最终结果见本文末；leader 唯一写入者，无子 Agent（普通工具不能指定要求的模型路由）。无自动 goal/Git 生命周期/部署/真实数据或外部模型请求；真实调用仍逐次另获授权。历史 goal、@1 与 TDD-off 假设不代表本轮授权，本轮已执行 RED/GREEN。

## 设计依据与决定

依据：[目标设计](../../../docs/aegis/specs/2026-10-08-story-content-representation-design.md)、[架构](../../../docs/aegis/specs/2026-10-08-story-content-representation-architecture.md)。完整目标、架构与八项技术决定已确认；长期合同未冻结部分先进入切片 0。

目标：新采集正文保留图文顺序、安全可读；Web 与 Agent 共用版本化内容投影；旧数据继续可读；候选接受前不改正式事实。

技术栈沿用 Bun/TypeScript、NestJS、Prisma/SQLite、React/Next.js、Zod。RSS 外层保留现有 XML 解析，正文 HTML 采用 parse5；已批准并安装该依赖。

Change Necessity：contentText + assets 无法表示原位媒体和表示版本，单改样式不足。最小实现边界包括来源输入、Normalizer、持久子资源、Query、阅读器及候选流程。各消费方共用 Query，不新增媒体顺序表、Connector 专有阅读模型或 Web 私有解析器。

兼容：旧 contentText/Asset/Story DTO 保留，新字段 additive 增加；旧库不批量重解析。来源身份去重不使用清洗 blocks。当前来源指纹主要覆盖文本（从代码核查得出）：须验证图片替换/顺序变化生成来源修订，而解析器升级/媒体下载状态变化不生成来源修订。representation fingerprint 不替代 source fingerprint。

TDD Route：mode=off，decision=skipped；authority=此前技能路由基线。不要求先写失败测试，仍需合同、修订、权限、迁移与候选接受行为测试，每切片运行相应回归。

Plan Pressure Test：先冻结正文/节点/块/表格预算、raw retention、质量排序、重建入口、profile 路由、接受命令，并审查媒体绑定及 Blob/DB 恢复，禁止暗设长期行为。

Task 05/10/36/38 仅覆盖局部，故建立 40 作为跨模块主 Task。保留工作区 pi-ai 未提交改动。按依赖 inline 执行；公共 DTO、Prisma migration、Task 记录各一个写入者。拟新增模块先检查现有 owner。

## 实施计划

### 0. 冻结实施合同

Owner：Domain/Contracts/Application/Storage，以及 requirements/architecture/ADR。

先同步稳定文档，冻结预算、来源指纹、媒体绑定、版本格式、Query DTO 与候选接受。Observation 唯一拥有原文；current 指针为选择元数据。合同逐项审查完成才进入业务代码。

### 1. 输入与公共内容合同

文件：`packages/domain/src/content.ts`、拟新增 `packages/domain/src/content-representation.ts`；`packages/contracts/src/entry-relation.ts`、拟新增 `packages/contracts/src/content-representation.ts`，两包入口。

新增 ContentSource、strict block union、EvidenceRef、状态与 scope；旧 Connector 保留 contentText 入口；新 DTO 不泄漏内部字段。验证 Domain/Contracts 聚焦测试、旧 DTO 解码、未知块降级，以及 `typecheck:domain`、`typecheck:contracts`。

### 2. Normalizer

文件：拟新增 `packages/application/src/content-normalizer.ts` 与按格式拆分辅助模块，`packages/application/package.json`。

parse5 按节点顺序转换；三格式生成 blocks/contentText；危险结构清理、超限 partial、局部失败保留其余顺序，不联网。验证纯文本、嵌套列表≤3、表格、错误 HTML、危险链接、图文顺序、超限、同输入确定性，以及 `typecheck:application`。

### 3. 持久化与选择

文件：`packages/storage-prisma/prisma/schema.prisma`、新增 migration、repository port 与 Storage repository、Application RepresentationPolicy。

实现表示子资源、同属 current 指针、唯一版本、人工锁、审计与回退；来源事实不可变。隔离 SQLite 验证旧库迁移无回填、并发版本/指针、归属拒绝、旧证据可读、图片/顺序修订，以及 `db:validate`、`typecheck:storage`。

### 4. 采集闭环

文件：`plugins/rss/src/index.ts`；`packages/application/src/ingestion-service.ts`、`packages/application/src/workflow-ingest.ts`、`packages/application/src/media-acquirer.ts`；Storage ingest owner 与 Blob ports。

RSS 保留正文输入，文本来源走纯文本适配；媒体候选确定绑定 Asset；复用媒体策略与 lease；Blob 暂存/DB绑定可恢复。验证 RSS/Atom、只图片、轮询、解析失败不丢 Entry、媒体失败原位降级、取消/重试/中断恢复，不使用用户数据。

### 5. 统一读取

文件：Application 拟新增 content-query/content-access-policy；`apps/api/src/app.controller.ts`；`packages/transport-http/src/client-content.ts`、`packages/transport-http/src/client-story.ts`。

Web/Agent 共用 Query；current 与历史版本可读；legacy HTML 安全文本；解析状态与 evidence availability 分开；无内部 Blob key。验证 API/Transport 兼容、历史引用、范围拒绝、敏感证据、原文清理后可读，以及 `typecheck:transport`、`typecheck:apps`。

### 6. Story 阅读

文件：`apps/web/src/components/cosmos/story-reading-content.tsx`、新增统一块阅读器；`apps/web/src/app/(reading)/stories/[id]/story-reading.tsx`。

媒体原位、来源标签/切换、多来源不拼接；媒体元数据/失败原因和 partial/legacy/empty 可见；Story 语义显著。Component Lab 与隔离浏览器验证混排、来源切换、空正文、失败媒体、键盘链接、安全 HTML；完整产品遵守 ADR-0029 的 1024/1440 阅读门禁，768 验证过窄提示（组件独立窄屏不代表完整产品支持）。

### 7. Agent 与接受闭环

文件：`packages/contracts/src/agent.ts`；Application invocation/action 注册 owner、新 Story action handlers、正式 Story/relation 命令与 Web 候选面。

三项任务：`story.summarize`、`story.extract-relations`、`story.review-content-quality`（以已接受目标设计 §3.8 为准；此前任务草案的概括标签不是公共 action 名）。原 @1 调用假设由 Task 39 交付的 `agent.invoke@2` 替代；任务与人工确认边界不变。默认 Story scope，来源 scope 显式申请；候选绑定版本；接受经正式命令与审计；输入变化不静默套用。

Fake Adapter 验证版本绑定、partial、旧表示、证据拒绝；接受前零正式事实写入；接受/拒绝/重复接受和用户锁保护。真实 Adapter 单独报告。

### 8. 交付与收口

文件：`docs/spec/`、`PROJECT-STATUS.md`、本 walkthrough。事实文档只记录已实现能力；报告风险、未运行项、后置范围；演示 RSS 图文阅读与候选接受全过程。聚焦、全量、类型、隔离浏览器分别验证；真实来源与真实 Agent 独立报告，Fake 不替代真实验收。

## 验证计划与退役

各切片在实施时登记准确新增测试路径，复用 entry-contract、repository-ingest、public-projection、story-domain、client-content/client-story、RSS index 回归。

计划命令（尚未运行业务检查）：

```powershell
bun run db:validate
bun run typecheck
bun run test
bun run test:e2e
bun run test:browser:component-lab
bun run test:browser
bun run docs:check
git diff --check
```

聚焦命令为 `bunx vitest run <切片测试路径>`。数据库、Blob、临时根、browser fixture 遵循测试规范隔离；不迁移或删除真实数据。真实 RSS/Agent 需明确网络、来源和 Adapter 配置，缺失则报告未运行。

完成证据覆盖图文原位、可解释降级、历史引用、Agent scope 拒绝、接受前不写正式事实、接受后审计可查；文档检查不替代实现验证。

Retirement Track：新数据 blocks 路径替代文本/媒体分开展示；旧 contentText 与 legacy fallback 为兼容保留，只经独立退役决定删除；旧数据不伪造顺序。未知块降级由统一 Query/reader 承担。

## 历史分册索引

- [合同实施至 RSS 验收](walkthrough/history-contract-to-rss-acceptance.md)：早期合同、Normalizer、存储、阅读和候选实现，以及首次回归和 RSS 验收；包含启动与合同审查分册入口。
- [隔离产品阅读验收](walkthrough/history-product-reading-acceptance.md)：图文原位、双来源与图片读取失败的早期红色证据。
- [图片修复与旧 goal 恢复](walkthrough/history-image-repair-and-goal-recovery.md)：图片修复及旧 goal 的历史记录，不代表本轮授权。
- [内部 @2 前置接线](walkthrough/history-internal-agent-v2.md)：产品接线完成前的计划和验证原文；5,325 字节原样归档。
- 以下保留当前接线计划与证据；历史目标授权不代表当前自动续跑已启用。

### 2026-10-26：完整产品接线实施计划

- 维护者要求完成接线，并确认在候选区每次明确选择已有模型连接，不新增全局默认。leader 在原 master/主工作区、base `31d957779150e4e8b41be9038a315137f60ef666` 上继续；保留既有 dirty，无 goal/Git 生命周期/真实数据/真实模型请求。工具不能为普通子 Agent 指定批准路由，本轮不委派。
- 冻结合同：生成 POST 增加必填 connectionId 和 Idempotency-Key，返回 202 与安全任务快照；新增按 Story/runId 查询状态。API 通过 ContentQuery 固定 Story/来源版本、预算和受管权限，仅入既有 WorkflowHost，不加载模型 SDK。Worker 注册 `cosmos.story-agent@1`，经既有 `agent.invoke@2` 后执行 fenced/idempotent 候选保存；无 schema migration、第二任务平台或自动接受。
- 可观察验收：① 明确连接→202/同键同请求同任务→真实 durable Host 和真实 @2 Adapter（合成 SDK）→单个 pending 候选；② 断开/无效结果/取消或失效 fence 不写正式事实，刷新能查状态；③ 接受/拒绝及过期基线沿用原子命令，默认摘要、显式正文授权和版本引用保持。
- 文件职责/顺序：先补 Contracts、Application control/workflow 与 Worker 隔离组合 RED；抽出共享准备/提案校验，入队快照不含密钥；Storage 新增 fenced 保存（复用候选表），Worker main 注册；API module/controller 接入及 202/400/409/404 测试；Transport 及 Web 候选区改为连接选择、任务状态和安全轮询，保留响应不确定时的同一幂等键与刷新恢复；最后浏览器/回归/类型/docs/diff 分层报告。所有者分别为 `packages/contracts/src/story-agent.ts`、`packages/application/src/story-agent*.ts`、`packages/storage-prisma/src/repository/story-agent-candidates.ts`、`apps/worker/src/story-agent*.ts`、`apps/api/src/app.controller/content.ts`、`packages/transport-http/src/client-content.ts`、`apps/web/src/components/cosmos/story-panel/agent-candidates.tsx`；leader 唯一公共合同/记录写入者，测试只用临时根。
- 计划验证：显式文件列表的聚焦 Vitest、`bun run typecheck`、`bun run test`、受控浏览器验收、`bun run docs:check`、大小治理、`git diff --check`。真实 Agent 验收仍逐次另获授权，不以 Fake 代替。

### 2026-10-26：完整产品接线结果

- 三条计划验收均通过本轮隔离证据：用户每次明确选择已有连接；API 冻结安全输入、同键入队返回 202；Worker 在既有 Host 经 @2 调用并 fenced/idempotent 保存 pending；接受才更新正式内容、拒绝不写。默认摘要、显式正文授权及精确版本不变。无新任务平台、migration、全局默认或 API SDK。
- 浏览器先保存请求键；丢响应只恢复同一请求，已知 Run 刷新只 GET。连接在执行时失效、坏提案、外呼失败和取消均安全终止。任务失败可能晚于候选提交，因此所有终态查询实际候选；回执丢失只留原候选，不自动重复外呼。过期 fence 保存被拒绝。
- 验收暴露共享存储旧缺陷：`status projection is inconsistent`，SQL 终态而 Kernel 仍 waiting。修复在存储 owner，同事务同步终态、推进 revision 并撤销 lease，保留不确定外呼的禁止重发门禁；补 Kernel-backed 取消/失败及旧 lease 回归。严格校验暴露旧 fixture 缺 `logs`，只补 fixture、不放宽验证。公开导出冻结仅加新 schema/types/control/definition/action，旧导出与 G03 路由历史不变。
- 完整产品模型 fixture 只在隔离 Worker fetch 层拦截保留域名，真实 API/Worker/SDK/Next 与数据库继续运行；不改 HTTPS/主机安全规则，不发外部模型请求。配置写入测试仅放行自身精确 Origin/Authority。它证明生产组合，不证明真实 Provider。

验证命令与结果（浏览器可在 `bun run build:api`、`bun run build:worker` 后复现）：

| 命令 | 实际结果 |
| --- | --- |
| `bun run test` | 201 文件 / 1148 测试通过，178.57s；本轮复验 pwsh-44ebba2362ed47dd，exit 0。 |
| `bun run typecheck` | 全仓通过；与上述单元复验串行执行，pwsh-44ebba2362ed47dd，exit 0。 |
| `bun run vitest run packages/contracts/src/entry-contract.test.ts packages/application/src/entry-contract.test.ts apps/api/src/app.controller.route-table.test.ts` | 3 文件 / 5 测试通过，pwsh-ee8cf026a7c74f5f，exit 0；本轮默认全套再次覆盖这些冻结检查。 |
| `bunx playwright test --config playwright.config.ts e2e/browser/story-agent-generation.spec.ts` | 完整产品 1 项通过，31.9s；本轮复验 pwsh-6878b6538c52497b，exit 0。202、同键重放、接受/拒绝、显式正文、刷新和浏览器错误检查通过。 |
| `bun run test:browser:component-lab e2e/component-lab/story-agent-candidates.spec.ts` | 7 项通过，23.4s；本轮复验 pwsh-716dd1d271b244d1，exit 0。四宽度、响应丢失恢复、失败后显式新意图、提交后回执丢失仍显示候选。 |

- RED/调查：API/Transport 先在同步旧合同失败；组件先在未强制连接选择失败；另有“提交后失败但隐藏候选”的红色回归。首次完整单元 4 处仅因新增导出/路由未冻结，定向增量冻结后全绿。浏览器曾因缺测试 Origin/Authority 被 403、随后因测试未编码 Story ID 等不到已成功的 202；仅修测试边界/匹配，未放宽安全或业务断言。API/Worker/包构建通过，完整浏览器含生产 Next 构建/start；未部署。
- 文档已同步 Task README、API、Invocation/Adapter spec、架构与 PROJECT-STATUS；更早图片修复及 goal 过程 5,628 字节原文移入历史分册，当前状态/有效决定保留主记录。收口时 PROJECT-STATUS 首次触发 9k token 门禁，仅精简本 Task 重复概述后通过；未修改预算/基线。`bun run docs:check`（1183 文件、0 失败）、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 均通过（pwsh-c70be84284614a9c，exit 0）；保留 5 项既存基线增长 warning。
- 未运行：完整浏览器整套、属性/进程 E2E 专项、真实来源、真实 Agent、用户旧库升级、独立审查；无真实数据/Git 外部操作/goal。信心 B：本条接线和隔离验收完成，Task40 仍实施与验收中。下一步独立审查，再核对媒体/精确版本剩余清单；真实请求须逐次新的费用/凭据/网络授权，不以合成输出替代。

### 2026-10-26：表示版本产品验收计划

沿用已批准的精确版本、质量推进与人工保护合同。本轮只新增 `e2e/browser/story-representation-versions.spec.ts`，复用现有隔离 RSS→API/Worker→Web 栈及公开内容管理 API；不改业务、schema 或 UI，不操作真实来源/模型/数据。当前 Web 只有当前表示阅读，没有历史管理按钮；API 命令加阅读页刷新不冒称按钮验收。Leader 单独写本记录，不启动无法指定已批准模型的子 Agent。

1. **锁定与稳定输入**：受控 RSS 落库得到 v1；锁定后重建 v2，不晋升当前。两版本同解析器/正文/块，原 EntryRevision、Observation 和 Story 版本不变。
2. **精确引用与冲突**：显式 v1/v2 读到各自身份；不存在版本明确 unavailable，不退为 current/legacy。过时当前 ID、锁状态及跨来源回退分别拒绝，当前指针不变。
3. **回退与产品阅读**：解锁后重建 v3 晋升；回退 v1 自动锁定，后续 v4 不晋升。1024/1440 实际阅读页刷新读取相应当前 ID、正文可读、原文链接可聚焦、无横向溢出及非预期浏览器错误。

先编写并运行该验收，用运行结果识别缺陷；若确有业务缺陷，先报告实际行为/预期/证据，再决定修复，不为绿灯改合同。验证命令：`bun run build:api`、`bun run build:worker` 后 `bunx playwright test --config playwright.config.ts e2e/browser/story-representation-versions.spec.ts`；另跑已有 ContentQuery/重建/选择的聚焦回归和文档门禁。独立审查、其他媒体降级和真实 Agent 仍分层未完成。

### 2026-10-26：表示版本产品验收结果

- 三条断言均有本轮运行证据：v1 锁定后 v2 不晋升；按精确版本返回不同表示身份、同解析器输入得到相同正文/块；缺失版本返回 unavailable，不读 current/legacy。过时指针/锁状态及跨来源回退为 409，缺失目标为 404，均不改变当前表示。解锁后 v3 晋升，回退 v1 自动锁定，后续 v4 不晋升；原 EntryRevision、Observation 与 Story 快照完全相同。
- 两个实际 viewport（1024/1440）都通过生产阅读页刷新捕获真实 GET 的当前表示 ID，验证正文、原文链接键盘焦点、无页面横向溢出；完整过程 pageerror/console error/requestfailed 均为空。无 API 响应伪造、数据库直写或业务改动。本轮补的是已有能力的完整产品证据，不是实现新的历史管理 UI。
- `bun run build:api` → `bun run build:worker` → `bunx playwright test --config playwright.config.ts e2e/browser/story-representation-versions.spec.ts` 全部 exit 0（pwsh-fea9b2f9055b416e）；API/Worker/共享包构建通过，浏览器含生产 Web 构建/start，2 项通过、23.6s。隔离数据库/Blob/受控 RSS，不访问真实用户数据或模型。
- `bun run vitest run packages/application/src/content-query.test.ts packages/application/src/content-commands.test.ts packages/application/src/content-rebuild.test.ts packages/storage-prisma/src/content-query.test.ts packages/storage-prisma/src/representation-selection.test.ts apps/api/src/app.controller.structured-content.test.ts`：6 文件 / 20 测试通过，7.92s，pwsh-f23612e9f0784d7e，exit 0。
- 当前状态已同步 Task README 与 PROJECT-STATUS；`bun run docs:check`（1184 文件、0 失败）、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 均通过（pwsh-bd62bab8695d431f，exit 0），保留 5 项既存基线增长 warning；主记录 26,656 字节（本句补记前）。未运行本轮默认单元全套、单独全仓 typecheck、完整浏览器整套、真实来源/Agent、旧用户库升级、独立审查；构建中的类型检查不冒称单独全仓 typecheck。解析器升级、不同质量候选与 Agent 旧证据演进不由同解析器重建验收替代。信心 B，本切片完成、Task40 仍 active；下一步媒体/读取状态的剩余产品验收及独立审查。无 goal/子 Agent/Git 外部操作/部署。

### 2026-10-26：逐步提交授权与既有基线核对

维护者要求继续 Task40，每完成一个可独立验收的步骤作一次本地 Git 提交，并附简要中文说明。此授权不包含 push、分支/worktree、部署、真实数据或真实模型请求；不创建/恢复 goal。先把已完成但未提交的内部 @2、完整 Story 接线及表示版本验收合为连贯基线，之后媒体验收独立提交；不使用 `git add -A`。

- 本轮 `bun run test` 后串行 `bun run typecheck` 均 exit 0（pwsh-68940fe8713b4907）：201 文件 / 1148 测试通过、175.08s，全仓类型通过。上一轮产品与组件浏览器证据保留以上分层结果，本轮未重跑浏览器。
- Leader 按正确性、简单性、架构、安全、性能五轴核对候选持久化/正式决定、既有队列复用、API/Worker 装配、连接与版本权限、终态/fence、同键恢复及有界轮询；未识别新增 Critical/Required blocker。不把此次自查当独立审查：普通子 Agent 工具无法指定 `jijiapi/gpt-6-luna`，未使用默认路由，独立审查继续未完成。
- 仅 Task40 相关 32 个既有改动及其新文件进入候选范围，当前 master 基于 `31d9577`；公共导出为显式增量冻结，未改旧路由历史。旧内部计划/结果 5,325 字节原文移入历史分册，当前决定和有效结果不移走。文档链接 1185 文件、大小治理及 diff 门禁通过（pwsh-1536d396c5d548da，exit 0），保留 5 项既存增长 warning。首次 staged diff 发现 3 个新归档的末尾分隔空行，仅规范最后换行、不改历史正文；提交前复查。

