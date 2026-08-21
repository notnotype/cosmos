# 仓库维护流程

本文件说明 Cosmos 的记录如何衔接。具体 Git、安全、Agent 协作和授权规则以根 [`AGENTS.md`](../../AGENTS.md) 为准；公开贡献要求见 [`CONTRIBUTING.md`](../../CONTRIBUTING.md) 与 [`CONTRIBUTING.en.md`](../../CONTRIBUTING.en.md)。

## 记录分工

- GitHub Issue：公开问题、需求、分流状态和实现授权。
- [`docs/proposals/`](../proposals/)：尚未生效且存在长期取舍的方案。
- [`docs/requirements/`](../requirements/)：用户原话、产品范围和验收意图。
- [`docs/architecture/`](../architecture/) 与 [`docs/adr/`](../adr/)：当前设计和稳定决定。
- [`.agents/tasks/`](../../.agents/tasks/)：一次实现的范围、过程、验证、偏差和交接。
- [`docs/spec/`](../spec/)：代码已实现、可观察且可重建的当前行为。
- [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md)：仓库现状、验证边界和跨任务下一步。

## 准入决策表

本表是 Proposal、公开 Issue、Task walkthrough 和 `PROJECT-STATUS.md` 是否必需的唯一决策表。其它入口只链接本表，不复制或改写矩阵。

| 改动类型 | Proposal | 公开 Issue | Task walkthrough | `PROJECT-STATUS.md` |
| --- | --- | --- | --- | --- |
| 拼写、断链或不改变含义的小型文档修正 | 不需要 | 可选 | 不需要 | 不需要 |
| 不改变用户行为、产品数据、公开接口、安装、发布或兼容承诺的纯机械仓库迁移 | 不需要 | 可选 | 需要 | 治理路径或仓库状态改变时更新 |
| 当前合同可判定的局部 Bug | 不需要 | 需要 | 通常复用相关 Task | 模块状态改变时更新 |
| 新增或改变用户可观察行为的小功能 | 接受后实施 | 需要且已接受 | 由维护者复用或创建 | 状态改变时更新 |
| 跨模块、进程或数据所有权，或改变持久化、公开接口、权限、安全、安装、发布、兼容承诺 | 接受后实施 | 需要且已接受 | 需要 | 需要 |
| 产品数据迁移、数据生命周期或正式发布 | 接受后实施 | 需要且已接受 | 复用相关 Task | 需要 |

按可观察影响和合同变化分类，不按修改文件数量分类。纯机械仓库迁移是窄例外；只要改变行为、产品数据或对外承诺，就进入对应的 Proposal 行。非公开的维护者或用户明确请求可以作为内部授权来源，但 Task 必须记录该请求；公开贡献仍按“公开 Issue”列执行。

## 开发生命周期

本节是 Cosmos 开发阶段、Agent Skill 路由和完成定义的唯一正文。其它入口只写触发摘要并链接本节；每项改动按可观察影响选择最短路径，不机械执行与风险无关的阶段或 Skill。

### 1. 分流

从用户请求或 Issue 判定改动类型、权威合同、记录要求和外部操作授权。非平凡工作在实施记录中明确：

- 预期的可观察结果；
- 需求、架构、ADR 或当前 spec 中的权威合同；
- 范围和不在范围内的边界；
- 仍会影响结果的不确定项。

能从代码、文档、配置或远端接口发现的信息先调查。权威合同与实现冲突时停止猜测，把冲突及后果记录到对应 Proposal 或 Task。

**完成条件**：改动分类、合同来源、记录目标和每项外部操作的决策权均已明确。

### 2. 定义

需求不明确时使用 `interview-me` 提取真实意图；粗略方向需要比较和收敛时使用 `idea-refine`。新增行为或长期取舍按[准入决策表](#准入决策表)完成 Proposal 与 specification；当前合同足以判定的局部 Bug 直接进入可失败的复现，不为它补写 Proposal。

需要 Proposal 时，用户原话仍先追加到原始需求；Proposal 接受后，才把目标写入 PRD、架构或 ADR 并创建或复用 Task。

**完成条件**：验收可测试，范围边界和未覆盖场景明确，需要人决定的取舍已由有权者决定。

### 3. 计划

重大实现使用现有 [`.agents/tasks/`](../../.agents/tasks/)，不创建通用 `tasks/plan.md`、`tasks/todo.md` 或并行 tracker。多个可独立验收的能力先在 Task 中写 capability map 和无环依赖顺序。每个实施切片记录：

- 所处生命周期阶段和一个连贯目标；
- 最多三条可观察验收；
- 前置依赖和受影响合同；
- 预计核心文件和验证层级。

一个切片只交付一个连贯行为。预计超过约五个核心实现文件或同时混合两个独立子系统时先拆分；机械迁移和 forward-only migration 可按同一原子合同成组。同一 Task 可以顺序追加多个小切片，不为每个切片创建新 Task。

**完成条件**：每个切片可独立验收，依赖无环，失败不会要求未定义的跨切片合同。

### 4. 上下文

使用 `context-engineering` 只加载当前状态、相关 spec、待改实现、行为测试和一个仓库既有模式。涉及第三方库或框架合同时，使用 `source-driven-development` 从项目版本和官方文档核对 API、默认值及弃用状态。修改导出符号前定位所有调用方；修改配置前核对 CI 和文档中的实际入口。

**完成条件**：所有待改符号、调用方、测试模式和外部合同均已定位，现有模式足以指导实现；冲突已回到定义阶段处理。

### 5. 增量实现

多文件变更使用 `incremental-implementation`。每个行为切片内执行：

```text
RED → GREEN → REFACTOR → runtime VERIFY
```

Bug 必须先以测试或实际运行场景复现失败；新行为必须先有能证明合同尚未满足的测试。GREEN 只写满足合同的最小实现；REFACTOR 删除已由测试保护的重复和无效复杂度；runtime VERIFY 运行该行为真实所在的进程、浏览器、CLI 或其它表面。纯文档或不改变行为的配置改动可以没有 RED，但必须运行对应静态门禁和实际命令。

专业 Skill 按风险插入当前切片：

- UI 使用 `frontend-ui-engineering`，并在实际浏览器表面验证；
- 公共 API、DTO 或模块边界使用 `api-and-interface-design`；
- 权限、Secret、路径和不可信输入使用 `security-and-hardening`；
- 有明确性能目标或回归时使用 `performance-optimization`；
- 生产路径的 logging、metrics 或 tracing 与实现同步使用 `observability-and-instrumentation`；
- 陌生或高风险的持久化、并发、权限和不可逆决定使用 `doubt-driven-development`。

**完成条件**：切片的可观察验收全部通过，行为测试由红转绿，实际运行表面已验证或有明确且与风险相称的未运行理由。

### 6. 审查

行为完成后使用 `code-review-and-quality`，先读测试再读实现，按以下五轴检查：正确性、简单性、架构、安全和性能。只有确有可删除复杂度时才使用 `code-simplification`；审查不授权扩大实现范围。

finding 使用 `Critical`、`Required`、`Optional` 或 `Nit` 标级。`Critical` 和 `Required` 未解决时不得进入交付阶段；范围外问题记录到有权威归属的位置，不以兼容层或 TODO 掩盖。

**完成条件**：五轴均有结论，所有阻断 finding 已解决，并对测试是否真正覆盖声称的合同作出核验。

### 7. 交付

按风险执行 [`docs/testing/`](../testing/) 定义的聚焦、全量、运行表面和外部验收；每一层只证明自身合同。行为落地后同步 `docs/spec/`；稳定且反转成本高的决定进入 ADR。Task 和 `PROJECT-STATUS.md` 按[准入决策表](#准入决策表)记录实际命令、结果、偏差、未运行项和下一步。

原子提交、PR、CI 与合并使用 `git-workflow-and-versioning`；迁移或弃用使用 `deprecation-and-migration`；已合并且已验证的发布或部署作为独立工作使用 `shipping-and-launch`。commit、push、创建 PR、合并、关闭 Issue、清理 worktree、发布和部署仍分别需要授权，阶段晋级不构成这些授权。

**完成条件**：满足下方唯一完成定义；记录与代码事实一致，所有未执行的外部操作保持未执行状态。

## 最短 Skill 链

| 改动类型 | 必需链路 | 按风险插入 |
| --- | --- | --- |
| 小型且无行为变化的文档 | `context-engineering → documentation-and-adrs → git-workflow-and-versioning` | 文档门禁与链接检查 |
| 当前合同可判定的局部 Bug | `debugging-and-error-recovery → test-driven-development → code-review-and-quality → git-workflow-and-versioning` | 对应运行表面和风险 Skill；不要求 Proposal |
| 新增或改变可观察行为 | `spec-driven-development → planning-and-task-breakdown → context-engineering → incremental-implementation + test-driven-development → code-review-and-quality/code-simplification → documentation-and-adrs + git-workflow-and-versioning` | API、安全、性能、可观测性或高风险复核 |
| 公共 API 或 DTO | 新行为链 | `api-and-interface-design` |
| 权限、Secret、路径或不可信输入 | 对应文档、Bug 或新行为链 | `security-and-hardening` |
| 数据迁移或弃用 | 对应新行为链 | `deprecation-and-migration` |
| UI | 对应 Bug 或新行为链 | `frontend-ui-engineering` 与实际浏览器验证 |
| 发布或部署 | 已合并、已验证变更后的独立链路 | `shipping-and-launch` |

表中 Skill 在运行环境提供时先读取其规则；环境没有对应 Skill 时仍执行同名阶段的仓库合同，不以工具缺失降低验收要求。

## Definition of Done

本节是仓库唯一完成定义。Task、PR 模板和其它入口只链接本节，不复制检查表。以下条件必须同时满足：

- 本切片的全部可观察验收通过；
- 行为变化有回归测试，Bug 有先红后绿证据；
- 风险对应的实际运行表面已验证，或记录未运行原因及剩余风险；
- 所有 `Critical` 和 `Required` review finding 已解决；
- 代码、公共合同和 `docs/spec/` 对同一当前行为描述一致；
- Task 与 PR 记录完整命令、实际结果、偏差和未验证边界；
- 范围内文件与暂存区可审查，不包含 Secret、用户数据或意外生成物；
- commit、push、创建 PR、合并、关闭 Issue、清理 worktree、发布和部署均只在分别授权后执行。

## 远端门禁事实

仓库内 `.github/workflows/` 定义 CI 执行内容；GitHub branch protection 或 ruleset 决定这些检查是否能在远端阻止直接 push 或合并。两者是不同事实。

远端保护状态只有通过 GitHub API 或仓库设置页核验后才能标为“已验证”；本地搜索只能说明仓库内没有记录。仓库内 CI 已知失败必须先修复，但不能据此声称远端已强制检查。具体核验日期、结果和未修改边界写入 `PROJECT-STATUS.md` 与当前 Task，不在本稳定标准缓存动态状态。

每项含义只在一个权威来源维护；其它文档写触发摘要和链接，不复制正文。
