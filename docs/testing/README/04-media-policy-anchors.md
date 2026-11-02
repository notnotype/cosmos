---
parent: ../README.md
range: "原 README.md L81-L83；来源媒体策略、失败重试与保留期清理锚点"
sealed_at: 2026-11-02
tags: [testing, media, retry, retention]
tokens_est: 873
---

# 媒体策略测试锚点

[返回测试入口](../README.md)。适用读者：核对来源媒体策略、媒体重试与保留期清理回归的维护者；fixture、媒体源放行和隔离约束见[测试层与浏览器合同](01-layers-browser-contracts.md#隔离与进程)。

按来源的媒体策略 v1（ADR-0014）无 Prisma schema/migration 变更，策略写在 `Source.config.media`。上界与「只能收紧」由 `packages/contracts/src/index.test.ts` 覆盖（`sourceMediaPolicySchema` 拒绝超默认值/未知键/非法枚举，`rssSourceConfigSchema` 接受可选 `media`）；`resolveMediaPolicy` 的缺省与封顶、`images: metadata_only` 不触发下载、来源级文件/单次预算生效由 `packages/application/src/media-acquisition.test.ts` 覆盖（先红后绿：移除策略生效逻辑后 4 例失败）；「策略从 Run 的来源快照解析」由 `apps/worker/src/workflow-ingest.media.test.ts` 端到端覆盖（来源配置 `media.images=metadata_only` → 不发起媒体请求、asset 保持 `metadata_only`）；Web 表单的 MB 换算、收紧校验与摘要文案由 `apps/web/src/lib/media-policy.test.ts` 覆盖，组件实验室新增 Media policy tightened 场景，浏览器侧由 `e2e/browser/media-policy.spec.ts` 覆盖（超默认值本地拒绝、保存后刷新仍生效、关闭图片下载后新采集的图片保持元数据终态）。

媒体失败重试与保留期清理 v1（ADR-0015）新增一次 migration `20260909200000_media_retry_retention_v1`（`Asset.errorCode`/`attemptCount`/`lastAttemptAt`，无回填）。契约边界由 `packages/contracts/src/action.test.ts` 与 `index.test.ts` 覆盖（原因码受管枚举、retry 上限/保留天数边界、`AssetSnapshot` 新字段、retry outcome 的 BlobRef/errorCode 约束、`sourceFetchOutputSchema.mediaBytesUsed` 向后兼容）；错误码映射与 `retryAssets` 行为由 `packages/application/src/media-acquisition.test.ts` 覆盖；重试候选查询、原地改写不产生新 Revision、`(assetId, attemptCount)` CAS、保留期候选与「最后一个引用者才删字节」由 `packages/storage-prisma/src/media-retry.test.ts` 覆盖；「下一次采集自动恢复失败媒体」由 `apps/worker/src/workflow-ingest.media.test.ts` 端到端覆盖；清理端点由 `apps/api/src/app.controller.runs.test.ts` 覆盖（缺省 dryRun、确认命令、未知字段 400、未知 Run 404）；Web 表单与摘要由 `apps/web/src/lib/media-policy.test.ts` 覆盖。浏览器侧清理预览/确认流程见[浏览器 E2E 入口](../README.md#分层入口)。
