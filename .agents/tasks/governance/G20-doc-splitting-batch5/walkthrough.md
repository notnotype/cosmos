# G20 文档治理过程记录

## 2026-11-17：切片 0，范围、实测与切法

维护者指出文档体量门禁有 2 项既有违规并指定治理对象。工作区为主工作区 `master`，代码基线 `15f7987`；开始时工作区已含其它任务未提交的代码改动，本轮不触碰，只写五份文档与 G20 记录。方案已由维护者确认：按提案拆分落回健康区、新建 G20 记录，不走基线登记。

实测（`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new`）：

| 对象 | 字节 | token | 触线档位 | 判定 |
|---|---:|---:|---|---|
| `PROJECT-STATUS.md` | 28,850 | 9,191 | 字节健康、token 超 9,000 | FAIL：未登记文件进警戒区 |
| `walkthrough/01-implementation-2026-10.md` | 31,058 | 9,907 | 字节 > 30 KB 且 token > 9,000 | FAIL：同上 |

切法依据与取舍：

1. `PROJECT-STATUS.md` 走 §4.5「状态型混合文档只切历史」。膨胀点在「当前下一步」：Task 42／42 修复／Task 42 隔离验收／Task 40／Task 38／Task 39／Task 36／Task 35 八段都是已完成任务的完成补记，属历史切片。该节其余内容（已指向分册的 2026-09 摘要、本次未纳入仍开着的项、Phase 3 入口状态）是有效边界，保留。
2. `01-implementation-2026-10.md` 走 §4.4「按日期边界继续下钻」。文件名编码范围是 2026-10，正文却混入 2026-11-04 阶段 1/2 与 2026-11-05 代码审查；把这 267 行整体迁出，01 收窄为 2026-10，新册承接 2026-11。没有选「只切 11-05 一节」的最小切法，因为那会让同册继续混两个月份，下次越线又要重切。
3. 两份对象都不进 `docs-baseline.json`：它们是未登记的新增越线，登记会与「条目只减不增」的收敛目标相反。

数字预估（切分前）：主文档迁走 44–58 行（5,075 B / 1,666 token）；01 迁走 252–518 行（11,295 B / 3,566 token）。两份新册均远低于 30 KB，四份预期全部回到健康区。

## 2026-11-17：切片 1，拆分与链接层级修正

机制：脚本从 `git show HEAD:<path>` 读原文，按断言定位行区间，整段移动，只对迁入子目录的相对链接加一层 `../`（`PROJECT-STATUS/` 前缀改为同级）；分册新增 front matter（`parent`、`range`、`sealed_at`、`tags`、`tokens_est`）、H1 与返回导航行。

PROJECT-STATUS 迁出段落的 12 个相对链接全部重写并逐条确认目标存在：7 个 `.agents/tasks/...` 加 `../`；4 个 `docs/spec|adr/...` 加 `../`；1 个从同目录 `history-2026-10-task36.md` 改为同级。01 的迁出段落没有相对链接，进入同目录 02 后保持原样。

结果：

| 文件 | 拆分前 | 拆分后 | 说明 |
|---|---:|---:|---|
| `PROJECT-STATUS.md` | 28,850 B / 9,191 token | 24,796 B / 7,855 token | 原位留当前状态摘要（6 个新增行）与分册索引行 |
| `PROJECT-STATUS/history-2026-11-completed-tasks.md` | — | 5,568 B / 1,817 token | 2026-11-13 ~ 2026-10-08，7 段 |
| `walkthrough/01-implementation-2026-10.md` | 31,058 B / 9,907 token | 19,890 B / 6,380 token | `range` 收窄为「2026-10 实施与验收准备」，`tokens_est` 10000 → 6380，末尾留一行指向 02 |
| `walkthrough/02-acceptance-2026-11.md` | — | 11,765 B / 3,709 token | 2026-11-05 ~ 2026-11-04，阶段 1/2 与代码审查 |
| `walkthrough.md` | 22,498 B / 7,269 token | 22,688 B / 7,325 token | 顶部一条归档链接改为两册索引 |

偏差 1（已修正）：首轮 rebase 只处理了 `.agents/` 与 `PROJECT-STATUS/` 两个前缀，漏掉 Task 42 段落中的 4 个 `docs/` 链接，生成的分册会带 4 条断链。读生成文件时发现。改为「除 `http(s)://`、`#`、`/`、`../` 外的相对目标统一加 `../`」，从 `git show HEAD:` 原文重新生成，12 处全部重写。首轮产物未入库、未进入任何验证结论。

偏差 2（环境，非内容）：首轮写入时 python 子进程对工作区的写入被 DSH 沙箱按策略拒绝（`[sandbox: file access denied under workspace-write mode]`），无法用脚本直接落盘。会话随后切换为完全权限后，用修正版脚本重跑；原文始终从 `git show HEAD:` 读取，不依赖工作区里可能被首轮污染的副本。

## 2026-11-17：切片 2，验证

| 命令 | 结果 |
|---|---|
| `python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` | 修复前 exit 1 / FAIL（2 项违规）；修复后 exit 0 / `PASS（含 warning）`，扫描 448 个文件、基线 3 条、豁免 1 条，唯一 warning 是 `CONTEXT.md 37.37 KB > 登记 37.24 KB`（既有，与本次无关） |
| `bun run docs:check` | exit 0，`failures: []`，workspace 模式、快照 1342 文件；两个新分册进入 `metadataFiles`（元数据校验），4 个新增 Markdown 进入 `whitespaceFiles`（新增空白校验） |
| `.agent/tmp/g20-verify.py`（临时脚本，未入库） | 36 项检查 0 失败：迁入段落归一化链接后与原文逐字一致；主文档保留部分去掉 6 个新增行后与原文（去掉 44–58 行）逐行一致；01 保留部分除 `range`/`tokens_est` 与末尾链接行外逐行一致；标题/围栏/列表守恒；两册链接目标全部存在；两册 `tokens_est` 与实际估算偏差 <5%；四份文件全部 ≤30 KB 且 ≤9,000 token |
| `git diff --check`（本轮 4 个已跟踪文件） | exit 0；4 个新文件另做 EOF 换行、尾随空白与 CRLF 检查，0 问题 |

验证脚本首版把代码块里的 `#` shell 注释误判为 H1、把带 `#fragment` 的链接误判为断链；修正脚本（标题统计排除围栏内行、断链检查剥离片段）后 0 失败。这是验证脚本缺陷，不是文档缺陷。

偏差 3（已修正）：G20 README 首版把 Task 40 的三条链接写成 `../../../40-story-content-representation/...`，多上跳一层，`docs:check` 报 3 条断链；改为 `../../` 后 0 failures。README 的其余链接（仓库根以下三处）层级正确。

文档影响：本轮只改 `PROJECT-STATUS.md`、Task 40 的三份 walkthrough 文档、治理索引与 G20 记录本身；需求、架构、ADR、`docs/spec/`、`docs/testing/` 无需更新，因为它们既不记录文档体量，也未引用被移动段落的锚点。`docs/doc-governance/docs-baseline.json` 不变（两份对象未登记，拆完直接健康）；`split-backlog.md` 是代码拆分台账，不涉及本轮。

未运行：全仓单元/集成测试、类型检查、构建、浏览器与真实来源验收、CI、外部 URL 可达性检查、完整 Markdown 渲染；未提交、未推送、未创建 worktree 或分支。`docs:check` 通过只证明文档静态层，不替代上述各层。
