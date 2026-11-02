---
parent: .agents/tasks/32-phase1-closure/walkthrough.md
range: 切片 1-5 与 Phase 1 收口结果（2026-09-18 合并前）
sealed_at: 2026-09-18
tags: [task, walkthrough, archive]
tokens_est: 3400
---

# Task 32 walkthrough 分册：切片 1-5 与 Phase 1 收口结果

本册是 Task 32 walkthrough 的封口分册，只搬位置、不改写条目。后续记录继续写在主文件 [walkthrough.md](../walkthrough.md)。

## 切片 1：LIB-001 搜索补三个过滤维度

### 口径与边界

- 「录入状态」按维护者 2026-09-18 裁定 = 该 Entry **当前 Revision 的本地媒体保存状态**（资产四态 `saved`/`metadata_only`/`skipped`/`failed`）；「未读」属 Read State（LIB-005 / Phase 4），不在本片。
- 「媒体类型」取内容形态 `ContentKind`（ING-017 已冻结的受管枚举），不新建枚举。
- 「作者」匹配发布者的 `name` 或 `handle`，子串、大小写不敏感；发布者为空的条目不会被任何作者条件命中。
- 合同字段：`author`（字符串）、`contentKind`（受管枚举）、`assetStatus`（受管四态），都是可选单值——多选留给后续需要时再加，避免现在就把 Saved View 的条件形状搅乱。

### RED

新增 [`packages/storage-prisma/src/search-filters.test.ts`](../../../../packages/storage-prisma/src/search-filters.test.ts)：一条来源里录入三条内容（Alice/视频/已保存媒体、Bob/文章/失败媒体、无作者/帖子/无媒体），断言三个维度各自与组合都能筛出正确条目。

```text
bunx vitest run packages/storage-prisma/src/search-filters.test.ts   # 实现前
Test Files  1 failed (1)
     Tests  1 failed (1)
```

失败形态：`search({ author: "alice" })` 返回全部 3 条（条件被忽略）。

### GREEN

- [`packages/contracts/src/search.ts`](../../../../packages/contracts/src/search.ts)：`searchQuerySchema` 增加三个可选字段与口径注释。
- [`packages/storage-prisma/src/repository/search.ts`](../../../../packages/storage-prisma/src/repository/search.ts)：作者用 `json_extract(r.publisherJson, '$.name'/'$.handle') LIKE ? ESCAPE '\'`（含 LIKE 通配符转义，`a_b` 不会匹配 `axb`）；媒体类型 `r.contentKind = ?`；录入状态 `EXISTS (SELECT 1 FROM Asset a WHERE a.entryRevisionId = r.id AND a.status = ?)`。JSON1 的 `json_extract` 在本仓库 SQLite 上实测可用（该用例转绿即证据）。
- [`packages/transport-http/src/client-content.ts`](../../../../packages/transport-http/src/client-content.ts)：`search()` 拼上三个 query 参数。
- Web：[`feed-browser.tsx`](../../../../apps/web/src/components/cosmos/feed-browser.tsx) 表单加「作者」输入与「媒体类型」「录入状态」两个下拉（受管枚举，用 `contentKindSchema`/`assetStatusSchema` 收窄类型），筛选回显 chip 同步；[`page.tsx`](../../../../apps/web/src/app/%28shell%29/page.tsx)（2026-09-24 由 `apps/web/src/app/page.tsx` 移入路由组）的默认值、`onSearch`、结果提示同步；[`use-feed-workspace.ts`](../../../../apps/web/src/app/home/use-feed-workspace.ts) 的套用视图显式清空这三个条件。

```text
bunx vitest run packages/storage-prisma/src/search-filters.test.ts
Test Files  1 passed (1)
     Tests  1 passed (1)
```

### 偏差与取舍

- **保存视图与新增过滤的冲突（有意为之）**：Saved View 的条件形状由 LIB-005（Phase 4）拥有，只有关键词/来源/时间/分类/Topic。当前搜索带了作者/媒体类型/录入状态时，`saveCurrentSearchAsView` **拒绝保存并给出原因**，而不是让这三个条件被 Zod 静默剥掉——静默丢条件比拒绝更难排查。代价：这三个条件暂时无法存成视图（属 Phase 4 扩展）。
- **表单值类型**：首版把三个字段写成 `z.string()`，`bun run typecheck` 立刻报 `page.tsx` 把 `string` 赋给受管枚举类型；改为 `contentKindSchema.or(z.literal(""))` 收窄后通过。这是本片唯一一次返工。

### 验证

| 命令 | 结果 |
|---|---|
| `bunx vitest run packages/storage-prisma/src/search-filters.test.ts` | 1 passed（新增） |
| `bunx vitest run packages/transport-http apps/web/src/components/cosmos/feed-browser.test.ts` | 10 文件 / 32 用例全绿（新增 [`client-content.test.ts`](../../../../packages/transport-http/src/client-content.test.ts) 2 例：参数确实拼上 query、未传时不出现；`feed-browser.test.ts` 新增 3 例：默认值、trim 与受管枚举、越界值被拒） |
| `bunx vitest run packages/storage-prisma packages/contracts packages/transport-http apps/web apps/api` | 76 文件 / 415 用例全绿 |
| `bun run typecheck` | 0 |

未运行（本片）：浏览器产品套件、组件实验室——新控件没有新增浏览器用例；计划在五个切片完成后跑整套，届时覆盖回归但不单独证明这三个控件。剩余风险：新控件的端到端可用性只有组件级与表单级证据。

## 切片 2：ING-004 发现渠道

### 设计决定（维护者 2026-09-18 裁定）

字段由**连接器在域层声明**，不写进 manifest。理由（本片实施时发现）：Bilibili 的 hot 与 feed 是同一个 manifest（`source.bilibili@1`，只有 `fetch` 一个 operation）下的两种发现方式，manifest 表达不了这个差别；而连接器本来就知道自己的 mode。代价：manifest 上那个自由字符串 `discoveryContext` 仍是空串，留待后续清理。

### 实现

- [`packages/domain/src/index.ts`](../../../../packages/domain/src/index.ts)：新增 `discoveryChannels`（account / recommendation / search / announcement / email / manual / related / agent / unknown）与 `DiscoveryChannel`；`NormalizedIngestItem.discoveryChannel?` 加为**可选**，并注明它不进内容指纹——同一条内容换一种发现方式不产生新 Revision（`fingerprintEntryRevision` 的入参本来就只含标题/摘要/正文/URL/kind/发布者，未改）。
- [`packages/contracts/src/base.ts`](../../../../packages/contracts/src/base.ts)：`discoveryChannelSchema`（wire 校验）；[`action.ts`](../../../../packages/contracts/src/action.ts) 的 `normalizedIngestItemSchema` 与 [`entry-relation.ts`](../../../../packages/contracts/src/entry-relation.ts) 的 `observationSnapshotSchema` 各加一个可选字段；`entry-surface.txt` 重新生成（+2）。
- 连接器：RSS → `account`；Bilibili `mode=hot` → `recommendation`、`mode=feed` → `account`；AI HOT → `recommendation`。
- 仓储：写入 `discoveryContextJson` 时在既有 `kind`（触发类型）旁加 `channel`；读投影 `observationDiscoveryChannel()` 用受管枚举校验，缺失或非法值一律降级 `unknown`（升级前的行没有该字段）。
- Web：Story 面板的 Observation 徽标显示渠道文案（新增 `DISCOVERY_CHANNEL_LABELS`）。

### 验证

| 命令 | 结果 |
|---|---|
| `bunx vitest run packages/storage-prisma/src/observation-discovery.test.ts` | 2 passed（新增）：连接器声明的渠道能往返；旧数据缺字段时读回 `unknown` 而不是抛错 |
| `bunx vitest run plugins packages/storage-prisma packages/contracts apps/web packages/transport-http apps/worker apps/api` | 86 文件 / 467 用例全绿（连接器测试新增 3 处渠道断言：RSS=account、hot=recommendation、feed=account、AI HOT=recommendation） |
| `bun run typecheck` | 0 |
| `bun scripts/entry-export-surface.ts packages/contracts/src/index.ts --out packages/contracts/entry-surface.txt` | 456 个导出（+2：`discoveryChannelSchema` / `DiscoveryChannel`） |

未运行（本片）：浏览器产品套件；新徽标文案没有新增浏览器断言。剩余风险：渠道在界面上的展示只有类型与组件层证据。

## 切片 3：AUT-003 条件请求（RSS 无变化时不重新抓正文）

### 实施前发现的前置条件

`ConnectorStateStorePort` 在 Task 22 就建好了，但**全仓没有任何连接器消费它**——连接器的 `fetchItems` 端口拿不到状态。所以本片先把状态接到连接器上（这同时补上 ING-012「StateStore 没被内置连接器使用」缺的那一半）。

### 实现

- [`packages/application/src/connector-ports.ts`](../../../../packages/application/src/connector-ports.ts)：新增 `ConnectorStateHandle`（只剩键的命名空间化视图：`get`/`put`），`fetchItems` 入参加可选 `state`；注释写明宿主没接状态存储时（legacy 采集路径）为 `undefined`，连接器必须退化成无状态抓取。
- [`workflow-ingest.ts`](../../../../packages/application/src/workflow-ingest.ts)：`IngestActionOptions` 增加 `connectorState?: (source) => ConnectorStateHandle | undefined`，`source.fetch@1` 把它传给连接器。
- [`apps/worker/src/main.ts`](../../../../apps/worker/src/main.ts)：组合根构造 `PrismaConnectorStateStore`，并按 manifest 的 `stateStoreNamespace` 解析命名空间（`{id}` 替换为来源 id；声明为 null 就不给句柄）——命名空间由合同拥有，不在 Worker 里硬编码来源分支。
- [`plugins/rss/src/index.ts`](../../../../plugins/rss/src/index.ts)：上次的 `ETag`/`Last-Modified` 存在来源状态里（键 `http-cache`），这次带上 `If-None-Match`/`If-Modified-Since`；服务端 304 时**不下载正文、不解析**，`nextCursor` 保持不变。状态写入失败（并发抓取的 CAS 冲突）只记 debug，不让已成功的采集失败。

### RED → GREEN

```text
# 临时把 plugins/rss/src/index.ts 回退（git stash push -- 该文件）
bunx vitest run plugins/rss
Test Files  1 failed (1)
     Tests  1 failed | 8 passed (9)

# 恢复实现（git stash pop）
bunx vitest run plugins/rss
Test Files  1 passed (1)
     Tests  9 passed (9)
```

新增两个用例：① 第一次抓取存下验证器、第二次带条件头且 304 时返回空结果与不变的 cursor；② 没有注入状态句柄时退化为无条件抓取（不带条件头）。

### 偏差

- **测试写在实现之后**：本片先改了端口类型（测试要编译就必须先有 `ConnectorStateHandle`），随后才写测试；RED 是用 `git stash` 回退实现文件补出来的，不是先红后绿的自然顺序。记录在此以免被读成"先红后绿"。
- 测试里的内存状态句柄首版把 `value` 写成 `unknown`，与 `ConnectorStateHandle.put` 的 `JsonValue` 不兼容，`bun run typecheck` 报错；改成显式标注句柄类型后通过。

### 验证

| 命令 | 结果 |
|---|---|
| `bunx vitest run plugins/rss` | 9 passed（新增 2 例） |
| `bunx vitest run plugins packages/application apps/worker packages/storage-prisma apps/api packages/transport-http apps/web packages/contracts` | 95 文件 / 547 用例全绿 |
| `bun run typecheck` | 0 |
| `bun scripts/entry-export-surface.ts packages/application/src/index.ts --out packages/application/entry-surface.txt` | 150 个导出（+1：`ConnectorStateHandle`） |

未运行（本片）：真实公网 RSS 的条件请求验收（需要真实来源，属既有后置边界）；浏览器套件。

## 切片 1–3 的规格同步与全量门禁（2026-09-18）

维护者选定「先收口 1–3（文档 + 全量门禁），再做 4–5」后完成：

规格同步（8 处，只写当前实现事实）：

| 文件 | 同步内容 |
|---|---|
| [`docs/spec/domain/0001-normalized-content.md`](../../../../docs/spec/domain/0001-normalized-content/01-concepts.md#内容发布者和采集-item) | `NormalizedIngestItem.discoveryChannel`（含"不进 fingerprint"）、`discoveryChannels` 锚点 |
| [`docs/spec/contracts/0001-public-contracts.md`](../../../../docs/spec/contracts/0001-public-contracts.md) | `ObservationSnapshot.discoveryChannel`（可选，升级前数据按 unknown） |
| [`docs/spec/interfaces/0002-product-api-http.md`](../../../../docs/spec/interfaces/0002-product-api-http.md) | `GET /search` 的三个新参数与语义（单值等值、彼此 AND、assetStatus 命中"当前 Revision 存在该状态"） |
| [`docs/spec/interfaces/0005-web-client.md`](../../../../docs/spec/interfaces/0005-web-client.md) | 表单三个新控件、chip 回显、与 Saved View 的边界（拒绝保存而不是静默丢条件） |
| [`docs/spec/connectors/0001-rss.md`](../../../../docs/spec/connectors/0001-rss.md) | 条件请求语义（验证器存 `http-cache`、304 短路、CAS 冲突只记日志、无状态句柄时退化）+ 发现渠道 `account` |
| [`docs/spec/connectors/0002-managed-collectors.md`](../../../../docs/spec/connectors/0002-managed-collectors.md) | Bilibili `hot`→`recommendation`、`feed`→`account`；AI HOT→`recommendation` |
| [`docs/spec/application/0001-connector-runtime.md`](../../../../docs/spec/application/0001-connector-runtime.md) | `fetchItems` 的 `state?` 参数、`ConnectorStateHandle` 的边界与注入路径 |
| [`docs/spec/storage/0001-prisma-repository.md`](../../../../docs/spec/storage/0001-prisma-repository.md) | discovery JSON 的 `kind`/`channel` 形状与缺省 |

全量门禁（worktree 内实际运行）：

| 命令 | 结果 |
|---|---|
| `bun run typecheck` | 0 |
| `bun run test` | **103 文件 / 616 用例全绿** |
| `bun run build` | 通过（API + Worker + Next standalone） |
| `bun run db:validate` | schema valid |
| `bun run lint:web` | 0 error / 80 warning（全部既有） |
| `bun run docs:check` | **687 文件 0 失败** |
| `python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` | PASS（含既有基线内文件增长 warning） |
| `git diff --check` | 干净 |
| `bun run test:browser` | **22 passed** |
| `bun run test:browser:component-lab` | **14 passed** |

未运行：`test:property`、Node 进程 E2E、Windows Node smoke、Docker/Compose、真实公网来源验收（由远端 CI 覆盖或属既有后置边界）。

## 切片 4：AUT-001 删除来源（**部分完成**）

### 实施前发现的关键约束

`Entry.sourceInstanceId` 是**必填 + `onDelete: Cascade`**——硬删来源会连带删除 Entry、Observation、EntryRevision 与 Asset，正好违反维护者裁定的「保留已录入历史」。所以删除落成**墓碑（软删除）**：来源行保留（历史仍可溯源），`deletedAt` 非空的行从列表、读取、编辑与调度中排除。这是本片唯一的产品语义推论，依据是 AUT-001 的验收文字本身（「删除凭据、停用来源和删除历史数据是三个独立动作」）。

### 已完成的部分

- **Schema + 迁移**：`SourceInstance.deletedAt DateTime?`（可空、expand-only、不回填）；迁移 [`20260918120000_source_soft_delete_v1`](../../../../packages/storage-prisma/prisma/migrations/20260918120000_source_soft_delete_v1/migration.sql)。
- **仓储**：`deleteSource()`（墓碑 + 删 TriggerBinding + `source.deleted.v1` DomainEvent 记 actor/reason）；`listSources`/`getSource` 过滤墓碑；`updateSource`/`activateSource` 对墓碑等同不存在；`listScheduleTriggers` 再挡一次。
- **合同**：`deleteSourceCommandSchema`（baseRevisionId + 可选 actor/reason）+ 导出面重生成（458 导出，+2）。
- **API**：`POST /sources/:sourceId/removals`（Idempotency-Key + `sourceCommandError` 漏斗）；G03 路由快照同步。
- **客户端**：`client.deleteSource(sourceId, input, idempotencyKey)`。

### 验证（已跑）

| 命令 | 结果 |
|---|---|
| `bunx vitest run packages/storage-prisma/src/source-deletion.test.ts` | 2 passed（新增）：删除后来源从列表消失、调度绑定移除、Entry/Revision/Observation 保留且仍溯源到来源、审计事件带 reason、重复删除幂等且只写一条事件、旧 revision 冲突、墓碑拒绝编辑 |
| `bun run typecheck` | 0 |
| `bunx vitest run packages/contracts apps/api` | 23 文件 / 146 用例全绿（含路由表零变化守卫） |
| 聚焦套件 `packages/storage-prisma packages/contracts packages/transport-http apps/api apps/worker packages/application` | 80 文件 / 441 用例（首轮 1 挂是导出面快照没重生成，已修） |

### 本片收尾（同日补齐）

1. **Web 入口**：来源健康行内新增删除按钮，**两段确认**（第一次点击切确认态并说明"只移除配置与定时，已录入内容保留"，第二次才发命令）；`use-source-workspace.deleteSource` 发 `POST /sources/:id/removals`（actor=`user`、幂等键含来源 revision），409 走版本冲突提示并刷新。
2. **API 层测试**：`app.controller.sources.test.ts` 新增 3 例——命令透传（含 actor/reason 与幂等键）、缺 `Idempotency-Key` 400、来源不存在 404。
3. **客户端层测试**：`client-sources.test.ts` 新增 1 例——URL/方法/幂等头/请求体逐项断言。
4. **规格同步**：`interfaces/0002`（新路由行）、`interfaces/0005`（行内删除入口与两段确认）、`storage/0001`（墓碑语义、幂等、墓碑拒绝编辑、调度跳过）、`spec/README.md` §4 迁移顺序补 `20260918120000_source_soft_delete_v1`。

### 验证（本片最终）

| 命令 | 结果 |
|---|---|
| `bunx vitest run packages/storage-prisma/src/source-deletion.test.ts` | 2 passed（新增） |
| `bunx vitest run apps/api packages/transport-http` | 20 文件 / 104 用例全绿（含新增 4 例） |
| `bun run typecheck` | 0 |
| `bun run lint:web` | 0 error / 80 warning |
| `bun run docs:check` | 689 文件 0 失败 |
| size 门禁 | PASS |
| 全量门禁（typecheck/test/build/db:validate/lint/docs/size/diff/browser/component-lab） | 见下方「切片 4 全量门禁」节 |

### 切片 4 全量门禁（worktree 内实际运行）

| 命令 | 结果 |
|---|---|
| `bun run typecheck` | 0 |
| `bun run test` | **104 文件 / 622 用例全绿** |
| `bun run build` | 通过 |
| `bun run db:validate` | schema valid（新迁移可应用） |
| `bun run lint:web` | 0 error / 80 warning |
| `bun run docs:check` | **689 文件 0 失败** |
| size 门禁 | PASS |
| `git diff --check` | 干净 |
| `bun run test:browser` | **22 passed** |
| `bun run test:browser:component-lab` | **14 passed** |

未运行：`test:property`、Node 进程 E2E、Windows Node smoke、Docker/Compose、真实来源验收（由远端 CI 覆盖或属既有后置边界）。**Web 的删除入口没有新增浏览器用例**——新按钮的端到端可用性只有类型/组件层证据与既有套件回归，剩余风险记在此。

### 偏差

- 实施中两次手滑删错行（API 的 `@HttpCode(202)`、客户端的 `testSource` 函数体），都当场读回现场修复，`typecheck` 与相关测试通过后才继续。
- 存储测试首版三处断言写错：`createFixtureSource` 会顺手激活来源（revision 变 2）、`EntryDetail` 没有顶层 `title`（标题在 revision 上）、导出面快照需要重生成；都已修正。

## 切片 5：OPS-002 Run → Job 产品面

### 实施前的口径与边界

- **需求解释**：「Job/Attempt 的状态、重试次数」由 Job 行（状态 + `attempts/maxAttempts` + 错误码）表达；**Attempt 明细（租约窗口、owner 等）保持 API-only**，产品面不展示。这是本片的口径边界，不是遗漏。
- **前置发现**：Run 投影里没有 job 引用，API 也没有"列出某个 Run 的 Job"的端点——所以从 Run 走到 Job 在产品面上本来是断的，必须先补一个读端点。

### 实现

- **合同**：`jobListSchema`（`{ items: JobSnapshot[] }`）+ 导出面重生成（459 导出）。
- **仓储**：`listRunJobs(runId)`——`OR: [{ runId }, { workflowRunId }]`，因为 legacy Run 与 durable WorkflowRun 共用同一个 Run 读端点；未知 Run 返回空列表而不是报错。
- **API**：`GET /runs/:runId/jobs`；G03 路由快照同步。
- **客户端**：`client.listRunJobs(runId)`。
- **Web**：运行记录选中某个 Run 时列出其 Job（状态、重试次数、错误码/错误）；结果带 `runId` 并在渲染时比对，避免切换选中后旧响应覆盖；无任务显示"这个 Run 没有登记任务"。

### 验证

| 命令 | 结果 |
|---|---|
| `bunx vitest run packages/storage-prisma/src/run-jobs.test.ts` | 1 passed（新增）：legacy `runId` 归属可查、其它 Run 的 Job 不混入、未知 Run 返回空列表 |
| `bunx vitest run packages/transport-http` | 10 文件 / 25 用例全绿（新增 1 例：URL 与 `attempts/maxAttempts` 投影） |
| `bunx vitest run apps/api packages/transport-http packages/contracts apps/web` | 46 文件 / 264 用例全绿（含路由表零变化守卫） |
| `bun run typecheck` | 0 |
| `bun run lint:web` | 0 error / 80 warning |
| `bun run docs:check` | 690 文件 0 失败 |
| size 门禁 | PASS |
| 全量门禁 | `bun run test` **105 文件 / 624 用例全绿**；`build` 通过；`db:validate` 通过；`diff --check` 干净；`test:browser` **22 passed**；`test:browser:component-lab` 首轮 dev server 启动超时、**单独复跑 14 passed**（登记为 [`known-unstable-cases.md`](../../../../docs/testing/known-unstable-cases.md) 第 6 条） |

### 偏差

- 实施中第三次手滑用半行锚点插入，删掉了 `RunControl` 的 `run={selected}` 属性；读回现场修好。**教训**：插入新代码时必须用完整代码块作锚点，不用"某行的前半段"。
- 三处断言/类型写错并修正：Job 状态枚举实际是 `failed_terminal`/`retry_wait`（不是 `failed`/`uncertain`）；`JobSnapshot` 投影没有 `idempotencyKey`；测试里 Job 的 `runId` 是外键，必须先造 Run 行。

## Phase 1 收口结果（Task 32）

| 需求 | 结论 |
|---|---|
| LIB-001 搜索三过滤 | 已交付（切片 1） |
| ING-004 发现渠道 | 已交付（切片 2） |
| AUT-003 条件请求 | 已交付（切片 3），顺带补上 ING-012 缺的一半 |
| AUT-001 删除来源 | 已交付（切片 4，墓碑语义） |
| OPS-002 Run→Job 产品面 | 已交付（切片 5） |
| ING-008 音视频验收 | 走勘误收窄（ADR-0005 已冻结媒体边界），登记进 PRD 勘误表 |
| RUN-010/011、OPS-010（Gateway） | 维护者 2026-09-18 裁定排除、单独排期 |

**Phase 1 表内不再有未闭合项**（Gateway 三行按裁定排除、ING-008 按勘误收窄）。分支上的改动**未推送、未合并**；`PROJECT-STATUS.md` 的 Phase 1 结论与验证数字在合并时一并更新（该文件描述 master，不在本分支提前改）。

未运行（全 Task）：`test:property`、Node 进程 E2E、Windows Node smoke、Docker/Compose、真实公网来源验收、真实 Agent 验收（由远端 CI 覆盖或属后续阶段/既有后置边界）。

