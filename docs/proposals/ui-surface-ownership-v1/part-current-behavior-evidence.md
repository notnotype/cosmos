---
parent: ../ui-surface-ownership-v1.md
range: "当前行为与证据（原文第 34–54 行）"
sealed_at: 2026-11-02
tags: [ui-surface, evidence, capability-inventory]
tokens_est: 968
---

## 当前行为与证据

「能从哪发起」这一列是本次问题的核心：打 √ 的格子都是 Story 抽屉。

| 能力 | 从哪里发起 | 从哪里能管理/查看 | 读取接口是否已具备 |
| --- | --- | --- | --- |
| 创建 Topic、把 Story 加入 Topic | 仅 Story 抽屉 | Topic 抽屉（仅改角色/移除/恢复） | `listTopics`、Topic 详情已具备 |
| Topic 成员角色维护 | Topic 抽屉 | 同上 | 已具备 |
| 创建 Entity、关联 Entity 到 Story | 仅 Story 抽屉 | Entity 抽屉（别名/关系/解除关联） | `listEntities` 已具备 |
| Entity 别名与 Entity 间关系 | Entity 抽屉 | 同上 | 已具备 |
| 新建标签、给 Story 挂标签 | 仅 Story 抽屉 | 无标签管理面 | `listLabels` 已用；`label(id)`（含该标签下的 Story/Entry/Topic 及标题）**已实现但前端未使用** |
| 删除/改名标签 | 不支持 | 不支持 | `deleteLabel` 已具备，无改名命令 |
| 新建收藏夹、勾选成员 | 仅 Story 抽屉 | 看板 `collection` 区块只读展示成员 | `listCollections`、`collection(id)`（含成员及加入时间）已具备 |
| 收藏（轻量标记） | 仅 Story 抽屉 | **无任何列表面** | `listFavorites` **已实现但前端未使用** |
| 写/改/删批注 | Story 抽屉、Topic 抽屉 | 仅在被批注对象的抽屉里 | `listAnnotations` 只支持「按目标查」，**没有跨目标的批注列表** |
| 已保存视图 | 「信息库与搜索」区保存当前条件 | 同区套用、删除 | `listSavedViews` 已具备 |

结论：**这次重划在读取侧几乎是现成的**。五个对象里四个的反向查询（标签下有什么、收藏夹里有什么、收藏了什么、Topic/Entity 列表）都已经有接口甚至有解析好的标题，只是没有界面。唯一缺口是「所有批注」这一个列表（见[影响](../ui-surface-ownership-v1.md#影响)）。

「堆在一条 Story 上」也有可量化的表现：承载这些区块的 `story-panel.tsx` 当时已经 777 行 / 33.7 KB，按 [`code-size-governance-v1.md`](../code-size-governance-v1.md) 已进入 30 KB 警戒区、距离 800 行红线只剩 23 行，`story-panel/` 子目录另有 17 个文件。抽屉继续长下去的代价不只是用户看不懂，也包括它很快会被迫拆分——而拆分的正确时机是先把不该在这里的东西搬走。**后续**：Task 35 切片 3e 按 ADR-0029 决策 7 删除了这个抽屉（编辑面搬到 `/stories/:id`，见 [`story-edit-panel.tsx`](../../../apps/web/src/components/cosmos/story-edit-panel.tsx)），因此本段的文件引用已不再指向仓库里的文件（Task 36 切片 A 又把那个编辑面拆成左内容 / 右操作编辑两栏，`story-edit-surface.tsx` 随之改名为 `story-edit-panel.tsx`）。
