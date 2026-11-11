# 模型缓存四价与两档计费 v1

- 状态：accepted；配置、调用费用与 Web 已实现并通过本轮隔离验收，分层证据见 Task 42。
- 决策日期：2026-11-11；维护者/决策者：Otirik；稳定决定见 [ADR-0032](../adr/0032-model-cache-tiered-pricing.md)。
- 原话：[2026-11 活跃需求](../requirements/0001-original-requirements-active-2026-11.md#2026-11-11模型缓存与阶梯计费)。实施复用 [Task 42](../../.agents/tasks/42-default-model-ui-api/README.md)。

## 问题、目标与非目标

用户需要为每个模型填写普通输入、输出、缓存写入、缓存读取四种单价，并可选择按输入规模使用高价档。原有两价算法不能表达缓存成本，也不能表达超过阈值后整次调用采用高价的规则。

本轮覆盖模型配置的存储、API 创建/编辑/读取、设置页创建与新增编辑入口，以及 invocation 输出和费用展示。每模型选择 USD 或 CNY，价格单位均为所选币种/每百万 token，不换汇；旧模型为 USD。预算控制、汇率与跨币种合计、多阶累进、自动抓取服务商价格、真实 Provider 外呼均不在范围内。截图中的两组人民币价格只作示例，不能作为默认值。

## 问题基线与当前实现证据

以下三项是本轮开始时的两价基线，从代码推断，仅解释变更动机，不再是当前合同。当前四价、币种、阶梯、旧数据兼容和重建验收以[公共合同](../spec/contracts/0001-public-contracts.md#模型定价与调用费用当前合同)为准；模型表已新增显式列，调用适配器与 Web 创建/编辑已接通，全仓回归及离线浏览器、组件实验室验收通过：

- [ConfiguredModel schema](../../packages/storage-prisma/prisma/schema.prisma) 只有 `inputPricePerMillion`、`outputPricePerMillion` 两项 `Decimal? @default(0)`；不存在缓存价格、币种或分档列。
- [invocation v2 适配器](../../packages/agent-pi-ai/src/invocation-v2.ts) 的 `mapResponseV2` 只投影 input/output/totalTokens；`calculateCost` 只按输入、输出计算并固定 `currency: "USD"`，没有缓存分项或整次调用选档。
- [API 当前合同](../api/0009-provider-model-configuration.md#task-42-当前合同与历史目标更正) 仍是可选两价，创建省略价格得到已知 0；不能把它描述为未知价格。API 已有模型 PATCH，Web 模型配置当前只有创建/删除；新增编辑 UI 是本轮目标。

## 已接受方案与冻结字段

只支持普通档和可选高档，使用模型表显式列。字段名称及约束已进入实现；当前精确合同由公共合同规格拥有。

| 字段 | 目标约束 |
| --- | --- |
| `inputPricePerMillion`、`outputPricePerMillion` | 保留现有名称；新建时必填有限非负数 |
| `cacheWritePricePerMillion`、`cacheReadPricePerMillion` | 新建时必填有限非负数；旧模型允许 NULL 表示未知 |
| `currency` | USD 或 CNY；旧模型 USD，不换汇 |
| `tieredPricingEnabled` | boolean，默认 false |
| `tieredPricingThreshold` | 正整数或 null；开启时必填，关闭时 null；UI 开启时预填 272000 |
| `highInputPricePerMillion`、`highOutputPricePerMillion`、`highCacheWritePricePerMillion`、`highCacheReadPricePerMillion` | 开启时四项均为必填有限非负数；关闭时四项均为 null |

所有价格的 0 都是合法已知价格，不等于空白或未知。新建普通四价不能靠数据库默认值补齐；高档不能继承普通档缺项。设置摘要显示币种、四价、阶梯开关/阈值，编辑表单保存后按读取快照回填；旧模型缓存未知须明确显示，不能预填为 0。

价格配置在 PATCH 中作为完整组原子替换：修改任何价格配置时提交币种、普通四价、开关、阈值、高档四价的完整配置；不允许单改一个高档价后与旧配置混用。只改名称等 metadata 的 PATCH 保留所有旧价格和未知值；沿用既有版本冲突控制。POST/PATCH/list/get、默认模型投影、Worker 解析和 Web/transport 应一致携带该合同。历史模型只改 metadata 无须强制补价；主动保存价格配置时应补齐普通四价。

## 计数、选档与成本

以实际调用的 prompt 总输入判定：启用且总输入严格大于阈值才用高档。阈值 272000 时，272000 仍普通档，272001 用高档；整次调用的普通输入、输出、缓存写入和缓存读取全部使用选中档的价格，不按超出部分累进，也不让输出量参与选档。一次调用取同一份价格配置快照。

四类计费用量必须互斥，缓存 token 不得再按普通输入重复收费。Leader 通过包管理器确认本地 pi-ai 为 0.55.4，并由核对代理读取该发布版本的 [OpenAI Completions](https://unpkg.com/@mariozechner/pi-ai@0.55.4/dist/providers/openai-completions.js) 与 [OpenAI Responses](https://unpkg.com/@mariozechner/pi-ai@0.55.4/dist/providers/openai-responses-shared.js) 源码确认映射：原始 prompt/input_tokens 包含缓存读取，普通 input = 原始 prompt − cacheRead，cacheRead = cached，cacheWrite 为 0。目标总输入 = 普通 input + cacheWrite + cacheRead，output 不参与阈值。该源码核对不代表 Cosmos 新计价功能已通过运行验收。

新增 `usage.cacheWriteTokens`、`usage.cacheReadTokens` 和 `cost.cacheWrite`、`cost.cacheRead`，公开读取允许 optional 以兼容历史。新运行输出完整四类用量；能够计算 cost 时输出完整四项费用，`total = input + output + cacheWrite + cacheRead`，币种来自模型。费用分项为对应互斥 token 数乘选中档单价再除以 1000000。

保留旧未知策略：input/output 任一价格未知始终省略整个 cost。缓存类用量非 0 且对应单价未知时也省略整个 cost，不能生成部分总额或把未知当免费。缓存类用量为 0 时该类费用为 0，即使对应价格未知；旧模型缓存为 0 且原两价已知时仍可计算。历史调用和 Story 候选已持久化的实际 cost 保留原值，不按新价格、币种或新公式重算；历史缺失缓存字段不补写为伪造的已知值。

## 选项与取舍

| 选项 | 决定与原因 |
| --- | --- |
| 保持平价四价 | 适合不分档模型，作为关闭阶梯时的模式保留；单独采用不能满足整次高价需求 |
| 普通/高档显式列 | 采用；只有两档，校验和回填直接，沿用模型配置所有权 |
| JSON 保存阶梯价格 | 弃选；会把固定两档结构和完整性校验藏进非结构化配置 |
| 新建价格档位表或通用多档累进 | 弃选；当前不需要任意档数、独立生命周期或分段累进，增加关联和选档复杂度 |

## 数据、接口、安全、迁移与回滚

迁移采用 additive 独立 SQL，保留旧两价原值；新增缓存价为 NULL、币种 USD、阶梯关闭、阈值和高档四价 NULL。先在隔离数据库验证旧行、NULL/0、创建/更新/读取和回滚兼容，不运行用户数据迁移，不部署。不得通过补 0 抹去旧缓存价格未知状态。

回滚保留新增列和已保存数据，先关闭 tier；旧代码不能计算新缓存费用，故新字段存在不等于旧版本能正确计费，恢复旧调用路径的影响需单独核对。不得删列或重算历史费用。发布、用户数据库迁移及其操作授权由 Leader 另行处理。

沿用 Product API/应用服务/存储所有者边界，Web 不直读数据库，Worker 按配置快照计算。输入严格校验有限非负数和完整组合，不泄露凭证；保存模型配置不触发模型调用。费用展示保留币种，不把 USD/CNY 数值直接混合。

## 文档与验收影响

本轮已同步原始需求、[架构入口](../architecture/README.md#模型缓存与两档定价)、[API Draft](../api/0009-provider-model-configuration.md#模型缓存与两档定价目标草案2026-11-11)及当前公共合同、HTTP、客户端与 Web 规格；规格记录已实现行为，整体验证与最终状态留在 [Task 本轮过程](../../.agents/tasks/42-default-model-ui-api/walkthrough.md)。稳定决定需要时再落 ADR。

实施验收须通过公开边界：API create/edit/read 和 metadata-only 保留、零价/未知/关闭清空/高档缺项；实际 invocation 输出覆盖缓存用量及 272000/272001 整次切档；离线浏览器覆盖创建/编辑保存回填、币种/四价/阈值摘要和费用。迁移只用隔离数据，浏览器和调用链测试不外呼真实 Provider。聚焦合同、运行时和隔离存储验证已有证据；全仓测试、完整构建与浏览器验收仍在推进，本文档接受不代表整体验证或发布完成。

## 决策记录

2026-11-11，Otirik 已确认：每模型 USD/CNY 不换汇、旧 USD；普通四价必填、可选完整两档；prompt 总输入 >272000 切高档并覆盖整次调用四类费用；旧实际 cost 不重算。已授权分支复用 Task 42。该产品方案无需重复询问；数据库新增列与独立迁移已经实现，不改变 accepted 状态，用户数据迁移与部署仍未执行。
