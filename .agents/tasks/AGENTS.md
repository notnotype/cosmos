# Task Agent 规则

Task 的用途、命名和最小内容由 [`README.md`](README.md) 定义。本文件只约束 Agent 在 Task 内的执行动作：

- 创建、推进或审查 Task 前，读取任务索引、目标 Task、相关需求、架构、ADR、[`docs/spec/`](../../docs/spec/) 和 [`docs/testing/`](../../docs/testing/)；合同不清楚时先回到对应权威文档。
- 每轮按[仓库开发生命周期](../../docs/standards/repository-workflow.md#开发生命周期)选择最短 Skill 链；编辑前在 Task 的唯一过程记录中明确本轮切片和仍有后果的假设。
- 历史 Task 保留原编号、目录名和正文。只更新当前任务需要的活跃链接，不批量规范化历史叙述或审计事实。
- Task README 只维护当前摘要、范围、门禁和下一步；已有 `walkthrough.md` 时，它是过程、偏差和验证的唯一 append-only 记录。没有独立 walkthrough 的 Task 才在 README 追加这些记录；同一证据不得双写，旧记录不得覆盖。
- RED、GREEN、实际运行验证、五轴 review finding、范围偏差和未运行项写入 walkthrough 或 README 的唯一记录位置；不把同一证据复制到两个文件。
- Agent Skill 的通用计划约定服从本仓库 Task 体系；实施计划写入现有 Task，不创建 `tasks/plan.md`、`tasks/todo.md` 或第二 tracker。
- Task 记录一次实现，不替代需求、架构、ADR 或当前实现规格。新行为落地后同步对应权威文档。
- 阻塞、范围偏差、完整验证命令、实际结果和未运行项必须明确记录；正式证据先脱敏，运行数据留在测试规范指定的隔离根。
