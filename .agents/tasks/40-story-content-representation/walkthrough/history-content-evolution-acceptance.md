# Task40 历史：解析器、质量与旧证据演进验收

返回[当前 walkthrough](../walkthrough.md)。下列为已完成步骤的历史原文，授权与下一步措辞不代表新的当前授权。

### 2026-10-26：解析器、质量与旧证据演进验收计划

维护者要求继续上述三项验收并本地中文提交。基线 `193d752`，工作区干净；不发布真实解析器版本、不运行真实模型/来源、旧库升级或自动 goal。Leader 唯一写入者，复用现有 Task40，不新增设计讨论或公共写口。

1. 同一来源修订经存储 owner 提交带合成升级 parserVersion 的合法解析结果：新增表示并保留旧版本，EntryRevision/Observation/Story 不因解析升级而改变；这证明升级结果持久化边界，不冒称已经发布另一解析器。
2. 真实隔离 SQLite 验证 complete > partial > failed：较差或失败结果只存历史、不晋升；同质量受推荐才晋升，人工锁覆盖推荐，历史质量/正文保持不变。用共同 ContentQuery 验证精确历史，而不只测纯策略函数。
3. 合成 Invocation 经真实 StoryAgent 与候选仓储产生带块证据的候选；解析升级及来源新 Revision 后，原候选/块证据不迁移、不删除。核对旧证据提示及接受限制与已批准设计；若不满足，先给出实际失败证据并明确缺口，不用“保留了版本号”代替演进验收，也不为绿灯冻结错误行为。

核心新增 `packages/storage-prisma/src/content-evolution.test.ts`；运行 owner 级集成验收和相关 Normalizer/选择/Query/候选/Worker 回归。当前代码推断：候选读合同只有 candidate/status，Web 仅展示输入版本，可能缺少动态旧证据提示；接受只检查 Story Revision 和历史表示存在/非 failed，未检查来源/current 表示变化。先实测后决定最小修复或报告冲突；任何公共投影变更先冻结合同，独立审查仍不由自查替代。

### 2026-10-26：解析器、质量与旧证据演进结果

- 三项验收已有实证：同一 EntryRevision 新增合成 parser@2 表示，原 Observation/Story 与精确 v1 不变，仅允许当前指针变化；partial/failed 不覆盖 complete，同质量非推荐不晋升，较高质量受锁保护、解锁后可晋升。合成草稿直接交给真实重建/选择 owner，不发布另一生产解析器，也不把合成内容当真实来源。
- 真实 RED：首次修正测试误用未公开 Normalizer 导出后，2 通过/1 失败（pwsh-6921432654654719）；v1 被 v2 替代仍能接受旧候选。扩展读端断言也证实无新鲜度投影（pwsh-e5e3730a9bf24aa4）。先冻结 API/架构，再在 Storage 单一 owner 增加 current/superseded/unavailable，只读计算、不写 candidate JSON。接受事务重新检查，非 current 409；查看/拒绝仍可用，不迁移证据、不自动调用模型或撤销历史决定。
- owner 验收还覆盖来源新 Revision、缺失证据引用、损坏/failed 历史表示、回退恢复 current；候选 JSON、旧块引用与历史读取不变。过期接受不写 StoryRevision/决定审计，拒绝可完成。共享 Query 与新鲜度 owner 复用同一白名单表示映射，不因版本变化放出 raw payload/Blob key。聚焦 `bun run vitest run packages/storage-prisma/src/content-evolution.test.ts packages/storage-prisma/src/content-query.test.ts packages/storage-prisma/src/story-agent-candidates.test.ts`：3 文件/6 项通过，19.14s（pwsh-22e763114b4b4a30）；随后类型报跨包私有 Normalizer 的 rootDir 错误，改为显式合法合成草稿，不扩公共导出/配置，最终全仓复验如下。

| 命令 | 本轮实际结果 |
| --- | --- |
| `bun run test` | 203 文件 / 1153 项通过，193.81s，pwsh-713fc0e43a604345，exit 0。 |
| `bun run typecheck` | 与上述串行，全仓通过，同 job，exit 0。 |
| `bunx playwright test --config playwright.config.ts e2e/browser/story-agent-generation.spec.ts e2e/browser/story-representation-versions.spec.ts` | 3 项通过，43.8s，pwsh-18e8965519964f81，exit 0；真实 API/Worker/SDK/生产 Web，模型仅合成传输。 |
| `bun run test:browser:component-lab e2e/component-lab/story-agent-candidates.spec.ts` | 15 项通过，43.0s，pwsh-c308a0e839ef40c3，exit 0；320/768/1024/1440 旧版/不可用提示、禁接受/可键盘拒绝及原恢复流程。 |

- 产品生成测试经公开 rebuild 使来源表示过期：精确旧历史及候选不变、直接接受 409、正式修订不变；刷新显示旧版提示，接受禁用，键盘拒绝后决定保留，无非预期浏览器错误。质量/来源新修订/损坏状态是隔离仓储层证据，不冒称所有组合都跑过浏览器。
- 五轴自查未见新增 blocker：规则在源 owner，事务防陈旧页面绕过；无新表/平台/外呼/自动写入；最多 100 候选，来源按候选批量读取；仅多一次只读状态投影。非独立审查，指定模型路由不可由普通工具指定，未启动默认路由 Agent。
- 文档门禁：`bun run docs:check` 检查 1193 文件、0 失败，`git diff --check` 与 `python scripts/size-governance.py -c docs --check --baseline docs/doc-governance/docs-baseline.json --fail-on-new` 通过（pwsh-0b12a13b93e74294，exit 0），395 文件、保留 5 项既存基线增长 warning；提交前另查 staged diff，防止新文件空白遗漏。
- 已完成的媒体与异常读取过程 10,217 字节原文归档，仅规范末尾分隔换行；保留当前状态、有效决定与本轮证据。未运行浏览器整套、真实来源/Agent、用户旧库升级、部署与独立审查。信心 B，本演进切片完成，Task40 active；下一步独立审查及另获费用/凭据/网络授权的真实 Agent 验收。按授权仅本地中文提交，无 goal/push/新分支/worktree。
