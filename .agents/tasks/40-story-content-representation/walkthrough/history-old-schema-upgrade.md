# Task 40 历史：前置 schema 旧库升级隔离验收

返回[当前 walkthrough](../walkthrough.md)。以下为已完成切片的原始计划和证据，历史的下一步不代表当前任务状态；分册封口只读。

### 2026-10-27：前置 schema 旧库升级隔离测试计划

实查基线 `master` / `b35951eb99006b3543e95ae3c585005612cc34ef`，工作区干净。本步只补升级证据并本地中文提交；不创建 goal/branch/worktree，不操作 `.cosmos/`、用户数据、远端或 Provider。

合同依据目标设计 §3.10、架构 §9.1 和真实迁移：新增表示/候选为空，Revision 新指针/证据 NULL、未锁定，Observation 新字段 NULL；旧事实、Entry/Story 指针不变。前置库不存在内容表示指针；producer 回填属于前置迁移。

1. 新建 `.agent/tmp/task40-content-upgrade-*`，真实迁移截至 `20260924100000_story_revision_producer`；旧列 SQL 播种两版 Revision/Observation、人工 Story、媒体/事件，记录全旧列快照。
2. 真实 `prisma migrate deploy` 升级，验旧事实/指针、无回填、旧内容只读降级，并验约束/重复部署。
3. 若原样通过，仅在临时副本注入回填/指针改写观察 RED；只有真实合同缺口才最小修复，不改历史 migration。运行下列门禁。

假设/边界：合成前置库，不是用户快照、备份恢复或破坏性迁移验收；recovery/JS 预算及真实来源/Agent 留待独立步骤。

### 2026-10-27：旧库升级隔离测试结果

新增 [夹具](../../../../packages/storage-prisma/src/content-upgrade.fixtures.ts) 与 [测试](../../../../packages/storage-prisma/src/content-upgrade.test.ts)，生产代码/schema/历史 migration 未修改。仅清理本次创建且校验父目录/前缀的临时根。

RED：下表聚焦命令两次 exit 1：仅在临时迁移副本分别注入伪造表示、Story 指针 `story-r2`→`story-r1`，分别因 `expected 1 to be +0`、Story 快照不等失败；各 1 失败/1 通过。移除注入后 2/2 通过。这验证断言敏感性，不代表真实迁移存在缺陷。

GREEN：八表全部旧列/标识、两版 Revision/Observation、人工 Story 及旧指针不变；新增表空/指针 NULL/未锁定；旧文本安全降级、精确缺失版本不替代；读取及重复 deploy 不改事实/文件，旧 checksum 不变；版本/指针唯一、外键/索引/删除置空生效。

| 完整命令 | 本步结果 |
| --- | --- |
| `bunx vitest run packages/storage-prisma/src/content-upgrade.test.ts` | 最终 1 文件/2 项通过（15.24s）。 |
| `bunx vitest run packages/storage-prisma/src/content-query.test.ts packages/storage-prisma/src/content-evolution.test.ts packages/storage-prisma/src/representation-selection.test.ts packages/storage-prisma/src/story-revision-producer-migration.test.ts packages/storage-prisma/src/provider-model-migration.test.ts` | 5 文件/8 项通过（24.90s）。相邻 Provider 夹具按原规范保留该次新建隔离根，未清理其它根。 |
| `bun run test` | 最终 206 文件/1167 项通过（211.78s）。 |
| `bun run typecheck` | 全包及 API/Worker/Web exit 0。 |
| `bun run docs:check` | 1207 文件，failures=[]。 |
| `bun .agent/tmp/task40-markdown-check.ts` | 四份文档标题/围栏/尾随空白通过；表格/结构人工复核。 |
| `$env:PYTHONUTF8='1'; python scripts/size-governance.py --check --cat docs --baseline docs/doc-governance/docs-baseline.json --fail-on-new` | 曾因本文约 9.5k→9.1k、状态入口约 9.0k 失败；精简本次记录后 PASS，398 文件、5 项既存 warning，未改阈值/基线。 |
| `git diff --check` | exit 0。 |

五轴自查（非独立审查）：正确性——动态旧列快照；简单性——复用 deploy helper；架构——真实迁移/统一 Query；安全——隔离合成数据；性能——无产品热路径改动。未发现生产修复缺口。工具不能指定要求路由，无子 Agent/替代模型。

未运行：`bun run test:e2e`、`bun run test:browser`、组件实验室、property、构建、真实来源/Agent。Task40 保持 active；下一步单独诊断 recovery，JS 预算由现有 owner 处理且不放宽。真实来源/Agent 的未覆盖组合及用户库/备份恢复边界不因本步消失。
