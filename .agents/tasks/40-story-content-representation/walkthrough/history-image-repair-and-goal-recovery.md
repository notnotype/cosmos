# 历史：图片修复与旧 goal 恢复

仅记录历史，不代表当前授权或验证结果。当前状态及有效决定见[主记录](../walkthrough.md)。

### 已保存图片读取失败修复与验收

- 维护者授权修复并多 Agent 验收；goal 保持关闭。恢复并核对上一轮红色用例、当前实现及批准设计 §3.6。修复边界为统一内容块阅读器的浏览器加载状态，不改 Asset 持久状态、API/合同/数据，不新增重试产品要求。Decision: code-change；已有红色运行证据证明缺少本地加载错误处理，文档或配置调整不能解决。没有需要退役的协议或旧存储路径。
- 主 Agent 拥有本记录及最终验证；实现子 Agent 负责 `apps/web/src/components/cosmos/content-block-reader.tsx`、`apps/web/src/copy/areas/reading.ts` 和 `e2e/browser/source-media-interactions.spec.ts`，独立审查子 Agent 只读。二者沿用当前仓库 master、HEAD `f66c33135351af38460fff73d311863dc7b4ef47`，既有 dirty 状态保留，不创建 worktree/分支或提交。工具无法指定 `jijiapi/gpt-6-luna`，已明确报告限制。实现子 Agent 调用返回失败但留下修复产物；其完成/验证声明不算最终证据，由主 Agent重新读取产物并运行验证。
- 独立审查先发现并定位了 P2 边界：内容块合法地可以只含 `assetId`，原文 URL 可能只在 Asset 上；修复后改为 `safeContentUrl(block.data.sourceUrl) ?? safeContentUrl(asset.sourceUrl)`。复审确认两个候选分别安全过滤，无 P0/P1/P2 阻断；来源切换通过 revision/asset key 重建状态，不写回 Asset。工具无法指定要求的模型路由，本轮审查未使用 `jijiapi/gpt-6-luna`。
- 修复行为：saved 图片加载触发 `onError` 后隐藏坏图，显示“图片加载失败，正文仍可继续阅读。”，并以 block URL 优先、Asset URL 回退的安全外链保留恢复入口；不增加重试按钮，不把浏览器读取失败伪装成采集 failed 状态。更新文案位于 `apps/web/src/copy/areas/reading.ts:10-13`。
- 最新验证命令：`bunx vitest run apps/web/src/components/cosmos/content-block-reader.test.ts; if ($LASTEXITCODE -eq 0) { bunx playwright test --config playwright.config.ts e2e/browser/source-media-interactions.spec.ts }; if ($LASTEXITCODE -eq 0) { bun run docs:check; if ($LASTEXITCODE -eq 0) { git diff --check } }`（pwsh-24，exit 0）。组件测试 5 tests passed；生产构建期间的完整产品隔离浏览器验收 1 passed（22.8s）：覆盖双来源切换、采集 404、saved 图片站内读取 404、正文不残留、提示/外链/焦点/无重试按钮、Asset 仍为 saved、切换后正常图片恢复、1024/1440 无横向溢出；docs:check 1038 文件 0 failures，git diff --check 通过。
- 本轮修复与验收通过范围信心 B：原红色 saved 媒体读取失败已闭合，来源切换和采集失败回归仍绿。未验证：缺失 Asset 时按 `asset-missing` 保留媒体原文入口（当前仍只显示通用“媒体暂不可用”）、skipped/metadata_only、慢响应竞态、三来源以上、所有 Story kind 默认规则、外链目标页面、人工视觉评审、全仓回归/独立全仓类型检查、生产 Agent/真实 Agent/真实来源/旧库升级。Task40 仍 active，不能扩展为整体完成。
- 本轮更新了 `apps/web/src/components/cosmos/content-block-reader.tsx`、`apps/web/src/copy/areas/reading.ts`、`apps/web/src/components/cosmos/content-block-reader.test.ts`、`e2e/browser/source-media-interactions.spec.ts` 及本 walkthrough；无 commit/push/deploy/真实用户数据操作，goal 保持关闭。

### 本会话完整批准范围 goal 与剩余清单恢复

- 维护者新授权替代 goal 关闭/单轮单环节/仅图片修复限制；创建新 goal `goal-d676f07a-8417-4542-984e-0d4c7baca414`，max_goal_rounds=16，不恢复旧会话。workflow 路由核对实际调用指定 provider=jijiapi、model=gpt-6-luna，返回可用；后续子 Agent 均显式指定，无默认路由代替。
- leader 单独维护 walkthrough/公共文档，统一验收与构建。当前 repository `D:\Otirik\Workstation\cosmos`、branch master、worktree 主工作区、base SHA `f66c33135351af38460fff73d311863dc7b4ef47`，既有 dirty 保留。A 可写 content-block-reader.tsx/其测试、reading.ts、source-media-interactions.spec.ts；B 首阶段只读核对版本、候选、生产接线，收到明确写集合后才可写。测试隔离根采用 browser-stack UUID 或 `.agent/tmp/task40-agent-<uuid>`；DTO/Prisma 当前无人获写授权，最多3并发，无真实数据/Git生命周期操作。
- 暂定分类：已验证且相关实现未变：图文原位/离线、双来源切换/刷新、saved 图片加载失败提示与恢复。实现已有但证据需系统核对：Normalizer/存储并发及迁移/精确历史引用/锁定回退、权限与证据降级、候选接受拒绝与过期原子性、音视频与其它读取状态。已知缺陷：missing Asset 未提供原文入口。配置缺口：生产 Story Agent resolver/profile 无装配；真实外部模型调用未获明确费用/凭据/网络授权，必需真实 Agent 验收保持未完成，不冒充 Fake 完成。
- 当前索引原“未开始业务实现”和 walkthrough 当前 Normalizer 描述已修正；旧阶段记录明确标注历史。完整产品768布局门禁对齐已批准 ADR-0029，1024/1440验阅读，768验过窄提示。全仓回归和类型检查已启动，不重跑无变更的局部图文验收。
- 新鲜基础验证：`bun run typecheck`（pwsh-28，exit 0）；`bun run db:validate`（pwsh-32，exit 0，schema valid）。`bun run test`（pwsh-27）仍运行；workflow-1 A/B仍运行，未采信其完成声明。
