# G19 P3 治理过程记录

> 分册索引：
>
> | 分册 | 覆盖范围 | 标签 | 大小 | 状态 |
> | --- | --- | --- | --- | --- |
> | [history-2026-11-p3-1.md](walkthrough/history-2026-11-p3-1.md) | 2026-11-02 P3-1 实施派发、规则交付、范围/质量审查与最终验收 | g19, p3-1, agent-rules, review | 10093 B | 已封口只读 |
| [history-2026-11-p3-2.md](walkthrough/history-2026-11-p3-2.md) | 2026-11-02 P3-2 实施计划、本地验证与交付限制、范围审查 R1、质量审查 R2 与验收提交授权 | g19, p3-2, doc-check, review | 12548 B | 已封口只读 |
>
> 分册只读；对已归档内容的勘误写在本文件新小节，不回写分册。

## 2026-11-02：范围批准与计划登记

### 用户请求与当前切片

Otirik 接受前一轮提出的 P3 建议，作为正式内容：P3-1 更新触发与代理协作规则、P3-2 长期文档检查、P3-3 已知证据修复及真实任务演练。本轮处于定义/计划阶段，只记录获批范围和验收，不实施规则、检查脚本或证据修订，不执行 Git 提交。

当前切片目标：为后续实现提供唯一范围记录。验收限三项：正式范围覆盖上述三项；责任与依赖明确；不把范围批准写为实施或运行验收完成。

工作记录位置：`D:/Otirik/Workstation/cosmos/.worktrees/docs-governance`，分支 `docs/no-ref-document-governance`，基线 `d1141ba25f9d663154c919bddbce773beaeee810`，登记前工作树 clean。本轮主代理唯一可写集合为本任务 README、walkthrough 和治理索引；不派代码写入代理，不使用产品数据，隔离测试数据根不适用。沿用已有 worktree 仅登记计划；后续实现的分支/worktree 安排和代理文件集合在派发前核实，不从本次范围批准推导新建或 checkout 授权。

G18 已最终验收并完成提交，范围是五份文档大小治理；不复用已完成的 G18 承接新的日常治理机制。按治理章程顺延登记 G19，编号待维护者确认；该待确认不改变用户已批准的 P3 范围。

### 已核实的依据

- `docs/README.md:42` 已规定代码代理只提带证据的文档建议，由 Leader 审核后另派文档代理；根 `AGENTS.md:47-59` 尚未明确该限制，P3-1 应补入口并复用流程正文。
- `.agents/tasks/AGENTS.md:8-10` 要求 README 保留摘要，walkthrough 为唯一 append-only 过程记录，通用计划技能服从 Task 体系；因此不另建 Superpowers 计划或第二 tracker。
- `docs/standards/repository-workflow.md:135` 允许环境没有对应 Skill 时执行仓库最小合同；本轮使用 writing-plans 整理范围与任务顺序，尚未进行检查器具体代码设计。
- G18 过程记录保存了内容守恒、一次性标题检查、既存 UI 行号失效及暂存区新增文件空白遗漏的发现和修复证据。P3 复用问题定义，不把本机一次性脚本当成已交付的长期门禁。

### 实施顺序与交接

1. P3-1 先由主代理定位各入口和唯一规则正文，文档代理形成最小改动。规则包含更新触发、无需更新结论、建议格式、审核结果及修改分派。建议格式必须说明目标路径/章节、发现的偏差、代码或测试依据、拟改内容、当前/目标/未验证性质及验证要求。主代理审查入口一致性，Otirik 最终审核。
2. P3-2 由实现代理先调查现有检查器、测试和 CI 范围，再提交具体文件写入集合和独立验收切片。至少覆盖有效/无效标题锚点、受治理新分册缺失元数据、新增暂存文件 EOF 空白；失败样例必须实际失败，修复后通过。中文、重复标题、围栏内伪标题、纯片段链接及有意指向源码行号的链接需明确判定规则，不能混为一类。代码代理只提规则文档建议，由主代理另派文档代理更新。检查器不判断架构真实性。
3. P3-3 先核实历史证据，按封口规则决定主文勘误或替代材料；不可覆盖原取证性质。实际演练安排在 P3-1/P3-2 可用后，选取真实开发任务，不为演练新增产品功能。真实任务未选定是后续依赖，不将其写作已完成或当前故障。

P3 的正式范围和最多三条切片验收维护在本任务 README；本过程不复制完整矩阵。以后切片须先追加实际生命周期阶段、目标、依赖、核心文件、最多三项验收和验证层级，再派发。

### 本轮验证边界

仅变更计划记录和治理索引；运行文档链接、大小、Markdown 结构/围栏/尾随空白及新文件差异检查后追加实际结果。不运行应用测试、构建、浏览器、真实来源或 Agent 调用；不将本轮静态验证视为 P3 检查能力已经实现。

本轮实际结果（均在上述 worktree）：`bun run docs:check` exit 0，checkedFiles=1242、failures=[]；`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` exit 0，422 文档、3 条基线、1 条豁免，PASS，无 warning；通过 Python 标准库逐一读取治理索引及两份 G19 Markdown，检查 H1、围栏配对、尾随空白及 EOF，3 文件 PASS。随后执行 `git diff --check` 检查已跟踪索引差异；新建文件不依赖该命令覆盖。未执行提交或 P3 实施。

已归档：P3-1 实施派发、规则交付、范围/质量审查与最终验收见 [history-2026-11-p3-1.md](walkthrough/history-2026-11-p3-1.md)。

已归档：P3-2 实施计划、本地验证与交付限制、范围审查 R1、质量审查 R2 与验收提交授权见 [history-2026-11-p3-2.md](walkthrough/history-2026-11-p3-2.md)。

## 2026-11-02：P3-3 第①项证据修复

### 范围与派发

用户要求开始实施 P3-3。本轮只做第①项：核实 P2 登记的 UI 文案历史证据引用；第②③项真实任务演练待用户指定任务，不为演练制造需求。沿用 worktree `D:/Otirik/Workstation/cosmos/.worktrees/docs-governance`、分支 `docs/no-ref-document-governance`、base `c6d911dc40944607cfe7f96d9dd863aec138ef50`；主仓只有原有 `.gitignore` 改动。文档影响结论为“需更新”：封口分册的引用已失效，必须给出可追溯的核实结果且不改写历史取证。

主代理先独立核实代码，再派文档代理 `a8aae9c4-47e4-41c3-af7d-3812aa777bc6`，登记唯一可写集合为 `docs/proposals/ui-copy-review-v1.md` 勘误节追加（≤6 行）与新建 `docs/proposals/ui-copy-review-v1/ERRATA.md`；禁改封口分册 `part-current-behavior-evidence.md`、代码与 `.agents/`，禁 Git 操作。依据 `docs/proposals/oversized-doc-splitting-v1.md` 的“勘误不改历史分册，走主文勘误节或同级 ERRATA”。

### 主代理核实的事实

`apps/web/src/app/(shell)/page.tsx` 现 283 行，分册引用的 `:500`、`:506`、`:606` 全部越界；`apps/web/src` 检索「本地信息库」「手动触发 RSS」「Phase 1」均 0 匹配。侧栏已改由 `apps/web/src/components/shell/side-nav.tsx:25` 的 `NAV_GROUPS` 驱动，分组标题取 `apps/web/src/copy/areas/shell.ts:9`「内容」/`:10`「管理」，仅 `:16` 的 `entities: "Entity"` 保留英文。`story-actions.tsx:180`「并入本条的内容」配合 `:188` 的 `MergeTargetSelect`；`history-shell.tsx:19`「已拆分为 N 条」；`story-subtype-select.tsx:52`「（沿用旧值）」；`related.tsx:19` 已用「打标签」；`organization.tsx` 与 `story-panel.tsx` 两个文件均已不存在。仍成立项为 `apps/web/src/copy/areas/reading.ts:147`「引文（可选）」，以及 `apps/web/src/components/cosmos/story-panel/evidence.tsx:25/70/84` 的「证据来源」「选择证据条目」「证据关系类型」。

### 文档代理交付与主代理复核

`docs/proposals/ui-copy-review-v1.md` 仅在「## 勘误（2026-09-24，不改写正文）」末尾追加 6 行子小节「### 勘误（2026-11-02，P3-3 证据复核）」，正文与其余小节零改动。新建 `docs/proposals/ui-copy-review-v1/ERRATA.md`（36 行）：开头声明分册正文保持 2026-09-15 原样、本文件不代替浏览器验收；逐条表 14 行按「已修复 / 引用失效（问题已不存在）/ 仍成立」三类登记，每行给出 2026-09-15 原引用、当时记录的问题、核实结果与当前证据；另列「仍成立的问题」说明 `evidence.tsx` 与术语表 B 组「引用关系」的冲突属待实施文案批次项；末节写明已运行/未运行与已知限制。

文档代理纠正了主代理的三处表述，主代理复核后以实测为准：`split.tsx` 的原引用是 `:113`（现值在 `:118`，`:113` 现落在 kind 下拉的 `media` 选项）；`story-panel.tsx` 与 `organization.tsx` 是被删除/拆为目录，不是「仍存在只是重排」；`reading.ts:134`「固定到看板热点区」文案未变，但分册条目所在位置应判「引用失效」，两者已分开表述。分册原文未改动，`git diff --stat` 仅 6 insertions。

### 验证与实际结果

在本 worktree 实际运行：`bun run docs:check` exit 0，1,255 个文件、failures=[]，`changedFiles` 为本轮两份文档 + G19 三记录与归档分册，`metadataFiles` 覆盖新分册；`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` exit 0，423 文件、3 基线、1 豁免，PASS；`git diff --check` exit 0。结构检查：`ui-copy-review-v1.md` 24,830 B / 8,468 token、`ERRATA.md` 8,086 B / 2,635 token，各 1 个 H1、无代码围栏、无尾随空白、末尾恰好一个换行。

未运行浏览器验收、组件实验室、E2E 与 `size-governance` 之外的产品门禁；ERRATA 已写明只核对源码文案现值，不证明界面渲染结果。第①项到此完成，第②③项等待用户指定真实任务。

### 记录归档

本轮追加后本文件曾达 8,987 token，逼近 `docs/standards` 与 P3-2 检查合同采用的 9,000 token 健康上限，续写 P3-3 会越界。按[文档大小治理](../../../../docs/proposals/oversized-doc-splitting-v1.md)的“追加型日志按预算滚动归档、只切历史不切当前状态和有效决定”，把 P3-1 实施派发至其最终验收的整段过程（原第 36–88 行）移入 `walkthrough/history-2026-11-p3-1.md` 并封口只读，原位只留一行链接与头部索引。移动前后逐行比对非空内容：原 84 行全部仍可定位，缺失 0；归档未改写任何句子。本文件落回 7,178 token，健康余量足够承载 P3-3 后续记录。

## 2026-11-02：P3-3 第②③项演练（Task 04 切片）

### 任务选择

用户指定 Task 04 作为演练对象。该 Task 长期开着、无明确下一步，其 `README.md:332-333` 自己写明「`listSources()` … 查询量为 `1 + 2N`；Phase 1 小规模可接受，扩展采集计划前应改为批量 projection」，属仓库已认下的待办，不是为演练新造的需求。

### 写入代理登记

- repository：`D:/Otirik/Workstation/cosmos`（本地仓库；`git fetch origin` 因代理不通失败，`master` 停在 `354e9f9`，落后 `origin/master` 的 `b07286b`，未强行同步）
- worktree：`D:/Otirik/Workstation/cosmos/.worktrees/fix-t04-list-sources`
- branch：`fix/t04-list-sources-batch-projection`
- base SHA：`354e9f9936c7bdb7fda9acd6b4e018deae8b779c`
- 可写文件集合：`packages/storage-prisma/src/repository/sources.ts`、`packages/storage-prisma/src/repository/helpers-4.ts`、新建 `packages/storage-prisma/src/` 下的测试文件、必要时 `packages/storage-prisma/src/index.fixtures.ts`
- 隔离测试数据根：`D:/Otirik/Workstation/cosmos/.worktrees/fix-t04-list-sources/.agent/tmp/`（被 `.gitignore:14` 的 `.agent/` 忽略）
- 禁止写入：`docs/`、`.agents/`、Prisma schema/migration、产品 UI 与其它包

### 环境限制（已实测）

该 worktree 必须先 `bun install --frozen-lockfile` 与 `bun run db:generate`，否则 `@cosmos/*` 会向上解析到主仓库、Prisma 客户端缺失。另需把 `TMPDIR`/`TEMP`/`TMP` 指到 worktree 内：Prisma 的 schema-engine 子进程只能写会话工作区，用系统临时目录会报 `unable to open database file` 或 `attempt to write a readonly database`。主仓库不受此限，因此同一测试在主仓库通过、在 worktree 失败时，先怀疑数据根而非代码。

### 主代理已核实的事实

- `listSources()`（`packages/storage-prisma/src/repository/sources.ts:61-68`）对每个来源调用 `toSourceSnapshot()`；后者在 `helpers-4.ts:556` 起再发三次查询：`run.findFirst`、`workflowRun.findFirst`（均在 `latestRunDiagnostics()`，`helpers-4.ts:531-554`）与 `collectionPlan.findUnique`（`helpers-4.ts:567`）。真实查询量是 `1 + 3N`，与 README 所写 `1 + 2N` 不符。
- Task 04 README 的「已存在」清单另有一批条目（`OutboxMessage`、`ConsumerRegistry`、`WorkflowStepRun` model、`WorkflowCommandService`/`WorkflowCommandRepository`、Round 71-73 的 `inspectWorkflowAdmissions`/`PrismaWorkflowDefinitionRegistry`）在当前 HEAD、`master` 与全历史任意提交中均 0 命中。这一批超出本代码切片的可写集合，由文档代理另行处理。

### 更正与返修（同日，主代理复核实现后追加）

- 上文「真实查询量是 `1 + 3N`」有误：用 Prisma query 事件实测，无连接时 `listSources()` 为 5 次/1 源、9 次/2 源、21 次/5 源，即 `1 + 4N`。原因是我按源码数了三条，漏了 Prisma 在 SQLite 下把 `include: { triggerBindings }` 拆成独立一条查询。原记录保留不改，以此条为准。
- 代码代理据此实现批量投影后，复核发现行数无界：`FROM main.Run WHERE sourceInstanceId IN (?,?) ORDER BY createdAt DESC LIMIT ? OFFSET ?` 的 params 实测为 `[id1, id2, -1, 0]`，`LIMIT -1` 表示无上限，该批来源的全部历史 Run 都会读回内存再挑每组首条（3 源 × 40 条实测取回 120 行）。查询数变常数、行数却随历史线性增长，正是这条债务要防的场景，故退回返修（R-T04-1：行数上界只与来源数有关）。
- `bunx vitest run packages/storage-prisma/src` 的 3 个失败全在 `prisma-cli.test.ts`：`TMPDIR` 指向 worktree 内使该测试先命中 worktree 的 `node_modules/prisma`，改用系统临时目录复跑 7/7 通过，不是代码回归。

### 实现交付与主代理复核

代码代理交付：`listSources()` 改四批读（来源、计划、legacy `Run`、`WorkflowRun`）后内存归并；新建 `packages/storage-prisma/src/repository/source-projection.ts` 承载单条与列表共用的纯投影；`helpers-4.ts` 删除搬走的重复实现；`index.fixtures.ts` 放开 `clientOptions` 以便用例打开 query 事件。行数上界改用 `ROW_NUMBER() OVER (PARTITION BY sourceInstanceId ORDER BY createdAt DESC)`，`EXPLAIN QUERY PLAN` 实测走 `Run_sourceInstanceId_createdAt_idx`。

主代理独立复跑：聚焦测试 9/9、`bun run --cwd packages/storage-prisma typecheck` 0、`git diff --check` 干净；`bunx vitest run packages/storage-prisma/src`（`TMPDIR` 指 worktree）68 文件通过、仅 `prisma-cli.test.ts` 3 例因同一临时目录登记失败。代码代理另给出「无界实现」与「全局 take N 行」两种错解都会失败的对照，说明新用例能挡住换个写法的无界。

### 文档建议与落笔

代码代理按规则只提交六字段建议，主代理审核为**接受（措辞调整）**：README 的 `1 + 2N` 债务写错了两处（实测 `1 + 4N`／含连接 `1 + 5N`），且来源列表这一半已偿还，计划侧（`listCollectionPlans()` 仍逐计划查询）必须保留。另接受一条主代理自查发现的偏差：`docs/spec/storage/0001-prisma-repository/part-01-domain-model.md:38` 只写 legacy `Run` 一路、漏记 `WorkflowRun` 合并，该分册已封口，按「勘误不改历史分册」走同级台账。

随后另派文档代理，登记可写集合为 Task 04 `README.md`、spec 主文 `docs/spec/storage/0001-prisma-repository.md`、新建其同级 `ERRATA.md`；禁止改代码、`walkthrough.md`、任何封口分册正文、基线与豁免。交付：README「已存在」补一条来源列表批量投影（不写死固定次数，精确数字指向测试）并改写债务条目；spec 主文加「分册勘误登记」小节与索引行、`最后更新` 记为 2026-11-02；`ERRATA.md` 记勘误 1（两路各取最新一条、按 `finishedAt ?? createdAt` 取更近、并列 legacy 胜、`lastError` 随所选行，实现位置指向 `source-projection.ts` 的 `mergeRunDiagnostics`）。

主代理复核后在该 worktree 内复跑：`bun run docs:check` exit 0（1,228 文件、0 失败）、文档大小门禁 PASS（406 文件／8 基线／1 豁免，warning 均为既有基线内文件）、`git diff --check` 干净；三个改动文件均在健康区（Task 04 README 24,426 B／约 7.7k token，spec 主文 4,673 B／约 1.5k token，ERRATA 1,478 B／446 token）。

Task 04 的 `walkthrough.md` 按上一轮触发线先把 Round 107 移入 `walkthrough/rounds-0107.md`（11,769 B／3,493 token，front matter 齐备，索引表加行，分册内相对链接多一级 `../` 已在同批修正），再追加 Round 110。归档属主代理唯一写入的过程记录，不是代码代理越界。

### 待完成

P3-3 第③项要求的「记录建议处理、职责边界与各层实际验证」已随本轮落入 Task 04 Round 110 与本页。Otirik 于 2026-11-02 验收通过第②③项，三项条件均成立；P3-3 已完成，P3 整体仍缺治理分支合入 master 与记录提交。

### 验收

Otirik 依据本页与 Task 04 Round 110 的证据判定第②③项通过：演练链完整（实现发现 → 六字段建议 → 主代理接受并调整措辞 → 另派文档代理落笔 → 两侧门禁），职责边界可核（代码代理 5 个代码文件、文档代理 3 个文档路径、主代理只写过程记录），各层验证分开陈述且标出未运行项。主代理自报的瑕疵（:97 段 `1 + 3N` 写错，已在 :102 更正且未回写原文）不阻断验收，按 append-only 保留。

### 合并进 master

用户 2026-11-02 授权「合并进入 master 并按流程做好文档工作」，取代此前「未授权合并」的记录。实现以 `046a374` 提交到 `fix/t04-list-sources-batch-projection`（仅 10 个登记路径：`sources.ts`、`helpers-4.ts`、新建 `source-projection.ts` 与 `source-list-projection.test.ts`、`index.fixtures.ts`、Task 04 `README.md` 与 `walkthrough.md`、新归档分册 `walkthrough/rounds-0107.md`、spec 主文与新建其同级 `ERRATA.md`），再以 `--no-ff` 合并为 master `f148f28`，按仓库既有合并惯例（`710c2b1` 等均为 merge commit）。

合并后在主工作区 `D:/Otirik/Workstation/cosmos` 复跑全仓门禁：`bun run typecheck` exit 0、`bun run build` exit 0、`bun run docs:check` exit 0（1,228 文件、0 失败）、文档大小门禁 PASS、聚焦两项测试 9 passed。全仓 `bun run test` 首次带隔离 `TMPDIR` 时有 3 个失败全在 `prisma-cli.test.ts`（该测试从临时目录向上找 `node_modules`，`TMPDIR` 指进仓库会先命中仓库自己的 prisma）；去掉 `TMPDIR` 重跑为 209 文件／1,191 用例全部通过，故判为环境口径问题。随后以 `0f49bf4` 把这次门禁结果补记到 Task 04 Round 110。未 push、未清理 worktree、未关闭 Task 04 的 `listCollectionPlans()` 债务。

文档工作边界：`PROJECT-STATUS.md` 未登记这条债（`grep 'listSources\|1 + 2N'` 无命中），本切片也不改变模块状态或外部合同，故按准入决策表不更新它；该文件已 8,958 token，接近 9,000 健康上限，追加会越线。
## 2026-11-04：治理分支合入与八步收尾

### 治理分支合入（承上节「合并进 master」）

上节末句「P3 整体仍缺治理分支合入 master 与记录提交」在写下时成立，现已作废。治理分支 `docs/no-ref-document-governance` 先以 `4fda5e0` 提交 G19 记录（含 P3-3 第①项勘误、两份归档分册），再以 `--no-ff` 合入 master 为 `7e79222`，并于同日推送 `origin`（`b07286b..7e79222`）。合并前按用户裁决处理基线口径：以治理分支的 3 条为底，逐条复核 master 独有条目，实测 `docs/api/0002-product-service-api.md` 3,282 B、`docs/proposals/ui-copy-review-v1.md` 24,830 B、`docs/proposals/ui-surface-ownership-v1.md` 25,574 B、`docs/spec/domain/0001-normalized-content.md` 4,496 B、`docs/testing/README.md` 5,353 B 均低于警戒线，无需补登。

合并后全仓门禁：`bun run typecheck` exit 0、`bun run build` exit 0、`bun run test` 211 文件／1,241 用例全通过、`bun run docs:check` exit 0（1,261 文件）、文档大小门禁 PASS。代码大小门禁仍报 3 项合并前既有违规（`connection-panel.tsx`、`workflow-host-runtime.test.ts`、`activity-store.ts`），经 `git diff --exit-code HEAD` 核实本次未改，未修存量、未加豁免。

### 八步收尾

用户按依赖序确认八步，主代理逐项完成后停下汇报：

1. Otirik 验收 P3-3 第②③项，结果并入本页「验收」节。
2. 提交 G19 记录（`4fda5e0`，7 文件 +243/−83）。
3. 合入治理分支（`7e79222`，0 冲突）。
4. 推送 origin（`b07286b..7e79222`）。
5. 清理 worktree 与分支：删除 `.worktrees/fix-t04-list-sources` 与 `.worktrees/docs-governance`，`git branch -d` 删除对应分支（均非 `-D`）。清理时 `.worktrees/fix-t04-list-sources` 残留 `node_modules` 内含 14 个 junction，逐个核对 Target 均在该 worktree 内后用 `[IO.Directory]::Delete` 摘链再删目录；未动 `fix/t39-provider-feedback`（内有 4 个未跟踪文件）。
6. Task 04 第二切片：`listCollectionPlans()` 由 `3 + 2N` 改为常数查询（实现 `fa6f617`、合并 `5e760e2`）。实测旧实现 1／3／5 计划分别为 5／9／13 次查询，每计划两条 `WHERE planId = ? LIMIT 1`；改为按计划批量取 Run 与 WorkflowRun 后用 `ROW_NUMBER() OVER (PARTITION BY planId ...)` 归并。新增测试先 RED（`expected 13 to be 5`）后 GREEN，关联回归 23 用例通过。代价是 `sources.ts` 增至 737 行（红线 800 行），故把归并逻辑放在 `source-projection.ts`。
7. Task 04 文档真实性清理（`839e874`）：migration 计数 4→42、11 个代码 0 命中符号改为真实实现名或「从未实现」、`source.checkpoint.superseded.v1` 更正为 `collection-plan.checkpoint.superseded.v1`、typed-tree codec 更正为 canonical JSON + `ValueRef`；归档标签经四处探测确认不存在，按用户裁决直接改为正确记录，封口分册正文不动、勘误落两份新建 `ERRATA.md`。
8. `PROJECT-STATUS.md` 基线更新（`baefdac`）：等长替换为当前 HEAD 与领先提交数，并把验证结论挂在代码树实际所在的 `5e760e2`；该文件已 8,990 token，再作实质追加须先归档历史段。

### 验证边界

上述每步均在改动后 fresh 跑 `bun run docs:check`、文档大小门禁与 `git diff --check`。产品全量测试在合并后跑过一次全绿；第 6–8 步只改 Markdown 与 Prisma 仓储代码，未重跑浏览器、真实来源与远端 CI。本地 master 现领先 `origin/master` 4 个提交，均未推送；worktree 与分支按用户指示待全部合并后统一清理。
