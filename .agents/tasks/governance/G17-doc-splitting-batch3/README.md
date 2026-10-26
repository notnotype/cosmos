# 治理任务 G17:文档治理第三批——剩余红线文档收敛

## User Request / Topic

维护者 2026-10-26 指示「开一个文档治理任务,编号按序分配,目标是处理红线区文件」。

本任务承接 [`docs/proposals/oversized-doc-splitting-v1.md`](../../../../docs/proposals/oversized-doc-splitting-v1.md)(accepted)§2 目标 3 与 §4.1「红线优先」:G01(2026-09-11)处理了首批四个头部文档,G04(2026-09-14)处理了第二批四份,本批处理 2026-10-26 实测仍留在基线红线区的 4 份 `docs/spec/` 文档。

## Goal

4 份红线文档全部落回健康区(主文档 ≤30 KB 且 ≤9k token),被移走的内容按 §4.3 移入同级分册(单册 ≤30 KB,硬上限 50 KB),拆分前后标题与行级守恒、相对链接与锚点同批修复;`docs/doc-governance/docs-baseline.json` 的登记条目只减不增。

## Scope

范围(证据:2026-10-26 本地实测,命令见 Verification;基线值取自 `docs/doc-governance/docs-baseline.json`):

| 文档 | 字节 | 行 | token 估算 | 基线登记 | 超出 |
|---|---|---|---|---|---|
| `docs/spec/interfaces/0005-web-client.md` | 70,139 | 743 | 22,639 | 41,785 | +28,354 |
| `docs/spec/storage/0001-prisma-repository.md` | 59,506 | 237 | 18,057 | 45,279 | +14,227 |
| `docs/spec/interfaces/0002-product-api-http.md` | 58,614 | 567 | 17,311 | 42,765 | +15,849 |
| `docs/spec/contracts/0001-public-contracts.md` | 53,756 | 216 | 16,288 | 40,427 | +13,329 |

四份**字节与 token 双超红线**(>50 KB 且 >15k token),属 §4.2「双轨同时触发」,不存在口径歧义。四份都在基线内且相对登记值继续增长,所以当前只报 warning、不阻塞 CI——本任务是把这 4 条 warning 消掉并退出基线。

`docs/requirements/0001-original-requirements.md`(59,793 B / 20,313 token)**不在本任务范围**:它按原话追加规则只增不减,已按 §4.10 在根 `.docs-size-exemptions.yml` 显式豁免(`review_after: 2026-12-31`,登记值与理由都在该文件里),不属于「必须拆」的对象。

**非目标**:不动代码(代码侧红线对象见 [`../README.md`](../README.md) 与 [`../split-backlog.md`](../split-backlog.md));不拆 30–50 KB 警戒区文档(`docs/api/0002-product-service-api.md` 42.3 KB、`.agents/tasks/40-…/walkthrough.md` 40.8 KB 等,先由各自负责人按 §4.2 让新增内容进分册);不重写 spec 语义(只移动内容);不处理 `.worktrees/fix-t39-provider-feedback/` 下的同名副本(该目录被 `.gitignore` 忽略,CI 克隆里不存在,见 `split-backlog.md` §5);不处理 `docs/doc-governance/scan-2026-09-10.md` 这类历史扫描报告。

## 拆分接缝(实测节大小,供切片 1–4 定分册边界)

四份都是 spec 固定章节模板(`## 组件定位 / 概念与定义 / 外部行为 / 输入 / 输出 / 状态与持久化 / … / 非目标/边界`),按 §4.3「参考清单 → 按域分册,主文档只留使用说明和索引」处理。各文件最大的 `##`/`###` 节实测如下(字节含节内全部行):

| 文档 | 最大节 | 字节 | 行 |
|---|---|---|---|
| `0005-web-client.md` | `## 外部行为`(L139) | 20.5 KB | 195 |
| | `## 输出`(L372) | 9.0 KB | 88 |
| | `## 概念与定义`(L68) | 7.2 KB | 71 |
| `0001-prisma-repository.md` | `### Checkpoint、领域查询、事件 replay`(L80) | 23.0 KB | 29 |
| | `## 状态与持久化`(L121) | 10.4 KB | 48 |
| `0002-product-api-http.md` | `### Content query`(L250) | 14.4 KB | 91 |
| | `### Source 资源`(L136) | 11.3 KB | 68 |
| `0001-public-contracts.md` | `### Feed、Entry、Story 与事件 DTO`(L79) | 18.1 KB | 29 |

两条已确认的约束:

- **无锚点引用**:四份在全仓分别被 35 / 65 / 28 / 38 个文件按路径引用,带 `#` 锚点的引用为 **0** 处。所以只要主文档路径不变、分册放在主文档同名子目录,既有引用不需要改动。
- **单节不超 30 KB**:最大的 `### Checkpoint、领域查询、事件 replay` 是 23.0 KB,单节直接成册即可,不触发 §4.4 的再下钻;分册边界按章节分组时仍需按字节紧排,避免拼出 >30 KB 的册。

## Current State

**切片 0–5 全部完成**(2026-10-26)。切片 0 交付:红线范围核定(4 拆 1 豁免)、拆分接缝实测、编号与目录建立。切片 1–4 把 4 份文档拆成 4 个主文档 + 19 个分册(`docs/spec/{interfaces,storage,contracts}/<文档名>/`),主文档从 68.50 / 58.11 / 57.24 / 52.50 KB 压到 **7.85 / 4.23 / 4.57 / 4.59 KB**,单册最大 23.19 KB(`0001-prisma-repository/part-02-checkpoint-and-queries.md`)/ 7.3k token,19 册全部 ≤30 KB 且 ≤9k token,四份行级守恒丢失 0 条。切片 5 把 4 条基线条目从 `docs-baseline.json` 移除(12 → 8 条),`docs:check` 0 失败。

门禁现状:`-c docs --check` **PASS(含 warning)**:0 违规、0 新增红线,只剩 5 条「基线内文件增长」warning(不阻塞,均属既有基线内文件)。收口时同批修掉了 `scripts/size-governance.py` 的 `.worktrees` 跳过缺陷(原先每次本地门禁都报 5 条 CI 上不存在的幻影 FAIL,见 Decisions 最后一条);带 `--fail-on-new` 时仍 FAIL 1 项——`.agents/tasks/40-story-content-representation/walkthrough.md` 40.8 KB 未登记,归 Task 40 负责人,不属本任务范围。

编号说明:本任务按 [`../README.md`](../README.md)「编号分配由维护者裁决,或按序列顺延后报维护者确认」顺延取 **G17**(现有最大为 G16;`G08` 有两个目录并存,是历史遗留,不影响顺延),维护者 2026-10-26 已确认。

## Decisions and Deviations

- **一批文档一个 G 任务、按文档切片**(沿用 G01/G04 粒度),不一份文档一个编号;若维护者要求逐文档独立编号,本任务顺延占用 G17–G20,目录更名即可(尚无实施内容,零迁移成本)。
- **四份全部判拆,不走豁免**。§4.1「不拆」只对未触犯 §4.2 阈值的文档成立;四份双超红线,按「红线优先」处理。豁免清单的语义限定为「按规则只增不减、不适用滚动归档的追加型真相源」(现存唯一条目 `docs/requirements/0001-original-requirements.md` 正是这一类)。
- **主文档只留使用说明 + 索引**,不留「架构不变量」类内容——这四份是接口/存储/合同的参考型规格,不是广域设计文档,§4.3 对参考清单的口径是主文档瘦身为索引。
- **分册按章节边界切,不按固定字节一刀切**;单册超 30 KB 继续下钻(§4.4)。
- **拆分在主工作区直接进行**(纯文档改动,G01/G04 先例),不建 worktree;涉及提交/推送时按仓库规则另行获授权。
- **偏离一次:同批修了门禁脚本**(2026-10-26,维护者批准)。原非目标是「不动代码」,但收口时发现 `scripts/size-governance.py` 跳不过被整目录忽略的路径,本地每次门禁报 5 条 CI 上不存在的幻影 FAIL——不修就无法验证本任务的成果(拆完也看不到 PASS),且幻影会掩盖将来的真实违规。维护者在「单开任务 / 本轮改 / 只登记」三个选项里选了本轮直接改,改动范围限于 `ignored_paths` 的匹配方式与 `SKIP_DIRS` 一项,未触及阈值、类目与输出格式。
- 过程、偏差与验证命令及结果写入 append-only [`walkthrough.md`](walkthrough.md);本 README 只维护摘要、范围、门禁与下一步,同一证据不在两处双写。

## Implementation Walkthrough

| # | 切片 | 验收(≤3 条/片) | 状态 |
|---|---|---|---|
| 0 | 口径裁定:红线范围核定、豁免项归属、拆分接缝实测、编号与目录建立 | 范围表与实测数字一致;豁免判定有明确依据;`docs:check` 与文档门禁基线已记录 | done(2026-10-26;见 walkthrough) |
| 1 | `docs/spec/interfaces/0005-web-client.md` 按节分册 | 主文档 ≤30 KB 且 ≤9k token;单册 ≤30 KB;标题多重集与行级守恒 | done(2026-10-26;主文档 7.85 KB/2.6k token,6 册最大 20.66 KB,见 walkthrough) |
| 2 | `docs/spec/storage/0001-prisma-repository.md` 按节分册 | 同上 | done(2026-10-26;主文档 4.23 KB/1.3k token,5 册最大 23.19 KB,见 walkthrough) |
| 3 | `docs/spec/interfaces/0002-product-api-http.md` 按节分册 | 同上 | done(2026-10-26;主文档 4.57 KB/1.4k token,5 册最大 15.95 KB,见 walkthrough) |
| 4 | `docs/spec/contracts/0001-public-contracts.md` 按节分册 | 同上 | done(2026-10-26;主文档 4.59 KB/1.5k token,3 册最大 22.38 KB,见 walkthrough;因孤峰节越线返工一次) |
| 5 | 收口:基线只减不增、门禁复跑、`docs:check`、`split-backlog.md` 交叉引用更新、walkthrough 回写 | 文档门禁 PASS 且 4 条条目已从基线移除;全仓 `docs:check` 0 失败 | done(2026-10-26;基线 12→8 条,`docs:check` 0 失败/1169 文件。维护者在收口时批准**同批修掉**门禁脚本的 `.worktrees` 跳过缺陷,修后 `-c docs --check` 由 FAIL(5 项幻影)转为 **PASS(含 warning)**;带 `--fail-on-new` 时仍 FAIL 1 项,是既有未登记的 `.agents/tasks/40-story-content-representation/walkthrough.md`,不属本任务范围) |

切片顺序按字节降序(70.1 → 59.5 → 58.6 → 53.8 KB):先拆最大的那份,若接缝判断有偏差,前三份仍留出足够余量修正后面的切法。

## Verification

每切片:

- `python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` — 文档门禁必须 PASS;拆完的文档条目从 `docs-baseline.json` 删除(只减不增,新分册不进基线)。
- `bun run docs:check` — **必须在实施改动的工作目录内执行**;主工作区跑会因被删/改名文件在那里仍存在而给出假绿灯(根 `AGENTS.md` 验证节)。G01 的教训是「无锚点引用」不能替代这项检查:那次 28 条断链正是分册目录层级变化后相对链接失效。
- 标题多重集与行级多重集守恒(拆分前后逐项比对,丢失数必须为 0);被移走的段落在主文档原位替换为一行链接,不复制。
- `git diff --check` 干净(尾随空白、冲突标记)。

## Follow-ups

- 编号 G17 已由维护者确认(2026-10-26)。
- **门禁脚本缺陷已同批修复**(2026-10-26,维护者批准本轮直接改):`scripts/size-governance.py` 里 `git ls-files --others --ignored` 对整目录被忽略的情况只返回**目录条目**(`.worktrees/fix-t39-provider-feedback/`,带尾斜杠),而 `scan()` 原来用 `rel in skip` 按**文件相对路径**精确比对,永不命中;`SKIP_DIRS` 里也只有 `.worktree`(单数)没有 `.worktrees`。修法:新增 `is_ignored(rel, skip)`——等值命中或用 `rel.startswith(前缀)` 匹配带尾斜杠的目录条目;`SKIP_DIRS` 补 `.worktrees`(与既有 `.worktree` 一致,在遍历前就剪枝)。修后 `-c docs --check` 从 FAIL(5 项 `.worktrees` 幻影)变为 **PASS(含 warning)**,`-c code tests` 从 FAIL(5 项)变为 FAIL(3 项)、剩下的 3 项都是真实未登记(`connection-panel.tsx`、`workflow-host-runtime.test.ts`、`activity-store.ts`)。夹具实跑验证:被忽略目录内的 md 被跳过、`.local` 下的被跳过、**未跟踪但未被忽略的文件仍然计入**(不能把「还没 add」当忽略)。
- 仍阻塞 `--fail-on-new` 的既有项:`.agents/tasks/40-story-content-representation/walkthrough.md`(40.8 KB,未登记警戒区)不在本任务范围,归 Task 40 负责人。
- 拆分脚本:若本批仍是一次性手写脚本,是否把「章节切分 + 守恒校验」并入 `scripts/` 待维护者决定——G04 已提出同一问题,连续三批手写脚本的成本已高于维护一个带 dry run 的工具。
- `docs/requirements/0001-original-requirements.md` 的豁免 `review_after: 2026-12-31` 到期前需复审(该文件 59.8 KB / 20.3k token,继续只增不减)。
- 警戒区观察项(不在本批):`docs/api/0002-product-service-api.md`(42.3 KB)、`.agents/tasks/40-story-content-representation/walkthrough.md`(40.8 KB,未登记,当前阻塞文档门禁)、`CONTEXT.md`(37.2 KB)。
