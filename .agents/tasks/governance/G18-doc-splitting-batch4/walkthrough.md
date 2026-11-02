# G18 文档治理过程记录

## 2026-11-02：切片 0，范围与分派

维护者在 P0/P1 自行提交后授权继续 P2，处理五条既有大小 warning。工作区为 `D:/Otirik/Workstation/cosmos/.worktrees/docs-governance`，分支 `docs/no-ref-document-governance`，基线 `71b488d08ec89adb8767d15cf85804d7bf390805`；开始时 clean。主工作区用户已有 `.gitignore` 改动不触碰。沿用用户已授权的 worktree 与分支，偏离治理章程的新任务分支命名惯例，不另建分支。

目标是机械迁移、导航与大小基线收口。纯文档无行为改动，RED 不适用；文档保全和静态检查作为验收。五条 warning 的原文件分别为 43,355 / 36,483 / 31,529 / 28,083 / 27,898 字节（API、testing、domain、copy、surface）；基线登记为 35,341 / 28,294 / 29,246 / 26,729 / 27,533 字节。领域规格的行数以 base 实际内容为准，不沿用初步估计。

所有代理共用上述 repository、branch、worktree 和 base SHA；不运行应用测试或读写产品数据，隔离测试数据根不适用。写入集合不重叠：

| 代理 | 唯一可写集合 | 审核与限制 |
|---|---|---|
| `24e25cc3-4be7-409a-8b9c-64fd031e2cbe` | `docs/api/0002-product-service-api.md` 与其同名目录中的新增章节册 | 保留 Draft 和既有 landing-notes；返回原行范围映射 |
| `f2eeafbd-04e3-4645-b740-2880fa1b6478` | `docs/testing/README.md` 与 `docs/testing/README/` 新册 | 保留所有命令、隔离规则和证据边界；重复段落先保全 |
| `569c19b8-366c-4e64-87b7-2d1c41801568` | `docs/spec/domain/0001-normalized-content.md` 与其同名目录新册 | 只迁移当前规格，不改合同 |
| `bbd80f2c-dffe-486b-8f1e-5eed4c104be1` | 两份 UI 提案主文与各自 `-v1/` 同名目录新册 | 仅迁逐屏证据，保留状态、裁定、术语及原话；既有作废记录只读 |
| 主代理 | 本 Task、治理索引、必要外部引用、`docs/doc-governance/docs-baseline.json`、必要状态摘要 | 唯一共享文件写入者；核实后才移除基线 |

切片顺序：并行交付 → 主代理审查内容守恒/有效链接/状态 → 五条基线移除 → worktree 内全量文档门禁。假设：旧主文路径保持入口即可保留无章节锚点的通用引用；有效章节引用需逐条定位修正。封口材料不改写，发现历史表述冲突只登记。

初始命令 `python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new`：exit 0，PASS，405 个文档、8 条基线、1 条豁免，五条既有增长 warning。G18 按最大 G17 顺延登记，待维护者确认编号；这不阻止已授权 P2 实施。

## 2026-11-02：切片 1，拆分与独立复核

四个文档代理已交付：API 三册、测试五册、领域规格三册、两份 UI 提案各一册，共新增十三册。全部只迁文档，未改应用代码或数据。UI 的 reviewing/accepted、有效裁定、术语表、原话、未决项和勘误保留在主文；原有 API landing-notes 与 UI attempt-and-void 相对 base 无差异。

校正初始读数：`git show 71b488d08ec89adb8767d15cf85804d7bf390805:docs/proposals/ui-surface-ownership-v1.md` 的原始 UTF-8 字节为 27,890，切片 0 的 27,898 为初步读数，不用于验收。领域规格原文实际 214 行。没有修复或引入编码变化；媒体重试段的原始 Unicode 码位及 UTF-8 前缀相同，工具输出曾显示乱码，已核实为呈现问题。

原文主要区间映射（旧行均相对 base；分册目录与各主文同名）：

| 主文 | 原文区间 → 迁入册 | 主文保留内容 |
|---|---|---|
| `docs/api/0002-product-service-api.md` | 24–232 → `part-02-04.md` 11–219；233–407 → `part-05-09.md` 11–185；408–568 → `part-10-17.md` 11–171 | 1–23 原样，新增索引与勘误 |
| `docs/spec/domain/0001-normalized-content.md` | 29–82 → `01-concepts.md` 11–64；83–176 → `02-behavior-input-output.md` 11–104；177–205 → `03-acceptance-implementation.md` 11–39 | 1–28 与 206–214 原样，新增索引与维护路由 |
| `docs/proposals/ui-copy-review-v1.md` | 48–62 → `part-current-behavior-evidence.md` 9–23 | 其余正文原样，新增证据索引 |
| `docs/proposals/ui-surface-ownership-v1.md` | 34–53 → `part-current-behavior-evidence.md` 9–28 | 其余正文原样，新增证据索引 |
| `docs/testing/README.md` | 17–25、59–79、85–95 及 CI 分层 → `01-layers-browser-contracts.md`；27、45–57 → `02-story-entry-anchors.md`；29–43 → `03-organization-board-anchors.md`；81–83 → `04-media-policy-anchors.md`；97–132 → `05-optional-acceptance.md` | 原入口定位、完整分层命令表和证据边界，新增共同约束、索引与勘误 |

主代理独立以原文非空行多重集合核对，归一移动后的 Markdown 链接目标及测试段尾一处方向引用后，五组原文均无缺失。原标题均保留；API 标题 38→40（仅增索引/勘误）、围栏 2→2、列表 26→26；领域规格 35→35、0→0、76→76；UI 文案 29→29、0→0、41→41；UI 职责 27→27、0→0、53→53；测试保留原 8 标题、6 个围栏标记、0 列表项，新增五册标题与主文勘误。两组实验室重复段逐字保全，本轮去重为 0。各组代理另做逐段重建检查；API 原文重建 SHA256 为 `426c7ccec942ae3a2c562b7c160e9fa79ea373f71a491d371628d201145537c5`。

独立只读审查代理 `fcdb47cf-8cd1-41ad-992f-7bbb6d656cc7` 核对五组正文、锚点及旧封口材料。按其建议补齐测试索引元数据，并在 API、domain、testing 入口说明后续行为/合同变化由文档代理新增或替代册、同步有效索引及状态；封口不代表当前合同停止演进。

## 2026-11-02：切片 2，引用与基线收口

主代理修复以下共享引用：`docs/api/0003-product-dtos.md`、Task 33 README 与历史册两处 CollectionPlan 小节；`docs/proposals/story-domain-v1.md` 的状态转换；`docs/spec/README.md` 五个领域定义；Task 32 历史册的 discoveryChannel 章节；`docs/proposals/board-undo-v1.md` 的 R4 旧行号改为判据章节。Task 32/33 历史册严格仅改链接 URL，叙事、标签、状态不变。无小节指向的普通引用仍指旧路径入口。

测试原媒体段尾“见下方 E2E 清单”改为返回主入口的分层命令表；两条受控验收脚本链接按目录升层修正。新增/修改文档锚点补充检查覆盖纯 `#` 片段，因为现有 docs:check 只验证路径、不验证章节。

五份主文及新增册回健康区后，`docs/doc-governance/docs-baseline.json` 删除对应五条，8→3；其余三条及登记值不变，不新增豁免。过程与最终审核证据只在本 walkthrough 维护。

待后续核实：UI 文案取证册保留的首页 `#L500`、`#L506`、`#L606` 是本轮之前已有的历史行号失效；需要重新取证后再决定勘误，本轮不把旧证据改写成当前事实。G18 编号与最终验收仍由 Otirik 确认；Notype 为顾问，无当前最终审批权。

## 2026-11-02：切片 3，最终静态验证与交接

测试收尾已复核：入口五列包括路径、用途/读者、标签、大小/token、封口状态；五行与实际分册及 frontmatter 一致。原 CI 分层标题与正文（旧 134–136）完整保留在 `docs/testing/README/01-layers-browser-contracts.md` 57–59；原证据边界（旧 138–140）位于测试主文 27–29。主入口 4,877 字节，低于 5 KiB；第一册 8,991 字节 / 2,948 token，修正了索引、range 和 token 元数据。

最终主文规模（UTF-8 字节；token 使用仓库门禁的 round(ASCII 字节/4 + 非 ASCII 字节/3×1.1)）：

| 主文 | 原字节 → 当前字节 | 当前 token | 新增分册 |
|---|---|---|---|
| `docs/api/0002-product-service-api.md` | 43,355 → 3,282 | 1,042 | 3 |
| `docs/testing/README.md` | 36,483 → 4,877 | 1,480 | 5 |
| `docs/spec/domain/0001-normalized-content.md` | 31,529 → 4,496 | 1,437 | 3 |
| `docs/proposals/ui-copy-review-v1.md` | 28,083 → 24,443 | 8,346 | 1 |
| `docs/proposals/ui-surface-ownership-v1.md` | 27,890 → 25,574 | 8,648 | 1 |

所有新增册及主文均 ≤30 KiB 且 ≤9,000 token；API、testing、domain 三个索引均 ≤5 KiB。两份 UI 主文保留有效合同，不为压到索引大小而迁走裁定。十三册的完整大小及 token 列在各自入口表中。

以下命令均在本 worktree 执行，主代理检查实际输出，不以子代理报告代替验收：

| 命令 | 实际结果 |
|---|---|
| `bun run docs:check` | exit 0；checkedFiles=1240；failures=[] |
| `python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` | exit 0；扫描 420 文档，基线 3、豁免 1，PASS，无增长 warning |
| `git diff --check` | exit 0，无空白错误 |
| `python .agent/tmp/p2-structure.py` | exit 0；检查 28 个新/修改 Markdown、36 个标题链接；failures=[]；新增册元数据/token/健康区、尾随空白、围栏均通过 |
| `python .agent/tmp/p2-verify.py` | 输出五组 missing_count=0、missing_headings=[]；原文行/标题多重集合、围栏与列表保全；只归一移动 URL 和一处已说明的方向引用 |

两份补充脚本为本机忽略目录下的一次性只读核对工件，不进入提交。独立审查未发现阻塞项；testing 最后一笔索引及 CI 移动由主代理复核，并纳入上述 fresh 全量门禁与内容检查。

未运行：类型检查、应用构建、单元/属性测试、Node/浏览器 E2E、Docker、Windows smoke、真实来源与真实 Agent 验收。本批纯文档迁移，未据静态检查宣称产品行为或发布验证完成。未执行 commit、push、PR、merge 或部署；主工作区原有改动未触碰。

实施与静态验收已完成，待 Otirik 最终审核和确认 G18 编号；审核重点为五份入口可发现性、两份 UI 有效裁定未迁走、基线仅移除五条及既存行号问题的后续安排。审核后是否提交/集成由维护者决定，本轮不自动执行。

## 2026-11-02：维护者最终审核

Otirik 对本批交付回复“审核通过”。本次验收确认 G18 编号及 P2 交付完成；任务摘要与治理索引同步为已验收。此前静态验证结果及未运行项保持原有证据范围，UI 历史失效行号仍列后续重新取证事项。本次仅同步审核记录，不执行 commit、push、PR、merge 或部署。

## 2026-11-02：Git 提交授权与交付

最终审核后，Otirik 明确要求进行 Git 提交并附详细中文说明。主代理仅暂存本批已审查的文档、引用、基线与 G18 记录；提交信息说明五份主文拆分、十三册、内容保全、基线 8→3、验证结果及既存 UI 行号问题。审核记录更新后 `bun run docs:check` 检查 1,240 文件、零失败，`git diff --check` 通过；提交前重新运行大小门禁，420 文档、3 条基线、1 条豁免，PASS，无 warning。提交身份以本记录所属 Git 提交为准，不在提交正文中循环登记自身 SHA。

完整暂存区首次执行 `git diff --cached --check` 发现五个新分册末尾各多一空行（API 前两册、领域规格三册），exit 2；先前未暂存检查未覆盖新文件。已逐文件移除末尾空行，非空正文和原标题不变；本节先前的精确字节/行区间为该收尾修正前观测，各受影响册减少 1 字节和 1 空行。随后重新暂存并以 `git diff --cached --check` 验证提交内容。

本次授权仅执行本地 commit，不执行 push、PR、merge、部署或 worktree 清理。
