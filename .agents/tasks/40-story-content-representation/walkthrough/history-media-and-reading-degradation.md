# 媒体与异常读取验收历史

本册仅保存已完成的历史计划与证据；当前状态和有效决定以[主 walkthrough](../walkthrough.md)为准，历史授权不代表当前自动续跑或外部操作授权。

### 2026-10-26：媒体降级产品验收计划

既有基线已本地提交 `22f0f9a`，提交后工作区干净；本步只新增 `e2e/browser/story-media-degradation.spec.ts` 和本记录/状态同步，不改业务合同或 UI。测试自己启动临时 loopback RSS，走真实采集/API/Worker/生产 Web；不伪造 API 响应或直写数据库，不访问外部来源、真实数据或模型。Leader 为唯一写入者，无子 Agent/goal；完成后依维护者授权单独中文本地提交，不 push。

1. 音视频只有媒体、没有正文：真实 Asset 为 metadata_only，正文按块顺序显示类型/状态/原因和安全原文链接，无播放器或本地已保存宣称；不下载音视频。
2. 图片地址使用非白名单 loopback：真实 Worker 得到 skipped/security_blocked，仍显示图片前后正文、原因与安全外链；不发送媒体请求，不绕过主机门禁。
3. 空 HTML 正文：读取投影块为空、给出无正文说明并保留文章原文入口；刷新后上述状态一致。1024/1440 都检查正文可读、真实键盘焦点、无横向溢出和非预期浏览器错误。

先运行验收观察实际结果；发现业务缺陷先报告行为/预期/证据，不为测试绿灯改合同。复验完整产品本步用例、已有媒体/内容聚焦回归及文档/staged diff/大小门禁。独立审查、legacy/失效表示与更多异常媒体、解析器/证据演进和真实 Agent 仍分别未完成。

### 2026-10-26：媒体降级产品验收结果

- 三条计划均通过：audio/video 块正文为空、Asset metadata_only；图片 skipped/security_blocked、前后段有序；空 HTML 的 blocks=[]、正文为空且不是 unavailable。说明、安全原文及播放器/离线宣称按计划检查。
- 1024/1440 刷新投影一致；真实 Tab/Shift+Tab 焦点、safe href/target/rel、无横溢及全程 pageerror/console error/requestfailed=0。127.0.0.1/127.0.0.2 两个受控接收端确认媒体零请求，不放宽主机门禁。
- 首轮媒体用例停在键盘脚本：`Locator.press` 在发键前重聚焦，破坏 Tab/Shift+Tab 往返。改用当前页面 keyboard 发键，保留原焦点断言后通过，不改产品代码。随后增加非白名单接收端作为零请求见证并再跑最终版本。
- `bunx playwright test --config playwright.config.ts e2e/browser/story-media-degradation.spec.ts e2e/browser/source-media-interactions.spec.ts`：3 项通过、31.1s（新增双宽度 2 项、原切换/保存图片失败恢复 1 项），pwsh-d6aa27272bf9481a，exit 0；包括生产 Web 构建/start及真实 API/Worker。原有恢复用例只在故障注入前检查错误，不把它冒称全程零错误；新增两项为全程检查。
- `bun run vitest run packages/application/src/content-normalizer.test.ts packages/application/src/content-ingest.test.ts packages/application/src/media-acquisition.test.ts packages/storage-prisma/src/content-query.test.ts apps/web/src/components/cosmos/content-block-reader.test.ts`：5 文件 / 57 测试通过、5.09s（pwsh-541801486dc34528，exit 0）。
- `bunx tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --esModuleInterop --skipLibCheck --types node e2e/browser/story-media-degradation.spec.ts`：最终用例类型检查通过，与最终浏览器串行（pwsh-d6aa27272bf9481a，exit 0）；不把 Playwright 转译当类型检查。
- 五轴自查未见 blocker：仅有界测试/记录，无业务变更；非独立审查。本步未跑全套单元/全仓类型（基线 1148 项/类型已过）、浏览器整套、真实来源/Agent、旧库升级。信心 B，本切片完成、Task40 active；余项按计划继续。
- `bun run docs:check`（1186 文件零错误）、`git diff --cached --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 全通过（pwsh-88d1cbfa52a04ec1，exit 0），5 项既存 warning。首次主记录约 9.1k token 触警，去掉本次重复说明后通过，未调阈值/基线/豁免。仅四个本步文件暂存，复查后本地提交。

### 2026-10-26：旧文本与损坏读取产品验收计划

媒体步骤已提交 `4181141`。本步只补测试/隔离启动夹具与状态记录，无产品 API、schema 或行为改动。API 启动前在本轮新建且空的 browser-stack 库中，用合成 Connector 经 IngestionService 建样，再定点构造旧文本/坏表示/缺 Asset；不读取或升级用户旧库。显式开关 `COSMOS_E2E_READING_DEGRADATION=1` 才播种，校验临时根和空库，不使用外部 DATABASE_URL；不新增产品写入口、网络来源或模型请求。Leader 唯一写入，不开 goal/子 Agent；完成后独立中文本地提交，不 push。

1. 无表示旧文本经真实 Query 清洗后可读；脚本/HTML/媒体不执行、不外发，不伪造表示版本。显式历史缺失读 unavailable，不悄悄回退旧文本。
2. 损坏 JSON 的当前表示明确 unavailable，不显示旧 contentText；失败表示显示不可用说明，Story 详情与原文入口仍可读，不导致整页失败。
3. 合法块引用缺失的图片/音视频 Asset：保留前后段落与块顺序，显示缺失说明；只有安全 URL 才提供外链，不渲染媒体或请求 Blob。1024/1440 阅读/刷新结果一致，检查原文链接真实键盘焦点、无横溢、浏览器错误及无意外外发；读取不改写源修订/表示。

新增 `scripts/e2e/reading-degradation-seed.ts` 与 `e2e/browser/story-reading-degradation.spec.ts`，仅在既有 `scripts/e2e/web-stack.ts` 空库迁移之后、启动 API/Worker 之前接入。先跑用例观察行为；若暴露业务缺陷先报告证据，不放宽合同。运行 API/Worker 构建后本步完整产品用例，相关 Query/Normalizer/reader 回归、测试文件类型与文档/staged diff/大小门禁；独立审查、真实 Agent、用户旧库升级及其他演进场景仍未完成。

### 2026-10-26：旧文本与损坏读取产品验收结果

- 三条计划均通过真实 API/生产阅读页：无表示的旧 HTML 安全文本可读，不执行脚本/请求追踪图；不伪造表示，显式 v1 缺失为 unavailable。损坏当前 JSON 返回 unavailable，不退为旧文本；有效但 failed 的表示不在 Web 渲染失败正文。缺失 image/audio/video Asset 保留五块顺序、前后正文、缺失说明；只在有安全 URL 时给原文，不发 Blob/外部媒体请求。
- 1024/1440 各一项均检查首次阅读/刷新、原文与媒体链接真实 Tab/Shift+Tab 焦点、无横向溢出及 pageerror/console error/requestfailed=0，Story API 快照及内容投影读取前后相等。仅 API 启动前的合成隔离库定点构造特殊状态，不是历史 schema 升级或真实旧库验收；无业务代码/合同改动。
- `bun run build:api`、`bun run build:worker` 以及 `$env:COSMOS_E2E_READING_DEGRADATION='1'; bunx playwright test --config playwright.config.ts e2e/browser/story-reading-degradation.spec.ts` 均 exit 0（pwsh-93b23e08faa04344）：共享包/API/Worker 构建、生产 Web 构建/start，2 项通过、35.9s。先运行新增文件 tsc 再构建；生产进程使用合成行但不替换 API 响应。
- `bun run vitest run scripts/e2e/reading-degradation-seed.test.ts packages/application/src/content-query.test.ts packages/application/src/content-normalizer.test.ts packages/storage-prisma/src/content-query.test.ts apps/web/src/components/cosmos/content-block-reader.test.ts`：5 文件 / 31 项通过、7.71s（pwsh-12d3bf25be674b2a，exit 0）。新增两项证明非 browser 根与非空库拒绝、继承 DATABASE_URL 不生效；Query 读取前后 EntryRevision/ContentRepresentation/Observation 整行快照不变。
- `bunx tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --esModuleInterop --skipLibCheck --types node e2e/browser/story-reading-degradation.spec.ts scripts/e2e/reading-degradation-seed.ts scripts/e2e/reading-degradation-seed.test.ts` 同上述聚焦回归串行 exit 0。首轮播种器写错 Prisma Source delegate（实际为 SourceInstance），类型与启动均定位在测试代码；另有 Node 无法解析裸 bun 的测试迁移问题，改用现有 Node/Prisma fixture。没有据此放宽校验或改产品，修正后复验通过。
- 完整接线已完成过程 6,618 字节移入历史分册，保留原文（仅规范末尾换行）；当前状态和有效合同仍在本册/架构。五轴自查：仅可选测试夹具与有界读取验收，门禁拒绝非空/错根；默认启动不开播种，未引入产品权限/写口或运行负担。未识别本步 blocker，非独立审查。
- 关闭播种开关后复验默认栈：`Remove-Item Env:COSMOS_E2E_READING_DEGRADATION -ErrorAction SilentlyContinue; bunx playwright test --config playwright.config.ts e2e/browser/story-media-degradation.spec.ts`，2 项通过、26.6s（pwsh-9366c430d5474969，exit 0）。默认正常采集、媒体拦截与空正文不受可选夹具影响。自查修正默认未播种时的专用用例门禁：明确 skip 并说明所需开关，不因缺测试行让默认整套失败。最终 pwsh-dc3d7901be95497a：开启开关重跑旧行 2 项通过、20.5s；关闭后同时跑旧行+媒体为 2 passed / 2 skipped、20.6s，随后上述 tsc exit 0。skipped 不计通过，完整断言只在显式启用时运行。
- `bun run docs:check; git diff --check; python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 通过：1190 文档无失败，394 文件大小门禁 PASS、5 项既有基线增长 warning（pwsh-d034992ffc9f4934）；首次只因本次主记录末尾多余空行失败，已清除后复验。暂存后再查 cached diff 与文档门禁。
- 本步不跑默认单元整套/单独全仓 typecheck、浏览器整套、真实来源/Agent、旧库升级；构建与聚焦类型不冒称全仓。信心 B：本切片完成、Task40 active；余项是独立审查、解析器/不同质量与 Agent 旧证据演进、另获授权的真实 Agent。本地按步骤中文提交，不 push/部署/goal。
