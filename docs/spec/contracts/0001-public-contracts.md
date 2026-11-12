# @cosmos/contracts 公共合同

## 状态

当前实现规格；后续代码变化应同步更新本文。

## 最后更新

2026-11-12（Task 42：Story Agent 超时设置与公开失败码补充）。

## 组件定位

`@cosmos/contracts` 是 Cosmos 进程之间和边界层之间共享的运行时合同包。它提供 Zod schema、由 schema 推导的 TypeScript 类型、状态枚举、可公开投影的 DTO，以及版本化 Action、重试、Blob/Value 引用和 SSE 消息的形状。

它不执行 Connector、Action handler、Workflow、领域写入或 Blob 读写。`packages/application` 在 HTTP、Action 和 Workflow 边界把外部 `unknown` 解析为本包合同；`packages/storage-prisma` 和 Product API 使用这些类型生成自己的投影。本文件只定义 ContentKind、Publisher、Temporal、Metrics、BlobRef 和 ValueRef 在 wire/JSON 边界的形状；规范化内容的语义、身份算法以及 Observation/Entry/Revision/Story 语义只由[规范化内容](../domain/0001-normalized-content.md)定义。domain 的语义函数不导入或调用本包 schema，本包也不反向实现 domain 算法。

`contracts` schema 解析是进入 JSON/HTTP/Workflow 边界的前置步骤；通过解析后的值才由 application/connector 交给 domain 语义函数。两边可以使用同一枚举词汇，但这不是第二套运行时校验规则。

### 在系统中的位置与作用
它位于 HTTP、Workflow 和进程间边界的共享合同层，为这些边界提供同一套可运行时解析的 JSON/HTTP 形状。

### 解决的问题
它把外部 `unknown` 变成可验证的 DTO、状态和引用，避免每个调用方各自解释 Action、Blob、Value 或 SSE 消息；领域语义仍由 domain owner 负责。

### 使用方式
边界入口先调用本包的 Zod schema 解析，再把解析结果交给 application、connector 或 domain；需要组合根或客户端类型时从本包导入对应 schema/type，不把它当作执行器或持久层。

### 典型情景
新增或重建 API、SSE、Action 或 Workflow payload 时，先在这里确认 wire shape，再由拥有行为的组件实现解析后的流程。

## 分册索引

本文件是当前实现规格的参考型清单,按章节拆分为分册(每册 ≤30 KB 且 ≤9k token,封口后只读);主文档只保留状态、组件定位、非目标/边界与下方索引,行为细节按章节查阅分册。

| 分册 | 范围 | 大小 |
|---|---|---|
| [part-01](0001-public-contracts/part-01-base-types.md) | 概念与定义、协议和内容基础类型、Source 与采集命令、状态和查询 DTO | 14.3 KB |
| [part-02](0001-public-contracts/part-02-content-dtos.md) | Feed、Entry、Story 与事件 DTO、Action、重试与可序列化引用 | 22.4 KB |
| [part-03](0001-public-contracts/part-03-behaviour-and-acceptance.md) | 外部行为、输入、输出、状态与持久化、状态转换、副作用、错误与降级、依赖、配置、重建验收、实现与测试锚点 | 13.5 KB |

→ 概念与定义、协议和内容基础类型、Source 与采集命令、状态和查询 DTO 已归档:[part-01-base-types.md](0001-public-contracts/part-01-base-types.md)
→ Feed、Entry、Story 与事件 DTO、Action、重试与可序列化引用 已归档:[part-02-content-dtos.md](0001-public-contracts/part-02-content-dtos.md)
→ 外部行为、输入、输出、状态与持久化、状态转换、副作用、错误与降级、依赖、配置、重建验收、实现与测试锚点 已归档:[part-03-behaviour-and-acceptance.md](0001-public-contracts/part-03-behaviour-and-acceptance.md)

## Task 42 当前合同补充

本节取代封口分册中冲突的默认模型与 Connection 选模型说明；公共 JSON 形状以本节及[源码](../../../packages/contracts/src/system-config.ts)为准，HTTP 状态与事务行为由 [Product API](../interfaces/0002-product-api-http.md#task-42-当前合同补充)拥有。

- 系统配置（`SystemConfigDto`）为 strict `{defaultModelId:string|null, defaultModel:ConfiguredModelSnapshot|null, storyAgentTimeoutSeconds:number}`。三个字段必需；超时为 30–1800 的整数秒，系统默认 300；已删除模型的旧 ID 仍可读取，模型投影为 null。快照包含模型 ID/Provider ID、上游标识、名称、上下文窗口、最大输出、版本、时间戳及下节定价配置；未知价格省略，0 保留，不包含凭证。旧模型原两价保留，新增缓存价格未知不补零；新建模型普通四价必填，不再接受省略价格依赖数据库默认值。
- 更新配置（`UpdateSystemConfigCommand`）为 strict `{defaultModelId?:string|null, storyAgentTimeoutSeconds?:number}`，至少有一个字段；超时必须是 30–1800 的整数，拒绝 null、字符串、小数及未知字段。非空 ID 长 1–200、必须等于其 trim 值并通过控制字符约束，null 清除。省略字段保持原值，组合更新原子提交；PUT 仅返回本次已保存字段，完整 GET DTO 与 PUT 确认响应不是同一形状。
- Story Generation 的可空 `errorCode` 只接受 `timeout`、`authentication_required`、`rate_limited`、`budget_exhausted`、`invalid_configuration`、`dependency_unavailable`、`malformed_payload` 及通用 `generation_failed`；用户取消继续用 `cancelled` 状态，非失败状态不带失败原因。未知/缺失持久码由投影降级为 `generation_failed`，不通过错误原文推断分类。与同一 Story Workflow 关联的通用 Job/Attempt 查询也只投影白名单码与固定安全消息；Job result 与 Attempt error 不输出自由文本，取消无错误。其它 Workflow 的公开诊断合同保持不变。
- Agent invocation v2 与 Story 生成使用可选本地 `modelId`，省略走默认模型；Story strict 请求为 `{task,sources?,modelId?}`，generation 不再含 connectionId。Connection 不拥有模型选择。
- Story 候选（`StoryAgentCandidate.cost?`）与生成投影（`StoryAgentGeneration.cost?`）复用 `agentInvocationOutputSchema.shape.cost.unwrap()`：strict `{input,output,cacheWrite?,cacheRead?,total,currency}`，金额为有限非负数，币种字符串默认 USD；缓存两项 optional 兼容历史，新运行能够计价时输出完整四项。不新增不同费用类型。0 合法，旧记录或缺失费用省略字段，不填 null 或零，不以当前模型价格回算。Candidate 费用随既有 JSON 持久化；Generation 只在 completed 且候选身份、Story、Story Revision 与 task 均匹配时读取费用，失败/取消省略。精确投影条件见 [Product API](../interfaces/0002-product-api-http.md#task-42-当前合同补充)，冻结目标及 conformance 见 [Story API](../../api/0008-story-content-representation.md#task-42-费用合同已冻结目标实施与验收进行中)。

- 连接探测结果 `ConnectionProbeResult.reason` 最多 500 字符；[Application 探测边界](../../../packages/application/src/connection-probe.ts#L72)对适配器 reason 统一 `slice(0,500)` 后，用同值返回结果并写入连接 `lastError`；active 时两者均为 null，`checkedAt` 写回 `lastCheckedAt`。该限制只约束探测写回，不能推导整个 Connection.lastError 字段或人工更新也最多 500。重建须覆盖超长 outcome 原因与 ConnectorExecutionError 原因的截断、返回/持久值一致及 active 清空，见[探测测试](../../../packages/application/src/connection-probe.test.ts)。

验收锚点：[SystemConfig DTO 测试](../../../packages/contracts/src/system-config.test.ts)、[Story DTO](../../../packages/contracts/src/story-agent.ts)。重建至少验证 strict 额外字段拒绝、null 与缺失区别、未知价格省略及 0 合法。contracts 本身无持久状态、不执行设置、删除或费用计算。

## 模型定价与调用费用当前合同

本节从当前生产源码核对；功能已实现，整体验证进行中，运行证据由 [Task 42](../../../.agents/tasks/42-default-model-ui-api/walkthrough.md)拥有，不代表真实 Provider 结算或部署已验收。

- 模型创建（`CreateConfiguredModelCommand`）为 strict，普通 `inputPricePerMillion`、`outputPricePerMillion`、`cacheWritePricePerMillion`、`cacheReadPricePerMillion` 四价必填有限非负数，0 合法，单位为每百万 token。`currency` 为 USD/CNY，创建缺省 USD；`tieredPricingEnabled` 缺省 false，`tieredPricingThreshold` 与 `highInputPricePerMillion`、`highOutputPricePerMillion`、`highCacheWritePricePerMillion`、`highCacheReadPricePerMillion` 缺省 null。启用时阈值须正安全整数且高档四价齐全；关闭时阈值及高档四价必须 null，不从普通档补齐高档。
- 模型更新（`UpdateConfiguredModelCommand`）沿用 `expectedVersion`。任一价格配置字段出现时，普通四价、币种、开关、阈值及高档四价须显式齐全，作为完整组替换；更新不靠创建默认值补缺项。仅改名称、上游标识或 token 上限等 metadata 时不提交价格配置，保留旧价与未知状态。快照（`ConfiguredModelSnapshot`）四价允许省略表示未知；历史缺省币种/开关/阈值/高档分别解析为 USD/false/null/null。SystemConfig、列表、单项和写入返回共享此形状。
- 调用用量（`AgentInvocationOutput.usage`）保留 inputTokens/outputTokens/totalTokens，新增 optional cacheWriteTokens/cacheReadTokens 兼容历史。新运行输出完整四类非负安全整数用量，并按四项之和重建 totalTokens；非法计数或总和超出安全整数返回 malformed_payload。inputTokens 是不含缓存的普通输入；prompt 总输入为 inputTokens + cacheWriteTokens + cacheReadTokens，output 不参与选档。启用且 prompt 总输入严格大于阈值时，整次调用四类全部用高档：阈值 272000 时，272000 普通、272001 高档，不分段累进。
- cost 四项按各自互斥用量乘同一档单价/1000000，total 为四项之和，币种来自模型，旧模型 USD，不换汇。普通输入/输出价格任一未知或非法始终省略整个 cost；缓存价格未知且对应非零用量也省略，缓存为 0 时该项费用可为 0。阶梯启用却阈值非法/高档缺失，以及金额运算溢出时省略 cost，不生成部分总额。可计价的新运行即使缓存为 0 也输出缓存分项；历史缺项仍缺项，已持久化实际 cost 不重算。

重建验收须覆盖创建缺四价拒绝、合法零价、关闭清空、启用缺项拒绝、完整组 PATCH/metadata-only 保留、旧快照解析、缓存未知 0/非0、272000/272001 整次选档、总量安全整数与金额溢出、历史费用不变。实现/测试锚点：[配置 schema](../../../packages/contracts/src/provider-model.ts)、[配置测试](../../../packages/contracts/src/provider-model.test.ts)、[调用 schema](../../../packages/contracts/src/agent.ts)、[调用适配器](../../../packages/agent-pi-ai/src/invocation-v2.ts)、[调用行为测试](../../../packages/agent-pi-ai/src/invocation-v2.test.ts)。

## 非目标/边界

- 不把 ActionDefinition 当作可传输 manifest；executable Zod schema 不能进入 Descriptor、Workflow JSON、Catalog 或 SSE。
- 不定义 Action handler 的 dispatch、Host fence、lease、retry 执行、Connector 网络访问或 Workflow 状态机；这些由 application/runtime spec 拥有。
- 不定义 NormalizedIngestItem 的内容生成、Publisher 归一化、时间解析、external key、fingerprint 或 Story 投影算法；唯一规范见[规范化内容](../domain/0001-normalized-content.md)。
- 不把 `unknown` payload/result 宣称为已校验的 JSON 业务对象。`AssetSnapshot` 仍带内部 `storageKey`（仓储投影事实），公开读 DTO 用 `publicAssetSnapshotSchema` 表达不含该字段的形状；真正的剥离动作由 Product API 出口负责，不在本包内完成。
- 不声称 contracts 包自身提供 ValueStore、Blob Store、Database、SSE 连接或持久恢复；BlobRef/ValueRef 只是本包拥有的 wire shape，真实 bytes、canonical JSON 和引用完整性由对应 storage owner 负责。
