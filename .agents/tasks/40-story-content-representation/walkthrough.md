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
- 以下保留后续验收计划与证据；历史目标授权不代表当前自动续跑已启用。

### 2026-10-26：指定路由独立审查计划

维护者要求先独立审查，再在另行明确授权后真实 Agent 验收，并按步骤本地中文提交。本轮另经明确选择批准一个小型 workflow，所有审查 Agent 固定 `jijiapi/gpt-6-luna`；不授权 Cosmos Provider 请求，不读取真实数据/凭据，不恢复 goal 或操作远端。基线 `3b46e9492db87ca034040dc0ea0dab058785e846`（工作区干净），Leader 唯一记录与修复写入者。

1. 两名 fresh-context 只读审查者分别检查内容/版本/证据/阅读与 Agent/队列/恢复/正式决定，先读测试再读实现，覆盖正确性、简单性、架构、安全、性能；Task40 当前树为准，重点比较 `31d9577..3b46e94`，不把旧完成声明当证据。
2. 每项 finding 必须有实际路径行号、触发条件、用户影响、合同依据与验证或未验证标记。Critical/Required 经 Leader 核实后先处理并回归，独立结论不由 Leader 自查替代；两名审查者均不能编辑、commit 或发公网请求。
3. 审查闭合后只准备真实 Agent 的准确请求清单：新隔离根、合成 Story、Provider/model、完整发送文本、单次传输/预算、TTY 无回显凭据、费用/留存和清理；等待新的逐次确认后才能运行，不复用 Task39 历史授权。若路由或安全执行入口不足，报告实际限制，不降级模型或自动重试。

审查 workflow-1fb660700b074977 已收集。内容审查提出两项 Required（先整读 Blob 再校验、structured source 缺总字节预算），均为静态发现，Leader 将补行为证据。另一会话无法访问 Windows 仓库（`fatal: cannot change to '/mnt/d/Otirik/Workstation/cosmos': No such file or directory`），未形成结论；已请具备仓库工具的同路由只读审查者补齐 Agent/恢复职责，不将失败会话当作通过。维护者另批准准备受控 Story 终端入口，但尚未授权真实网络请求；先闭合 Required。

预算修复（不增新平台/迁移/外呼），先 RED 后实现：
1. FileBlobStore 提供有界读取，正常/恰好边界成功，超限、读取中增长、非法限额拒绝；不依赖先 stat 后无界 read，文件句柄必须关闭。
2. rebuild 对保留的声明输入 JSON 在读取阶段限 1 MiB（含 JSON 编码开销）；超限、缺失、损坏 UTF-8/JSON 或无效声明明确 409，当前表示和原始来源不变。普通 Blob 读取合同不变。
3. structured source 按有序顶层块累计 UTF-8 JSON 字节（含嵌套、元数据、转义及结构），达到 1 MiB 停止后续块并标 partial；不先 stringify/encode 整个超大输入。正常输入及已有节点/深度/质量约束保持。复验后请独立审查者核对修复，再逐步本地中文提交。

### 2026-10-27：独立审查闭合与预算修复结果

- 路由固定 `jijiapi/gpt-6-luna`。可访问仓库的独立审查者完成内容职责后补齐 Agent/恢复职责，未再启动默认模型替代会话；不是两名均成功的审查。内容聚焦 9 文件/44 测试与 Agent/Kernel 5 文件/70 测试通过。五轴结论：正确性/安全两项 Required（重建先整读再解析、结构源总字节无界）；简单性/架构/性能未报告其它可核实问题。不代表无缺陷或浏览器整套通过。
- Leader RED：Blob/Normalizer/重建 3 文件/26 测试中 4 失败（pwsh-5e9e6bc21bc244c8）。修复位于原 owner：`FileBlobStore.readBounded` 单句柄 64 KiB 块并最多额外探测一字节，finally close；重建限 JSON 编码 1 MiB、严格 UTF-8/JSON/声明校验，失败 409 且不变更表示；结构源预算计 shell、逗号、嵌套、元数据与转义，超限保留完整有序前缀并标 partial。普通 Blob 读取、公开导出、数据库 schema 与权限不变。
- GREEN：独立审查者重新读取修复及测试，`bunx vitest run packages/application/src/content-input-budget.test.ts packages/application/src/content-normalizer.test.ts packages/application/src/content-rebuild.test.ts packages/blob-store/src/index.test.ts packages/storage-prisma/src/repository-ingest.test.ts`，5 文件/30 测试通过；`bun run typecheck:packages` 通过，原两项 Required 关闭，未报新 finding。覆盖精确上限、非法预算、JSON/Unicode 编码、深度/节点、缺失/过大/损坏重建及来源不变；读取期间增长的安全性来自单句柄循环代码审查，未做并发增长压力测试。
- Leader 最终 `bun run test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; bun run typecheck`：204 文件/1158 测试通过，186.78s，随后全仓类型通过（pwsh-61d9fe9c69d04f1a，exit 0）。一次测试数组类型推断报错已以显式 `readonly StructuredSourceBlock[]` 修正，无类型逃逸。文档门禁：`bun run docs:check`（1196 文件/0 失败）、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 通过（pwsh-547692c9af4e4acb，exit 0；396 文件、5 项既存 warning）。初次门禁仅主记录约 9.3k token 超标，已原文归档完成步骤恢复健康区，不放宽预算；staged diff 提交前复查。
- 本轮未运行浏览器、真实来源/Agent、用户库升级或部署；未读取用户凭据/数据。独立审查步骤闭合，Task40 仍 active。受控真实 Story 入口准备另成一步，先离线验证、披露准确请求并另获逐次确认；本次零 Provider 发送，终端无回显执行仍需本地真人 TTY。信心 B，仅按已授权步骤本地中文提交。

### 2026-10-27：受控 Story 终端入口准备

独立审查修复已提交 `c9b57b8`；本步只准备入口并离线验证，真实请求仍未授权。实现放在 `scripts/acceptance/`，复用既有产品 Provider/模型/连接配置、durable Host、Worker @2、pi-ai SDK 与 Task39 已验证的单次传输和 TTY 无回显守卫；不复用 Task39 旧数据库/迁移快照或其真实请求授权。

1. 当前提交的 schema/migration 冻结到新隔离根，显式 Prisma datasource 不受继承 DATABASE_URL 影响；固定合成 Story，无来源/媒体/工具，summary-only。请求计划含完整消息、模型/地址、512 输出 token、60s、最多一 POST，无自动重试或 redirect。
2. 离线经真实 SDK + 受控 SSE 传输，验证幂等入队/完成产生一个 pending，正式 Revision 不变，再明确拒绝仍不变；异常响应/断网/第二次发送拒绝均不外连，失败无自动重试，输出只留固定状态与计数，不保存 Provider body。
3. 凭据仅在真实 TTY 无回显读取；记录全部新 SecretRef，在成功/配置失败/调用失败清理它们并断开 DB，清理失败必须报告。凭据不放聊天、命令参数或环境变量；CLI 二次确认完整计划后才读凭据。离线通过后本地中文提交，再披露准确请求、费用未知及本地执行限制等待新的逐次确认。

### 2026-10-27：受控入口离线结果与复核

- 入口仅在 `scripts/acceptance/`，schema/migration 冻结 `c9b57b8ac2de67163083ff301bc3ed85cdd2cb32`，新根显式 datasource。合成 Story 经真实配置 owner/Host/Worker @2/SDK；同键重放仅一 Run，正常只产一个 pending，拒绝前后正式 Story/Revision 均不变。无生产合同/迁移变更。
- 正常、非法输出和断网传输全部离线；固定 URL/单 POST/禁 redirect，消息、512 token、无 tools 与 Bearer 在发送前校验。结果只留安全计数，合成 DB 留校验后输出，不记 HTTP body/头或原始错误。新 SecretRef 写前登记、finally 删除验证并断开；引用在本入口映射 SHA-256 文件名，避免 Windows 冒号导致 NTFS alternate stream，临时文件仍是明文。
- 独立首审 Required：声明截止却未强制；Optional：准备失败根残留。Leader RED 分别见 pwsh-41f32db2544048a9（短预算延迟仍完成）、pwsh-36e97ee4b4d04cea（失败根存在）。修复：单调时钟/定时器、联合取消/abortActive、轮询及传输 signal race，守卫保持到 SDK 收尾；准备失败 close 后校验新根绝对父级/前缀再删。500ms delayed/never 均超时清理；准备及取消收尾不承诺总 60s。
- 已批准 `jijiapi/gpt-6-luna` 独立审查者先读测试再读实现，亲自 `bunx vitest run scripts/acceptance/story-agent-runner.test.ts`：7 项通过/测试 55.21s。Required/Optional 均关闭，五轴未报新 finding，不等于真实 Provider 通过。

| 命令 | 本轮实际结果 |
| --- | --- |
| `bun run vitest run scripts/acceptance/story-agent-runner.test.ts` | 7 项通过，测试 55.52s/总 62.48s，pwsh-6d0ca2862c19488f；正常、非法、断网、配置写后失败、准备失败、延迟/永不返回。 |
| `bunx tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --esModuleInterop --skipLibCheck --types node scripts/acceptance/story-agent-runner.test.ts scripts/acceptance/story-agent-acceptance.ts` | 同上 job，严格类型通过，exit 0；覆盖默认包检查之外的新脚本。 |
| `bun run test` | 205 文件/1165 项通过，183.85s，pwsh-c3344693051d418e。 |
| `bun run typecheck` | 同 job 串行，全仓通过，已收集 exit 0。 |
| `bun run scripts/acceptance/story-agent-acceptance.ts --plan` | 只打印固定完整请求与 schema commit，exit 0，pwsh-2c959e40ab6c4b47；不读凭据/建库/联网。 |
| `bun run scripts/acceptance/story-agent-acceptance.ts` | Harness 非 TTY 下按预期 exit 1，只有固定安全错误；没有确认/凭据输入或网络请求。 |
| `bun run docs:check`、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` | 1204 文件/0 失败，大小门禁 397 文件 PASS、5 项既存 warning，pwsh-4b78d921282640cc/exit 0；最初主记录超 token，已将完成演进记录 5,675 字节原文分册，仅规范分隔换行，不改预算。 |

零真实 Provider 发送，无用户凭据/数据/goal/push/新分支/worktree/部署。未跑浏览器、属性或 Node 进程 E2E、真实来源/Agent、用户库升级，入口不等于真人 TTY 或产品浏览器验收。下一步另披露完整 `--plan`、费用/留存未知与本地明文/强杀残留风险，逐次获授权后才由维护者在干净工作区真人 TTY 执行；Harness 无该 TTY，不收聊天/环境变量凭据。信心 B，Task40 active；本步按授权本地中文提交。

### 2026-10-27：单次真实 Story Agent 验收

本轮只收集维护者本地终端结果、只读核对固定计划/安全结果及凭据目录文件清单，更新摘要并按既有逐步中文提交授权收口；不重新执行入口、不新增模型请求、不读取 DB/凭据/原始响应或清理产物。基线 `d1acdf522a4c979c9b04068ee9aa878a830bd1fd`，核对前工作区干净。

- 授权链：维护者先运行 `bun run scripts/acceptance/story-agent-acceptance.ts --plan` 并贴回完整消息（会话 m05907）；解释固定 endpoint/model、合成文本、最多一次 POST、512 输出 token、60s 生成预算及未知费用/留存、本地明文与强杀残留风险后，在问题 `task40_one_real_request` 明确选择“批准这一次请求”。只批准该计划，不授权失败重跑。随后维护者在真人 TTY 执行 `bun run scripts/acceptance/story-agent-acceptance.ts`，返回固定报告（m05915）。凭据未进入聊天。
- 真实目标 `https://api-slb.jiji.cc/v1/chat/completions`、`jijiapi/gpt-6-luna`，summary-only 合成图书馆 Story，无来源/工具。产物根 `.agent/tmp/task40-story-3AImPn`；Leader 亲自读取 `request-plan.json` 与 `result.json`，前者与已披露消息及预算一致，后者为 `status=completed`、`stage=verified`、`transportSends=1`、`pendingCount=1`、`decision=rejected`、`formalUnchanged=true`、`secretCleanup=completed`、`disconnect=completed`。这里只记录安全状态，未读模型输出或 SQLite 内容，未采集 HTTP 状态码/账单金额，不据此宣称 HTTP 200 或免费。
- 只读 glob 检查本隔离根 `data/secrets` 无文件；结合已审查入口的删除后读回校验及完成报告，确认本次正常退出清理证据。保留隔离 DB、计划和结果，不把临时产物暂存提交，不宣称 Provider 端已删除数据或强杀路径安全。
- 本次证明真实 Provider→SDK→连接配置→durable Host/Worker @2→一个 pending→预先约定的拒绝流程，正式 Story 与全部 Revision 不变。拒绝由终端验收程序执行，不冒称真人在 Web 点击拒绝。真实模型的来源正文授权、块证据、关系/质量任务、接受写入及产品浏览器组合未在本次运行；它们既有合成/离线证据不能标成真实模型覆盖。无部署、用户库升级或真实用户数据操作。
- 本轮仅文档改动，不重跑全量测试/类型/浏览器或任何模型请求；上一入口步骤的 1165 项与类型结果仍为历史证据。`bun run docs:check`（1204 文件/0 失败）、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 已通过（pwsh-04501a68d0fd4aca/exit 0；397 文件、5 项既存 warning）；首次仅 EOF 多空行报错，已规范换行，提交前再查 staged diff。该受控真实 Agent 切片通过，Task40 仍 active；下一步按已批准目标核对整体验收及风险，不默认新增付费测试；任何新真实请求须重新授权。
