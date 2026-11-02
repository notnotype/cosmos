# 看板撤销 v1（Board Undo）

> 状态：**rejected**（不采用）——维护者 2026-09-24 裁定「当前不需要这个功能，可以记录为额外需求」；原话见 [`0001-original-requirements.md`](../requirements/0001-original-requirements.md) 同日条目，登记位置为 PRD §13 待决定事项 25。本文件保留为**设计输入**：将来若要重启，先读「待裁定项」与「当前行为与证据」两节。
>
> 日期：2026-09-24
>
> 关联：[`Phase-2-UNDO.md` P4-3](../Phase-2-UNDO.md)、ADR [`0010`](../adr/0010-board-section-block-v1.md)（可配置看板 v1）、ADR [`0020`](../adr/0020-story-split-user-state-migration-v1.md)（撤销＝反向调用，不建账本）、ADR [`0019`](../adr/0019-ops-storage-v1.md)（备份与恢复）、[`board-section-block-v1`](board-section-block-v1.md)、信息模型 [`../architecture/0002-information-model/part-05-10.md`](../architecture/0002-information-model/part-05-10.md) §5.4、PRD [`part-07-3.md`](../requirements/0002-product-requirements/part-07-3.md) BRD-002

## 问题

看板编辑**没有撤销入口**。用户在编辑模式下改错一步（尤其误删区块）只能手工重建配置——删除区块虽不删底层信息，但区块的 `type`／`config`／位置／分区归属都会丢，重建成本高且容易记错。

**这条诉求超出了已接受的需求**：BRD-002 的验收条件只写「用户可以调整顺序、隐藏、复制和配置区块；**删除区块不删除内容**」（`docs/requirements/0002-product-requirements/part-07-3.md:45`），**没有要求「删除可撤销」**。真人验收记录表也只回答了「删除 Block 后底层信息是否完好＝**完好**」，**没有回答**「改错一步能不能撤销」（`.agents/tasks/15-phase2-acceptance/manual-acceptance.md:87,100-101`）。所以本 Proposal 要决定的是一件**新增的产品能力**，不是修一个违反既有合同的缺陷——这一点必须先说清，否则会被质疑「需求没要求」。

台账把 P4-3 记为「观察项、未形成决定」，并明确要求**先出 Proposal，不建议在没有决定的情况下直接实现**。

## 目标与非目标

**目标**

1. 让「改错一步」在**看板配置层**可恢复，重点是删除类操作。
2. 定义「可逆」在现行看板模型下的确切含义（恢复什么、恢复到哪、多久内可恢复、边界情形）。
3. 明确撤销与**删除区块**的关系，且不削弱 BRD-002「删除区块不删除内容」。

**非目标**

- 不做通用 undo/redo 框架；不覆盖内容层（Story/Entry/Topic/Entity/标注的修改撤销是另一件事）。
- 不做版本历史、时间旅行、回滚到任意时点。
- 不做多人协作下的冲突撤销（看板配置是单机本地单用户，ADR-0010 决定 6）。
- 本 Proposal **不写实现**；`accepted` 之后才允许更新稳定文档与创建 Task。

## 当前行为与证据

### 1. 看板是纯展示配置，Block 不持有内容外键

ADR-0010 决定 1（逐字）：

> Block 的创建、删除、隐藏、复制、移动只改展示配置行，不触碰 Story/Entry/Topic/Entity/Collection/SavedView/Source（BRD-002「删除区块不删除内容」）。

数据模型（`packages/storage-prisma/prisma/schema.prisma:706-770`）：`Board` → `BoardSection`（title/position）→ `BoardBlock`（type/`configJson`/position/`visible`），外加独立的 `SpotlightPlacement`。**`BoardBlock` 没有任何内容对象外键**，`configJson` 里只存 `savedViewId`/`collectionId` 之类的 id 字符串。三处 `onDelete: Cascade`（Board→Section→Block，以及 Placement→Board）。

### 2. 删除是硬删，且**现有事件不可回放**（本轮代码核实，关键）

`packages/storage-prisma/src/repository/board-content.ts:264-281`：`deleteBlock` 在事务里 `tx.boardBlock.delete({ where: { id: blockId } })`——**物理删行**，随后只写一条事件：

```ts
await appendDomainEvent(tx, {
    type: "board.block.deleted.v1",
    aggregateType: "BoardBlock",
    aggregateId: blockId,
    payload: { blockId },          // ← 只有 blockId
});
```

各看板写事件的 payload（本轮逐条核实）：

| 事件 | payload |
| --- | --- |
| `board.block.created.v1` | `{ sectionId, blockId, blockType }` ← **无 config、无 position** |
| `board.block.config_updated.v1` | `{ blockId, blockType }` ← **无旧 config、无新 config** |
| `board.block.moved.v1` | `{ blockId, sectionId, position }` |
| `board.block.visibility_updated.v1` | `{ blockId, visible }` |
| `board.block.deleted.v1` | `{ blockId }` |
| `board.section.deleted.v1` | `{ sectionId }` |

**结论**：现行 DomainEvent 是**审计用**，不是**可回放用**。「靠事件回放实现撤销」在现状下**数据不够**——必须先补事件 payload 或另建记录。这一条直接决定了下面路线 2 的成本。

### 3. 「隐藏 ≠ 删除」是今天唯一的准可逆路径

`board-content.ts:205` 的代码注释（逐字）：

> `// Hidden ≠ deleted: the row stays so the block can be restored.`

隐藏只改 `visible`（`docs/spec/storage/0001-prisma-repository.md:101`「隐藏 ≠ 删除」；`docs/spec/interfaces/0002-product-api-http.md:323`「隐藏只改 `visible`，不删除行」），编辑模式下隐藏的区块保留「已隐藏」占位（`apps/web/src/components/cosmos/board-view.tsx:228-229`「便于恢复」）。

**这是本 Proposal 必须处理的核心张力**：用户要的「撤销」在功能上与已有的「隐藏」高度重叠，而 ADR-0010 决定 1 **只把「删除、隐藏」并列，从未定义两者的用户可见差别**。

### 4. 删除无确认、无撤销入口

`board-view.tsx:405-412` 的删除按钮 `onClick={() => void commands.deleteBlock(block.id)}`——**一次点击即硬删，无确认对话框**。命令面也没有 `delete*CommandSchema`：删除是**无 body 的顶层写**（`POST /board-blocks/:blockId/removals`，`docs/spec/interfaces/0002-product-api-http.md:325`，返回 `BoardCommandAck`，`action: "board_block.deleted"`）。

### 5. 级联删除：删分区会静默删掉其下所有区块

`deleteSection`（`board-content.ts:99-116`）只删 section 行，其下区块由 `onDelete: Cascade` 连带删除，**但只留一条 `board.section.deleted.v1`、payload 只有 `{ sectionId }`**。`deleteBoard` 同理（`docs/spec/storage/0001-prisma-repository.md:101`）。这对「撤销粒度」是一个尖锐问题（见待裁定项 Q1）。

### 6. 唯一的恢复路径是整库备份

`docs/adr/0019-ops-storage-v1.md:23-25`：`POST /backups/:id/restores` 用 `VACUUM INTO` 先做保护备份，再**文件级覆盖当前 SQLite**，且**需重启 API/Worker 才生效**（`:47-49` 明确列为高风险）。即：今天误删一个区块的「恢复」代价是**回退整个数据库**。

### 7. ADR-0010 从未定义撤销，Revisit Gate 也不覆盖

grep `撤销|恢复|undo|Undo|revert` 于 `docs/adr/0010-board-section-block-v1.md` → **无命中**；其 Revisit Gate 的 5 条触发条件**没有一条与可逆性有关**。`board-section-block-v1.md` 的**非目标**清单**也没有列出撤销**——即它是**未被提及**，不是被显式排除（这一点不要写成「明确排除」）。

**因此本 Proposal 若被接受，应新开一份 ADR**，而不是塞进 ADR-0010 的增补节。

### 8. 仓库已有的可逆性范式有**三种**，看板尚未选定

| 范式 | 出处 | 形态 |
| --- | --- | --- |
| **反向调用，不建账本** | ADR-0020 决定 3（逐字）：「撤销 = 同一个命令反向调用，不建账本…这符合架构 §5.4「撤销通过补偿操作完成，不删除历史」，也避开了账本回放语义的歧义」 | 数据一直在，只是归属变了；撤销＝搬回来 |
| **tombstone + restore** | Topic 成员：`docs/spec/storage/0001-prisma-repository.md:95`「移除是 tombstone revision、**可恢复**」，命令 `restoreTopicMember` | 行保留，标记后可由显式命令恢复 |
| **明确不可逆** | ADR-0015（媒体清理「没有撤销」）、ADR-0016（取消是终态） | 不做撤销，文档写明 |

架构层只有一句通用原则：`part-05-10.md:98`「可逆操作或补偿记录」，同处 `:100` 又写「…**复杂撤销后置**」。PRD 待决定事项 10（`docs/requirements/0002-product-requirements.md:202`）明确把「**一键撤销、通用撤销账本**」列为**仍待决定**——本 Proposal 正落在这个未裁定区间。

### 不确定处（如实列出）

- 未逐字读 `docs/architecture/0002-information-model/` 的 §7（Spotlight 是展示决定不是内容实体）与 §8.7 原文；本文引用的是 ADR-0010 对它们的转述。
- 未核实 `repository/views.ts` 的 `board.deleted.v1`／`board.seeded.v1` payload 内容。
- 未运行任何测试、typecheck 或 build；以上全部为静态阅读结论。
- 未找到任何「看板撤销」的维护者书面裁定或 Issue（已搜 `P4-3`／`撤销`／`undo`／`看板` 全仓含 `.agents/tasks/**`）；`.agents/tasks/34-sqlite-lock-observation/README.md:25` 明确写着「不处理…P4-3（看板撤销）」，说明**尚无承接 Task**。

## 范围

**要维护者裁定。** 四个候选：

| 候选 | 覆盖 | 代价 | 说明 |
| --- | --- | --- | --- |
| **A（建议）** | **破坏性操作**：删除区块、删除分区、解除 Spotlight 固定 | 中 | 这些操作一旦执行配置信息**丢失**，手工重建成本高——正是台账写的「影响」 |
| B | 所有看板配置写（创建/删除/隐藏/复制/移动/改配置/排序） | 高 | 非破坏性操作（上移、改配置）再操作一次即可回去；且 `updateBlockConfig` 的事件**连新旧 config 都不记**，纳入范围要连带补事件 |
| C | 只覆盖删除区块 | 低 | 最小可用，但删分区/解除固定同样不可逆，缺口只补一半 |
| **D** | **不做撤销**，改为「删除前二次确认」＋「把删除定位成隐藏的替代路径」 | 低 | 见 Q4：用户的原始不满是「点了不知道会怎样」。若确认＋文案就能解决，可能不需要撤销机制 |

**粒度**：建议**单步**（每个写操作一个撤销点），保留**最近若干步**。不做会话级「撤销整批编辑」。

**入口**：建议删除后给出可撤销提示＋快捷键；具体交互形态属 Task。若选 D，则入口是删除前的确认对话框。

## 可逆性语义

逐条定义（「建议」为倾向，全部待裁定）：

1. **恢复什么**：区块的 `type`、`config`、`position`、`visible`、`sectionId` **全量**恢复；不恢复内容层（内容从未被删）。
2. **恢复位置**：删除会使同分区其它区块的 `position` 重排（服务端口径「先移除、再在剩余之间插入」，ADR-0010 决定 7）。撤销应**插回原位置、其余顺移**（与 arrayMove 等价）；**不建议**追加到末尾。
3. **时间窗**：建议**有限窗口**，长度待定；底层记录是否留更久单独裁定。
4. **redo**：建议 v1 **不做**。
5. **撤销是否留痕**：建议**留痕**——撤销是一次写操作，应与其它看板写同样进审计（ADR-0010 决定 6）。
6. **目标已不存在**：撤销「删除区块」时若其**分区也已被删**，建议**拒绝并提示**，不做级联恢复（级联恢复会引入顺序语义）。
7. **被引用对象已消失**：撤销**不复活** config 指向的 SavedView/Collection；恢复后按 ADR-0010 决定 5 渲染降级占位。要写明，避免用户以为撤销能连带恢复内容对象。
8. **与「隐藏」的关系**：隐藏本身可逆，**建议不纳入**撤销范围；若选候选 B，必须同时定义「隐藏的撤销」与「直接设回 visible」两条路径的关系（建议：语义等价，不引入第二种状态）。

## 与删除区块的关系（P4-3 点名的核心）

**现行删除语义**：物理删行 + 一条只带 `blockId` 的审计事件；不触碰内容；无墓碑、无回收站、无恢复端点；唯一恢复路径是整库备份覆盖（第 2、6 节）。

**ADR-0020 的范式能不能直接照搬？不能。** ADR-0020 的「反向调用」建立在「**数据一直在，只是归属变了**」的前提上（split 把行搬到后继壳，撤销＝搬回来）。`deleteBlock` **把行删掉了**，反向调用需要 `type/config/position/visible/sectionId`——**这些既不在库里、也不在事件 payload 里**。这是真正的合同空白，不是风格差异。

**四条实现路线**：

| 路线 | 做法 | 优点 | 代价 |
| --- | --- | --- | --- |
| **1. tombstone / 软删** | `BoardBlock` 加 `deletedAt`，删除改为标记；读取侧过滤 | 恢复＝取消标记，最可靠；天然保住原 `id`；**与仓库已有的 Topic 成员 tombstone+restore 同构**（第 8 节） | 与 ADR-0010 决定 3 的**物理解除风格**冲突；改变读取面与索引；需 migration；**每条读取路径都要记得过滤**，漏一处就是幽灵区块 |
| **2. 操作记录 + 快照** | 删除前把整行快照写入**新记录**；恢复＝重新插入 | 不动既有删除语义与读取面 | **不能复用现有 DomainEvent**（payload 不够，第 2 节）→ 要么扩事件 payload、要么新建表；恢复后 `id` 可能变化 |
| **3. 前端延迟提交** | 删除先在本地生效，窗口内不落库 | 不改后端合同 | 「撤销」只在窗口内、不跨刷新；窗口过后仍不可恢复 |
| **4. 不做撤销，改为确认** | 删除前二次确认；把「可逆的删除」让位给「隐藏」 | 成本最低；直击「点了不知道会怎样」 | 不提供恢复；误删仍不可逆 |

**建议**：若维护者要「真的能撤销」，建议**路线 1**（与仓库既有的 tombstone+restore 同构，最不容易出错），代价是接受一次 migration 与读取侧过滤纪律；若维护者认为痛点是「误触」而非「不可恢复」，则**路线 4** 更省。**路线 2 的成本比我最初估计的高**——因为现有事件不可回放。

## 数据 / 接口 / 安全 / 迁移 / 发布 / 回滚影响

- **数据**：路线 1 需 `BoardBlock` 加列 + migration；路线 2 需扩事件 payload 或新建表；路线 3/4 无数据变更。
- **接口**：路线 1/2 需新增撤销或恢复类 command（命名待定），按 ADR-0006–0009 模式带**幂等键**与**白名单投影**，返回 `boardCommandAck` 同形结果；路线 4 只改 UI 与既有删除端点。
- **安全**：无外部副作用、无新权限面（单机本地单用户）。
- **迁移**：若加列/加表，migration 保持纯 schema（对齐 ADR-0010 决定 4「seed 不进 migration」）。
- **发布**：新增能力，可独立发布；入口可关闭。
- **回滚**：停用入口即可；若已加列/表，回滚时**保留**（向后兼容），不做破坏性 down migration。
- **审计**：撤销本身与被撤销的原始操作都要可追溯。

## 对 requirements / architecture / ADR / spec 的预期改动

- **新 ADR**：`docs/adr/00XX-board-undo-v1.md`（编号由维护者分配）。理由见第 7 节：撤销不在 ADR-0010 的 Revisit Gate 内。
- `docs/requirements/0002-product-requirements/`：**必须增补**——BRD-002 不含「删除可撤销」，撤销是新的用户可观察行为（同时收窄 PRD 待决定事项 10 中「一键撤销」的边界）。
- `docs/architecture/0002-information-model/`：仅路线 1/2 需补「撤销记录/墓碑」语义；路线 3/4 不需要。
- `docs/spec/`：落地后补看板撤销的实现规格（storage/interfaces/web-client 三处）。
- `docs/adr/0010-board-section-block-v1.md`：若采纳「删除＝标记」会与其决定 1/3 的物理解除风格冲突，需在 ADR-0010 的 Revisit Gate 里补一条触发条件（或由新 ADR 显式取代该风格）。
- `Phase-2-UNDO.md` P4-3 与 `PROJECT-STATUS.md`：状态更新。

## 待裁定项

| # | 问题 | 现状为何答不了 |
| --- | --- | --- |
| **Q1** | 撤销粒度：区块、分区，还是「一次操作」？删分区会**级联静默删掉其下全部区块**（只有一条 `{ sectionId }` 事件） | ADR-0010 决定 1 只说「删除只改展示配置行」，**没有区分删除对象与被级联删除的对象** |
| **Q2** | 走 ADR-0020 的「反向调用」范式，还是账本/快照，还是 tombstone？ | ADR-0020 的前提是「数据一直在」，`deleteBlock` 不满足；PRD 待决定事项 10 把「一键撤销、通用撤销账本」列为**仍待决定** |
| **Q3** | 有无时间窗？「最近一步」还是「任意历史」？ | 仓库唯一谈作用域的是 ADR-0020 的「同一 split 家族内任意方向」（**对象**作用域，不是时间窗） |
| **Q4** | 「删除」与「隐藏」的语义边界要不要重划？隐藏已做到「不删行、可恢复」，与撤销高度重叠 | ADR-0010 决定 1 只并列二者，**从未定义用户可见差别** |
| **Q5** | 范围只覆盖删除，还是「改错一步」的全部看板误操作？ | P4-3 的「现状」列了七个操作，「影响」句只讲删除；维护者原话是「改错一步」。范围本身就是要本 Proposal 回答的 |
| **Q6** | 与 Phase 5 的 Board/Query snapshot、Publication 的关系？ | ADR-0010 决定 6 把 Publication 列为后置，且 Revisit Gate 不含可逆性 → 该问题**永远不会被自动触发** |
| **Q7** | 撤销失败/不可撤销时 UI 怎么告知？ | [UI 文案判据](ui-copy-review-v1.md#判据本-proposal-的核心产出)中的 R4「风险动作要说明可逆性」仍处 **`reviewing`**，不是生效合同 |

## 决策记录

| 日期 | 决策者 | 决定 |
| --- | --- | --- |
| 2026-09-24 | 维护者 | 按 `Phase-2-UNDO.md` P4-3 要求**先出本 Proposal**（只出文档、不写实现） |
| 2026-09-24 | 维护者 | **不采用**。原话：「我认为当前不需要这个功能，可以记录为额外需求。」→ 登记为**额外需求（后置）**：原话进 [`0001-original-requirements.md`](../requirements/0001-original-requirements.md) 同日条目、位置进 PRD §13 待决定事项 25、台账 P4-3 移入「已裁定后置」；本 Proposal 转 `rejected` 并保留为设计输入（重启时先读「待裁定项」与「当前行为与证据」） |
| 2026-09-24 | Agent | 起草 draft；并完成一次只读侦察核实「删除是否已存在、事件能否回放、仓库既有可逆性范式」。**核实结果推翻了起草初稿的两处判断**：①现有 DomainEvent 不可回放（payload 不够），故「复用审计做快照」不成立；②仓库已有 ADR-0020（反向调用，不建账本）与 Topic 成员 tombstone+restore 两条先例，初稿漏掉了 |
