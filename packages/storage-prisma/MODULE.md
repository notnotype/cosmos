# storage-prisma 模块地图

Prisma + SQLite 存储适配层:把应用层与工作流引擎的端口(内容仓储、运行后端、宿主存储、事件落库、密钥、连接器状态)落到本地数据库与文件根;本包是全仓唯一直接依赖 Prisma 的包。

## 入口契约(冻结)

`src/index.ts` 是门面，由 `src/entry-contract.test.ts` 看守值导出集合。Task 39 经维护者批准增量公开 Provider/ConfiguredModel 仓储和配置锁函数，供 API 复用既有存储所有者；不允许包外深层导入：

- `PrismaCosmosRepository` —— 内容域仓储,实现 `CosmosRepository`(继承链门面)
- `PrismaWorkflowBackend` / `PrismaWorkflowHostStore` / `PrismaWorkflowEventSink` —— 工作流运行后端、宿主存储、事件落库
- `PrismaConnectorStateStore` —— 连接器非密钥状态(ADR-0017)
- `FileSecretStore` —— 文件密钥存储
- `PrismaProviderCredentialRepository` / `PrismaModelProviderQueryRepository` / `PrismaConfiguredModelRepository` —— Provider 凭证事务、非秘密查询投影与 ConfiguredModel CRUD
- `withModelConfigurationLock` —— 可信数据根内的配置操作排他锁
- `createPrismaClient` / `resolveStorageRoots` / `resolveContainedPath` / `type StorageRoots` —— 客户端与数据根布局

## 子模块地图(2026-09-11,G02 切片 4 后)

| 文件 | 职责 |
| --- | --- |
| src/index.ts | 门面:re-export 兄弟类与 storage-root,定义 PrismaCosmosRepository 门面类 |
| src/storage-root.ts | StorageRoots / 根解析 / createPrismaClient / resolveContainedPath |
| src/repository/base.ts | 基类:roots/prisma/blobs/logger/catalog 与 constructor/initialize/close |
| src/repository/helpers-1..4.ts | 跨聚合 helper(拓扑序,SCC 原子装册) |
| src/repository/repository-internals.ts | 模块级 helper:投影、卫兵、事件追加、游标/时间原语 |
| src/repository/{sources,runs,job-claims,media}.ts | 源与连接、run/job 创建、认领与租约、媒体重试清理与摄取 |
| src/repository/{search,stories,story-merge,topics}.ts | 全文检索、故事修订拆分、合并、话题与成员 |
| src/repository/{entities,entity-links,labels,collections,annotations}.ts | 实体与关联、标签、集合收藏、批注 |
| src/repository/{views,board-content}.ts | SavedView/Board、区块/聚光/看板内容 |
| src/workflow-host-store.ts(+/) | PrismaWorkflowHostStore 门面 → 继承链五分册（activity 段 = activity-store 门面 + activity-{claim,execution,completion} 三协作类）+ internals-* 三层 |
| src/workflow-backend.ts | PrismaWorkflowBackend:nb-workflow 运行与检查点落库 |
| src/model-provider-query-repository.ts | 安全读取投影；隐藏未发布 Provider，仅选择非秘密列；隔离 ORM 已验，正式服务未验 |
| src/model-provider-credential-repository.ts | Provider 凭证事务适配器：登记、代次 fencing、CAS 发布与补偿收据；API 装配复用既有 Prisma |
| src/model-configuration-lock.ts | 配置操作排他锁；固定原生依赖，持锁至回调结束，API 注入可信数据根；不负责数据库或凭证恢复 |
| src/workflow-event-sink.ts / connector-state-store.ts / secret-store.ts | 事件落库 / 连接器状态 / 文件密钥 |

## 阅读顺序

1. 本文件与 `src/entry-contract.test.ts`;
2. 改某聚合:直接读对应领域分册 + 同名测试分册(单册 ≤23KB,可整读);
3. 改跨聚合 helper:helpers-N 按拓扑序,被调方在前;
4. 数据根布局改动先读 src/storage-root.ts。

## 禁区

- 包外只允许 import 包入口 `@cosmos/storage-prisma`(package.json 仅导出 `.`),不 import 内部分册;
- 入口导出契约冻结;不动继承链中段(新增 Activity 方法进 activity-{claim,execution,completion}.ts,activity-store.ts 只做委托);
- Prisma schema / migration 不在本包治理范围;
- 不读写 `.cosmos/` 运行数据;测试一律使用隔离根目录。

更新:2026-11-17(activity 段拆认领/执行/完成三协作类)
