# Task 40：Story 内容表示与多模态阅读

> 状态：实施与验收进行中。内容解析、版本存储、读取、阅读界面、候选决策及生产 Story 生成接线已实现；隔离完整产品链路已验收，真实 Agent 与剩余整体验收尚未完成。
>
> 编号 40 由维护者明确分配。本 Task 承接已确认的目标设计与架构，实施计划和过程只记录在 [walkthrough.md](walkthrough.md)。

## User Request / Topic

当前 Story 将文本与图片分开显示，来源文章的图文交错顺序丢失，正文还可能泄漏 HTML 标签。用户要求设计能支持文本、文章、图片、视频、音频和混合内容的阅读模型，同时服务 Agent；完整提案已确认，本轮授权建立 Task 40。

## Goal

来源证据保持不可变，新采集内容产生有序、安全、版本化的阅读投影；Web 与 Agent 共用读取规则，旧内容保持可读，Agent 输出经用户确认后才能写入正式表示或关系。

## Scope / Non-goals

范围：ContentSource、受控内容块、Normalizer、ContentRepresentation 子资源与当前指针、RSS/现有文本来源接线、媒体引用、统一 Query/权限、Story 阅读、Agent 候选与接受流程、隔离验证与文档收口。

不在范围内：外部网页全文抓取、任意 HTML 执行、历史批量重解析、音视频下载/转码/转录、OCR、自动聚类、Agent 自动写正式数据、完整 Artifact/Workspace 产品、部署。

## Authority / Dependencies

- [已确认目标设计](../../../docs/aegis/specs/2026-10-08-story-content-representation-design.md)
- [已确认目标架构](../../../docs/aegis/specs/2026-10-08-story-content-representation-architecture.md)
- [用户真相保护 ADR](../../../docs/adr/0028-user-truth-protection-v1.md)
- [当前实现规格入口](../../../docs/spec/README.md)与[测试隔离规范](../../../docs/testing/README.md)
- [Task 38](../38-agent-invocation/README.md) 的 Invocation Port；[Task 39](../39-pi-ai-adapter/README.md) 已完成连接配置、真实 Adapter 与 Worker `agent.invoke@2` 注册。Task 40 负责消费该能力，不重新打开 Task 39；Story 产品已按单次显式选连接→API 入队→Worker @2→候选→人工决定接通。

## Current Slice / Gates

生命周期：实施中。内部 @2 合同及产品生成接线已完成；生成请求返回 202 和安全任务状态，浏览器保留同一请求键并可刷新恢复。API 不调用 SDK，Worker 生成后只保存 pending 候选，正式写入仍需人工决定。实施过程及逐轮证据统一记录于 walkthrough。

已实现的可观察行为：

1. 新内容按原顺序显示受控文本和媒体，旧文本安全降级，来源可切换。
2. 内容表示可按精确版本读取、重建、锁定或回退，保留历史与审计。
3. Agent 输出只生成候选；摘要和 Entry 关系由用户接受后通过正式命令原子提交，重复或过期决定被拒绝。
4. 质量检查意见可查看、拒绝；当前没有对应正式写入命令，因此不提供接受。

验证必须区分聚焦测试、全量测试、类型检查、隔离浏览器、真实来源和真实 Agent。组件实验室覆盖 320/768/1024/1440；完整产品已有图文阅读、双来源切换和图片加载失败恢复证据，阅读支持 1024/1440、768 显示过窄提示。生成链已通过候选组件 7 项、完整产品 1 项（真实 API/Worker/SDK/生产 Web，隔离数据与合成模型传输），不是真实 Provider 验收。2026-10-26 另完成表示版本产品验收 2 项：1024/1440 下通过正式 API 验证精确历史、重建、锁定、回退及冲突拒绝，刷新真实阅读页确认当前表示；原 EntryRevision/Observation/Story 不变。本轮版本切片只补测试和记录，无业务代码改动；后续媒体切片另通过 1024/1440 两项完整产品验收：音视频仅元数据、真实安全拦截图片和空正文，均验证刷新、原文键盘焦点及无错误；受控媒体端点零请求。维护者已授权按步骤本地中文提交，未迁移真实数据或部署。本步另通过 1024/1440 两项旧文本/坏表示/缺 Asset 产品验收：API 启动前只向新隔离空库播种合成状态，真实 API/生产阅读页验证清洗、不可用说明、缺媒体原文与刷新/键盘/零意外请求；夹具门禁及 Query 不改写源事实亦有回归。不是用户旧库升级验收。

## Next Step

下一步独立审查接线，并核对解析器升级、不同质量候选及 Agent 旧证据演进。legacy/损坏或失败表示/缺 Asset 已完成合成旧行状态的产品读取验收，不等于用户旧库升级；精确历史、重建、锁定/回退、metadata_only/skipped/空正文也已有对应证据，不能代替所有演进场景。真实 Agent 验收仍是必需未完成项，每次外部模型请求需新的费用/凭据/网络授权；生产组合已就绪，不等于用户环境已配置或部署。历史 NASA RSS 证据不替代本轮验收。证据只在 walkthrough 维护；不创建或恢复自动续跑 goal，分支/worktree、Git 外部操作和真实数据继续遵守各自授权边界。
