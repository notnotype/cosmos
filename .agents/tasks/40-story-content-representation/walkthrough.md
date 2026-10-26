# Task 40 Walkthrough

## 历史检查点：Normalizer 阶段（已被后续实施记录替代）

协调者接收 workflow-5 后直接核查并修复了行内空白丢失、引用检索文本重复、深层强调文字丢失，以及链接/code 文本提取带入 script 内容的问题；图片说明的文本投影按来源位置排列，修正了错误的末尾排列测试。CanonicalOwner 为 Application Normalizer，PatchShape 为同一解析 owner 的文本投影修复，未新增消费方 fallback。TDD mode=off / decision=skipped。

最新验证：`bunx vitest run packages/application/src/content-normalizer.test.ts packages/application/src/workflow-ingest.test.ts`，2 文件/16 测试通过；`bun run --filter @cosmos/application typecheck` exit 0；`git diff --check` exit 0。旧 14 测试证据已由这次结果替代。所有测试为内存 fixture，无真实数据；没有活动写入子 Agent。

切片 2 尚未验收：HTML 列表仍需真正保留嵌套结构并以列表层数而非 DOM 深度计预算；structured 输入仍需执行文本/节点/字节预算和受控链接清理；输出块文本预算、未知容器内媒体顺序、音视频 source 子节点等需要行为回归。不得因当前聚焦测试通过就推进存储。下一步继续在 content-normalizer owner 完成这些合同，再由指定模型独立审查。存储/Query/阅读/Agent 均未实现，目标保持 active。

## 当前状态与本轮切片

编号由维护者分配为 40。生命周期：实施与整体验收进行中。内容表示、显式连接→API 202→Worker @2→候选→人工决定已实现；隔离产品已覆盖表示版本管理，以及音视频元数据、受限图片和空正文。真实 Agent、其他读取降级、解析器/质量/旧证据演进及独立审查仍未闭合，不整体标完成。

当前目标：维护者要求继续 Task40，并授权每个可验收步骤作一次中文说明的本地 Git 提交；当前提交和结果见本文末。Task39 保持完成，本 Task 只消费其能力，不另建平台。Leader 唯一记录写入者；普通子 Agent 工具不能指定批准模型，未委派或冒称独立审查。无自动 goal、新分支/worktree、push、部署或真实数据操作；真实外部模型请求仍逐次另获授权。历史 goal、@1 与 TDD-off 假设不代表当前授权。

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
- [完整 Story 产品接线](walkthrough/history-product-agent-wiring.md)：已完成的接线计划、红绿过程与分层验证，6,618 字节历史正文移入本册。
- 以下保留后续验收计划与证据；历史目标授权不代表当前自动续跑已启用。

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

### 2026-10-26：媒体降级产品验收计划

既有基线已本地提交 `22f0f9a`，提交后工作区干净；本步只新增 `e2e/browser/story-media-degradation.spec.ts` 和本记录/状态同步，不改业务合同或 UI。测试自己启动临时 loopback RSS，走真实采集/API/Worker/生产 Web；不伪造 API 响应或直写数据库，不访问外部来源、真实数据或模型。Leader 为唯一写入者，无子 Agent/goal；完成后依维护者授权单独中文本地提交，不 push。

1. 音视频只有媒体、没有正文：真实 Asset 为 metadata_only，正文按块顺序显示类型/状态/原因和安全原文链接，无播放器或本地已保存宣称；不下载音视频。
2. 图片地址使用非白名单 loopback：真实 Worker 得到 skipped/security_blocked，仍显示图片前后正文、原因与安全外链；不发送媒体请求，不绕过主机门禁。
3. 空 HTML 正文：读取投影块为空、给出无正文说明并保留文章原文入口；刷新后上述状态一致。1024/1440 都检查正文可读、真实键盘焦点、无横向溢出和非预期浏览器错误。

先运行验收观察实际结果；发现业务缺陷先报告行为/预期/证据，不为测试绿灯改合同。复验完整产品本步用例、已有媒体/内容聚焦回归及文档/staged diff/大小门禁。独立审查、legacy/失效表示与更多异常媒体、解析器/证据演进和真实 Agent 仍分别未完成。

### 2026-10-26：媒体降级产品验收结果

- 三条计划均通过：audio/video 块正文为空、Asset metadata_only；图片 skipped/security_blocked、前后段有序；空 HTML 的 blocks=[]、正文为空且不是 unavailable。说明、安全原文及播放器/离线宣称按计划检查。
- 1024/1440 刷新投影一致；真实 Tab/Shift+Tab 焦点、safe href/target/rel、无横溢及全程 pageerror/console error/requestfailed=0。127.0.0.1/127.0.0.2 两个受控接收端确认媒体零请求，不放宽主机门禁。
- 首轮媒体用例停在键盘脚本：`Locator.press` 在发键前重聚焦，破坏 Tab/Shift+Tab 往返。改用当前页面 keyboard 发键，保留原焦点断言后通过，不改产品代码。随后增加非白名单接收端作为零请求见证并再跑最终版本。
- `bunx playwright test --config playwright.config.ts e2e/browser/story-media-degradation.spec.ts e2e/browser/source-media-interactions.spec.ts`：3 项通过、31.1s（新增双宽度 2 项、原切换/保存图片失败恢复 1 项），pwsh-d6aa27272bf9481a，exit 0；包括生产 Web 构建/start及真实 API/Worker。原有恢复用例只在故障注入前检查错误，不把它冒称全程零错误；新增两项为全程检查。
- `bun run vitest run packages/application/src/content-normalizer.test.ts packages/application/src/content-ingest.test.ts packages/application/src/media-acquisition.test.ts packages/storage-prisma/src/content-query.test.ts apps/web/src/components/cosmos/content-block-reader.test.ts`：5 文件 / 57 测试通过、5.09s（pwsh-541801486dc34528，exit 0）。
- `bunx tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --esModuleInterop --skipLibCheck --types node e2e/browser/story-media-degradation.spec.ts`：最终用例类型检查通过，与最终浏览器串行（pwsh-d6aa27272bf9481a，exit 0）；不把 Playwright 转译当类型检查。
- 五轴自查未见 blocker：仅有界测试/记录，无业务变更；非独立审查。本步未跑全套单元/全仓类型（基线 1148 项/类型已过）、浏览器整套、真实来源/Agent、旧库升级。信心 B，本切片完成、Task40 active；余项按计划继续。
- `bun run docs:check`（1186 文件零错误）、`git diff --cached --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 全通过（pwsh-88d1cbfa52a04ec1，exit 0），5 项既存 warning。首次主记录约 9.1k token 触警，去掉本次重复说明后通过，未调阈值/基线/豁免。仅四个本步文件暂存，复查后本地提交。

### 2026-10-26：旧文本与损坏读取产品验收计划

媒体步骤已提交 `4181141`。本步只补测试/隔离启动夹具与状态记录，无产品 API、schema 或行为改动。API 启动前在本轮新建且空的 browser-stack 库中，用合成 Connector 经 IngestionService 建样，再定点构造旧文本/坏表示/缺 Asset；不读取或升级用户旧库。显式开关 `COSMOS_E2E_READING_DEGRADATION=1` 才播种，校验临时根和空库，不使用外部 DATABASE_URL；不新增产品写入口、网络来源或模型请求。Leader 唯一写入，不开 goal/子 Agent；完成后独立中文本地提交，不 push。

1. 无表示旧文本经真实 Query 清洗后可读；脚本/HTML/媒体不执行、不外发，不伪造表示版本。显式历史缺失读 unavailable，不悄悄回退旧文本。
2. 损坏 JSON 的当前表示明确 unavailable，不显示旧 contentText；失败表示显示不可用说明，Story 详情与原文入口仍可读，不导致整页失败。
3. 合法块引用缺失的图片/音视频 Asset：保留前后段落与块顺序，显示缺失说明；只有安全 URL 才提供外链，不渲染媒体或请求 Blob。1024/1440 阅读/刷新结果一致，检查原文链接真实键盘焦点、无横溢、浏览器错误及无意外外发；读取不改写源修订/表示。

新增 `scripts/e2e/reading-degradation-seed.ts` 与 `e2e/browser/story-reading-degradation.spec.ts`，仅在既有 `scripts/e2e/web-stack.ts` 空库迁移之后、启动 API/Worker 之前接入。先跑用例观察行为；若暴露业务缺陷先报告证据，不放宽合同。运行 API/Worker 构建后本步完整产品用例，相关 Query/Normalizer/reader 回归、测试文件类型与文档/staged diff/大小门禁；独立审查、真实 Agent、用户旧库升级及其他演进场景仍未完成。

### 2026-10-26：旧文本与损坏读取产品验收结果

- 三条计划均通过真实 API/生产阅读页：无表示的旧 HTML 安全文本可读，不执行脚本/请求追踪图；不伪造表示，显式 v1 缺失为 unavailable。损坏当前 JSON 返回 unavailable，不退为旧文本；有效但 failed 的表示不在 Web 渲染失败正文。缺失 image/audio/video Asset 保留五块顺序、前后正文、缺失说明；只在有安全 URL 时给原文，不发 Blob/外部媒体请求。
- 1024/1440 各一项均检查首次阅读/刷新、原文与媒体链接真实 Tab/Shift+Tab 焦点、无横向溢出及 pageerror/console error/requestfailed=0，Story API 快照及内容投影读取前后相等。仅 API 启动前的合成隔离库定点构造特殊状态，不是历史 schema 升级或真实旧库验收；无业务代码/合同改动。
- `bun run build:api`、`bun run build:worker` 以及 `$env:COSMOS_E2E_READING_DEGRADATION='1'; bunx playwright test --config playwright.config.ts e2e/browser/story-reading-degradation.spec.ts` 均 exit 0（pwsh-93b23e08faa04344）：共享包/API/Worker 构建、生产 Web 构建/start，2 项通过、35.9s。先运行新增文件 tsc 再构建；生产进程使用合成行但不替换 API 响应。
- `bun run vitest run scripts/e2e/reading-degradation-seed.test.ts packages/application/src/content-query.test.ts packages/application/src/content-normalizer.test.ts packages/storage-prisma/src/content-query.test.ts apps/web/src/components/cosmos/content-block-reader.test.ts`：5 文件 / 31 项通过、7.71s（pwsh-12d3bf25be674b2a，exit 0）。新增两项证明非 browser 根与非空库拒绝、继承 DATABASE_URL 不生效；Query 读取前后 EntryRevision/ContentRepresentation/Observation 整行快照不变。
- `bunx tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --esModuleInterop --skipLibCheck --types node e2e/browser/story-reading-degradation.spec.ts scripts/e2e/reading-degradation-seed.ts scripts/e2e/reading-degradation-seed.test.ts` 同上述聚焦回归串行 exit 0。首轮播种器写错 Prisma Source delegate（实际为 SourceInstance），类型与启动均定位在测试代码；另有 Node 无法解析裸 bun 的测试迁移问题，改用现有 Node/Prisma fixture。没有据此放宽校验或改产品，修正后复验通过。
- 完整接线已完成过程 6,618 字节移入历史分册，保留原文（仅规范末尾换行）；当前状态和有效合同仍在本册/架构。五轴自查：仅可选测试夹具与有界读取验收，门禁拒绝非空/错根；默认启动不开播种，未引入产品权限/写口或运行负担。未识别本步 blocker，非独立审查。
- 关闭播种开关后复验默认栈：`Remove-Item Env:COSMOS_E2E_READING_DEGRADATION -ErrorAction SilentlyContinue; bunx playwright test --config playwright.config.ts e2e/browser/story-media-degradation.spec.ts`，2 项通过、26.6s（pwsh-9366c430d5474969，exit 0）。默认正常采集、媒体拦截与空正文不受可选夹具影响。自查修正默认未播种时的专用用例门禁：明确 skip 并说明所需开关，不因缺测试行让默认整套失败。最终 pwsh-dc3d7901be95497a：开启开关重跑旧行 2 项通过、20.5s；关闭后同时跑旧行+媒体为 2 passed / 2 skipped、20.6s，随后上述 tsc exit 0。skipped 不计通过，完整断言只在显式启用时运行。
- `bun run docs:check; git diff --check; python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 通过：1190 文档无失败，394 文件大小门禁 PASS、5 项既有基线增长 warning（pwsh-d034992ffc9f4934）；首次只因本次主记录末尾多余空行失败，已清除后复验。暂存后再查 cached diff 与文档门禁。
- 本步不跑默认单元整套/单独全仓 typecheck、浏览器整套、真实来源/Agent、旧库升级；构建与聚焦类型不冒称全仓。信心 B：本切片完成、Task40 active；余项是独立审查、解析器/不同质量与 Agent 旧证据演进、另获授权的真实 Agent。本地按步骤中文提交，不 push/部署/goal。

