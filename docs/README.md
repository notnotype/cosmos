# Cosmos 文档体系

## 使用规则与真相源

本页是 `docs/` 的导航入口。文档描述架构、模块职责、组件关系、关键数据流和必要约束；代码实现细节应回到对应源码和行为测试核对，不在文档中复制。文档按当前实际架构维护，不把 Git 已能表达的历史变更写成更新日志。

判断当前能力时，优先级如下：

1. 当前行为以 [`spec/`](spec/)、对应代码和行为测试为准。
2. 当前提交基线、最近验证结果、未运行项和跨任务下一步只在 [`PROJECT-STATUS.md`](../PROJECT-STATUS.md) 维护。
3. 架构设计以 [`architecture/`](architecture/) 为准，稳定且改回成本高的取舍以 [`adr/`](adr/) 为准。
4. 需求、API Draft、Proposal、Research 和 Task 不能替代当前实现证据；Gateway、Redis、多主机等目标设计不能自动视为已实现。

## 文档目录导航

下表列出当前仓库实际存在的文档区、用途、适用读者和权威性。目录内更细的文件清单由各目录 README 或分册索引维护。

| 路径 | 用途 | 适用读者 | 权威性/状态 |
|---|---|---|---|
| [`architecture/`](architecture/) | 系统分层、模块边界、运行时、存储、数据流和演进边界；入口见 [`architecture/README.md`](architecture/README.md) | 架构决策人、模块负责人、实现者 | 当前设计入口；目标部分必须标注未实现 |
| [`spec/`](spec/) | 按组件记录当前可观察行为、输入输出、状态、副作用和重建验收 | 实现者、测试者、验收者 | 当前行为合同；代码和行为测试共同核对 |
| [`adr/`](adr/) | 保存已接受、需要长期保留的稳定架构决定及其后果和复审条件 | 架构决策人、评审者、实现者 | 稳定决定；不等于全部实现 |
| [`api/`](api/) | Product API、Worker Admin、Gateway 和 DTO 的接口目标草案 | API 设计者、客户端/服务端实现者 | Draft；当前路径和字段以代码、spec、测试为准 |
| [`requirements/`](requirements/) | 用户原话、产品范围、阶段目标和验收意图；原始需求保持追加 | 产品负责人、架构决策人、Task 负责人 | 需求真相源，不是实现合同 |
| [`proposals/`](proposals/) | 尚未生效或待评审的产品、工程和界面方案及分册 | 提案作者、评审者、决策人 | 生命周期材料；accepted 仍需落到架构/ADR/Task/代码 |
| [`standards/`](standards/) | 仓库协作、开发生命周期和跨功能工程流程；含 [`frontend-design-process.md`](standards/frontend-design-process.md) | 所有贡献者、开发 Agent、前端负责人 | 执行规则；根 [`AGENTS.md`](../AGENTS.md) 仍是 Agent 长期约定 |
| [`testing/`](testing/) | 测试层级、fixture、验收、临时数据、验证证据和已知不稳定用例 | 测试者、实现者、验收者 | 验证证据边界；不能以局部测试替代其它验收层 |
| [`doc-governance/`](doc-governance/) | 文档大小治理、基线、扫描和文档质量检查 | 文档负责人、Task Leader、评审者 | 治理规则与扫描依据，不是产品架构合同 |
| [`research/`](research/) | 外部项目、数据源、算法和技术验证材料 | 调研者、架构决策人 | 非合同；结论须经 Proposal/架构/ADR 接受后才生效 |
| [`aegis/`](aegis/) | Aegis 相关规格和计划工作材料 | Aegis 相关实现者、评审者 | 按各文件状态使用；未标为当前合同的内容不可当作实现依据 |
| [`superpowers/`](superpowers/) | Agent 工作流相关规格和计划材料 | Agent/流程维护者、Task 负责人 | 工作材料；不替代根规则、Task 或当前 spec |
| [`../.agents/tasks/`](../.agents/tasks/) | 重大任务的范围、过程、决定、验证、偏差和交接 | Task Leader、实现代理、审核者 | 实施过程证据；不替代当前 spec 或架构入口 |

## 根级文档与历史材料

- [`Phase-2-UNDO.md`](Phase-2-UNDO.md)：Phase 2 相关回退/历史材料及其索引；仅在需要追溯该历史上下文时阅读，不作为当前能力依据。
- [`../PROJECT-STATUS.md`](../PROJECT-STATUS.md)：当前 HEAD、状态快照、验证边界和未完成事项；历史分册位于 [`../PROJECT-STATUS/`](../PROJECT-STATUS/)。
- [`../CONTEXT.md`](../CONTEXT.md)：跨模块共同语言、当前解释和待讨论边界；不是完整实体清单或冻结合同。

## 读取与变更顺序

判断当前能力时，先读 [`spec/README.md`](spec/README.md) 和目标组件规格，再核对实现、行为测试与 [`testing/README.md`](testing/README.md)；需要设计背景时继续读取 [`architecture/README.md`](architecture/README.md) 和相关 ADR，最后按需读取对应 Task walkthrough。新需求先保留用户原话；存在歧义或长期取舍时进入 [`proposals/README.md`](proposals/README.md)，接受后更新 PRD、架构或 ADR 并创建或复用 Task；代码与测试落地后再更新当前 spec 和项目状态。代码代理发现文档偏差时，只提交带路径证据的修改建议，由 Leader 审核后另派文档代理修改。
