# Task 40 Walkthrough

> 历史记录（2026-10 实施、审查与修复）已归档至 [walkthrough/01-implementation-2026-10.md](walkthrough/01-implementation-2026-10.md)。

## 当前状态

编号 40。生命周期：**已完成并关闭**（2026-11-05）；维护者确认既定范围内验收全部完成，2026-11-13 补充验收已收口。内容表示、阅读、版本管理与候选人工决定已实现；当前生成由显式模型或默认模型解析，经 API 202 入队、Worker 执行并仅保存 pending。四阶段真实来源及浏览器证据、真实摘要人工接受、补充关系/质量样例与合成传输的独立 Worker 结果分轮记录于下文。范围外补强事项不构成当前关闭门槛。

Task39 已完成，本 Task 消费其能力。Leader 为唯一记录写入者。

## 设计依据与决定

依据：[目标设计](../../../docs/aegis/specs/2026-10-08-story-content-representation-design.md)、[架构](../../../docs/aegis/specs/2026-10-08-story-content-representation-architecture.md)。

目标：新采集正文保留图文顺序、安全可读；Web 与 Agent 共用版本化内容投影；旧数据继续可读；候选接受前不改正式事实。

技术栈：Bun/TypeScript、NestJS、Prisma/SQLite、React/Next.js、Zod。RSS 外层保留现有 XML 解析，正文 HTML 采用 parse5。

Change Necessity：contentText + assets 无法表示原位媒体和表示版本。最小实现边界包括来源输入、Normalizer、持久子资源、Query、阅读器及候选流程。各消费方共用 Query。

兼容：旧 contentText/Asset/Story DTO 保留，新字段 additive 增加；旧库不批量重解析。来源身份去重不使用清洗 blocks。来源指纹主要覆盖文本：图片替换/顺序变化生成来源修订，解析器升级/媒体下载状态变化不生成来源修订。

TDD Route：mode=off，decision=skipped。不要求先写失败测试，仍须合同、修订、权限、迁移与候选接受行为测试，每切片运行相应回归。

决定摘要见归档分册；当前活跃内容从阶段 3 执行起。

---


### 2026-11-05：阶段 3 真实执行——两次失败与诊断

#### 第一次：Prisma Blog feed 失效（HTTP 404）

```
COSMOS_REAL_RSS_URL=https://www.prisma.io/blog/feed.xml
```

Run 在 1 秒内失败，`itemCount: 0`，`error: null`。日志确认：
```
connector.transport.failed  status: 404  host: www.prisma.io
```

**根因**：`https://www.prisma.io/blog/feed.xml` 返回 HTTP 404，feed 已失效。非代码问题。

#### 第二次：Smashing Magazine feed 媒体下载超时

```
COSMOS_REAL_RSS_URL=https://www.smashingmagazine.com/feed/
```

RSS fetch 成功（HTTP 200，40 条目，1.4 MB），但 **388 张图片串行下载耗时约 147 秒**，超过 `waitForTerminalRun` 的等待预算，Run 被判超时：

```
error: Timed out waiting for real RSS ingest Run completion.
```

日志确认媒体下载本身全部成功（`status: "saved"`），仅 1 张因 HTTP 403 失败。Worker 正常运行无异常。

**根因**：`waitForTerminalRun` 内部 `waitForCondition` 使用硬编码 180 秒超时，但验收脚本调用时未传自定义超时，实际使用了 `waitForCondition` 的默认 10 秒（隔离 e2e 测试设计的是受控本地 feed，瞬间返回）。真实来源媒体下载耗时远超此预期。

**代码修复**：
- `scripts/e2e/helpers.ts`：`waitForTerminalRun` 新增可选 `timeoutMs = 180_000` 参数，内部传递给 `waitForCondition`（现有调用方默认 180 秒不受影响）
- `scripts/acceptance/real-source-ingest-runner.ts`：调用处显式传 `300_000`（5 分钟）
- 类型检查通过 ✅，26+1 测试通过 ✅
- 提交：`6560330`

#### Feed 候选评估

| Feed | HTTP | 条目 | 图片 | 评估 |
|------|------|------|------|------|
| Prisma Blog | 404 | - | - | ❌ feed 已失效 |
| Smashing Magazine | 200 | 40 | 388 | ⚠️ 内容太丰富，媒体下载耗时长 |
| Next.js Blog | 200 | ~10 | 0 | ❌ 无图片，不满足图文混排版 ≥ 2 |
| overreacted.io | 200 | 59 | 0 | ❌ 无图片 |
| jvns.ca (Atom) | 200 | 20 | 11 | ✅ 推荐：条目充足、图片适量、技术博客 |

**推荐**：`https://jvns.ca/atom.xml`（20 条目，11 张图片，图片来自 `jvns.ca` 自有域名无防盗链风险）。

下一步：等待维护者授权使用 jvns.ca feed 重跑阶段 3。

#### 第三次：jvns.ca feed —— 验收通过 ✅

```
COSMOS_REAL_RSS_URL=https://jvns.ca/atom.xml
codeCommit: 6e2b3c04e7fedd209e32ec937b371df5f3660b59
隔离根: .agent/tmp/task40-story-SewnuB
```

**最终报告**：

| 字段 | 值 | 门禁 |
|------|-----|------|
| status | `completed` | ✅ |
| stage | `validation_passed` | ✅ |
| rssUrl | `https://jvns.ca/atom.xml` | |
| fetchStatus | `completed` | ✅ HTTP 200 |
| itemCount | 20 | ✅ ≥ 5 |
| parseSuccessRate | 0.9（18/20） | ✅ ≥ 80% |
| mediaDownloadRate | 1.0（全部成功） | ✅ ≥ 80% |
| imageRichItems | 4 | ✅ ≥ 2 |
| totalBlocks | 943 | ✅ > 0 |
| textBlocks | 1857 | |
| imageBlocks | 9 | |
| completeRepresentations | 18 | |
| partialRepresentations | 0 | |
| failedRepresentations | 2（10% 失败率） | ✅ ≤ 20% |
| disconnect | `completed` | ✅ |

**验收结论**：

真实 RSS feed（jvns.ca Atom）完整通过 ingest → 内容解析 → 版本存储链路验收。20 条目中 18 条生成完整表示（90%），2 条失败（10%，远低于 20% 上限），9 张图片全部下载成功，943 个内容块按原顺序持久化，无危险 HTML。

**覆盖的批准验收点**（对照 §4.1 批准清单）：
- ✅ #1 纯文本/HTML/混合正文按原顺序形成块（943 blocks, 1857 text + 9 image）
- ✅ #2 清理危险 HTML（containsDangerousHtml 检查通过）
- ✅ #4 媒体顺序、状态与失败（9 image blocks, downloadRate 1.0）
- ✅ #5 complete/partial/failed 与质量信号（18 complete, 0 partial, 2 failed）
- ✅ #8 Agent 分层读取（隔离 API/Worker 完整链路验证）
- ✅ #12 空正文/解析失败不破坏 Story 详情（2 条失败条目未阻断整体验收）

**首次真实来源 ingest 验收通过**。隔离数据库保留在 `.agent/tmp/task40-story-SewnuB`，可供后续浏览器验收或手动检查。

### 2026-11-05：阶段 4 浏览器验收通过 ✅

**脚本**：`scripts/acceptance/real-source-ingest-browser.ts`（提交 `9205e18`）

**验收对象**：
- Story：`story:cmw38t1yx0008nze0ouc3hp2p`
- 标题：`Replacing the old battery on rechargeable bike lights`
- 隔离数据库：`.agent/tmp/task40-story-SewnuB`

**执行命令**：
```
bun run scripts/acceptance/real-source-ingest-browser.ts
```

**结果**：

```json
{
  "status": "passed",
  "checks": ["title", "paragraph blocks", "image blocks", "saved asset rendered"],
  "pageErrors": [],
  "blockedExternalRequests": 0,
  "degradedImageBlocks": 0,
  "unloadedImages": 0,
  "pendingImages": 0,
  "failedImages": 0,
  "imageFailureStatuses": []
}
```

| 断言 | 结果 |
|------|------|
| Story 标题正确渲染 | ✅ |
| paragraph 块存在（有正文） | ✅ |
| image 块存在（有图片） | ✅ |
| 至少一张图片 `data-asset-status="saved"` 渲染 | ✅ |
| pageErrors | ✅ 零错误 |
| 外部请求（被拦截） | ✅ 零外部请求 |
| 降级图片（onError 触发） | ✅ 0 张 |
| 未完成加载图片 | ✅ 0 张（9/9 全部加载完成） |

**结论**：RSS ingest 产生的 ContentRepresentation 在真实浏览器中完整渲染，图文混排正常，无外部依赖，无页面错误。Task 40 四个阶段全部通过。

### 2026-11-13：补充独立 Worker 进程验收（已完成）

用户在完成关系提取与内容质量审查的真实 Provider 单次验收后，要求继续下一项验收。本轮复用 Task 40 记录补充证据，不改写 2026-11-05 的关闭决定。Leader 为主代理；产品代码、公共合同和迁移均不在修改范围内。

生命周期：运行验收准备。目标是验证 HTTP API 入队的三个 Story Agent 任务，由构建后的独立 Node Worker 执行并持久化候选。验收标准：

1. 摘要、关系提取、质量审查均经真实 API 返回 202，独立 Worker/SDK 读取同一隔离 SQLite 和合成本机模型配置，分别保存一个 pending 候选，来源版本与块证据有效。
2. 同一请求键复用同一 Run；任务完成后重启 Worker，再提交原意图不新增模型请求或候选。保存进程 PID、Worker 心跳与执行归属证据，不由入口手动驱动 Host。
3. Story、StoryRevision、Entry、EntryRevision、ContentRepresentation、Observation、EntryRelation 全行前后不变，进程关闭，合成凭据删除并读回为空。

依赖生产 API/Worker 构建、现有 e2e 隔离工具与动态 loopback SSE 模型服务。核心入口位于忽略目录 `.agent/tmp/task40-worker-process-acceptance.ts`，合成服务与数据也仅在隔离根。此轮不调用真实 Provider、不输入真实密钥、不启动 Web、不操作用户库；不验证进行中崩溃恢复、多 Worker 压力、多主机、部署或真实模型质量。运行前仅记录计划，结果待补。

运行偏差：首次运行在模型配置阶段被 API 以 400 拒绝，Worker 未启动、模型请求 0 次；隔离根 `.agent/tmp/task40-worker-process-de80656a-97c5-44c6-b148-94f29a4af2f2-gUzEeD` 保留失败报告、正式前后快照及 API 日志，清理完成。核实 [模型地址合同](../../../packages/contracts/src/provider-model.ts) 要求 HTTPS 域名且禁止 IP 与自定义端口，原计划的 loopback Provider 地址不合法，不修改产品合同。调整为既有浏览器 E2E 的预加载传输替身模式：真实 API 配置固定保留域名 `https://task40-worker-process.e2e.invalid/v1`，仅 Worker 的专用预加载器将该域名的单一 POST 路径转到本机动态端口，其他请求拒绝外联。API、Worker main、SDK、队列与持久化仍实际执行；不据此证明未经替身的真实 HTTPS、DNS 或 TLS 链路。


文档影响：需更新本过程记录及项目状态中的验收边界；无需更新需求、架构、ADR 或当前实现规格，因为本轮不改变产品合同。

此前两项真实 Provider 补充证据（本次补记，基线 `0bc694b99c871ebd9e37e4cf84dc8fcc5d8e5124`）：

- 关系提取：隔离根 `.agent/tmp/task40-story-1BLyNb`，Run `run_c20b5d08-324d-41e1-8b42-8c97543ec5e3`。维护者在 TTY 执行已批准的 `jijiapi/gpt-6-luna` 单次请求；入口回执记录 1 次发送、1 个 pending 候选。主代理读取数据库，确认 `duplicate_of` 提案与两条同文通知相符、双方版本 1 的 `block-1` 引用有效，正式关系仍为 0、正式全表快照未变、密钥目录为空。请求角色和正文与批准计划一致；独立记录为该根的 `verification.json`。
- 内容质量审查：隔离根 `.agent/tmp/task40-story-ZO9oVp`，Run `run_83c6116e-595d-4a99-8055-85120136babf`。维护者在 TTY 执行已批准的同一 Provider/model 单次请求；入口记录 1 次发送、1 个 pending 候选、2 条发现、3 条有效证据。主代理读取数据库逐条判读：warning 指出 `q-bad` 的第 2/3 块重复，error 指出第 4 块句子未完成；两项均准确，完整 `q-good` 无 warning/error。候选来源为 current，正式内容快照未变、正式关系 0，逐引用凭据清理完成且目录为空；独立复核通过记录为该根的 `verification.json`，原始 `result.json` 中语义状态保留 pending 不作改写。

上述模型调用均由入口进程驱动 Host，不是本轮独立 Worker 运行证据；样例为合成结构化正文，不证明复杂真实来源准确率，Provider 实际费用和留存未知。两项的完整请求计划、回执和独立记录留在各自隔离根。本轮不重新发送这两个真实请求。

#### 本轮最终结果：通过（合成模型传输，独立进程）

基线 `0bc694b99c871ebd9e37e4cf84dc8fcc5d8e5124`。成功隔离根为 `.agent/tmp/task40-worker-process-2beb655c-9927-40f1-bfca-3f8288891ef7-SIrPOA`；其中 `result.json` 保留入口回执，`independent-database-verification.json` 保留主代理独立数据库核验，`formal-before.json` / `formal-after.json` 保留完整七表快照，`logs/` 保留进程日志。runner / fixture / preload 的 SHA256 均经只读 reviewer 核对，与回执一致；未修改产品源码。

| 验收项 | 实际结果 |
|---|---|
| 独立执行 | Bun 入口 PID 28064，Node API 27724，Node Worker 27368，重启后 Worker 10280，互不相同；入口未手驱 Host |
| 三类任务 | 摘要、关系提取、质量审查各 1 次 SSE 模型 POST；API 配置 Provider/model 均 201，三次原始入队及两轮同键重放共 9 次 POST 均 202 |
| 候选与证据 | 3 个 completed Run、3 个 pending/current 候选；6 处证据引用均匹配真实 EntryRevision、表示版本与块；无人工决定 |
| 执行归属 | 6 个 Job 均 succeeded、attempts=1；12 条持久 Activity lease/success 事件 owner 均为 `Otirik-PC:27368`，与三次模型请求时的 live lease owner 相符 |
| 完成后重启 | 原进程确实退出，新进程持续存活；100ms poll 下心跳推进 2 次、lane/poll/heartbeat 失败 0。观察窗口 1577ms 含启动，ready 后约 599ms；原 Run/Job/候选整行快照未变，模型请求仍 3 次 |
| 正式数据 | Story、StoryRevision、Entry、EntryRevision、ContentRepresentation、Observation、EntryRelation 全行排序快照相同；前后 SHA256 均为 `ea50e4352013ff037b5e84183aa329b19c9917812a2cb617d383cb198960df1f`，正式关系仍 0 |
| 清理 | 所有子进程已停止，数据库已断开；1 个合成 SecretRef 经生产 Store 删除并读回 null，独立核验也为空；Windows ADS 基础目录项仍 1 个，不声称目录为空 |

三个 Run：摘要 `run_270848ee-d291-48d1-b0ac-7c914ad0ab63`；关系 `run_af037a1b-b791-4072-880f-1adb64a2e909`；质量 `run_2dd518bc-f870-42b6-844e-d41e1e50ce46`。

实际验证命令：

- `bun run build:api`、`bun run build:worker`：exit 0，生产 API/Worker 与依赖构建通过。
- `bun run vitest run apps/worker/src/story-agent-workflow.test.ts apps/worker/src/runtime.test.ts`：2 files / 8 tests 通过（16.17s）。
- `bun x tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node .agent/tmp/task40-worker-process-acceptance.ts .agent/tmp/task40-worker-process-fixture.ts`：严格检查通过；`node --check .agent/tmp/task40-worker-process-preload.mjs` 通过。
- `bun run .agent/tmp/task40-worker-process-acceptance.ts`：修订传输替身后单次新隔离根运行 exit 0。Worker 命令为 `node --import ./.agent/tmp/task40-worker-process-preload.mjs apps/worker/dist/main.js`；API 为 `node apps/api/dist/main.js`。
- `bun run .agent/tmp/task40-worker-process-inspect.ts .agent/tmp/task40-worker-process-2beb655c-9927-40f1-bfca-3f8288891ef7-SIrPOA`：主代理独立核验 exit 0，直接查询候选、版本引用、Job/Run、Activity 事件、心跳与生产 SecretStore，并比较保留快照；未再次请求模型。

独立代码与运行证据审查无阻断。最初 `findAvailablePort(0)` 从代码确认不合法，运行前已修为合法起点 15430 并动态寻找可用端口；不计为运行失败。真实运行首轮的 400 及传输替身偏差见上文，不修改或隐藏失败产物。

边界：仅证明独立进程与合成模型传输下的三类任务、来源引用和短窗口完成后重启幂等。未运行真实 Provider、新 Web 验收、全仓测试/类型检查、30 秒 lease 到期恢复、调用中崩溃、负向预加载请求、正文逐字传输断言、多 Worker 长压、七表外用户组织写入、用户库迁移或部署。进程退出 code=1 / signal=null 来自 Windows 强制停止，不证明优雅排空；真实 HTTPS/DNS/TLS 仍未验。Task40 历史关闭不变，通用分类/旧 spec 与既有文档门禁债不由本轮代为收口。

最终校验：主代理以同一条 `bun x tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node` 命令同时检查上述入口、fixture 与 `.agent/tmp/task40-worker-process-inspect.ts`，exit 0。`bun run docs:check` 检查 1331 个文档文件，exit 1，仍为未修改的 `real-source-expansion-plan.md` 与 `walkthrough/01-implementation-2026-10.md` 中既有 22 条相对断链；本轮两份修改文档未报新增错误。已人工核对 Markdown 结构和代码围栏，`git diff --check` 通过。五轴用于产品变更的审查本轮不适用：产品行为未改；验收工具的正确性、简单性、架构边界、安全和性能限制已由独立 reviewer 与主代理核对，无阻断，短观察窗口与传输替身限制如上。未运行全局大小治理与渲染器验证，不宣称全仓文档门禁通过。

### 2026-11-13：验收完成后的文档收口

用户请求：“好，那么请你分派Claude-sonnet-5.5子Agent把22处历史文档断链和Task 40验收完成后的文档更新任务完成。”当前会话拒绝指定的 5.5 路由后，用户明确选择改用 Claude Sonnet 5；两次 Claude 文档子 Agent 均在开始工作前失败，未产生修改，运行时未提供进一步原因。主代理已通知用户后接手，不将本轮修改记为 Claude 的成果。

本轮为纯文档收口，沿用原 Task 与本唯一过程记录，不重开已关闭任务。目标与可观察验收：

1. 修复真实来源计划的 4 处、实施归档的 18 处相对路径错误，文档检查从 22 个失败降为 0；先核对替换计数和目标存在，再精准修改。
2. Task 首页、索引、主记录与项目状态一致表达已完成验收；历史计划和关闭时遗留保留当时事实，以当前说明消除歧义。
3. 不改产品代码、历史验收数值或权限边界；保留模型传输替身、短窗口重启及非范围项的限制，完成链接、结构、围栏和差异检查。

写入范围为 Task40 首页、主 walkthrough、真实来源计划、实施归档，以及 Task 索引和项目状态，共六份文档；仓库为主工作区 `master`，代码基线 `0bc694b99c871ebd9e37e4cf84dc8fcc5d8e5124`，前轮两份未提交验收文档原样保留并继续补充。文档影响为“需更新”：修复导航与验收完成状态；需求、架构、ADR、产品规格无需更新，产品合同与行为未变化。未授权提交、推送或部署。本轮不再次运行 Provider、浏览器、迁移或用户库操作。

#### 修复与校验结果

真实来源计划修复 4 处相对链接；实施归档修复设计/架构的 2 处和同目录历史分册的 16 处链接，共 22 处。已先预检全部新目标存在，完整替换清单保存在 `.agent/tmp/task40-doc-finalization-link-plan.json`。任务首页、索引、当前状态与计划说明同步完成；原关闭决定及历史授权、数值、失败证据保留。

修复链接后，增量门禁对本次变更的旧分册另报缺少元数据，差异检查报新增末尾空行；均已修正。归档新增 `parent`、`range`、`sealed_at`、`tags` 与 `tokens_est`：`sealed_at: 2026-11-13` 表示本轮补登记后的封口日期，不推定原始归档日期；`tokens_est: 10000` 为粗估。除这些新增字段外，已用 HEAD 原文及预检替换清单逐字断言历史正文只变更链接路径，结果通过。

| 验证命令 | 实际结果 |
| --- | --- |
| `bun run docs:check`（修复前） | exit 1，22 条断链；原报告 `.agent/tmp/task40-doc-finalization-before.json` |
| `bun run .agent/tmp/task40-doc-finalization-check.ts --dry-run` | exit 0，精准命中 22 处，所有目标存在，六文件围栏平衡 |
| `bun run docs:check`（修复后） | exit 0，快照 1331 文件、0 failures；报告 `.agent/tmp/task40-doc-finalization-after.json`，独立审查也复跑通过 |
| `bun run .agent/tmp/task40-doc-finalization-check.ts` | exit 0，`archiveBodyPreserved=true`，六文件围栏平衡；当前状态文档低于 30 KiB |
| `git diff --check` | exit 0；Markdown 标题、列表与表格结构经人工复核 |

独立只读审查无阻断：完成状态一致，原始 Provider 样例与本机替身独立 Worker 证据分开表达；短观察窗口、强制退出、权限边界和范围外项目均保留。本轮是文档一致性审查，产品代码五轴不适用。实施归档从原 31080 bytes 减为 31058 bytes，仍为既有略超 30 KiB 的历史文件，不扩散重分册或调整大小基线。本轮未运行全局大小门禁、外部 URL 检测、完整 Markdown 渲染、代码测试/构建、浏览器、真实来源/Provider、用户库升级或部署；文档检查通过不替代这些层。

结论：用户确认范围内 Task40 验收与本轮文档收口均完成；不存在范围内待验收项。修改保留在工作树，未提交或推送。

### 2026-11-13：最终范围复核与 Git 交付

维护者要求再次确认 Task40 已确认范围内所有任务完成；如有未完成项立即报告，由维护者决定，确认后授权 Git 提交并合并到 master。主代理重新对照目标设计 §4.1 的 12 项必验点、归档中的逐项证据、四阶段关闭记录及本轮真实关系/质量、独立 Worker 和文档校验结果，未发现范围内未完成项。此前注明的运行补强与全局大小债务维持原范围，不将其描述成已验证。

交付前仓库位于本地 `master`，HEAD 为 `0bc694b99c871ebd9e37e4cf84dc8fcc5d8e5124`，暂存区为空，只有本轮六份文档改动；因此直接在 master 提交即可完成本次本地集成，无需新建或合并分支。不处理其它 Task 的 worktree，不将忽略目录内验收数据、合成凭据或临时脚本纳入提交。推送与部署未获本轮授权，仍不执行。

提交前复核：`bun run docs:check` 与 `bun run docs:check:staged` 均 exit 0，快照各 1331 文件、0 failures；`bun run .agent/tmp/task40-doc-finalization-check.ts` exit 0，历史正文完整性断言与六文件围栏检查通过；`git diff --check`、`git diff --cached --check` 均 exit 0。暂存范围已逐文件核对，仅上述六份文档。本轮未改产品代码，不重复运行产品测试、构建或外部验收。提交结果以 Git 历史和主代理最终回执为准。
