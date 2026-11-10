# Task 42：默认模型配置 UI 与 API 实现

> 状态：**待开始**
>
> 编号 42 由维护者分配；本 Task 基于 Task 41 的基础设施，完成用户可见的默认模型配置功能。

## User Request / Topic

实现系统默认模型配置的完整用户体验：设置界面、API 端点和成本显示。

## Goal

1. **设置页 UI**：用户可以选择系统默认模型
2. **SystemConfig API**：GET/PUT 端点支持默认模型配置
3. **成本显示**：Story 生成页显示预估和实际成本
4. **连接列表清理**：删除过时的"模型连接"相关 UI

## Background

Task 41 已完成后端基础设施：
- ✅ `SystemConfig` 数据表（包含 `defaultModelId`）
- ✅ `ConfiguredModel` 价格字段（`inputPricePerMillion`, `outputPricePerMillion`）
- ✅ Agent 调用接口支持可选 `modelId` 和成本计算
- ✅ `AgentInvocationOutput.cost` 字段

Task 42 需要完成面向用户的功能实现。

## In Scope

### 1. 后端 API

#### 1.1 SystemConfig Repository
- `packages/storage-prisma/src/repository/system-config.ts`
  - `getSystemConfig(): Promise<SystemConfig | null>`
  - `setDefaultModel(modelId: string | null): Promise<void>`
- 单元测试：`system-config.test.ts`

#### 1.2 Application Service
- `packages/application/src/system-config-service.ts`
  - 校验 `modelId` 存在且 active
  - 校验关联的 Provider 也 active
  - 处理并发更新（version 或 updatedAt）
- 单元测试：`system-config-service.test.ts`

#### 1.3 HTTP API
- `packages/api/src/routes/system-config.ts`（或合适的路由文件）
  - `GET /api/v1/system/config` - 读取系统配置
  - `PUT /api/v1/system/config` - 更新系统配置
  - Request/Response DTOs
- API 测试：integration 或 acceptance 层

#### 响应格式示例
```typescript
// GET /api/v1/system/config
{
  "defaultModelId": "model-xxx",
  "defaultModel": {
    "id": "model-xxx",
    "providerId": "provider-yyy",
    "modelId": "gpt-4",
    "name": "GPT-4",
    "contextWindow": 128000,
    "maxOutputTokens": 4096,
    "inputPricePerMillion": 30.0,
    "outputPricePerMillion": 60.0
  }
}

// PUT /api/v1/system/config
{
  "defaultModelId": "model-xxx" // or null
}
```

### 2. 前端 UI

#### 2.1 设置页：默认模型配置
- 位置：`apps/web/src/routes/settings/model.tsx`（或新建）
- 功能：
  - 显示当前默认模型
  - 下拉选择器（列出所有 active 的 ConfiguredModel）
  - 显示模型详情（Provider、上下文窗口、价格）
  - 保存按钮
  - 成功/失败提示
- 数据源：
  - `GET /api/v1/system/config`
  - `GET /api/v1/model-providers` 和 `/models`
  - `PUT /api/v1/system/config`

#### 2.2 Story 生成页：成本显示
- 位置：`apps/web/src/routes/stories/generate.tsx`（或现有组件）
- 功能：
  - **生成前**：显示当前默认模型和预估成本范围
    - 基于模型的输入/输出价格
    - 显示："预估成本：$0.01 - $0.05"
  - **生成后**：显示实际成本
    - 从 `AgentInvocationOutput.cost` 读取
    - 显示："实际成本：$0.023（输入：$0.008，输出：$0.015）"
- 样式：
  - 非侵入式（不干扰主要流程）
  - 小字体、灰色或次要颜色
  - 可选：折叠/展开详情

#### 2.3 连接列表清理
- 位置：`apps/web/src/routes/connections/list.tsx`（或现有）
- 变更：
  - 删除"模型连接"相关的 UI 元素
  - 删除"选择模型"列或标签
  - 确保只显示真实外部连接（Bilibili、RSS、IMAP 等）

### 3. 测试

- **单元测试**：Repository、Service 层
- **API 测试**：HTTP 端点的请求/响应
- **前端测试**：
  - Component 渲染测试
  - 用户交互测试（选择、保存）
  - 可选：E2E 测试（Playwright/Cypress）

### 4. 文档

- 更新 `docs/api/` 中的 API 规范（如有独立文档）
- 更新用户手册（如有）
- Task 42 实施记录（本文件）

## Out of Scope（后续 Phase）

- 每日预算上限配置
- 调用前预算检查
- 今日已用/剩余显示
- 历史成本统计和分析
- 多个模型配置（Profile）
- 按 Story/用户的成本追踪

## Technical Design

### 数据流

```
用户操作（设置页）
  ↓
PUT /api/v1/system/config { defaultModelId }
  ↓
SystemConfigService.setDefaultModel(modelId)
  ↓ 校验模型存在 & active
  ↓ 校验 Provider active
  ↓
SystemConfigRepository.setDefaultModel(modelId)
  ↓
更新 SystemConfig 表
  ↓
返回 200 OK
  ↓
前端刷新显示
```

### 成本计算流程

```
Story 生成请求
  ↓
Agent 调用（modelId 可选）
  ↓ 如果 modelId 缺失
  ↓ 读取 SystemConfig.defaultModelId
  ↓
解析模型配置（含价格）
  ↓
调用 LLM
  ↓
计算成本：
  inputCost = (inputTokens / 1,000,000) * inputPricePerMillion
  outputCost = (outputTokens / 1,000,000) * outputPricePerMillion
  total = inputCost + outputCost
  ↓
返回 AgentInvocationOutput { ..., cost: { input, output, total, currency } }
  ↓
前端显示成本
```

### 错误处理

- `400 invalid_input`: modelId 格式错误
- `404 not_found`: modelId 不存在
- `409 invalid_model_selection`: 模型或 Provider 不是 active 状态
- `503 dependency_unavailable`: 数据库不可用

### 并发控制

- 使用 `SystemConfig.updatedAt` 或 `version` 字段
- 乐观锁：读取时记录版本，更新时检查版本是否变化
- 如果版本冲突，返回 409 并要求客户端重新读取

## Acceptance Criteria

1. ✅ 用户可以在设置页选择默认模型并保存
2. ✅ 保存后，所有 Agent 调用（未显式指定 modelId）使用该默认模型
3. ✅ Story 生成页显示预估和实际成本
4. ✅ 连接列表不再显示"模型连接"相关内容
5. ✅ API 端点通过集成测试
6. ✅ 前端组件通过单元测试
7. ✅ 错误场景（模型不存在、不活跃）有正确的错误处理

## Dependencies

- ✅ Task 41（已完成）：后端基础设施
- SystemConfig 表已存在
- ConfiguredModel 价格字段已存在
- Agent 调用接口已支持 modelId 和 cost

## Risks & Mitigations

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 默认模型被删除 | Agent 调用失败 | 删除模型前检查是否为默认模型，提示用户先更改默认设置 |
| 并发更新冲突 | 用户配置丢失 | 使用乐观锁，冲突时提示用户重新提交 |
| 价格变化 | 成本计算不准确 | 成本基于调用时的价格配置，历史记录不受影响 |
| 无默认模型 | 调用失败 | Agent 调用时检查默认模型是否存在，返回明确错误 |

## Implementation Plan

### Phase 1: 后端 API（优先）
1. SystemConfig Repository
2. SystemConfig Service（含校验）
3. HTTP API 端点
4. API 测试

### Phase 2: 前端 UI
1. 设置页：默认模型配置
2. Story 生成页：成本显示
3. 连接列表清理
4. 前端测试

### Phase 3: 集成与验证
1. 端到端测试
2. 错误场景测试
3. 文档更新
4. Code Review

## 实施记录

待开始...

---

## References

- [Task 41 实施记录](./../41-connection-agent-separation/README.md)
- [Proposal: Connection-Agent-Profile Separation](../../../docs/proposals/connection-agent-profile-separation-v1.md)
- [API 规范: Provider/Model Configuration](../../../docs/api/0009-provider-model-configuration.md)
- [Agent Invocation 规范](../../../docs/spec/application/0010-agent-invocation.md)
