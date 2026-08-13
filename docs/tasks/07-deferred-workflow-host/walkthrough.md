# Task 07 Walkthrough：Deferred Workflow、Cosmos Host 与本地 Worker 收敛

> 状态：Phase 1 Deferred Activity 本地门禁已通过；Cosmos Host implementation not started。
>
> Task：[`README.md`](README.md)

## Round 0：治理基线与只读审查

日期：2026-08-13

目标：建立一个可被 leader 和多个子代理共享的跨仓库实施基线，修复协作入口中过时的项目状态描述，并保护现有 dirty worktree。

范围：Cosmos 文档与协作规则；建立独立 nb-workflow Task worktree；只读审查 Deferred Activity 的可行性。

保护区：Cosmos 主工作区、Task 04/05 worktree、nb-workflow dirty master、nb-workflow release worktree 和 neuro-book 外部 worktree。未使用 reset、checkout、clean 或 stash。

### 基线

```text
Cosmos origin/master = 61ed21e
Cosmos governance branch = docs/t07-governance-baseline
Cosmos governance worktree = .worktree/t07-governance-baseline
nb-workflow origin/master = cb4c814
nb-workflow dirty local master = cf34d15
nb-workflow implementation worktree = nb-workflow-t03-deferred-activity
nb-workflow package latest（Round 0 历史基线）：0.1.2
```

### 实际修改

Cosmos 治理 worktree 修改：

- `CONTRIBUTING.md`、`CONTRIBUTING.en.md`：修正已有 Phase 1 运行时状态，增加 leader、worktree、文件所有权、代理交付和外部操作授权规则。
- `AGENTS.md`：增加跨仓库多 worktree 的 leader 治理和唯一写入者要求。
- `docs/README.md`、`docs/tasks/README.md`：增加 Task 07 入口并标明其尚未开始 Cosmos Host 实施。
- `docs/tasks/07-deferred-workflow-host/README.md`：增加当前主分支/Spike/目标三层基线、阶段门禁、跨代理所有权和停止条件。
- 本 walkthrough：记录本轮基线、验证和偏差。

nb-workflow worktree 当前尚未修改代码或文档。

### 只读审查结论

现有 nb-workflow Kernel 已具备 Activity identity、fingerprint、journal replay、Run CAS、waiting、cancel、ValueRef 和可复用 conformance 基础；但 `ActivityExecutor` 仍是同步 `Promise<JsonValue>`，没有 pending Activity、外部 completion reference、completion 路由、duplicate/conflict/late completion 语义。

因此 Deferred Activity 可以在 Core 内实现，但必须先增加行为合同和 conformance；不能用 `waitForSignal()` 作为长期替代，也不能先进入 Cosmos Worker/Host。

审查证据来自 `nb-workflow origin/master@cb4c814` 的静态代码检查；本轮没有在该 worktree 运行测试、build 或 package smoke。

### 验证

已运行：

- Cosmos/nb-workflow `git fetch origin`、HEAD/remote 基线和 `git worktree list --porcelain`。
- Task 07 文档、协作规则和当前文件范围的只读检查。
- 子代理对 `nb-workflow origin/master@cb4c814` 的 public API、Runner、Backend、状态和 conformance 静态审查。

未运行：

- 代码测试、typecheck、build、Node、browser、Docker、真实来源和 Cosmos 集成。

### 偏差与风险

- Task 07 初始只存在于 Cosmos dirty 主工作区；本轮已在治理 worktree 重新建立共享版本，但尚未 commit/push/merge。
- `nb-workflow` dirty master 仍落后远端 16 个提交；不能从 dirty master 开始实现。
- Cosmos 开放 PR #5/#6 尚未在本轮重放验证；它们不阻塞 nb-workflow Deferred Activity，但在 Cosmos Host 开工前必须单独审查。

### Leader 判定

继续：先完成文档门禁，再在 `nb-workflow-t03-deferred-activity` 中建立独立 Task walkthrough 和 Deferred Activity 行为测试；Kernel conformance 通过前停止 Cosmos Host 实施。

## Round 1：Deferred Activity package gate 与真实 Cosmos consumer 边界

日期：2026-08-13

目标：把 nb-workflow Phase 1 的实际验证结果接回 Task 07，并确认 Cosmos 当前哪条分支是真实 consumer；不提前实现 Cosmos Host、Worker Admin 或固定 Ingest parity。

范围：nb-workflow `nb-workflow-t03-deferred-activity`、Cosmos `origin/master`、Task 04 convergence worktree 及 Task 07 文档。保留所有 dirty worktree；不修改 Cosmos 运行时代码，不发布 npm，不 push，不创建 PR。

实际修改：

- Task 03 已在 `1caeecb` worktree 完成本地 Deferred Activity 行为实现；`bun run verify:package` 已通过 `NODE_PACKAGE_SMOKE_OK`、`TARBALL_DECLARATION_CONSUMER_OK`、`ISOLATED_PACKAGE_SMOKE_OK`。
- Task 07 README 增加 Phase 1 门禁矩阵、发布依赖边界和真实 consumer 证据；没有把 `@notnotype/nb-workflow@0.1.2` 写成已包含 Deferred Activity。
- Cosmos `origin/master@61ed21e` 仍是旧 Source Ingest Job 链路；唯一发现完整 `cosmos.ingest@1` 生产接线的是未合并的 `feat/t04-ingest-workflow-convergence` worktree。该分支只作为移植和 parity 证据，不作为 Task 07 当前代码基线。

关键决定：

1. Phase 1 的 deterministic Memory、Node/TypeScript tarball consumer 和 Deferred completion smoke 已足以证明行为侧前置条件，但不证明真实 durable Backend、外部 Worker 或跨进程恢复。
2. `0.1.2` 没有 Deferred 导出；在发布和依赖授权完成前不添加 Cosmos package 依赖、本地 shim 或假 consumer。
3. convergence 分支的 API 仍加载 Workflow/Action executable，违反 Task 07 的 manifest-only 目标；因此只能复用其 WorkflowRun、双 fence、checkpoint CAS 和 Outbox 作为待重建证据。
4. 当前没有发现已实现的 Worker Admin；不得把 Draft v0.2 或历史 Spike 文档当作 API 验收结果。

证据与验证：

```text
nb-workflow checkpoint
  1caeecbcff74d11fa196fe9eee81ca74253ee9b0

bun run verify:package
  NODE_PACKAGE_SMOKE_OK
  TARBALL_DECLARATION_CONSUMER_OK
  ISOLATED_PACKAGE_SMOKE_OK

Cosmos current code baseline
  origin/master = 61ed21e72422767462838eba162a8098ac5732fa
```

focused、conformance、full test、typecheck 和 build 结果沿用 Task 03 Round 2/3 记录；本轮没有在 Cosmos worktree 运行代码测试、typecheck、build、Node、browser、Docker、migration 或真实来源验证。

与计划的偏差：原计划可在 Phase 1 后进入 Cosmos Host；Round 1 当时审查发现 npm latest 仍是 `0.1.2`，且 `origin/master` 没有 `cosmos.ingest@1` consumer。该段是 Round 1 的历史记录；Round 3 已记录 `0.2.0` 发布后的当前状态。Task 04 convergence 分支存在可复用实现，但尚未合并且 API executable ownership 尚未满足目标，因此没有创建 Cosmos implementation worktree。

未验证和风险：npm 发布后的外部消费者、真实 Prisma Backend conformance、跨进程 waiting 恢复、双 Worker 长时间 takeover、固定 Ingest parity、API manifest-only、Worker Admin、Docker、browser、migration、Redis、Gateway、真实 Provider 和多主机均未验证。Task 04 文档中与其代码不一致的“API 已统一走 Ingest Workflow”叙述不得作为证据。

leader 判定：Phase 1 本地行为和包边界门禁通过；Cosmos Host/Worker、固定 Ingest parity、Product API 收敛和 Worker Admin 继续停止，返回规划，等待发布/接入授权。

## Round 2：Windows package gate 回归收口与 Cosmos 停止边界

日期：2026-08-13

目标：把 Task 03 最新 package gate 结果和 Windows 回归修复接回 Task 07；确认 Phase 1 仍只达到本地候选实现门禁，不把未发布包写成 Cosmos 依赖。

范围：nb-workflow `nb-workflow-t03-deferred-activity` 的 package scripts、真实 tarball consumer、focused helper test，以及本 Task 文档。没有修改 Cosmos 运行时代码、Prisma、migration、API、Worker、NeuroBook 或其它 dirty worktree。

实际修改：

- `execNpm()` 在 Windows 通过当前 Node 直接加载 npm CLI，保持 `shell: false`；这收口了 `npm.cmd` 在 Node `shell:false` 下的 `spawnSync npm.cmd EINVAL` 和此前 `DEP0190` warning。
- declaration consumer 与 isolated smoke 都通过真实 `npm install` 消费本地 `npm pack` tarball；declaration consumer 只验证类型，Deferred runtime 由 isolated smoke 验证。
- `prepublishOnly` 先运行 `bun run verify:package`（包含 build），再检查 metadata、dist 和 pack 清单；当前 dirty metadata 仍拒绝发布。

验证命令与结果：

```text
bun test test/deferred-activity.test.ts
  9 pass / 0 fail / 24 expect calls

bun test test/backend-conformance.test.ts
  21 pass / 0 fail / 2 expect calls

bun test test/package-process.test.mjs
  1 pass / 0 fail / 1 expect calls

bun test
  118 pass / 0 fail / 306 expect calls；15 个测试文件

bun run typecheck
  passed

`bun run verify:package`
  NODE_PACKAGE_SMOKE_OK
  TARBALL_DECLARATION_CONSUMER_OK
  ISOLATED_PACKAGE_SMOKE_OK

`bun run prepublishOnly`（nb-workflow clean checkpoint `9183a4f`）
  PUBLISH_READY_OK

偏差：第一次 Windows 修复使用 `npm.cmd`，在当前 Node `v24.13.0` 下仍触发 `EINVAL`；已改用 Node 直接加载 npm CLI，并修正 declaration consumer 的真实 tarball 安装参数。上述结果来自本地 dirty worktree；Registry `@notnotype/nb-workflow@0.1.2` 仍没有 Deferred 导出。

未验证和风险：远端 CI、npm publish、Registry 外部消费者、真实 Prisma Backend、跨进程 waiting 恢复、双 Worker takeover、固定 Ingest parity、API manifest-only、Worker Admin、browser、Docker、migration、Redis、Gateway、真实 Provider 和多主机均未验证。Cosmos `origin/master@61ed21e` 仍没有 `cosmos.ingest@1` consumer；Task 04 convergence worktree 只能作为待移植 parity 证据。

leader 判定：Phase 1 本地行为和 package gates 通过；Cosmos Host/Worker、固定 Ingest parity、Product API 和 Worker Admin 继续停止，等待发布/接入授权与独立 Cosmos implementation worktree。

## Round 3：`0.2.0` Registry 发布证据回接

日期：2026-08-13

目标：把 nb-workflow `0.2.0` 的真实 Registry 发布和 consumer 证据回接到 Cosmos Task 07，纠正 Phase 1 的版本、基线和依赖边界；不启动 Cosmos Host 实施。

范围：本 Task `README.md` 与 walkthrough。只读取 nb-workflow Task 03 Round 6、发布合并提交 `af162ea114c2fddddf3e1cde2c654d357b217fb2` 和 Registry consumer 结果；没有修改 Cosmos 运行时代码、Prisma、migration、API、Worker、NeuroBook 或其它 worktree。

实际修改：

- 将 nb-workflow 实施基线更新为发布合并提交 `af162ea114c2fddddf3e1cde2c654d357b217fb2` 与 Registry package `@notnotype/nb-workflow@0.2.0`。
- 将 Phase 1 证据拆成行为合同、真实 tarball 和 Registry consumer 三层，保留 Memory fixture、durable Backend、跨进程恢复和 Cosmos 生产集成之间的边界。
- 更新 Phase 2 入口条件：发布/依赖门禁已完成，但真实 Durable Host consumer 与 Cosmos 实施授权仍是前置条件。

验证命令与结果：

```text
来源：nb-workflow Task 03 walkthrough Round 6
npm publish --access public -> Registry `0.2.0` 可查询，dist-tags.latest = `0.2.0`
npm install @notnotype/nb-workflow@0.2.0 -> added 1 package in 1s
Node consumer -> REGISTRY_CONSUMER_OK version=0.2.0 exports=6
Bun consumer -> BUN_REGISTRY_IMPORT_OK function function
TypeScript declaration consumer -> tsc passed，退出码为 0
PR #8 verify -> SUCCESS
```

偏差：此前 Round 1/2 记录的是 `@notnotype/nb-workflow@0.1.2` 尚未发布 Deferred 的状态；本轮已按 Round 6 真实结果更新，不能把历史未发布状态继续当作当前状态。

未验证和风险：Cosmos `origin/master` 仍没有 `@notnotype/nb-workflow` consumer、Harness Adapter 或 `cosmos.ingest@1` 的 Kernel consumer；真实 Prisma Backend、跨进程 waiting 恢复、双 Worker takeover、固定 Ingest parity、API manifest-only、Worker Admin、browser、Docker、migration、Redis、Gateway、真实 Provider 和多主机仍未运行。

leader 判定：Phase 1 的发布、package 和 Registry consumer 门禁完成；Cosmos Host/Worker、固定 Ingest parity、Product API 和 Worker Admin 继续停止，等待 Cosmos 实施授权与独立实现 worktree。


## Round 4：Cosmos PR A Prisma Backend / Blob ValueStore

日期：2026-08-13

目标：在发布的 `@notnotype/nb-workflow@0.2.0` 之上建立真实 Cosmos durable Backend consumer，不复制 Task 04 Runtime。

范围：独立 worktree `t07-prisma-workflow-backend`，分支 `feat/t07-prisma-workflow-backend`，基线 `origin/master@fb73962`。可写范围为根依赖、`packages/storage-prisma`、`packages/blob-store` 和本 Task 证据；未修改受保护主工作区、Task 04/05、nb-workflow dirty master、Action/API、Job/Attempt/Outbox。

实际修改：

- 根 `package.json` 和 `bun.lock` 固定 `@notnotype/nb-workflow@0.2.0`；`packages/storage-prisma`、`packages/blob-store` 声明各自运行时依赖。
- `WorkflowRun` forward-only migration `20260813160000_workflow_run_backend` 保存完整 Kernel `WorkflowRunState` JSON、`kernelRevision`、查询投影和 `(status, updatedAt)` index。
- `PrismaWorkflowBackend` 实现 create/load/save/list、immutable identity 校验、revision CAS、损坏 JSON/projection fail-closed 和 `WorkflowRunNotFoundError`/`WorkflowBackendConflictError`。
- `BlobWorkflowValueStore` 使用 `canonicalJson` 和 `FileBlobStore`，返回并验证 `sha256`、key、byteSize、`application/json` media type。
- PR A 提交：`79cbfd5 fix: tighten workflow state validation`（包含实现提交 `2ba4341`、证据提交 `6aa5730`），已 push 到 `feat/t07-prisma-workflow-backend` 并开放 Cosmos PR #9；尚未 merge。

验证命令与结果：

```text
nb-workflow clean verify worktree @ b327156：
bun install --frozen-lockfile
bun test -> 118 pass / 0 fail / 306 expect calls
bun run typecheck -> passed
bun run build -> passed
bun run verify:package -> NODE_PACKAGE_SMOKE_OK / TARBALL_DECLARATION_CONSUMER_OK / ISOLATED_PACKAGE_SMOKE_OK

Cosmos PR A focused：
bun run test -- packages/storage-prisma/src/workflow-backend.test.ts packages/blob-store/src/workflow-value-store.test.ts
  2 test files / 17 tests passed
bun run typecheck:packages -> passed
bun run build:packages -> passed
bun run db:validate -> schema valid
bun run db:migrate && bun run db:status（隔离 `.cosmos`）-> 4 migrations applied / schema up to date
git diff --check -> passed
```
未验证和风险：Kernel package smoke 仍不证明 Cosmos durable recovery；PR A 未实现 lease、multi-worker、Job/Attempt、completion staged activation、EventSink/Domain Outbox、Action、API 或固定 Ingest parity。独立审查代理因 `503 Service temporarily unavailable` 重试预算耗尽，未产出审查结论。

补充验证：使用隔离数据库从前三条历史 migration 升级到 `20260813160000_workflow_run_backend`，保留 `Source/Run/Job/Entry`，输出 `BACKEND_MIGRATION_UPGRADE_OK source=1 runs=1 jobs=1 entries=1 foreignKeyErrors=0`。

leader 判定：PR A focused、package type/build、schema validate、fresh migration 和历史 migration upgrade 均通过；PR #9 等待用户审查与合并授权，PR B 尚未创建。

## 后续轮次模板

```text
### Round N：标题

目标：
范围：
负责人/子代理：
实际修改：
关键决定：
验证命令与结果：
与计划的偏差：
未验证和风险：
leader 判定：继续 / 停止 / 请求决策
```

任何“通过”都必须标明 focused、full、typecheck/build、Node、browser、Docker 或真实来源范围。
