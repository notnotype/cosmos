# Task 42：默认模型配置 UI 与 API 实现

> 状态：**已完成：Story 实际成本、E2E 与规范同步，离线验收通过**（2026-11-11）
>
> 编号 42 由维护者分配；本 Task 基于 Task 41 的基础设施，完成用户可见的默认模型配置功能。
>
> **既有证据**：后端相关回归 30 files / 194 tests；Web + transport 38 files / 243 tests。两组是不同测试范围，不能相加作为全仓结果；本轮验证见下方收尾切片。

## 当前切片：Task 42 收尾（2026-11-11）

- 用户请求原话：“你作为leader，负责分派和管理子Agent，接下来带领你的团队完成：1. 前后端接通Story 实际成本。2.E2E 测试待更新。3.文档更新。”
- 复用理由：三项均是本 Task 上轮明确未交付的范围，重新打开 Task 42，不另造任务编号。
- 生命周期：核对合同、冻结费用传递与消费者，随后实施、运行验收和独立审查。
- 连贯目标：在现有默认模型配置基础上完整显示本次 Story 调用的费用，并使测试与规范匹配当前产品。
- 可观察验收（最多三条）：
  1. Story 调用已有费用从 durable 结果传到 HTTP 与 Web；缺失不填零，零费用保留，不按当前价格重算旧调用。
  2. 陈旧连接/默认模型 E2E 更新为实际外部账号行为；离线隔离验证费用和现有配置流程。
  3. 当前规范、项目状态与实际交付一致，适用检查通过且未验证层明确记录。
- 实施来源分支：`feat/t42-story-cost-e2e-docs`，基线 `12f730c`；提交前已 fetch，本地 master 领先 origin/master 6 个提交、落后 0 个，保留本地基线。
- 写入划分：后端唯一维护公共 Story DTO、application 与仓储/API；前端仅 Web/transport；测试仅 E2E；文档仅 docs 与项目状态；Leader 唯一维护本 Task。所有代理登记完整基线和隔离数据根。
- 依赖顺序：后端冻结 cost 合同 → 前端消费与费用 E2E → 统一构建运行验证 → 规范最终核对。连接/设置 E2E 和已有行为文档可先独立更新。
- 核心文件候选：Story DTO、候选完成投影、生成查询投影、候选 UI、相关 E2E 与其 canonical spec。
- 不在范围内：预算/累计账单、历史费用回填、数据库迁移、真实 Provider 外呼、部署。费用来自调用结果，不能把它当服务商结算账单。
- 验证层级：合同/业务/仓储单元，真实 HTTP/Worker 离线进程 E2E，浏览器与组件实验室聚焦 E2E，类型/构建、文档检查、独立审查。
- 文档影响：**需更新**。接受上轮后端和前端提出的新 API、DTO、默认模型设置、连接清理与费用说明建议，由专职文档工程师核对源码后执行。
- 维护者随后明确要求：“提交和合并改动。”据此授权本地提交并合并 master，实际提交身份以 Git 日志为准；未授权 push、PR 或部署。原有未跟踪 `CON` 保留，不暂存、不删除。
- 工程细节已冻结：candidateJson 为费用持久化真值；完成态通过同 run 的固定候选 ID、Story、Story revision 与 task 核对后投影。

### 已冻结方案与执行计划

用户本轮明确要求接通既有费用展示，沿用已接受的 Task 42 目标，不扩大到账单系统。比较仅内存透传、另建费用表和扩展既有候选 JSON 三种做法后，采用既有候选 JSON：它已有持久化和幂等回放语义，无需 schema 或数据迁移。

- 费用合同：Candidate 与 Generation 增加可选 `cost`，复用 invocation 现有 `{input, output, total, currency}` schema。调用完成投影保留原值到 `candidateJson`；Generation 仅 completed 且候选 ID/Story 匹配时读取相同费用。缺失省略，0 合法，重放不重新计算费用；失败或取消不公开成功费用。
- 后端 owner：`18ae46e6`；测试 owner：`daf6b6ed`；前端 owner：`578528e7`；文档 owner：`e67b965e`（原绑定启动失败后使用可用路由）。补救 writer 共用上述工作区/分支/基线：`0fd9defd` 仅 `application/src/connection-probe{,.test}.ts`（内存测试）；`c6c2794d` 仅 `storage-prisma/src/configured-model-repository{,-client.test}.ts`（隔离根 `.agent/tmp/task39-configured-model-*`）。
- 验收不发真实 Provider 请求。费用离线链路沿用 Worker HTTP/SSE fixture 的 10 输入 / 20 输出 token；输入/输出单价为每百万 1.25/2.5 USD 时，应得到 0.0000125 / 0.00005 / 0.0000625 USD。

1. 后端：持久候选费用、完成态查询投影及 API 装配；补行为测试与类型检查。
2. 前端：每个持久候选复用费用组件；验证缺失、零值、极小正数与 Web 类型。
3. E2E：更新账号、默认设置与 Story 费用；先收集，再统一构建运行 Lab 与真实隔离 API/Worker/Web。保留账号授权、失效及登录探测行为。
4. 文档：专职代理核对当前规范、项目状态与原始需求，检查链接和尺寸。
5. Leader：核对 scope 与费用错误归属，安排独立 spec/质量审查；运行全仓单元、类型与构建，收集每个相关后台 job，记录失败与未运行层。没有授权的 commit/push/merge 保持未执行。

### 实施与阶段证据

- 后端与前端已停止写入。费用完整传到持久候选，UI 每条候选显示一次；历史缺失省略，零值与极小正数区分。Generation 失败时即使存有孤儿候选也省略费用。
- 后端聚焦最终命令：`bunx vitest run packages/contracts/src/story-agent.test.ts packages/application/src/story-agent.test.ts packages/storage-prisma/src/story-agent-candidates.test.ts apps/worker/src/story-agent-workflow.test.ts apps/api/src/app.controller.structured-content.test.ts`，5 files / 38 tests passed；独立审查员重新运行相同范围也通过，当前 spec 与质量两轴无确认 finding。
- 类型命令：`bun run typecheck:contracts`、`bun run typecheck:application`、`bun run typecheck:storage`、`bun run --cwd apps/api typecheck`、`bun run --cwd apps/worker typecheck` 均 exit 0。
- 前端聚焦最终命令：`bun run test -- apps/web/src/components/cosmos/story-panel/agent-candidates.test.ts apps/web/src/components/cosmos/story-panel/story-generation-cost.test.ts apps/web/src/component-lab/agent-candidate-fixture-api.test.ts packages/transport-http/src/client-content.test.ts`，4 files / 43 tests passed；`bun run --cwd apps/web tsc --noEmit` 与修改的 8 个 Web 文件 ESLint 均 exit 0。
- 价格补救后 `bun run build:api && bun run build:worker` 全部 exit 0（18.107s / 3.637s），含公共包/storage 新产物重建。
- **最终全仓** `bun run test`：**229 files / 1411 tests passed**（exit 0；Vitest 229.65s，实耗 3m50.156s），包含最后价格投影修复。前期 fixture 签名施工错误、中间 1409/1411 结果均由此次稳定验证取代。
- 执行器偏差：Bash 新作业遇 Niubash 准备失败，命令未执行；改由有正常 PowerShell 工具的审查员接管，未更改 runtime 或权限。
- 边界：同 fence 同候选回放与变更费用拒绝已验证；探索“保存后回执未知再自动重试 completed”实际为 failed，未改 runtime，不声称自动重试成功。Node 替代 OpenCLI 执行 `bilibili me` 产生合成失败，只验证错误/检查时间写回；早先“版本校验失败”归因已更正。真实 Provider/来源/账号登录未验。

- 文档检查 `bun run docs:check` exit 1：22 条 Task 40 既有断链；`bun run docs:check:ci --base 12f730c9ba5381e6b84a9bbb2fd6d9cfcf3aefb9` 同 22 条且 `changedFiles=[]`、`addedFiles=[]`、`anchorSources=[]`，证明基线已存在。尺寸末版复验 exit 1：项目状态已退出警戒，唯一失败为 Task 40 未改封口分册 30.35 KB / 约 9.9k token；CONTEXT 基线增长仅 warning。未扩大范围或增 baseline 遮蔽。末版 `git diff --check` exit 0。

- `bunx playwright test --config playwright.component-lab.config.ts connection-panel.spec.ts model-configuration.spec.ts story-agent-candidates.spec.ts`：33 tests / 3 files，33 passed（28.7s，exit 0）；browser `--list` 为 4 tests / 3 files。
- browser 首轮 4 failed（1m06.02s）：账号 ID 查找、探测请求、零价期望和 Provider 清理错误；第二轮 1 passed / 3 failed（36.59s）：确认探测 POST 202 / GET 200 后，超长 `result.reason` 违反 DTO 500 字限制，另有二次清理与费用定位器问题。后端 owner `0fd9defd` 已在探测边界截断，同值用于持久 `lastError` 与返回 reason；回归先 RED 2 failed / 7 passed，再 GREEN 9/9，类型通过、独立复审无 finding。API/Worker 已重建，最终全仓与 browser 待收齐。

- browser 第三轮：3 passed / 1 failed（25.71s）。trace 证实 POST/PATCH 已存价格但响应漏字段；PATCH v2 缺 prices 先断言失败，旧 v1 清理再冲突遮蔽。`c6c2794d` 补仓储 select/snapshot；真实 SQLite 聚焦 `bunx vitest run packages/storage-prisma/src/configured-model-repository-client.test.ts` 先 RED 缺字段，再 GREEN 1/1，覆盖 CRUD/零价/null；`bun run typecheck:storage` exit 0。测试先记录响应版本，仍严格校验价格。独立复审无功能 finding；失败日志有界保留于错误后清理隔离根。

- 最终 browser：`bunx playwright test --config playwright.config.ts story-agent-generation.spec.ts connection-visibility.spec.ts default-model-settings.spec.ts`，4 tests / 3 files，**4 passed**（22.65s，exit 0）；环境 `COSMOS_E2E_WEB_PORT=4174`、`COSMOS_OPENCLI_PATH=C:/Program Files/nodejs/node.exe`、`COSMOS_ALLOW_REAL_NETWORK=false`。Next 生产 Web 构建通过；旧 4173 被未知进程占用的启动未执行测试，改独立端口且未动原进程。

三项交付已完成，项目状态与当前规范已同步。独立审查在 spec 与质量两轴无确认功能 finding；探测和价格补救已复审，失败诊断日志建议已闭环。真实 Provider/来源/账号登录、部署与远端 CI 未运行；文档门禁保留上述 Task 40 基线阻断。下方 2026-11-10 报告仅供历史追溯，当前判定以本节为准。

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

### 状态：✅ 已完成

**实施时间**：2026-11-10  
**分支**：`task-42-default-model-ui-api`  
**Base commit**：`7634941655343b87ec9108ed2ced7576de5429a9`

---

### Phase 1: 后端 API 实现 ✅

**负责人**：Node 后端子代理 (b56f9c93)  
**时间**：2026-11-10 下午

#### 实施内容

**增强现有实现**（不新建重复文件）：

1. **SystemConfig Repository** (`packages/storage-prisma/src/system-config.ts`)
   - 保留现有 `getDefaultModelId()` / `setDefaultModelId()`
   - 新增 `getSystemConfigWithModel()` - 返回配置 + 模型详情
   - 新增 `getModelSelection()` - 读取模型和 Provider
   - 新增 `setDefaultModelWithValidation()` - **事务内校验和写入**
   - 事务保护：在同一 SQLite 事务中读取模型/Provider、校验、upsert
   - Decimal 价格转 number，null 价按既有 schema 省略

2. **SystemConfig Service** (`packages/application/src/system-config.ts`)
   - 保留旧方法（向后兼容）
   - 新增 `getConfig()` / `getSystemConfigWithModel()` / `setDefaultModel()`
   - **统一有效性校验**：新旧 setter 都校验模型存在 + Provider active
   - 错误码：`invalid_model_selection` + `reason` (`not_found` | `inactive_provider`)

3. **HTTP API** (`apps/api/src/system-config.controller.ts`)
   - **新端点**：`GET/PUT /api/v1/system/config` - 完整信息 + 校验
   - **旧端点保持兼容**：`GET /config/default-model` 只返回 `{modelId}`
   - **旧 PUT 增加校验**：避免设置无效模型
   - 错误映射：404 (not_found) / 409 (invalid_model_selection) / 503

4. **DTO 和错误码**
   - `packages/contracts/src/system-config.ts` - 完整 DTO 定义
   - `packages/contracts/src/platform.ts` - 新增 `invalid_model_selection` 错误码
   - `packages/contracts/entry-surface.txt` - 更新导出清单

5. **JSON Parser 边界**
   - `apps/api/src/model-configuration-body-parser.ts`
   - 新 PUT 使用 `strict: false` 专属 parser
   - 让合法 JSON 原始值进入 Controller 统一校验

#### 测试文件

- `packages/storage-prisma/src/system-config.test.ts` - Repository 测试
- `packages/storage-prisma/src/system-config-model.test.ts` - 事务/并发测试
- `packages/application/src/system-config.test.ts` - Service 测试（16 tests）
- `packages/contracts/src/system-config.test.ts` - DTO 合同测试（14 tests）
- `apps/api/src/system-config.controller.test.ts` - Controller 测试（7 tests）
- `apps/api/src/system-config-api.test.ts` - HTTP 集成测试（9 tests，真实 SQLite）

#### 验证结果

- ✅ **相关自动化回归**：30 files / 194 tests passed (36.68s)
- ✅ **HTTP 集成测试**：9/9 passed (24.71s)
- ✅ **类型检查**：storage-prisma、application、contracts、apps/api 全部通过
- ✅ **curl 验收**：8 次隔离调用通过（GET、PUT、清除、404/409/503）
- ✅ **代码审查**：两轮，已修复 2 个阻断问题
- ✅ **git diff --check**：通过
- ❌ **Lint**：后端包未配置 lint 命令，未运行

#### 关键设计决策

1. **向后兼容**：保留旧端点 `/config/default-model`，只返回 `{modelId}`
2. **事务原子性**：校验和写入在同一事务中，避免 TOCTOU 竞态
3. **并发语义**：
   - 删除先提交 → 设置返回 `not_found`
   - 设置先提交 → 后续删除允许，GET 返回 `model: null`
4. **错误分级**：Service 统一 `invalid_model_selection`，HTTP 层根据 reason 映射 404/409

#### curl 示例

```bash
# 读取配置
curl http://localhost:3000/api/v1/system/config

# 设置默认模型
curl -X PUT http://localhost:3000/api/v1/system/config \
  -H "Content-Type: application/json" \
  -d '{"defaultModelId":"model-xxx"}'

# 清除默认模型
curl -X PUT http://localhost:3000/api/v1/system/config \
  -H "Content-Type: application/json" \
  -d '{"defaultModelId":null}'
```

---

### Phase 2: 前端 UI 实现 ✅

**负责人**：React 前端子代理 (01869e22)  
**时间**：2026-11-10 下午

#### 实施内容

**升级现有组件**（不创建平行页面）：

1. **默认模型设置**
   - 升级现有 `DefaultModelPanel` (`apps/web/src/components/cosmos/default-model-panel.tsx`)
   - 迁移到新端点 `GET/PUT /api/v1/system/config`
   - 显示完整模型详情：Provider、上下文窗口、输出上限、价格
   - 错误处理：404/409/503 显示正确提示并保留原值
   - 清除功能：确认对话框，取消/确认
   - 支持：新建模型设置 (`default-model-settings.ts`)
   - 支持：模型详情展示 (`model-details.tsx`)

2. **Transport Client**
   - 新增 `getSystemConfig()` / `updateSystemConfig()` (`packages/transport-http/src/client-system-config.ts`)
   - 使用共享 Zod schema 校验
   - 保留旧方法（向后兼容）

3. **Story 成本显示**
   - **生成前预估** (`story-panel/agent-candidates.tsx`)
     - 显示当前默认模型
     - 显示 USD 粗估成本范围
     - Token 假设：输入 1000-4000 / 输出 256-1024
     - 明确："非报价/非真实计费/未计正文与多模态"
   - **实际成本组件** (`story-panel/story-generation-cost.tsx`)
     - 支持可选 `AgentInvocationOutput.cost`
     - 显示输入/输出/总计（最多 8 位小数）
     - **未接通 Story 真实费用**（后端合同限制）

4. **连接列表清理**
   - 删除模型列/标签/选择 (`connection-panel.tsx`)
   - 删除 `modelId` 写入和目录读取
   - 隐藏 `cosmos.agent` 连接
   - 保留真实外部连接（Bilibili、RSS、IMAP）
   - 删除文件：`connection-model-selection.ts` 及其测试

5. **Lab 同步**
   - 更新 `model-fixtures.tsx`、`product-fixtures.tsx`
   - 注册 ModelDetails 定价已知/未知场景
   - 更新 `definitions-cosmos.tsx`

#### 测试文件

- `default-model-settings.test.ts` (8 tests) - 目录/分页/active 过滤
- `model-details.test.ts` (8 tests, 真实 SSR) - 价格/预算/版本
- `default-model-panel.test.ts` (1 test, 真实 SSR) - Loading 状态
- `story-generation-cost.test.ts` (19 tests) - 估算/价格/精度
- `connection-panel.test.ts` (4 tests) - 外部保序/legacy 过滤
- `client-system-config.test.ts` (10 tests) - Transport 客户端
- 其他更新：`model-fixtures.test.ts` (6)、`registry.test.ts` (13)

#### 验证结果

- ✅ **单元测试**：38 files / 243 tests passed
- ✅ **类型检查**：`bun run --cwd apps/web tsc --noEmit` - exit 0
- ✅ **Transport typecheck**：exit 0
- ✅ **git diff --check**：exit 0
- ✅ **改动文件 ESLint**：0 errors, 1 既有 warning
- ❌ **全量 Lint**：2 既有 errors / 20 warnings（未修复历史债务）
- ✅ **代码审查**：三轮，无重要或阻断问题

#### 隔离浏览器验证（内存拦截，无真实后端）

**测试环境**：`bun run --cwd apps/web dev -- --hostname 127.0.0.1 --port 3300`

1. **实际 `/settings` smoke** (1440px) ✅
   - 当前模型/Provider/预算/0 价格/version
   - 未知价格预览
   - 404/409/503 正确提示 + 保留原值
   - 新 PUT 保存
   - 清除取消/确认
   - 被删默认恢复
   - **6 次合成 PUT，22 次拦截请求**
   - 精确期望 3 条已知 HTTP 错误（404/409/503），无其他 console/page error

2. **Story Lab** ✅
   - 默认模型显示
   - USD 成本范围预估
   - 免责声明（未伪造实际费用）
   - 0 API 请求，0 console/page error

3. **连接 Lab** (768/1440) ✅
   - 无模型控件
   - 手填带空格 `cosmos.agent` → 本地拒绝 + 保留草稿
   - 改成 `bilibili` → 清除错误

4. **Automation** ✅
   - 三类外部连接保留
   - Legacy 隐藏
   - 状态 PATCH 无 `modelId`

#### 构建问题修复

**问题**：Node runtime 导入 `@cosmos/transport-http` 失败
- **原因**：`@cosmos/contracts` 的 `dist/` 未导出新 DTO（源码正常）
- **修复**：重建 contracts 包 (`bun run --cwd packages/contracts build`)
- **验证**：Node runtime import 通过

#### 已知限制

1. **Story 实际成本未接通**（受限范围）
   - `StoryAgentGeneration` / `candidate` 无 `cost` 字段
   - `completeStoryAgentProposal` 丢弃 `AgentInvocationOutput.cost`
   - 前端 UI 已预留，但不伪造数据
   - **后续**：需后端扩展合同，添加 `cost` 字段到 Story Agent 输出

2. **E2E 测试待更新**（范围外）
   - `e2e/component-lab/connection-panel.spec.ts`:139-216 - 删除 `scene=model` 断言
   - `e2e/component-lab/connection-panel.spec.ts`:72 - "新建连接" → "新建账号"
   - `e2e/component-lab/model-configuration.spec.ts`:110-127 - 删除连接计数
   - `e2e/component-lab/model-configuration.spec.ts`:185-188 - 修改默认模型保护
   - `e2e/browser/connection-visibility.spec.ts` - 同步按钮名称

---

### Phase 3: 集成与验证 ✅

**负责人**：主 Agent

#### 最终验证清单

- ✅ **后端测试**：30 files / 194 tests passed
- ✅ **前端测试**：38 files / 243 tests passed
- ✅ **总计**：68 files / 437 tests passed
- ✅ **类型检查**：所有相关包通过
- ✅ **git diff --check**：通过
- ✅ **代码审查**：后端 2 轮、前端 3 轮，所有阻断已修复
- ✅ **隔离浏览器验证**：设置、Story、连接全部通过
- ✅ **curl 验收**：8 次 API 调用通过

#### 未运行的验证

- ❌ 全仓测试 (`bunx vitest run`)
- ❌ 生产 Web 构建
- ❌ 正式全套 Playwright E2E
- ❌ 真实 Agent 外呼验收

#### 文件统计

- **修改文件**：29 个
- **新增文件**：12 个
- **删除文件**：2 个
- **总计**：43 个文件变更

---

### 后续工作（超出 Task 42 范围）

#### 1. Story 实际成本接通（优先级：高）

**后端需求**：
- 扩展 `StoryAgentGeneration` schema，添加 `cost` 字段
- 修改 `completeStoryAgentProposal`，保留并公开 `AgentInvocationOutput.cost`

**前端准备**：
- UI 组件已实现（`story-generation-cost.tsx`）
- 后端支持后可直接接入

#### 2. E2E 测试更新（优先级：中）

**需要测试工程师**：
- 更新连接相关断言（删除模型场景）
- 更新术语（"新建连接" → "新建账号"）
- 更新默认模型保护逻辑

#### 3. 文档更新（优先级：中）

**需要文档工程师**：
- `docs/spec/interfaces/0005-web-client.md` - 补充默认模型设置和成本预估
- `docs/spec/interfaces/0004-http-client.md` - 补充新 transport 方法
- `docs/spec/README.md` - 收敛"按连接选模型"为"默认模型配置"
- `docs/spec/interfaces/0002-product-api-http.md` - 补充新 API 端点

---

### 技术亮点

1. **向后兼容**：保留旧端点，不破坏现有 transport 客户端
2. **事务保护**：校验和写入在同一事务中，避免竞态条件
3. **错误分级**：Service 统一错误码，HTTP 层灵活映射
4. **隔离测试**：全 API 内存拦截，无真实后端依赖
5. **诚实记录**：保留失败历史（HMR hydration、初轮测试错误）
6. **受限范围**：Story 实际成本未伪造，等后端支持

---

### 经验教训

1. **构建产物同步**：修改 contracts 后需重建，避免 Node runtime 导入失败
2. **现有组件优先**：升级现有组件比创建平行页面更合理
3. **事务设计**：校验和写入必须在同一事务中，避免 TOCTOU
4. **受限范围明确**：不伪造数据，明确技术债和后续工作

---

## References

- [Task 41 实施记录](./../41-connection-agent-separation/README.md)
- [Proposal: Connection-Agent-Profile Separation](../../../docs/proposals/connection-agent-profile-separation-v1.md)
- [API 规范: Provider/Model Configuration](../../../docs/api/0009-provider-model-configuration.md)
- [Agent Invocation 规范](../../../docs/spec/application/0010-agent-invocation.md)
