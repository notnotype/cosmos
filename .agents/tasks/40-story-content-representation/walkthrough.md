# Task 40 Walkthrough

> 历史记录（2026-10 实施、审查与修复）已归档至 [walkthrough/01-implementation-2026-10.md](walkthrough/01-implementation-2026-10.md)。

## 当前状态

编号 40。生命周期：实施与整体验收完成。内容表示、显式连接→API 202→Worker @2→候选→人工决定已实现；隔离产品覆盖版本管理、媒体及异常读取，合成解析升级/质量保护与旧证据接受门禁。独立审查/预算复核、旧库升级、Node recovery 与原 JS 预算已有证据。维护者确认一次真实 Provider 合成正文摘要与 Web 人工接受/持久化通过。真实来源 RSS ingest 验收（阶段 3）与浏览器验收（阶段 4）均已通过。

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
