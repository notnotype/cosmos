# G19 P3 治理过程记录

## 2026-11-02：范围批准与计划登记

### 用户请求与当前切片

Otirik 接受前一轮提出的 P3 建议，作为正式内容：P3-1 更新触发与代理协作规则、P3-2 长期文档检查、P3-3 已知证据修复及真实任务演练。本轮处于定义/计划阶段，只记录获批范围和验收，不实施规则、检查脚本或证据修订，不执行 Git 提交。

当前切片目标：为后续实现提供唯一范围记录。验收限三项：正式范围覆盖上述三项；责任与依赖明确；不把范围批准写为实施或运行验收完成。

工作记录位置：`D:/Otirik/Workstation/cosmos/.worktrees/docs-governance`，分支 `docs/no-ref-document-governance`，基线 `d1141ba25f9d663154c919bddbce773beaeee810`，登记前工作树 clean。本轮主代理唯一可写集合为本任务 README、walkthrough 和治理索引；不派代码写入代理，不使用产品数据，隔离测试数据根不适用。沿用已有 worktree 仅登记计划；后续实现的分支/worktree 安排和代理文件集合在派发前核实，不从本次范围批准推导新建或 checkout 授权。

G18 已最终验收并完成提交，范围是五份文档大小治理；不复用已完成的 G18 承接新的日常治理机制。按治理章程顺延登记 G19，编号待维护者确认；该待确认不改变用户已批准的 P3 范围。

### 已核实的依据

- `docs/README.md:42` 已规定代码代理只提带证据的文档建议，由 Leader 审核后另派文档代理；根 `AGENTS.md:47-59` 尚未明确该限制，P3-1 应补入口并复用流程正文。
- `.agents/tasks/AGENTS.md:8-10` 要求 README 保留摘要，walkthrough 为唯一 append-only 过程记录，通用计划技能服从 Task 体系；因此不另建 Superpowers 计划或第二 tracker。
- `docs/standards/repository-workflow.md:135` 允许环境没有对应 Skill 时执行仓库最小合同；本轮使用 writing-plans 整理范围与任务顺序，尚未进行检查器具体代码设计。
- G18 过程记录保存了内容守恒、一次性标题检查、既存 UI 行号失效及暂存区新增文件空白遗漏的发现和修复证据。P3 复用问题定义，不把本机一次性脚本当成已交付的长期门禁。

### 实施顺序与交接

1. P3-1 先由主代理定位各入口和唯一规则正文，文档代理形成最小改动。规则包含更新触发、无需更新结论、建议格式、审核结果及修改分派。建议格式必须说明目标路径/章节、发现的偏差、代码或测试依据、拟改内容、当前/目标/未验证性质及验证要求。主代理审查入口一致性，Otirik 最终审核。
2. P3-2 由实现代理先调查现有检查器、测试和 CI 范围，再提交具体文件写入集合和独立验收切片。至少覆盖有效/无效标题锚点、受治理新分册缺失元数据、新增暂存文件 EOF 空白；失败样例必须实际失败，修复后通过。中文、重复标题、围栏内伪标题、纯片段链接及有意指向源码行号的链接需明确判定规则，不能混为一类。代码代理只提规则文档建议，由主代理另派文档代理更新。检查器不判断架构真实性。
3. P3-3 先核实历史证据，按封口规则决定主文勘误或替代材料；不可覆盖原取证性质。实际演练安排在 P3-1/P3-2 可用后，选取真实开发任务，不为演练新增产品功能。真实任务未选定是后续依赖，不将其写作已完成或当前故障。

P3 的正式范围和最多三条切片验收维护在本任务 README；本过程不复制完整矩阵。以后切片须先追加实际生命周期阶段、目标、依赖、核心文件、最多三项验收和验证层级，再派发。

### 本轮验证边界

仅变更计划记录和治理索引；运行文档链接、大小、Markdown 结构/围栏/尾随空白及新文件差异检查后追加实际结果。不运行应用测试、构建、浏览器、真实来源或 Agent 调用；不将本轮静态验证视为 P3 检查能力已经实现。

本轮实际结果（均在上述 worktree）：`bun run docs:check` exit 0，checkedFiles=1242、failures=[]；`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` exit 0，422 文档、3 条基线、1 条豁免，PASS，无 warning；通过 Python 标准库逐一读取治理索引及两份 G19 Markdown，检查 H1、围栏配对、尾随空白及 EOF，3 文件 PASS。随后执行 `git diff --check` 检查已跟踪索引差异；新建文件不依赖该命令覆盖。未执行提交或 P3 实施。

## 2026-11-02：P3-1 实施派发

### 生命周期、范围和验收

用户明确要求“开始实施 P3-1”。本轮进入增量实施及文档一致性审查，沿用已授权治理 worktree，不创建或切换分支。代码基线仍为 `d1141ba25f9d663154c919bddbce773beaeee810`；派发前差异仅为本任务 README、walkthrough 与治理索引的计划登记。

本切片只接入更新触发和代理协作规则。可观察验收沿用 README 的三条：Agent 入口明确代码代理不得直接改文档；完整流程只有一份正文且建议包含路径、偏差、依据、建议与验证要求；每项实现交付都有需更新或无需更新及理由。规则须保留当前/目标/未验证边界，不记录代码可直接查明的实现细节。P3-2 检查工具、P3-3 证据修复和真实任务演练均不在本轮范围。

### 写入登记及审核安排

仓库为 `D:/Otirik/Workstation/cosmos`；工作目录为 `D:/Otirik/Workstation/cosmos/.worktrees/docs-governance`；分支为 `docs/no-ref-document-governance`；所有代理共享上述 base SHA。此切片为纯文档，无产品测试数据，隔离测试数据根不适用。

- 主代理唯一写入本任务 README、walkthrough 与治理索引，负责接受建议、登记范围、汇总验证；不会与文档代理并写同一文件。
- 文档实施代理 `d4fa6921-2cb8-48a6-b8dd-6b8f776bf517` 只写根 `AGENTS.md`、`docs/standards/repository-workflow.md`、`docs/README.md`、`.agents/tasks/AGENTS.md`。唯一流程正文放在仓库维护流程，其他入口仅摘要和链接；不得修改检查脚本或业务代码。
- 实施完成后依次安排独立只读的范围审查和质量审查；阻断问题返还原文档代理修复。Otirik 保留最终审核权，Notype 为顾问。

先执行文档代理修改，再审查入口与正文的一致性，最后在本 worktree 运行链接、大小、Markdown 结构/围栏/空白及差异检查。检查现有文档，不交付 P3-2 的长期检查能力；不运行应用测试、构建、浏览器或真实外部调用，不自行 commit、push、PR、merge、部署或清理。

### 文档影响与建议审核

本切片文档影响结论为**需更新**：已批准的协作职责必须接入实际执行入口，才能在后续实现交付时被读取和审核。基线中 `docs/README.md:42` 只有代理分工摘要，根 `AGENTS.md:47-59` 和 `.agents/tasks/AGENTS.md` 尚无对应文档影响交付要求；`docs/standards/repository-workflow.md:38,175` 要求流程含义只有一个正文。上述为本轮文件静态核对，不是产品运行证据。

主代理接受四个登记文件的最小修改建议：在维护流程新增唯一正文，其他三个入口补摘要和相对链接；在生命周期交付和唯一完成定义中链接该流程。拟写内容是已批准的当前协作规则，不声称新增业务能力或验证工具。建议须保留原有需求、封口和授权边界，未知依据标待确认；验证要求为独立规则审查及本 worktree 的文档静态检查。G19 README 原触发清单同步改为链接正文，职责项只保留本任务责任分工。

### 实施交付及首轮检查

文档实施代理 `d4fa6921-2cb8-48a6-b8dd-6b8f776bf517` 已完成四文件修改并停止写入。流程正文位于 `docs/standards/repository-workflow.md:119-153`，交付阶段及唯一完成定义通过链接接入；根和 Task Agent 规则及文档入口只保留摘要与链接。正文明确文档库范围、主代理唯一维护 Task walkthrough、五类评估触发、建议字段、三种审核结论、接受后另派文档代理、封口及引用保护、实际 worktree 验证与必要更新未落实不得完成。本轮文档影响结论仍为“需更新”，接受范围已落实，不涉及业务实现或长期检查器。

主代理复核实际 diff，并派只读范围审查代理 `1d4dac88-19fa-4767-8a98-ead660a3f702`；范围审查完成后再派独立质量审查。此处仅记录实施与首轮静态检查，不代替审查结论或 Otirik 最终验收。

在本 worktree 实际运行：`bun run docs:check` exit 0，checkedFiles=1242、failures=[]；`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` exit 0，扫描 422 文档、3 条基线、1 条豁免，PASS，无 warning；`python .agent/tmp/p3-1-review.py` exit 0，覆盖 7 份新建或修改 Markdown、18 个标题片段链接，failures=[]。该忽略目录中的脚本只辅助本次结构、围栏、路径、标题片段及空白/EOF 审查，包含新文件；不是 P3-2 的长期门禁。未运行应用测试、类型检查、构建、浏览器、真实来源或 Agent 调用，因为本切片只有规则文档修改；静态检查不证明架构真实性或真实任务流程已经演练。最终记录修改后再执行文档检查和 `git diff --check`。

### 独立范围审查

只读代理 `1d4dac88-19fa-4767-8a98-ead660a3f702` 核对实际 diff、Agent 规则、流程正文和 G19 范围后给出 PASS，无 Required 或 Optional。三项验收分别由根 `AGENTS.md:49-50`、Task Agent 规则及文档入口，维护流程 `119-153` 的唯一正文，维护流程 `123` 的影响结论与 `113,200` 的交付/完成定义接入证明；七份批准文档之外没有实现改动。结论只覆盖规格与范围，不代替文档质量审查或 Otirik 最终验收。随后派独立只读质量审查代理 `1c44191f-c72c-4562-aae2-cb093f23e741`，不与实施代理并行写入。

### 质量审查与交付结论

质量审查代理 `1c44191f-c72c-4562-aae2-cb093f23e741` 独立核对四份规则 diff 与准入、生命周期交付、DoD、Task/Proposal 及根规则，结论 PASS，Required 0；未发现规则冲突、重复正文或授权越界。其 Optional 建议是在无 Task 的“现有交付记录”后例示本轮交接摘要。主代理本轮不采纳该文字增补：现有表述允许本轮交付摘要承载结论，且明确禁止新建 Task 或重复 tracker；保持复用现有交付渠道，不为非阻断措辞扩大规则修改。该决定不影响验收或后续按实际使用反馈澄清。

P3-1 三项可观察验收的实施与审查均已完成；当前状态更新为待 Otirik 最终验收，G19 编号仍待维护者确认，尚未提交。P3-2 长期检查能力与 P3-3 已知证据修复、真实任务演练尚未实施；本次规则交付不证明这些切片完成。主工作区 `git status --short` 仍仅显示原有 `.gitignore` 修改，未触碰；本治理 worktree 仅七份批准 Markdown 有差异，未暂存、提交或执行远端操作。最终记录同步后重跑同一组静态检查，结果在交付中报告；无需运行产品测试来验证纯规则修改。

最终统一验证（在本 worktree）：`bun run docs:check` exit 0，1242 文件、failures=[]；`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` exit 0，422 文档、3 基线、1 豁免，PASS，无 warning；`python .agent/tmp/p3-1-review.py` exit 0，7 份 Markdown、18 个标题链接，failures=[]；`git diff --check` exit 0，无输出。结构检查包含新建 G19 文件的尾随空白及 EOF；临时脚本仍只供本次审查。未运行项和限制沿用本节先前记录，不把静态通过当作业务或真实任务演练验收。

## 2026-11-02：编号确认、最终验收与本地提交授权

用户明确确认 G19 编号，P3-1 审核通过，并要求进行 Git 提交、附带详细中文说明。本条取代前文当时的“待最终验收、编号待确认”状态；保留原有过程记录，不回写历史。本轮处于交付收尾阶段，只更新本任务当前摘要、治理索引与本过程记录，然后检查并提交已验收的七份 Markdown。文档影响结论为“需更新”：须让当前状态反映维护者已经完成的验收与授权；不改变四份已审规则正文。

主代理沿用本记录登记的仓库、分支、worktree 和 base SHA，唯一写入本任务两文与治理索引；不再分派实现代理。提交集合限定为 `AGENTS.md`、`docs/README.md`、`docs/standards/repository-workflow.md`、`.agents/tasks/AGENTS.md`、`.agents/tasks/governance/README.md` 及 G19 的 README、walkthrough。暂存前核对既有暂存区为空，逐文件暂存后用 `git diff --cached --check` 覆盖包括新增文件在内的完整提交集合；重新运行既有文档门禁。详细中文提交说明须包含背景、规则与职责、任务验收、验证结果和未实施边界。

授权只覆盖本地 Git 提交，不扩展为 push、创建 PR、merge、发布、部署或清理 worktree。P3-2/P3-3 仍未实施，临时结构检查不作为长期工具交付；本轮不运行产品测试、类型检查、构建、浏览器、真实来源或 Agent 调用，因为没有实现或产品行为改动。提交身份及完成结果以 Git 历史和本轮最终交付为准，不在提交内容中预填尚未产生的哈希。

本轮提交前实际验证（均在本 worktree）：`bun run docs:check` exit 0，1242 文件、failures=[]；`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` exit 0，422 文档、3 基线、1 豁免，PASS，无 warning；`python .agent/tmp/p3-1-review.py` exit 0，7 份 Markdown、17 个标题片段链接、failures=[]，包含新增文件的空白和 EOF 检查；`git diff --check` exit 0，无输出。标题链接数从上轮 18 变为 17，是本轮 README 将具体派发标题链接改为 walkthrough 入口后的实际统计；未新增长期检查能力。追加本结果后仍须复核结构与完整暂存区，任何失败先修正再提交。
