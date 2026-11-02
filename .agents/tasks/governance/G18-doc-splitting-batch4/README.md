# 治理任务 G18：文档治理第四批——五条存量增长 warning 收敛

## 请求与范围

维护者 Otirik 在 P0/P1 文档治理自行提交后，明确要求继续 P2，处理五条既有文档大小 warning。该请求按[仓库准入表](../../../../docs/standards/repository-workflow.md#准入决策表)替代公开 Issue 的记录与实施授权；本任务属于不改变行为的机械文档迁移，依据[超大文档治理提案](../../../../docs/proposals/oversized-doc-splitting-v1.md)。

| 对象 | 处理职责 |
|---|---|
| [Product Service API](../../../../docs/api/0002-product-service-api.md) | 目标 API 合同按章节分册，保留 Draft 边界 |
| [测试入口](../../../../docs/testing/README.md) | 保留命令、共同规则与导航，迁出按域证据和验收说明 |
| [规范化内容规格](../../../../docs/spec/domain/0001-normalized-content.md) | 按概念、行为和验收分册，不改当前行为语义 |
| [UI 文案提案](../../../../docs/proposals/ui-copy-review-v1.md) | 迁出证据，保留 reviewing、有效裁定与术语表 |
| [UI 界面职责提案](../../../../docs/proposals/ui-surface-ownership-v1.md) | 迁出证据，保留 accepted、有效决定与勘误 |

不在范围：应用代码、产品合同变化、真实数据、封口分册正文、其它存量基线、commit、push、PR、merge、发布或部署。

## 当前摘要

状态：实施、静态验证与 Otirik 最终审核均已完成（2026-11-02）；维护者已授权 Git 提交。工作在已有 `docs/no-ref-document-governance` 分支、`.worktrees/docs-governance` 内进行，基于维护者已提交的 P0/P1。G18 按[治理章程](../README.md#编号与目录规则)顺延登记，编号已随本次最终审核确认；沿用用户已授权的 worktree 与分支，不另建分支。

## 责任与审核

- Otirik：Task Leader、文档负责人和最终审核人；Notype：架构顾问及历史设计依据提供者。
- 主代理：协调文档代理，核对内容守恒、交叉引用、基线和门禁，提交待审结果。
- 四个文档代理：仅写登记的文档集合，不改代码、不写共享 Task 或基线。分配记录见唯一过程记录 [walkthrough](walkthrough.md)。
- 代码实现代理仍不得修改文档库；发现偏差时提交具体路径、建议和依据，由 Leader 审核后另派文档代理。

## 切片与完成标准

| 切片 | 可观察验收 | 状态 |
|---|---|---|
| 1：并行拆分五份文档 | 原有语义、状态和裁定完整；主文与新增册均 ≤30 KiB 且 ≤9,000 估算 token；标题/围栏/列表及行级差异可解释 | 完成；新增十三册 |
| 2：引用及基线收口 | 旧路径保留为入口；移动后的相对链接和有效章节引用可达；基线由 8 条减至 3 条，无提高登记值 | 完成 |
| 3：审查与验证 | 在本 worktree 内 docs:check、文档大小门禁、diff 空白检查通过；记录未运行项与最终审核状态 | 完成；Otirik 已于 2026-11-02 审核通过 |

过程、命令、结果、偏差与后续事项只追加到 [walkthrough](walkthrough.md)，不在此重复维护证据。本任务已验收完成；提交或集成另按维护者指示执行。UI 证据中既有失效行号的重新取证另行安排。
