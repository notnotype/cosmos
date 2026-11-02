# Product DTO 草案

> 状态：Draft v0.2
>
> 端点：[`0002-product-service-api.md`](0002-product-service-api.md)
>
> 公共类型：[`0001-common-contracts.md`](0001-common-contracts.md)

## 分册索引

本文件是参考型 DTO 清单,按域拆分为分册(每册 ≤30 KB,封口后只读);主文档只保留使用规则与下方索引,按域查阅。

| 分册 | 范围 | 大小 |
|---|---|---|
| [part-02-04.md](0003-product-dtos/part-02-04.md) | §2 System、§3 Catalog、§4 Connection/Source/计划与 Trigger | 13.1 KB |
| [part-05-06.md](0003-product-dtos/part-05-06.md) | §5 Workflow Runtime、§6 Observation/Entry 与 Asset | 10.9 KB |
| [part-07-09.md](0003-product-dtos/part-07-09.md) | §7 Story/Topic/Entity 与用户真相、§8 Knowledge 与 Research、§9 Feed/Related 与 Interaction | 10.6 KB |
| [part-10-13.md](0003-product-dtos/part-10-13.md) | §10 Workspace/Artifact 与 Board、§11 Agent Conversation、§12 Publication 与 Delivery、§13 数据运维 | 8.3 KB |
| [part-14-16.md](0003-product-dtos/part-14-16.md) | §14 Event payload 基线、§15 Query DTO 基线、§16 Planned mutation Command 基线 | 10.9 KB |

## 1. 规则

- 下列是 API 最小语义 shape，不是 Prisma schema。
- `unknown` 只允许出现在同一对象内能定位到 owner/schema/version 的字段；它表示
  边界处仍需按关联 definition/schema 校验，不表示运行时可以跳过验证。
- `config`、`input` 和 `output` 必须绑定 schema/version；不能成为无 owner 的任意
  JSON。
- 不使用 `ValueEnvelope | unknown`。在 TypeScript 中该联合会退化为 `unknown`，
  失去 ValueRef/大小/hash 合同；普通 JSON 也必须放入 inline `ValueEnvelope`。
- Snapshot 可以增加纯展示字段，但稳定身份、revision、provenance、状态和错误不能
  只靠前端拼接。
- 所有分页列表使用 `Page<T>`。
- Detail 内的集合字段只能是明确有界的 preview；完整历史和成员使用分页子资源。
- 所有 Secret 值、lease token、Worker session token 和绝对路径都不属于 Product
  DTO。

`JsonSchemaRef`、`WorkflowBudget`、`WorkflowUsage`、`WorkflowRunStatus`、
`ActionReceiptSnapshot` 等同时被 Product Query 与 Gateway 使用的类型，落代码时
属于 `contracts/runtime` 或 `contracts/common` 的单一 canonical schema；它们只为
阅读连续性列在本文件，不允许复制成 Product/Gateway 两份实现。

→ §2 System、§3 Catalog、§4 Connection/Source/计划与 Trigger 已归档:[part-02-04.md](0003-product-dtos/part-02-04.md)

→ §5 Workflow Runtime、§6 Observation/Entry 与 Asset 已归档:[part-05-06.md](0003-product-dtos/part-05-06.md)

→ §7 Story/Topic/Entity 与用户真相、§8 Knowledge 与 Research、§9 Feed/Related 与 Interaction 已归档:[part-07-09.md](0003-product-dtos/part-07-09.md)

→ §10 Workspace/Artifact 与 Board、§11 Agent Conversation、§12 Publication 与 Delivery、§13 数据运维 已归档:[part-10-13.md](0003-product-dtos/part-10-13.md)

→ §14 Event payload 基线、§15 Query DTO 基线、§16 Planned mutation Command 基线 已归档:[part-14-16.md](0003-product-dtos/part-14-16.md)

## 2. 落地注记（分册封口后的更正入口）

分册封口后只读，对已归档 DTO 的落地更正登记在此。

- 2026-09-20：[`part-02-04.md`](0003-product-dtos/part-02-04.md) §4 的 `CollectionPlan`／`TriggerBinding` DTO 是**目标合同**；v1 的落地范围与限制（计划与采集目标一对一、`overlapPolicy` 写路径只接受 `forbid`、`discoveryContext` 不新增持久字段、`scope`／`sourceOperationRef` 是目标的只读投影、计划的媒体预算字段叫 `mediaPolicy` 而不是 `budget: WorkflowBudget`）见 ADR [`0023`](../adr/0023-collection-plan-v1.md) 与 [`0002-product-service-api.md`](0002-product-service-api/part-02-04.md#43-collectionplan) §4.3。
