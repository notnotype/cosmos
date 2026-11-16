# 治理任务 G20：文档治理第五批——两份刚越健康区的主文档拆分

## 请求与范围

维护者 2026-11-17 指出文档体量门禁有 2 项既有违规并要求治理：`PROJECT-STATUS.md`（28.17 KB / 9,191 token）与 Task 40 的 `.agents/tasks/40-story-content-representation/walkthrough/01-implementation-2026-10.md`（30.33 KB / 9,907 token）。两者都未登记基线，`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 因此 `FAIL（2 项违规）`。

按[超大文档治理提案](../../../../docs/proposals/oversized-doc-splitting-v1.md)处置：状态型混合文档按 §4.5 只切历史（`PROJECT-STATUS.md` 保留当前快照、有效边界与分册索引）；已封口分册按 §4.4 继续下钻，按日期边界切成两个都落在健康区的册；两条都不进基线。

| 对象 | 处理 |
|---|---|
| [PROJECT-STATUS.md](../../../../PROJECT-STATUS.md) | Task 35/36/38/39/40/42 的完成补记（原「当前下一步」44–58 行）迁入 [history-2026-11-completed-tasks.md](../../../../PROJECT-STATUS/history-2026-11-completed-tasks.md)，原位留当前状态摘要与有效边界 |
| [01-implementation-2026-10.md](../../40-story-content-representation/walkthrough/01-implementation-2026-10.md) | 2026-11-04 阶段 1/2 与 2026-11-05 代码审查（原 252–518 行）迁入 [02-acceptance-2026-11.md](../../40-story-content-representation/walkthrough/02-acceptance-2026-11.md)，01 的 range 收窄为 2026-10 |
| [Task 40 主 walkthrough](../../40-story-content-representation/walkthrough.md) | 顶部单条归档链接改为两册索引 |

不在范围：产品代码、测试、基线登记、创建 worktree/分支、commit/push/PR/merge/部署，以及其它任务未提交的工作区改动。

## 当前摘要

状态：实施与静态验证完成（2026-11-17），未提交，等待维护者验收。主工作区 `master`，基线 `15f7987`；工作区此前已含其它任务未提交改动，本轮只改上述五份文档并新建 G20 记录，不触碰其余文件。

结果：`PROJECT-STATUS.md` 28,850 → 24,796 B（7,855 token），`01-implementation` 31,058 → 19,890 B（6,380 token）；两个新分册 5,568 B（1,817 token）与 11,765 B（3,709 token），四份均在健康区。大小门禁由 FAIL 转 `PASS（含 warning）`，只剩 `CONTEXT.md` 的既有基线内增长 warning；`bun run docs:check` 0 failures。

## 责任与审核

- 维护者：任务 Leader 与最终审核人；本轮方案已由维护者确认（拆分而非登记基线、新建 G20 记录）。
- 主代理：唯一文档写入者，负责切分、链接层级修正、内容守恒核对与门禁。
- 代码实现代理不参与：本轮不改代码、不写共享基线。

## 切片与完成标准

| 切片 | 可观察验收 | 状态 |
|---|---|---|
| 1：拆分与链接收口 | 移动段落逐字一致，仅相对链接按层级修正；两册元数据有效 | 完成 |
| 2：验证 | 大小门禁 PASS、`docs:check` 0 failures、标题/围栏/列表与行级守恒比对通过、`git diff --check` 通过 | 完成 |

过程、命令、结果、偏差与未运行项只追加到 [walkthrough](walkthrough.md)，不在此重复维护证据。
