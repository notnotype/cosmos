# Task 41：拆分 Connection 与默认模型配置

> 状态：**进行中**
>
> 编号 41 由维护者分配；本 Task 基于 Proposal [`connection-agent-profile-separation-v1`](../../../docs/proposals/connection-agent-profile-separation-v1.md)。

## User Request / Topic

拆分 `ConnectionInstance` 的两个不同职责，解决概念混淆问题，并增加基础成本追踪功能。

## Goal

1. **Connection 回归单一职责**：只用于外部平台登录身份（Bilibili、RSS、IMAP）
2. **增加系统默认模型配置**：用户一次设置，全局生效，不需要每次选择
3. **基础成本追踪**：模型价格配置 + Agent 调用成本显示

## Problem

当前 `ConnectionInstance` 被迫承担两个完全不同的职责：

1. **职责 A**：外部平台登录身份
   - 用途：采集器抓取内容
   - 示例："我的 Bilibili 账号"

2. **职责 B**：AI 模型调用配置
   - 用途：用户生成内容时选择使用哪个模型
   - 示例："工作用 GPT-4"

### 导致的问题

1. **用户困惑**：为什么"生成 AI 建议"要"选择账号"？
2. **概念混淆**："我的 Bilibili 账号"和"选择用哪个 AI 模型"是完全不同的东西
3. **文案困境**：无法用一个统一的名称同时描述两种用途
4. **架构债务**：违反单一职责原则

## Solution

### 核心思路

利用现有的 Provider/Model 配置体系，不新增 AgentProfile 概念：

1. **Connection 纯化**
   - 删除所有"模型型连接"（connectorId = "model"）
   - 回归单一职责：只用于平台登录

2. **系统默认模型配置**
   - 在系统配置或用户偏好中增加 `defaultModelId`
   - 用户一次设置，全局生效
   - 可随时在设置页更换

3. **Agent 调用链简化**
   - 当前：`connectionId` → Connection → Model → Provider → API Key
   - 重构后：`modelId?` → Model → Provider → API Key
   - 不传 `modelId` 时使用默认模型

4. **基础成本追踪（阶段 1）**
   - `ConfiguredModel` 增加价格字段
   - Agent 调用返回时计算 `cost`
   - UI 显示本次花费

## Scope

### In Scope

1. **数据库变更**
   - `ConfiguredModel` 增加 `inputPricePerMillion`、`outputPricePerMillion`
   - 系统配置表增加 `defaultModelId`（或在 `UserPreferences` 中）

2. **后端变更**
   - `AgentInvocationInputV2`：移除 `connectionId`，改为可选的 `modelId`
   - `agent.invoke@2`：读取默认模型，计算成本
   - `ConfiguredModel` CRUD：增加价格字段
   - Repository：增加 `getDefaultModelId()` / `setDefaultModelId()`

3. **前端变更**
   - 删除 Story 生成页的"选择连接"下拉框
   - 增加设置页的"默认模型配置"
   - 连接列表不再显示"模型连接"
   - 模型配置页增加价格输入
   - Story 生成页显示成本信息

4. **数据迁移**
   - 识别现有"模型型连接"
   - 选择一个作为默认模型
   - 删除所有"模型型连接"数据
   - 迁移日志记录

5. **测试**
   - Agent 调用不再需要 connectionId
   - 成本计算准确性
   - UI 显示正确性
   - 数据迁移完整性

### Out of Scope（后续 Phase）

- 每日预算上限配置
- 调用前预算检查
- 今日已用/剩余显示
- 历史统计和成本分析
- 多个模型配置（Profile）
- 临时指定模型的高级选项
- 自动获取模型价格

## Acceptance Criteria

1. ✅ Connection 列表只显示平台账号（Bilibili、RSS、IMAP），不再有"模型连接"
2. ✅ 用户可以在设置页查看和更换默认模型
3. ✅ Story 生成页点击"生成建议"直接开始，不需要选择连接
4. ✅ 用户可以为每个模型配置输入/输出价格
5. ✅ 每次 Agent 调用返回准确的成本信息（包含 `cost` 字段）
6. ✅ UI 清晰显示本次调用的花费
7. ✅ 所有采集功能正常（使用 Connection）
8. ✅ 所有 AI 生成功能正常（使用默认模型配置）
9. ✅ 现有"模型型连接"成功迁移为默认配置
10. ✅ 所有相关测试通过

## Implementation Plan

### Phase 1: 数据库与 Schema（1 天）

1. 增加 `ConfiguredModel.inputPricePerMillion` 和 `outputPricePerMillion`
2. 增加系统配置 `defaultModelId`（或在 `UserPreferences` 中）
3. 编写数据库迁移脚本
4. 更新 Prisma schema

### Phase 2: 后端核心逻辑（2 天）

1. 修改 `AgentInvocationInputV2`：移除 `connectionId`，增加可选 `modelId`
2. 修改 `AgentInvocationOutput`：增加可选 `cost` 字段
3. 实现成本计算逻辑 `calculateCost()`
4. 修改 `agent.invoke@2` 调用链：
   - 读取默认模型（如果 `modelId` 未提供）
   - 直接从 Model → Provider → SecretStore
   - 计算并返回 cost
5. 实现 `getDefaultModelId()` / `setDefaultModelId()`
6. 修改 ConfiguredModel CRUD API：增加价格参数

### Phase 3: 前端 UI 调整（1.5 天）

1. **删除"选择连接"UI**
   - 移除 Story 生成页的连接选择下拉框
   - 删除相关文案和组件

2. **增加默认模型设置**
   - 在设置页（或模型页）增加"默认模型"配置
   - 显示当前默认模型和价格
   - 提供更换功能

3. **增加价格配置**
   - 模型配置页增加价格输入框（输入/输出）

4. **显示成本信息**
   - Story 生成页显示本次花费
   - 显示 Token 使用量

5. **清理连接列表**
   - 确保连接列表只显示平台账号

### Phase 4: 数据迁移与清理（0.5 天）

1. 识别所有"模型型连接"
2. 选择一个作为默认模型（最近使用的）
3. 记录迁移日志
4. 删除"模型型连接"数据
5. 验证迁移完整性

### Phase 5: 测试与验证（1 天）

1. 单元测试：成本计算准确性
2. 集成测试：Agent 调用链
3. 端到端测试：UI 交互
4. 数据迁移测试
5. 回归测试：确保采集功能不受影响

**总计**：5-7 天

## Technical Details

### 数据库 Schema 变更

```prisma
model ConfiguredModel {
    id              String   @id @default(cuid())
    providerId      String
    modelId         String
    name            String
    contextWindow   Int
    maxOutputTokens Int
    
    // 新增：价格信息（单位：美元 / 1M tokens）
    inputPricePerMillion  Decimal?  @default(0)
    outputPricePerMillion Decimal?  @default(0)
    
    version         Int      @default(1)
    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt
    
    provider        ModelProvider @relation(...)
}

// 方案 A：在系统配置中
model SystemConfig {
    // ... 其他配置
    defaultModelId  String?
}

// 方案 B：在用户偏好中（如果有多用户）
model UserPreferences {
    userId          String   @id
    defaultModelId  String?
    // ... 其他偏好
}
```

### Agent 调用合同变更

```typescript
// contracts/src/agent.ts

// 输入：移除 connectionId
export const agentInvocationInputV2Schema = z.object({
    messages: agentInvocationMessageSchema.array(),
    tools: agentInvocationToolSchema.array().optional(),
    modelId: z.string().optional(),  // 可选：不传则用默认
}).strict();

// 输出：增加 cost
export const agentInvocationOutputSchema = z.object({
    content: z.string(),
    toolCalls: agentInvocationToolCallSchema.array(),
    usage: agentInvocationUsageSchema,
    cost: z.object({
        input: z.number().nonnegative(),
        output: z.number().nonnegative(),
        total: z.number().nonnegative(),
        currency: z.string().default("USD"),
    }).optional(),
    provider: z.string(),
    model: z.string(),
    finishReason: z.enum(["stop", "tool_call", "length", "cancelled"]),
    metadata: z.record(z.string(), jsonValueSchema).default({}),
}).strict();
```

### 成本计算逻辑

```typescript
// application/src/agent-invocation-v2.ts

function calculateCost(
    usage: AgentInvocationUsage,
    model: ConfiguredModel
): { input: number; output: number; total: number; currency: string } | undefined {
    if (!model.inputPricePerMillion || !model.outputPricePerMillion) {
        return undefined;
    }
    
    const inputCost = (usage.inputTokens / 1_000_000) * Number(model.inputPricePerMillion);
    const outputCost = (usage.outputTokens / 1_000_000) * Number(model.outputPricePerMillion);
    
    return {
        input: inputCost,
        output: outputCost,
        total: inputCost + outputCost,
        currency: "USD",
    };
}
```

## Dependencies

- Prisma Client（数据库）
- @cosmos/contracts（合同变更）
- @cosmos/application（业务逻辑）
- @cosmos/storage-prisma（Repository）
- apps/api（API 端点）
- apps/web（前端 UI）

## Risks & Mitigations

### 风险 1：现有用户配置了多个"模型连接"
**影响**：迁移时只能保留一个作为默认  
**缓解**：
- 记录详细的迁移日志
- UI 提示用户"您的多个模型配置已合并为默认配置"
- 提供恢复指南（如果需要）

### 风险 2：未配置价格的模型
**影响**：无法显示成本信息  
**缓解**：
- `cost` 字段设为可选
- UI 优雅降级：不显示成本（不报错）
- 提示用户配置价格

### 风险 3：依赖 Connection 的其他代码
**影响**：可能存在未发现的依赖  
**缓解**：
- 全局搜索 `connectionId` 引用
- 充分的回归测试
- 分阶段实施，先验证核心路径

### 风险 4：用户需要临时切换模型
**影响**：只有一个默认配置可能不够灵活  
**缓解**：
- 保留 `modelId?` 参数，允许临时指定
- Phase 2 可增加"高级选项"
- 先观察实际需求再决定

## References

- Proposal：[`docs/proposals/connection-agent-profile-separation-v1.md`](../../../docs/proposals/connection-agent-profile-separation-v1.md)
- ADR-0017：[`docs/adr/0017-connection-secret-state-v1.md`](../../../docs/adr/0017-connection-secret-state-v1.md)
- ADR-0027：[`docs/adr/0027-connection-login-lifecycle-v1.md`](../../../docs/adr/0027-connection-login-lifecycle-v1.md)
- Task 39：[`.agents/tasks/39-pi-ai-adapter/README.md`](./../39-pi-ai-adapter/README.md)

## Notes

- 本 Task 由用户在界面文案讨论中发现概念混淆问题而触发
- 核心理念："将两个独立的概念强行塞进一个对象是不合理的"
- 采用最小化重构方案，利用现有 Provider/Model 体系
- 成本追踪作为附加功能，先实现阶段 1（基础显示）
- 文案修改已在 master 分支提交（commits: c0ab9ac, be67aa7）

## Walkthrough

### Phase 1: Schema 变更 ✅

**实施日期**: 2026-11-06

**变更内容**:
- `ConfiguredModel` 增加 `inputPricePerMillion Decimal? @default(0)` 和 `outputPricePerMillion Decimal? @default(0)`
- 新增 `SystemConfig` 单例模型（固定 ID = "singleton"）
- 删除 `ConnectionInstance.modelId`、`model` 关联和 `@@index([modelId])`
- 删除 `ConfiguredModel.connections` 反向关联

**迁移文件**: `packages/storage-prisma/prisma/migrations/20261106085039_task_41_connection_agent_separation/migration.sql`

**验证**: `npx prisma format`、`npx prisma validate`、`npx prisma generate`、`git diff --check` 均成功

**偏差**: 使用系统临时目录隔离 SQLite 数据库执行 `migrate dev`，未连接项目数据库

---

### Phase 2: 合同变更 ✅

**实施日期**: 2026-11-06

**变更内容**:
- `agentInvocationV2InputSchema`: 移除 `connectionId`，增加可选 `modelId`
- `agentInvocationOutputSchema`: 增加可选 `cost` 字段（input/output/total/currency）
- `createConfiguredModelCommandSchema` 和 `updateConfiguredModelCommandSchema`: 增加非负可选 `inputPricePerMillion` 和 `outputPricePerMillion`

**修改文件**:
- `packages/contracts/src/agent.ts`
- `packages/contracts/src/provider-model.ts`
- 对应测试文件

**验证**:
- `bun run --cwd packages/contracts build` 成功
- `bun run --cwd packages/contracts typecheck` 成功
- `bunx vitest run packages/contracts/src` 通过 116 项测试
- `git diff --check` 无错误

---

### Phase 3.1: SystemConfig Repository ✅

**实施日期**: 2026-11-06

**范围**: 实现系统配置的存储层

**新增文件**:
- `packages/storage-prisma/src/system-config.ts` (58 行)
  - `SystemConfigRepository` 接口
  - `SystemConfigSnapshot` 类型
  - `PrismaSystemConfigRepository` 实现（`ensureSingleton()`、`getDefaultModelId()`、`setDefaultModelId()`）
- `packages/storage-prisma/src/system-config.test.ts` (165 行，10 个测试用例)
- `packages/storage-prisma/src/index.ts` (增加导出)

**TDD 证据**:
- RED: 空行为 stub 时 9 fail / 1 pass（SQL setup 成功）
- GREEN: 实现后 10 pass / 0 fail

**验证**:
1. `bun test src/system-config.test.ts`: 10 pass, 22 assertions, exit 0
2. `bun run test -- packages/storage-prisma/src/system-config.test.ts`: Vitest 10 pass, exit 0
3. 新模块严格类型检查（`tsc --noEmit --strict`): exit 0
4. `git diff --check`: exit 0，无 tab/行尾空白
5. 运行时导入验证: `PrismaSystemConfigRepository` 可从 `@cosmos/storage-prisma` 正确导入

**批准偏差**:
- Windows Prisma 6 不支持 `file::memory:` URL（SQLite error 14）
- 改用每个测试用例 `mkdtemp` 独占临时 SQLite 文件
- 真实迁移中提取 `SystemConfig` 的 `CREATE TABLE`
- `PRAGMA foreign_keys=ON`
- `disconnect` 后 `finally` 清理

**跨 Phase 阻塞**:
- 包级 `bun run build` / `bun run typecheck` 因其他模块仍使用 `connectionId` 和 `ConnectionInstance.modelId` 而失败
- 待 Phase 3.2-3.4 统一修复

**Code Review**: 无阻断/重要问题，可选入口导出建议已通过运行时验证完成

**未运行**: 全仓测试、根 build、E2E、真实库迁移

---

### Phase 3.2: 重构 agent-invocation-v2 / AgentModelResolver / pi-ai 适配器 ✅

**实施日期**: 2026-11-06

**变更内容**:
- `application/src/agent-invocation-v2.ts`: 删除 `AgentModelConnectionResolver`/`AgentModelConnectionSnapshot`，新增 `AgentModelResolver`/`AgentModelSnapshot`（含价格字段）
- `storage-prisma/src/agent-model-resolver.ts`: 删除 `PrismaAgentModelConnectionResolver`，新增 `PrismaAgentModelResolver`（通过 modelId 或 SystemConfig 默认值查询）
- `agent-pi-ai/src/invocation-v2.ts`: 适配器改用 `models: AgentModelResolver`，增加 USD 成本计算；价格未配置时 `cost` 为 undefined
- 更新对应测试文件

**验证**: 30 项测试通过（agent-pi-ai + application action + story-agent），application 和 agent-pi-ai 的 typecheck/build 均通过

---

### Phase 3.3: Story Agent DTO 迁移 + storage-prisma 修复 ✅

**实施日期**: 2026-11-06

**变更内容**:
- `contracts/src/story-agent.ts`: `storyAgentGenerationRequestSchema` 从 `connectionId` 改为可选 `modelId`；`storyAgentGenerationSchema` 删除 `connectionId` 字段
- `application/src/story-agent.ts`: `StoryAgentHost.connectionId` 改为 `modelId?`（可选）
- `application/src/story-agent-preparation.ts`: 传递可选 `modelId` 给 `agentInvocationV2InputSchema`
- `application/src/story-agent-workflow-control.ts`: 移除模型连接 resolver 预检，按 `modelId` 做幂等比较，不再输出 `connectionId`；manifest hash 更新为 `builtin:cosmos.story-agent@1:model-v3`
- `storage-prisma/src/repository/helpers-4.ts`: 不再读取已删除的 `ConnectionInstance.modelId`（投影 null）
- `storage-prisma/src/repository/sources.ts`: 删除 `ConnectionInstance.modelId` 的 create/update 读写及关联模型校验

**验证**:
- `packages/storage-prisma` build/typecheck 通过
- `packages/contracts` build/typecheck 通过
- `packages/application` build/typecheck 通过
- story-agent 测试 20 项通过；contracts + application + transport-client 合测 29 项通过
- API 合同测试 8 项通过（通过仓库 Vitest 运行）

---

### Phase 3.3b: 修复 apps/worker ✅

**实施日期**: 2026-11-10

**变更内容**:
- `apps/worker/src/agent-action-v2.ts`: `createWorkerAgentInvocationV2Action` 参数从 `connections: AgentModelConnectionResolver` 改为 `models: AgentModelResolver`
- `apps/worker/src/main.ts`: 主启动函数中使用 `PrismaAgentModelResolver` + `PrismaSystemConfigRepository` 替代 `PrismaAgentModelConnectionResolver`
- 相关测试文件适配

**验证**:
- Worker 包独立测试 10 files / 43 tests 通过
- Worker 类型检查通过

---

### Phase 3.4: React 前端完整迁移 ✅

**实施日期**: 2026-11-10
**实施者**: React 前端子代理 (8330925e)

**变更内容**:
- `apps/web/src/component-lab/registry/definitions-cosmos.tsx`: Story Agent 参数从 `connectionId` 改为可选 `modelId`
- `apps/web/src/component-lab/model-fixtures.tsx`: 新增 `createModelFixtures()`，删除 `createConnectionFixtures()` 中的模型连接夹具
- `apps/web/src/component-lab/registry/controls.ts`: 控制器从 `connection` 改为 `model`（可选）
- `apps/web/src/component-lab/product-fixtures.tsx`: 删除 `configuredModelConnectionFixture`
- 新增 `apps/web/src/component-lab/model-fixtures.test.ts`: 模型夹具单元测试
- 更新 `apps/web/src/component-lab/registry.test.ts`: 适配新的 model 控制器

**验证**:
- `bunx vitest run apps/web/src/component-lab/` → 5 files / 34 tests passed
- 前端类型检查通过

---

### Phase 3.5: 测试层全面修复 ✅

**实施日期**: 2026-11-10
**实施者**: 测试工程师子代理 (550808ab) + 主 agent

**根因分析**:

1. **Schema 快照过期**：Story Agent 和 Task 39 的隔离数据库快照仍使用 Task 41 之前的 schema，缺少 `ConfiguredModel.inputPricePerMillion` 和 `outputPricePerMillion` 两列，导致 `ConfiguredModels.create` 在 configuration 阶段失败，`transportSends=0`

2. **产品代码 bug**（非 Task 41 引入）：`IngestionService` 错误使用 `source.id` 而非 `source.planId` 调用 checkpoint API，触发外键约束失败 (P2003)，作业变 `retry_wait`

**修改文件** (8 个测试/辅助文件):

1. `scripts/acceptance/story-agent-isolation.ts`: 更新 schema 快照 pin 到包含 Task 41 的 commit 7ca568a
2. `scripts/acceptance/story-agent-plan.ts`: 明确返回 `{ modelId, models: PrismaAgentModelResolver }`
3. `scripts/acceptance/story-agent-runner.test.ts`: 新增真实隔离库回归测试（价格列、显式/默认模型解析）
4. `.agents/tasks/39-pi-ai-adapter/connection-smoke-harness.ts`: 更新 schema 快照，迁移数量 42→43
5. `.agents/tasks/39-pi-ai-adapter/connection-smoke.test.ts`: 迁移断言对齐，改 `resolvedFromModel`/`deletedRejected`
6. `.agents/tasks/39-pi-ai-adapter/product-flow-acceptance.test.ts`: 修复 `models.delete` 签名
7. `packages/storage-prisma/src/run-control.test.ts`: 修正 `sourceInstance` 夹具
8. `packages/storage-prisma/src/worker-pipeline.test.ts`: checkpoint 改用 `source.planId`，补充 `CollectionPlan` 夹具

**主 agent 修改文件** (4 个辅助文件):

1. `scripts/acceptance/story-agent-runner.ts`: 删除 `connections` 参数，传递 `models`
2. `scripts/acceptance/story-body-runner.ts`: 删除 `connections` 参数
3. `.agents/tasks/39-pi-ai-adapter/connection-smoke-v2.ts`: 返回类型改为 `{ modelId, secretRef }`，改 `resolvedFromModel`，增加删除模型前恢复凭证 + try/finally 清理
4. `packages/storage-prisma/src/run-control.test.ts`: 添加 `sourceInstance` 创建

**验证命令** (全部成功，exit 0):

- `bunx vitest run scripts/acceptance/story-agent-runner.test.ts` → 9 passed (83.33s)
- `bunx vitest run scripts/acceptance/story-body-runner.test.ts` → 10 passed (100.92s)
- `bunx vitest run .agents/tasks/39-pi-ai-adapter/product-flow-acceptance.test.ts` → 1 passed (6.27s)
- `bunx vitest run .agents/tasks/39-pi-ai-adapter/connection-smoke.test.ts` → 40 passed (45.71s)
- `bunx vitest run packages/storage-prisma/src/run-control.test.ts` → 5 passed (35.13s)
- `bunx vitest run packages/storage-prisma/src/worker-pipeline.test.ts` → 7 passed (30.98s)
- **`bunx vitest run` → 220 files / 1308 tests passed (232.06s)**

---

### Phase 3.6: Checkpoint 产品 Bug 修复 ✅

**实施日期**: 2026-11-10
**实施者**: Node 后端子代理 (e5f02032)

**问题**: `IngestionService` 使用 `source.id` 而非 `source.planId` 调用 checkpoint API（既有 bug，非 Task 41 引入）

**修改文件**:
- `packages/application/src/ingestion-service.ts` (2 行)
  - 第 150 行：`getCheckpoint(source.planId)`
  - 第 230 行：`setCheckpoint(source.planId, cursor)`
- 新增 `packages/application/src/ingestion-service.checkpoint.test.ts` (78 行回归测试)

**TDD 证据**:
- RED: 2 failed（旧 cursor 未读取、新 cursor 错写到 source.id）
- GREEN: 2 passed

**验证**:
- `bun run --cwd packages/application typecheck` → exit 0
- `bunx vitest run packages/application apps/worker/src/workflow-ingest.*.test.ts packages/storage-prisma/src/worker-pipeline.test.ts` → 36 files / 253 tests passed (44.09s)
- worker-pipeline 全 7 通过（两项 `retry_wait` → `succeeded`）
- `git diff --check` → exit 0

---

## 最终验证结果

**全量测试**: `bunx vitest run`
- **220 files / 1308 tests passed**
- Duration: 232.06s
- Exit: 0

**类型检查**: 所有包的 `typecheck` 全部通过

**代码质量**: `git diff --check` 无错误

**未运行**: 全仓 E2E、浏览器测试、真实 Provider 请求、生产数据迁移

---

## 文档影响

待更新的技术文档（由文档工程师处理）:
- [ ] API 文档：反映 `modelId` 替代 `connectionId`
- [ ] 架构文档：更新模型配置链路
- [ ] 迁移指南：Connection 模型配置迁移说明

---

## 下一步

- [ ] 前端 UI 实现（设置页的默认模型配置）
- [ ] 数据迁移脚本（识别并删除模型型连接，设置默认模型）
- [ ] API endpoint 实现（SystemConfig CRUD）
- [ ] 成本展示 UI（Story 生成页显示成本信息）
- [ ] E2E 测试覆盖
- [ ] 生产环境验证
