# 通用信息模型与时间归一化 — 讨论纪要

> 状态：讨论稿，未定稿，不构成架构合同
>
> 日期：2026-08-08
>
> 范围：基于多平台信息抓取调研的通用信息模型设计，以及时间字段归一化规则的讨论结论与实测验证
>
> 输入调研：`2026-08-06-opencli-*.md`（Bilibili / 知乎 / Twitter / 小红书 / 微信 / 微博 / YouTube / GitHub / Reddit）
>
> 关联架构：`../architecture/0001-cosmos-foundation.md`、`../architecture/0002-information-model.md`
>
> 关联更新：`../adr/0001-durable-workflow-runtime.md`、`../tasks/04-workflow-runtime/README.md`（2026-08-08 远端同步引入，见 §8）

## 1. 目的

多平台调研（Bilibili、知乎、X、小红书、微信公众号、微博、YouTube、GitHub、Reddit）显示，各平台返回的内容字段差异巨大，但存在稳定的共性。本纪要记录：

1. 各平台信息格式的共性总结；
2. 通用信息模型 `NormalizedContent` 草案（讨论版）；
3. 时间字段归一化的规则定稿；
4. 多平台时间格式实测验证（小红书 / YouTube / 微博 / 微信，验证"隐藏年份日期"假设的适用范围）。

本文是讨论阶段的记录，落地为架构合同前需要按仓库流程（需求 → PRD → 架构 → Task）继续推进。

## 2. 各平台信息格式共性

### 2.1 内容侧四件套

所有平台的内容都可以拆成四部分：

| 部分 | 说明 | 跨平台形态 |
| --- | --- | --- |
| 结构化 ID | 平台内稳定身份 | 多形态并存：`bvid/aid`、`id/mblogid`、`id/url_token`；URL 可推导但不可依赖 |
| 发布者 | author/channel/user/subreddit/公众号 | 平台内 ID + 显示名 |
| 时间 | 创建/更新时刻 | 7+ 种格式，见 §4 |
| 正文 + 互动指标 + 媒体 | 完整度参差 | 全文 / 摘要 / 字幕 / 仅标题；likes/views/reposts；图/视频/音频 |

### 2.2 三种特殊结构

- **评论树 / 线程**：Reddit `POST/L0/L1`、知乎 `depth/parent_id`、小红书楼中楼 `reply_to`、X `in_reply_to`。
- **榜单 / 热度条目**：B站热榜、知乎热榜、微博热搜、X trending、GitHub trending——不是内容，是"话题 + 热度值"。
- **签名 URL**：小红书 `xsec_token`、微信直链 `signature`——有时效，不能当唯一身份，但详情抓取又需要它。

### 2.3 采集质量共性

- 字段缺失是常态（B站 search 的 `url` 可空）。
- 指标不可信是常态（X `profile` 统计全 0、YouTube `whoami` 不稳定）。
- 失败形态多且不统一（空数组 + exit 0、登录墙吞成 NOT_FOUND、适配器 bug exit 1）。
- 输出形态不统一（field/value 键值对 vs 对象数组；`likes` 字符串 vs 数字；`upvotes` vs `score`）。

## 3. 通用信息模型草案

### 3.1 核心单元 `NormalizedContent`

当前 `NormalizedIngestItem`（Phase 1 已定型）的泛化方向，新增字段以 ★ 标记：

```text
NormalizedContent
├─ platform: string                    // bilibili / zhihu / x / ...
├─ externalId: string                  // 首选稳定 ID（bvid、tweet_id、note_id...）
├─ aliases: { kind, value }[]          // ★别名 ID（aid、mblogid、数字 id、url_token）
├─ kind: ContentKind                   // 内容形态（见 3.2）
├─ title: string | null                // 标题/主题行（热搜词也是 title）
├─ summary: string | null              // 摘要（B站官方AI总结、搜索摘要）
├─ body: {                             // ★正文
│    text: string | null               // 全文（answer/selftext/微信md/推文）
│    segments: { time, text }[] | null // 分段时间戳（YouTube字幕/B站章节）
│    completeness: "full"|"excerpt"|"summary"|"none"
│  }
├─ publisher: Publisher                // ★独立建模，见 3.3
├─ publishedAt: TemporalValue          // ★见 §4
├─ updatedAt?: TemporalValue           // ★修订语义用
├─ metrics: ContentMetrics             // ★见 3.4
├─ media: MediaItem[]                  // 图/视频/音频/封面，各带类型与 URL
├─ references: ContentReference[]      // ★父子/引用：in_reply_to、quoted、转载、外链
├─ context: DiscoveryContext           // ★发现上下文：hot/search("DeepSeek")/feed/关注
├─ tags: string[]                      // 话题标签/分类/subreddit/category
├─ flags: { nsfw?, isLive?, isRetweet?, isEdited? }
├─ url: SignedUrl | null               // ★签名 URL 独立标记，见 3.5
├─ extensions: Record<string, unknown> // 平台特有字段原样保留（宽容合同）
└─ rawPayload: string                  // 原始证据（进 Blob）
```

### 3.2 内容形态 `ContentKind`（7 类，已定稿）

```text
post    帖（X/微博/Reddit/小红书笔记的文本部分）
article 文章（微信/知乎专栏/知乎回答/RSS 条目）
video   视频（B站/YouTube）
audio   音频
image   图片
comment 评论/回复（树节点）
listing 榜单条目（热搜/热榜/trending/GitHub trending）
```

已决定：`question/answer` 不单独成类（知乎回答本质是 article，问题本身是 listing/话题）。

### 3.3 `Publisher` 独立建模（已定稿）

现有 `NormalizedIngestItem` 无发布者概念，是最大缺口。独立建模的理由：微博/知乎的 user 资料字段完整（粉丝/获赞/状态数），是未来 Subject/Entity 的前身。

```text
Publisher
├─ platformId: string        // uid / mid / channelId / url_token / screen_name
├─ name: string              // 显示名
├─ handle: string | null     // @deepseek_ai、@Bijanbowen
├─ profileUrl: string | null
├─ kind: "user"|"channel"|"subreddit"|"official-account"|"org"
└─ metrics?: { followers, following, statuses, voteup... }  // 可空、可过期、标注可信度
```

实测约束：
- X `profile` 统计全 0 → metrics 必须带 `reliable` 标记
- X `profile DeepSeek` 解析到空壳账号 → 需要用户名交叉验证
- 微信 download 的 author 与页面 DOM 作者不一致 → 采集时保留多来源，标记不确定

### 3.4 `ContentMetrics` 与可信指标

```text
metrics: {
    values: { likes?, views?, reposts?, comments?, collects?, score? },  // 归一化数值
    raw: Record<string, string>,        // 原始文本（"3.4万次观看"、"727万热度"）
    reliability: "high"|"low"|"unknown",// 来源是否可信（X profile → low）
    capturedAt: string                  // 指标是时点快照，会过期
}
```

### 3.5 签名 URL 独立标记（已定稿）

```text
url: {
    value: string            // 完整 URL
    signed: boolean          // 是否带签名/时效参数（xsec_token、signature）
    expiresHint?: string     // 已知时效信息（如 token 需重新获取）
}
```

签名 URL 不能当身份键（外部 ID 才能），但详情抓取需要原样保留。

### 3.6 与现有合同的关系（已定稿：路径 C）

当前 `NormalizedIngestItem` 9 个字段：externalId/title/summary/contentText/webUrl/sourcePublishedAt/sourceLocator/rawPayload/assets。

候选落地路径：
- A. 直接改版 NormalizedIngestItem——Phase 1 全部重测；
- B. 保留现有合同，新增"平台扩展载荷"record——RSS 不变，新平台走扩展；
- C. 逐步升级：先加 publisher + kind + metrics，其余进 extensions。

**已决定：路径 C（2026-08-08）**。理由：Publisher 和内容 kind 是 Feed 展示和去重绕不开的，尽早进核心合同；榜单、签名 URL、segments 等低频形态先进 extensions，有真实 Connector 需求时再转正。

C 的具体落地内容：

```text
NormalizedIngestItem 新增字段（Phase 2 前的最小集）：
├─ kind: ContentKind            // 7 类；RSS 条目默认 article，按内容可推断
├─ publisher: Publisher | null  // 独立结构；RSS 取 author/creator
├─ metrics: ContentMetrics | null  // RSS 通常无指标，可空

进入 extensions 的（暂不转正）：
├─ aliases、body.segments、references、context、tags、flags、签名 URL
```

同步适配：
- `plugins/rss` Connector：从 RSS 的 author/creator 映射 publisher；kind 默认 article；时间优先取机器可读字段（RFC2822 pubDate），其余格式按 §4 规则
- 测试更新：contracts/domain focused tests + RSS fixture 五类案例（有 URL、无 URL、重复、修订、媒体）回归
- `feedItem` 等展示 DTO 暂不改（publisher 进 Feed 展示属 Phase 2 Feed 排序范围）

## 4. 时间归一化规则（定稿）

### 4.1 问题背景

平台时间格式 7+ 种：ISO（知乎）、RFC2822（X）、unix 秒（Reddit）、相对时间（"3小时前"/"6天前"）、本地化日历文本（"2026年8月7日 11:26"）、无时区文本（B站 "2026-08-06 10:18"）、`MM-DD` 隐藏年份（小红书 "07-29"）。

时间信息不可重算：原始文本一旦丢弃就永久丢失；相对时间换算依赖换算时刻。

### 4.2 责任边界（定稿）

| 职责 | 谁做 | 依据 |
| --- | --- | --- |
| 原样保留 raw 时间文本 | Connector（合同强制） | 不可重算 |
| 声明格式/时区 | Connector 配置声明 | 平台知识在 Connector |
| 解析 + 精度标记 | 共享解析器（domain 或独立包） | 逻辑集中、可测 |
| capturedAt 注入 | application（Observation 已有） | 系统时钟 |
| 失败降级 → uncertain | application | 边界校验，不阻断入库 |
| 解析器版本化 | domain（revision/producer 记录） | 架构不变量 |

### 4.3 归一化规则（定稿）

平台内容在生成时一定有精确时间戳，其展示文本是该时间戳的精度截断。解析目标：恢复该时间戳的精度下界。

| 原始描述 | 换算规则 | 归一化结果（下界） | 精度 |
| --- | --- | --- | --- |
| `x秒前` | 当前时刻 − x 秒，截断到秒 | 具体时刻 | second |
| `x分钟前` | 当前时刻 − x×60s，截断到分 | 整分 | minute |
| `x小时前` | 当前时刻 − x×3600s，截断到小时 | 整点 | hour |
| `x天前` | 当前日期 − x 自然日 | 当日 00:00:00 | day |
| `x周前` | 当前日期 − x 自然周（7 天） | 该周起始（周一 00:00:00） | week |
| `x个月前` | 当前日期 − x 自然月 | 该月起始（1 日 00:00:00） | month |
| `x年前` | 当前日期 − x 自然年 | 该年起始（1 月 1 日 00:00:00） | year |
| `MM-DD`（隐藏年份） | 平台时区下，`[now−1y, now]` 内最近匹配 | 当日 00:00:00 | day |
| `MM月DD日`（隐藏年份） | 同上，最近匹配 | 当日 00:00:00 | day |
| `MM月`（隐藏年份） | 同上，最近匹配 | 当月 1 日 00:00:00 | month |
| `YYYY-M-D`（无前导零） | 直接解析 | 精确时刻 | day |

要点：
- 秒/分/时是**滚动回推**一族；日/周/月/年是**自然日历**一族（含隐藏年份）；`x周前` 是独立单位（YouTube 实测确认）。
- 归一化产物是**该精度区间的起始时刻（下界）**，确定、可排序。
- 归一化产出 `{ raw, lowerBound(iso), precision, timezone }`，raw 永远保留。

### 4.4 隐藏年份的判定规则（定稿）

> 无年份的 `MM-DD` 默认距当前不超过半年；平台对更老的内容会显示完整年份。

判定：比较 now 与输入的相同维度（月、日），`now >= 输入` → 当年，否则前一年。等价于：**在 `[now−1y, now]` 内找距离 now 最近的一次出现**。

- 闰年 `02-29` 不需要特判：半年窗口内 `02-29` 只可能存在于闰年当年，规则自然命中合法日期；窗口外平台会显示 `YYYY-02-29`，无年份输入不会出现。
- 平台时区决定"当前日期"，跨时区边界会差一天，必须统一用 Connector 声明的平台默认时区。
- 假设被打破（平台行为异常）时走解析器失败降级：`iso: null + confidence: uncertain + raw 保留`，不增加特判逻辑。

### 4.5 排序规则（定稿）

```text
compare(a, b):
  1. 逐维度比较下界：年 → 月 → 日 → 时 → 分 → 秒
     某维度不同 → 直接返回大小
  2. 所有可比较维度都相同 → 精度高的大
```

### 4.6 非时间成分剥离（新发现，补充）

时间字段可能混有非时间信息，解析前必须先剥离：
- **地域后缀**：小红书 `07-29湖南` 的"湖南"（地域与时间同字段）；
- **修改标记**：YouTube `6天前（修改过）`——修饰词识别后该时间记为 `updatedAt`（`publishedAt` 留 null），修饰词表作为解析器内置声明数据；
- **类型前缀**：YouTube `直播时间：3周前`——"直播时间："前缀需剥离后按相对时间解析。

## 5. 多平台时间格式实测验证

> 验证目标：确认各平台时间展示策略（相对时间 / 隐藏年份 / 绝对日期）与"隐藏年份日期"假设的适用范围。
> 方法：OpenCLI v1.8.6 实测（登录态复用浏览器，2026-08-08），覆盖小红书、YouTube、微博、微信。

### 5.1 小红书评论（隐藏年份切换点）

| 评论距今天数 | 评论时间显示 | 格式 |
| --- | --- | --- |
| 4 天 | `4天前湖南` | 相对时间 |
| 178 天（2026-02-11 发布） | `02-11江西` | 无年份 |
| 180 天（2026-02-09 发布） | `02-09湖南` | 无年份 |
| 187 天（2026-02-02 发布） | `02-02北京` | 无年份 |
| 219 天（2026-01-01 发布） | `01-01湖南` | 无年份 |
| 225 天（2025-12-26 发布） | `2025-12-26北京` | **带年份** |

结论：假设方向成立，切换点实测在 **(219, 225] 天**之间（约 7.3 个月）；"180 天"是保守近似。规则安全前提是"无年份输入距今 < 1 年"，实测上限 225 天，安全裕度约 140 天。

### 5.2 YouTube（全程相对时间 + 证据层 ISO）

| 层 | 时间格式 | 结论 |
| --- | --- | --- |
| search/feed `published` | `23小时前` / `7天前` / `3周前` / `4个月前` / `5年前`（48+ 样本） | **全程相对时间，无绝对日期**；单位链 时→天→周→月→年 |
| 直播变体 | `直播时间：3周前` | "直播时间："前缀，需剥离 |
| video 详情 `publishDate` | `2012-07-15T00:46:32-07:00` | **ISO 8601 完整时间戳**（证据层机器可读） |
| 评论 `time`（14 年前老视频） | `1小时前` / `5天前` / `6年前（修改过）` / `7年前` | 全程相对时间，无绝对日期；确认"（修改过）"标记 |

### 5.3 微博（证据层 RFC2822）

| 层 | 时间格式 | 结论 |
| --- | --- | --- |
| search `time`（展示层） | `47分钟前` / `今天15:46` / `08月07日 21:49`（MM月DD日 HH:mm） | 展示格式，无年份 |
| user-posts / post `created_at` | `Sat Aug 08 17:53:33 +0800 2026` | **RFC2822 完整时间戳**（证据层机器可读，带时区） |

结论：微博采集用 user-posts/post 的 RFC2822 即可，无切换点问题；search 展示层仅作发现入口。

### 5.4 微信搜狗（相对 → 带年份完整日期）

| 时间格式 | 样本 |
| --- | --- |
| 相对时间 | `2分钟前` ~ `7小时前`（无 "x天前"） |
| 完整日期 | `2026-8-8`（当天）、`2026-1-19`、`2022-12-3`、`2018-5-22`（YYYY-M-D 无前导零） |

结论：搜狗无 "MM-DD 无年份" 中间态——相对时间直接切**带年份完整日期**，无隐藏年份问题。download 导出为 `2026年8月7日 11:26`（本地化完整时间）。

### 5.5 平台差异总表与结论

| 平台 | 发现层（search/feed） | 证据层（详情/数据） | 隐藏年份中间态 |
| --- | --- | --- | --- |
| 小红书 | `x天前` → `MM-DD` → `YYYY-MM-DD` | note 无时间字段（评论有） | ✅ 有，(219, 225] 天切换 |
| YouTube | 相对全程（时→天→周→月→年） | `publishDate` = ISO 8601 | ❌ 无（评论也全程相对） |
| 微博 | 相对/今天/MM月DD日 HH:mm | RFC2822 | ❌ 机器字段无此问题 |
| 微信搜狗 | 相对（分/时）→ `YYYY-M-D` | download 本地化完整时间 | ❌ 无（直接带年份） |
| B站 / 知乎 / Reddit / X | 证据层完整时间戳 | B站 `2026-08-06 10:18`、知乎 ISO、Reddit unix 秒、X RFC2822 | 不涉及 |

**核心结论**：

1. **"隐藏年份 → 半年内"假设只适用于小红书这类展示层**，不是普遍规则；该假设作为平台行为参数，不进入解析规则本身。
2. **多数平台的证据层（详情命令）给机器可读完整时间戳**（YouTube ISO、微博 RFC2822、Reddit unix、B站完整时间、知乎 ISO、X RFC2822）。采集应**优先使用证据层字段**，展示文本解析（相对时间换算）是证据层缺失时的兜底。
3. 真正需要"相对 → 绝对"换算的：YouTube search/评论（全程相对）、微信 search（相对 → 带年份日期）、小红书展示层（相对 → 无年份 → 带年份）。
4. 新发现格式：`x周前`（week 精度，YouTube）、`MM月DD日 HH:mm`（微博展示层）、`YYYY-M-D` 无前导零（微信）、`直播时间：`前缀（YouTube 直播变体）。

## 6. 待办与后续

- [x] 其他平台的"隐藏年份切换点"实测：YouTube / 微博 / 微信已实测（2026-08-08，见 §5.2~5.4）；结论是"隐藏年份"非普遍规则，多数平台证据层给机器可读时间戳。
- [ ] 通用信息模型落地路径决策（§3.6 的 A/B/C）与 Phase 1 合同的兼容方案。**已定稿：路径 C（2026-08-08）。**
- [ ] Publisher 独立实体的存储与索引设计（Phase 2 Subject 前身）。**已定稿（2026-08-08）：内嵌 JSON，Phase 2 物化。见 §7.1。**
- [ ] 时间解析器实现 Task：精度族识别（含 week）、非时间成分剥离（地域/修饰词/前缀）、排序比较器、失败降级。
- [ ] 平台行为参数（默认时区、隐藏年份切换点、时间展示策略）的配置形态：Connector 声明（format 族 + 证据层优先字段）。
- [ ] 证据层优先原则进入 Connector 合同：Connector 应优先返回机器可读时间字段（ISO/RFC2822/unix），展示文本解析仅作兜底。
- [ ] 路径 C 落地实现（远端同步后对象明确）：改 `NormalizedIngestItem`（加 kind/publisher/metrics）+ 升级 `plugins/collectors` 的 Bilibili 标准化（author 从 summary 挪到 publisher）+ 替换简化版 `normalizeDate`。见 §8.2。

## 7. 路径 C 落地设计点（已定稿）

> 2026-08-08 讨论记录。以下三个设计点是路径 C 落地时绕不开的选择，已列出选项与推荐，**尚未拍板**。

### 7.1 设计点 1：Publisher 存储形态（已定稿：C 内嵌 JSON）

背景：合同层已定 Publisher 独立结构；但 RSS 渠道 publisher 很弱（通常只有 author 字符串、无稳定平台 ID），社交渠道才有 uid/mid/channelId。

现状事实（2026-08-08 查证）：
- 存储层已有成熟内嵌 JSON 模式：`sourceLocatorJson`、`discoveryContextJson`、`configJson` 全是 String 列存序列化 JSON（Prisma SQLite 无原生 Json 类型）。合同层结构化、存储层 String，是 Phase 1 已用同构做法。
- RSS Connector 目前直接丢弃 author（只处理 title/guid/pubDate），路径 C 第一刀是"把作者接进来存上"而非改造。
- SQLite 内置 JSON1：`json_extract(publisherJson, '$.name')` 可精确取字段（不误伤"张伟"vs"张伟东"），且支持表达式索引（`CREATE INDEX ... ON EntryRevision(json_extract(publisherJson, '$.name'))`）。这类 SQLite 专用查询走受控 SQL Adapter，不泄漏到 domain/contracts。

定稿方案：

| 层 | 做法 |
| --- | --- |
| 合同层 | `NormalizedIngestItem.publisher: Publisher \| null` |
| 存储层 | `EntryRevision.publisherJson String?`——同 `sourceLocatorJson` 模式，零新模式 |
| 查询 | Phase 1 不建；Phase 2 按作者筛选时，受控 SQL Adapter 用 `json_extract` + 表达式索引 |
| 物化触发条件 | 出现"跨 Entry 聚合作者"真实需求（Phase 2 Subject，或社交渠道 Connector 带来稳定 `platformId`）时，JSON → 独立表，纯数据迁移可全量重放 |

放弃方案 B（独立表）的理由：Phase 1 场景 RSS 作者无平台 ID，只能按 name 字符串 dedup，产出一堆 `platformId: null` 空壳行，还需 upsert/孤儿清理——为用不上的能力付当前成本。C 的唯一代价是物化迁移，而迁移可全量重放、可逆。

### 7.2 设计点 2：Feed 展示是否带 publisher（已定稿：带显示名）

背景：当前 `feedItem` 有 sourceName（来源名）但无作者；信息流基本可读性是"标题 + 作者 + 时间"。

现状事实（2026-08-08 查证）：web Feed 卡片显示 `sourceName`（订阅源名），Feed SQL 投影 `s.name AS sourceName` 来自 SourceInstance，无作者。

定稿：**带 publisher（仅显示名）**。`feedItem` 加可选字段 `publisher: { name } | null`（向后兼容），Web 卡片在标题上方加一行作者。`sourceName`（订阅源）与 `publisher.name`（作者）并存，语义不同。RSS 无 author 时 publisher 为 null，不阻塞。

### 7.3 设计点 3：metrics 的 capturedAt 刷新策略（已定稿：A 快照覆盖）

背景：指标是时点快照，likes/views 变化快；指标变化若触发 EntryRevision 会违反"只有语义实质变化才产生 Revision"（0002 §4.7）。

定稿：**A 每次采集覆盖最新快照 + capturedAt**。指标存 Entry（不属于任何内容版本），`fingerprintEntryRevision` 只含内容字段，metrics 明确排除——点赞变化不出新 Revision。capturedAt 保留快照时间，Phase 4 trend 投影可重放。放弃 B（指标进 Revision，污染修订历史）与 C（独立历史表，Phase 1 无消费者）。

### 7.4 三个设计点定稿汇总

| 设计点 | 定稿 | 核心依据 |
| --- | --- | --- |
| 7.1 Publisher 存储 | C 内嵌 JSON（`publisherJson`，同 `sourceLocatorJson`） | SQLite JSON1 + 表达式索引消掉 LIKE 顾虑；物化可重放 |
| 7.2 Feed 带 publisher | 带显示名（`feedItem.publisher: { name } \| null`） | 阅读基本体验，纯增量向后兼容 |
| 7.3 metrics 刷新 | A 快照覆盖（Entry 上存最新 + capturedAt） | 指标是投影，不进 Revision；避免污染修订历史 |

共同取向："最小成本、给未来留路"——Publisher 内嵌、Feed 带显示名、metrics 只存最新快照。路径 C 落地时直接按此执行。

## 8. 远端同步影响评估（2026-08-08）

> 事件：同步 `origin/master` 3 个 commit（t3 runtime logging + t4 workflow runtime + 架构文档），架构 0001 从 v0.10 升到 v0.15，新增 `packages/logging`、`plugins/collectors`、ADR `0001-durable-workflow-runtime`、Task 03/04。

### 8.1 最重要事实：调研已固化为 Phase 1B 实现

`plugins/collectors` 包基于六平台调研落地了 **Bilibili + AI HOT** 两个 Connector：

- Bilibili Connector 用 OpenCLI 作内部执行器，**受限 `hot`/`feed` 两种 mode**（用户不能提交任意 command）——正是调研"低频登录态采集执行器"结论。
- 退出码/前置检查落码：`exit 66 → 空 items`；doctor 检查 Browser Bridge（extension not connected → `dependency_unavailable`）。
- `contracts` 新增 per-source 配置 schema：`bilibiliSourceConfigSchema`（mode + OpenCLI profile 引用）、`aiHotSourceConfigSchema`。
- **`sourceKindSchema` 从 enum 改为自由字符串**——加平台不改核心合同，与"宽容合同"方向一致。

### 8.2 对当前设计的三处印证

1. **路径 C 缺口实锤**：`normalizeBilibiliOutput` 提取 `author` 却塞进 `summary`/`contentText` 凑数（无 publisher 字段），且无 kind（hot listing 与 video 未区分）。`NormalizedIngestItem` 只加了 `rawPayloadMimeType`。**publisher/kind/metrics 完全没被预占，Bilibili 是路径 C 的第一个落地场景。**
2. **时间模型是升级对象**：collectors 的 `normalizeDate` 是简化版（`new Date` + unix 特判），解析不了 `07-29湖南` 等展示文本。§4 完整时间模型（精度族 + 隐藏年份 + 非时间成分剥离）是明确升级路径，collectors 是第一块试金石。
3. **DiscoveryContext 雏形已存在**：Bilibili 的 `sourceLocator: { provider, mode: "hot"|"feed", rank }` 中 `mode` 即发现上下文，落地 `context` 时直接对齐。

### 8.3 对当前设计的两处修正

1. **新增 §4.6 Connection/Secret/State 边界**（架构 0001）：
   - `xsec_token` 签名 URL 归属 **`ConnectorStateStore`**（非秘密状态，Cosmos 管命名空间/版本/备份）——§3.5 的 `url.signed` 设计引用此边界；
   - OpenCLI profile 是**登录态管理例外**（Cosmos 只存 profile 引用，不存 Cookie/Token）——Publisher 设计不碰凭证；
   - Secret 不进入 Job payload、DomainEvent 或日志。
2. **术语变更 Flow → Workflow**（v0.15 统一）：`Flow` 仅保留为历史旧称。本纪要少用 Flow，基本不受影响，后续转正架构文档时用 `Workflow` 措辞。

### 8.4 节奏影响

PROJECT-STATUS 原话："本轮不扩大 Phase 1 实现范围。继续增加更多平台 Adapter 前，优先建立 Connection/Secret/State、脚本优先 Workflow API、持久子任务、Knowledge/Research Workflow、Proposal/Provenance 和 `nb-memory` Adapter 的实现 Task。"

- 知乎/微博/微信等更多平台 Adapter **被明确后置**，先做 Workflow/Connection 基础设施。
- 路径 C 落地对象当前为 **RSS + Bilibili/aihot**；Bilibili 本机 Browser Bridge 未连接（AI HOT 真实保存已通过）。
- 我们的通用信息模型/时间解析器设计不受此节奏影响，但首个真实消费场景是 Phase 1B 的 collectors，而非新增平台。
