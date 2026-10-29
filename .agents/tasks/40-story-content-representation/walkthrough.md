# Task 40 Walkthrough

## 历史检查点：Normalizer 阶段（已被后续实施记录替代）

协调者接收 workflow-5 后直接核查并修复了行内空白丢失、引用检索文本重复、深层强调文字丢失，以及链接/code 文本提取带入 script 内容的问题；图片说明的文本投影按来源位置排列，修正了错误的末尾排列测试。CanonicalOwner 为 Application Normalizer，PatchShape 为同一解析 owner 的文本投影修复，未新增消费方 fallback。TDD mode=off / decision=skipped。

最新验证：`bunx vitest run packages/application/src/content-normalizer.test.ts packages/application/src/workflow-ingest.test.ts`，2 文件/16 测试通过；`bun run --filter @cosmos/application typecheck` exit 0；`git diff --check` exit 0。旧 14 测试证据已由这次结果替代。所有测试为内存 fixture，无真实数据；没有活动写入子 Agent。

切片 2 尚未验收：HTML 列表仍需真正保留嵌套结构并以列表层数而非 DOM 深度计预算；structured 输入仍需执行文本/节点/字节预算和受控链接清理；输出块文本预算、未知容器内媒体顺序、音视频 source 子节点等需要行为回归。不得因当前聚焦测试通过就推进存储。下一步继续在 content-normalizer owner 完成这些合同，再由指定模型独立审查。存储/Query/阅读/Agent 均未实现，目标保持 active。

## 当前状态与本轮切片

编号由维护者分配为 40。生命周期：实施与整体验收进行中。内容表示、显式连接→API 202→Worker @2→候选→人工决定已实现；隔离产品覆盖版本管理、媒体及异常读取，合成解析升级/质量保护与旧证据接受门禁。独立审查/预算复核、受控入口离线及单次真实 Story 摘要生成/拒绝已验收；真实运行无来源/工具，不等于整体验收完成。

当前目标：维护者要求继续 Task40，并授权每个可验收步骤作一次中文说明的本地 Git 提交；当前提交和结果见本文末。Task39 保持完成，本 Task 只消费其能力，不另建平台。Leader 唯一记录写入者；本轮另经明确授权以小型 workflow 固定 `jijiapi/gpt-6-luna` 完成只读独立审查，详见末节。无自动 goal、新分支/worktree、push、部署或真实数据操作；真实外部模型请求仍逐次另获授权。历史 goal、@1 与 TDD-off 假设不代表当前授权。

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
- [媒体与异常读取验收](walkthrough/history-media-and-reading-degradation.md)：已完成的媒体降级、旧文本、损坏表示与缺 Asset 验收原文。
- [表示版本产品验收与首次提交](walkthrough/history-version-product-acceptance.md)：锁定/精确版本/回退产品验收和逐步提交基线核对；5,794 字节原文归档，仅规范末尾分隔换行。
- [解析器、质量与旧证据演进](walkthrough/history-content-evolution-acceptance.md)：已完成并提交的计划与验证，5,675 字节原文归档，仅规范末尾分隔换行。
- [受控与真实 Story Agent 验收](walkthrough/history-terminal-story-acceptance.md)：已完成的终端入口离线验证和单次真实请求授权、结果及边界。
- 以下保留后续验收计划与证据；历史目标授权不代表当前自动续跑已启用。

### 历史分册：独立审查与预算修复

已完成的指定路由审查、两项 Required 的 RED/GREEN 及完整命令已原文移入[历史分册](walkthrough/history-independent-review-and-budget.md)。有效结论：重建与 structured source 均限 1 MiB，旧事实不变；该次审查不等于全层验收，历史外呼/goal 授权不可复用。

### 历史分册：受控与真实 Story Agent 验收

受控入口离线验证及单次真实 summary-only 终端调用的完整计划、授权链、结果、运行命令与限制已原文移入[历史分册](walkthrough/history-terminal-story-acceptance.md)。当前有效结论：一次真实 Provider/SDK/Worker 调用成功，只产一个 pending 并按预先约定拒绝，正式 Story 未变；它不代表来源正文、关系/质量任务、接受写入或 Web 决定的真实模型验收。不得复用当次授权。

### 2026-10-27：Task40 批准清单与分层证据对照

按目标设计 §4.1 与本 walkthrough 的阶段 3–8 对照。结论：分层证据足以支持已验收的具体功能切片，但不足以关闭整个 Task40；继续保持“实施与验收中”。本轮不补用户库迁移、不发真实来源/模型请求。

| # | 已批准验收点 | 当前证据与边界 |
| --- | --- | --- |
| 1 | 纯文本、HTML、混合正文按原顺序形成块 | Normalizer 测试及生产 Story 阅读/表示浏览器用例通过。 |
| 2 | 清理危险 HTML | Normalizer 的恶意标签/内容用例通过；不支持任意 HTML 执行。 |
| 3 | 语义块可读，链接安全 | 块结构与安全链接的 Normalizer/阅读器专项用例通过；生产阅读用例验证段落展示与链接可达。 |
| 4 | 媒体顺序、状态与失败 | `source-media-interactions`、`story-media-degradation` 生产浏览器用例覆盖来源切换、状态降级和失败，不含音视频下载/转码。 |
| 5 | complete/partial/failed 与 parseWarnings | Normalizer/SQLite 质量测试覆盖；全量单元测试通过。 |
| 6 | 同输入/解析器版本确定性；升级不改来源事实及旧证据 | 确定性 Normalizer 与 SQLite 合成 parser@2 测试通过；版本/来源事实不变。没有真实发布的解析器升级。 |
| 7 | 多来源不拼接 | `source-media-interactions` 生产浏览器用例验证显式切换和内容隔离。 |
| 8 | Agent 按 Story/Entry/块/媒体/关系分层读取 | 离线应用/Worker 与 SQLite 测试覆盖候选和证据边界；一次真实 Provider 调用仅 summary-only、无来源/工具，不能代表真实模型读取正文、媒体或关系。 |
| 9 | 证据绑定表示版本与 block ID | SQLite 内容演进/候选测试校验版本化块引用，产品候选流程验证旧引用不随升级改写。 |
| 10 | 证据不可用时降级 | Storage 与旧 Agent 证据产品用例覆盖过期/不可用提示、禁止过期接受；仅对已测试状态成立。 |
| 11 | 旧文本可读 | `story-reading-degradation` 曾以显式隔离播种运行 2 项通过；整套浏览器默认跳过这 2 项。 |
| 12 | 空正文、媒体或解析失败不破坏 Story 详情 | 生产浏览器覆盖空正文、媒体不可用、损坏表示/缺 Asset；parser 错误状态另有 Normalizer/SQLite 证据。 |

本表所称“通过”限于列出的测试边界；一次真实终端摘要不替代来源正文、关系/质量任务或 Web 接受流程。历史真实 RSS 只证明隔离环境采集 10 条，不是本轮复验。无真实用户库升级测试。

| 全仓及产品门禁 | 本轮实际结果 |
| --- | --- |
| `bun run test` / `bun run typecheck` | 205 文件/1165 项通过，全仓类型通过（pwsh-c3344693051d418e）。 |
| 全产品浏览器 `bun run test:browser` | 67 项：64 通过、2 跳过、1 失败；唯一失败是首屏 JS 401,954 bytes > 335,974 门槛（Task39 已出现的既有门禁，本轮不改阈值）。Story 阅读选择器按当前段落块修正后，聚焦生产验收 1 项通过（19.9s）；全套重跑后该用例及 Task40 专项用例通过。 |
| Node 进程 E2E `bun run test:e2e` | 设置 `BUN_BINARY` 后仍在 `e2e/recovery.e2e.test.ts` 等待第二个 Worker 回收 RSS 超时；聚焦复跑仍失败，原因未闭合。 |
| 老数据库升级 | Task40 migration 为新增表示结构且无历史回填；没有以前置 schema 快照验证迁移后旧 Revision/Observation/指针/候选不变的行为测试；不操作真实用户库。 |

完整浏览器运行还曾暴露 `story-reading.spec.ts` 仍定位旧 `div.whitespace-pre-wrap`。已改为当前段落块语义选择器；聚焦生产验收 1 项通过（19.9s），全套重跑后该 Story 阅读用例及所有 Task40 专项用例通过。该测试修复不改产品行为。

因此当前结论不是“所有层都通过”：交付切片有单元、SQLite、生产浏览器、组件实验室和一次真实 Agent 证据；但完整浏览器与 Node 进程套件均非全绿，旧库升级也没有行为证据。后续收口顺序：先用隔离的 Task40 前置 schema/数据库快照补迁移无回填验收；定位并修复/归属 Node recovery 超时；首屏预算门禁交由其现有 owner 处置，不放宽阈值；随后重跑目标浏览器、相关全量门禁并复核真实来源证据是否需更新。Task40 保持 active；不以合成解析器或真实终端摘要替代未覆盖组合，也不再次外呼或操作用户数据。

2026-10-27 前置 schema 旧库升级的计划、RED/GREEN 与完整命令已原文归档至[升级历史](walkthrough/history-old-schema-upgrade.md)。有效结论：真实迁移路径下旧事实/标识/指针保持且无历史回填，新增表示/候选为空；未操作用户库，不是用户快照或备份恢复验收。

2026-10-27 Node recovery 的计划、RED/GREEN 与完整命令已归档至[独立诊断历史](walkthrough/history-node-recovery.md)。有效结论：派发后结果未知时 `outcome_unknown` 终止且不自动重发；仅旧测试预期需修正，完整 Node E2E 通过。completion 分类及旧 spec 表述仍待后续评估。

### 历史分册：首屏 JS 预算验收

`8353a50` 的诊断、失败/通过与完整命令见[封口原文](walkthrough/history-js-budget-acceptance.md)。有效结论：浏览时不载入拖拽编辑依赖，transport 显式声明既有 Zod 避免双份校验库；首屏 313.1 KB 通过原 335974 bytes 预算，未改测量窗口或阈值。完整浏览器当时 65 通过/2 显式降级跳过，不能替代后续当前验证。

### 历史分册：显式阅读降级与候选决定

`c3441e4` 的计划、完整命令及门禁见[封口原文](walkthrough/history-reading-decision-combination.md)。有效结论：显式降级播种的生产栈组合 5/5 通过，涵盖 1024/1440 阅读/媒体降级及候选决定/失效；合成模型，不代表真实 Provider 理解。逐次外呼授权、真实来源/正文/关系/质量组合及 completion 分类/旧 spec 仍待独立补齐，Task40 active。

### 历史分册：正文摘要与 Web 人工决定入口

`34e0b29` 的实施、RED/GREEN 与命令见[封口原文](walkthrough/history-body-entry-offline-implementation.md)。有效决定：固定正文与版本，真实 API 入队，Host 在入口进程驱动（非独立 Worker）；生成后删凭据并停止 Host，Web 人工决定后核对持久化。单次 POST、无重试、512 token/60s，费用与 Provider 留存未知；强杀可能残留。离线通过不代表真实模型/真人决定，全文变更须重新审阅并逐次授权。

### 2026-10-29：正文证据格式与脱敏失败分类（离线修复）

基线 `master/34e0b29` 干净。维护者报告真实正文请求失败，授权只读检查其指定隔离结果；调用完成（stop/无工具/JSON），三条事实的 evidence 元素为字符串而非对象，保存被严格合同拒绝，候选为零、正式内容未变，清理完成。本次不能算正文/Web 验收通过。提示只有空 evidence 数组，缺少元素格式说明。

维护者批准本轮：先增失败测试，再补既有 EvidenceRef 对象说明及验收入口的固定失败分类，严格校验不变；回归、文档门禁后本地中文提交。不重跑真实请求，不读取凭据、不改动已留存隔离数据，不建 goal/分支/worktree 或调用子代理（工具无法指定批准模型路由）。分类仅用于验收诊断，不扩展通用 completion 合同；改后的全文计划须重新审阅并逐次授权。

实施与偏差：

- RED：应用与正文 runner 聚焦 29 例中 7 失败、22 通过；三类任务缺对象示例，四类失败报告无分类。补各任务 EvidenceRef 对象及字段约束/无来源空数组提示，仍拒绝字符串、未读取证据和非法版本，不做宽松转换。正文入口只查本次 Run 的 Activity，用固定分类输出，不包含模型正文、原始异常或校验路径；终止生成时不额外查询。
- 旧 summary-only 入口的已披露提示与新 owner 不一致，回归曾 5 例失败；同步其静态计划并加精确相等测试。未改来源、工具、预算、端点或存储合同。较早一次聚焦因使用旧 API 构建而主动终止，重新构建后复验。
- GREEN：四文件聚焦 40/40；全量 208 文件、1185/1185（189.37s）；全仓及入口严格类型通过。新报告覆盖格式错误、非 JSON、未完整完成、保存拒绝，核对仅一次合成传输、零候选、正式行未变与凭据清理。
- 离线生产 Web 首次与测试并行时在 configuration 阶段失败（传输零次），原因未闭合；未放宽等待或改写失败。全量结束后单独执行通过：来源正文/版本、API 精确证据、pending 不改正式行、Web 接受、刷新与持久化读取。此通过不证明首次环境问题已解决。全部响应合成，未再次请求真实 Provider。

实际命令（PowerShell，工作目录仓库根；除 RED/上述失败与中断外 exit 0）：

```powershell
$env:BUN_BINARY='C:\Program Files\nodejs\node_modules\bun\bin\bun.exe'
bunx vitest run packages/application/src/story-agent.test.ts scripts/acceptance/story-body-runner.test.ts
bun run build:api
bunx vitest run packages/application/src/story-agent.test.ts scripts/acceptance/story-body-runner.test.ts scripts/acceptance/story-agent-runner.test.ts scripts/acceptance/story-body-acceptance.test.ts
bun run test
bun run typecheck
bunx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --verbatimModuleSyntax scripts/acceptance/story-body-acceptance.ts scripts/acceptance/story-body-runner.test.ts scripts/acceptance/story-body-browser.offline.ts scripts/acceptance/story-body-acceptance.test.ts scripts/acceptance/story-agent-runner.test.ts
bun run scripts/acceptance/story-body-acceptance.ts --plan
bun run scripts/acceptance/story-agent-acceptance.ts --plan
bun run scripts/acceptance/story-body-browser.offline.ts
```

只读计划均通过，不读凭据、不建库、不联网。五轴自审：合同严格校验未变；安全只投影既有格式并限制本 Run 诊断；离线失败测试核对清理/无重试；架构仅准备 owner 与验收入口；历史真实失败与新合成通过分开记载。无独立代理审查。未运行全量 Node/browser E2E、真实来源或真实 Agent 重试；未验收关系/质量真实任务。本轮只是离线修复，Task 40 不关闭。下一步先复核改后计划，再为一次正文摘要/Web 人工决定单独获得授权；不得复用上次授权自动重跑。

文档门禁命令：

```powershell
bun run docs:check
bun .agent/tmp/task40-markdown-check.ts
git diff --check
$env:PYTHONUTF8='1'
python scripts/size-governance.py --check --cat docs --baseline docs/doc-governance/docs-baseline.json --fail-on-new
```

首轮链接 1223 文件/Markdown 十文件通过，diff 发现本节末尾多余空行而中断，已删除。随后大小门禁因主文档约 9.8k token、状态入口约 9.0k token 失败；将上一轮已完成入口实施归档（除移动后的两处相对链接外，原文一致），有效决定留在本页，并精简本轮状态摘要。未改阈值或基线。

归档后链接检查先发现两处移动后的断链，修正后最终门禁 exit 0：链接 1224 文件零失败、Markdown 十一文件通过、diff 通过；大小 404 文件 PASS，5 项已登记增长 warning（含测试规范），无豁免或基线变更。历史与 `HEAD/34e0b29` 对比除两处相对链接外原文一致。
