# 勘误：UI 文案逐屏取证分册

本文件记录对封口分册 [`part-current-behavior-evidence.md`](part-current-behavior-evidence.md) 的复核结果（P3-3，核实日 **2026-11-02**）。分册正文保持 2026-09-15 取证原样，不改写、不重排、不补行号；分册正文里被引用的问题是否仍然成立，以本文件与当前代码为准。本文件不是分册，因此没有分册元数据。

复核方式是读取当前源码、检索界面文案，不是逐屏看界面，所以**不代替浏览器验收**——界面是否真的这样显示，仍需用浏览器跑一遍。行号一律只作定位辅助，引用时请按文案检索。

## 逐条复核

核实结果只有三类：**已修复**（问题已不存在，且有当前落点）、**引用失效（问题已不存在）**（引用的文件、行号或文案已不存在，问题本身也不再成立）、**仍成立**（问题仍在，位置或措辞的现值见「当前证据」）。

| 取证册原引用 | 2026-09-15 记录的问题 | 核实结果 | 当前证据 |
| --- | --- | --- | --- |
| `story-actions.tsx:135`「并入本 Story 的 Story ID」 | 要求用户手输内部 ID 才能归并两条内容 | 已修复 | `apps/web/src/components/cosmos/story-panel/story-actions.tsx:180` 的标签已是「并入本条的内容」，其下接 `MergeTargetSelect`（同文件 `:188`）按标题搜索归并目标；同段注释写明「判据 R3 不允许要求用户粘贴内部 Story ID」 |
| `organization.tsx:139`「在当前看板的 Spotlight 区块展示本条 Story」 | 「Spotlight」要用户先学 | 引用失效（问题已不存在） | `apps/web/src/app/(shell)/organize/` 下已无 `organization.tsx`；「固定到看板热点区」的现值在 `apps/web/src/copy/areas/reading.ts:134` 的 `storyEdit.marking.pinToBoard`，由 `apps/web/src/components/cosmos/story-panel/story-marking.tsx:136` 渲染；`apps/web/src` 检索「Spotlight」只剩 `pinSpotlight` 等代码标识符、注释、测试与 `apps/web/src/copy/scan.ts` 的禁用词表，无用户可见文案 |
| `story-panel.tsx:689`「历史壳：成员已全部拆分到后继 Story」 | 「历史壳」要用户先学 | 引用失效（问题已不存在） | `apps/web/src` 已无 `story-panel.tsx`（拆成 `story-panel/` 目录）；「历史壳」在 `apps/web/src` 检索只剩注释、测试与 `apps/web/src/copy/scan.ts` 的禁用词表（`story-panel.tsx` 的界面段落已随拆分重写）；界面现值见下一行 |
| `history-shell.tsx:22`「本条 Story 已被拆分；它的成员历史、批注与审计仍然保留在这里」 | 「审计」是内部词 | 已修复 | 行号仍落在同一段落，但原文已换：`history-shell.tsx:19` 是「已拆分为 N 条」，`:22` 是「本条内容已被拆分成几条；原来的成员、批注与标记都还在这里，但不再接受归并、改标题或再次拆分。」；`apps/web/src` 检索「审计」只命中注释、测试与 `apps/web/src/copy/scan.ts` 的禁用词表 |
| `story-panel.tsx:216`「（未注册）」 | 内部状态出现在面向用户的句子里 | 已修复 | 现值在 `apps/web/src/components/cosmos/story-panel/story-subtype-select.tsx:52`：`{value}（沿用旧值）`；「未注册」在 `apps/web/src` 只剩该文件 `:38` 的注释、`apps/web/src/copy/messages.test.ts` 的用例与 `apps/web/src/copy/scan.ts` 的禁用词表 |
| `split.tsx:113`「后继 1 subtype」 | `subtype` 裸写英文 | 已修复 | 现值在 `apps/web/src/components/cosmos/story-panel/split.tsx:118`：`label={`后继 ${index + 1} 子类型`}`；分册写的 `:113` 现在落在同文件 kind 下拉的 `media` 选项上，按行号已读不到该文案 |
| `related.tsx:19`「添加分类或关联 Entity」 | 「分类」在含义定义前被界面先用了 | 已修复 | `apps/web/src/components/cosmos/story-panel/related.tsx:19` 现为「暂无相关但不同事件的 Story；给本条 Story 打标签或关联 Entity 后会自动出现。」 |
| `organization.tsx:323`、`:404`「引文（可选）」 | 专业近义词，用户要先懂行业用法 | 仍成立 | `apps/web/src/copy/areas/reading.ts:147` 的 `storyEdit.marking.annotationQuotePlaceholder` 仍是「引文（可选）」，由 `story-marking.tsx:252` 与 `:328` 两处渲染；分册的原引用位置已随 `organization.tsx` 删除失效，但文案本身未改 |
| `evidence.tsx`「证据关系」「选择证据条目」 | 「证据」是领域内部词 | 仍成立 | `apps/web/src/components/cosmos/story-panel/evidence.tsx:25` 的 `aria-label="证据来源"`、`:70` 的 `aria-label="选择证据条目"`、`:84` 的 `aria-label="证据关系类型"`；关系选项在 `:92`「证据」与 `:93`「提及」 |
| `organization.tsx:157`「收藏后可在收藏列表快速找回本条 Story」 | 界面承诺了不存在的收藏列表 | 引用失效（问题已不存在） | 承诺文案已删除，且收藏分区已落地：`apps/web/src/app/(shell)/organize/favorites-section.tsx:18` 的注释记录「界面上没有收藏列表」并说明该分区补上了入口；`apps/web/src` 检索「快速找回」只命中这条注释 |
| `page.tsx:500`「Phase 1 · 本地信息库」徽标 | 首页信息过时（Phase 2 已收口） | 引用失效（问题已不存在） | `apps/web/src/app/(shell)/page.tsx` 现为 283 行，`:500` 越界；`apps/web/src` 全目录检索「本地信息库」0 匹配 |
| `page.tsx:506`「从 Story 入口浏览已保存的信息，并手动触发 RSS 录入。」 | 界面说的事情已不是现在的事 | 引用失效（问题已不存在） | 同上，`:506` 越界；`apps/web/src` 检索「手动触发 RSS」0 匹配；首页现在由 `BoardView`（`page.tsx:258`）与 `HomeBoardToolbar`（`page.tsx:247`）构成 |
| `page.tsx:606`「侧栏分区标题中英混用：`Entities`、`Topics` 与「连接」「存储」并列」 | 分区标题中英混用 | 引用失效（问题已不存在） | `apps/web/src/components/shell/side-nav.tsx:25` 起由 `NAV_GROUPS` 驱动，分组标题取 `messages.shell.nav.groups.*`：`apps/web/src/copy/areas/shell.ts:9` 为「内容」、`:10` 为「管理」；唯一保留英文的导航项是 `shell.ts:16` 的 `entities: "Entity"`，属术语表 B 组保留项 |
| 取证册第 23 行的「分类」（无文件引用，只在相关内容空态文案里出现） | 「分类」的含义尚未定义却被界面先用了 | 已修复 | 相关内容空态已换成「打标签」（`related.tsx:19`）；`apps/web/src` 检索「分类」只剩注释、测试、`apps/web/src/copy/scan.ts` 的 `BANNED_UI_TERMS`（已收录「分类」）与 `BANNED_TERM_FALSE_POSITIVES`（豁免「细分类型」），以及 `apps/web/src/component-lab/product-fixtures.tsx` 的「共享分类：开发」——后者是开发用组件实验室的 fixture 数据，不是产品界面 |

## 仍成立的问题

`evidence.tsx` 的「证据来源」「选择证据条目」「证据关系类型」仍与术语表 B 组裁定冲突：B 组把 `evidence_for`／`mentions` 的界面展示名定为「引用关系」（见主文档表 B，`docs/proposals/ui-copy-review-v1.md:170`）。这是**待实施的文案批次项**，登记在此只是让后续批次有据可查，**不是** 2026-09-15 那条取证失效，也不应被读成「分册记错了」。

## 验证方式与未运行项

- **已运行**：读取上表涉及的当前源码文件并检索文案；本 worktree 内 `bun run docs:check` → 1,256 个文件、0 失败（新增的 `ERRATA.md` 已进空白检查）；两个文件的字节数与 token 估算（见交付报告）。
- **未运行**：浏览器验收、组件实验室、E2E 套件——本文件只核对源码里的文案现值，不证明界面渲染结果。
- **已知限制**：`split.tsx:118` 的 `label={`后继 ${index + 1} 子类型`}` 是模板字符串，界面实际显示「后继 1 子类型」；`evidence.tsx` 的三处 `aria-label` 是给辅助技术的名字，视觉上不显示，但同样属于用户可感知文案。
