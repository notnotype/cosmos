# Task 42 文档影响分析

## 当前结论（2026-11-11）

**需更新，已完成同步并通过本轮隔离验收**。四类价格、USD/CNY 与整请求两档计费已同步到原话、已接受提案、架构、[ADR-0032](../../../docs/adr/0032-model-cache-tiered-pricing.md)、API、公共合同、HTTP 客户端和 Web 当前规范；封口历史分册保持只读，项目状态已更新。最终分层验证、全局既有文档/尺寸债务及未部署边界统一见 [walkthrough](walkthrough.md)；前轮证据保留于 [README](README.md)。

## 权责与顺序

- Leader 维护本 Task 记录和本影响清单；业务实现代理只提交文档建议。
- 专职文档代理核对源码与测试，维护 `docs/` 的当前规范及项目状态。
- 公共费用合同先冻结并记录 API/架构目标，代码行为落地后更新当前规范。
- 旧过程记录保留当时事实；当前状态不能继续把未接通费用、陈旧 E2E 或未更新规范标为已完成。

## 本轮新增影响

- 模型四价必填创建、完整价格组 PATCH、USD/CNY、两档开关/阈值及高价四项；普通价/高档价均允许 0，旧模型缓存未知不补 0。
- 存储 additive migration、阈值内部 BigInt 与公开安全整数 number、旧两价/币种默认与关闭状态、配置/系统默认模型/Worker 解析的一致投影。
- invocation 缓存读写 usage/cost 可选历史合同，新调用按总输入严格大于阈值统一四项选档，不重算历史。
- Web 创建与新增编辑入口、完整摘要、预估无缓存假设和币种、实际缓存费用；公开 API/真实离线浏览器与隔离迁移验收边界。

## 前轮已同步合同（历史范围）

1. **HTTP 与 DTO**：新 GET/PUT `/api/v1/system/config`；兼容旧 GET `/config/default-model` 的 `{ modelId }`；旧 PUT 也校验模型有效性。描述严格请求校验、404/409/503、已删除默认模型和事务时序。模型创建/更新/列表/读取一致返回已知价格（含 0），null/缺失省略；未填创建价格命中存储默认 0，不等于未知价。
2. **HTTP 客户端**：`getSystemConfig`、`updateSystemConfig` 的输入输出及错误传递。
3. **Web 行为**：默认模型详情、保存/清除确认、错误恢复、零价/未知价格；连接只管理外部账号，不再选择模型。
4. **Story 费用**：Candidate 与 Generation 的可选 `cost`，来自调用结果并保存进既有候选 JSON；仅成功状态投影；缺失不填零，零值保留，不按当前价重算旧调用。界面说明按调用 usage 和配置价格计算，不作为服务商结算账单。
5. **预估与实际的区别**：保留生成前 token 假设和限制；生成后显示已保存费用，刷新仍可见；不伪造缺失数据。
6. **项目状态与原始需求**：项目状态记录当前完成边界；原始需求按用户措辞追加到当前活跃分册，不反向改写历史。
7. **探测合同补救**：探测边界将外部原因限制为公开 DTO 的 500 字；失败时返回 reason 与持久 lastError 同值，active 均为 null。这不是对人工更新 lastError 的全局长度变更。

## 规范入口与分册

由文档 owner 先读索引再选择 canonical 分册，主要入口为：

- [HTTP API 规范](../../../docs/spec/interfaces/0002-product-api-http.md)
- [HTTP 客户端规范](../../../docs/spec/interfaces/0004-http-client.md)
- [Web 客户端规范](../../../docs/spec/interfaces/0005-web-client.md)
- [公共合同规范](../../../docs/spec/contracts/0001-public-contracts.md)
- [组件规格入口](../../../docs/spec/README.md)
- [Provider/Model API 草案](../../../docs/api/0009-provider-model-configuration.md)
- [架构入口](../../../docs/architecture/README.md)
- [项目状态](../../../PROJECT-STATUS.md)

不为满足模板新建不存在的用户手册目录、Changelog 或版本记录；封口册的更新走既定勘误流程。

## 验证要求

文档检查至少涵盖本地链接、Markdown 结构、代码围栏、尾随空白和 `git diff --check`，执行仓库现有 `bun run docs:check` 及适用尺寸检查。报告每条命令的实际结果，不能把未运行检查标绿；已有范围外问题保留依据。最终改动文件和命令结果回填唯一 Task 记录。
