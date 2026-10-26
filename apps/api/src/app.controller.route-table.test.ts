import "reflect-metadata";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { RequestMethod } from "@nestjs/common";
// Nest 未在类型层暴露 constants 子路径,运行时可用;键名与 @nestjs/common 11 实测一致。
// @ts-expect-error 该子路径无类型声明
import { METHOD_METADATA, PATH_METADATA, SSE_METADATA } from "@nestjs/common/constants";
import { MetadataScanner } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { AppController } from "./app.controller.js";

/**
 * 路由表零变化守卫。
 *
 * 按 Nest 自己的扫描方式(MetadataScanner 走原型链 + PATH/METHOD/SSE 元数据)枚举控制器
 * 注册的路由,与 G03 入库的快照逐条比对。拆实现文件时,继承链上的方法必须仍然可被扫描到
 * ——这个测试就是该约束的护栏,也是 e2e 之外对 114 条路由的全量覆盖。
 */
const SNAPSHOT = resolve(
    import.meta.dirname,
    "../../../.agents/tasks/governance/G03-api-controller/route-snapshot-app.controller.txt",
);

type Route = { verb: string; path: string; handler: string };

function routesOf(controller: new (...args: never[]) => unknown): Route[] {
    const prefix = String(Reflect.getMetadata(PATH_METADATA, controller) ?? "");
    const scanner = new MetadataScanner();
    const prototype = controller.prototype as Record<string, unknown>;
    const routes: Route[] = [];
    for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== "function") continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (method === undefined) continue;
        const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? "");
        const verb = Reflect.getMetadata(SSE_METADATA, handler) === true
            ? "GET(SSE)"
            : String(RequestMethod[method]);
        const path = "/" + [prefix, sub]
            .map((part) => part.replace(/^\/+|\/+$/g, ""))
            .filter(Boolean)
            .join("/");
        routes.push({ verb, path, handler: name });
    }
    return routes;
}

function snapshotRoutes(): Route[] {
    return readFileSync(SNAPSHOT, "utf8")
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("#"))
        .map((line) => {
            const [verb, path, handler] = line.trim().split(/\s{2,}/);
            return { verb, path, handler };
        });
}

const key = (route: Route) => `${route.verb} ${route.path}`;

describe("AppController route table", () => {
    const actual = routesOf(AppController);
    // G03 remains the refactor baseline; Task40 intentionally adds these public contracts.
    const expected = [...snapshotRoutes(),
        { verb: "GET", path: "/revisions/:revisionId/content", handler: "revisionContent" },
        { verb: "GET", path: "/stories/:storyId/agent-candidates", handler: "listStoryAgentCandidates" },
        { verb: "GET", path: "/stories/:storyId/agent-generations/:runId", handler: "storyAgentGeneration" },
        { verb: "POST", path: "/revisions/:revisionId/content/rebuild", handler: "rebuildRevisionContent" },
        { verb: "POST", path: "/revisions/:revisionId/content/selection", handler: "selectRevisionContent" },
        { verb: "POST", path: "/stories/:storyId/agent-candidates", handler: "proposeStoryAgentCandidate" },
        { verb: "POST", path: "/story-agent-candidates/:candidateId/decision", handler: "decideStoryAgentCandidate" },
    ];

    it("registers the same method+path set as the committed snapshot", () => {
        expect([...actual].map(key).sort()).toEqual([...expected].map(key).sort());
    });

    it("keeps the same handler names", () => {
        expect([...actual].map((r) => r.handler).sort()).toEqual(
            [...expected].map((r) => r.handler).sort(),
        );
    });

    it("has no duplicate method+path pair", () => {
        const keys = actual.map(key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
