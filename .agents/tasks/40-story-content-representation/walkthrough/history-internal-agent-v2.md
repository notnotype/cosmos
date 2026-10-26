# 内部 Agent @2 接线历史

返回[当前 Task40 记录](../walkthrough.md)。以下是产品接线完成前的内部前置计划与验证原文，不代表当前状态或新的外部操作授权。

### 2026-10-26：连接作用域 Story 候选生成切片（实施计划）

- 授权与边界：维护者确认 Task 39 已完成并要求继续 Task 40；不重新打开 Task 39。本轮为批准目标设计 §3.8 的接线前置，不改变 HTTP DTO、模型选择 UX、正式决定或持久化。API 不加载生成 SDK、不暗选首条连接；生产入队和 Worker durable 执行仍须后续独立接线。
- 当前行为：StoryAgent 使用旧 `AgentInvocationPort`，Host 传 provider/model；Worker 只注册 `agent.invoke@2`。API 的生成服务未装配；隔离控制器测试注入服务不代表完整产品已启用。原计划 §7 的 @1 执行假设由 Task 39 已交付的 @2 合同替代，读取权限、精确来源版本与人工确认边界不变。
- 可观察验收（最多三条）：① Host 提供连接 ID，经 @2 Action/真实 Adapter 到合成 SDK 返回待确认候选，保留实际 provider/model 与精确输入；② 无效连接、外呼失败、无效提案、预先取消或返回后取消不保存候选、不作正式决定；③ 默认摘要和显式正文权限回归不变，无 provider/model/凭证覆盖进入输入。
- 依赖：Task 39（已完成）、批准目标架构 §8、当前 Invocation @2 spec。写入登记：repository `D:\Otirik\Workstation\cosmos`，master，主工作区，base `31d957779150e4e8b41be9038a315137f60ef666`，启动时 clean；leader 唯一写入者。核心集合为 `packages/application/src/story-agent.ts`、其测试、`apps/api/src/app.controller.structured-content.test.ts`、新增 Worker 组合测试；文档仅 Task40、相应当前 spec 和 PROJECT-STATUS，不触碰 Prisma/公共 DTO。全部输入内存合成，不读真实数据/凭证，不联网。
- 实施顺序：先加 @2 输入和 Worker 组合行为测试并运行 RED；再将 Host 的 provider/model 替换为 connectionId、端口替换为 AgentInvocationV2Port，进入读取前验证连接 ID/取消信号；运行 GREEN 与候选保存/接受回归，补最小 spec。预计命令：`bun run vitest run packages/application/src/story-agent.test.ts apps/worker/src/story-agent-invocation.test.ts apps/api/src/app.controller.structured-content.test.ts`；`bun run typecheck`；`bun run docs:check`；`git diff --check`。完整浏览器/真实来源/真实 Agent/升级未在本轮内；独立 Agent 路由工具不可指定时不以默认模型替代。本轮按仓库当前 RED/GREEN 合同执行，不沿用历史 TDD-off 假设。
- 文档预算：walkthrough 当前 41,737 字节，超过健康区；收口前只把更早实施记录整段移入同名目录分册，当前状态、有效决定及本轮记录保留主文档。不全量导入旧会话。

### 2026-10-26：内部 @2 切片结果

- 已实现并验证：`StoryAgent`/Host 改用 `AgentInvocationV2Port`/connectionId，读取前拒绝空连接和预先取消；候选沿用实际返回的 provider/model。默认摘要、显式正文权限、精确版本及人工决定边界不变。Worker 新组合测试经真实 Registry/@2 工厂/pi-ai Adapter，连接/凭证/SDK 均合成，不联网；覆盖 pending 保存、历史版本、预算夹取，以及连接无效、调用失败、坏提案、调用中取消不保存。
- 聚焦命令：`bun run vitest run packages/application/src/story-agent.test.ts apps/worker/src/story-agent-invocation.test.ts apps/worker/src/agent-action-v2.test.ts packages/agent-pi-ai/src/invocation-v2.test.ts apps/api/src/app.controller.structured-content.test.ts packages/application/src/story-agent-candidates.test.ts packages/storage-prisma/src/story-agent-candidates.test.ts`，7 文件/44 测试通过（pwsh-3944dc06e84f4c2b，exit 0）。
- `bun run typecheck` 全仓通过（pwsh-c0b9c8b2df0e412b，exit 0）；`bun run test` 默认单元/集成套件 199 文件/1145 测试通过，183.30s（pwsh-41c670022331494e，exit 0）。数据库测试仅隔离根；不代表浏览器或真实 Agent 验收。
- 文档：同步 Task README、API/Invocation/Adapter spec 与 PROJECT-STATUS；历史实施 17,468 字节原文移入分册，仅修正两个相对链接；早期产品阅读验收原文另移入第二分册。主记录保留当前状态和有效决定，两分册均低于双轨健康上限。
- 文档校验：`bun run docs:check` 1172 文件、0 failures；`git diff --check` 通过；`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` PASS，5 条既有基线增长 warning（pwsh-494f934a7ac54e8f，exit 0）。主记录 21,040 字节/约 6841 token（本条追加前），PROJECT-STATUS 28,314 字节/约 8982 token。首次遗漏 baseline 参数的大小命令失败；补参后发现两个 token 超限，已通过历史分册和摘要精简修正，未放宽阈值或新增豁免。初次 diff 检查的尾部空行也已修正。
- 未运行：本轮完整产品/组件浏览器、真实来源、真实 Agent、构建部署、旧用户库升级及独立审查；未创建/恢复 goal，无子 Agent或 Git 外部操作。信心 B，仅内部合同切片通过，Task40 未完成。生产生成仍未配置（409）；下一步接通产品连接选择、API 入队及 Worker durable Story 执行，再验生成→待确认→接受/拒绝；真实请求逐次另获授权。
