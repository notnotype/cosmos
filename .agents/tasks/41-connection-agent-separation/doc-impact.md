# Task 41 文档影响记录

## 需要更新的文档

基于 Phase 1 (Schema) 和 Phase 2 (合同) 的变更，以下文档需要更新：

### 1. API 文档
**文件**: `docs/api/0009-provider-model-configuration.md`

**需要更新**:
- `agent.invoke@2` 的输入 schema：移除 `connectionId`，增加可选 `modelId`
- `agent.invoke@2` 的输出 schema：增加可选 `cost` 字段
- `ConfiguredModel` 字段说明：增加 `inputPricePerMillion` 和 `outputPricePerMillion`

### 2. 应用规格文档
**文件**: `docs/spec/application/0010-agent-invocation.md`

**需要更新**:
- `agent.invoke@2` 的 `connectionId` 输入描述改为 `modelId`（可选）
- 增加默认模型逻辑的说明
- 增加成本计算的说明

### 3. 合同规格文档
**文件**: `docs/spec/contracts/0001-public-contracts/part-03-content-dtos.md`

**需要更新**:
- 创建/更新 ConfiguredModel 命令的字段清单：增加价格字段
- ConfiguredModel 快照的字段清单：增加价格字段

## 实施状态

- [x] Phase 1: Schema 变更完成
- [x] Phase 2: 合同变更完成
- [x] Phase 3.1: SystemConfig Repository 完成
- [ ] Phase 3.2-3.4: 后端核心重构（进行中）
- [ ] Phase 4: 前端 UI
- [ ] Phase 5: 测试验证
- [ ] 文档更新（待文档工程师处理）

## SystemConfig 存储合同（Phase 3.1 新增）

**接口**: `SystemConfigRepository`

**关键行为**:
- `getDefaultModelId()`: 返回默认模型 ID，未设置时返回 `null`
- `setDefaultModelId(modelId)`: 设置默认模型，传入 `null` 清空配置
- `ensureSingleton()`: 幂等创建单例记录，保留已有配置

**验证边界**:
- 单例 ID 固定为 `"singleton"`
- `ensureSingleton()` 不更新 `updatedAt` 时间戳（仅在首次创建时设置）
- `getDefaultModelId()` 不修改数据（只读操作）
- `setDefaultModelId()` 更新 `updatedAt` 时间戳

**实现位置**: `packages/storage-prisma/src/system-config.ts`

## 备注

- 本记录由 Phase 2 的后端程序员提出
- 文档更新应在所有代码实现完成后，由文档工程师统一处理
- 当前状态：仅记录，未修改文档
