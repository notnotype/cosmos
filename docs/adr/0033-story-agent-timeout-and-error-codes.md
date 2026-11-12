# ADR-0033：Story Agent 超时与错误码边界

- 状态：accepted；决策者：Otirik；日期：2026-11-12。
- 产品行为与备选方案见[accepted Proposal](../proposals/story-agent-timeout-and-error-display-v1.md)；此 ADR 固定架构边界，不代表实现、部署或真实 Provider 验收完成。

## Context

Story Agent 的固定单次调用预算不足以覆盖较慢的模型，用户也无法配置；失败查询只返回通用码。Workflow 的 Activity Job 已持久化机器错误码，但外部 `@notnotype/nb-workflow` completion 不携带它。错误文本可能含服务商响应或内部信息，不能作为产品合同。

## Decision

1. 将 `storyAgentTimeoutSeconds` 存于系统级 SystemConfig，单位秒、默认 300、有效范围 30–1800。新建 Story Agent Invocation 入队时把秒转换为毫秒冻结进 Workflow 输入快照；只限制单次尝试，同一幂等重放不改快照，重试后的总耗时可超过该值。
2. Generation 对外仅给 `timeout`、`authentication_required`、`rate_limited`、`budget_exhausted`、`invalid_configuration`、`dependency_unavailable`、`malformed_payload` 七个已知分类；未知/旧数据使用 `generation_failed`，用户取消继续表示为独立的 `cancelled` 状态。Web 根据稳定码映射固定文案，不显示原始错误文本。
3. Story 投影通过窄只读边界从 Cosmos 持久 Job 读取失败 Activity 的白名单 `errorCode`；不从 message、`lastError` 或其它自由文本推断类型，也不扩展外部 Workflow completion 协议。
4. 同一 Story Workflow 的公开 Job/Attempt 查询也只提供白名单码与固定安全消息，取消无失败原因；Job 的原始 result 不公开。内部持久诊断保留，通用 Run 不能成为原始服务商错误的旁路。其他 Workflow 的公开诊断合同不在本切片变更范围。

## Consequences

- SQLite/SystemConfig 使用默认 300 的 additive migration；旧单例得到新默认值，既有 Workflow 快照保持不变。
- Activity Job 是终态机器错误码的 durable source；读码器只服务 Story Generation 投影。未知码和历史缺失值安全降级。
- 超时设置作用于一次 Agent 调用，自动重试及退避可拉长任务墙钟时间；它不是整个 Workflow 的截止时刻。
- 复用 Cosmos Job 字段避免外部协议分叉，但 Story 投影依赖本地持久记录可按 Run ID 查询。

## Revisit Gate

当 Story 错误码需被其它 Workflow 共用、外部 completion 开始稳定承载受限机器码、需要整个 Workflow 总截止时间、或任务须把配置预算与每次模型重试拆开时，重新评审本决定及迁移/恢复语义。
