# Story 内容表示 API

> 状态：Task 40 已实现接口与生产接线；隔离产品生成链通过，整体验收进行中，不代表真实 Provider 验收或已部署。
>
> 依据：[已接受目标](../aegis/specs/2026-10-08-story-content-representation-design.md)、[架构](../aegis/specs/2026-10-08-story-content-representation-architecture.md)、[Task 40](../../.agents/tasks/40-story-content-representation/README.md)。

## 所有权与首个消费者

Contracts 唯一拥有跨边界 JSON schema；Application ContentQuery 统一提供读取投影与访问检查。HTTP 与 Agent 包装不能自行解析来源内容。首个消费者为 Story 阅读页；第二个消费者为通过 `agent.invoke@2` 的受管 Story Workflow。API 只校验与冻结授权输入并入队，Worker 解析 Connection/凭证并调用 SDK，随后校验、fenced 保存候选；正式写入只经人工决定。

旧 Entry/Story DTO 的 `contentText` 与 assets 保留。增加的内容表示字段应为可选，旧生产者/旧数据仍可读取；持久化表示不得假装来自历史数据重建。

## 输入与表示

`ContentSource` 按 `format` 区分 `plain-text`（text）、`safe-html-input`（html、baseUrl?）、`structured-source-content`（受控来源块）。HTML 始终不可信，baseUrl 仅用于解析相对 URL，不触发网络。

输入媒体描述来源位置，最终媒体块引用同一来源修订的 Asset。正文唯一顺序为 `ContentRepresentation.blocks`；不新增并行媒体顺序表。status/MIME/storageKey 由 Asset owner 管理，公开块不复制它们。

表示携带 id、entryRevisionId、representationVersion、parserVersion、status、qualitySignals、createdAt 与 supersedesRepresentationId。表示读取状态 `complete/partial/failed` 与原文证据 availability 分开；complete 不保证原站完整或事实正确。证据引用绑定 entryId、entryRevisionId、representationVersion、blockId?。

实施预算候选：输入 1 MiB，节点 50000，块 5000，解析深度 64，单块文本 65536 字符，列表最多 3 层，表格最多 200 行×50 列，单 URL 4096 字符。超限明确 partial/warnings，不声称处理了被截断内容；最终常量与执行点须经合同审查。

## Query profiles

版本化受管读取 profile 覆盖 summary-only、structured-content、full-source-evidence、media-metadata、media-bytes。调用方不得通过任意字段列表扩大权限；访问策略检查通过才返回相应内容。

- summary-only：Story 当前语义表示与已选择输入版本信息。
- structured-content：选定来源修订及其明确表示版本、内容块、质量和媒体公开投影。
- full-source-evidence：受控证据读取，显式授权与预算；不通过普通 Story DTO 返回原始 payload。
- media-metadata/media-bytes：遵循现有媒体能力与权限；字节不能泄露内部 Blob key。

当前读取只能读取明确 current 指针，不根据版本排序偷偷选择。历史读取必须携带完整版本引用；不可用时返回明确 availability，不自动迁移到新版本。

## 错误与接受约束

复用公共错误 envelope。不存在的目标返回 404，非法请求返回 400，过期选择／候选基线或未配置服务返回 409；未知存储错误继续传播。缺失历史表示返回不可用投影，不返回不相关当前内容。

以下路径均位于 `/api/v1`：

| 方法与路径 | 请求与行为 |
| --- | --- |
| `GET revisions/:revisionId/content` | 可选 `representationVersion` 正整数；省略时读取明确 current 指针。返回严格 `StructuredContentView`，无原始 payload 或内部 Blob key。 |
| `POST revisions/:revisionId/content/selection` | `expectedCurrentId`、`expectedLocked`、`operation: lock/unlock/rollback`；仅 rollback 必须提供 `representationId`。指针和锁状态一起校验，回退后锁定。 |
| `POST revisions/:revisionId/content/rebuild` | 空对象 `{}`；主机从 Observation 保留的声明输入重新解析。创建新表示并按质量／人工锁规则决定是否提升；返回表示 ID、版本和 promoted。没有保留输入时返回 409，不猜测 raw payload 格式。 |
| `GET stories/:storyId/agent-candidates` | 返回最近 100 个候选及 pending/accepted/rejected 状态，按创建时间与 ID 倒序。 |
| `POST stories/:storyId/agent-candidates` | 严格 body：`connectionId`、`task`、可选 `sources: [{entryRevisionId, representationVersion}]`；必需 `Idempotency-Key`（非空、最长 200 字符）。返回 202 的 `StoryAgentGeneration`，不返回同步候选。相同键同意图复用冻结 Run，不同意图返回 409；不存在 Story/无法读取精确版本/连接不可用分别 404/400/409。 |
| `GET stories/:storyId/agent-generations/:runId` | 仅返回 runId/storyId/task/connectionId、`queued/running/completed/failed/cancelled`、candidateId、errorCode。仅 completed 有 candidateId，失败只给 `generation_failed`；无模型响应正文、凭证或内部错误。不同 Story 或未知 Run 返回 404。 |
| `POST story-agent-candidates/:candidateId/decision` | 仅 `decision: accept/reject`。主机提供操作者；接受摘要或 Entry 关系与候选状态、审计在同一事务提交。重复决定和过期输入返回 409。 |

所有请求对象严格校验，不能携带自定义 actor、profile、provider 或授权字段。模型/地址/凭证由所选连接在 Worker 调用时解析，权限与预算由主机授予。浏览器发送前保留同键意图，响应丢失只恢复原请求；已知 Run 刷新仅查询，不自动重新生成。失败/取消可能晚于候选提交，因此任务投影没有 candidateId 不等于候选列表为空；所有终态重新读取候选列表，外呼结果不确定时禁止自动重发。质量检查候选可查看、拒绝；接受返回 unsupported/409，因为当前没有对应正式写入命令。摘要接受保留候选未拥有的既有时间范围。精确来源证据和候选 JSON 保留原输入版本，不随当前表示切换而改写。候选记录增加可选只读 `sourceStatus: current/superseded/unavailable`；当前服务始终计算并返回，旧记录/测试消费者缺字段不伪造已验证状态。该投影不进入 candidate JSON、不写回审计：无来源输入为 current；所有历史输入仍可用且为来源当前修订/当前表示时为 current；任一输入已非当前为 superseded；任一精确表示缺失、损坏、failed 或原始证据引用缺失为 unavailable（优先于 superseded）。Web 对后两者提示旧版/待重新验证，保留原版本详情及人工拒绝；接受在同一事务重新验证，只允许 current，过期返回 409，无正式写入或决定审计。已经 accepted/rejected 的历史记录不被撤销或改写。

`story.summarize`、`story.extract-relations`、`story.review-content-quality` 生成候选；用户接受由正式命令处理并记录审计。候选绑定实际输入版本，重复接受不重复正式写入，基线变化必须拒绝或明确要求重新验证，不自动套用。Agent 不可直接改写 Observation、EntryRevision、权限或已接受事实。

## Conformance 场景

1. 旧 DTO 解码与 legacy-text 回退，不注入任意 HTML。
2. 文本/媒体交错、纯图片、相对 URL 和媒体失败维持顺序。
3. 同输入同解析器确定性；图片变化生成来源修订；解析器升级和下载状态变化不生成来源修订。
4. current 指针跨修订拒绝，历史版本仍可读，人工锁不自动覆盖。
5. 原文失效但表示仍可读，availability 与 parser status 不混用。
6. 未获 scope 拒绝，普通 DTO 无内部 key、凭据或完整 raw payload。
7. Agent 候选接受前零正式事实写入；接受、拒绝、重复接受、过期基线有行为验证。
8. 同键入队/丢响应恢复只生成一次；冻结输入可跨 Worker 实例恢复，候选保存拒绝过期 fence。
9. 入队后连接撤销、模型失败、坏提案和取消安全终止；提交后回执丢失时已有候选仍可决定，不自动外呼重放。

验收必须分别报告聚焦、全量、类型、隔离浏览器、真实来源、真实 Agent；Fake 不代替真实验收。
