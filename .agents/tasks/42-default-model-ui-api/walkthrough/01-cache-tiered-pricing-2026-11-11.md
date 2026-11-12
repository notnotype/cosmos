---
parent: .agents/tasks/42-default-model-ui-api/walkthrough.md
range: 缓存价格与整请求阶梯计费及 2026-11-11 本地提交/合并记录
sealed_at: 2026-11-12
tags: [task, pricing, walkthrough, archive]
tokens_est: 7600
---

# Task 42：缓存价格与整请求阶梯计费

状态：**四类价格、USD/CNY 与整请求阶梯计费实现及本轮隔离验收完成**。Task 42 继续覆盖模型配置、调用费用与 Web 消费；前轮已完成证据保留在 [README](../README.md)，本轮过程与验证唯一记录于本文。此前执行器故障与失败尝试保留为时间线，最终结果见下方收尾结论。

用户原话：

> 参考截图，修改价格计算相关代码，需求调整如下：
> 1.用户配置时需要填写：输入价格、输出价格、缓存写入价格、缓存读取价格（ChatGPT部分模型设置了阶梯计费，阈值是272K上下文，计费是按整次请求判定层级，不是只对超过272K的部分收费。只要输入达到272,001 Token，整单就按高价档计算 ）。
> 2.后端修改表结构，新增缓存写入价格、缓存读取价格、是否有阶梯计费、阶梯计费阈值。（如何保存阶梯计费价格？）
> 3.后端修改新增模型API参数，前后端保证功能正常。

维护者确认：支持 USD/CNY 每模型币种、不换汇；普通档四价必填，可选阶梯保存完整高档四价与阈值；总输入大于阈值才整请求切档，272000/272001 分别为低档/高档；旧调用费用不重算。确认创建 `feat/t42-cache-tiered-pricing` 分支、复用本 Task 和下述三个公开验收边界。

## 目标与边界

1. 创建/编辑/读取能完整保存四价、币种、开关、阈值和高档四价，缺项拒绝，0 合法。
2. 调用实际费用区分普通输入、输出、缓存写入、缓存读取；按输入总量统一选档，无重复缓存计费；持久费用刷新与改价不重算。
3. 浏览器能配置/修改并回填价格；API、Worker、前端合同一致，隔离迁移与公开边界验证充分。

非目标：自动汇率、任意多档、预算与结算账单、真实 Provider 外呼、生产数据库迁移或部署。实现阶段未获 commit/push/merge 授权，前轮授权不延伸新需求；随后本地提交与合并的单独授权见文末交付记录。仅使用隔离 SQLite 和 fixture；不访问用户数据。

## 工作区与所有权

- repository/worktree：`D:/Otirik/Workstation/cosmos`；branch：`feat/t42-cache-tiered-pricing`；base：`ad4c3c44129531d9673c964b436bdada4ec4ed30`。
- 开始前 status 为 master，仅原有未跟踪 `CON`；fetch 成功，再创建已授权分支。`CON` 不暂存、不删除。
- Leader 唯一维护本 walkthrough 与 Task README；公共 DTO/schema/migration 交单一后端 writer；前端、E2E、文档独立不重叠写入。每名 writer 开始前登记精确 write-set 和隔离测试根。
- 文档影响：**需更新**。改变持久模型价格、公共创建/更新/查询 DTO、调用 usage/cost 与 Web 表单；专职文档代理先写原话、已接受提案和目标架构/API Draft，完成后更新当前 spec/项目状态。

## 已接受方案与仍需核对项

- 两档各四个显式 Decimal 价格列，另存 USD/CNY、阶梯开关、阈值；避免两档需求引入泛化价格表或隐式 JSON。
- 启用时阈值与高档四价必须齐全，关闭时阈值/高档为空；默认开启阈值为 272000。价格修改整组原子提交，名称/预算等修改保留原价。
- 旧模型保留已有两价，缓存单价未知、币种 USD、阶梯关闭；若缓存用量为 0 则可按原两价算费，非零且缺价时省略总费用，不伪造 0。
- 新 usage/cost 缓存分项可选，以兼容旧候选 JSON；新运行提供完整分项，总费用包含四项；历史已存费用不改写。
- SDK 已核对：`bun pm ls --all` 通过包管理器确认 pi-ai 0.55.4；已核对该发布版 Completions/Responses 映射（普通 input = raw prompt − cacheRead、cacheWrite = 0），总输入为三类之和，不含 output。未直接读取 node_modules 或锁文件。

## 实施顺序与公开验收

1. 核对 SDK 统计口径，冻结 DTO、持久化和计算合同；专职文档写接受方案。
2. 后端逐个公开边界 RED→GREEN：配置 API/仓储（含旧库升级）、实际 invocation output；272000/272001、全四项切档、零/未知、双币种与历史读取。
3. 前端创建与就地编辑、价格摘要及实际缓存费用；E2E 通过离线 HTTP/Worker/browser 验证保存回填和调用费用。
4. 独立复审、聚焦/全仓/类型/构建及文档门禁；每层分别报告，不以 mock 或局部绿灯替代整个闭环。

- 配置后端 `2f78e5c7` 接替 `5939c843`，单写公共 DTO、模型应用服务/快照、Prisma schema 与新增迁移 `20261111080000_task_42_cache_tiered_pricing`、配置/默认模型/Resolver 投影及对应行为测试；SQLite 根 `.agent/tmp/t42-cache-tiered-pricing/<uuid>/`。旧 writer 只交接两个合同文件后停写，无并发重叠。
- 实际计费 `0a75ff13` 接替未写入的 `edf46e6a`，仅 `packages/agent-pi-ai/src/invocation-v2{,.test}.ts`，内存 fake-client 公开 invoke seam；不与 schema/types writer 重叠。
- React `4a42fb2c` 接替未写入的 `7a5030c7`，仅 apps/web 创建/编辑/摘要/费用组件、copy 和前端测试；E2E `e7635857` 接替未写入的 `7ac5ef5c`，仅 Story/default-settings/new model-pricing browser、model-configuration Lab 与 Worker fetch fixture。文档 `96d3555b` 仅授权 docs，先完成原话、accepted 提案、架构/API 目标，并将项目状态标为本轮进行中，业务未完成前不改 spec 为当前事实。

## 阶段证据

- 合同/应用聚焦：provider-model 12、agent 8、configured-models 7，合计同轮 27/27 通过。前置 RED 已证旧两价/半组 PATCH 不满足新合同；contracts typecheck 通过。application typecheck 暂定位旧 system-config 测试快照缺新增默认字段，授权仅更新测试数据，待复跑。
- 实际计费公开 invoke 首 RED：9 tests 中 1 failed / 8 passed；SDK 三类输入分项未公开、总量未重建。逐片补 SDK 计数、CNY 字面费用、未知缓存价、阈值和非法配置；最终 `bunx vitest run packages/agent-pi-ai/src/invocation-v2.test.ts` **24/24 passed**（1.09s），`bun run typecheck:agent-pi-ai`、两文件 diff check exit 0。writer 停写，独立预审 `2da6f341` 只读核对。完整调用链仍待浏览器，不把 fake-client 测试写成真实外呼。
- 浏览器 `bunx playwright test --config playwright.config.ts --list story-agent-generation.spec.ts default-model-settings.spec.ts model-pricing.spec.ts` 收集 5 tests / 3 files，exit 0；只是收集，未启动服务，后续新增 UI 用例仍需重新收集与实际运行。
- 前端草稿行为首 RED 9 failed / 16 passed（四价新要求和旧测试数据），修正后同范围 **25/25 passed**；模型字段组件已落，编辑入口/摘要/费用 UI 仍在施工，尚无最终 Web 类型或浏览器结果。
- 文档先行检查仅报告 Task 40 的 22 条历史断链；完整代码/浏览器/隔离迁移验收尚未完成。新增范围不能沿用前轮 229/1411 等结果。

原角色仅暴露旧写入工具、与运行规则不兼容，改为继承 published CAS 工具的执行上下文后推进；不以 shell 写文件替代授权文件工具。

## 独立审查与边界修正

固定点 `ad4c3c44129531d9673c964b436bdada4ec4ed30`，HEAD 未新增提交；本轮检查工作区 `git diff <base> --` 并单独读新增文件，不能使用空的 `<base>...HEAD` 作为已审依据。两个 fresh 子代理分别运行 Standards / Spec 轴，未修改源文件。

- Standards（`7f63e68c`）：1 项 Required 测试缺口，模型编辑冲突分支缺真实旧版本回归。E2E writer 在新 pricing browser 用公开 HTTP 产生旧版本，验证 409 保留草稿、无自动重试、取消重载不丢稿、确认重载后使用新版本保存。独立静态复核已关闭该缺口；首轮真实浏览器中该完整冲突用例已通过。无确认的 heuristic 问题。
- Spec（`c9c69e87`）：P2 无缓存预估错误要求旧模型缓存价格已知；P3 摘要缺关闭状态、全价未知时缺币种。React 仅重开成本/摘要的实现与测试，普通无缓存预估只要求 input/output，enabled 仍要求完整高档；摘要始终显示币种和开关。新增行为先 RED，再 **42/42 passed**，Web 类型与四文件 lint exit 0；独立静态复核两项均已解决。未确认其它价格计算或历史重算问题。
- 真实持久边界又发现 Prisma Int 无法读回 API 接受的最大安全整数阈值（P2023）。内部改 `BigInt?` 并在写入转 BigInt、公开投影转 number；SQLite 新列也必须声明 `BIGINT`，仅改 schema 而保留 `INTEGER` 仍 RED。仅修改本轮尚未应用的新迁移，不改旧 43 次迁移。SQL 修正后 5 files / 16 tests（含最大安全整数 CRUD/metadata-only/JSON 与默认模型和 resolver）和五项类型检查通过；追加 PRAGMA `BIGINT`、nullable、无默认值断言也在后续 6 files / 23 tests 中通过。

## 首轮全仓结果与收尾

- `bun run typecheck`：所有包与 API/Worker/Web **exit 0**。
- `bun run test`：**230 files，222 passed / 8 failed；1446 tests，1424 passed / 22 failed**，286.50s。首轮采用修正前 SQL 快照触发已定位 P2023；另外命中旧验收脚本未传四价、API 迁移数仍 43、隔离删除夹具类型数据不完整及四处新增文案未集中。已按实际失败分别窄派 Node 与 React，不放松创建必填、测试断言或文案基线；修复后需复跑。
- API 与 Worker 及所有依赖包 `bun run build:api && bun run build:worker` **exit 0**；最初在阈值类型调整前启动的旧构建由 Leader 主动取消（killed exit 1），不能当编译失败或最终构建证据。
- 文档尺寸正确命令 `python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` exit 1：唯一违规仍是未修改的 Task 40 封口历史册 30.35 KB / 约 9.9k token，另 CONTEXT 既有基线增长 warning；本轮文档无新违规。此前文档代理遗漏 baseline 的命令只报参数错 exit 2，不作为尺寸结果。代码尺寸门禁与浏览器运行结果见下方，不能将全局既有门禁债务写作本轮全部通过。

## 最后收尾与运行阻断

- Node 补齐旧验收辅助代码的显式四价、API 44 次迁移审计和隔离删除夹具真实合同类型。`bunx vitest run scripts/acceptance/story-agent-runner.test.ts scripts/acceptance/story-body-runner.test.ts .agents/tasks/39-pi-ai-adapter/product-flow-acceptance.test.ts apps/api/src/model-provider-storage-integration.test.ts packages/storage-prisma/src/model-provider-removal-integration.test.ts packages/storage-prisma/src/configured-model-pricing-migration.test.ts`：**6 files / 23 tests passed**，58.59s；随后 `git diff --check` exit 0。Story isolation 保留不可变旧 43 次迁移基线 `7ca568a91c57fba7bd8256727662936143b63a14`，只白名单覆盖当前 schema 和本轮 44 SQL；隔离根 manifest 记录真实 working-tree 来源与 SHA，不能声称旧提交已经包含新结构。
- Web 集中文案检查实际抓出四个组件新增内联文案，全部迁入既有 copy owner，不改扫描器/基线。最终 `bun run test -- apps/web/src/copy/messages.test.ts apps/web/src/components/cosmos/provider-model-draft.test.ts apps/web/src/components/cosmos/model-details.test.ts apps/web/src/components/cosmos/story-panel/story-generation-cost.test.ts apps/web/src/components/cosmos/story-panel/agent-candidates.test.ts apps/web/src/components/cosmos/default-model-settings.test.ts apps/web/src/component-lab/agent-candidate-fixture-api.test.ts`：**7 files / 90 passed**；`bun x tsc -p apps/web/tsconfig.json --noEmit` 及变更文件 lint exit 0。
- 代码全局尺寸门禁 `python scripts/size-governance.py -c code tests --check --baseline docs/doc-governance/code-baseline.json --fail-on-new` exit 1，共 56 项。大多为未改存量；本轮引入的 draft 从 387 到 449 行跨警戒已按 Provider 表单职责拆分，原入口 371 行、新 helper 91 行，公开导出保持，draft/copy **30/30 passed**、Web 类型/lint/diff exit 0。旧 section 从 528 降至 487 行仍报既有警戒，不继续扩任务重构；最终全局尺寸复跑未执行，不能直接声称修后门禁全绿。
- 浏览器首跑 `COSMOS_E2E_WEB_PORT=4174 bunx playwright test --config playwright.config.ts e2e/browser/model-pricing.spec.ts e2e/browser/story-agent-generation.spec.ts e2e/browser/default-model-settings.spec.ts`：**4/6 passed**，含完整 CNY→USD/零价/关档、真实版本冲突恢复、HTTP 原子验证、旧成本不随改价重算。272000/272001 两例的 HTTP cost 均已通过独立字面值断言（0.272005 / 2.72006 CNY），仅 UI 固定标题 1 的定位失败；已改用对应公开 candidate 的 proposal title 精确定位，不改费用预期，真实重跑未执行。Web production build 在此栈内 exit 0，API URL 绑定该隔离栈。
- Lab 首跑 `bunx playwright test --config playwright.component-lab.config.ts e2e/component-lab/model-configuration.spec.ts`：**9/12 passed**，三例因 provider 名同时出现在外层和模型子行，旧 locator 变成三处匹配。已改按公开展开按钮定位唯一外层 provider 行；已补齐每次 preview 隔离的 typed create/get/update fixture，保留旧未知缓存，支持新用例创建/编辑/回填。该新增 fixture 的真实交互重跑未执行，90 项聚焦测试不替代它。
- 第二次 `bun run test`：**230 files：202 passed / 28 failed；1446 tests：1408 passed / 38 failed**，758.22s。最后仍有 Task 39 @2 smoke 使用旧 43 次迁移结构而配置失败，其余大量用例在后期出现 60s 超时、临时 SQLite EBUSY/ENOTEMPTY。故障与新命令执行器失效发生在同一期间，尚未证明因果，不能一律归为业务缺陷或一律归为环境问题。完整后半输出见本机会话 spill `27b5777faca2-job_output.txt`，不可作为仓库内稳定链接。
- @2 smoke 必要兼容修正已写未验证：共享 harness 仅新增显式 opt-in，默认 @1 冻结 43 路径/断言保持；@2 两个准备入口才叠加本轮 44，独立目录保留原 snapshot，manifest 披露 base commit、固定迁移名、两文件真实 SHA。real-v2 校验 manifest 与副本 hash，保留 TTY、URL、单次传输与秘密边界。40 项 smoke、最终全仓和该最后差异检查均未执行。
- 父会话、Node 与测试子代理各自正常 Bash 启动均遇 `EXECUTOR_UNAVAILABLE`：准备私有 niubash/winuxcmd 的 awk/od 硬链接失败，明确 **No command was executed / effects:none / retry:never**。不换 shell、提权或清理运行时缓存。只读插件清单确认现有 dsh-ops 0.5.2；未更改插件或升级。所有本轮后台 job 已收结，未主动终止未知服务；最终只读端口释放确认也被执行器阻断，不能声称已实测清空端口。
- 文档已同步当前合同、API、HTTP client、Web、架构、[ADR-0032](../../../../docs/adr/0032-model-cache-tiered-pricing.md) 与[项目状态](../../../../PROJECT-STATUS.md)；`bun run docs:check --base ad4c3c44129531d9673c964b436bdada4ec4ed30` 先前仍恰 22 条 Task 40 历史断链，新增 ADR/最终小改后未复跑。未提交、推送、合并、部署或迁移用户数据库；没有真实 Provider 外呼。

## 自动续轮 1：恢复后的实际验证

执行器一度恢复，已取得以下新证据，不能再以此前“全部命令受阻”描述当前结果：

- `bunx vitest run .agents/tasks/39-pi-ai-adapter/connection-smoke.test.ts`：**40/40 passed**，33.12s，确认 @1 冻结 43 与 @2 显式 44 overlay 共存；无真实外呼。
- 剩余验收第 3 条精确 browser 命令：**6/6 passed**，56.7s；Web 生产重建成功，272000/272001 的 HTTP 与页面费用、真实冲突恢复、改价后旧账不变均通过。
- `bun run typecheck && git diff --check`：**exit 0**，包括最后所有 schema/helper/fixture 修改。
- 剩余验收第 4 条 Lab 命令：**11/12 passed**，29.7s；新增四价创建/编辑/回填已通过，唯一剩余旧断言仍要求 `65536 / 8192`。测试工程师只读确认新共享摘要显示独立字段，Leader 用 CAS 将其改为同一模型行的两个字面断言“上下文窗口：65,536 tokens”“输出上限：8,192 tokens”，不删值验证；等待完整 Lab 再跑。
- 最后 overlay 窄只读复审（`b88712de`）没有确认的新阻断问题。对准备后基础 SQL 副本完整校验提出低优先级留档建议；real-v2 不会重新执行这些副本，实际调用使用已准备数据库，不为此扩展通用防篡改协议。审查无法读取旧 diff 的限制保留，不能声称逐行旧版本独立比较。
- `bun run docs:check --base ad4c3c44129531d9673c964b436bdada4ec4ed30`：仍恰 **22 条未修改 Task 40 历史断链**，本轮新增 ADR/Proposal/Task 的路径、锚点、metadata、空白未报告新失败。
- 两条 size 门禁后台启动再次在私有 runtime 的 getconf/dircolors 硬链接准备时失败，**未执行命令**，不以旧门禁结果伪装最终复跑。全仓测试已单独启动（`bun run test`），先前超时用例在本轮前段通过；未结束前不写全仓通过。

## 已执行的最终验收命令索引

以下命令已在本轮恢复后执行，最终结果见下一节。浏览器与 Lab 共享 `.next`，按顺序分别运行；完整单元回归也单独运行，未放宽现有超时和独立费用断言。

1. `bunx vitest run .agents/tasks/39-pi-ai-adapter/connection-smoke.test.ts`，确认 @1 旧冻结和 @2 新 overlay 共存；再运行 `bun run test`，独立诊断仍失败的超时/锁文件，不直接增加超时。
2. `bun run typecheck` 与 `git diff --check` 核验最后测试/夹具修改；此前完整类型和 API/Worker 构建已通过，若生产源再改按依赖重建。
3. `COSMOS_E2E_WEB_PORT=4174 bunx playwright test --config playwright.config.ts e2e/browser/model-pricing.spec.ts e2e/browser/story-agent-generation.spec.ts e2e/browser/default-model-settings.spec.ts --output=.agent/tmp/t42-cache-tiered-pricing/browser-final-results`，让既有 stack 按精确 API URL 重建 Web；不要复用未知 4173 服务。
4. 上一步结束后 `bunx playwright test --config playwright.component-lab.config.ts e2e/component-lab/model-configuration.spec.ts --output=.agent/tmp/t42-cache-tiered-pricing/lab-final-results`；核对自建 4174/4380/3300 正常释放，不处理未知 PID。
5. `bun run docs:check --base ad4c3c44129531d9673c964b436bdada4ec4ed30`、上述 docs/code 两条 size 命令及最终 diff；单列存量断链/尺寸问题，没有修改基线或封口历史来消除旧告警。

## 实现验收收尾结论（2026-11-11，提交前）

本轮目标完成：四价创建/编辑/读取与完整价格组 PATCH、USD/CNY、可选完整高档及阈值、总输入严格超阈值后整次四项同档、缓存实际费用与历史快照、页面回填/冲突恢复及稳定规范均已落地。旧 cache 未知保留未知，不对用户数据库做迁移或历史费用回填。

| 验证层 | 最终实际结果 |
| --- | --- |
| `bun run test` | **230 files / 1446 tests passed**，284.28s，exit 0；此前失败的超时/锁用例本次全部通过，未修改超时 |
| @1/@2 smoke 聚焦 | **40/40 passed**，33.12s；同样已包括在全仓结果中，不能相加为新总数 |
| `bun run typecheck && git diff --check` | 所有包及 API/Worker/Web 类型与差异空白 exit 0 |
| API/Worker/共享包 build | `bun run build:api && bun run build:worker` exit 0；后续只改验收夹具和测试，无生产后端源变化 |
| 离线真实浏览器 | **6/6 passed**，56.7s；当前 Web 在隔离 stack 内生产构建 exit 0 |
| Component Lab | **12/12 passed**，17.8s；CNY/高档创建编辑回填与键盘、平板、删除等均通过 |
| 变更 Web lint/聚焦 | 前述 7 files / 90 tests、Web 类型和变更文件 lint exit 0；最终 E2E 单字面断言调整由完整 Lab 回归验证 |
| 全局代码尺寸 | 最终正确命令 exit 1，**55 项存量违规**；本轮 draft 新跨线已消除（371 + 91 行）。仍命中的 section 原 528→487，smoke test 原 468→471，基线时已越 400；其余告警不在本次改动范围 |
| 全局文档尺寸 | 最终正确命令 exit 1，仍仅 **Task 40 历史册 1 项**，另 CONTEXT 既有 warning；本轮文档无新增告警 |
| 文档链接/结构 | 最终检查仍 **22 条 Task 40 旧断链**；本轮变更无新增失败，最终状态改写后再次复核 |

测试服务完成后只读 `netstat` 核对 **4174、4380、3300 无 LISTENING**；未杀未知服务、未触碰旧 `CON` 文件。所有本轮命令 job 已收结，文档和源码代理已停止写入。

Standards 的真实冲突流程测试缺口、Spec 的旧缓存价未知预估和摘要币种/开关缺失均已修复并通过对应真实/聚焦验收。最后验收 overlay 窄复审未确认新阻断问题；独立 diff 可见范围的限制及低优先级留档建议已如实记录，不将建议扩大为无需求的安全框架。

当前 [项目状态](../../../../PROJECT-STATUS.md)、API、公共合同/HTTP/Web spec、架构、已接受 Proposal 与 ADR-0032 已同步最终行为和验证边界。**实现验收结束时尚未 commit、push、merge、创建 PR、部署或运行用户数据库迁移；未执行真实 Provider 外呼、真实来源验收或远端 CI**。全局历史文档/尺寸债务未混入本次功能完成范围。

## 本地提交与合并授权（2026-11-11）

维护者随后明确要求：“提交和合并本轮改动”。本次交付限定为提交 `feat/t42-cache-tiered-pricing` 上已验收的价格功能、测试、迁移定义及文档，并快进合入本地 `master`；不包含 push、创建 PR、部署或应用用户数据库迁移。

授权后重新核对：当前功能分支与本地 master 均为 `ad4c3c44129531d9673c964b436bdada4ec4ed30`。`git fetch origin` 成功，`git rev-list --left-right --count master...origin/master` 为 `7 0`，无须引入新的远端代码；当前工作区没有额外已跟踪改动或预存暂存内容，本轮文件清单与验收时一致。仅补充本节及项目状态的授权措辞，生产代码和测试保持已验收内容；不因提交重复运行已通过的全仓测试。

交付使用明确文件清单暂存，不使用 `git add -A`；旧无关 `CON` 保持未跟踪、不读取、不纳入提交。提交后以 `git switch master` 和 `git merge --ff-only feat/t42-cache-tiered-pricing` 完成本地合并，核对两分支提交及文件树一致。提交身份、合并结果和工作区剩余内容以 Git 历史及本次交付回复为准；本节记录授权和执行边界，不预写尚未取得的提交哈希。
