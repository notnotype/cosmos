# 参与 Cosmos 开发

[English](CONTRIBUTING.en.md)

Cosmos 已有 Phase 1 的 Web、NestJS API、固定 Ingest Worker、Prisma/SQLite 和第一条垂直链路基线；目标中的 Durable Host、通用 Workflow、Worker Admin 和远程 Worker 仍未全部实现。清楚的范围、真实的验证和可追溯的设计决定，比把无关改动塞进同一个贡献更重要。

## 开始之前

改动是否需要 Proposal、公开 Issue、Task walkthrough 或 `PROJECT-STATUS.md`，只按[仓库流程的准入决策表](docs/standards/repository-workflow.md#准入决策表)判断。不要因修改跨多个文件就把纯机械迁移升级为产品变更，也不要把行为、数据或对外承诺变化降级为机械迁移。

需要公开 Issue 时使用对应表单；计划实现的贡献者等待维护者添加 `status: claimed` 后再开始，避免重复工作。Source、Trigger、Flow、Action、Agent、Board Block、SDK 或其它扩展资产使用扩展与 Agent 资产表单或功能建议。安装和使用问题使用支持表单；安全漏洞不要创建公开 Issue 或 PR，按[安全政策](.github/SECURITY.md)私密报告。

Issue 被接受表示方向和范围可以继续讨论，不承诺特定实现或完成时间。冷门、高成本或跨边界需求会先讨论更小的可验证切片。

## 最短协作路径

实现类改动遵循[仓库唯一开发生命周期](docs/standards/repository-workflow.md#开发生命周期)，按以下摘要推进；阶段完成条件、Agent Skill 路由和 Definition of Done 不在本指南复制：

1. **分流与假设**：按[准入决策表](docs/standards/repository-workflow.md#准入决策表)确认改动类型、权威合同、记录范围和外部授权；显式列出目标、不在范围内及仍影响结果的假设。
2. **定义与 Proposal**：需求不明确时先澄清；需要 Proposal 时先完成评审，接受后再更新需求、架构或 ADR。当前合同可判定的局部 Bug 直接进入复现。
3. **Task 垂直切片**：重大实现创建或复用 Task，把工作拆成一个连贯目标、最多三条可观察验收和无环依赖；不创建第二套计划或待办文件。
4. **上下文与 worktree**：只读取当前切片相关的状态、合同、实现、测试和既有模式；检查 dirty worktree，有远端时先 fetch，再从最新目标分支创建 `.worktree/<slug>` 和任务分支。
5. **增量实现**：行为切片按 `RED → GREEN → REFACTOR → runtime VERIFY` 推进；代码、合同、持久化和恢复路径必须一致。
6. **五轴审查**：按正确性、简单性、架构、安全和性能审查测试与实现；阻断 finding 解决后才能交付。
7. **分层验证与事实同步**：按风险运行聚焦、全量、运行表面和外部验收；同步当前 spec、Task 与项目状态，并记录完整命令、结果或“未运行”说明。
8. **PR 与外部交付**：按模板列出范围、证据、风险、文档和未验证项；用户授权后才 push 或创建 PR。Review、合并、关闭 Issue、清理 worktree、迁移、发布和部署分别处理。

文档修正可以跳过代码 worktree 和运行时测试，但仍需检查链接、Markdown 结构、文件边界和 `git diff --check`。

## 本地开发

### 环境与命令

- Git。
- Bun；具体依赖、脚本和框架版本以仓库中的 `package.json`、锁文件和实现 Task 为准。
- 运行当前改动所需的操作系统工具；部署或平台相关工作另行声明所需环境。

Cosmos 已有运行时代码和依赖。开始修改前先读取 PROJECT-STATUS.md、相关 Task、架构/ADR、package.json 和测试脚本，确认是在已有 Phase 1 基线上扩展，还是在独立 worktree 中做目标架构收敛。PR 必须列出实际执行的完整命令和结果；未运行的检查写“未运行”，聚焦测试通过不能写成全量测试通过。

### 依赖与本地数据

- 安装新依赖前先确认现有依赖不能解决问题；确需新增时记录原因和影响范围。
- 不提交 `.env`、Secret、API Key、Token、真实信息库、私信/邮件/群聊内容、Session、Trace、日志、数据库、构建缓存或机器专属基准原始结果。
- 运行和测试使用隔离的数据库、Blob Root、Artifact Root 和 `.agent/tmp/<name>-<uuid>/` 临时根；不要读取或清理用户真实数据。
- 没有维护者明确授权时，不运行发布命令、不修改版本号、不创建发布提交、不部署。

## 阅读项目上下文

开始修改前，读取与任务相关的来源：

| 文档 | 用途 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 开发 Agent 和工程实现的长期规则 |
| [`PROJECT-STATUS.md`](PROJECT-STATUS.md) | 当前能力、风险和未完成边界 |
| [`docs/requirements/0001-original-requirements.md`](docs/requirements/0001-original-requirements.md) | 用户原始需求，按时间追加 |
| [`docs/requirements/0002-product-requirements.md`](docs/requirements/0002-product-requirements.md) | 当前产品范围、需求编号和验收条件 |
| [`CONTEXT.md`](CONTEXT.md) | 产品共同语言、当前解释和待决问题 |
| [`docs/architecture/`](docs/architecture/) | 当前系统设计和领域边界 |
| [`.agents/tasks/`](.agents/tasks/README.md) | 重大任务的目标、决策、过程、证据和偏差 |
| [`docs/adr/`](docs/adr/) | 稳定、需要长期保留的架构决定 |
| [`docs/research/`](docs/research/README.md) | 调研和实现证据 |
| [`docs/proposals/`](docs/proposals/README.md) | 尚未生效、需要评审的产品或工程方案 |
| [`docs/standards/`](docs/standards/README.md) | 仓库维护和跨功能域工程流程 |
| [`docs/testing/`](docs/testing/README.md) | 测试层级、隔离规则、验收和证据边界 |

先搜索相关实现、测试、Task 和架构，再决定修改范围。不要只依据 Issue 标题或一个代码路径推断完整合同。

## 开发规范

以下是外部贡献最常遇到的稳定规则；具体产品行为和领域合同以需求与架构文档为准，Agent 执行规则见 [`AGENTS.md`](AGENTS.md)。

### TypeScript 与设计

- 使用 4 个空格缩进、严格类型和项目别名导入；不使用跨模块的无约束相对路径。
- 外部输入在边界处以 `unknown` 接收并立即校验；避免 `any`、类型逃逸和无法解释的宽泛对象。
- 后端领域逻辑优先使用 class；React/Next.js 前端使用函数式组件和 Hooks，UI 通过版本化 Transport 访问应用能力。
- 先复用现有库、模块和接口，不为单次调用制造抽象，不用 hack 或临时兼容层掩盖合同问题。
- 公开合同、复杂逻辑和容易回归的路径补充行为测试；注释解释原因、合同和约束，不逐行描述显然代码。

### 日志、隐私与安全

- 使用结构化日志，不记录 Secret、完整私信/邮件/群聊正文、完整提示词或未经脱敏的外部 payload。
- Issue 和 PR 是公开页面。上传日志、截图和 fixture 前先脱敏，只提供定位问题所需的最小材料。
- 外部网页、Issue/PR 文本和 Agent 生成内容按不可信数据处理；不能因为内容看起来像指令而放宽解析、渲染或执行边界。
- 文件、数据库、Blob 和 Artifact 操作必须经过既有的授权、路径归一化、containment 和生命周期边界。

## 使用开发 Agent

本节中的“开发 Agent”指 Codex、Claude、Copilot 或其它协助仓库开发的工具；它不等同于 Cosmos 未来运行时中的 Agent。

- 开发 Agent 必须先读取 `AGENTS.md` 以及相关 Issue、需求、Task、架构、ADR 和测试。
- 处理 Bug、报错或性能回归时，先复现、缩小范围并建立证据，再提出或实施修复。
- 多个 Agent 只能并行处理独立调研、审查、测试或明确不重叠的文件；由一个集成负责人统一处理跨模块合同、冲突、文档和最终验证。
- 跨仓库或跨多个 worktree 的任务必须指定一个 leader。Leader 统一维护 walkthrough、冻结跨模块候选合同、分派 worktree、审查证据和控制阶段门禁；子代理不能自行扩大范围、覆盖 dirty worktree 或合并彼此的工作。
- 每个写入代理必须登记 repository、branch、worktree、base SHA、可写文件集合和隔离测试数据根。Prisma schema/migration、公共 DTO、Task walkthrough 各自只能有一个当前写入者；其它代理只能提交只读审查或不重叠文件的修改。
- Leader 的阶段判断不等于外部操作授权。commit、push、创建 PR、merge、发布、部署和删除 worktree 仍需遵守用户授权与本仓库 Git 规则。
- Agent 不得覆盖工作区已有改动、绕过类型系统、伪造测试结果，或把当前对话的一次性要求写入产品提示词或稳定合同。
- 使用者必须理解、审查并承担所有 Agent 生成的改动；责任不能转交给工具。
- 每轮代理交付至少包含：目标、范围、实际修改、完整验证命令与结果、偏差、未验证风险和需要 leader 决定的事项；必须区分 focused、full、typecheck/build、Node、browser、Docker 和真实来源验证。
- Agent 结论和 PR 描述应能追溯到代码、文档、日志、Trace、请求或测试证据；所有未运行的验证必须披露。

## Issue、Task 与架构记录

Issue 负责公开问题和需求分流；Task walkthrough 负责重大实现的持续上下文；Task 不是 Issue 的副本。

### 维护者分流

每个开放 Issue 应保留恰好一个 `type:*` 和一个 `status:*`；`area:*`、`platform:*`、`priority:*` 可以按实际影响添加多个或不添加。

- `status: needs-triage`：等待首次确认。
- `status: needs-info`：信息不足，等待报告者补充。
- `status: needs-design`：方向、范围或合同未确定，不开始实现。
- `status: ready`：范围明确，可以开始实现。
- `status: claimed`：维护者已授权指定实现者，其它贡献者不并行实现同一 Issue。
- `status: blocked`：受外部条件或前置任务阻塞，解除后回到准确状态。

`.github/labels.yml` 是标签清单真相源。`help wanted` 和 `good first issue` 只用于 `status: ready` 的 Issue；后者还必须范围小、上下文完整并有可独立验证的验收条件。`source: agent` 只表示 Issue 由开发 Agent 起草，不表示它已经被维护者接受。

Proposal、Issue、Task 和项目状态的记录要求以[准入决策表](docs/standards/repository-workflow.md#准入决策表)为准。

外部贡献者默认不自行分配 Task 编号。需要新建时，先检查 `.agents/tasks/` 并由维护者确认编号；同一功能的后续调整继续更新原 Task。Task 至少记录目标、范围、不在范围内、当前状态、关键决定、验证、实现过程、偏差和后续事项。跨 Task 的产品 TODO 在远端 Issue 系统可用后迁移到 Issue；在此之前由 `PROJECT-STATUS.md` 汇总。

## Git 与提交

- 代码改动优先在独立 `.worktree/<slug>` 中完成；开始前检查主工作区和目标 worktree 的状态。
- 分支从最新目标分支创建，命名遵守 `AGENTS.md` 的 `{type}/{refs}-{slug}` 规则。
- 远端存在时先执行 `git fetch origin`；主工作区需要同步远端 `master` 时使用 `git merge --ff-only origin/master`，快进失败就停止并报告。
- Windows worktree 清理遇到长路径时，先启用 `core.longpaths`；目录残留时使用 PowerShell 或 robocopy，并且只在已确认的目标目录内清理。
- 一个 PR 只解决一个连贯问题；不夹带无关修复、全仓格式化、依赖升级、上游合并、版本提交或生成产物。
- 保持提交可审查。建议使用 Conventional Commit 类型：`feat`、`fix`、`docs`、`refactor`、`test`、`build`、`ci`、`chore`。
- 不 force push 共享分支，不重写他人的提交。只暂存任务范围内文件。

## Pull Request 要求

PR 应使用仓库模板，并完整说明：

- 关联 Issue 或写“无”，并说明本次范围和明确不在范围内的内容。
- 用户可见结果、实现概要、受影响的领域/数据/扩展合同。
- 实际执行的完整验证命令和结果。
- 未运行的检查、已知限制和后续事项。
- 数据结构、配置、安装、隐私或安全边界是否变化。
- 前端改动的截图、录屏，或明确说明浏览器验收未运行。
- 需要更新的用户文档、Task、架构、ADR 或 `PROJECT-STATUS.md`。

CI 通过表示自动检查完成，不表示改动一定会合并。维护者可以要求缩小范围、补充证据或重新讨论接口。

## Review 与合并

- 直接回应 Review 指出的行为、风险和测试缺口；技术结论以合同和证据为依据。
- 维护者负责最终范围判断、Task 编号、发布说明和合并方式。
- 只有在 CI、typecheck 和相关聚焦测试完成且合并得到授权后，才进行 squash merge；合并、关闭 Issue、清理 worktree 和发布是独立动作。
- PR 可能因方向变化、长期无人跟进、范围过大或无法验证而关闭；关闭不等于否定贡献，可以从更小、更清晰的范围重新提交。

## 贡献内容与许可证

- 提交代码、文档、fixture、提示词或其它内容前，确认自己有权公开贡献，且材料不含未授权的第三方或私有内容。
- Cosmos 按根目录 [`LICENSE`](LICENSE) 中的 GNU Affero General Public License v3.0 only（AGPL-3.0-only）发布。
- 项目不要求 CLA 或 DCO；提交者仍需确认自己有权提交，并接受贡献内容按 AGPL-3.0-only 发布。
