# 文档治理工件与检查合同

本目录存放文档治理的长期工件；本文维护文档静态检查的唯一当前合同。文档更新与代理分工遵循[日常文档更新与代理协作](../standards/repository-workflow.md#日常文档更新与代理协作)，具体实施过程与验证结果留在[治理 Task](../../.agents/tasks/governance/README.md)，不在此缓存运行状态。

## 长期工件与大小治理

- 扫描报告按日期留存，作为当次证据快照，例如[全仓扫描报告](scan-2026-09-10.md)。
- [文档基线](docs-baseline.json)登记存量超标文档；[代码基线](code-baseline.json)用于独立的代码大小检查。
- [大小豁免清单](../../.docs-size-exemptions.yml)位于仓库根目录，记录路径、理由、负责人、复审日期与大小上限。

大小治理依据[超大文档预防与拆分规范](../proposals/oversized-doc-splitting-v1.md)，由[大小扫描工具](../../scripts/size-governance.py)按类别扫描并执行 CI 门禁。基线登记值与条目只减不增是治理目标；基线内文件增长只报 warning，不阻塞 CI；未登记文件进入警戒区或红线才阻塞。基线与豁免不是本页文档检查的替代品。

## 文档检查当前合同

### 命令、快照与比较基线

在实际修改的 worktree 内执行，避免使用主工作区的旧文件得到假通过。命令定义见[根脚本入口](../../package.json)。

| 命令 | 读取内容与比较范围 |
| --- | --- |
| `bun run docs:check` | workspace 模式：读取当前工作树，比较 HEAD，包含未被忽略的 untracked 文件。 |
| `bun run docs:check:staged` | staged 模式：比较 HEAD 与完整 Git index；链接来源、目标、分册元数据及新增文件空白全部读 index，不回退到工作树。 |
| `bun run docs:check:ci` | CI 模式：读取 HEAD 树，与事件基线比较；不使用未提交的工作树修补。 |
| `bun run docs:check --all` | 在所选快照中将锚点范围扩大为全部活跃来源；不把历史分册元数据或既有文件空白改成全量追溯检查。 |
| `bun run docs:check:ci --base <commit>` | 显式指定可访问的比较提交，可用于 CI 事件信息不可用时；`--base` 也可配合 workspace 或 staged 模式。 |

CI 对 PR 使用事件的 base SHA，对 push 使用 before SHA，覆盖该事件的多次提交，不只检查末次提交。首次 push（before 全零）和手动触发明确回退为空树对比整个 HEAD；这与仅扩大锚点的 `--all` 不同，此时整个 HEAD 都按新增/变更范围处理。事件基线缺失或指定提交不可访问时失败，不静默缩成末次提交或零变更；可获取所需历史或显式提供有效 `--base`。

[CI 配置](../../.github/workflows/ci.yml)使用独立 docs job，以完整历史 checkout（`fetch-depth: 0`）运行 CI 命令及大小门禁，无需 `bun install`。Quality、Node E2E、浏览器和 Windows smoke 保持各自证据边界；静态通过不代表这些层已运行。

### 各检查的范围

“活跃来源”指仓库根目录的 Markdown、[文档区](../)、[Agent 治理区](../../.agents/README.md)、[本地入口](../../.local/README.md)与 GitHub 治理区中的 Markdown；文档区排除原始需求和 research 历史。具体选取边界由[快照与范围模块](../../scripts/documentation-check/scope.ts)维护，不能将此排除规则套用到新增 Markdown 的空白检查。

| 检查 | 默认范围与职责 |
| --- | --- |
| 路径与根治理 | 每次对当前快照的全部活跃来源检查相对目标文件或目录；检查必要入口、根导航、退休路径及 canonical workflow 的私密安全报告/普通非安全 Bug 公开 Issue 路由。拒绝断链、反斜杠、仓库越界和 Windows 盘符绝对路径。 |
| Markdown 锚点 | 检查变更的活跃 Markdown 来源，以及指向变更 Markdown 目标的全部活跃入链来源；目标标题改名后，未变的引用方也会进入检查。校验这些来源的 Markdown 目标片段，包括纯片段链接；`--all` 扩为全部活跃来源。 |
| 分册元数据 | 只检查新增或变更的活跃候选分册，不追溯未变历史分册，也不要求普通文档补分册字段。 |
| 新增 Markdown 空白 | 检查所有目录内的新增 `.md`，包括 research 与 packages；要求 EOF 换行、无多余尾部空行、无违规尾随空白。正文恰好双空格的硬换行可用；既有文件不追溯空白债务。 |

### 分册与人工审核责任

候选分册须有非空 `range`、有效日期或活动标记 `sealed_at: —`、非空 `tags`、正数 `tokens` 或 `tokens_est`，以及指向实际主文档的 `parent`；同时提供两个 token 字段时数值须一致。`parent` 兼容仓库相对路径和分册相对路径。候选识别结合当前字段、主文档与目录/索引关系及比较基线中的元数据；删除已有候选的整段元数据不能逃逸检查。识别与校验细节见[分册元数据模块](../../scripts/documentation-check/metadata.ts)，不要依赖猜测命名来规避声明；非标准命名或目录的分册须在主文档明确的“分册”索引中声明，普通相关链接不能替代该索引。

封口分册只读、勘误写主文档或同级勘误文件仍是人工审核规则；当前工具不强制封口后不可编辑，也不自动生成或核准完整索引。修改文档仍须人工核对 Markdown 结构、H1、围栏和链接语义，并执行 `git diff --check`；新增文件空白门禁不能代替既有文件 diff 审查。

### 报告与未覆盖边界

报告列出 mode、baseline 与选取理由、snapshot、变更/新增文件、锚点来源、元数据/空白实际检查范围及未覆盖项。`checkedFiles` 是快照文件数，不表示这些文件都接受了全部检查；零变更也不等于完成全仓审计。

路径解析忽略 query，Markdown fragment 由锚点检查负责；源码 `#L` 行号片段只检查目标路径，不核验行号。外部 URL 可达性、完整 CommonMark/HTML 渲染、产品行为和架构真实性均不在本门禁覆盖内。静态检查不执行应用代码，不能替代类型检查、行为测试、构建、运行时验收或人工核实当前架构。

### 实现与测试入口

[文档检查入口](../../scripts/check-documentation.ts)协调快照、治理、锚点、元数据和空白检查；旧 `checkDocumentation(repoRoot, paths)` 保留 path-only API，增量合同由 `runDocumentationCheck` 与 CLI 承担。路径/根治理见[治理模块](../../scripts/documentation-check/governance.ts)，锚点见[锚点模块](../../scripts/documentation-check/anchors.ts)，新增空白见[空白模块](../../scripts/documentation-check/whitespace.ts)，基线与变更见[Git 模块](../../scripts/documentation-check/git.ts)，报告字段见[报告模块](../../scripts/documentation-check/report.ts)。

行为依据分别在[原路径合同测试](../../scripts/check-documentation.test.ts)、[增量检查测试](../../scripts/documentation-check/documentation-check.test.ts)和[快照与 CLI 测试](../../scripts/documentation-check/snapshots.test.ts)维护。测试存在不等于本次已执行，具体命令、结果、未运行项与限制只由对应 Task 记录。
