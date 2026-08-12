# Cosmos 文档体系

- `../CONTEXT.md`：产品共同语言，记录经常使用、跨模块或容易歧义的核心概念、关系和待讨论边界；不作为完整实体清单。
- `requirements/0001-original-requirements.md`：用户原始需求的 append-only 真相源。新增轮次追加原文，不修辞、不归纳、不把解释写回原文。
- `requirements/0002-product-requirements.md`：当前整理后的完整产品需求，维护需求编号、阶段、验收条件、使用场景和待决策项。
- `architecture/0001-cosmos-foundation.md`：总体架构、运行时、存储、扩展和阶段设计。
- `architecture/0002-information-model.md`：Entry、Story、Topic、相关推荐、热点、Workspace 与 Artifact 的详细模型。
- `api/`：Product Service、Worker Admin、Worker Gateway、DTO、失败场景和
  conformance Draft v0.2；包含五路只读审查和主审 disposition。字段与端点只有
  进入公共 schema 和行为测试后才算已实现。
- `adr/`：已经稳定且改回成本较高的架构决定。
- `adr/0002-nb-workflow-kernel-cosmos-host.md`：当前 Workflow Kernel、可选
  Backend、Cosmos Host、TaskStore/WakeupBus 和 Agent Extension 的稳定决定。
- `adr/0003-service-worker-api-boundaries.md`：Product Service、Worker Admin、
  Worker Gateway、HTTPS long-poll 和 Action execution placement 的稳定决定。
- `research/`：外部项目、数据源、算法和技术验证材料。
- `tasks/`：重大任务的持续 walkthrough，记录计划、实现、验证、偏差和实现级后续。
- `tasks/06-nb-workflow-kernel-convergence/README.md`：后续在独立任务中把固定
  Ingest 从 Cosmos 平行脚本 Runtime 收敛到 `nb-workflow` Kernel 的实施入口；
  当前设计已同步、实现暂停，阻塞于 `nb-workflow` 稳定门禁。
- `tasks/06-nb-workflow-kernel-convergence/walkthrough.md`：记录本轮文档收口、
  当前实现偏差、三份未来输入和停止边界。

当前文档状态分层：

```text
Accepted ADR
-> 稳定架构决定

docs/api Draft v0.2
-> 已审查、尚未实现的 API/DTO 目标合同

Task 04
-> 未合并 Workflow Runtime Spike 的历史证据

Task 06
-> 实现暂停；先稳定 nb-workflow，再实现 Cosmos Worker/Host
```

后续顺序是 `nb-workflow` Kernel/conformance → Cosmos 本地 Worker/Durable Host
→ Worker Admin → 远程 Worker Gateway。Draft、Spike 和目标架构都不能写成当前
已交付能力。

读取顺序通常是：需求原文 → `CONTEXT.md` 中的产品共同语言 → 当前 PRD → 当前架构 → 对应 Task → 相关 ADR / Research。
