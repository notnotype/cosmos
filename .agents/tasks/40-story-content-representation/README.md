# Task 40：Story 内容表示与多模态阅读

> 状态：实施与验收进行中。内容解析、版本存储、读取、阅读界面、候选决策及生产 Story 生成接线已实现；隔离完整产品链路、独立审查与单次真实摘要终端验收已通过，剩余整体验收尚未收口。
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

已分别完成图文/多来源阅读、表示版本管理、媒体降级、旧文本/坏表示/缺 Asset 的隔离产品验收；阅读支持 1024/1440，768 显示过窄提示。合成解析升级和不同质量表示经真实 SQLite owner 验证，保留源事实与精确历史；未发布真实新解析器。本轮旧证据修复使候选只读投影区分当前、旧版和不可用，接受时事务重验，原候选不迁移。候选组件 15 项（含四宽度）、产品生成与版本 3 项通过；产品使用真实 API/Worker/SDK/生产 Web，模型传输合成，不是真实 Provider 验收。旧行播种只在新隔离空库、显式开关下运行，不等于用户旧库升级。完整命令、逐轮回归和未运行层统一见 walkthrough。维护者已授权按步骤本地中文提交；未迁移用户数据或部署。

## Next Step

隔离前置旧库升级已覆盖无回填、旧事实/指针保持；Node recovery 已按派发保护合同修正旧预期且完整 Node E2E 通过。本步在原首屏预算下修正浏览页拖拽依赖加载和 transport 的 Zod 依赖归属，完整浏览器已无失败；两条需显式播种的阅读降级用例仍跳过，不计通过。完整命令、安装前置、结果和限制只记 [walkthrough](walkthrough.md)。Task40 仍不满足关闭条件：真实来源仍仅历史隔离 RSS 10 条；真实 Agent 仅无来源/工具的 summary-only 终端路径，不覆盖来源正文、关系/质量任务或 Web 决定。

下一步先核对批准验收清单，判断是否需另行授权真实来源/Agent 验收及显式降级用例复验；不能用本轮浏览器绿灯替代真实外呼验收。Task40 保持 active。通用 completion 排空分类和旧 spec 表述仍待评估；不得自行操作用户库、部署或再发真实 Provider 请求。
