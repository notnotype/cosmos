# Task 41 Walkthrough

## Setup（2026-11-06）

### 创建 Task 和 Worktree

1. **创建 Task 41 目录和 README**
   - 路径：`.agents/tasks/41-connection-agent-separation/README.md`
   - 基于 Proposal `connection-agent-profile-separation-v1`
   - 状态：Draft → 进行中
   - Commit: `f88b280` - "task: 创建 Task 41 - 拆分 Connection 与默认模型配置"

2. **创建 Worktree**
   - 分支：`refactor/t41-connection-agent-separation`
   - 路径：`.worktree/41-connection-agent-separation`
   - 基于：`origin/master` (f88b280)

### 前期准备工作

#### 1. 检查影响范围

需要检查的关键文件和模块：

**数据库层**：
- [x] `packages/storage-prisma/prisma/schema.prisma`
  - ✅ **ConnectionInstance (L96-120)**：
    - 当前有 `modelId` 字段（L115）
    - 有 `model` 关系（L117：外键到 ConfiguredModel，onDelete: Restrict）
    - 需要删除这两个字段
  - ✅ **ConfiguredModel (L136-150)**：
    - 当前**没有**价格字段
    - 需要增加 `inputPricePerMillion` 和 `outputPricePerMillion`
  - ❌ **系统配置表**：未找到 SystemConfig 或 UserPreferences 表
    - 需要确认：在哪里存储 `defaultModelId`？
    - 选项 1：新建 SystemConfig 表
    - 选项 2：存在 Worker 配置中（临时方案）
    - **决策待定**

**Contracts**：
- [ ] `packages/contracts/src/agent.ts`
  - AgentInvocationInputV2：需要移除 `connectionId`
  - AgentInvocationOutput：需要增加可选 `cost` 字段
  - 成本相关类型定义：需要新增

**Application**：
- [ ] `packages/application/src/agent-invocation-v2.ts`
  - Agent 调用链逻辑：需要改为直接读取默认模型
  - 成本计算逻辑：需要新增
- [ ] `packages/storage-prisma/src/agent-model-resolver.ts`
  - 模型解析逻辑：需要简化（不再从 Connection 解析）

**API**：
- [ ] `apps/api/src/app.controller/` 相关端点
  - Provider/Model 配置 API：需要增加价格参数
  - 系统配置 API：需要增加 defaultModelId 的 GET/PUT

**Web**：
- [ ] `apps/web/src/components/cosmos/connection-panel.tsx`：需要过滤"模型连接"
- [ ] `apps/web/src/components/cosmos/story-panel/agent-candidates.tsx`：需要删除连接选择
- [x] `apps/web/src/copy/areas/*.ts`（已修改）

#### 2. 识别"模型型连接"

关键发现：
- ✅ ConnectionInstance 有 `modelId` 字段（L115）
- ✅ 当 `modelId != null` 时，即为"模型型连接"
- ❓ 需要搜索：哪些代码创建了这种连接？哪些代码在使用它们？

搜索关键字：
- [ ] `modelId` 在 ConnectionInstance 相关代码中的使用
- [ ] 创建 Connection 时设置 modelId 的代码
- [ ] Agent 调用时通过 connectionId 获取模型的代码

#### 3. 依赖检查

确认需要的依赖：
- [ ] Prisma Client 版本
- [ ] 相关类型定义
- [ ] 测试框架

#### 4. 测试策略

确定需要的测试：
- [ ] 单元测试：成本计算逻辑
- [ ] 集成测试：Agent 调用链
- [ ] 端到端测试：UI 交互
- [ ] 数据迁移测试

### 关键发现

1. **ConnectionInstance.modelId 字段存在**
   - 当前 schema 已经有 `modelId` 字段和 `model` 关系
   - 这证实了"模型型连接"确实存在于当前实现中
   - 需要删除：`modelId` 字段和 `model` 关系

2. **ConfiguredModel 缺少价格字段**
   - 需要增加 `inputPricePerMillion: Decimal?`
   - 需要增加 `outputPricePerMillion: Decimal?`

3. **缺少系统配置存储**
   - 未找到 SystemConfig 或 UserPreferences 表
   - 需要确定 `defaultModelId` 存储位置

### 待解决的设计问题

#### 问题 1：defaultModelId 存储位置

**选项 A：新建 SystemConfig 表**
```prisma
model SystemConfig {
    key   String @id
    value String
}
// 存储：key="defaultModelId", value=<model_id>
```
- 优点：通用、可扩展
- 缺点：需要新表

**选项 B：新建 UserPreferences 表（为多用户准备）**
```prisma
model UserPreferences {
    userId         String @id @default("system")
    defaultModelId String?
}
```
- 优点：为未来多用户准备
- 缺点：当前单用户，略显过度设计

**选项 C：存在 Worker 配置或环境变量中（临时方案）**
- 优点：最简单
- 缺点：不够灵活，无法通过 UI 修改

**推荐**：选项 A（SystemConfig），通用且简单

#### 问题 2：数据迁移策略

如果数据库中已有"模型型连接"（modelId != null）：
1. 如何选择默认模型？
   - 最近使用的？
   - 让用户首次配置？
   - 如果只有一个，直接用它？
2. 是否需要通知用户？
3. 是否需要提供回滚？

**推荐**：
- 如果只有一个"模型型连接"→ 自动设为默认
- 如果有多个 → 选择最近创建的，记录日志
- 如果没有 → 不设默认，用户首次使用时提示配置

### 下一步

按照 Implementation Plan 的阶段顺序：

1. **Phase 1: 数据库与 Schema（1 天）**
   - 查看当前 schema
   - 设计迁移脚本
   - 更新 Prisma schema

2. **Phase 2: 后端核心逻辑（2 天）**
   - 修改 Agent 调用合同
   - 实现成本计算
   - 更新 Repository

3. **Phase 3: 前端 UI 调整（1.5 天）**
   - 删除连接选择 UI
   - 增加默认模型设置
   - 显示成本信息

4. **Phase 4: 数据迁移与清理（0.5 天）**
   - 迁移现有数据
   - 清理"模型型连接"

5. **Phase 5: 测试与验证（1 天）**
   - 运行所有测试
   - 手动验证

---

## 实施记录

（待开始编码后更新）
