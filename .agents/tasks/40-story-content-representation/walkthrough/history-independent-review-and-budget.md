# Task 40 历史记录：独立审查与预算修复

以下为已完成切片的原文归档；当前状态与有效决定见[主记录](../walkthrough.md)。历史授权不代表当前授权。

### 2026-10-26：指定路由独立审查计划

维护者要求先独立审查，再在另行明确授权后真实 Agent 验收，并按步骤本地中文提交。本轮另经明确选择批准一个小型 workflow，所有审查 Agent 固定 `jijiapi/gpt-6-luna`；不授权 Cosmos Provider 请求，不读取真实数据/凭据，不恢复 goal 或操作远端。基线 `3b46e9492db87ca034040dc0ea0dab058785e846`（工作区干净），Leader 唯一记录与修复写入者。

1. 两名 fresh-context 只读审查者分别检查内容/版本/证据/阅读与 Agent/队列/恢复/正式决定，先读测试再读实现，覆盖正确性、简单性、架构、安全、性能；Task40 当前树为准，重点比较 `31d9577..3b46e94`，不把旧完成声明当证据。
2. 每项 finding 必须有实际路径行号、触发条件、用户影响、合同依据与验证或未验证标记。Critical/Required 经 Leader 核实后先处理并回归，独立结论不由 Leader 自查替代；两名审查者均不能编辑、commit 或发公网请求。
3. 审查闭合后只准备真实 Agent 的准确请求清单：新隔离根、合成 Story、Provider/model、完整发送文本、单次传输/预算、TTY 无回显凭据、费用/留存和清理；等待新的逐次确认后才能运行，不复用 Task39 历史授权。若路由或安全执行入口不足，报告实际限制，不降级模型或自动重试。

审查 workflow-1fb660700b074977 已收集。内容审查提出两项 Required（先整读 Blob 再校验、structured source 缺总字节预算），均为静态发现，Leader 将补行为证据。另一会话无法访问 Windows 仓库（`fatal: cannot change to '/mnt/d/Otirik/Workstation/cosmos': No such file or directory`），未形成结论；已请具备仓库工具的同路由只读审查者补齐 Agent/恢复职责，不将失败会话当作通过。维护者另批准准备受控 Story 终端入口，但尚未授权真实网络请求；先闭合 Required。

预算修复（不增新平台/迁移/外呼），先 RED 后实现：
1. FileBlobStore 提供有界读取，正常/恰好边界成功，超限、读取中增长、非法限额拒绝；不依赖先 stat 后无界 read，文件句柄必须关闭。
2. rebuild 对保留的声明输入 JSON 在读取阶段限 1 MiB（含 JSON 编码开销）；超限、缺失、损坏 UTF-8/JSON 或无效声明明确 409，当前表示和原始来源不变。普通 Blob 读取合同不变。
3. structured source 按有序顶层块累计 UTF-8 JSON 字节（含嵌套、元数据、转义及结构），达到 1 MiB 停止后续块并标 partial；不先 stringify/encode 整个超大输入。正常输入及已有节点/深度/质量约束保持。复验后请独立审查者核对修复，再逐步本地中文提交。

### 2026-10-27：独立审查闭合与预算修复结果

- 路由固定 `jijiapi/gpt-6-luna`。可访问仓库的独立审查者完成内容职责后补齐 Agent/恢复职责，未再启动默认模型替代会话；不是两名均成功的审查。内容聚焦 9 文件/44 测试与 Agent/Kernel 5 文件/70 测试通过。五轴结论：正确性/安全两项 Required（重建先整读再解析、结构源总字节无界）；简单性/架构/性能未报告其它可核实问题。不代表无缺陷或浏览器整套通过。
- Leader RED：Blob/Normalizer/重建 3 文件/26 测试中 4 失败（pwsh-5e9e6bc21bc244c8）。修复位于原 owner：`FileBlobStore.readBounded` 单句柄 64 KiB 块并最多额外探测一字节，finally close；重建限 JSON 编码 1 MiB、严格 UTF-8/JSON/声明校验，失败 409 且不变更表示；结构源预算计 shell、逗号、嵌套、元数据与转义，超限保留完整有序前缀并标 partial。普通 Blob 读取、公开导出、数据库 schema 与权限不变。
- GREEN：独立审查者重新读取修复及测试，`bunx vitest run packages/application/src/content-input-budget.test.ts packages/application/src/content-normalizer.test.ts packages/application/src/content-rebuild.test.ts packages/blob-store/src/index.test.ts packages/storage-prisma/src/repository-ingest.test.ts`，5 文件/30 测试通过；`bun run typecheck:packages` 通过，原两项 Required 关闭，未报新 finding。覆盖精确上限、非法预算、JSON/Unicode 编码、深度/节点、缺失/过大/损坏重建及来源不变；读取期间增长的安全性来自单句柄循环代码审查，未做并发增长压力测试。
- Leader 最终 `bun run test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; bun run typecheck`：204 文件/1158 测试通过，186.78s，随后全仓类型通过（pwsh-61d9fe9c69d04f1a，exit 0）。一次测试数组类型推断报错已以显式 `readonly StructuredSourceBlock[]` 修正，无类型逃逸。文档门禁：`bun run docs:check`（1196 文件/0 失败）、`git diff --check`、`python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 通过（pwsh-547692c9af4e4acb，exit 0；396 文件、5 项既存 warning）。初次门禁仅主记录约 9.3k token 超标，已原文归档完成步骤恢复健康区，不放宽预算；staged diff 提交前复查。
- 本轮未运行浏览器、真实来源/Agent、用户库升级或部署；未读取用户凭据/数据。独立审查步骤闭合，Task40 仍 active。受控真实 Story 入口准备另成一步，先离线验证、披露准确请求并另获逐次确认；本次零 Provider 发送，终端无回显执行仍需本地真人 TTY。信心 B，仅按已授权步骤本地中文提交。
