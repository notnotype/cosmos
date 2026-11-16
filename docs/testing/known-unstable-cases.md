# 已知不稳定的测试用例

本文件登记**已观察到、但尚未修掉**的测试不稳定（flaky）用例：症状、实际观察到的证据、当前判断（含不确定的部分）和建议的处理次序。它是排查入口，不是当前验证结论——哪一层已通过或未运行，以 [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md) 为准；测试分层与命令见 [`README.md`](README.md)。

登记规则：

- 只记「同一条用例在没改代码的情况下既过又挂」的情况；确定性失败是缺陷，按 Bug 处理，不进本表。
- 证据必须写明**实际跑过的命令、次数与每次结果**，不能只写「偶发」。
- 不确定的地方要写出来。把「不知道」写成「无害抖动」是本文件最想避免的事。
- 修掉之后从表中移除，并把结论写进对应的 Task 或 `PROJECT-STATUS.md`。

## 1. `e2e/browser/phase2-organization.spec.ts` 的间歇失败

**状态（2026-09-25 更新：本条三个待归因点都已归因）**：`phase2-organization.spec.ts:30`（标签丢失更新）、`:103`（证据关系反向视图）与 `collection-plan-multi.spec.ts:63`（等「录入任务已排队」）是**测试缺陷**，已修；`:417`（用户组织场景，单次 5.1 分钟）归到**产品缺陷**（先发起的列表读取晚落地，抹掉刚建的实体/Topic），已修。完整证据链见 [`known-unstable-cases/ERRATA.md`](known-unstable-cases/ERRATA.md) 的勘误 1–4（2026-10-08 起该处为自足出处；原出处 `Phase-2-UNDO.md` 已于同日封口、停止维护）；历史记录（含 `:539`、`webhook-entry`、数据库线证伪）仍整段保留在分册 [`known-unstable-cases/0001-browser-intermittent.md`](known-unstable-cases/0001-browser-intermittent.md)，其中"仍未归因"的表述已被本条取代（勘误见 [`known-unstable-cases/ERRATA.md`](known-unstable-cases/ERRATA.md)）。

**2026-09-25 的两条结论摘要**：

- `:103`：run1 trace 显示面板打开时本来源只录入 1/3 条，候选列表里因此只有别的来源的条目；测试按位置（`index: 1`）挑中别的来源的同名条目，再按"来源名 + 标题"回找卡片，落到本来源同名的另一条 Story 上——那条 Story 里没有这个条目。修法：等本来源三条 fixture 卡片都出现，证据条目按来源身份挑。
- `:417`：扣住首屏 `/api/v1/entities?limit=50` 的响应 6 秒（快照是"建实体之前"的），建完实体后 7 秒该项从侧栏消失且不会自己回来。修法：列表写入闸门增加**读取序号**轴（只有最新一次读取的快照能落地）。

## 2. `e2e/browser/ingest.spec.ts:127` 的 390px 横向溢出断言

**状态**：**暂停（产品决定：移动端适配后置，维护者 2026-09-17），未修**——390px 检查当前不执行。恢复移动端适配时把 `e2e/support/viewports.ts` 的 `MOBILE_WIDTH_VERIFIED` 置回 true，并先按下方建议补失败现场打印。详细分析与建议修法仍在 `.agents/tasks/governance/G06-redline-code/README.md`。

**摘要**：页面级横向溢出检查跨「切换视口 → 立即测量」两步、对时序敏感，已在 CI **三次**失败（重跑即过、本地多次全绿）：最近一次是 2026-09-17 master run 35179029322 的 Browser E2E job，`Expected: <= 390 / Received: 401`，重跑该 job 后 `21 passed`。建议改成 `expect.poll` 有界重试，并在失败信息里带上最宽的溢出元素；不宜继续以重跑应对。

## 3. `e2e/browser/theme.spec.ts:164` 的 390px 横向溢出断言

**状态**：**暂停（产品决定：移动端适配后置，维护者 2026-09-17），未修**——390px 检查当前不执行；恢复时把 `e2e/support/viewports.ts` 的开关置回 true，并先补最宽溢出元素的现场打印。观察记录保留如下，供恢复时对照。

**实际观察（2026-09-17，同一分支同一内容）**：

| 跑法 | 结果 |
|---|---|
| run 35182347816（`workflow_dispatch`） | Browser E2E 全绿 |
| run 35182872270（只多了 `PROJECT-STATUS` 分册改动） | Browser E2E 全绿 |
| run 35183363675（只多了一个文档断链探针，与界面无关） | 该用例失败：`Expected: <= 390 / Received: 393`；**同一 run 内原始 + retry1 + retry2 三次全部为 393** |

**当前判断**：与第 2 条是同一类断言（`documentElement.scrollWidth <= clientWidth`，390px 视口）的横向溢出，但**三次尝试数值完全相同**，不像第 2 条那样「重跑即过」——更像某个稳定布局状态下的真实溢出（3px，滚动条 / 边框 / 圆角待查），而不是测量时序。机制未查清；与第 2 条可能同根因。

**建议的处理次序**：与第 2 条合并成**一次诊断**——先按第 2 条的改法让两条断言在失败时打印最宽溢出元素，再判断是修布局还是改断言。在该诊断完成前，`expect.poll` 对第 3 条单独无效（三次同值说明不是时序）。

## 4. 整套慢跑时等不到来源健康行/按钮（`media-policy.spec.ts`）

**状态（2026-09-25 更新：当前代码上未复现，不写"已修"）**：本轮整套连跑 5 轮、Task 34 的 8 轮整套都没有再出现"来源健康行/行内按钮等不到"。该观察最后一次实测是 **2026-09-17**，早于侧栏溢出修复（`3ce3322`，2026-09-23）与多轮重构，现场没有留下 trace，**无法回放**。

**已排除的机制**：计划列表的陈旧读取。用 `page.route` 扣住首屏 `/api/v1/collection-plans` 的响应（请求立刻发出、快照是"建计划之前"的）做确定性放大，该行**不会**被抹掉——修读取风暴之前页面每秒重读约 10 次计划列表，任何陈旧写入都在 ~50ms 内被纠正，这也解释了历史观察为什么能自愈。同一类缺陷在实体/话题列表上**可以**复现（见第 1 条），所以这条的成因与第 1 条不是同一个。

**原先判断里"整轮变慢是前置条件"这一条不成立**：那次 2.9 分钟的慢轮本身就包含一次 120 秒超时（同内容第 2 轮全绿时整轮 56.6 秒，差值 ≈ 那次超时），**慢是超时的结果，不是原因**。同一轮里定位并修掉的读取风暴（`page.tsx` 每次渲染新建 workspace context，导致挂载 effect 每次渲染重跑；一个页面会话对 `/api/v1/collection-plans` 与 `/api/v1/connections` 各发 300+ 次读取，3 秒静置窗口 629 次）是真实缺陷，但修后同 33 例的整套用时（约 164 秒）与修前（160–162 秒）基本一致，所以它也不是这些失败的解释。

**结论**：降级为"历史观察、当前不可复现"，继续观察；不再列为待归因项，也不声称已修。原观察记录保留如下。

| 跑法 | 结果 |
|---|---|
| Task 30 worktree，整套 22 用例，第 1 轮（整轮 **2.9 分钟**） | 21/22：`media-policy.spec.ts:60` 等行内「媒体策略 保留期-…」按钮 **120 秒超时**（同一轮 `:539` 通过） |
| 同内容第 2 轮（整轮 **56.6 秒**） | 22/22 通过 |
| Task 30 worktree，带临时诊断 spec 的整套 | 失败 `media-policy.spec.ts:89`：来源健康行 `li` 的可见性 10 秒超时（同轮 `:539` 也失败） |
| 单跑 `bunx playwright test e2e/browser/media-policy.spec.ts` | **3 passed (15.2s)** |
| 2026-09-24 Task 34 整套 8 轮 | 未再出现 |
| 2026-09-25 本轮整套 5 轮 + 修后 3 轮 | 未再出现 |

**历史判断（2026-09-17，保留原文）**：失败点集中在"等一个刚创建/刚启用的来源在来源健康列表里出现或变为可点"，且都发生在整轮耗时约为正常 3 倍的那些运行里；环境争用与应用在慢速下的更新时序问题都没有被排除。这两条用例都不碰搜索框，与 Task 30 的改动无关。

## 5. `e2e/component-lab/source-form.spec.ts:67` 的单次失败

**状态（2026-09-23 更新，两次观察，未归因）**：源表单「恢复的 token 在字段 blur 但未编辑时保留」用例在整套组件实验室里失败，随后复跑（单文件、整套）都通过。

| 跑法 | 结果 |
|---|---|
| Task 31 worktree，整套组件实验室（`bun run test:browser:component-lab`） | 13 passed / 1 failed：`source-form.spec.ts:67 preserves a restored token when its field blurs without editing` |
| 单跑该文件（`bunx playwright test --config playwright.component-lab.config.ts e2e/component-lab/source-form.spec.ts`） | **6 passed**（含该用例） |
| 同内容整套再跑一次 | **14 passed (16.8s)** |
| 2026-09-23 Task 22 切片 3 worktree（新增 `connection-panel.spec.ts` 后整套 16 例） | 15 passed / 1 failed：**同一条** `source-form.spec.ts:67` |
| 单跑该文件 | **6 passed** |
| 同内容整套再跑一次 | **16 passed (18.1s)** |

**当前判断**：两次观察、四次复跑均通过，符合环境抖动；机制未查清。两次都发生在**整套的第一轮**（dev server 刚冷启动、Next 在编译），后一次整套是好几次运行之后——这个相关性只是观察，未经证实。与两次改动（Task 31 的公开 Asset 投影、Task 22 切片 3 的 ConnectionPanel 与连接夹具）都没有可解释的因果关系：该用例不消费内容查询投影，也不消费连接夹具。**建议**：再出现时先看 trace 里失败步骤与同一 worker 上前一个用例是否共享状态（组件实验室是 1 worker 串行、共用同一个 dev server），并记录该次是否为冷启动首轮。

## 6. 组件实验室整套在紧跟浏览器套件后启动 dev server 超时

**状态（2026-09-18，一次观察，未归因）**：整套组件实验室没有跑到任何用例——`config.webServer` 等待 120 秒仍没就绪，报 `Timed out waiting 120000ms from config.webServer`。

| 跑法 | 结果 |
|---|---|
| Task 32 worktree，全量门禁里紧接 `bun run test:browser` 之后跑 `bun run test:browser:component-lab` | **启动超时失败**（0 用例执行）；同一轮 `test:browser` 22 passed |
| 紧接着单独复跑 `bun run test:browser:component-lab` | **14 passed (17.6s)** |

**当前判断**：与第 5 条不同，这次失败发生在任何断言之前，形态是"dev server 没起来"，更像端口/进程残留或资源争用（前一轮浏览器套件刚用过同一批端口）。与 Task 32 的改动没有可解释的因果关系——本片只动了来源行与运行记录的渲染。**建议**：再出现时先看组件实验室配置里的端口是否与浏览器套件重叠、以及上一轮是否留下了未退出的 server 进程。

## 7. CI Quality job 里 `apps/worker/src/workflow-ingest.test.ts` 的单用例超时

**状态（2026-09-20，一次观察，未归因）**：CI 的 Quality job 在 `bun run test` 里失败一次，形态是**单个用例 15 秒超时**，不是断言失败。

| 跑法 | 结果 |
|---|---|
| fork CI run 35502486397（`master` `263cc3c`，改动只有 `ERRATA.md` 一行） | Quality **1 failed / 631 passed**：`workflow-ingest.test.ts:34`「keeps durable ingest parity across idempotency, snapshots, revisions and projections」`Test timed out in 15000ms` |
| 同 run 单独重跑 Quality job | **全绿** |
| 该 job 前一次运行（`fc7867f`） | **全绿**（同一文件通过） |
| 本机单跑 `bunx vitest run apps/worker/src/workflow-ingest.test.ts` | **4 passed (19.66s)**，整文件比 CI 的单用例上限还长 |

**当前判断**：该文件每个用例都跑真实 `prisma migrate deploy` 建隔离库，整文件本机要 19.66 秒；CI runner 更慢时单个用例越过 15 秒默认上限是环境速度问题，与内容改动无关（本次改动是纯文档）。与第 1 条注记的「Windows 下 SQLite 迁移超时/EBUSY 同一家族」相邻但不同：这里不是断言失败，也不是 Windows。**建议**：再出现时先确认是否只在慢 runner 上发生；若反复出现，考虑给该文件显式 `testTimeout`（属测试配置改动，需要单独切片）。

**2026-09-24 更正与修复（G16 切片）**：上面「考虑给该文件显式 `testTimeout`」的措辞**方向错了**——该文件**本来就有**显式超时，问题恰恰是它把预算**压小了**。实测环境事实：`vitest.config.ts` 的全局 `testTimeout` 是 **60 秒**（配置里带注释说明「Prisma/SQLite 用例单条 3~5s，与 vitest 默认 5s 余量过窄」），而 `apps/worker/src/workflow-ingest.test.ts` 的四个用例各自覆盖成 `15_000`／`15_000`／`15_000`／`20_000`。本机实测四条分别为 **5712ms / 5213ms / 4426ms / 5402ms**（整文件 19.1~20.8 秒），即在 15 秒预算下本机只有约 2.6 倍余量，慢 runner 或并发争用下必然越过。**修复**：删掉这四处覆盖，回到全局 60 秒（不新增数字，避免再出现「文件内预算与全局设定互相矛盾」）。该文件已在同一批拆成 `workflow-ingest.parity.test.ts`（parity 用例）+ `workflow-ingest.media.test.ts`（三个媒体用例）+ `workflow-ingest.fixtures.ts`（共享装置），本条第 139/142 行的历史命令与路径按原样保留，不再回改。

**2026-09-24 新证据（G15 拆分尝试）**：为拆 `workflow-ingest.test.ts`（871 行，红线）把它按 `it` 分成两个测试文件 + 一个装置模块后，全量套件**连续两次失败**，而同一时段 `master` 连续 6 次全量**全绿**：

| 跑法 | 结果 |
|---|---|
| `master`（130 个测试文件） | **6/6 全绿**（本 session 内 G10–G14 各一轮 + G15 期间对照一轮） |
| G15 分支 run #1（131 个测试文件） | **1 failed / 736 passed**：本条的 parity 用例 `Test timed out in 15000ms`，随后 `afterEach` 清理撞 `EBUSY`（超时被中断、库还开着，属**派生**症状） |
| G15 分支 run #2（131 个测试文件） | **1 failed / 736 passed**：**另一个文件**（`story-human-protection.test.ts`）的清理 `EBUSY`，无超时——见下面第 8 条 |

两次失败都**不是断言失败**，且失败点在两个不同文件之间漂移，符合本文件反复记录的那类负载敏感抖动。**但 G15 因此被回滚**（未合入）：多出第 131 个并发测试文件后，这两条已知抖动的触发率明显上升，不能合入一个让套件 2/2 变红的改动。本条的修复（去掉过小预算）只消掉 run #1 的形态；run #2 的 EBUSY 是独立机制。

## 8. `afterEach` 清理临时根时的 `EBUSY`（Windows SQLite 文件锁）

**状态（2026-09-24 观察；2026-09-25 机制查清并已修，见下）**：测试用例本身跑完并通过，失败发生在**清理阶段**——删除临时根时 `cosmos.sqlite` 仍被占用。

| 跑法 | 结果 |
|---|---|
| G15 分支 run #2（131 个测试文件，改动只涉及 `workflow-ingest.test.ts`） | `packages/storage-prisma/src/story-human-protection.test.ts > keeps a human-edited Story when a merged member Entry is republished` 报 `Error: EBUSY: resource busy or locked, unlink 'C:\Users\Otirik\AppData\Local\Temp\cosmos-story-human-protection-merged-xwi8M6\cosmos.sqlite'`，**同一条用例无超时报错** |
| 同分支 run #1 | 同一形态出现在 `workflow-ingest.parity.test.ts`，但那里是**超时被中断**之后的派生症状（该用例 15 秒预算被越过） |
| `master` 对照（130 个测试文件，6 次） | 未复现 |

**机制（2026-09-25 查清）**：不是引擎进程未释放句柄，而是**用例被中断时它的 `finally` 不会跑到**。

- `story-human-protection.test.ts` 的 4 个用例都走 `withRepository(name, body)` 助手（L71），它把 `await repository.close()` 放在 `finally`（L100-101）——所以**正常断言失败也会关闭**，不是漏写 close。
- 但 **vitest 因超时中断用例时，被中断的 async 函数不会继续执行**，`finally` 不跑 → Prisma 客户端保持连接（library 引擎是进程内原生插件，文件句柄随客户端存在）→ 该用例的临时根删不掉。
- 共享 fixture 的 `afterEach`（`index.fixtures.ts:50`）删的是**该文件累积的全部根**（`temporaryRoots.splice(0)`），不只是当前用例的。于是 EBUSY 会在**之后某个用例的清理里**爆出来，把真正的中断报错盖住。这解释了「失败点漂移」与「同一文件里前面有、后面没有」，也解释了表里 run #1（超时被中断 → 派生）与 run #2（同一用例无超时）的差别。

**已否证的三个候选**：

1. 「Prisma 查询引擎是独立子进程」——**不成立**。generator 是 `prisma-client-js` 且没有 `engineType`，Prisma 6 默认 library 引擎（`node_modules/.prisma/client/query_engine-windows.dll.node`，进程内 N-API 原生插件），没有独立引擎进程。
2. 「`close()` 与 `rm` 之间有未等待的异步收尾」——**不成立**。`repository.close()`（`packages/storage-prisma/src/repository/base.ts:61`）`await this.prisma.$disconnect()`。
3. 「migrate CLI 进程还在跑」——**不成立**。`prepareDatabase` 用 `execFileSync`（`index.fixtures.ts:65`），会等 CLI 退出。

**探针一（负结果）**：按「建根 → `prepareDatabase` → 开仓储 → 查一次 → `close()` → 立刻 `rm`」跑 12 轮（37 秒），**EBUSY 0 次**。所以这段时序本身不脆——触发条件是**中断**，不是时序。

**探针二（确定性复现，2026-09-25）**：用「启动共享生命周期助手但不 `await` 它」来模拟用例被中断——被中断的 async 函数不会继续执行，`finally` 跑不到。结果：

| 步骤 | 结果 |
|---|---|
| 中断留下的仓储 + **直接 `rm`** | `EBUSY: resource busy or locked, unlink '...\cosmos.sqlite'`——**与上面表格里的错误一字不差** |
| 同一状态走**共享清理**（先兜底断开登记的仓储再删根） | 根已删除 |

所以机制不再是推断：**中断 → `finally` 不跑 → 句柄留着 → `rm` 撞 EBUSY**，而修复确实覆盖它。

**已修（2026-09-25，分支 `refactor/no-ref-shared-test-lifecycle`）**：把各文件自己写一遍的「建根 + 迁移 + 开仓储 + `finally` 关闭」收敛成共享助手的**唯一实现**，并且关闭走**登记**而不是只靠用例的 `finally`——清理会兜底断开还开着的客户端再删根。

- **两个原语，一套清理**（都在 `packages/storage-prisma/src/index.fixtures.ts`）：`withRepository(name, body(repository, prisma))` 给「用例要仓储」的；`withTestDatabase(name, body(database))` 给「只有数据库」的（迁移/升级/backfill：要在**同一个 DB 文件上分步部署 schema**、分步开关裸客户端）。另有 `deploySchema` / `sqliteUrl` / `prepareDatabase` 供文件级复用。`apps/worker/src/workflow-ingest.fixtures.ts` 同样加了兜底断开，并保留它「不在模块级注册钩子」的既有设计。
- **收敛范围**：`packages/storage-prisma` 34 个测试文件 + `apps/worker` 2 个 + 两处装置模块（`index.fixtures.ts`、`workflow-host-store.fixtures.ts`——后者原本自带第三份 `deployMigrations`，且 URL 拼法没把反斜杠转正斜杠）。`blob-store`(2) / `logging`(1) / `apps/worker` 的 `workflow-host.test.ts` 只用临时**目录**、不碰 SQLite，**无句柄可泄漏，不在范围内**。
- **再验证（对着定稿的 fixture 重做，覆盖两个原语）**：用「启动原语但不 `await` 它」模拟用例被中断——两个原语下**直接 `rm` 都撞出与上面表格一字不差的 EBUSY**，而走共享清理后根都被删除。
- **一个附带事实**：Prisma **懒连接**——只 `new` 出来、没跑过查询的客户端**不持有文件句柄**（第一次探针因此没复现出 EBUSY，修正为真的 `$connect()` 后才复现）。所以泄漏的前提是「客户端已经连上」，而 `withRepository` 里的 `initialize()` 正是连上的那一步。
- **这也顺带否掉了原建议的第③步「有界重试」**：被中断泄漏的客户端会一直连着，几秒退避删不掉，不要走那条。

## 9. `scripts/acceptance/story-agent-runner.test.ts` 的 15 秒用例预算超时

**状态：已修（2026-11-16）**。根因是该用例把超时写成 `}, 15_000)`，预算只有全局 60 秒的四分之一；删除覆盖后回到全局预算。

| 跑法 | 结果 |
|---|---|
| `bun run test` 第 1 轮（改动前，235 个测试文件） | 1 failed / 1491 passed；该用例 `Test timed out in 15000ms` |
| `bun run test` 第 2 轮（同一份代码） | 1492/1492 通过；该用例 4731ms |
| `bunx vitest run scripts/acceptance/story-agent-runner.test.ts` | 9 passed；该用例 9900ms |
| 删除覆盖后 `bunx vitest run`（上述 3 个文件） | 24 passed；该用例 12870ms |
| 空闲机器复跑 `bun run test`（同日 23:50，CPU 负载 4%） | **exit 0**；`Test Files 236 passed (236)`、`Tests 1496 passed (1496)`，整轮 166.85s（用例累计 1287.88s） |

**判断**：与第 7 条同一形态：15 秒预算比全局 60 秒紧 4 倍，单跑只剩约 1.5 倍余量，并行负载下必然越过。G16 已裁定「删掉小于全局的覆盖，回到 60 秒，不新增数字」；本轮却在三个测试文件里复发 9 处（`story-agent-runner.test.ts` 1 处 `15_000`、`story-body-runner.test.ts` 6 处 `30_000`、`store-idempotency-activity.test.ts` 2 处 `30_000`），已全部删除。修复后该文件 9 条用例与全量两轮均通过（1496/1496）；两轮退出码为 1（vitest-worker `Timeout calling "onTaskUpdate"`）；同日 23:50 空闲机器（游戏已退出、CPU 4%）复跑 `bun run test` exit 0，236 文件 / 1496 用例通过、整轮 166.85s，故属环境负载而非缺陷，远端 CI 仍未复跑。

**建议**：若「产品必须在 X 秒内 abort」是合同，写成产品断言；不要再引入小于全局的用例级覆盖。
