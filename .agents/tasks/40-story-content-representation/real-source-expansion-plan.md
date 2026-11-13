# Task 40：真实来源扩大验收计划

> 状态：**历史计划，已执行完成**。2026-11-05 四阶段验收通过并关闭 Task 40；2026-11-13 补充验收已收口，当前结论见 [Task 首页](README.md)与[主记录](walkthrough.md)。下文的待审批、未覆盖与复选框保留编制时语境，不代表当前待办或新的外呼授权。
> 
> 编制日期：2026-11-04
> 
> 计划编号：Task40-RealSource-A

## 背景与动机

Task 40 已完成隔离验收的 12 项批准验收点，并通过了维护者执行的一次真实 Provider 合成正文摘要验收。当前未覆盖项包括：

1. **真实来源 ingest 范围有限**：仅测试了历史隔离 RSS 10 条（固定合成 seed）
2. **真实用户库升级测试**：旧库迁移只在隔离环境验证过
3. **关系/质量真实任务**：未执行

根据 walkthrough 指引："先核对剩余批准清单，选择真实来源或关系/质量任务的有界组合并检查前置授权"。

**本计划选择：扩大真实来源覆盖**，验证完整的 RSS ingest → 内容解析 → 版本存储 → Story 阅读链路。

## 目标

1. 使用真实 RSS feed 验证完整 ingest 链路（非合成 seed）
2. 验证图文混排内容的实际解析质量
3. 验证媒体下载、Asset 绑定与降级行为
4. 确认内容表示版本管理在真实场景下的正确性
5. 通过产品浏览器验收完整阅读体验

## 范围

### 在范围内

- 使用 1-3 个真实公开 RSS feed（选择标准见下文）
- 验证完整 ingest 流程：fetch → parse → normalize → persist → query → render
- 验证图文混排、媒体引用、来源修订
- 验证旧内容兼容性（如果 feed 包含纯文本条目）
- 隔离数据库与文件根（遵循测试规范）
- 产品浏览器验收（真实 API/Worker/Web stack）

### 不在范围内

- 批量历史回填
- 音视频下载/转码
- 外部网页全文抓取
- 默认用户库升级（保持隔离）
- Agent 任务（本计划只覆盖 ingest + 阅读）
- 生产环境部署
- 长时定时轮询（单次 fetch 验收）

## RSS Feed 选择标准

按以下优先级选择 1-3 个公开 RSS feed：

### 必选条件

1. **合法公开访问**：无需认证、无爬虫限制、无版权风险
2. **内容稳定**：feed 长期维护、URL 稳定
3. **图文混排**：至少部分条目包含嵌入图片
4. **适度规模**：单次 fetch 返回 5-20 条 item

### 优选条件

1. 包含不同内容格式：纯文本、HTML description、混合布局
2. 包含媒体元数据：图片 alt、尺寸信息
3. 条目更新频率适中（便于未来验证来源修订）

### 候选 RSS 源

根据现有测试基础设施（`e2e/browser/collection-plan-multi.spec.ts` 使用本地 fixture），建议以下候选：

**方案 1：使用项目相关技术博客**
- Prisma Blog RSS: `https://www.prisma.io/blog/feed.xml`
- Next.js Blog RSS: `https://nextjs.org/feed.xml`
- 优点：技术内容、图文混排、稳定维护
- 风险：feed 格式变化可能性

**方案 2：使用知名新闻/媒体 RSS**
- BBC News RSS（选择特定频道）
- The Verge RSS
- 优点：内容丰富、更新频繁、格式稳定
- 风险：可能包含大量图片（需注意媒体策略）

**方案 3：使用 RSSHub 公共实例**
- GitHub Trending: `https://rsshub.app/github/trending/daily`
- 优点：内容稳定、格式可控
- 风险：依赖第三方服务可用性

**推荐：先使用方案 1 的 1-2 个源**，如果需要更复杂场景再考虑方案 2/3。

## 前置条件检查

### 必需前置

- [x] 代码基线干净（当前 `5e760e2`）
- [x] 隔离测试基础设施可用（`docs/testing/README.md`）
- [x] RSS Connector 实现完整（`plugins/rss/src/index.ts`）
- [x] 内容表示链路已实现（Task 40 walkthrough 确认）
- [ ] **网络访问许可**：需明确授权访问外部 RSS feed
- [ ] **选定具体 RSS URL**：需维护者确认使用哪些源

### 可选前置

- [ ] Docker（本计划不依赖，仍使用隔离本地栈）
- [ ] OpenCLI（本计划不涉及 Bilibili）

## 实施步骤

### 阶段 1：准备与计划确认（只读）✅

**状态**：已完成（2026-11-04）

**交付物**：
- ✅ `scripts/acceptance/real-source-ingest-plan.ts` (59 行)
- ✅ `scripts/acceptance/real-source-ingest-runner.ts` (273 行)
- ✅ `scripts/acceptance/real-source-ingest-acceptance.ts` (135 行)
- ✅ `--plan` 模式验证通过
- ✅ 环境变量多 URL 支持验证通过
- ✅ 类型检查通过

**实施详情**：

1. **创建验收脚本框架**
   - 参考 `scripts/acceptance/story-body-acceptance.ts` 结构
   - 新建 `scripts/acceptance/real-source-ingest-acceptance.ts`
   - 实现 `--plan` 模式：只读打印完整计划，不联网、不建库

2. **准备隔离环境**
   - 使用独立隔离根：`.agent/tmp/task40-real-source-{随机标识}`
   - 遵循测试规范的数据库隔离
   - 准备固定 schema/migration（来自入口声明的提交）

3. **定义验收合同**
   - RSS feed URL 列表
   - 预期 item 数量范围（5-20）
   - 图文混排条目最低数量（≥2）
   - 媒体下载成功率阈值（≥80%）
   - 内容表示完整性检查点

4. **报告 `--plan` 输出**
   - 提交计划供维护者审批
   - 等待明确授权后进入阶段 2

### 阶段 2：离线回归（无真实网络）

在获得计划批准后、真实执行前，先确保离线路径完整：

1. **运行现有回归测试**
   ```powershell
   bun run test  # 全量单元测试
   bun run typecheck  # 类型检查
   bun run test:e2e  # Node 进程 E2E（已知 recovery 超时）
   ```

2. **确认基线状态**
   - 记录当前通过/失败数量
   - 确认 Task 40 相关测试全绿
   - 已知 Node E2E recovery 超时不阻塞（记录在案）

### 阶段 3：真实 ingest 执行（有界一次）

**前提：阶段 1 计划已获批准，阶段 2 回归无新失败**

1. **执行真实 ingest**
   - 在干净已提交工作区的本地终端运行
   - 使用 `COSMOS_REAL_RSS_URL=<url1>,<url2> bun run scripts/acceptance/real-source-ingest-acceptance.ts`
   - 单次 fetch，不自动重试
   - 超时/失败后不得未经新授权重跑

2. **验证 ingest 结果**
   - Source 创建成功
   - WorkflowRun 成功完成
   - Entry 数量在预期范围内
   - Observation 包含完整 contentText
   - ContentRepresentation 生成成功
   - 块结构符合预期（文本块 + 媒体块按原顺序）
   - Asset 绑定与媒体状态记录

3. **验证内容质量**
   - 图文顺序保持（通过 blocks 顺序验证）
   - HTML 危险标签清理
   - 媒体引用完整性
   - parseWarnings 与 qualitySignals 记录

### 阶段 4：产品浏览器验收

1. **构建生产栈**
   ```powershell
   bun run build:api
   ```

2. **启动隔离服务**
   - API（loopback only）
   - Worker（使用阶段 3 的隔离数据库）
   - Web（生产模式）

3. **浏览器验收场景**
   - 访问 Feed 页面，确认 Entry 列表正确
   - 点击进入 Story 详情
   - 验证图文混排显示
   - 验证来源切换（如有多来源）
   - 验证媒体加载与降级提示
   - 验证空正文/损坏表示的降级

4. **截图与记录**
   - 记录关键验收点截图
   - 记录任何异常或降级情况

### 阶段 5：结果报告与清理

1. **生成固定字段报告**
   - 类似 `story-body-acceptance.ts` 的结构化输出
   - 包含：RSS URL、fetch 状态、item 数量、解析成功率、媒体下载成功率
   - 包含：版本信息、blocks 统计、质量信号
   - 包含：浏览器验收通过/失败清单

2. **保留验证数据**
   - 隔离数据库路径
   - 请求日志（脱敏）
   - 关键验收截图

3. **清理与还原**
   - 停止服务
   - 断开隔离数据库
   - （可选）保留隔离根供后续诊断

4. **更新 walkthrough**
   - 记录本次验收结果
   - 更新未覆盖项清单
   - 标记真实来源验收完成状态

## 验证门禁

### 必须通过

1. RSS fetch 成功（HTTP 200）
2. WorkflowRun 状态 = `completed`
3. Entry 数量 ≥ 5（如果 feed 包含足够 item）
4. 图文混排条目 ≥ 2
5. ContentRepresentation.status = `complete` 或 `partial`（允许部分失败）
6. 块结构有序（blocks 数组顺序与来源一致）
7. HTML 危险标签清理验证通过
8. 浏览器能正常渲染 Story 详情

### 允许降级

1. 媒体下载部分失败（记录失败原因，≥80% 成功率）
2. 某些条目解析为 `partial`（记录 parseWarnings）
3. 旧格式内容降级为 legacy text（如果 feed 包含）

### 不通过条件

1. RSS fetch 失败且非网络暂时性错误
2. WorkflowRun 失败或 `outcome_unknown`
3. 所有 Entry 解析失败
4. 图文顺序错乱
5. 存在未清理的危险 HTML
6. 浏览器无法渲染或白屏

## 风险与缓解

### 风险 1：外部 RSS 不可用

- **概率**：低-中（依赖网络与外部服务）
- **影响**：阻塞验收
- **缓解**：
  - 选择多个候选源（1-3 个）
  - 优先选择稳定的技术博客/知名媒体
  - 如果所有外部源失败，考虑使用 RSSHub 本地实例

### 风险 2：Feed 内容格式不符预期

- **概率**：低（选择标准已考虑）
- **影响**：验收覆盖不完整
- **缓解**：
  - 先用 `--plan` 模式检查 feed 内容
  - 如不符预期，及时调整 feed 选择
  - 记录实际覆盖范围与限制

### 风险 3：媒体下载大量失败

- **概率**：中（外部图片可能有防盗链/失效）
- **影响**：媒体验收不完整
- **缓解**：
  - 设置合理的成功率阈值（≥80%）
  - 记录失败原因（是否为预期的降级场景）
  - 媒体失败不阻塞整体验收（已有降级机制）

### 风险 4：Node E2E 超时持续存在

- **概率**：高（已知问题）
- **影响**：无（记录在案，不阻塞 Task 40）
- **缓解**：
  - 在报告中明确说明已知限制
  - 本计划不负责修复该问题

## 成功标准

### 最小成功标准

1. 至少 1 个真实 RSS feed 完成完整 ingest → 阅读链路
2. 至少 2 个图文混排条目正确解析与显示
3. 内容表示版本管理在真实场景验证通过
4. 产品浏览器验收核心场景通过

### 完整成功标准

1. 2-3 个真实 RSS feed 全部成功
2. ≥5 个图文混排条目验证通过
3. 媒体下载成功率 ≥80%
4. 所有浏览器验收场景通过
5. 无新引入的回归失败

## 时间估算

- 阶段 1（计划与脚本）：2-3 小时
- 阶段 2（离线回归）：0.5 小时（已有基线）
- 阶段 3（真实 ingest）：0.5-1 小时
- 阶段 4（浏览器验收）：1-2 小时
- 阶段 5（报告与清理）：1 小时

**总计：5-7.5 小时**

## 后续计划

本计划完成后，Task 40 的剩余验收项：

1. **关系提取真实任务** (`story.extract-relations`)
2. **质量审查真实任务** (`story.review-content-quality`)
3. Node E2E recovery 超时修复（可选，不阻塞 Task 40 完成）

每项仍需单独计划与逐次授权。

## 授权请求

**请维护者审批以下事项：**

1. ✅ 使用真实外部 RSS feed（待确认具体 URL）
2. ✅ 单次网络访问许可（fetch RSS feed）
3. ✅ 使用隔离环境（不影响默认用户库）
4. ✅ 保留验证数据用于后续诊断

**待确认：**

- [ ] 选定具体 RSS feed URL（建议：Prisma Blog 和/或 Next.js Blog）
- [ ] 确认媒体下载成功率阈值（建议：≥80%）
- [ ] 确认单次 fetch 是否足够（或需要验证轮询更新）

---

**提交人**：DSH Agent  
**日期**：2026-11-04  
**Task**：40（Story 内容表示与多模态阅读）  
**相关文档**：
- [Task 40 README](README.md)
- [Task 40 Walkthrough](walkthrough.md)
- [测试规范](../../../docs/testing/README.md)
- [可选验收](../../../docs/testing/README/05-optional-acceptance.md)
