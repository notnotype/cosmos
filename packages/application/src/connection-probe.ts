/** 连接登录探测（Proposal connection-login-lifecycle-v1 决定 2）。 */

import type {
    ConnectionProbeResult, SourceConnectionProjection,
} from "@cosmos/contracts";

import {
    ConnectorExecutionError, type ConnectorAuthorizationProbe, type ConnectionConnectorResolver,
} from "./connector-ports.js";
import {
    ConnectionNotFoundError,
} from "./errors.js";
import {
    resolveLogger,
} from "./logger.js";
import type {
    LoggerPort,
} from "./logger.js";
import type {
    CosmosRepository,
} from "./repository-port.js";

/**
 * 一次连接登录探测：读连接 → 按 `connectorId` 解析连接器 → 调它的 `probeAuthorization`
 * → 把结论写回连接。它**不产生 Run、不产生条目**——探测是连接的事实，不是采集，所以它
 * 不能走 ingest 管线（那条路径抓到什么都会入库）。
 *
 * 状态映射固定：`active` 清空失效原因，`expired`/`error` 落原因。`lastCheckedAt` 无论
 * 结论如何都更新——产品面要能区分「没探测过」与「探测过但失败」。适配器没给出账号标签时
 * 保留连接上的原值：标签是已有事实，探测只是有机会更新它。
 */
export class ConnectionProbeService {
    private readonly logger: LoggerPort;

    constructor(
        private readonly repository: Pick<CosmosRepository, "getConnection" | "recordConnectionProbe">,
        private readonly connectors: ConnectionConnectorResolver,
        private readonly now: () => string = () => new Date().toISOString(),
        logger?: LoggerPort,
    ) {
        this.logger = resolveLogger(logger);
    }

    async run(connectionId: string): Promise<ConnectionProbeResult> {
        const connection = await this.repository.getConnection(connectionId);
        if (!connection) {
            throw new ConnectionNotFoundError(connectionId);
        }
        const connector = this.connectors(connection.connectorId);
        if (!connector.probeAuthorization) {
            throw new Error(`Connector does not support login probing: ${connection.connectorId}`);
        }
        const projection: SourceConnectionProjection = {
            id: connection.id,
            connectorId: connection.connectorId,
            configJson: connection.configJson,
        };
        const checkedAt = this.now();
        const logger = this.logger.child({ connectionId, connectorId: connector.id });
        let probe: ConnectorAuthorizationProbe;
        try {
            probe = await connector.probeAuthorization({ connection: projection });
        } catch (error) {
            // 适配器把预期失败（浏览器桥不可用、登录态过期）表达成 outcome；抛出的
            // ConnectorExecutionError 仍然是一次「没得出结论」的探测，写回而不是让 Job 失败。
            // 其它异常是缺陷，照原样上抛，不做粉饰。
            if (!(error instanceof ConnectorExecutionError)) {
                throw error;
            }
            probe = { outcome: "error", reason: error.message };
        }
        const account = probe.account ?? connection.account;
        // Public probe results and persisted connection diagnostics share the same 500-character limit.
        const reason = probe.reason?.slice(0, 500) ?? null;
        const status = probe.outcome === "active"
            ? "active"
            : probe.outcome === "expired" ? "expired" : "error";
        await this.repository.recordConnectionProbe(connectionId, {
            status,
            account,
            lastError: status === "active" ? null : reason,
            checkedAt,
        });
        logger.info("connection.probe.completed", {
            outcome: probe.outcome,
            hasAccount: account !== null,
            hasReason: reason !== null,
        });
        return {
            connectionId,
            outcome: probe.outcome,
            account,
            reason: status === "active" ? null : reason,
            checkedAt,
        };
    }
}
