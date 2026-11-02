# Task Agent 规则

Task 的用途、命名和最小内容由 [`README.md`](README.md) 定义。本文件只约束 Agent 在 Task 内的执行动作：

- 创建、推进或审查 Task 前，读取任务索引、目标 Task、相关需求、架构、ADR、[`docs/spec/`](../../docs/spec/) 和 [`docs/testing/`](../../docs/testing/)；合同不清楚时先回到对应权威文档。
- 每轮按[仓库开发生命周期](../../docs/standards/repository-workflow.md#开发生命周期)选择最短 Skill 链；编辑前在 Task 的唯一过程记录中明确本轮切片和仍有后果的假设。
- 历史 Task 保留原编号、目录名和正文。只更新当前任务需要的活跃链接，不批量规范化历史叙述或审计事实。
- Task README 只维护当前摘要、范围、门禁和下一步；已有 `walkthrough.md` 时，它是过程、偏差和验证的唯一 append-only 记录。没有独立 walkthrough 的 Task 才在 README 追加这些记录；同一证据不得双写，旧记录不得覆盖。
- RED、GREEN、实际运行验证、五轴 review finding、范围偏差和未运行项写入 walkthrough 或 README 的唯一记录位置；不把同一证据复制到两个文件。
- Agent Skill 的通用计划约定服从本仓库 Task 体系；实施计划写入现有 Task，不创建 `tasks/plan.md`、`tasks/todo.md` 或第二 tracker。
- 每项实现交付在 Task 唯一过程记录中给出“需更新/无需更新”的文档影响结论及理由；代码实现子代理只提建议，由主代理审核后另派文档代理修改。触发条件与完整流程见[日常文档更新与代理协作](../../docs/standards/repository-workflow.md#日常文档更新与代理协作)。
- Task 记录一次实现，不替代需求、架构、ADR 或当前实现规格。新行为落地后同步对应权威文档。
- 阻塞、范围偏差、完整验证命令、实际结果和未运行项必须明确记录；安全漏洞的脱敏优先于完整原文，载荷与原始复现命令留在 `.agent/tmp/` 或批准的私密报告渠道。其它正式证据先脱敏，运行数据留在测试规范指定的隔离根。
- 读取 Task 文档遵循根 `AGENTS.md` 的全局读取协议：先读分册索引，`rg` 定位关键词，只读命中分册的相关段落；禁止无理由全量读 >30 KB 文件，确需全量读必须说明理由和 token 预算。
- 向 walkthrough 或 `PROJECT-STATUS.md` 追加记录时遵守文档大小治理：追加型文档接近 20~30 KB 即把更早记录整段移入主文档同名子文件夹的分册（每册 ≤30 KB，文件名编码范围），原位留一行链接；状态型文档只切历史切片，不切当前快照和有效决定。
