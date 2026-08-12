# API 场景与 Conformance 草案

> 状态：Draft v0.2
>
> 入口：[`README.md`](README.md)

## 1. 目的

API 是否完整不能只靠端点数量判断。本文件用原始需求中的用户场景、运行时故障和
部署变化检查：

- 是否缺少必要资源或状态；
- 是否有人绕过 Application Command/TaskStore；
- 是否能在断线、重启、重试和旧 lease 下保持正确；
- 是否把未来能力伪装成当前已实现；
- 是否能让 Web、CLI、Desktop 和远程 Worker 使用同一语义。

## 2. Product 场景

### S01：断开外网后阅读已保存内容

```text
API ready
Worker unavailable
Upstream unavailable
-> Feed/Search/Story/Entry/Asset 仍可 Query
```

验收：

- `/readyz` 仍可 ready；
- `/api/v1/health` 显示 Worker/Upstream degraded；
- Feed/Search 不等待 Worker 或 LLM；
- 未保存媒体返回明确 Asset status；
- Web 不使用外部 URL 代替本地正文。

### S02：创建 RSS Source 并手动录入

```text
SourceDefinition -> Source -> Probe -> WorkflowRun -> Event -> Feed
```

验收：

- Source config 按 manifest schema 校验；
- Probe dry-run，不写 Observation/Entry/checkpoint；
- 手动 Run 使用 Idempotency-Key；
- Run 可以查询 Activity/Job/Attempt；
- duplicate poll 不新增 Entry；
- 修订产生 EntryRevision，旧 Observation 保留；
- SSE 重复事件可幂等应用。

### S03：同一 Bilibili Connection 下两个采集计划

```text
Connection
├─ dynamic / every 30m / checkpoint A / budget A
└─ recommendation / every 2h / checkpoint B / budget B
```

验收：

- AuthorizationSession 不返回 Cookie/Token；
- 两个 CollectionPlan 的 Trigger、checkpoint、错误和 overlap policy 独立；
- 停用 recommendation 不影响 dynamic；
- 撤销 Connection 使两个计划不可执行，但不删除已录入 Entry；
- Worker 不由用户指定。

### S04：无 URL 群聊消息

验收：

- Observation 使用 OriginLocator；
- Entry 有 Cosmos 内部地址；
- Query/Annotation/Story provenance 不要求 webUrl；
- external key 规则版本化；
- 同标题/时间但不同 conversation locator 不错误合并。

### S05：Knowledge Workflow 处理 Entry

```text
EntryRevision
-> deterministic rules
-> difficult/important subset
-> optional Agent Action
-> Proposal / KnowledgeSignal
```

验收：

- Entry 已先持久化，不等待模型；
- Query 是 journaled Activity，不在 replay 时偷读新数据后复用旧结果；
- Proposal 引用精确 input Revision/producer/version/evidence；
- LLM 不直接改 Observation；
- 人类字段保护和 base revision 冲突可表达；
- 模型不可用时确定性路径仍可运行。

### S06：紧急信号派发 Research

```text
KnowledgeSignal(needs_research)
-> ResearchRequest
-> Trigger
-> Research Workflow
-> external search Action
-> Ingest Command
-> Observation / Entry
```

验收：

- Signal 与 Request 是两个对象；
- Request 幂等、可取消、有预算和循环深度；
- 外部结果不直接写 Story；
- 研究失败不回滚原 Entry；
- 结果能回到 Request/Run/查询目标/discovery context。

### S07：Story merge/split 与旧链接

验收：

- merge 使用 base revision 和 canonical ID；
- 旧 ID 查询返回 alias/canonical；
- split 返回历史壳和全部 successors，不选择模糊单一重定向；
- Annotation、Artifact provenance 和 Topic membership 不丢失；
- split 后用户状态不自动复制到所有 successors；
- SSE 只携带变更引用，客户端重新拉取 Snapshot。

### S08：推荐 Feed 与反馈

验收：

- Feed unit 是 Story；
- impression/open/read/hide/not_interested 带 surface；
- 展开具体来源后才记录 Entry interaction；
- ranking policy/version/reasons 可查询；
- 同 Source/Story 不无界占满结果；
- LLM unavailable 时 Feed 仍工作；
- `last_seen_revision_id` 能派生 updated 状态。

### S09：Workspace 更新失败

```text
current Artifact Revision v1
-> WorkspaceUpdate running
-> candidate v2
-> failure
-> current remains v1
```

验收：

- Update、Workspace lifecycle、freshness 和 InteractionState 分离；
- UI 可查询当前 Step/Run/错误；
- failure/cancel 不切 current revision；
- success 在一个领域收口边界发布；
- 并发 Update 的 base revision 冲突不静默覆盖。

### S10：知识管理者通过 Web/CLI 操作

验收：

- Conversation 是入口上下文，不等于全部长期记忆；
- 具体 Source/Topic/Research 操作调用普通 Product Command；
- 对话消息关联 Agent Invocation Run；
- 多 conversation 可以共享 memory scope；
- Harness Session 内部字段不泄露为数据库/API 真相；
- 当前单用户高权限也不能绕过持久 Run 和外部副作用账本。

### S11：08:00 Publication 与多渠道 Delivery

验收：

- Publication 冻结精确 Story/Workspace/Artifact revisions；
- 网页、图片、消息正文来自同一 PublicationRevision；
- 每个 channel 有独立 DeliveryIntent/Attempt/Receipt；
- Telegram 成功、Email uncertain 可以同时表达；
- Worker 重启不盲目重复发送；
- retry/reconcile 受 channel capability 控制。

### S12：Source 删除、Connection 撤销与数据删除分开

验收：

- 停用只阻止未来 Trigger；
- 删除 Source 配置不默认删除 Observation/Entry；
- 撤销 Secret 不删历史；
- DeletionPlan 先显示引用和不可恢复范围；
- 执行删除有 Run、幂等和失败恢复；
- Cache cleanup 不误删用户真相或被引用 Artifact。

## 3. Runtime 与 Worker 场景

### R01：Direct Worker 正常执行

- SQL claim 创建当前 Attempt；
- heartbeat 只续当前 token；
- output schema 校验；
- Host 写领域事实/Event/Outbox；
- terminal 后 token 清除；
- 相同 Idempotency-Key 不重复领域写入。

### R02：Gateway Worker 正常执行

- Session 握手精确匹配 Action manifest；
- long-poll 返回已经 claim 的 Job；
- heartbeat 返回服务端 lease 时间；
- Result submission 丢响应后，重试返回 duplicate；
- Gateway 无进程内 Job terminal truth。

### R03：Worker 在外部调用前崩溃

- external Receipt 已写 started 或尚未调用；
- lease 过期后新 Attempt 可以接管；
- 如果没有 committed/unknown evidence，按 Action retry policy 处理；
- 旧 Worker 恢复后不能用旧 token 提交。

### R04：外部调用成功后、提交前崩溃

- Receipt 状态至少为 started；
- 恢复时转换 unknown 或通过 externalRef 查询；
- 不自动把 unknown 当失败重发；
- reconcile 后才能 applied/compensated；
- Product API/UI 明确显示 unknown。

### R05：Result 到达时 lease 已被接管

- Gateway 返回 `lease_lost`；
- output 不写 Job/Activity/领域；
- 如果外部 effect 可能发生，允许追加 unknown evidence；
- 当前 owner 不被泄露；
- 旧 Attempt 终态可审计但不覆盖新 Attempt。

### R06：父 Run 取消

- 当前和后代 Run/Job 进入取消传播；
- Attempt heartbeat 得到 cancellation_requested；
- cooperative Action 停止；
- 不可取消外部 Action 最终进入 committed/unknown；
- 迟到 success 不覆盖 cancelled；
- optional Step projection 跟随事实，不拥有取消真相。

### R07：Session replacement

- registration generation 增加；
- 旧 Session 不再 claim；
- 当前 Attempt 不因 workerId replacement 自动变成另一个 owner；
- 新 Session 只能显式 resume 未过期且 ownership 匹配的 Attempt；
- 旧/新 Session 不能同时 heartbeat 同一 Attempt。

### R08：Drain

- acceptingWork 先变 false；
- 无新 claim；
- 当前 Attempt 继续 heartbeat；
- 全部收口后 registration stopped、资源关闭、进程退出；
- deadline 到达但仍有外部 Action 时不伪装 clean shutdown；
- 重复 drain 幂等。

### R09：WakeupBus 丢失、重复或不可用

- SQL fallback polling 最终 claim；
- 重复 Wakeup 不产生双 owner；
- Redis unavailable 不改变 Job terminal；
- Worker readiness 可以 degraded，但 Direct Worker 不必退出。

### R10：Gateway/NestJS 多副本

- 任一副本都可以处理 Session heartbeat/claim/result；
- 不依赖 sticky session；
- Session/registration 和 Attempt ownership 可从共享 Backend 验证；
- 两个 Gateway 同时 claim 时只有一个 SQL lease 成功；
- 一个副本终止不丢 Job/Receipt。

### R11：Action manifest 在排队后变化

- Run 保存原 definition/action manifest snapshot；
- 只有精确 hash Worker 可 claim；
- 没有 capable Worker 时保持 queued/诊断，不擅自失败；
- 安装旧/兼容 executable 后可以继续；
- 不能用 ref 相同但 hash 不同的 Action 执行。

### R12：大值与 transfer 中断

- 超过 inline limit 返回 payload_too_large；
- 上传绑定 hash/size/Attempt；
- upload 完成但 Result 未引用时由 GC 清理；
- 下载断点/重试不改变 Job；
- hash mismatch 拒绝 Result；
- Value retired 时进入明确失败/恢复，不返回空对象。

### R13：Secret lease 过期

- Job lease 和 Secret lease 独立；
- Secret 解析失败不进入日志；
- 可安全刷新时获取新短期 lease；
- 不可刷新时 Action 返回 retryable/terminal 的明确 code；
- 旧 Secret 材料不进入 output、Receipt 或 Event。

### R14：时钟偏差

- lease/deadline 以服务端时间为权威；
- 握手/heartbeat 返回 serverTime；
- Worker 只按相对 heartbeat interval 调度；
- 本地时钟跳变不能让过期 lease 重新有效。

### R15：资源级并发和 overlap

- Worker slot、Workflow map、Provider/Connection rate limit 和计划 overlap 分开；
- 同计划 `forbid` 不启动重叠 Run；
- `queue` 保留一次或明确上限；
- `replace` 先取消旧 Run，再创建新 Run；
- `merge` 需要业务定义，不默认等于丢弃；
- 紧急/交互 lane 不被批量 ingest 饿死。

### R16：Session replacement 与 owner handoff

- replacement 先 fencing 旧 Session 的新 claim；
- 没有 resume 时，旧 Session 仍只能完成自己当前的 owner tuple；
- resume 以 `(attemptId, ownerSessionId, ownerEpoch, leaseToken)` 做 TaskStore CAS；
- accepted resume 轮换 token、递增 epoch，并立即拒绝旧 Session heartbeat/result；
- CAS 失败不改变 owner，也不产生第二个 Attempt；
- 旧进程只能追加受限 late evidence，不能完成 Job。

### R17：lease 丢失后的 external late evidence

- external claim 才获得 Attempt-scoped late-evidence capability；
- started 后外部请求成功、Result 前 lease 丢失；
- capability 只能追加 `external_effect_unknown`，不能续租、恢复 Secret 或提交 Result；
- 新 Attempt/当前 owner 不被覆盖；
- 重复 submission 幂等，不同 payload 冲突；
- capability 过期后保留本地诊断，系统不伪造“确定未发生”。

### R18：并发 long-poll、容量和响应丢失

- 同一 Session/lane 的 persisted maxConcurrency 是权威；
- 两个 Gateway 副本并发 claim 不得超过剩余 reservation；
- `slots.available` 只缩小 claim，不扩大持久容量；
- 超出 in-flight poll 上限返回 429/Retry-After；
- claim response 丢失后，同 Idempotency-Key 重放同一 batch/token；
- replay window 过期后不执行未知 claim，等待 lease 恢复。

### R19：Receipt CAS

- started 使用 base revision 0；
- committed 与 unknown 并发时由数据库 CAS 决定顺序；
- committed 后 unknown 被拒绝，unknown 可以由可验证 reconcile 升级 committed；
- 同 submission/fingerprint 返回 duplicate；
- 不同 payload 返回 conflict；
- 服务端 receivedAt/revision 决定顺序，Worker observedAt 只作证据。

### R20：deadline、drain 与 Session TTL

- draining Session 继续 heartbeat，但不 claim；
- Attempt expiry 不超过 Run/Action/drain deadline；
- Session TTL 不会在正常 drain 中提前杀死活跃 Attempt；
- deadline 到达后不再续租；
- 无法停止的 external Action 进入 late-evidence/unknown/reconcile；
- drain 不把仍活跃的 Attempt 伪装为 resources closed。

## 4. Transport 场景

### T01：SSE 正常回放

- Event ID 单调/稳定；
- 客户端重连发送 Last-Event-ID；
- 重复 Event 幂等；
- keepalive 不推动业务 cursor。

### T02：SSE replay window 已丢失

- 服务发送 `snapshot_required.v1`；
- payload 指出需刷新资源类型或 refs；
- 客户端 Query Snapshot 后，以最新 cursor 重连；
- 不把 gap 期间的状态靠猜测补齐。

### T03：协议不兼容

- Product API 和 Worker Gateway 分别协商；
- 返回 426 + supported versions；
- Web 协议不兼容不影响 Worker protocol；
- Worker protocol 不兼容不让 API 已保存内容不可读。

### T04：Idempotency conflict

- 同 key/同 payload 返回原结果；
- 同 key/不同 payload 返回 409；
- Command 指纹使用规范化 schema output；
- 错误包含 command/request ID，不包含原始 Secret。

### T05：Revision conflict

- PATCH/Command 提供 If-Match/baseRevision；
- 冲突返回当前 revision ref；
- 用户/Agent 可以重新读取、比较后提交新 Command；
- 服务不自动把旧 Proposal 应用到新 base。

### T06：文件读取

- 无 storage path；
- ETag/Range 合法；
- 未保存 Asset 返回元数据状态；
- HTML Artifact 隔离显示；
- 下载 capability 过期有明确 410/403。

### T07：部署与认证边界

- 未认证 Product API 只绑定 loopback/明确受信网络；
- CORS 不被当作认证；
- Worker Admin 默认内部绑定，Product identity 不自动获得 drain 权限；
- Gateway bootstrap identity 绑定 workerId、audience、generation、expiry 和
  capability policy；
- 公网 Product/Gateway 只有在 HTTPS、身份、撤销和文件 capability gate 完成后才
  可发布。

### T08：canonical bytes 与请求上限

- JSON 在解析/物化前受实际 body bytes 限制；
- RFC 8785 JSON、原始 UTF-8 text 和原始 Blob bytes 的 hash 跨实现一致；
- 声明 byteSize 与实际不一致被拒绝；
- upload finalize 验证 size/hash/media type；
- 中断、重复 finalize、abort 和 orphan GC 幂等。

## 5. Contract test 分层

### 5.1 Schema

- 每个 Command/Query/Snapshot/Event Zod schema 的 valid/invalid fixture；
- unknown enum 降级策略；
- Secret/lease/path 字段负面扫描；
- date/hash/cursor/value limit；
- current Phase 1 DTO 到新 DTO 的 migration mapping。

### 5.2 Product Transport

- method/path/status/header/body；
- Idempotency-Key；
- If-Match/ETag；
- pagination cursor；
- ServiceError 映射；
- SSE replay/snapshot_required；
- binary ETag/Range。

### 5.3 Worker Admin

- liveness 不访问 Backend；
- readiness 按 mode；
- status 不泄露 token/input；
- 重复 drain；
- active Attempt deadline；
- metrics label cardinality。

### 5.4 Worker Gateway

- protocol negotiation；
- Session generation fencing；
- capability/manifest exact match；
- atomic claim；
- persisted slot reservation、claim batch replay 和 long-poll backpressure；
- heartbeat/lease expiry；
- deadline-capped heartbeat 与 drain/session TTL；
- duplicate/conflicting result submission；
- Attempt owner epoch、replacement/resume CAS；
- Receipt transitions；
- late-evidence/unknown；
- resume/replacement/drain；
- inline/value upload/hash；
- Secret lease redaction；
- bootstrap identity/revocation；真实 Secret Broker 另行 gate；
- multi-Gateway race。

### 5.5 Backend conformance

Memory、Prisma SQLite 和未来 PostgreSQL Backend 运行同一行为套件：

- create/claim/renew/complete/fail/cancel；
- Run/Job/Attempt terminal invariants；
- external Receipt；
- Event/Outbox；
- wait/signal/timer/child；
- ValueRef；
- lease lost；
- TaskStore 无 Wakeup、重复 Wakeup、丢失 Wakeup。

Memory Backend 必须明确拒绝它不支持的 process restart/multi-worker capability。

### 5.6 Product acceptance

分别报告：

- focused schema/transport；
- application/backend；
- 全量 typecheck/test/build；
- Node production；
- browser；
- Docker/Compose；
- 真实 RSS/Bilibili/AI HOT；
- Worker restart/long-running；
- Gateway multi-host；
- Harness/Agent。

任何一层绿灯都不能替代未运行层。

## 6. 第一轮实施切片

本草案建议按以下切片落代码：

1. 公共 Header、ServiceError、Page、ValueEnvelope 和 EventEnvelope。
2. healthz/readyz/product health 分离。
3. SourceDefinition manifest-only 取代 executable `/connectors`。
4. 通用 WorkflowRun/Activity/Job/Attempt read DTO。
5. Run cancel/signal Command。
6. Worker Admin status/readiness/drain。
7. Direct Task Channel conformance。
8. Gateway fake/in-memory conformance，不接真实 Secret。
9. owner transfer、late evidence、Receipt CAS、capacity/backpressure fake
   conformance。
10. Gateway Prisma/PostgreSQL implementation 与 multi-host/真实认证验收。

Connection、Story/Topic、Knowledge/Research、Workspace、Board 和 Delivery 按各自
产品 Task 实现，但复用已固定的公共 DTO/Command/Event 约定。
