# Task 05：规范化内容模型（Normalized Content Model）

## User Request / Topic

多平台抓取调研显示，各平台内容字段差异巨大但有稳定共性。讨论纪要 `docs/research/2026-08-08-universal-content-model.md` 归纳出通用信息模型（`NormalizedContent` 方向）与时间处理原则，并经 2026-08-09 转正进入 PRD（ING-017）、架构 0001（§6.1.1/§6.3）和架构 0002（§3.2/§4.7）。本 Task 承载这些合同的**代码落地**。

## Goal

按路径 C 逐步升级 `NormalizedIngestItem`（当前 Phase 1 已定型合同），并实现时间解析器兜底：

```text
NormalizedIngestItem 新增：
├─ kind: ContentKind            // post / article / video / audio / image / comment / listing
├─ publisher: Publisher | null  // 独立内容属性，RSS 取 author/creator
├─ metrics: ContentMetrics | null  // 统一六项 + raw + reliability + capturedAt
└─ 时间字段升级为 TemporalValue    // exact（证据层，统一 UTC）优先，fallback（解析）兜底

同时：
├─ 升级 plugins/collectors 的 Bilibili 标准化：author 从 summary 挪到 publisher，区分榜单/视频 kind
├─ 替换简化版 normalizeDate：解析器只处理 exact 缺失的展示文本
└─ 回归 RSS fixture 五类案例（有 URL、无 URL、重复、修订、媒体）
```

完成后，Connector 能结构化携带发布者与内容形态，时间字段遵循"证据层优先"，评论/trending 等无证据层场景可用兜底解析。

## Scope

- `packages/domain`：`NormalizedIngestItem` 字段升级（kind/publisher/metrics/TemporalValue），`ContentKind`/`Publisher`/`ContentMetrics`/`TemporalValue` 类型定义，时间解析器（精度族、隐藏年份、非时间成分剥离、排序比较器）。
- `packages/contracts`：DTO 与 Zod schema 同步（如涉及）。
- `plugins/collectors`：Bilibili Connector 标准化升级（author → publisher、kind 区分、metrics 提取）。
- `plugins/rss`：RSS author/creator → publisher 映射，kind 默认 article。
- `packages/storage-prisma`：publisher 内嵌 JSON（`publisherJson`）持久化；`fingerprintEntryRevision` 排除 metrics。
- `packages/application`：persistIngestItem 适配新字段。
- 测试回归：domain/contracts/collectors/rss/storage focused tests + RSS fixture 五类案例。

## Non-goals

- `references` 关系类型清单（后置，Phase 2 评论采集与 Story 归并时再排）。
- Publisher 独立表物化（Phase 2 跨 Entry 聚合作者需求出现时）。
- 通用 Workflow Runtime、Connection/Secret/State 实现（见 `04-workflow-runtime`）。
- 新增平台 Adapter（知乎/微博/微信等，明确后置）。
- Feed 展示带 publisher（`feedItem.publisher`，可顺带但非本 Task 必要验收）。
- ADR-0002（证据层优先）——待本 Task 实现验证后按仓库流程立。

## Current State

- 架构合同已转正：PRD ING-017、架构 0001 §6.1.1/§6.3/§13/§21（不变量 47-49）、架构 0002 §3.2/§4.7、CONTEXT.md（发布者/证据层优先）。
- 讨论真相源：`docs/research/2026-08-08-universal-content-model.md`（含实测：多平台时间格式、小红书隐藏年份切换点、YouTube 周语义）。
- 代码现状：
  - `NormalizedIngestItem` 9 字段，`rawPayloadMimeType` 已加。
  - `plugins/collectors` 已有 Bilibili/AI HOT Connector，`author` 被塞进 summary/contentText 凑数。
  - `normalizeDate` 为简化版（`new Date` + unix 特判），解析不了 "07-29湖南" 等展示文本。
  - `plugins/rss` 未处理 author。
- 依赖安装：Bun workspace 已就绪，`plugins/collectors` 依赖 `@jackwener/opencli` 1.8.6。

## Decisions and Deviations

- 路径 C 定稿（2026-08-09）：先加 kind/publisher/metrics 三个核心字段，其余（aliases/segments/references/签名 URL 等）进 `extensions`，有真实 Connector 需求时再转正。
- Publisher 存储内嵌 JSON（`publisherJson`，同 `sourceLocatorJson` 模式）；按作者筛选用受控 SQL Adapter 的 `json_extract` + 表达式索引。
- 时间处理证据层优先（三级优先级）：精准时间戳 > 解析展示文本 > 无时间；exact 统一转 UTC。
- 时间精度提升（fallback → exact）与指标变化都**不产生新 Revision**；`fingerprintEntryRevision` 排除 metrics。
- metrics 六项 `{ likes, views, reposts, comments, collects, score }`；GitHub stars 归并 likes；平台特有（forks/coin）进 extensions；subscribers/karma 归 `publisher.metrics`。
- 时间解析器是**兜底定位**，第一消费场景：YouTube/小红书评论、微信 search、GitHub trending。
- 偏离路径 A（直接改版重测全部）：为降低 Phase 1 回归成本，采用增量升级 + 测试补充。

## Implementation Walkthrough

### 1. domain：类型与合同

- 定义 `ContentKind`（7 类）、`Publisher`（platformId/name/handle/profileUrl/kind/metrics?）、`ContentMetrics`（values/raw/reliability/capturedAt）、`TemporalValue`（exact/fallback）。
- `NormalizedIngestItem` 新增：`kind`（默认按内容推断）、`publisher`、`metrics`、时间字段升级（`sourcePublishedAt` 保留 + 新增 exact 表达，或替换为 `publishedAt: TemporalValue`——按兼容性决定）。

### 2. domain：时间解析器（兜底）

- 精度族识别：秒/分/时滚动回推，周滚动 7 天取整，日/月/年自然日历，隐藏年份（`[now−1y, now]` 最近匹配）。
- 非时间成分剥离：地域后缀（"07-29湖南"）、修饰词（"（修改过）"→ updatedAt）、前缀（"直播时间："）。
- 输出 `fallback: { raw, lowerBound, precision, timezone, confidence }`；失败降级 uncertain。
- 排序比较器（逐维度比下界，同维度比精度）。
- 平台行为参数（默认时区、格式声明）由 Connector 提供。

### 3. contracts：DTO/Zod 同步

- 若新字段进入公开合同，更新 DTO 与 Zod schema，补 contract tests。

### 4. collectors：Bilibili 标准化升级

- `author` 从 summary/contentText 挪到 `publisher`；`kind` 区分（hot 榜单 → listing，视频 → video）。
- metrics 提取（B站 view/like/coin/favorite 映射到统一六项）。
- 替换 `normalizeDate` 为时间解析器（exact 优先：优先用 `video` 详情命令的精确时间；search 列表用兜底解析）。

### 5. rss：publisher 映射

- RSS author/creator → `publisher`；kind 默认 article；时间用 pubDate（RFC2822 → exact）。

### 6. storage-prisma / application

- `publisherJson` 列（或并入现有 JSON 列方案）；persistIngestItem 适配；`fingerprintEntryRevision` 排除 metrics 与时间 fallback。

### 7. 测试与回归

- domain：时间解析器单测（精度族、隐藏年份、非时间成分、排序、降级）、类型合同测试。
- collectors：Bilibili 标准化测试（author → publisher、kind、metrics）。
- rss：author 映射测试。
- storage：publisherJson 持久化 + fingerprint 排除 metrics 测试。
- RSS fixture 五类案例回归（有 URL、无 URL、重复轮询、来源修订、媒体状态）。

## Verification

实现阶段至少分开报告：

- domain 时间解析器 focused tests。
- contracts/domain 合同测试。
- collectors/rss Connector 标准化测试。
- storage 持久化与 fingerprint 测试。
- RSS fixture 五类案例回归。
- `bun run typecheck`、`bun run test`。
- 浏览器/Node 冒烟（如涉及 Feed 展示 publisher，另行报告）。

未运行项如实标注（如真实 Bilibili Browser Bridge、真实 RSS/RSSHub 网络验收）。

## Follow-ups

- references 关系类型清单（Phase 2 评论采集时排）。
- Publisher 独立表物化与按作者筛选索引（Phase 2）。
- ADR-0002：证据层优先 + Publisher 存储（本 Task 验证后立）。
- Feed 展示带 publisher（`feedItem.publisher`）。
- 平台行为参数（时区、隐藏年份切换点、格式声明）配置形态落地。
- 更多平台 Adapter（知乎/微博/微信）接入时复用本模型。
