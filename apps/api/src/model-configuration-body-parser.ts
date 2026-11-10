import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IncomingMessage } from "node:http";

function isConfigurationWrite(request: IncomingMessage): boolean {
    const path = (request.url ?? "").split("?")[0]!;
    // 每条路由都必须在这里有一条分支：漏一条，请求体会先被通用 JSON 解析器读光，
    // 控制器随后读不到字节而把「路由漏登记」报成 invalid_input。
    return (request.method === "POST" && /^\/api\/v1\/(?:model-providers|model-configuration-operations\/[^/]+\/retries|model-providers\/[^/]+\/(?:models|discoveries))\/?$/i.test(path))
        || ((request.method === "PATCH" || request.method === "DELETE")
            && /^\/api\/v1\/model-providers\/[^/]+\/models\/[^/]+\/?$/i.test(path))
        || ((request.method === "PATCH" || request.method === "DELETE") && /^\/api\/v1\/model-providers\/[^/]+\/?$/i.test(path));
}

/** Register before app.init; these routes must validate headers and byte limits before JSON decoding. */
export function configureModelConfigurationBodyParsers(app: NestExpressApplication): void {
    const isSystemConfigWrite = (request: IncomingMessage): boolean => request.method === "PUT"
        && /^\/api\/v1\/system\/config\/?$/i.test((request.url ?? "").split("?")[0]!);
    const isJson = (request: IncomingMessage): boolean =>
        /^application\/json(?:\s*;|$)/i.test(String(request.headers["content-type"] ?? ""));
    app.useBodyParser("json", { strict: false, type: (request: IncomingMessage) => isSystemConfigWrite(request) && isJson(request) });
    app.useBodyParser("json", {
        type: (request: IncomingMessage) => !isSystemConfigWrite(request) && !isConfigurationWrite(request)
            && isJson(request),
    });
    app.useBodyParser("urlencoded", {
        extended: true,
        type: (request: IncomingMessage) => !isConfigurationWrite(request)
            && /^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(String(request.headers["content-type"] ?? "")),
    });
}
