# G17 过程记录(append-only)

本文件是 G17 的过程、偏差与验证的唯一记录位置;README 只维护当前摘要、范围、门禁与下一步。追加规则与文档大小治理见根 `AGENTS.md`。

## 2026-10-26 切片 0:口径裁定、接缝实测与编号建立

- **背景**:维护者要求「开一个文档治理任务,编号按序分配,目标是处理红线区文件」。此前一轮只读扫描(2026-10-26)用 `scripts/size-governance.py` 实测:主工作区 368 份文档中红线 5 份、警戒 9 份;5 份红线里 1 份是豁免项,4 份在基线内且相对登记值继续增长。
- **豁免判定**:`docs/requirements/0001-original-requirements.md`(59,793 B / 20,313 token)已按提案 §4.10 登记在根 `.docs-size-exemptions.yml`(`reason: append-only 用户原话真相源,按登记规则只增不减`,`review_after: 2026-12-31`,`max_size: null`),门禁跳过该文件——实测确认它在主工作区的输出里不出现在任何 warn/fail 行中。故本批拆分对象为 4 份,不是 5 份。
- **红线口径核对**:4 份文档字节 53,756–70,139 B、token 16,288–22,639,均同时越过 >50 KB 与 >15k 两条线,不存在 §4.2「单轨先到」的灰区解释空间。
- **编号**:`governance/` 现有最大编号为 G16;`G08` 目录有两个(`G08-ci-gate-split-status-doc`、`G08-size-gate-lines`),是历史遗留,任务索引只收录后者,不影响顺延。按章程「按序列顺延后报维护者确认」取 **G17**,slug `doc-splitting-batch3`,与 G01/G04 的命名保持同构。
- **引用面核查**:用 `Select-String` 统计四份文档在全仓(`docs`、`.agents`、`apps`、`packages`、`scripts`)的被引用情况——`0005-web-client` 35 个文件、`0001-prisma-repository` 65 个、`0001-public-contracts` 38 个、`0002-product-api-http` 28 个;**带 `#` 锚点的引用为 0 处**。结论:主文档路径不变、分册放同名子目录即可,既有引用无需改动。这与 G04 切片 0 的前提一致,但不代表可以省掉 `docs:check`——G01 的 28 条断链是分册目录层级变化后的相对路径深度问题,与锚点无关。
- **接缝实测**:用 .NET `ReadAllLines` + 逐行 `UTF8.GetByteCount` 统计各 `##`/`###` 节字节(排除 `Get-Content` 在该文件中只读到 308 行 vs 实际 743 行的偏差),结果写入 README 的「拆分接缝」表。关键数字:`0005-web-client.md` 的 `## 外部行为` 20.5 KB / 195 行是单节最大者;`0001-prisma-repository.md` 的 `### Checkpoint、领域查询、事件 replay` 23.0 KB / 29 行(单节接近 30 KB 健康线上限,直接成册即可,不再下钻);`0002-product-api-http.md` 的 `### Content query` 14.4 KB / 91 行;`0001-public-contracts.md` 的 `### Feed、Entry、Story 与事件 DTO` 18.1 KB / 29 行。
- **拆分顺序**:按字节降序 70.1 → 59.5 → 58.6 → 53.8 KB,先拆最大的,给后面留修正切法的余量。
- **未运行**:切片 1–5 的实际拆分与其守恒校验。
- **验证**:
  - `python scripts/size-governance.py --check --baseline docs/doc-governance/docs-baseline.json` → FAIL(15 项),其中主工作区文档类 10 条(4 条本任务目标 + 6 条其他基线内增长/警戒项);`扫描 2085 个文件,基线 12 条,豁免 1 条`。这 15 项里的 14 项 `.worktrees/fix-t39-provider-feedback/` 副本属既定不处理范围(`split-backlog.md` §5:该目录被 `.gitignore` 忽略,CI 克隆里不存在)。
  - `bun run docs:check` → 首轮 FAIL 1 项,唯一失败是本 README 指向尚不存在的 `walkthrough.md`(`checkedFiles: 1149`);本文件创建并补全索引行后复跑 **0 失败,`checkedFiles: 1150`,exit=0**(索引行 [`README.md`](README.md) 与 [`split-backlog.md`](../split-backlog.md) 的相对链接同样通过)。
- **备注**:本切片建的 README 与 walkthrough 都在健康区(README 约 10 KB),不引入新的体积债务。
- **仓库改动面**:新增 `G17-doc-splitting-batch3/README.md` 与 `walkthrough.md`;修改 `governance/README.md`(新增 G17 索引行)与 `governance/split-backlog.md` §5(四份 spec 文档改指向本任务)。未 commit。

## 2026-10-26 切片 1:`0005-web-client.md` 按节分册

- **接缝**:文件 743 行、18 个顶级 `##` 节,按 spec 固定章节模板切成 6 册。主文档保留 `1–67`(标题/状态/最后更新/组件定位)与 `731–743`(非目标/边界),中间插 `## 分册索引`。册边界:`part-01-concepts-and-definitions.md` 68–138、`part-02-external-behaviour.md` 139–333、`part-03-input-and-output.md` 334–459、`part-04-state-and-lifecycle.md` 460–591(状态与持久化/外观主题/状态转换/副作用/错误与降级/依赖/配置)、`part-05-acceptance-and-anchors.md` 592–677(重建验收/实现与测试锚点)、`part-06-component-lab.md` 678–730(React 组件实验室)。没有一节需要再下钻:最大单节 `## 外部行为` 20.5 KB,直接成册在 30 KB 内。
- **为什么不按「一节一册」**:18 节里 `## 状态` 452 B、`## 最后更新` 118 B 这类元信息节成册只剩噪音,且会把 6 个索引行涨到 18 行;同族小节点(状态转换/副作用/错误与降级/依赖/配置)合并成 `part-04` 便于一次读完整套生命周期合同。
- **相对链接**:分册比主文档深一层,所有相对链接统一加一层 `../`(围栏代码块内不改)。既有引用**没有锚点**,主文档路径不变,所以仓内 35 处引用零改动——已由 `docs:check` 覆盖。
- **结果(实测,磁盘字节/LF)**:主文档 `7.85 KB / 2.6k token / 100 行`;分册 `part-01` 7.34 KB/2.5k、`part-02` 20.66 KB/6.9k、`part-03` 11.39 KB/3.9k、`part-04` 9.61 KB/3.1k、`part-05` 8.77 KB/2.7k、`part-06` 5.66 KB/1.8k。全部落在健康区(≤30 KB 且 ≤9k token)。
- **守恒**:非空行多重集 677 → 693,`丢失行 0 条`,新增 16 行全部是索引段(1 行标题 + 1 行说明 + 2 行表头 + 6 行索引 + 6 行指针);标题多重集只多一条 `## 分册索引`。主文档保留区逐字未改,所以 `## 最后更新` 仍写 2026-10-01——拆分是结构搬迁不是语义变化,和 G04 的 `0003-product-dtos` 一样不在文档内另记一笔。
- **三个脚本 bug(都是「看起来通过了」的类型)**:
  1. 行数守恒断言用了剥离末尾空段**之前**的 `total`,导致 `行区间未完整覆盖` 误报;把取值移到剥离之后。原文件末尾第 744 行是空行,`split('\n')` 得 744 段、有效 743 行。
  2. 链接正则 `(!?\[[^\]\n]*\]\()` 要求链接文本里不含 `]`,而 `part-05` 里 `` [`(reading)/stories/[id]/story-reading.tsx`](...) `` 的文本自带 `]` → 整条不匹配 → 该行没被加 `../` → `docs:check` 报 `相对链接目标不存在:docs/spec/interfaces/0005-web-client/part-05-acceptance-and-anchors.md -> ../../../apps/web/src/app/%28reading%29/stories/%5Bid%5D/story-reading.tsx`。改成锚定 `](` 的 `(\]\(\s*)(<[^>\n]+>|[^)\s]+)` 后命中。**注意 `scripts/check-documentation.ts` 的 `inlineLinkPattern` 有同一个毛病**(链接文本带 `]` 就被跳过),所以这类行是「拆分脚本会漏、检查脚本也不报」的静默失效区,只能靠人工看 `part-05` 的 diff 发现。
  3. `Path.write_text()` 在 Windows 上把 `\n` 转成 `\r\n`,而仓库 `.gitattributes` 是 `* text=auto eol=lf`、既有文档全是 LF(实测 `0002-product-api-http.md` crlf=0)。后果是脚本按 LF 打印 `8042 B`、磁盘实际 `8142 B`,**100 行文件多算 100 字节**,门禁按磁盘字节判定会虚高。改成 `open(..., newline="\n")` 后脚本打印值与磁盘一致。**这是本批最容易复发的坑:任何按字节核对大小的动作都必须在 LF 磁盘状态下做。**
- **一次返工**:首轮写完用的是「按正文估 token」的 front matter,与门禁对整份文件(含 front matter)的估算口径不一致(2455 vs 2495)。改成二次收敛(先估正文、再用整份 payload 估并回写)后**回滚重写**——回滚用 `git checkout -- <主文档>` + 删分册目录,不能用 `git show HEAD:...` 重定向(PowerShell 会按 UTF-16 写出 83442 B)。
- **验证**:
  - `bun run docs:check` → **0 失败,`checkedFiles: 1156`,exit=0**。
  - `python -X utf8 scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json` → `扫描 713 个文件,基线 12 条,豁免 1 条`,`结果: FAIL(5 项违规)`,5 条全是 `.worktrees/fix-t39-provider-feedback/` 副本(既定不处理范围);主工作区该文件现报 `[info] 基线内文件已回到健康区(可移除)`,条目留到切片 5 移除。
  - 未运行:浏览器/真实来源验收(纯文档改动,无运行时行为)、`git diff --check`(留到切片 5 与收口一起跑)。
- **仓库改动面**:改 `docs/spec/interfaces/0005-web-client.md`(70,139 → 8,042 B);新增 `docs/spec/interfaces/0005-web-client/{part-01..06}.md` 6 个文件(合计 64,960 B)。拆分脚本 `.local/split_0005.py` 不入库(`.local/*` 被 ignore)。未 commit。

## 2026-10-26 切片 2:`0001-prisma-repository.md` 按节分册

- **接缝**:237 行。主文档保留 `1–29`(标题/状态/最后更新/组件定位)+ `235–237`(非目标/边界),中间插索引;5 册:`part-01-domain-model.md` 30–79(概念与定义、存储根和连接、Source/legacy Run/Step/Job、Observation/Entry/Revision/Asset/Story)、`part-02-checkpoint-and-queries.md` 80–108(Checkpoint、领域查询、事件 replay)、`part-03-persistence.md` 109–168(输入、输出、状态与持久化)、`part-04-lifecycle.md` 169–208(状态转换、副作用、错误与降级、依赖、配置)、`part-05-acceptance.md` 209–234(重建验收、实现与测试锚点)。
- **单节 23.5 KB 那一节不再下钻**:`### Checkpoint、领域查询、事件 replay` 是 26 条 bullet、29 行,23,566 B / 7,261 token,直接成册落在 30 KB / 9k token 内。它若与前后任一节合并都会越线(`## 外部行为` 整段 30.4 KB),所以只能独占一册——这也是本份文档不能用「`##` 节一册」规则的原因。
- **结果(实测,磁盘字节/LF)**:主文档 `4.23 KB / 1.3k token / 49 行`;分册 9.13 KB(2.8k)、23.19 KB(7.3k)、12.18 KB(3.7k)、4.61 KB(1.5k)、7.39 KB(2.3k)。全部在健康区。
- **守恒**:非空行多重集 184 → 198,丢失 0 条,新增 14 条(4 + 5 索引 + 5 指针)。

## 2026-10-26 切片 3:`0002-product-api-http.md` 按节分册

- **接缝**:567 行。主文档保留 `1–37` + `556–567`,5 册:`part-01-catalog.md` 38–135(概念与定义、外部行为、System 与 manifest catalog)、`part-02-sources-and-runs.md` 136–249(Source 资源、Run/Job/Attempt)、`part-03-content-query.md` 250–340(Content query)、`part-04-events-and-providers.md` 341–389(SSE events、Model provider 配置)、`part-05-contracts.md` 390–555(输入…配置、重建验收、实现与测试锚点 共 10 节)。
- **切法依据**:最大的两个 `###` 是 `Content query` 14.8 KB 与 `Source 资源` 11.6 KB,各自独占或配一节成册;`## 错误与降级` 下还有 `### 400/404/409/其它错误` 四个子节,和输入/输出等小节同族,一起进 `part-05` 才能避免 15 个索引行。
- **结果**:主文档 `4.57 KB / 1.4k token`;分册 6.55 KB(1.9k)、15.95 KB(4.9k)、14.59 KB(4.3k)、4.67 KB(1.4k)、13.60 KB(4.1k)。
- **守恒**:非空行 478 → 492,丢失 0 条,新增 14 条。

## 2026-10-26 切片 4:`0001-public-contracts.md` 按节分册

- **接缝**:216 行。主文档保留 `1–30` + `210–216`,3 册:`part-01-base-types.md` 31–78(概念与定义、协议和内容基础类型、Source 与采集命令、状态和查询 DTO)、`part-02-content-dtos.md` 79–122(Feed/Entry/Story 与事件 DTO、Action/重试/可序列化引用)、`part-03-behaviour-and-acceptance.md` 123–209(外部行为、输入、输出、状态与持久化、状态转换、副作用、错误与降级、依赖、配置、重建验收、实现与测试锚点)。
- **一次返工(重要)**:首版按「`##` 概念与定义 到 `### 状态和查询 DTO` 结束」切,把 `### Feed、Entry、Story 与事件 DTO`(18,582 B / 29 行)留给下一册,结果 `part-01` 实测 **33,186 B / 9,926 token**,双轨都越线。原因是这一节 18.6 KB 夹在中间,前 4 节合计 14.6 KB、后 2 节合计 4.9 KB,**任何「按相邻节凑册」的切法都会把它和一个 4 KB 级的尾巴绑在一起**。改为让这节单独作为 `part-02` 的头部(与 `### Action、重试与可序列化引用` 合 22.4 KB)后三册分别为 14.26 / 22.38 / 13.45 KB。教训:**分册边界必须按实测字节试算,不能按「节数均分」直觉**——本份文档只有 3 册,却需要先算一遍才知道哪一节是「孤峰」。
- **结果**:主文档 `4.59 KB / 1.5k token`;分册 14.26 KB(4.3k)、22.38 KB(6.7k)、13.45 KB(4.2k)。
- **守恒**:非空行 164 → 174,丢失 0 条,新增 10 条。

## 2026-10-26 切片 2–4 共用事实

- **脚本**:`.local/split_doc.py`(从切片的 `split_0005.py` 泛化而来,`SPECS` 字典按 slug 配 `src`/`part_dir`/`head`/`tail`/`groups`,同一套链接加层、front matter 二次收敛、行多重集守恒校验)。用法 `python -X utf8 .local/split_doc.py <slug> [--write]`,slug 为 `prisma-repository`/`product-api-http`/`public-contracts`。不入库(`.local/*` 被 ignore)。
- **四份主文档现状**:7.85 / 4.23 / 4.57 / 4.59 KB,原 68.50 / 58.11 / 57.24 / 52.50 KB。分册共 6 + 5 + 5 + 3 = 19 个,最大 23.19 KB(`0001-prisma-repository/part-02-checkpoint-and-queries.md`)/ 7.3k token,全部 ≤30 KB 且 ≤9k token。
- **基线**:`docs/doc-governance/docs-baseline.json` 12 → 8 条,移除四份 `docs/spec` 文档,`note` 追加 2026-10-26 的移除理由(整体移除而非下调登记值,因为主文档已回健康区)。JSON 仍合法。
- **验证**:
  - `bun run docs:check` → **0 失败,`checkedFiles: 1169`,exit=0**(19 个新分册的相对链接全部解析成功)。
  - `python -X utf8 scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json` → `扫描 726 个文件,基线 8 条,豁免 1 条`,`结果: FAIL(5 项违规)`;**5 条 FAIL 全部是 `.worktrees/fix-t39-provider-feedback/` 副本,主工作区 0 违规**。主工作区只剩 5 条 `[warn] 基线内文件增长`(不阻塞),分别是 `docs/api/0002-product-service-api.md` 42.34 KB / `docs/testing/README.md` 31.51 KB / `docs/spec/domain/0001-normalized-content.md` 30.79 KB / `docs/proposals/ui-copy-review-v1.md` 27.42 KB / `docs/proposals/ui-surface-ownership-v1.md` 27.24 KB,以及 1 条未登记的 `.agents/tasks/40-story-content-representation/walkthrough.md` 40.76 KB 警戒区。
  - 未运行:浏览器/真实来源验收(纯文档改动)。
- **仓库改动面**:改四份主文档 + `docs/doc-governance/docs-baseline.json`;新增 19 个分册文件。未 commit。

## 2026-10-26 切片 5:收口(基线、门禁脚本修复、交叉引用)

- **基线移除**:`docs-baseline.json` 的 `files` 12 → 8 条(删掉 `docs/spec/contracts/0001-public-contracts.md`、`docs/spec/interfaces/0002-product-api-http.md`、`docs/spec/interfaces/0005-web-client.md`、`docs/spec/storage/0001-prisma-repository.md`),`note` 追加 2026-10-26 的移除理由(四份主文档压到 7.85 / 4.23 / 4.57 / 4.59 KB、全部回健康区且分册各自 ≤30 KB,故整体移除而不是下调登记值)。`python -c "json.load(...)"` 校验通过,`files` 8 条、`note` 852 字符。
- **门禁脚本缺陷(维护者批准同批修)**:`scripts/size-governance.py` 新增 `is_ignored(rel, skip)`,把原来的 `rel in skip` 换成「等值命中 **或** `rel.startswith(带尾斜杠的目录条目)`」;`SKIP_DIRS` 增加 `.worktrees`(原本只有单数 `.worktree`)。根因是 `git ls-files -z --others --ignored --exclude-standard` 对整目录被忽略只返回 `.worktrees/fix-t39-provider-feedback/` 这一条目录条目(本机实测 482868 条 ignored 里只有 1 条以 `/` 结尾),而 `scan()` 按文件相对路径比对,永远不命中。
- **修复前后对比(同一命令)**:`-c docs --check` → FAIL(5 项,全是 `.worktrees` 副本)→ **PASS(含 warning)**,扫描文件数 726 → 389(差的 337 个就是 `.worktrees` 下的副本),基线 8 条、豁免 1 条不变。`-c code tests --check --warn-lines 800 --fail-lines 800 --entry-warn-lines 300 --entry-fail-lines 300` → FAIL(5 项)→ FAIL(3 项),剩下的 `apps/web/src/components/cosmos/connection-panel.tsx`、`packages/application/src/workflow-host-runtime.test.ts`、`packages/storage-prisma/src/workflow-host-store/activity-store.ts` 都是真实未登记项(已记在 `split-backlog.md` §1),说明修复没有把真违规一起藏掉。
- **夹具实跑**(临时 git 仓库,四个文件:`docs/kept.md` 已跟踪、`docs/untracked-but-counted.md` 未跟踪、`.worktrees/wt1/docs/skipped.md` 被忽略目录下、`.local/skipped2.md` 被忽略):`is_ignored` 对被忽略的两个返回 True、对未跟踪但未忽略的返回 False——**「还没 add」没有被误当忽略**,这是门禁最容易漏掉新超标文件的地方。fixture 已删除。
- **交叉引用更新**:`../README.md` 的 G17 索引行改「已完成收口」并写入拆分与脚本修复结论;`split-backlog.md` §5 两条改写(该四个文件已收口、`.worktrees` 幻影 FAIL 的根因与修复);本任务 README 的 `Current State`、切片表 5、Decisions(加一条「偏离一次:同批修了门禁脚本」)、Follow-ups(缺陷条目改为已修复)同步。
- **验证**:`bun run docs:check` → 0 失败、`checkedFiles: 1169`、exit=0;`-c docs --check` → PASS(含 warning),5 条 warning 全是基线内增长;`git diff --check` 干净(先把 walkthrough 里 PowerShell `Add-Content` 写入的一处 CRLF 归一成 LF,复跑 CR=0)。
- **独立守恒复核**(不依赖拆分脚本自检):对每个 `git show HEAD:<主文档>` 取非空行,与「新主文档非空行 + 全部分册非空行(去掉 front matter)」比对;直接把分册行当原文比会报 43 / 4 / 16 / 10 条「丢失」,**正好等于各自分册里被加了一层 `../` 的链接行数**;把分册行的 `](` + `../` 归一成 `](` 后四份**丢失均为 0**。说明唯一的内容差异就是链接深度。
- **改动面**:4 份主文档瘦身 + 19 个新分册 + `docs-baseline.json` + `scripts/size-governance.py` + 3 份治理文档(`G17/README.md`、`G17/walkthrough.md`、`../README.md`、`split-backlog.md`),共 30 个文件、`+1931 / −1567` 行(不含脚本与治理文档的后续改动)。按维护者 2026-10-26 授权提交到 master。
- **未运行**:浏览器验收、真实来源验收、全量测试(纯文档 + 门禁脚本改动,未触碰运行时;门禁脚本用夹具与两次真实跑验证)。
