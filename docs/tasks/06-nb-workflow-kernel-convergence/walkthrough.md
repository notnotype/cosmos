# Task 06 Walkthrough：`nb-workflow` Kernel 与 Cosmos Host 收敛

> 状态：Documentation baseline / implementation paused
>
> 日期：2026-08-11
>
> Task：[`README.md`](README.md)

## 1. 本轮目标

本轮只把已经讨论并审查的 Workflow Kernel、Cosmos Host、Product Service、
Worker Admin、Worker Gateway 和实施顺序同步到文档。没有修改 Cosmos 或
`nb-workflow` 的运行时代码，也没有开始 convergence。

## 2. 已接受决定

- `nb-workflow` 是唯一规范脚本 Kernel，负责 Activity identity/fingerprint、
  replay、稳定并发、等待、取消和通用 Backend Port。
- Cosmos 保留 Durable Host、SQL TaskStore、Job/Attempt/Lease、Outbox、Worker
  Supervisor 和领域事务。
- TaskStore 是任务权威，WakeupBus 只负责可选通知。
- Product Service、Worker Admin 和 Worker Gateway 是三个独立协议面。
- Worker Admin 不提供同步 Job execute；Gateway 不持有第二套任务终态。
- API 目标是 manifest-only，Worker 目标是 executable-only，Migrator 独立。
- Agent/Harness、Redis、PostgreSQL/S3 和远程 Gateway 继续后置。

## 3. 当前实现与目标偏差

当前未合并的 Cosmos Task 04 worktree 已验证固定 Ingest、Prisma Workflow
Run/Job/Lease、Outbox、Worker 接管、Source snapshot、checkpoint CAS、Node 和
浏览器链路，但 `packages/workflow-runtime` 同时实现了独立脚本 replay Kernel。
它与 `nb-workflow` 在 Activity identity、fingerprint、query journal、`map/all`
和等待/恢复语义上存在形成双重真相的风险。

`docs/api/` Draft v0.2 已经完成五路只读审查，但当前公共 Zod schema、NestJS
Controller、Worker Admin Server 和 Worker Gateway 尚未实现。Draft 不是当前
路由清单，也不是生产 v1 冻结合同。

## 4. 为什么暂停 Cosmos Runtime 扩展

继续在 Cosmos 内扩展或拆分平行 Kernel，会先固化第二套 replay 语义，再承担一次
删除或兼容迁移。后续先让 `nb-workflow` 在独立任务中稳定 Kernel API、Memory
Backend 和 conformance；Cosmos 只在这些合同稳定后实现 Backend/Host Adapter。

Task 04 的价值保留为恢复、lease、Outbox、Ingest parity、迁移和生产验收证据，
而不是未来规范 Runtime 的源码入口。

## 5. 后续实施顺序

```text
独立规划 nb-workflow
-> 稳定 Kernel API / Memory Backend / conformance
-> 重新审计 Cosmos 与 nb-workflow worktree
-> 以 Task 04 Spike 证据建立 Cosmos Prisma Backend/Host
-> 固定 Ingest parity
-> 按 docs/api Draft v0.2 收敛 Product API 和本地 Worker
-> 实现 Worker Admin
-> 最后考虑远程 Worker Gateway
```

进入 `nb-workflow` 规划前必须重新核对其 dirty `master`、外部 worktree、当前测试、
公开 API、取消/usage 修改和发布/依赖策略。上述检查只是未来任务前置，本轮没有
执行或改变 `nb-workflow`。

## 6. 本轮验证边界

本轮只运行 Markdown 链接、围栏、EOF、尾随空白、需求编号、原始需求 append-only、
状态术语和 `git diff --check`。代码测试、typecheck、build、Node、浏览器、Docker、
真实来源、恢复和 Agent 均未运行。

实际结果：

- `git diff --check -- CONTEXT.md PROJECT-STATUS.md README.md docs`：通过；
- Markdown 文件 49 个，相对链接错误 0、未闭合围栏 0、EOF 错误 0、尾随空白
  0、冲突标记 0；
- PRD 定义型需求 ID 164 个，重复 0；
- 原始需求相对 `HEAD` 为新增 28 行、删除 0 行；
- 编辑前后非文档 dirty 项均为 77 个，综合 SHA-256 均为
  `7aa14ea29ec056cd6f8b81f991a57cbabac2803dbdba825d81b64aa90e0c6826`，
  证明本轮没有改变代码、migration、依赖、Docker 或既有删除状态。

本轮不 commit、push、创建远端、PR、合并或清理既有 dirty worktree。完成文档
一致性检查后停止。
