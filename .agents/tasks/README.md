# Task Walkthroughs

重大功能、数据合同、扩展协议、运行时恢复或用户主流程使用一个持续更新的 Task。

目录名使用 `{NN}-{kebab-case-name}`。同一功能后续调整继续更新原 Task，不创建碎片化记录。

每个 Task 至少记录：

- User Request / Topic
- Goal
- Scope / Non-goals
- Current State
- Decisions and Deviations
- Implementation Walkthrough
- Verification
- Follow-ups

活跃 Task 的当前实施切片还必须记录：生命周期阶段、一个连贯目标、最多三条可观察验收、依赖、受影响合同、预计核心文件和验证层级。切片规则与完成条件以[仓库开发生命周期](../../docs/standards/repository-workflow.md#开发生命周期)为准；同一 Task 可顺序追加多个小切片，不为每个切片创建新 Task。

跨 Task 的产品 TODO 在建立远端 Issue 系统后迁移到 Issue；在此之前由 `PROJECT-STATUS.md` 汇总。

Task 导航：

- [`02-rss-ingestion/`](02-rss-ingestion/)：Phase 1 RSS/RSSHub、fixture 录入、离线查询与最小 Story projection。
- [`03-runtime-logging/`](03-runtime-logging/)：API、Worker、Connector、存储和 Web 服务端的结构化运行日志。
- [`04-workflow-runtime/`](04-workflow-runtime/)：Durable Workflow、Job 恢复、Connection/Adapter、Knowledge/Research 和 Harness 边界的持续研究与实现记录。
- [`05-normalized-content-model/`](05-normalized-content-model/)：`NormalizedIngestItem`、Publisher、ContentKind、ContentMetrics 和 TemporalValue 合同。
- [`06-nb-workflow-kernel-convergence/`](06-nb-workflow-kernel-convergence/)：`nb-workflow` Kernel 与 Cosmos Host 的收敛记录。
- [`07-deferred-workflow-host/`](07-deferred-workflow-host/)：Deferred Activity、Cosmos Durable Host、Activity Job、固定 Ingest parity 和 Worker Admin 实施记录。
- [`08-project-governance/`](08-project-governance/)：治理目录、Proposal、工程标准、测试流程、Task 路径和文档门禁收敛。
- [`09-react-component-lab/`](09-react-component-lab/)：React 组件实验室、组件/场景登记合同、开发态工作台和现有 Web 产品组件采用。

当前提交基线、验证结果和未完成边界只在 [`../../PROJECT-STATUS.md`](../../PROJECT-STATUS.md) 维护。

实现规格入口：[`../../docs/spec/README.md`](../../docs/spec/README.md)。先读 spec 索引与公共合同，再按组件读取
spec 和测试锚点；Task walkthrough 记录过程与偏差，不替代已合入实现规格。
