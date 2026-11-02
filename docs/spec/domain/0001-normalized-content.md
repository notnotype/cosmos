# @cosmos/domain 规范化内容

## 状态

当前实现规格；后续代码变化应同步更新本文。

## 最后更新

2026-09-16。

## 组件定位

`@cosmos/domain` 是来源采集结果进入 Cosmos 内容模型前的纯规范化和身份投影层。它定义 `NormalizedIngestItem`、Publisher、TemporalValue、ContentMetrics、Asset input，以及 external key、修订 fingerprint 和最小 Story projection 的语义。

Connector 调用这些纯函数生成规范化 item；application 只负责 Connector/Workflow 边界和 JSON/Blob 转换；storage 负责把观察、Entry、修订、Asset、Story 和事件写入事务。本组件不拥有公共 Zod DTO；跨 Workflow 的 JSON-safe wire shape 由[公共合同](../contracts/0001-public-contracts.md)唯一规定。domain 的接口和算法是语义层，不能替代 contracts 的边界解析，也不反向调用 contracts schema。

### 在系统中的位置与作用
它位于 Connector 输出与 storage 领域写入之间，是不依赖网络和数据库的内容语义层，负责规范化内容并投影稳定身份。

### 解决的问题
它统一 Publisher、时间、指标、Asset、external key、修订 fingerprint 和 Story projection 的解释，避免不同来源把同一内容处理成互不兼容的领域记录。

### 使用方式
Connector 先把来源数据交给本组件的纯函数生成 `NormalizedIngestItem`；application 负责边界 JSON/Blob 转换，storage 再按这些结果写入观察、Entry、Revision、Asset、Story 和事件。

### 典型情景
接入新来源、处理同一来源的修订或生成 Feed 所需的最小 Story 投影时，选择这里的规范化和身份算法，而不是在 Connector 或 Repository 中复制规则。

**分册索引**

本文用于确定组件职责与边界，并按问题选择分册。接入来源与维护领域算法的读者先查概念及行为；重建实现与审查行为证据的读者查验收及实现锚点。先读本索引，再定位命中分册的相关段落。

| 分册（相对路径） | 覆盖范围与用途 | 读者 | 标签 | 大小 / token 估算 | 状态 |
| --- | --- | --- | --- | --- | --- |
| [概念与定义](0001-normalized-content/01-concepts.md#概念与定义) | 内容词汇、有序表示、Publisher、时间、指标、身份与 Story | Connector / domain 维护者 | domain, normalized-content, concepts | 12,114 B / 3,797 | 2026-11-02 封口 |
| [行为与输入输出](0001-normalized-content/02-behavior-input-output.md#外部行为) | 外部行为、输入、输出、持久化、状态转换、副作用、降级、依赖及配置 | Connector / application / storage 维护者 | domain, behavior, input-output, persistence | 10,907 B / 3,333 | 2026-11-02 封口 |
| [重建验收与实现锚点](0001-normalized-content/03-acceptance-implementation.md#重建验收) | 重建验收情景及实现与测试定位 | 实现者 / 审查者 | domain, acceptance, implementation, tests | 6,665 B / 1,975 | 2026-11-02 封口 |

分册承载拆分时的当前行为合同。代码行为变化时，由文档代理新增或替代分册并同步本索引与状态；入口始终指向当前有效规格。封口册只读，勘误在主文登记并注明分册位置。token 按 ASCII 字节 / 4 + 非 ASCII 字节 / 3 × 1.1 估算。

## 非目标/边界

- 不把领域 `NormalizedAssetInput.content: Uint8Array` 直接当 Workflow JSON；bytes 的 BlobRef 转换由 application/storage 和[公共合同](../contracts/0001-public-contracts.md)负责。
- 不把 URL 当必填身份字段；URL 可为空，externalId、sourceLocator 或 fallback hash 仍可构成 key。domain 函数本身不把 source instance 拼入 key，跨来源唯一性由 storage 约束。
- 不把 fallback lowerBound 当 exact 发布时间；只有 exact 可由 `temporalProjection` 写入 sourcePublishedAt 的准确投影，fallback 证据仍保存在 JSON 语义中。
- 不把 metrics、assets、raw payload、Temporal fallback 或 updatedAt 纳入 `fingerprintEntryRevision`，除非实现的六字段输入本身发生变化。
- 不声称 domain 处理 delete/snapshot observation；公共 DTO 的枚举比当前 persist item 路径更宽。
- 不把 Story projection 扩展为聚类、合并、推荐或完整事件模型；当前实现只提供 `story:${entryId}` 的最小投影。
- 不把 Connector 网络、OpenCLI、Prisma 事务、Blob Root、Workflow lease、SSE 或日志副作用归入 `@cosmos/domain`。
