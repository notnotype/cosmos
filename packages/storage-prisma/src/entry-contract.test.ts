import { describe, expect, it } from "vitest";

import * as entry from "./index.js";

// G02 冻结基线上，Task 39 经批准添加 Provider 仓储与配置锁，供 API 通过包入口装配。
// 任何变更都会破坏消费方 import,须显式更新本清单并向维护者说明理由
// (docs/proposals/code-size-governance-v1.md:导出签名 diff 为零)。
const FROZEN_VALUE_EXPORTS = [
    "FileSecretStore",
    "PrismaAgentModelResolver",
    "PrismaConfiguredModelRepository",
    "PrismaConnectorStateStore",
    "PrismaContentQueryRepository",
    "PrismaContentRebuildRepository",
    "PrismaContentSelectionRepository",
    "PrismaCosmosRepository",
    "PrismaModelProviderQueryRepository",
    "PrismaModelProviderRemovalRepository",
    "PrismaProviderCredentialRepository",
    "PrismaProviderDiscoveryReader",
    "PrismaStoryAgentCandidateRepository",
    "PrismaSystemConfigRepository",
    "PrismaWorkflowBackend",
    "PrismaWorkflowEventSink",
    "PrismaWorkflowHostStore",
    "createPrismaClient",
    "resolveContainedPath",
    "resolveStorageRoots",
    "withModelConfigurationLock",
];

describe("storage-prisma 公共入口契约", () => {
    it("值导出集合与冻结清单零 diff", () => {
        expect(Object.keys(entry).sort()).toEqual(FROZEN_VALUE_EXPORTS);
    });
});
