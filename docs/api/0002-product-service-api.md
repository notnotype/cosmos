# Product Service API 草案

> 状态：Draft v0.2；目标合同，等待 `nb-workflow` Kernel 门禁后实施
>
> 基础路径：`/api/v1`
>
> 公共约定：[`0001-common-contracts.md`](0001-common-contracts.md)

除 `/healthz`、`/readyz` 和表中显式写出的完整路径外，下列资源 Path 均相对于
`/api/v1`。

## 1. 边界

Product Service API 面向 Web、CLI、Desktop、知识管理者工具和受控插件。它是应用
Command/Query/Event 的 HTTP/SSE 映射，不是 Prisma Repository 的远程外观。

Controller 只能调用 Application Port。API 可以读取 manifest/schema/capability，
但不加载或执行 Workflow、Action、Connector 或 Agent executable。

未认证模式只面向 loopback/明确受信网络。能够从其它主机访问的 Product API 必须
在独立部署 Task 中固定 HTTPS、身份、Session/Token 生命周期和受控文件访问；CORS
不能替代这条边界。

## 分册索引

本文按已有章节边界移动为三册，保留全部原有合同、成熟度、实现现状与差异说明。Draft/Planned/Reserved 的目标合同仍不代表当前实现；各册共同遵循上方边界、基础路径和公共约定。先查本索引，再定位并读取所需分册的相关段落。

| 分册相对路径 | 覆盖范围与用途 | 读者 | 标签 | 大小 / tokens_est | 状态 |
| --- | --- | --- | --- | --- | --- |
| [part-02-04.md](0002-product-service-api/part-02-04.md) | §2–4：System、Catalog、连接、来源、采集计划与 Trigger 合同 | 产品客户端、来源与采集维护者 | system / catalog / ingestion | 23,827 bytes / 7267 | 2026-11-02 封口；Draft v0.2 |
| [part-05-09.md](0002-product-service-api/part-05-09.md) | §5–9：Workflow 诊断、信息库、Search/Feed、Story/Topic/Entity 与用户真相 | 产品客户端、运行诊断与内容维护者 | workflow / library / user-truth | 10,804 bytes / 3038 | 2026-11-02 封口；Draft v0.2 |
| [part-10-17.md](0002-product-service-api/part-10-17.md) | §10–17：Knowledge/Agent、Workspace/Artifact、Board、分发、数据运维、Event 与路径迁移 | 产品客户端、知识工具与运维维护者 | knowledge / workspace / delivery / operations | 9,314 bytes / 2627 | 2026-11-02 封口；Draft v0.2 |

大小包含 frontmatter 与导航；`tokens_est` 按 `round(ASCII字节/4 + 非ASCII字节/3*1.1)` 估算。

既有[落地注记](0002-product-service-api/landing-notes.md)继续记录目标合同与当前实现的差异。分册中的「主文档已超文档健康区」是拆分前原文的背景说明，保留原文以免丢失上下文；本次拆分后的大小以上表为准。

→ §2–4 已移动至 [System、Catalog 与采集合同](0002-product-service-api/part-02-04.md)。

→ §5–9 已移动至 [Workflow、信息库与用户真相](0002-product-service-api/part-05-09.md)。

→ §10–17 已移动至 [知识交互、工作区、分发与数据运维](0002-product-service-api/part-10-17.md)。

## 勘误

封口分册只读；如需勘误，在本节追加分册相对路径、章节和勘误内容。目标合同演进时，由文档代理新增或替代分册并同步本索引与成熟度；入口始终指向当前有效合同，Draft 不因拆分升级为已实现。
