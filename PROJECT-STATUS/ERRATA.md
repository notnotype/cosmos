---
parent: PROJECT-STATUS.md
range: 封口分册勘误登记（追加型台账）
sealed_at: —
tags: [project-status, errata]
tokens_est: 350
---

# 封口分册勘误登记

分册封口后只读；对已封口分册的更正登记在此，不改写分册正文。

## 2026-11-04：归档标签 `b8a1701` 不存在

涉及分册：[`history-2026-08-reviews.md`](history-2026-08-reviews.md)、[`history-2026-09-phase1.md`](history-2026-09-phase1.md)。

两册都写着「Worker Registry 的完整实现存在于归档标签 `archive/t04-workflow-runtime-spike-wip-20260818` 的 `b8a1701`」。核实结果：本仓库没有任何 ref 指向该标签，`b8a1701` 不是可解析的提交对象，`origin` 与 `upstream` 也没有这个标签；`packages`/`apps`/`plugins` 的 `.ts`/`.tsx`/`.prisma` 里 `WorkflowWorkerRegistration`、`workflow-worker-registry`、`no_capable_worker` 全部零命中，代码路径上 `git log --all -S` 也是零提交。

因此正确的说法是：这些能力从未出现在本仓库的提交历史里，归档 Round 78–97 只是当时的文字记录，不能当作实现证据。两册关于「当前 `master` 尚未实现」的结论不变，需要作废的只是「实现存在于某个归档标签」这一句。
