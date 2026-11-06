# Proposal：拆分 Connection 与默认模型配置 v1

> 状态：Draft（待用户评审）
>
> 日期：2026-11-06
>
> 关联：[ADR-0017](../adr/0017-connection-secret-state-v1.md)、[ADR-0027](../adr/0027-connection-login-lifecycle-v1.md)、[connection-credential-entry-v1](connection-credential-entry-v1.md)、[Task 39](../../.agents/tasks/39-pi-ai-adapter/README.md)

## 问题

当前 `ConnectionInstance` 承载了两个完全不同的职责，导致概念混淆和用户理解困难：

### 1. 职责 A：外部平台登录身份（原始设计）
```typescript
// 用于采集器抓取内容
Connection: "我的 Bilibili 账号"
├── connectorId: "bilibili"
├── configJson: { profile: "my-profile" }
└── 用途：采集动态、推荐流
```

### 2. 职责 B：AI 模型调用配置（后来扩展）
```typescript
// 用于用户生成内容时选择使用哪个模型
Connection: "工作用 GPT-4"
├── connectorId: "model" (?)
├── modelId: "gpt-4"
└── 用途：用户点"生成建议"时要选择这个"连接"
```

## 核心问题

1. **概念混淆**："我的 Bilibili 账号" 和 "选择用哪个 AI 模型" 是完全不同的东西，却用同一个 Connection 概念表达
2. **用户心智模型不匹配**：用户理解的"账号"是平台登录身份（Bilibili、邮箱），而不是"AI 模型配置"
3. **交互困扰**：用户每次点"生成建议"都要选择"连接"，但他们根本不理解为什么要选"账号"来生成 AI 内容
4. **架构债务**：强行将两个独立概念塞进一个对象，违反单一职责原则

## 实际使用流程对比

### 当前（混淆的）流程
```
用户在 Story 阅读页：
1. 点击"生成建议"
2. 【困惑】系统要求选择"账号" ← 用户：为什么要选账号？
3. 看到列表：
   - 我的 Bilibili 账号 ← 这是采集用的
   - 工作用 GPT-4    ← 这才是模型配置
4. 选择"工作用 GPT-4"
5. AI 生成建议
```

### 期望（清晰的）流程
```
用户在 Story 阅读页：
1. 点击"生成建议"
2. 系统使用默认模型配置，直接开始生成
3. AI 生成建议

用户可以在设置中：
- 查看当前默认模型：GPT-4
- 随时更换：改成 DeepSeek
```

## 目标

**不是**创建新的 AgentProfile 概念，而是：

1. **Connection**：回归原始职责，只用于外部平台登录身份（Bilibili、RSS、IMAP）
2. **系统默认模型配置**：用户设置一次，全局生效，不再需要每次选择

## 提议的设计

### 核心思路：利用现有的 Provider/Model 配置，增加系统默认配置

**关键认识**：
- ✅ Provider/Model 配置已经存在（`/models` 页面）
- ✅ 不需要新增 AgentProfile 概念
- ✅ 只需要：移除"模型型 Connection" + 增加"默认模型配置"

### 1. Connection（保持纯粹，只用于平台登录）

```typescript
/**
 * 外部平台的登录身份，只用于采集器抓取内容。
 * 例如：Bilibili 账号、RSS 订阅、IMAP 邮箱等。
 */
interface Connection {
  id: string;
  name: string;                    // "我的 Bilibili 主账号"
  connectorId: string;             // "bilibili", "rss", "imap"
  account?: string;                // 用户可见的账号标识
  scopeJson?: string;              // 授权范围描述
  configJson?: string;             // 适配器非秘密配置
  secretRef?: string;              // 指向 SecretStore 的凭证引用
  status: "active" | "revoked" | "expired" | "error";
  lastError?: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// 使用场景
SourceInstance {
  connectionId?: string;  // 引用 Connection（用于需要登录的采集）
}
```

**关键变化**：
- ❌ 删除所有"模型型连接"（connectorId = "model" 的那些）
- ✅ Connection 回归单一职责：只用于平台登录

### 2. 系统级默认模型配置（新增）

```typescript
/**
 * 系统级配置：用户设置默认使用哪个模型。
 * 存储在系统配置表或用户偏好设置中。
 */
interface SystemConfig {
  // 其他系统配置...
  
  defaultModelProviderId: string;  // 默认使用哪个 Provider
  defaultModelId: string;          // 默认使用哪个 Model
}

// 或者更简单的方式：
interface UserPreferences {
  defaultModelId: string;  // 直接引用 ConfiguredModel.id
}
```

### 3. Agent 调用链路变化

**当前（混淆的）：**
```
用户点"生成建议"
  ↓
选择 Connection（模型型连接）
  ↓
Connection → Model → Provider → API Key
  ↓
调用模型
```

**重构后（清晰的）：**
```
用户点"生成建议"
  ↓
读取用户的默认模型配置
  ↓
Model → Provider → API Key
  ↓
调用模型

（不再需要 Connection 这一层）
```

### 4. UI 变化

#### 当前（混淆的）
```
自动化页：
├── 采集计划
├── 账号  ← 混合显示平台账号和"模型连接"
│   ├── 我的 Bilibili 账号（用于采集）
│   ├── 工作用 GPT-4（用于 AI）← 概念混淆
│   └── 研究用 DeepSeek（用于 AI）← 概念混淆
└── 运行记录

Story 阅读页：
└── 生成建议
    └── 选择"账号"  ← 用户困惑：为什么生成 AI 内容要选账号？
```

#### 重构后（清晰的）
```
自动化页：
├── 采集计划
├── 账号  ← 只显示平台登录账号
│   ├── 我的 Bilibili 账号
│   ├── 我的 RSS 订阅
│   └── 我的邮箱
└── 运行记录

模型页（已存在）：
├── 服务商
│   ├── OpenAI
│   └── DeepSeek
└── 模型
    ├── GPT-4
    └── DeepSeek-V3

设置页（新增或扩展）：
└── AI 模型设置
    ├── 当前默认模型：GPT-4 ⭐
    ├── [更换默认模型]
    └── 预算设置：每天 $5

Story 阅读页：
└── 生成建议  ← 直接点击，使用默认模型
    （可选：显示"当前使用 GPT-4"）
```

## 重构范围

### 最小化方案（推荐）

#### 阶段 1：清理概念（核心）
1. **识别并迁移现有"模型型连接"**
   - 找到所有 `connectorId = "model"` 或带 `modelId` 的 Connection
   - 记录它们引用的 modelId
   
2. **增加系统默认模型配置**
   ```sql
   -- 方案 A：在系统配置表中增加字段
   ALTER TABLE system_config 
   ADD COLUMN default_model_id TEXT REFERENCES configured_model(id);
   
   -- 方案 B：在用户偏好表中增加字段（如果有多用户）
   ALTER TABLE user_preferences 
   ADD COLUMN default_model_id TEXT REFERENCES configured_model(id);
   ```

3. **修改 `agent.invoke@2` 输入**
   ```typescript
   // 当前
   interface AgentInvocationInputV2 {
     connectionId: string;  // ← 删除这个
     messages: Message[];
     // ...
   }
   
   // 重构后
   interface AgentInvocationInputV2 {
     modelId?: string;      // 可选：临时指定模型，不传则用默认
     messages: Message[];
     // ...
   }
   ```

4. **修改调用链路**
   ```typescript
   // packages/application/src/agent-invocation-v2.ts
   
   // 当前：从 Connection 解析模型
   const connection = await getConnection(connectionId);
   const model = await getModel(connection.modelId);
   
   // 重构后：直接读取默认模型
   const modelId = input.modelId || (await getDefaultModelId());
   const model = await getModel(modelId);
   ```

#### 阶段 2：UI 调整
1. **删除连接列表中的"模型连接"**
   - 自动化页的"账号"列表只显示平台账号
   
2. **修改 Story 生成界面**
   ```typescript
   // 当前：apps/web/src/copy/areas/reading.ts
   connection: "模型账号",
   selectConnection: "请选择本次使用的账号",
   
   // 重构后：删除这些文案
   // 用户直接点"生成建议"，不再需要选择
   ```

3. **增加默认模型设置界面**
   - 在"设置"页或"模型"页增加：
     ```
     默认模型：GPT-4 (OpenAI) ⭐
     [更换] [查看预算]
     ```

#### 阶段 3：数据迁移和清理
1. **迁移现有"模型型连接"的引用**
   - 找到所有引用"模型连接"的地方
   - 如果有多个"模型连接"，选一个作为默认
   - 其他的记录到迁移日志中

2. **删除"模型型连接"数据**
   ```sql
   -- 备份
   CREATE TABLE connection_instance_backup AS 
   SELECT * FROM connection_instance 
   WHERE connectorId = 'model' OR modelId IS NOT NULL;
   
   -- 删除
   DELETE FROM connection_instance 
   WHERE connectorId = 'model' OR modelId IS NOT NULL;
   ```

3. **删除 Connection 中与模型相关的字段**
   ```sql
   -- 如果有专门为模型连接加的字段，可以删除
   -- 例如：modelId 字段
   ```

### 影响的主要模块

需要修改的文件（估算约 20-30 个文件）：

1. **contracts**：
   - `agent.ts`：修改 `AgentInvocationInputV2`
   - 新增或扩展：`SystemConfig` 或 `UserPreferences`

2. **application**：
   - `agent-invocation-v2.ts`：修改输入处理，直接读取默认模型
   - `story-agent*.ts`：移除 connectionId 参数

3. **storage-prisma**：
   - 新增：`getDefaultModelId()` / `setDefaultModelId()`
   - `agent-model-resolver.ts`：简化，不再需要从 Connection 解析

4. **apps/api**：
   - 新增：`GET/PUT /api/v1/preferences/default-model`
   - 或在现有设置端点中增加字段

5. **apps/web**：
   - 删除：Story 生成界面的"选择连接"下拉框
   - 新增：设置页的"默认模型"配置界面
   - 清理：连接列表不再显示"模型连接"

## 迁移策略

### 向后兼容考虑

**问题**：如果有用户配置了多个"模型连接"怎么办？

**方案**：
1. 迁移时选择一个作为默认（例如最近使用的）
2. 在迁移日志中记录："已将您的 3 个模型配置合并为 1 个默认配置"
3. 用户可以随时在设置中更换

**实施步骤**：
```sql
-- 1. 找到所有"模型型连接"
SELECT id, name, modelId 
FROM connection_instance 
WHERE connectorId = 'model';

-- 2. 选择一个作为默认（例如最近创建的）
INSERT INTO user_preferences (user_id, default_model_id)
SELECT 'system', modelId 
FROM connection_instance 
WHERE connectorId = 'model'
ORDER BY created_at DESC 
LIMIT 1;

-- 3. 记录迁移日志
INSERT INTO migration_log (message, data)
VALUES ('Migrated model connections to default model config', 
        json_object('old_connections', ...));

-- 4. 删除旧的"模型型连接"
DELETE FROM connection_instance 
WHERE connectorId = 'model';
```

## 收益

### 1. 概念清晰
- **Connection = 平台账号**：用户立即理解"我的 Bilibili 账号"用于采集内容
- **默认模型配置 = 系统设置**：一次设置，全局生效，不需要每次选择
- **用户不再困惑**："生成 AI 内容"不再需要"选择账号"

### 2. 用户体验改善
- ✅ **一键生成**：点击"生成建议"立即开始，不需要额外选择
- ✅ **配置简单**：在设置中配一次默认模型，以后都用这个
- ✅ **随时更换**：需要换模型时，去设置页改一下即可
- ✅ **预算透明**：清楚知道每天花多少钱，超了会怎样

### 3. 代码清晰
- ✅ **单一职责**：Connection 只管平台登录，模型配置是系统设置
- ✅ **调用链简化**：不再需要 Connection 这一层绕路
- ✅ **易于扩展**：未来添加新的模型配置功能不会影响 Connection

### 4. 利用现有设计
- ✅ **不需要新概念**：Provider/Model 配置已经存在
- ✅ **改动最小**：只需删除"模型型连接" + 增加默认配置
- ✅ **向后兼容**：平滑迁移现有数据

## 代价与风险

### 1. 开发成本
- 数据迁移（识别并删除"模型型连接"）
- 应用层重构（约 20-30 文件）
- UI 调整（删除选择框，增加设置页）
- 测试更新

**估算工作量**：小到中等规模重构，约需 3-5 天开发 + 测试

### 2. 用户影响
- **现有用户**：如果配置了多个"模型连接"，迁移时只保留一个作为默认
- **迁移提示**：需要告知用户"您的多个模型配置已合并为默认配置"
- **学习成本**：需要让用户知道"现在在设置里改默认模型"

**缓解措施**：
- 提供迁移日志和说明
- 在 UI 显著位置提示"默认模型配置已更新"
- 文档更新

### 3. 功能取舍
- **失去的能力**：用户不能每次生成时选择不同的模型
- **替代方案**：
  - 方案 A：接受这个限制（多数用户不需要每次换模型）
  - 方案 B：保留"高级选项"，偶尔让用户临时指定模型
  - 方案 C：基于内容类型自动选择模型（Phase 3）

## 验收标准

1. **概念分离完整**：
   - Connection 列表只显示平台账号（Bilibili、RSS、IMAP）
   - 不再有"模型型连接"
   - 设置中可以查看和修改默认模型

2. **功能完整保留**：
   - 所有采集功能正常（使用 Connection）
   - 所有 AI 生成功能正常（使用默认模型配置）
   - 所有现有测试通过

3. **用户体验改善**：
   - Story 生成页面点击"生成建议"直接开始，不需要选择
   - 可选：显示"当前使用 GPT-4"
   - 设置页可以随时更换默认模型

4. **数据完整性**：
   - 所有现有"模型连接"成功迁移为默认配置
   - 迁移日志记录清晰
   - 旧数据已清理

## 与原方案的对比

| 维度 | 原方案（新增 AgentProfile） | 当前方案（默认模型配置） |
|------|---------------------------|------------------------|
| 概念数量 | +1 个新概念 | 0 个新概念 |
| 数据库表 | +1 张新表 | 现有表增加 1-2 个字段 |
| 代码改动 | ~50 文件 | ~20-30 文件 |
| 用户学习成本 | 需要理解 AgentProfile | 只需知道"默认模型设置" |
| 灵活性 | 可配置多个 Profile | 只有一个默认配置 |
| 实施难度 | 中等 | 较小 |
| 是否符合实际需求 | 过度设计 | ✅ 刚好满足需求 |

## 附加：基础成本追踪（阶段 1）

在重构的同时，增加基础的成本追踪功能，让用户知道每次 Agent 调用花了多少钱。

### 为什么需要成本追踪？

用户需要知道：
1. **这次生成花了多少钱**：每次点"生成建议"的实际花费
2. **今天用了多少预算**：避免超支
3. **哪个模型更划算**：帮助选择合适的默认模型

### 数据库变更

```prisma
model ConfiguredModel {
    id              String               @id @default(cuid())
    providerId      String
    modelId         String
    name            String
    contextWindow   Int
    maxOutputTokens Int
    
    // 新增：价格信息（单位：美元 / 1M tokens）
    inputPricePerMillion  Decimal?  @default(0)  // 输入价格
    outputPricePerMillion Decimal?  @default(0)  // 输出价格
    
    version         Int                  @default(1)
    createdAt       DateTime             @default(now())
    updatedAt       DateTime             @updatedAt
    
    provider        ModelProvider        @relation(...)
    connections     ConnectionInstance[]
}
```

### Agent 调用返回增加成本

```typescript
// contracts/src/agent.ts
export const agentInvocationOutputSchema = z.object({
    content: z.string(),
    toolCalls: agentInvocationToolCallSchema.array(),
    usage: agentInvocationUsageSchema,
    
    // 新增：成本信息
    cost: z.object({
        input: z.number().nonnegative(),   // 输入成本（美元）
        output: z.number().nonnegative(),  // 输出成本（美元）
        total: z.number().nonnegative(),   // 总成本（美元）
        currency: z.string().default("USD"),
    }).optional(),  // 可选：如果模型没配置价格，则不返回
    
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
    // 如果模型没有配置价格，返回 undefined
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

### UI 变更

#### 1. 模型配置页 - 增加价格输入

```
手动录入模型
├── 模型 ID: gpt-4
├── 显示名称: GPT-4
├── 上下文窗口: 128000
├── 单次输出上限: 4096
├── 输入价格 ($/1M tokens): 5.00    ← 新增
└── 输出价格 ($/1M tokens): 15.00   ← 新增
```

#### 2. Story 生成页 - 显示成本

```
生成建议
├── 状态：已完成
├── 使用模型：GPT-4
├── Token 使用：
│   ├── 输入：1,234 tokens
│   └── 输出：567 tokens
└── 本次花费：$0.015   ← 新增
```

#### 3. 设置页 - 显示默认模型价格

```
AI 模型设置
├── 默认模型：GPT-4 (OpenAI) ⭐
│   ├── 输入：$5.00 / 1M tokens
│   └── 输出：$15.00 / 1M tokens
└── [更换默认模型]
```

### 实施步骤

1. **数据库迁移**
   ```sql
   -- 增加价格字段
   ALTER TABLE configured_model 
   ADD COLUMN input_price_per_million DECIMAL(10,6) DEFAULT 0,
   ADD COLUMN output_price_per_million DECIMAL(10,6) DEFAULT 0;
   ```

2. **后端实现**
   - 修改 `ConfiguredModel` schema
   - 修改模型创建/编辑 API，增加价格参数
   - 修改 `agent.invoke` 返回，增加 cost 计算

3. **前端实现**
   - 模型配置页增加价格输入框
   - Story 生成页显示成本信息
   - 设置页显示默认模型价格

4. **验证**
   - 测试价格计算是否准确
   - 测试 UI 显示是否正确
   - 测试未配置价格的模型（cost 为 undefined）

### 验收标准

1. ✅ 用户可以为每个模型配置输入/输出价格
2. ✅ 每次 Agent 调用返回准确的成本信息
3. ✅ UI 清晰显示本次调用的花费
4. ✅ 未配置价格的模型不显示成本（不报错）

### 后续增强（Phase 2，不在本次范围）

- 每日预算上限配置
- 调用前预算检查
- 今日已用/剩余显示
- 历史统计和成本分析

---

## 开放问题

1. **多个模型配置的需求**：
   - 问题：是否有用户真的需要频繁切换模型？
   - 建议：先实现单一默认配置，观察实际需求，Phase 3 再考虑多配置

2. **临时指定模型**：
   - 问题：是否需要"这次生成用更好的模型"的能力？
   - 建议：可以保留 `modelId?: string` 参数，UI 提供"高级选项"

3. **预算分配**：
   - 问题：不同场景是否需要不同预算？
   - 建议：v1 使用全局预算，Phase 3 再细化

4. **价格信息来源**：
   - 问题：价格应该手动填写还是自动获取？
   - 建议：阶段 1 手动填写，Phase 2 可考虑从 API 获取最新价格

## 决策记录

- [ ] 用户确认：是否接受该重构提案
- [ ] 开发者确认：工作量评估是否合理
- [ ] 产品确认：单一默认配置是否足够
- [ ] 优先级决定：何时实施该重构

## 后续步骤（待决定）

如果该提案被接受：
1. 创建 Task：拆分 Connection 与默认模型配置
2. 细化技术设计文档
3. 制定详细的迁移计划
4. 执行分阶段实施
5. 更新所有相关文档

---

**维护者注**：本提案由用户在界面文案讨论中发现概念混淆问题而触发。经过深入讨论，明确了 Agent 的实际使用场景（用户主动触发的增强工具），因此采用"系统默认配置"而非"多个 AgentProfile"的方案，以最小的改动解决最核心的问题。核心论点是"将两个独立的概念强行塞进一个对象是不合理的"，这一观点具有充分的架构合理性。
