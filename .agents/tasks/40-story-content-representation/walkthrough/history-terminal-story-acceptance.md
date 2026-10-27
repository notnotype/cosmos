# Task 40 历史：受控与真实 Story Agent 验收

返回[当前 walkthrough](../walkthrough.md)。下文记录已完成的终端验收步骤；请求授权只覆盖当次，不能复用。

### 2026-10-27：受控 Story 终端入口准备

独立审查修复已提交 `c9b57b8`；本步只准备入口并离线验证，真实请求仍未授权。实现放在 `scripts/acceptance/`，复用既有产品 Provider/模型/连接配置、durable Host、Worker @2、pi-ai SDK 与 Task39 已验证的单次传输和 TTY 无回显守卫；不复用 Task39 旧数据库/迁移快照或其真实请求授权。

1. 当前提交的 schema/migration 冻结到新隔离根，显式 Prisma datasource 不受继承 DATABASE_URL 影响；固定合成 Story，无来源/媒体/工具，summary-only。请求计划含完整消息、模型/地址、512 输出 token、60s、最多一 POST，无自动重试或 redirect。
2. 离线经真实 SDK + 受控 SSE 传输，验证幂等入队/完成产生一个 pending，正式 Revision 不变，再明确拒绝仍不变；异常响应/断网/第二次发送拒绝均不外连，失败无自动重试，输出只留固定状态与计数，不保存 Provider body。
3. 凭据仅在真实 TTY 无回显读取；记录全部新 SecretRef，在成功/配置失败/调用失败清理它们并断开 DB，清理失败必须报告。凭据不放聊天、命令参数或环境变量；CLI 二次确认完整计划后才读凭据。离线通过后本地中文提交，再披露准确请求、费用未知及本地执行限制等待新的逐次确认。

### 2026-10-27：受控入口离线结果与复核

- 入口仅在 `scripts/acceptance/`，schema/migration 冻结 `c9b57b8ac2de67163083ff301bc3ed85cdd2cb32`，新根显式 datasource。合成 Story 经真实配置 owner/Host/Worker @2/SDK；同键重放仅一 Run，正常只产一个 pending，拒绝前后正式 Story/Revision 均不变。无生产合同/迁移变更。
- 正常、非法输出和断网传输全部离线；固定 URL/单 POST/禁 redirect，消息、512 token、无 tools 与 Bearer 在发送前校验。结果只留安全计数，合成 DB 留校验后输出，不记 HTTP body/头或原始错误。新 SecretRef 写前登记、finally 删除验证并断开；引用在本入口映射 SHA-256 文件名，避免 Windows 冒号导致 NTFS alternate stream，临时文件仍是明文。
- 独立首审 Required：声明截止却未强制；Optional：准备失败根残留。Leader RED 分别见 pwsh-41f32db2544048a9（短预算延迟仍完成）、pwsh-36e97ee4b4d04cea（失败根存在）。修复：单调时钟/定时器、联合取消/abortActive、轮询及传输 signal race，守卫保持到 SDK 收尾；准备失败 close 后校验新根绝对父级/前缀再删。500ms delayed/never 均超时清理；准备及取消收尾不承诺总 60s。
- 已批准 `jijiapi/gpt-6-luna` 独立审查者先读测试再读实现，亲自 `bunx vitest run scripts/acceptance/story-agent-runner.test.ts`：7 项通过/测试 55.21s。Required/Optional 均关闭，五轴未报新 finding，不等于真实 Provider 通过。

| 命令 | 本轮实际结果 |
| --- | --- |
| `bun run vitest run scripts/acceptance/story-agent-runner.test.ts` | 7 项通过，测试 55.52s/总 62.48s，pwsh-6d0ca2862c19488f；正常、非法、断网、配置写后失败、准备失败、延迟/永不返回。 |
| `bunx tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --esModuleInterop --skipLibCheck --types node scripts/acceptance/story-agent-runner.test.ts scripts/acceptance/story-agent-acceptance.ts` | 同上 job，严格类型通过，exit 0；覆盖默认包检查之外的新脚本。 |
| `bun run test` | 205 文件/1165 项通过，183.85s，pwsh-c3344693051d418e。 |
| `bun run typecheck` | 同 job 串行，全仓通过，已收集 exit 0。 |
| `bun run scripts/acceptance/story-agent-acceptance.ts --plan` | 只打印固定完整请求与 schema commit，exit 0，pwsh-2c959e40ab6c4b47；不读凭据/建库/联网。 |
| `bun run scripts/acceptance/story-agent-acceptance.ts` | Harness 非 TTY 下按预期 exit 1，只有固定安全错误；没有确认/凭据输入或网络请求。 |
| `bun run docs:check`、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` | 1204 文件/0 失败，大小门禁 397 文件 PASS、5 项既存 warning，pwsh-4b78d921282640cc/exit 0；最初主记录超 token，已将完成演进记录 5,675 字节原文分册，仅规范分隔换行，不改预算。 |

零真实 Provider 发送，无用户凭据/数据/goal/push/新分支/worktree/部署。未跑浏览器、属性或 Node 进程 E2E、真实来源/Agent、用户库升级，入口不等于真人 TTY 或产品浏览器验收。下一步另披露完整 `--plan`、费用/留存未知与本地明文/强杀残留风险，逐次获授权后才由维护者在干净工作区真人 TTY 执行；Harness 无该 TTY，不收聊天/环境变量凭据。信心 B，Task40 active；本步按授权本地中文提交。

### 2026-10-27：单次真实 Story Agent 验收

本轮只收集维护者本地终端结果、只读核对固定计划/安全结果及凭据目录文件清单，更新摘要并按既有逐步中文提交授权收口；不重新执行入口、不新增模型请求、不读取 DB/凭据/原始响应或清理产物。基线 `d1acdf522a4c979c9b04068ee9aa878a830bd1fd`，核对前工作区干净。

- 授权链：维护者先运行 `bun run scripts/acceptance/story-agent-acceptance.ts --plan` 并贴回完整消息（会话 m05907）；解释固定 endpoint/model、合成文本、最多一次 POST、512 输出 token、60s 生成预算及未知费用/留存、本地明文与强杀残留风险后，在问题 `task40_one_real_request` 明确选择“批准这一次请求”。只批准该计划，不授权失败重跑。随后维护者在真人 TTY 执行 `bun run scripts/acceptance/story-agent-acceptance.ts`，返回固定报告（m05915）。凭据未进入聊天。
- 真实目标 `https://api-slb.jiji.cc/v1/chat/completions`、`jijiapi/gpt-6-luna`，summary-only 合成图书馆 Story，无来源/工具。产物根 `.agent/tmp/task40-story-3AImPn`；Leader 亲自读取 `request-plan.json` 与 `result.json`，前者与已披露消息及预算一致，后者为 `status=completed`、`stage=verified`、`transportSends=1`、`pendingCount=1`、`decision=rejected`、`formalUnchanged=true`、`secretCleanup=completed`、`disconnect=completed`。这里只记录安全状态，未读模型输出或 SQLite 内容，未采集 HTTP 状态码/账单金额，不据此宣称 HTTP 200 或免费。
- 只读 glob 检查本隔离根 `data/secrets` 无文件；结合已审查入口的删除后读回校验及完成报告，确认本次正常退出清理证据。保留隔离 DB、计划和结果，不把临时产物暂存提交，不宣称 Provider 端已删除数据或强杀路径安全。
- 本次证明真实 Provider→SDK→连接配置→durable Host/Worker @2→一个 pending→预先约定的拒绝流程，正式 Story 与全部 Revision 不变。拒绝由终端验收程序执行，不冒称真人在 Web 点击拒绝。真实模型的来源正文授权、块证据、关系/质量任务、接受写入及产品浏览器组合未在本次运行；它们既有合成/离线证据不能标成真实模型覆盖。无部署、用户库升级或真实用户数据操作。
- 本轮仅文档改动，不重跑全量测试/类型/浏览器或任何模型请求；上一入口步骤的 1165 项与类型结果仍为历史证据。`bun run docs:check`（1204 文件/0 失败）、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 已通过（pwsh-04501a68d0fd4aca/exit 0；397 文件、5 项既存 warning）；首次仅 EOF 多空行报错，已规范换行，提交前再查 staged diff。该受控真实 Agent 切片通过，Task40 仍 active；下一步按已批准目标核对整体验收及风险，不默认新增付费测试；任何新真实请求须重新授权。
