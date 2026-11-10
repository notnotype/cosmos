# Provider/model 配置与调用合同

> 状态：Draft · Task 39 目标合同，部分实现。已实现并通过隔离测试：Provider/模型创建与编辑、Provider 删除、凭证写入与清理补偿、同步发现、`agent.invoke@2` 执行链路；整条产品流程（配置服务商 → 发现模型 → 配置模型 → Agent 调用）有一条隔离端到端验收，另有一次真实 `agent.invoke@2` 最小请求（HTTP 200）。
>
> **Task 41 更新（2026-11-10）**：Connection 不再承担模型选择职责，`ConnectionInstance.modelId` 已删除。Agent 调用改用系统默认模型（`SystemConfig.defaultModelId`）或显式传入 `modelId`，不再通过 Connection 解析模型。`ConfiguredModel` 新增可选 `inputPricePerMillion` 和 `outputPricePerMillion` 用于成本计算。
>
> 不再实现（本文其余部分对它们的描述是历史目标，不是当前行为）：`GET /model-providers/:id/connections`——「编辑 Provider 前提示受影响的连接」改由 Web 用连接列表与模型列表自行聚合，代价是它只是界面提示，不是服务端保证；Provider 删除的实际形态是同步 `DELETE /model-providers/:id`（204），不是本文原设计的 202 OperationSnapshot，改回需要单独决定。真实外呼已按住址、单次传输与逐次授权执行过两次（`@1`、`@2` 各一次 HTTP 200），仍不授权部署、批量外呼或其它 Provider。
>
> 产品决策：[已接受 Proposal](../proposals/connection-credential-entry-v1.md)；Task 41 变更：[Proposal](../proposals/connection-agent-profile-separation-v1.md)；过程和验证：[Task 39](../../.agents/tasks/39-pi-ai-adapter/walkthrough-provider-model.md)、[Task 41](../../.agents/tasks/41-connection-agent-separation/README.md)。

## 所有者与首个消费者

数据库保存 Provider、模型、Connection 选择和非秘密操作进度；SecretStore 独占 key 值。Web 模型页通过 Product API/transport 写配置；可信 Worker 读取调用所需配置与凭证。API 可通过应用服务写入凭证，不提供凭证读取接口；发现由 API 在单次请求内执行一次受控只读目录请求，生成由 Worker 执行，API 不加载 SDK executable。API 的保存成功不是认证通过。

## DTO 与输入约束

- ProviderSnapshot：id、name、api（openai-completions/openai-responses）、baseUrl、version、state、credentialState（configured/cleanup_pending）、createdAt、updatedAt。不返回 secretRef、key、尾号或上游错误。state 的 schema 允许 active/deleting 两值，但同步删除不产生中间态，当前实现只会写出 active；保留 deleting 是为将来引入异步删除时不改 DTO。
- ModelSnapshot：id、providerId、modelId（上游标识）、name、contextWindow、maxOutputTokens、version、createdAt、updatedAt。首版纯文本，无能力自动推断；输出上限不得超过上下文窗口。Provider 内 modelId 唯一，Provider 名称不是身份。两个时间戳与 ProviderSnapshot 一致：存储层一直记录它们，读取快照若漏掉会在严格校验处失败。
- 配置名称 1–200 字符；上游模型标识 1–200；baseUrl 最多 2048；token 上限为正安全整数；API key 非空、最多 8192 字符、禁止 CR/LF，不 trim 后改写真实值。模型支持范围由协议测试证明，不接受任意 JSON 配置。
- CreateProvider：name/api/baseUrl/apiKey；UpdateProvider：expectedVersion 与可选 name/api/baseUrl/apiKey，至少一项修改。key 省略表示保留，空字符串不表示删除。只在这两个命令接收 key；所有对象 strict，拒绝额外字段。
- CreateModel：modelId/name/contextWindow/maxOutputTokens；UpdateModel：expectedVersion 和可选同类字段。模型不可移到其它 Provider。
- 列表统一 {items,nextCursor}，limit 默认 50、最大 100；游标只含不透明标识，不含凭证；按 id 稳定排序，不宣称跨页事务快照。

## Product API 路由（/api/v1）

状态列有「已实现」「路径不同」「不实现」「已退役」四种，只有「已实现」的那几行是当前行为；「路径不同」是本轮保留的过渡形态，「不实现」是明确放弃的目标、不会再做，「已退役」指已从合同移除、不再提供。

| 路由 | 输入 | 成功 | 首个消费者 | 状态 |
| --- | --- | --- | --- | --- |
| GET /model-providers | limit/cursor | 200 Page<ProviderSnapshot> | 模型页 | 已实现 |
| GET /model-providers/:id | 无 | 200 ProviderSnapshot | 编辑与恢复 | 已实现 |
| GET /model-providers/:id/connections | limit/cursor | 200 Page<{id,name}> | 编辑前影响提示 | 不实现 |
| POST /model-providers | CreateProvider，Idempotency-Key | 201 ProviderSnapshot | 创建提供商 | 已实现 |
| PATCH /model-providers/:id | UpdateProvider，Idempotency-Key | 200 ProviderSnapshot | 保存 | 已实现 |
| GET /model-providers/:id/models | limit/cursor | 200 Page<ModelSnapshot> | 模型列表/Connection 选择 | 已实现 |
| GET /model-providers/:id/models/:modelId | 无 | 200 ModelSnapshot | 单项读取/编辑回填 | 已实现 |
| POST /model-providers/:id/models | CreateModel | 201 ModelSnapshot | 手动添加/确认候选 | 已实现 |
| PATCH /models/:id | UpdateModel | 200 ModelSnapshot | 编辑模型 | 路径不同 |
| POST /models/:id/removals | expectedVersion | 200 {ok:true,id} | 删除模型 | 路径不同 |
| POST /model-providers/:id/removals | expectedVersion，Idempotency-Key | 202 OperationSnapshot | 删除 Provider | 路径不同 |
| GET /model-configuration-operations/:id | 无 | 200 OperationSnapshot | 保存/清理恢复 | 已实现 |
| GET /model-configuration-operations/by-key/:key | 无 | 200 OperationSnapshot | 幂等键重放前查状态 | 已实现 |
| POST /model-configuration-operations/:id/retries | 空对象 | 202 OperationSnapshot | 本地清理重试 | 已实现 |
| POST /model-providers/:id/discoveries | expectedVersion | 200 DiscoverySnapshot | 同步发现，一次只读请求 | 已实现 |
| GET /model-discoveries/:jobId | 无 | 已退役 | 发现不再产生可轮询任务 | 已退役 |

「路径不同」的三行，当前实现都挂在 Provider 下：`PATCH /model-providers/:providerId/models/:modelId`（200 ModelSnapshot）、`DELETE /model-providers/:providerId/models/:modelId`（204，空响应体，不返回 `{ok,id}`）、`DELETE /model-providers/:providerId`（204，空响应体，body 为 `{expectedVersion}` 并需要 Idempotency-Key；被连接引用的模型让它返回 409 `in_use`）。改回上表形状或把上表改成当前形状，需要单独决定；在决定前按当前实现调用。

配置写入命令返回 X-Cosmos-Operation-ID，key 提交前 Web 先生成 Idempotency-Key；同 key 可查询 GET /model-configuration-operations/by-key/:key，不需重新发送 key。OperationSnapshot 仅 id/kind/providerId/state/errorCode/resourceVersion，状态 pending/completed/failed/cleanup_pending；key 不得被存为命令 payload、指纹或重放缓存。服务端已登记的同幂等键重传只返回既有操作状态，绝不再次执行或用重传内容改变配置。客户端不自动重传 key；首次响应未知时先查状态，确认为不存在才让用户重新填写。

错误用固定 code/message/retryable 和安全 operationId；400 invalid_input，403 forbidden_origin，404 not_found，409 already_exists/version_conflict/in_use/operation_in_progress，413 payload_too_large，503 credential_write_failed/cleanup_pending/dependency_unavailable。已配置模型写入的 `already_exists` 表示同一服务商下已有同一 `modelId`（唯一约束），重试不会成功，必须人工确认已有条目。`in_use` 表示删除被 Connection 引用的模型：删除在事务内检查引用后返回 409，不再退化成可重试的依赖错误；只要引用还在，重试不会成功。同步发现另有 409 `credential_missing`（Provider 还没有可用凭证），它是当前实现的一部分，不在上面的通用清单里。冲突响应目前只带 code/message/retryable 与可选 operationId；返回受影响连接 id/name 与 hasMore 仍是目标、未实现，客户端需要自己列连接来提示影响面。所有响应 no-store，校验错误不序列化输入值/SDK error/stack。

操作收据保留已确认的发布冲突原因：未发布且补偿完成后，failed/errorCode 为 version_conflict 或 operation_in_progress；查询、幂等重传和显式恢复返回同一持久化原因。补偿未完成时 state=cleanup_pending 优先表示仍需清理，errorCode 可保留原始冲突，完成清理后再进入 failed；消费者应先判断 state。没有已确认冲突原因的未发布失败使用 credential_write_failed。发布异常必须先回读提交阶段，已发布配置不能因异常分类变成失败。

## 凭证协调与恢复

创建/替换在数据库先登记非秘密操作与新独占 ref，再写 SecretStore，最后在事务内 CAS 发布 Provider 引用。未完成发布的 ref 不可调用；每个 Provider 一次仅有一个写操作，版本冲突在读取 key 之前拒绝。key 不持久化到操作记录；崩溃后不自动重放写入。可根据已登记 ref 回收未发布文件，不扫描无关文件；put 失败也需处理部分写入。

发布成功即后续调用读取新配置；旧 ref 的本地删除独立记录。清理失败返回 cleanup_pending 和当前已提交版本，不能把已生效配置声称为“未保存”，UI 显示“配置已保存，本地旧凭证清理未完成”。重试只删除该操作拥有且已无活跃引用的 ref，不重传 key、不外呼；删除返回不存在视为完成。普通读取不得为显示状态而读取 key 内容；configured 只代表已提交关联，不保证文件仍在或认证有效。

删除 Provider 是同步的单事务操作（`DELETE /model-providers/:id`，body `{expectedVersion}`，成功 204 空响应体）：同一事务内校验版本、确认没有进行中的写操作、检查 Provider 及其模型不被任何 Connection 引用，通过后删除模型和 Provider；事务提交后再删本地凭证文件，删除失败只记日志——行已删即视为完成，残留文件是可清理垃圾，不需要操作收据或 deleting 中间态。被引用时整个删除拒绝（409 `in_use`），不做部分删除。单删模型在同一事务内检查引用，不删除共享 key。所有关联创建/更换/删除检查使用同一数据库写事务，不能先查后另事务提交。

### pending 接管与崩溃窗口

本机 API 写入与恢复必须持有同一操作的跨进程排他锁，锁覆盖 put、发布和补偿；进程退出由操作系统释放，不能仅凭时间超限接管仍存活的执行者。数据库操作附单调执行代次，发布 CAS 同时校验代次、pending 与 Provider 版本；恢复取得排他锁后先递增代次、使旧操作失去发布资格，再处理该操作已登记 ref。持锁中仍有文件 I/O 时不得并发恢复或释放占用；先等待 I/O 结束，不能用 Promise 超时当作写入已终止。实现须证明 Node/Bun 和 Windows 下跨进程锁行为，否则 B 切片不能声称恢复已完成。

| 崩溃窗口 | 取得排他锁后的恢复 |
| --- | --- |
| 未登记操作 | 查无收据，允许用户重新输入；无已分配 ref |
| 已登记、put 未完成、或 put 已完成但未发布 | fence 原操作，删除其新 ref（不存在也算完成）；收据 failed，清理失败则 cleanup_pending，禁止重放 key |
| Provider 发布事务结果未知 | 以数据库已提交引用/操作阶段判定；已发布不删除活跃 ref，未发布按上一行处理 |
| 已发布、旧 ref 未清理 | 保持当前配置，只清理已登记且无活跃引用的旧 ref；完成后收据 completed |

Provider 删除是同步单事务，没有可恢复的中间态，因此不占崩溃窗口的一行：进程在事务提交前退出则什么都没发生，提交后退出只剩一个可能残留的旧凭证文件，清理失败只记日志、不影响已删除的事实。

`POST /model-configuration-operations/:id/retries` 同时是 pending 恢复入口；锁仍被占用返回 409 operation_in_progress，不启动第二执行者。pending 不靠普通读取自动恢复；UI 查询到 pending 显示“处理中或待恢复”，用户显式恢复。失败终态在本操作清理完成后解除 Provider 写占用；cleanup_pending 在恢复完成前仍拒绝新的配置写入，已有已发布配置可以继续调用。操作收据保留以处理响应丢失。

修改 Provider 地址/API/key 的表单提交前，界面用 `GET /connections` 与 `GET /model-providers/:id/models` 自行 join，提示有多少连接正在使用该服务商的模型；没有专门的受影响连接端点（该端点已决定不实现，见路由表）。这只是当时快照，不是锁，保存仍按版本校验，随后新建的连接也使用已提交配置。

## Connection 与 invocation 版本

明确新增模型型 connectorId `cosmos.agent`，它是 Cosmos 模型连接种类，不是外部服务商标识。其它 connectorId 不改分类或 secretRef 行为，不自动导入旧连接。

模型连接新增 modelId（本地模型配置 ID）、version；Provider 由模型归属推导，不重复保存。创建模型连接必须选一个模型且禁止 secretRef；非模型连接禁止 modelId。更换选择携带 expectedVersion，事务校验模型/Provider active。允许已撤销模型连接解除 modelId 以解除引用；active 模型连接禁止无模型，解除选择须同事务转 revoked，重新启用须有有效选择。通用探测不适用于 cosmos.agent，保存不改变 lastCheckedAt/lastError、不发起生成请求。

Connection 端点增量（首个消费者：现有连接面板；错误沿用上述固定错误合同）：

| 端点 | 精确增量 |
| --- | --- |
| POST /connections | 既有 CreateConnection 字段增加可选 modelId；cosmos.agent 必须是非空本地 ID、禁止 secretRef 字段（包括 null），初始 active；其它类型 modelId 必须省略，不接受 null |
| GET /connections 与 /connections/:id | 既有快照增加 version（正整数）与 modelId（未选为 null）；模型连接 secretRef 固定 null，不暴露 Provider ref；旧非模型连接行为保留 |
| PATCH /connections/:id | 对 cosmos.agent 要求 expectedVersion，允许 name/status/modelId，禁止 configJson/secretRef/lastError；modelId 省略保留，null 解除，非空 ID 更换；其它连接只保留既有字段，禁止 modelId/expectedVersion |
| POST /connections/:id/removals | 模型连接要求 expectedVersion，在同事务删除其关联；其它类型保持既有输入 |

模型连接更新必须至少一个实际字段；status 仅 active/revoked，历史其它状态仍可读取。`{expectedVersion,modelId:null,status:"revoked"}` 原子解除并撤销；当前已 revoked 时可省略 status。`{expectedVersion,status:"active",modelId:"..."}` 原子选择并启用，省略 modelId 时必须已有有效选择。不能通过保存选择重写 lastCheckedAt/lastError。所有模型连接写入递增 version，缺失版本返回 400，过期返回 409 version_conflict；关联失效（模型不存在，或它所属的 Provider 不是 active）返回 409 invalid_model_selection；Provider 的 deleting 态目前不会被写入，但该分支一并覆盖，将来引入异步删除时无需改判定。旧类型禁止修改 connectorId 变成模型类型，不隐式迁移。

上表的连接端点增量已落地（create/list/get/patch/removals 与 `cosmos.agent` 规则）；选模型的下一个消费者是 `agent.invoke@2`。`agent.invoke@2` 已实现、通过隔离测试（合同、Action、catalog、连接解析、pi-ai 适配器、Worker 注册），并完成一次真实最小调用（HTTP 200，模型、地址与凭证全部按连接解析）。仍未验收的是真实服务商对 Responses 协议的行为、多 Provider 与常驻调度。

新增 `agent.invoke@2`：输入 connectionId/messages/tools/budget/metadata，不再接收 provider/model/API/baseUrl/secretRef/key；输出沿用实际 provider/model 与 usage 结构。Worker 按次读取 active Connection、模型和 Provider 的一致配置快照，再读取该 Provider key，取消后不读 key、不调用 SDK。一次调用固定快照，之后修改影响后续调用；没有强 lease 或撤销已发请求保证。预算不得超模型上限，两种生成 API 独立执行、不回退。实现落在 `packages/application/src/agent-invocation-v2.ts`（Action 定义 + 端口）、`packages/storage-prisma/src/agent-model-resolver.ts`（一次读取连接/模型/Provider）、`packages/agent-pi-ai/src/invocation-v2.ts`（按连接构造模型并调用）与 `apps/worker/src/agent-action-v2.ts`（无条件注册的 Worker Action）。

`@1` 公共合同与历史证据保留；Worker 侧旧生产注册已退出——`COSMOS_AGENT_*` 不再被读取，`agent.invoke@1` 只作为 Story 生成侧复用的端口与输入输出契约存在，不再有进程注册它。catalog 因此把它标为 `status: "disabled"`：这个字段只是可读声明，不参与 dispatch 判定（`GET /action-definitions` 原样投影它），`enabled` 状态留给真正注册了的 Action。不同时提供回退。生产者/消费者清单：application Action definition/catalog、adapter、Workflow Host 测试、Task39 runner/test；`apps/worker/src/main.ts` 现在只注册 `agent.invoke@2`，`apps/worker/src/agent-action.ts` 与 `config.ts` 的 Agent profile 已删除。迁移 runner 调用必须新单独验收，不能把历史 QmVMec 改写为 @2 证据。`@2` 首个可信消费者是现有 Workflow Host，不新增任意 HTTP 模型执行入口或第二运行时。

## 发现任务与网络边界

发现是一次同步、只读的请求：用户点"获取模型列表"，API 用已保存的 Provider 配置与凭证执行一次 `GET <baseUrl>/models`，在同一响应里返回候选或固定失败码。它没有排队态、任务 ID 或轮询端点。

这个简化是刻意的。发现请求是幂等只读操作，重复发送的代价只是多一次请求，不存在"可能重复创建资源"的副作用。因此不为它引入 Workflow/Job/Attempt/Lease 队列或"结果未知"恢复：那套机制是为有副作用的外呼准备的，用在这里会强迫 UI 出现并不存在的中间态和重试警告。Host 的派生授权栅栏（dispatch fence）作为通用能力保留，服务于未来 `agent.invoke@2` 这类有副作用的外呼，不参与发现。

当前实现不按 `api` 类型分支：openai-completions 与 openai-responses 都请求同一个 `GET <baseUrl>/models`，因为这两种协议的上游目录约定相同。目录接口不可用的 Provider 会得到固定失败码（例如 `unsupported`），用户仍可手动录入。请求前校验 `providerVersion`，与用户提交的 `expectedVersion` 不符则返回配置冲突且零外呼。

发现的响应只返回 `succeeded` 或 `failed`，附带安全候选 `{modelId,name}` 与固定错误码，不返回原始 body、headers 或 key。候选不自动存模型；用户勾选后作为可编辑草稿行追加到录入表单，一次可提交多行。上游列表不返回调用预算，界面按 `262144`/`32768` 预填上下文窗口与输出上限（清空同样提交默认值），用户可按上游实际能力改小；写入仍走同一命令与校验，预算越界返回 400 `invalid_input`。

固定一次 GET `<baseUrl>/models`，10 秒总预算、0 自动重试/重定向/分页跟随，最大 1 MiB、1000 个唯一候选，超限失败而非无限读取。凭证只在执行该请求时从 SecretStore 读出并交给 transport，不进入响应、日志或错误信息；API 不提供凭证读取接口，也不把凭证暴露给浏览器。

此边界不承诺跨公网的 exactly-once：进程若在发出请求后崩溃，响应就丢失，用户重试会产生第二次只读请求。该请求幂等，所以这是可接受的，不需要"结果未知"状态。

发现请求使用可注入的受控 HTTPS transport，负责 DNS 答案审核、实际连接地址绑定、原主机 TLS/SNI 校验、超时与响应字节上限；解析器只接受白名单候选字段，不持有第二份网络策略。该 transport 已落地：`packages/application/src/provider-model-directory-https.ts`（DNS 审核、地址绑定、原主机 SNI、超时与 1 MiB 上限），并有本地合成的域名解析测试，不发真实外呼。后续生成请求只有在 pi-ai 当前 SDK 提供经本地源码/测试证实的逐请求 transport 注入后，才可复用同一策略；不得以全局 fetch patch、代理绕过或未验证的 SDK 能力宣称生成网络已受控。此阶段边界不代表生成调用当前已有受控网络实现。

baseUrl 仅 HTTPS，无 userinfo/query/fragment，端口仅 443，无 IP 字面量；保留已验证基础路径，不接受 URL 作为模型 ID。拒绝 localhost、非公网 DNS 答复及 IPv4-mapped IPv6 等绕过；每次外呼检查所有解析地址，实际 TCP/TLS 绑定到审核地址，TLS hostname/SNI 仍验证原主机。不接受仅预解析后交还 fetch 重新解析。禁止重定向与环境代理绕过。SDK 传输必须可注入同一策略，不能用全局 fetch monkey patch；当前 SDK 是否支持所需注入尚需源码证据，未证明前不得宣称生成网络边界已实现。

生成也禁自动 SDK 重试，预算内一个传输发送；Host 的现有重试策略另行登记，不把一次 Action 等同一次 HTTP。不得新增自动发现或保存后验证。日志禁请求/响应正文、认证头和原始 SDK 异常。

## 本机入口安全与 conformance

新配置写入、删除、恢复和发现端点要求显式配置的 Web Origin 精确匹配、Host 在受信 API authority 集合、application/json、最大 32 KiB 请求体；拒绝 null/缺失 Origin 和 text/plain。不读取 forwarded host 来推导信任。Web/transport 是首个受支持客户端；非浏览器客户端需显式提供同样 Origin，不能声称这构成多用户认证。启动配置缺少受信源时拒绝这些新操作，而非放宽 CORS；现有其它端点不借机改造。

API 装配使用 `COSMOS_ALLOWED_ORIGIN` 指定单个规范 Web Origin（例如 `http://localhost:3000`，无末尾斜杠），`COSMOS_MODEL_CONFIGURATION_AUTHORITIES` 指定逗号分隔的精确 API Host（例如 `localhost:14310,127.0.0.1:14310`）。任一缺失或含非规范项/通配符，整个新写操作信任集合为空；Host 不从监听地址、Origin 或转发头自动补全。IPv6 Host 使用方括号（例如 `[::1]:14310`）。这些设置只控制新端点的写入许可，现有 CORS 配置不替代此检查。`bun run dev` 与 `bun run dev:api` 会按选定的实际端口注入这两个变量（`scripts/dev-port.ts` 的 `withApiTrustEnvironment`），其它启动方式必须显式设置；写入被拒时返回 `403 forbidden_origin`，界面按「来源未授权」提示，不显示成网络故障。多实例共享数据库时必须共用同一可信 `COSMOS_DATA_ROOT`（含 SecretStore 和配置锁）；仅共享 `DATABASE_URL` 不保证凭证和锁的一致性。当前已注册 Provider 读写与删除、操作查询（含 by-key）与重试、同步发现、模型读写控制器；「编辑前受影响连接查询」不实现（由界面 join 替代）；正式服务验收仍未完成。

必须覆盖：创建/替换/留空保留；所有写入崩溃窗口/响应丢失/重复请求；跨进程 CAS；引用与删除竞争；清理失败可恢复；API key 错误不回显；保存零外呼；发现次数/大小/DNS/重定向/版本冲突/凭证缺失；发现响应与错误码不含 key 或上游正文；重复发现调用各自独立（只读幂等）；两种协议分别模拟；@2 按次读取、取消、轮换与无 fallback；旧连接行为不变。fresh/legacy 隔离迁移及浏览器另列门禁，尚未运行。真实目录/生成请求仍逐次批准。
