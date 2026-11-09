import {
    sseEventSchema,
    type SseEvent,
} from "@cosmos/contracts";

import type {
    CosmosEventSource,
    HttpCosmosClientOptions,
} from "./types.js";
import { CosmosTransportError } from "./types.js";export class HttpCosmosClientBase {
    protected readonly baseUrl: string;
    protected readonly fetcher: typeof globalThis.fetch;
    protected readonly eventSourceFactory: (
        url: string,
    ) => CosmosEventSource;

    constructor(options: HttpCosmosClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.fetcher = (
            options.fetch ?? globalThis.fetch
        ).bind(globalThis);
        this.eventSourceFactory = options.eventSourceFactory
            ?? ((url): CosmosEventSource => {
                const EventSourceConstructor = (
                    globalThis as typeof globalThis & {
                        EventSource?: new (url: string) => CosmosEventSource;
                    }
                ).EventSource;
                if (!EventSourceConstructor) {
                    throw new Error("EventSource is not available in this runtime.");
                }
                return new EventSourceConstructor(url) as CosmosEventSource;
            });
    }

    openEventStream(options: {
        afterEventId?: string;
        onEvent: (event: SseEvent) => void;
        onError?: () => void;
    }): () => void {
        const params = new URLSearchParams();
        if (options.afterEventId) {
            params.set("after", options.afterEventId);
        }
        const query = params.toString();
        const source = this.eventSourceFactory(
            `${this.baseUrl}/api/v1/events${query ? `?${query}` : ""}`,
        );
        source.onmessage = (message) => {
            try {
                options.onEvent(sseEventSchema.parse(JSON.parse(message.data)));
            } catch {
                options.onError?.();
            }
        };
        source.onerror = () => {
            options.onError?.();
        };
        return () => source.close();
    }

    protected async request<TSchema extends { parse: (value: unknown) => unknown }>(
        path: string,
        options: {
            method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
            body?: unknown;
            headers?: Record<string, string>;
            schema: TSchema;
            schemaForStatus?: (status: number) => TSchema;
        },
    ): Promise<ReturnType<TSchema["parse"]>> {
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
            method: options.method ?? "GET",
            headers: {
                ...(options.body ? { "content-type": "application/json" } : {}),
                ...(options.headers ?? {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new CosmosTransportError(response.status, body);
        }

        return (options.schemaForStatus?.(response.status) ?? options.schema).parse(body) as ReturnType<TSchema["parse"]>;
    }
}
