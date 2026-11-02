---
parent: ../ui-copy-review-v1.md
range: "当前行为与证据（原文第 48–63 行）"
sealed_at: 2026-11-02
tags: [ui-copy, evidence, screen-review]
tokens_est: 1359
---

## 当前行为与证据

界面文案目前的问题不是「太多术语」一种，而是四种不同性质的问题，改法完全不同：

| 类型 | 例子（引文，含文件位置） | 用户看到什么 | 改法 |
| --- | --- | --- | --- |
| **要求用户读内部标识** | 「并入本 Story 的 Story ID」（[story-actions.tsx:135](../../../apps/web/src/components/cosmos/story-panel/story-actions.tsx#L135)） | 手输一串 ID 才能归并两条内容 | 改成可搜索、可选择的列表（要动界面，不只是改字） |
| **暴露内部概念名** | 「固定到看板热点区」「在当前看板的 Spotlight 区块展示本条 Story」（原文在 `organization.tsx:139`；Task 36 Round 9 拆分重排后，「固定到看板热点区」在 [`story-marking.tsx`](../../../apps/web/src/components/cosmos/story-panel/story-marking.tsx)，文案已迁进 [`copy/areas/reading.ts`](../../../apps/web/src/copy/areas/reading.ts) 的 `storyEdit.marking.pinToBoard`）；「历史壳：成员已全部拆分到后继 Story」（原 `story-panel.tsx:689`，Task 35 切片 3e 已改为「已拆分为 N 条」，见 [`history-shell.tsx`](../../../apps/web/src/components/cosmos/story-panel/history-shell.tsx)）；「本条 Story 已被拆分；它的成员历史、批注与审计仍然保留在这里」（[history-shell.tsx:22](../../../apps/web/src/components/cosmos/story-panel/history-shell.tsx#L22)）；`${subtype}（未注册）`（原 `story-panel.tsx:216`，已改为「（沿用旧值）」，见 [`story-subtype-select.tsx`](../../../apps/web/src/components/cosmos/story-panel/story-subtype-select.tsx)）；「后继 1 subtype」（[split.tsx:113](../../../apps/web/src/components/cosmos/story-panel/split.tsx#L113)） | 「Spotlight」「历史壳」「审计」「未注册」「subtype」都要先学 | 换成用户词（已有权威依据，见上）；内部状态不出现在面向用户的句子里 |
| **专业近义词** | 「引文（可选）」（原文在 `organization.tsx:323` 与 `:404`；Task 36 Round 9 后文案在 [`copy/areas/reading.ts`](../../../apps/web/src/copy/areas/reading.ts) 的 `storyEdit.marking.annotationQuotePlaceholder`）；「证据关系」「选择证据条目」（[evidence.tsx](../../../apps/web/src/components/cosmos/story-panel/evidence.tsx)）；「暂无相关但不同事件的 Story；给本条 Story 添加分类或关联 Entity 后会自动出现」（[related.tsx:19](../../../apps/web/src/components/cosmos/story-panel/related.tsx#L19)） | 词都对，但要先懂行业用法 | 换成日常说法；拿不准的先问你 |
| **承诺与界面不符 ／ 信息过时** | 「收藏后可在收藏列表快速找回本条 Story」（原文在 `organization.tsx:157`，Task 36 Round 9 拆分重排时已删除，**收藏列表这个界面不存在**）；首页徽标「Phase 1 · 本地信息库」与副标题「从 Story 入口浏览已保存的信息，并手动触发 RSS 录入。」（[page.tsx:500](../../../apps/web/src/app/%28shell%29/page.tsx#L500)、[506](../../../apps/web/src/app/%28shell%29/page.tsx#L506)，Phase 2 已收口、首页现在以看板为主） | 界面承诺了做不到的事；界面说的事情已经不是现在的事 | 要么补上界面，要么删掉承诺；过时描述随界面现状更新 |

另外两处结构性问题（属于界面骨架，归另一份 Proposal，但**必须和文案一起改**否则前后矛盾）：

- 侧栏分区标题中英混用：`Entities`、`Topics` 是英文，旁边的「连接」「存储」是中文（[page.tsx:606](../../../apps/web/src/app/%28shell%29/page.tsx#L606)）。
- 「分类」这个词在界面上已经出现（相关内容空态文案），但仓库里「『分类』是稳定导航分区、自由标签，还是二者的上位概念」仍是 [PROJECT-STATUS.md](../../../PROJECT-STATUS.md)「后置决定」里**尚未决定**的一项。界面先用了这个还没定的词——维护者已裁定在它被定义前界面只用「标签」和「已保存视图」（见[表 E](../ui-copy-review-v1.md#e-分类已裁定按建议处理)）。
