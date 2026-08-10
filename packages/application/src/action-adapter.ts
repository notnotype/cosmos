import { z } from "zod";

import { sourceSnapshotSchema, type ActionDefinition } from "@cosmos/contracts";

import {
    ActionExecutionError,
    type ActionExecutionContext,
    type ActionHandler,
} from "./action.js";
import {
    ConnectorExecutionError,
    type IngestConnector,
} from "./index.js";

/** connector Action 的输入：一个已配置的 SourceSnapshot 与可选游标。 */
export const connectorPollInputSchema = z.object({
    source: sourceSnapshotSchema,
    cursor: z.string().nullable(),
});
export type ConnectorPollInput = z.infer<typeof connectorPollInputSchema>;

/**
 * connector Action 的输出。
 *
 * items 使用宽松结构：NormalizedIngestItem 目前是 @cosmos/domain 的
 * TypeScript interface（无 zod schema），结构校验由 Ingest Command 层负责。
 */
export const connectorPollOutputSchema = z.object({
    items: z.array(z.unknown()),
    nextCursor: z.string().nullable(),
});
export type ConnectorPollOutput = z.infer<typeof connectorPollOutputSchema>;

/**
 * 把现有 IngestConnector 包装为 "{id}.poll" 的 connector Action。
 *
 * 适配器只做包装，不改动现有 Ingest/Probe Job 路径；connector 本身不
 * 直接写数据库（Phase 1B 运行时边界）。
 */
export class IngestConnectorActionAdapter {
    constructor(private readonly connector: IngestConnector) {}

    definition(): ActionDefinition {
        return {
            ref: `${this.connector.id}.poll`,
            kind: "connector",
            description: this.connector.description,
            version: this.connector.configVersion,
            capabilities: [...this.connector.capabilities],
            inputSchema: connectorPollInputSchema,
            outputSchema: connectorPollOutputSchema,
            execution: {
                idempotent: true,
                supportsCancellation: false,
                timeoutMs: null,
                retryPolicy: null,
            },
        };
    }

    handler(): ActionHandler {
        return async (input: unknown, _context: ActionExecutionContext) => {
            let parsed: ConnectorPollInput;
            try {
                parsed = connectorPollInputSchema.parse(input);
            } catch (cause) {
                throw new ActionExecutionError(
                    "invalid_input",
                    "Invalid connector action input",
                    false,
                    { cause },
                );
            }
            try {
                this.connector.validate(parsed.source);
                const result = await this.connector.fetchItems({
                    source: parsed.source,
                    cursor: parsed.cursor,
                });
                return { items: result.items, nextCursor: result.nextCursor };
            } catch (err) {
                if (err instanceof ConnectorExecutionError) {
                    throw new ActionExecutionError(
                        err.code,
                        err.message,
                        err.retryable,
                        { cause: err },
                    );
                }
                throw new ActionExecutionError(
                    "internal_error",
                    `Connector action ${this.connector.id}.poll failed`,
                    false,
                    { cause: err },
                );
            }
        };
    }
}
