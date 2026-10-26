# Task 40：隔离产品阅读验收历史

本分册封口后只读。以下为原验收记录，包含修复前的失败；当前状态及后续修复见[主记录](../walkthrough.md)。

### 本轮恢复与隔离产品图文阅读验收

- 维护者本轮要求恢复当前仓库状态、执行一个授权内的验收环节后结束；不恢复旧会话、不创建或恢复自动续跑 goal。当前工作区为 master，保留已有大量未提交改动。本轮未创建分支/worktree，未 commit、push、部署或操作真实用户数据；无子 Agent。
- 记录冲突：Task 索引仍写未开始业务实现，本记录开头仍处于 Normalizer 阶段；后续检查点与当前代码已经包含持久化、统一读取、阅读和候选接口。这些开头记录不能作为当前未实现清单。历史测试与真实来源报告只作为恢复线索，本轮不重复宣称其通过。
- 当前新证据确认：本地受控 RSS 经真实 API、Worker、隔离数据库及 Blob 存储进入生产构建 Web，Story 来源正文保留段落→图片顺序，图片走站内 API 且 naturalWidth > 0；阻断非 localhost 网络并刷新后仍可解码，自动化页仍可打开。1024/1440 px 阅读区可见且页面无横向溢出，768 px 显示窗口过窄提示。
- 验收计划冲突：切片 6 的 768 px 阅读门禁与 ADR-0029 决策 6 的 1024 px 支持下限不一致。本轮沿用已批准 ADR：768 px 验证提示，不修改产品布局。Component Lab 的窄屏组件证据不能替代完整产品支持范围。
- 本轮仅修改 `e2e/browser/offline.spec.ts`：旧媒体分区定位改为来源正文，补充有序块与宽度边界断言。首轮旧用例失败（pwsh-3，exit 1，媒体分区元素不存在）；第二轮在 768 px 期待正文可见而失败（pwsh-5，exit 1，页面显示窗口过窄）。均核对失败页面后调整验收合同，未修改业务代码或增加 fallback。
- 新鲜命令：`bun run build:api; if ($LASTEXITCODE -eq 0) { bun run build:worker }`（pwsh-4，exit 0）；随后 `bunx playwright test --config playwright.config.ts e2e/browser/offline.spec.ts`（pwsh-6，exit 0，1 passed，25.0s），栈内再次构建 Web，Next.js 16.3.0。使用现有隔离栈脚本创建临时数据根并仅迁移隔离数据库。
- 已有实现但本轮未运行验证：精确表示版本读取、重建/选择、候选列表与接受/拒绝、音视频与失败媒体、多来源切换、安全 HTML、键盘与完整视觉验收。生产 Story Agent 装配从当前 API 接线检索未见配置；未配置时返回 409 是代码证据，本轮未验证该运行响应，真实 Agent 仍未验收。全仓测试、独立全仓类型检查、真实来源和既有数据库升级本轮未运行。
- 记录校验：`bun run docs:check`（pwsh-7，exit 0，1037 文件、0 failures）与 `git diff --check` 通过。当前 HEAD 为 `f66c33135351af38460fff73d311863dc7b4ef47`，master；工作区保留未提交改动，未暂存。本轮未增加业务逻辑或新的责任 owner。
- 本轮完成的是隔离完整产品栈的图文阅读环节，信心 B；不能标记 Task40 完成。下一步优先补完整产品多来源/失败媒体与候选交互验收；生产 Agent 配置及真实 Agent 验收需各自明确配置和隔离数据边界。

### 多来源切换与失败媒体交互验收

- 本轮仅验证完整产品的多来源正文/媒体归属、失败媒体提示和操作、切换与刷新后无旧内容残留。允许新增验收用例并追加本记录，业务缺陷只报告，不修改业务代码；goal 保持关闭。
- 沿用已批准设计 §3.6/3.7：来源不拼接正文，failed/skipped 显示真实原因及原文媒体链接。刷新未约定保留手动选择，按产品当前明确标注的确定性默认来源检查一致性，不新增持久化预期。隔离数据库/媒体根由现有 browser stack 管理；用例内本地 HTTP 来源提供可下载图片和固定 404 图片，未使用真实来源或用户数据。无子 Agent。
- 新增 `e2e/browser/source-media-interactions.spec.ts`：真实 RSS/API/Worker 采集两个来源，经产品归并形成双成员 Story；验证 A→B→A→B 的正文前后段、媒体状态、来源原文链接均对应选中来源且不残留另一来源正文/媒体。A 的站内图片可解码；B 的 failed 媒体显示保存失败、404 原因及尝试次数，提供指向受控媒体 URL 的安全外链（新窗口，可键盘聚焦），不显示空白播放器。来源选择器键盘切换及焦点通过；两次刷新均恢复同一明确标注的默认来源，并核对内容归属。1024/1440 px 无页面横向溢出；console error、pageerror、requestfailed 收集为空（404 由 Worker 下载发生，不是浏览器请求）。
- 新鲜命令：`bun run build:api; if ($LASTEXITCODE -eq 0) { bun run build:worker }; if ($LASTEXITCODE -eq 0) { bunx playwright test --config playwright.config.ts e2e/browser/source-media-interactions.spec.ts }`（pwsh-11）。API/Worker 构建通过；首轮浏览器 exit 1，已通过切换与 failed 媒体验证，停在用例误写“默认来源”的文字断言，实际页面是“默认按来源标识顺序选取，可切换”。核对当前 copy 和失败输出后仅修正用例文字，未调整行为要求或业务代码。
- 修正后命令：`bunx playwright test --config playwright.config.ts e2e/browser/source-media-interactions.spec.ts`（pwsh-12，exit 0，1 passed，17.5s，用例 7.6s），栈内重新构建生产 Web（Next.js 16.3.0）并使用新的隔离数据库/媒体根。
- 通过范围是双来源切换、采集下载失败的媒体降级、刷新一致性；信心 B。没有发现该覆盖范围内的产品失败。未验证：saved 媒体字节在浏览器端后来不可用、asset-missing、skipped/metadata_only、慢响应竞态、三来源以上、所有 Story kind 的默认规则、外链目标页面、人工视觉评审、全仓回归/独立类型检查。生产 Agent、真实 Agent/来源、真实用户数据和旧库升级不在本轮范围；不扩大本轮通过声明为 Task40 完成。下一步宜单独补 saved 字节不可用与 asset-missing 的恢复体验验收。
- 本轮仅新增上述验收用例并追加本记录；沿用 master/HEAD `f66c33135351af38460fff73d311863dc7b4ef47`，既有 dirty 工作区保留，未暂存或提交，不创建分支/worktree、不推送或部署，goal 保持关闭。
- 补充失败路径后修正本轮整体判断：上述 pwsh-12 的 B 级通过只覆盖采集阶段 failed 状态，不能代表所有媒体加载失败交互通过。用例追加站内 Asset 字节返回 404 的受控网络故障，保留真实来源数据与真实 Product API 响应，仅在浏览器拦截媒体字节请求。`bunx playwright test --config playwright.config.ts e2e/browser/source-media-interactions.spec.ts`（pwsh-13，exit 1，1 failed，18.4s）再次通过前述切换、下载失败降级和刷新检查，随后确认 saved 图片 `complete === true && naturalWidth === 0`，失败于页面缺少媒体不可用/失败说明。
- 记录校验：`bun run docs:check`（pwsh-14，exit 0，1038 文件、0 failures）和 `git diff --check` 通过；本轮 Markdown 追加段落/代码围栏人工检查通过。未运行全仓测试或独立全仓类型检查。
- 产品缺陷实际行为：正文前后段仍可读，DOM 保留 saved 图片元素但未解码，无媒体失败提示或媒体原文外链；页面只剩文章原文链接。预期：按设计 §3.6 的可解释降级原则，读取已保存媒体失败也应显示可理解状态并提供安全的原文媒体入口，不让不可用图片无解释留在正文。设计未要求媒体重试按钮，本轮不额外引入该预期。`apps/web/src/components/cosmos/content-block-reader.tsx:33-37` 只按 Asset saved 状态输出 img，无加载错误处理，是与运行证据一致的代码定位；业务修复尚未授权，本轮只报告并保留红色验收。
- 证据：`test-results/source-media-interactions--cd24e-failed-media-across-refresh/error-context.md:30-44` 的 DOM 记录显示来源 A、正文与图片、文章链接，缺少媒体提示/链接；同目录 trace.zip、test-failed-1.png 为失败产物。当前模型不支持图像输入，截图未成功查看，未将其算作人工视觉证据。该验收记录的总体信心 C（部分通过、明确失败），Task40 保持 active。下一步先获业务修复授权，再在统一媒体阅读边界补加载失败说明/安全链接并重跑现有红色用例；asset-missing、慢响应竞态等仍未验证。
