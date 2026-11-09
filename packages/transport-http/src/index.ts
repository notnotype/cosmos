export type { CosmosEventSource, HttpCosmosClientOptions } from "./types.js";
export { CosmosTransportError } from "./types.js";

import { SystemConfigClient } from "./client-system-config.js";

/**
 * 产品 API 的 HTTP 客户端。实现按资源域拆在继承链上（
 * `HttpCosmosClientBase` → 平台 → 来源 → 内容 → 用户组织 → 看板 → Provider/model → ConfiguredModel → SystemConfig），
 * 本文件只做门面：消费方与导出面与拆分前一致。
 */
export class HttpCosmosClient extends SystemConfigClient {}
