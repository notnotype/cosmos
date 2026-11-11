import { describe, expect, it } from "vitest";

import type { ConnectionInstance } from "@cosmos/contracts";
import { connectionProbeResultSchema } from "@cosmos/contracts";

import { ConnectionProbeService } from "./connection-probe.js";
import { ConnectorExecutionError } from "./connector-ports.js";
import type { IngestConnector } from "./connector-ports.js";

const checkedAt = "2026-09-23T09:00:00.000Z";

function connection(overrides: Partial<ConnectionInstance> = {}): ConnectionInstance {
    return {
        id: "connection-1",
        name: "主账号",
        connectorId: "bilibili",
        account: "旧账号",
        scopeJson: null,
        configJson: '{"profile":"chrome-main"}',
        status: "active",
        secretRef: null,
        lastError: null,
        lastCheckedAt: null,
        modelId: null,
        version: 1,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
        ...overrides,
    };
}

function connectorWithProbe(probe?: IngestConnector["probeAuthorization"]): IngestConnector {
    return {
        id: "bilibili",
        description: "Bilibili",
        configVersion: "v1",
        capabilities: ["bilibili"],
        validate: () => undefined,
        async fetchItems() {
            return { items: [], nextCursor: null };
        },
        ...(probe === undefined ? {} : { probeAuthorization: probe }),
    };
}

type Recorded = {
    status: ConnectionInstance["status"];
    account: string | null;
    lastError: string | null;
    checkedAt: string;
};

function serviceFor(
    probe: IngestConnector["probeAuthorization"],
    source: ConnectionInstance | null = connection(),
): { service: ConnectionProbeService; recorded: Recorded[]; seenConnections: unknown[] } {
    const recorded: Recorded[] = [];
    const seenConnections: unknown[] = [];
    const service = new ConnectionProbeService(
        {
            getConnection: async () => source,
            recordConnectionProbe: async (_connectionId, result) => {
                recorded.push(result);
                return connection({
                    status: result.status,
                    account: result.account,
                    lastError: result.lastError,
                    lastCheckedAt: result.checkedAt,
                });
            },
        },
        (connectorId) => {
            seenConnections.push(connectorId);
            return connectorWithProbe(probe);
        },
        () => checkedAt,
    );
    return { service, recorded, seenConnections };
}

describe("ConnectionProbeService", () => {
    it("写回可用结论，并清空失效原因", async () => {
        const { service, recorded, seenConnections } = serviceFor(
            async ({ connection: projection }) => {
                expect(projection).toEqual({
                    id: "connection-1",
                    connectorId: "bilibili",
                    configJson: '{"profile":"chrome-main"}',
                });
                return { outcome: "active", account: "新账号" };
            },
            connection({ lastError: "上次失败了" }),
        );

        await expect(service.run("connection-1")).resolves.toEqual({
            connectionId: "connection-1",
            outcome: "active",
            account: "新账号",
            reason: null,
            checkedAt,
        });
        expect(recorded).toEqual([{
            status: "active",
            account: "新账号",
            lastError: null,
            checkedAt,
        }]);
        // 连接器按连接的 connectorId 解析，不按来源 kind（探测没有来源）。
        expect(seenConnections).toEqual(["bilibili"]);
    });

    it("把过期与失败结论落成状态加可读原因", async () => {
        const expired = serviceFor(async () => ({ outcome: "expired", reason: "需要重新登录。" }));
        await expect(expired.service.run("connection-1")).resolves.toMatchObject({
            outcome: "expired",
            reason: "需要重新登录。",
        });
        expect(expired.recorded).toEqual([{
            status: "expired",
            account: "旧账号",
            lastError: "需要重新登录。",
            checkedAt,
        }]);

        const failed = serviceFor(async () => ({ outcome: "error", reason: "Browser Bridge 未连接。" }));
        await failed.service.run("connection-1");
        expect(failed.recorded).toEqual([{
            status: "error",
            account: "旧账号",
            lastError: "Browser Bridge 未连接。",
            checkedAt,
        }]);
    });

    it("探测没给出账号时保留连接上的原值", async () => {
        const { service, recorded } = serviceFor(async () => ({ outcome: "active", account: null }));
        await service.run("connection-1");
        expect(recorded[0]?.account).toBe("旧账号");
    });

    it("把适配器的执行错误归成「没得出结论」，而不是让 Job 失败", async () => {
        const { service, recorded } = serviceFor(async () => {
            throw new ConnectorExecutionError("dependency_unavailable", "OpenCLI Browser Bridge is unavailable.", true);
        });
        await expect(service.run("connection-1")).resolves.toMatchObject({
            outcome: "error",
            reason: "OpenCLI Browser Bridge is unavailable.",
        });
        expect(recorded[0]?.status).toBe("error");
    });

    it("将超长适配器异常原因限制在公开合同边界并原样写回", async () => {
        const { service, recorded } = serviceFor(async () => {
            throw new ConnectorExecutionError(
                "dependency_unavailable",
                `OpenCLI: ${"x".repeat(600)}`,
                true,
            );
        });

        const result = connectionProbeResultSchema.parse(await service.run("connection-1"));
        expect(result.reason).toBe(`OpenCLI: ${"x".repeat(491)}`);
        expect(result.reason).toHaveLength(500);
        expect(recorded[0]?.lastError).toBe(result.reason);
    });

    it("将超长正常 outcome 原因限制在公开合同边界并原样写回", async () => {
        const { service, recorded } = serviceFor(async () => ({
            outcome: "expired",
            reason: `需要重新登录：${"x".repeat(600)}`,
        }));

        const result = connectionProbeResultSchema.parse(await service.run("connection-1"));
        expect(result.reason).toBe(`需要重新登录：${"x".repeat(493)}`);
        expect(result.reason).toHaveLength(500);
        expect(recorded[0]?.lastError).toBe(result.reason);
    });

    it("其它异常照原样上抛，不粉饰成结论", async () => {
        const { service, recorded } = serviceFor(async () => {
            throw new Error("boom");
        });
        await expect(service.run("connection-1")).rejects.toThrow("boom");
        expect(recorded).toEqual([]);
    });

    it("连接不存在时抛 ConnectionNotFoundError，且不调用连接器", async () => {
        const { service, recorded, seenConnections } = serviceFor(
            async () => ({ outcome: "active" }),
            null,
        );
        await expect(service.run("connection-gone")).rejects.toThrow("Connection not found: connection-gone");
        expect(seenConnections).toEqual([]);
        expect(recorded).toEqual([]);
    });

    it("连接器没实现探测能力时报错，而不是伪造一个结论", async () => {
        const { service, recorded } = serviceFor(undefined);
        await expect(service.run("connection-1")).rejects.toThrow("Connector does not support login probing: bilibili");
        expect(recorded).toEqual([]);
    });
});
