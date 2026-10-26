# Task 40：合同实施至 RSS 验收历史

> 已封口历史分册；只调整移入后的两个相对链接。当前状态、有效决定及最新证据见[主记录](../walkthrough.md)。

## 启动历史

实施前至首个合同切片的原始记录见 [启动历史分册](history-startup.md)。

API 草案已新增 `docs/api/0008-story-content-representation.md` 并加入索引，标为 Draft，覆盖首个消费者、版本/错误/范围/接受约束和 conformance 场景；尚未冻结 HTTP 端点，不宣称已上线。`bun run docs:check` exit 0，980 文件无失败（pwsh-20）。

协调者检查 `packages/storage-prisma/src/repository/helpers-4.ts:24` 的指纹调用与 `packages/storage-prisma/src/repository/helpers-4.ts:343` 的 Asset 写入：原始 payload 与资产字节目前由 Storage 在事务前写 Blob，Asset ID 在事务内生成。后续 Application 暂存编排与确定性媒体绑定必须显式适配此边界；Normalizer draft 不能预填不存在的 Asset ID，不应通过两套媒体顺序掩盖绑定问题。

首次失败合同审查与修正分派记录见 [合同审查历史](history-contract-review.md)。

### 公共合同修正、审查与 Normalizer 启动

workflow-3 返回 null，无可用修正报告；协调者接管 Domain/Contracts，修正上述结构偏差与递归类型。公共入口快照通过 `bun run scripts/entry-export-surface.ts packages/domain/src/index.ts --out packages/domain/entry-surface.txt` 同步新增导出；此前入口回归失败原因是冻结快照未更新，并非业务行为通过。

workflow-4 以 jijiapi/gpt-6-luna 完成只读独立合同审查：严格 12 类块、来源媒体/持久媒体分离、递归护栏符合；提出 blockId 必填与总字节预算两项意见。对照已接受目标设计 §3.3，blockId 明确可选，省略表示整个版本，因此不改为必填；补充具体块与空 ID 测试并澄清设计。输入 maxBytes 由 Normalizer 执行截断/partial，schema 不直接拒绝大文本以免阻断采集；补充大文本输入测试和 owner 注释。递归结构复杂度仍由 schema 先行保护，Normalizer 不得把结构校验拒绝变成整条采集丢失。

新鲜验证：`bunx vitest run packages/contracts/src packages/domain/src`，17 文件/120 测试通过；`bun run --filter @cosmos/domain typecheck`、`bun run --filter @cosmos/contracts typecheck` 均 exit 0（补充测试前运行）；`git diff --check` 当时通过。尚未运行 Normalizer、存储、浏览器、真实 RSS 与真实 Agent 验收，不代表 Task 40 完成。

当前切片 2：三格式 Normalizer，TDD off/skipped。批准 parse5 依赖；协调者负责依赖清单/锁文件与任务记录，A 子 Agent 仅写新增 `packages/application/src/content-normalizer*.ts`，不改公共 DTO、Prisma、入口、Git、其它文件，不递归委派。沿用启动快照与现有工作区，测试为纯内存、无数据库/真实数据。draft 使用 StructuredSourceBlock（尚未绑定 Asset），最终持久块在采集事务绑定 assetId 后生成，不能虚构资产 ID。验收为顺序、安全、不联网、预算 partial、确定性和旧文本适配；依赖安装和子报告均不替代协调者回归。

### Normalizer 协调者修正与接线前验证

workflow-5 完成初版后，协调者修复容器内媒体被吞、嵌套格式/引用文本重复、列表层级与容器深度混淆、audio/video source 子节点、可执行文本清洗和超限 inline 输出不符合合同等问题。HTML 段落/标题在输出边界统一限制 inline 数量与文本长度；新增输出通过 StructuredSourceBlock schema 的行为测试。工作流 source.fetch 响应先以 JsonValue 接收，再由 sourceFetchOutputSchema 校验，解决 readonly ContentSource 与工作流 JSON 泛型不兼容，未使用 any。补齐 Contracts 显式入口导出，并重新生成入口快照（531 exports）。

新鲜验证：`bunx vitest run packages/contracts/src packages/domain/src packages/application/src/content-normalizer.test.ts packages/application/src/workflow-ingest.test.ts`：19 文件、143 测试通过；`bun run --filter @cosmos/application typecheck`、`bun run --filter @cosmos/contracts typecheck` exit 0；`git diff --check` exit 0。测试为纯内存，不访问用户数据。该结果仅覆盖合同/Normalizer/工作流传递，存储原子绑定、读取、浏览器和真实来源/Agent 均未验收。

下一步切片 3/4：在既有 repository port 接入 Application 规范化 draft，持久化 ContentRepresentation 与 current 指针；媒体 sourceUrl 映射实际 Asset ID；来源指纹计入声明正文顺序但排除 parser/下载状态；Blob 暂存编排遵守已接受架构。尚未执行用户数据迁移。

### 来源指纹与媒体绑定准备

Domain `fingerprintEntryRevision` 保留未声明 contentSource 时的旧指纹；声明正文使用稳定对象序列化，正文媒体或顺序变化影响来源修订，parser 与下载状态不进入来源指纹。Storage 写入与下载前 `listContentUnchangedItems` 使用同一输入。新增 Domain 3 个行为测试与隔离 Storage 回归：相同文本但图片顺序变化产生第二修订，再采集同样正文不产生第三修订。

Application 新增 `content-binding.ts`，递归绑定 quote/list 内媒体到调用方提供的实际 Asset ID，生成表示版本内确定、唯一块 ID；缺失或类型不匹配的绑定拒绝，不伪造 Asset ID。该 helper 尚未接入持久化事务或公共入口。

新鲜验证：`bunx vitest run packages/domain/src/content-fingerprint.test.ts` 3 测试通过；`bunx vitest run packages/storage-prisma/src/repository-ingest.test.ts` 4 测试通过（隔离数据库/Blob 根）；`bunx vitest run packages/application/src/content-binding.test.ts packages/domain/src/content-fingerprint.test.ts` 5 测试通过；Domain、Storage、Application 包 typecheck exit 0；`git diff --check` exit 0。未完成表示 schema/migration、Application 采集准备、Blob owner 迁移、current 指针/人工锁/回退、Query/Web/Agent 验收。本次无子Agent、无 Git 生命周期操作、无用户数据迁移。

### 采集准备与初始表示原子落库

Application `prepareContentItem` 统一生成规范化文本和 draft，递归发现正文媒体并保留已有媒体状态；直接采集与 workflow ingest 已传递 draft。来源指纹在声明 contentSource 时排除 parser 派生的 contentText。Storage 同一事务保存 Observation 证据引用、EntryRevision、实际 Asset 记录、版本 1 的 ContentRepresentation 与 current 指针；块绑定使用该事务实际 Asset ID。parserVersion 由 Normalizer 提供。新增 migration 仅增加本任务表/字段/索引，不回填历史数据；未迁移用户数据库。

新鲜验证：`bunx vitest run packages/storage-prisma/src/repository-ingest.test.ts` 4 测试通过，包含正文块顺序、实际媒体归属、证据 Observation 与 current 指针断言；`bun run --filter @cosmos/storage-prisma typecheck`、`git diff --check` exit 0（pwsh-75）。此前 Application draft 传递聚焦测试和类型检查已通过。

新增 Application `representation-policy.ts`，实现状态优先、同状态显式系统推荐、人工锁保护、归属检查及不可用回退目标拒绝。质量信号算法仍不自行冻结；策略接受上游推荐决定，不按版本号推断质量。`bunx vitest run packages/application/src/representation-policy.test.ts` 3 测试通过；Application typecheck 与 diff check exit 0（pwsh-76）。该策略尚未接线到更新命令；不能宣称人工锁/回退闭环已完成。

当前切片 3/4 尚余：新版本与选择命令的原子约束/审计/并发验证、Application Blob 暂存 owner、RSS ContentSource 输入。Query/Web/Agent 与真实来源验收未实现或未运行。下一步连接表示选择与版本命令，保留全部旧表示。TDD Mode off / Decision skipped；复用本 Task 作为唯一 checkpoint。

### 统一读取与 Story 阅读检查点

后续已完成 RSS/Atom 正文声明、Application Blob 暂存与初始表示接线；表示选择 helper 已验证归属、人工锁、过期指针与审计，但重新解析/人工锁/回退的公共命令仍待接通。统一 ContentQuery 通过主机授予的读取范围检查后返回当前或精确历史表示；缺失历史不退回当前，旧 HTML 走安全文本，无原始 payload 或内部 Blob key。API 与 HTTP 客户端已接入 `GET revisions/:revisionId/content`，拒绝不合法版本和请求方扩大权限。

Web 已使用顺序块阅读器与有标签的来源切换，支持媒体原位、partial、legacy、不可用、加载、重试和空来源；旧的末尾媒体堆叠已移除。两个公共组件已注册 Component Lab。静态渲染行为验证与组件注册验证已运行；API/Transport 聚焦测试 3 文件/9 测试通过，API/Transport/Storage 类型检查通过，Web 类型检查通过。

新鲜浏览器命令：`bunx playwright test --config playwright.component-lab.config.ts e2e/component-lab/content-readers.spec.ts`。首次 4 个用例因合成来源 `webUrl: null` 与原文链接断言不匹配而失败；补齐本场景合成 HTTPS 地址后重跑，5 用例通过（pwsh-99，exit 0）。覆盖 320/768/1024/1440 正文块顺序、来源键盘切换、原文安全链接、控制台/网络错误，以及 partial/legacy/unavailable/loading/error/empty 状态。该证据仅来自隔离 Component Lab，不替代真实 RSS、真实 Agent 或全量回归。

下一步：表示版本与人工选择命令，之后 Agent 候选与人工接受闭环。Task40 仍 active，未完成；未迁移用户数据库，未提交或创建 Git 分支。TDD Mode off / Decision skipped。

### 候选持久化、人工决定与接口检查点

已接通表示锁定、解锁和回退公共命令，校验预期当前指针与锁状态，并保留审计。Story Agent 三类只读建议绑定 StoryRevision 和精确内容表示版本；候选保存在独立表中。人工接受摘要和 Entry 关系复用正式事务写入者，候选状态与审计一起提交；输入过期、重复决定或关系中途失败不会留下部分正式写入。质量检查候选当前可查看、拒绝，尚无正式写入命令，接受时明确返回 unsupported；不把检查意见直接写为事实。

已接通候选列表和接受／拒绝的 API、DI 与 HTTP 客户端。操作者及管理权限由主机提供，请求不能伪造。候选错误使用 Application 类型，缺失返回 404，已决定／输入过期返回 409；未知存储错误继续传播。新增公开导出已更新入口快照。TaskStartSnapshot：主工作区 D:\Otirik\Workstation\cosmos，master，HEAD f66c33135351af38460fff73d311863dc7b4ef47，唯一 worktree；保留 Task39 与 Task40 既有 dirty 状态，无 Git 生命周期操作。

新鲜验证（pwsh-128，exit 0）：`bun run scripts/entry-export-surface.ts packages/application/src/index.ts --out packages/application/entry-surface.txt`；`bun run scripts/entry-export-surface.ts packages/contracts/src/index.ts --out packages/contracts/entry-surface.txt`；`bunx vitest run apps/api/src/app.controller.structured-content.test.ts packages/transport-http/src/client-content.test.ts packages/application/src/story-agent-candidates.test.ts packages/storage-prisma/src/story-agent-candidates.test.ts packages/application/src/entry-contract.test.ts packages/contracts/src/entry-contract.test.ts`，6 文件／20 测试通过。覆盖隔离数据库候选保存无正式写入、原子接受、过期与重复拒绝、多关系失败回滚，以及请求权限与路径编码。`bunx tsc -p apps/api/tsconfig.json --noEmit` 和 `bunx tsc -p packages/transport-http/tsconfig.json --noEmit`（pwsh-129）通过。

仍待完成：Agent 生成入口与 Web 候选界面、声明输入保留和版本重建、全量回归及文档验收。真实来源与真实 Agent 验收未运行，本检查点不能替代它们。Task40 仍 active；TDD Mode off / Decision skipped。

### 生成界面、声明输入与版本重建检查点

Agent 生成 Application 服务、严格 API/HTTP 请求合同及 Web 候选界面已接入。默认只读取 Story 摘要；明确选择正文后绑定实际读取的表示版本。未保存编辑阻止接受，接受后刷新 Story；质量检查意见仍仅可查看或拒绝。生产主机尚未配置 Agent profile/resolver，不隐式使用 Fake：生成入口明确返回未配置 409。真实 Agent 验收仍未运行。

新鲜界面证据：`bunx playwright test --config playwright.component-lab.config.ts e2e/component-lab/story-agent-candidates.spec.ts`（pwsh-136，exit 0），4 用例通过，覆盖 320/768/1024/1440、键盘生成、脚本文字转义、未保存编辑保护、接受刷新、拒绝及控制台／网络错误。组件注册 12 测试与 Web 类型检查通过（pwsh-135）。均为隔离合成场景。

Observation 现在通过独立内容寻址 Blob 引用保留 Connector 声明的解析输入，原始 payload 仍独立保留。新增迁移只增加字段，不回填旧数据。重建使用该输入创建新的 ContentRepresentation，不创建来源修订；复用已有 Asset 绑定，校验预期指针与锁状态，人工锁阻止自动提升，保留历史与审计。旧记录缺少声明输入时明确不可重建。

重建 API/HTTP 聚焦验证：`bunx vitest run apps/api/src/app.controller.structured-content.test.ts packages/transport-http/src/client-content.test.ts packages/application/src/content-rebuild.test.ts packages/storage-prisma/src/entry-contract.test.ts packages/contracts/src/entry-contract.test.ts`（pwsh-142，exit 0），5 文件／19 测试通过；随后 `bunx tsc -p apps/api/tsconfig.json --noEmit` 与 `bunx tsc -p packages/transport-http/tsconfig.json --noEmit` 通过。

收口审查发现摘要候选接受可能清空原有时间范围：候选不拥有该字段，因此在候选到正式命令的边界保留当前时间范围，未改变正式编辑的字段清除语义。该回归验证正在运行（pwsh-143），尚不宣称通过。下一步继续跨模块审查、完整回归与规范同步；Task40 仍 active。

### 最终回归检查点（仍待产品验收）

- `bunx vitest run packages/storage-prisma/src/story-agent-candidates.test.ts packages/storage-prisma/src/story-representation.test.ts` 与 Storage 类型检查通过（pwsh-143，2 文件 5 用例）：摘要候选保留原有时间范围，正式编辑的字段清除语义不变。
- `bunx vitest run apps/api/src/app.controller.route-table.test.ts apps/api/src/app.controller.structured-content.test.ts` 通过（pwsh-153，2 文件 11 用例）。G03 历史路由基线保持不变，测试明确追加 Task40 的六个公开接口。
- `bunx vitest run --reporter=dot` 全仓通过（pwsh-153，157 文件 892 用例，退出码 0）。此前失败的公开导出快照、文案治理与新增路由合同已在各自归属处修复。
- `bunx playwright test --config playwright.component-lab.config.ts e2e/component-lab/content-readers.spec.ts e2e/component-lab/story-agent-candidates.spec.ts` 通过（pwsh-150，9 用例）；覆盖四个宽度、内容顺序、安全链接、降级状态、候选生成及人工接受／拒绝。这是隔离实验室证据。
- `bun run build:api` 与 `bun run build:worker` 通过（pwsh-151）；API/Transport/Storage 与 Web 类型检查在对应切片通过。构建不代表部署。
- 当前公开合同同步到内容表示 API、规范化内容规格与 PROJECT-STATUS。质量审查候选可查看／拒绝，接受明确不支持；生产 Agent profile/resolver 尚未装配，生成入口返回 409，未用 Fake 冒充生产能力。
- 未覆盖：真实来源、真实 Agent、完整产品运行时浏览器验收及用户既有数据升级。未迁移用户数据，未提交、推送或部署；Task40 保持 active，不将测试通过等同于全部验收完成。

### 真实来源与治理补充

- `$env:COSMOS_REAL_RSS_URL = 'https://www.nasa.gov/feed/'; bun run scripts/e2e/real-source.ts rss` 通过（pwsh-156，exit 0），隔离运行 `run_2a6f3743-67ce-4f7b-970d-22a9005c8d38`，有界采集 10 条。此证据更新上条“真实来源未覆盖”，不代表完整产品浏览器或真实 Agent 验收。
- `bun run typecheck` 全仓通过（pwsh-146）；`bun run lint:web` 与 `git diff --check` 通过（pwsh-147，19 warning、0 error）。
- 文档大小检查发现本记录及 PROJECT-STATUS 超出健康区：启动历史与 Task36 已完成历史移入各自主文档同名目录，当前计划、状态与有效决定保留。文档大小复查通过（pwsh-159，含既有基线 warning）。
- 代码大小检查还发现 `workflow-ingest.ts` 超过字节警戒线，将 BlobRef 转换原样提取到 `workflow-blob-ref.ts`，公开导出不变。`bunx vitest run packages/application/src/workflow-ingest.test.ts packages/application/src/workflow-host-runtime.test.ts` 通过（pwsh-161，2 文件 27 测试），随后 Application 类型检查、`bun run docs:check`（1035 文件）与 `git diff --check` 通过。
- 尚有独立既有治理问题：未修改的 `packages/application/src/workflow-host-runtime.test.ts` 被大小检查报告红线；未修改基线或以豁免掩盖，不能宣称全仓大小门禁通过。生产 Agent 装配、真实 Agent、完整产品运行时浏览器与用户既有数据库升级仍未验证；Task40 保持 active。
