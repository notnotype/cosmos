---
parent: docs/spec/storage/0001-prisma-repository.md
range: 分册勘误登记（追加型台账）
sealed_at: 2026-11-02
tags: [spec, storage, errata]
tokens_est: 446
---

# 分册勘误登记

分册封口后只读；对已封口分册的更正登记在此，不改写分册正文。当前口径以本台账与被引用分册未受勘误影响的部分为准。

## 勘误 1：来源 snapshot 的运行诊断合并 legacy Run 与 WorkflowRun

[`part-01-domain-model.md`](part-01-domain-model.md) 的「Source、legacy Run/Step/Job」小节写：Source snapshot 解析 `kind/config` 后额外查询最新 Run，`lastRunAt` 优先取 `finishedAt`、否则取该 Run 的 `createdAt`，`lastError` 取最新 Run 的 `errorMessage`。这句话只描述了 legacy `Run` 一路，漏记 durable `WorkflowRun`：来源 snapshot 的最新运行诊断由两路合并得出。

- 两路各取该来源最新一条：legacy `Run` 与 `WorkflowRun` 分别按来源取最新行。
- 合并取更近的一条，时刻为 `finishedAt ?? createdAt`；两条时刻相同时 legacy `Run` 胜。
- `lastRunAt` 取所选那行的时刻，`lastError` 取同一行的 `errorMessage`，不跨两行拼装。

实现位置是 `packages/storage-prisma/src/repository/source-projection.ts` 的 `mergeRunDiagnostics`；`listSources()` 与 `getSource()` 共用同一投影，单条读与列表读不会对同一来源给出两个答案。漏记发生在分册封口之前，不是后续行为变更。
