---
parent: ../README.md
range: "原 README.md L17-L25、L59-L79、L85-L95、L134-L136；测试层、文档门禁、隔离与浏览器合同"
sealed_at: 2026-11-02
tags: [testing, browser, component-lab, migration, performance, ci]
tokens_est: 2948
---

# 测试层与浏览器合同

[返回测试入口](../README.md)。适用读者：修改测试层级、浏览器流程、组件实验室、迁移或性能回归的维护者。未来有效规则变化由入口指向新增或替代册；本封口册仅保历史证据。

`bun run test:e2e` 使用独立的 `vitest.e2e.config.ts`，先构建 API/Worker，再串行运行 `e2e/**/*.e2e.test.ts`。默认 `vitest.config.ts` 明确排除 `*.property.test.ts`；`bun run test:property` 使用独立的 `vitest.property.config.ts`，只收集当前三份 property 文件：`apps/worker/src/runtime.property.test.ts`、`packages/application/src/workflow-control.property.test.ts` 和 `packages/storage-prisma/src/workflow-host-store.property.test.ts`，不会扫描普通单元测试。

浏览器新增或改变用户流程时，回归测试落在 `e2e/browser/*.spec.ts`；可抽取的 URL 编解码、排序或状态转换等纯逻辑留在 unit 层。Task 必须把响应式与可访问性验收写成可观察条件；实际浏览器验证至少覆盖受影响 viewport、键盘操作、焦点/标签、console、page error 和失败网络请求。`test-results/` 中截图和 trace 被忽略，PR 通过外部附件提交必要的脱敏证据。

组件实验室的自动化验证分为两层。单元层比较 `apps/web/src/components/ui/*.tsx`、`apps/web/src/components/cosmos/*.tsx` 的公共组件模块与实验室注册表，拒绝未登记组件、不存在的模块、重复组件/场景 id、缺少默认场景、无效控件默认值和未登记 token；URL、localStorage 和 JSON 快照解析以 `unknown` 进入 Zod 边界，并覆盖非法输入不替换既有有效状态。该层属于默认 `bun run test` 与 CI Quality。

实验室新增或改变交互时必须在真实开发 Web 表面验证 `/dev/components`：组件/场景/视口/主题/配色 URL 可复现，前进后退正确，token 覆盖只影响预览画布，本地草稿可恢复，非法 JSON 导入保持原状态。浏览器验收覆盖 320、768、1024、1440 px、键盘与焦点、console、page error 和失败网络请求。生产 Web 还需在 build/start 后确认 `/dev/components` 返回 404，且实验室没有 Product API、SSE 或用户数据请求；开发态通过不能替代生产隔离验收。

数据迁移类改动必须在 `.agent/tmp/<name>-<uuid>/` 构造包含旧数据的隔离数据库：从受影响历史 schema 或最小 legacy seed 建库，执行待交付 migration，再断言字段映射、约束、索引和应用读取。全新空库 migration 只证明安装路径，不能替代旧数据升级。destructive contract 还需单独验证备份恢复和旧字段无活跃引用；具体命令与 seed 由 Task 记录，在形成稳定公共入口前不伪造通用脚本。

性能修复使用 Task 记录的确定性 seed 或本地生成器，数据位于 `.agent/tmp/`。修复前后必须使用同一数据形状、规模、环境、命令和测量口径并重复采样；墙钟阈值不进入默认 `bun run test`，优先用查询次数、查询计划/索引、复杂度或有界结果等确定性断言防回归。原始基准输出不入库，Task/PR 记录完整命令、数据规模、环境、样本统计、波动和结论。

## 文档治理

组件实验室的自动化验证分为两层。单元层比较 `apps/web/src/components/ui/*.tsx`、`apps/web/src/components/cosmos/*.tsx` 的公共组件模块与实验室注册表，拒绝未登记组件、不存在的模块、重复组件/场景 id、缺少默认场景、无效控件默认值和未登记 token；URL、localStorage 和 JSON 快照解析以 `unknown` 进入 Zod 边界，并覆盖非法输入不替换既有有效状态。该层属于默认 `bun run test` 与 CI Quality。

实验室新增或改变交互时必须在真实开发 Web 表面验证 `/dev/components`：组件/场景/视口/主题/配色 URL 可复现，前进后退正确，token 覆盖只影响预览画布，本地草稿可恢复，非法 JSON 导入保持原状态。浏览器验收覆盖 320、768、1024、1440 px、键盘与焦点、console、page error 和失败网络请求。生产 Web 还需在 build/start 后确认 `/dev/components` 返回 404，且实验室没有 Product API、SSE 或用户数据请求；开发态通过不能替代生产隔离验收。

外观主题回归边界：生产表面验证无存储时跟随系统、显式 Night 刷新保持并压过后续系统变化、“跟随系统”清除 key 后即时响应 `prefers-color-scheme`，以及 `<html>` 首帧属性正确；实验室表面验证同一持久偏好驱动 chrome，URL `theme/colorway` 仅控制预览根，token override 不泄漏。两类表面均监听 hydration/server-rendered HTML 匹配的 console/page error，并在 PC/平板宽度断言无页面级横向溢出；移动端 390px 随「移动端适配后置」（2026-09-17）暂停，见 `e2e/support/viewports.ts`。

`bun run docs:check` 要求治理入口存在、根 README 可达 Agent 治理入口，并锁定 canonical workflow 同时保留私密安全报告与普通非安全 Bug 的公开 Issue 路由。它检查根目录、`docs/`（排除原始需求与 research）、`.agents/`、`.local/README.md` 和 `.github/` 中活跃 Markdown 的相对目标文件或目录，并拒绝退休路径、反斜杠、仓库越界和 Windows 盘符绝对路径。query 和 fragment 不参与目标路径解析，门禁不校验标题锚点或代码行号是否存在。它不执行应用代码，也不替代类型检查、行为测试、构建或运行时验收；文档迁移和治理规则变更必须运行该命令。Markdown 结构、代码围栏和链接语义由 diff 人工审查，尾随空白由 `git diff --check` 检查。

## 隔离与进程

Node E2E 通过 `scripts/e2e/helpers.ts` 为每个场景创建 `.agent/tmp/<name>-<uuid>/`，分别放置 Data、Blob 和 Log Root，并调用 Prisma migration。API、Worker 和 Worker Admin 使用动态端口；测试不能假设 `9091` 空闲。Windows 停止进程树使用 `taskkill /t /f`，POSIX 使用进程组终止；所有测试在 finally 中停止服务。

受控 RSS recovery 使用 `scripts/e2e/controlled-rss.ts` 的真实 HTTP 请求、请求到达和 lease expiry 同步，不使用固定 sleep 伪造接管。验证从 API、SQLite、结构化日志和最终 Feed/Run 读取，不接受进程自报成功。

默认 ingest、scheduling、浏览器和 Windows smoke 通过受控本地 HTTP RSS 服务验证产品 `source.rss@1/fetch + feedUrl` 合同；Source 创建默认停用，测试必须再调用 activation command。`fixture-rss` 只保留在 Connector/迁移层测试，不得作为 Product API 或 Web 配置入口。

媒体获取测试使用 `fixtures/rss/basic.xml`（含不可达 enclosure 触发 `skipped`）和 `fixtures/rss/media-av.xml`（音视频 `metadata_only`）覆盖降级分支。Worker 通过 `COSMOS_MEDIA_ALLOWED_HOSTS` 环境变量放行测试媒体源，默认为空即拦截私网；该变量仅用于测试环境，不进入产品 Source 配置（ADR-0005）。

浏览器 Stack 由 `scripts/e2e/web-stack.ts` 管理隔离 API/Worker/Next 进程。动态 API 端口在 Next production build 前注入，Web 使用 same-origin `/api` rewrite；需要先安装 Chromium：

```text
bunx playwright install chromium
```

测试监听 `pageerror`、未预期 console error 和网络失败，并在 teardown 清理全部子进程。截图和 trace 位于被忽略的 `test-results/`，不作为业务状态来源。

浏览器断网场景（`e2e/browser/offline.spec.ts`）使用本地受控 RSS 与本地 SVG 图片（`fixtures/rss/offline-media.xml`、`fixtures/rss/media/fixture-image.svg`），不依赖真实外网；Browser 栈通过 `COSMOS_MEDIA_ALLOWED_HOSTS=127.0.0.1` 放行该测试媒体源，Playwright 再以路由拦截模拟断网并验证站内 `/api/v1/assets` 图片加载。

安全漏洞的完整复现命令、载荷和原始证据只留在 `.agent/tmp/` 或批准的私密报告渠道。公开测试使用能证明授权、containment 或校验边界的泛化输入；Task、PR、截图和日志只写脱敏摘要，不能为了“完整命令”暴露漏洞细节。

## CI 分层

`.github/workflows/ci.yml` 将质量、Node E2E、浏览器 E2E 和 Windows smoke 分为独立 job。质量 job 依次执行 `bun run docs:check`、数据库检查、类型检查、单元测试、属性测试、Web lint 和构建；Node/browser/smoke job 分别报告自己的结果。当前 workflow 未按路径跳过 job，因此纯文档 PR 在远端仍运行完整默认 CI；本地最短路径只要求文档门禁、人工 diff 审查和 `git diff --check`。Docker 和真实来源没有加入默认 CI。
