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

（待实施过程中更新）
