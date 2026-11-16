---
parent: PROJECT-STATUS.md
range: 2026-11-13 ~ 2026-10-08（Task 35/36/38/39/40/42 完成补记，7 段）
sealed_at: 2026-11-17
tags: [project-status, history, completed-tasks]
tokens_est: 1817
---

# 2026-10/11 已完成任务补记

[返回项目状态](../PROJECT-STATUS.md)。本册收纳主文档迁出的已完成任务补记原文，链接层级随迁入修正；正文未改，封口后只读，勘误记入主文档勘误节或同级 [ERRATA.md](ERRATA.md)。

**Task 42（2026-11-12）**：Story Agent 超时默认 300 秒（范围 30–1800），新任务冻结配置；常见错误按白名单安全展示，取消独立处理，Job/Attempt 脱敏。全仓 1492 项测试、类型检查、构建及 5 个隔离浏览器用例通过；维护者确认真实 Agent 建议生成一次成功。文档门禁仍有 Task40 既有债务，代码尺寸问题为 2 个未改文件；用户库迁移和部署未进行。详情见 [Task 42](../.agents/tasks/42-default-model-ui-api/README.md)。

**默认模型失效生成修复（2026-11-11）**：Story 面板已区分未设置、失效和读取失败，增加设置入口与重新读取，并在生成前重读配置；后端拒绝新请求中不可用的显式/默认模型，不创建注定失败的任务。保留删除后默认 ID 和执行时解析的既有约定，不自动选择或修改用户模型配置。聚焦测试、全仓 1455 条测试、全仓类型检查与 API/Worker/Web 构建已通过；默认设置、阈值计费与最终故障恢复主流程分别通过隔离浏览器验收，独立审查无阻断。文档门禁仍有 22 条 Task 40 历史断链；真实 Provider 调用由维护者随后手动试用，精确证据仅记于 [Task 42](../.agents/tasks/42-default-model-ui-api/walkthrough.md)。

**Task [42](../.agents/tasks/42-default-model-ui-api/walkthrough.md) 本轮实现与隔离验收完成（2026-11-11）**：基于 `ad4c3c4`，分支 `feat/t42-cache-tiered-pricing` 已实现缓存四价、每模型币种及两档整次计费，[当前 API](../docs/spec/interfaces/0002-product-api-http.md)、[客户端](../docs/spec/interfaces/0004-http-client.md)、[Web](../docs/spec/interfaces/0005-web-client.md)和 [ADR-0032](../docs/adr/0032-model-cache-tiered-pricing.md)已同步。最终全仓 230 files / 1446 tests 全部通过（284.28s）；40 项 smoke、浏览器 6/6（56.7s）、Lab 12/12（17.8s）通过，覆盖四价创建/编辑/回填、真实 409 草稿恢复、272000/272001 整次选档和历史费用不随改价重算。全仓类型检查、Web lint、API/Worker 与依赖包构建、隔离栈 Web 构建及代码差异检查通过。独立审查发现的两项需求问题与冲突测试缺口均已修复并复核。文档检查仍有 22 条 Task40 旧断链，本轮未新增；全局尺寸既有债务及最终门禁结果单列于 Task，不宣称所有仓库门禁通过。维护者已另行授权本轮本地提交及合并到 master；未 push/deploy、未迁移用户数据库、未修改 DSH plugin；本轮真实 Provider 外呼与远端 CI 未验。早期失败、执行器诊断和精确命令保留在本轮 Task 过程记录。

**Task [40](../.agents/tasks/40-story-content-representation/README.md) 验收与文档收口完成（2026-11-13）**：确认范围内验收全部完成，保留 2026-11-05 的关闭决定。真实 Provider 关系/质量样例已分别独立复核；合成模型传输下，真实 Node API 入队、独立 Node Worker 执行三类任务并保存 pending，同键及完成后重启无新增调用，约定七张正式内容表不变。本轮修复 22 处历史断链并统一任务状态，工作树文档检查通过；过程、精确证据及边界只记于 [walkthrough](../.agents/tasks/40-story-content-representation/walkthrough.md)。独立 Worker 真实 HTTPS 组合、执行中崩溃、长压和部署未验，属于范围外补强；未改产品代码或用户库，不替代全仓运行门禁。

**Task 38（Agent Invocation 基础接入 v1）已完成**（2026-10-08）：新增版本化 `agent.invoke@1` Workflow Action、JSON-safe Agent Invocation 合同、Invocation Port 与确定性 Fake Adapter；复用现有 Activity Worker 的 Run/Job/Lease、取消、重试和 completion 语义。全量单元测试 139 个文件/798 个测试、全仓 typecheck、共享包构建和 docs:check 均通过。真实 `pi-ai` Adapter 已由 Task 39 承接交付；`neuro-agent-harness`、`nb-memory`、工具执行、Artifact、Workspace、Knowledge/Research 仍未实现，另开后续 Task。

**Task [39](../.agents/tasks/39-pi-ai-adapter/README.md) 已交付**：pi-ai 适配、Provider/model 配置及凭证协调、Worker `agent.invoke@2`；历史测试/真实调用证据与未验收项留在 Task。Task41 后模型选择已与 Connection 分离，当前由显式 modelId 或 SystemConfig 默认值解析；旧 `@1` 仅保留契约、无生产注册。Provider 删除同步 204，有子模型则拒绝，默认 ID 不保护模型删除。默认库升级与生产部署未验。

Task 36 已完成并通过真人验收；实现、合并与验收证据见 [Task36 完成历史](history-2026-10-task36.md)。当前仍保留右栏 240 px 下限与首屏预算约束，分支和 worktree 尚未清理。

**Task [35](../.agents/tasks/35-frontend-redesign/README.md) 已交付并移交 Task36**：外壳十路由、单一明暗轴、外壳 SSE 单连接、集中用户文案与布局/预算门禁已落地。历史验收留在 Task；仍保留 `/automation` 三项交互诉求与组件文案迁移 772 处。
