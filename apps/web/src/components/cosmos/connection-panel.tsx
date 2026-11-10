"use client";

import { useEffect, useState, type ComponentProps } from "react";

import { MODEL_CONNECTION_CONNECTOR_ID, type ConnectionInstance } from "@cosmos/contracts";
import type { HttpCosmosClient } from "@cosmos/transport-http";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { messages } from "@/copy/messages";

export function isExternalConnector(connectorId: string): boolean {
    return connectorId.trim() !== MODEL_CONNECTION_CONNECTOR_ID;
}

/** 旧数据仍可能带有模型连接；账号列表只呈现真实外部平台，不提供废弃连接的操作入口。 */
export function externalConnections(connections: readonly ConnectionInstance[]): readonly ConnectionInstance[] {
    return connections.filter((connection) => isExternalConnector(connection.connectorId));
}

const statusLabel: Record<ConnectionInstance["status"], string> = {
    active: "可用",
    revoked: "已撤销",
    expired: "已过期",
    error: "错误",
};

const statusVariant = {
    active: "default",
    revoked: "outline",
    expired: "outline",
    error: "destructive",
} as const satisfies Record<ConnectionInstance["status"], NonNullable<ComponentProps<typeof Badge>["variant"]>>;

/**
 * 授权范围（`scopeJson`）与适配器配置（`configJson`）都是 JSON 字符串。这里只判断
 * 「是不是合法 JSON」，不约束形状：授权范围是用户自己的记录，适配器配置的形状由各
 * Adapter 约定（Bilibili 是 `{"profile":"…"}`）。
 */
function parseJsonText(raw: string): { ok: true; value: unknown } | { ok: false } {
    try {
        return { ok: true, value: JSON.parse(raw) as unknown };
    } catch {
        return { ok: false };
    }
}

/**
 * 可读渲染：顶层是「标量值对象」时按 `键: 值` 列出（这两个字段的常见形状），其它形状
 * 回退到紧凑 JSON。解析不了的值原样显示——手工改库写进来的内容不该被隐藏。
 */
function formatJsonRecord(json: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json) as unknown;
    } catch {
        return json;
    }
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed as Record<string, unknown>);
        if (entries.length > 0
            && entries.every(([, value]) => value === null || typeof value !== "object")) {
            return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
        }
    }
    return JSON.stringify(parsed) ?? json;
}

/**
 * 登录探测的轮询节奏与上限（Proposal connection-login-lifecycle-v1 决定 2）。上限必须**大于**
 * 连接器自己的子进程超时（OpenCLI 默认 120s），否则一次慢但会成功的探测永远显示成超时。
 */
const PROBE_POLL_INTERVAL_MS = 1_500;
const PROBE_TIMEOUT_MS = 150_000;

/** 稳定的中文时间；解析失败按「未检查」处理。 */
function formatCheckedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "未检查";
    }
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${minutes}`;
}

type ConnectionPanelProps = {
    client: HttpCosmosClient;
    /**
     * 连接增删后通知页面。来源表单的连接下拉读的是页面自己的连接列表，
     * 不通知它就会一直停在旧列表上（新建的连接在表单里选不到，只能刷新页面）。
     */
    onConnectionsChanged?: () => void;
    /** 页面在连接变化后递增，驱动列表重取。 */
    refreshToken?: number;
};

/**
 * 连接面板（ADR-0017 / AUT-009）：列出可复用连接、新建、删除，并让用户看到与记录
 * 每个连接的**适配器配置**、**授权范围**与**失效原因**。Secret 只以 `secretRef`
 * 不透明引用存在，本面板不展示也不读取凭证本体。
 *
 * 「适配器配置」是连接的非秘密配置（Proposal connection-login-lifecycle-v1 决定 1）：
 * Bilibili 的 OpenCLI profile 住在这里，连接器抓取时读它。授权范围与失效原因今天仍
 * 没有自动写入方（登录探测属本 Task 的切片 4b），所以面板同时提供用户侧记录入口。
 */
export function ConnectionPanel({ client, onConnectionsChanged, refreshToken = 0 }: ConnectionPanelProps) {
    const [connections, setConnections] = useState<readonly ConnectionInstance[] | null>(null);
    const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
    const [name, setName] = useState("");
    const [connectorId, setConnectorId] = useState("");
    const [connectorError, setConnectorError] = useState<string | null>(null);
    const [scope, setScope] = useState("");
    const [scopeError, setScopeError] = useState<string | null>(null);
    const [adapterConfig, setAdapterConfig] = useState("");
    const [adapterConfigError, setAdapterConfigError] = useState<string | null>(null);
    /** 正在填写失效原因的那个连接；同一时刻只开一个。 */
    const [failingId, setFailingId] = useState<string | null>(null);
    const [failureReason, setFailureReason] = useState("");
    /** 正在探测登录态的连接；同一时刻只开一个。 */
    const [probingId, setProbingId] = useState<string | null>(null);
    /** 探测结果只对发起它的那条连接显示。 */
    const [probeNotice, setProbeNotice] = useState<
        { connectionId: string; text: string; tone: "ok" | "error" } | null
    >(null);
    /** 声明了 `auth.probeSupported` 的 Connector：按声明决定「检查登录状态」是否出现。 */
    const [probeSupportedConnectorIds, setProbeSupportedConnectorIds] = useState<readonly string[]>([]);
    /**
     * 创建表单开合（Task 37）。表单从常驻内联改成模态框承载：列表位置因此空出来给
     * 连接本身，创建入口收进按钮。取消与提交成功都要关掉它并清空输入，见 `closeCreate`。
     */
    const [createOpen, setCreateOpen] = useState(false);

    const load = (): void => {
        client.listConnections()
            .then((list) => {
                setConnections(externalConnections(list));
                setState("loaded");
            })
            .catch(() => setState("error"));
    };

    useEffect(() => {
        let cancelled = false;
        client.listConnections()
            .then((list) => {
                if (!cancelled) {
                    setConnections(externalConnections(list));
                    setState("loaded");
                }
            })
            .catch(() => {
                if (!cancelled) setState("error");
            });
        client.listSourceDefinitions()
            .then((definitions) => {
                if (!cancelled) {
                    setProbeSupportedConnectorIds(
                        definitions
                            .filter((definition) => definition.auth.probeSupported)
                            .map((definition) => definition.connectorId),
                    );
                }
            })
            .catch(() => {
                // 声明读不到时不显示探测入口：宁可少一个按钮，也不要给用户一个必然 409 的动作。
                if (!cancelled) setProbeSupportedConnectorIds([]);
            });
        return () => {
            cancelled = true;
        };
    }, [client, refreshToken]);

    if (state === "loading") {
        return <p className="text-sm text-muted-foreground">正在读取连接…</p>;
    }
    if (state === "error") {
        return <p className="text-sm text-muted-foreground">连接读取失败。</p>;
    }

    /**
     * 关闭创建模态框并清空输入。取消与提交成功走同一条路径：留下上一次的输入会让
     * 「再建一个」变成「改一个刚才没建成的」，而用户已经看不到那次失败的原因。
     */
    const closeCreate = (): void => {
        setCreateOpen(false);
        setName("");
        setConnectorId("");
        setConnectorError(null);
        setScope("");
        setAdapterConfig("");
        setScopeError(null);
        setAdapterConfigError(null);
    };

    const create = (): void => {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        if (!isExternalConnector(connectorId)) {
            setConnectorError(messages.automation.connection.modelConnectorUnsupported);
            return;
        }
        const trimmedScope = scope.trim();
        let scopeJson: string | undefined;
        if (trimmedScope !== "") {
            const parsed = parseJsonText(trimmedScope);
            if (!parsed.ok) {
                setScopeError('授权范围必须是合法 JSON，例如 {"read": true}');
                return;
            }
            // 存规范化后的文本：用户输入的空格与换行不该成为合同的一部分。
            scopeJson = JSON.stringify(parsed.value);
        }
        const trimmedConfig = adapterConfig.trim();
        let configJson: string | undefined;
        if (trimmedConfig !== "") {
            const parsed = parseJsonText(trimmedConfig);
            if (!parsed.ok) {
                setAdapterConfigError('适配器配置必须是合法 JSON，例如 {"profile": "chrome-main"}');
                return;
            }
            configJson = JSON.stringify(parsed.value);
        }
        setScopeError(null);
        setAdapterConfigError(null);
        client.createConnection({
            name: trimmedName,
            connectorId: connectorId.trim() || "generic",
            ...(scopeJson === undefined ? {} : { scopeJson }),
            ...(configJson === undefined ? {} : { configJson }),
        })
            .then(() => {
                closeCreate();
                load();
                onConnectionsChanged?.();
            })
            .catch(() => setState("error"));
    };

    const remove = (connectionId: string): void => {
        client.deleteConnection(connectionId)
            .then(() => {
                load();
                onConnectionsChanged?.();
            })
            .catch(() => setState("error"));
    };

    const markFailed = (connectionId: string): void => {
        const reason = failureReason.trim();
        if (reason === "") return;
        client.updateConnection(connectionId, { status: "error", lastError: reason })
            .then(() => {
                setFailingId(null);
                setFailureReason("");
                load();
            })
            .catch(() => setState("error"));
    };

    const restore = (connectionId: string): void => {
        client.updateConnection(connectionId, { status: "active", lastError: null })
            .then(load)
            .catch(() => setState("error"));
    };

    /**
     * 检查登录状态（Proposal connection-login-lifecycle-v1 决定 2）：探测由 Worker 执行，
     * 这里轮询 Job；结论由 API 写回连接，所以成功后重取列表，让状态与失效原因反映的是
     * **系统观测**而不是用户手填。
     */
    const checkLogin = (connectionId: string): void => {
        setProbingId(connectionId);
        setProbeNotice(null);
        const poll = async (): Promise<void> => {
            let job = await client.createConnectionProbe(connectionId);
            const deadline = Date.now() + PROBE_TIMEOUT_MS;
            while (
                job.status !== "succeeded"
                && job.status !== "failed_terminal"
                && job.status !== "cancelled"
            ) {
                if (Date.now() >= deadline) {
                    setProbeNotice({ connectionId, text: "探测超时，请稍后重试。", tone: "error" });
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, PROBE_POLL_INTERVAL_MS));
                job = await client.getConnectionProbe(job.id);
            }
            if (job.status === "succeeded" && job.result) {
                setProbeNotice({
                    connectionId,
                    text: job.result.outcome === "active"
                        ? `登录状态正常${job.result.account === null ? "" : `：${job.result.account}`}`
                        : job.result.reason ?? "登录状态不可用",
                    tone: job.result.outcome === "active" ? "ok" : "error",
                });
                return;
            }
            setProbeNotice({ connectionId, text: job.error ?? "探测失败。", tone: "error" });
        };
        poll()
            .then(load)
            .catch(() => setProbeNotice({
                connectionId,
                text: "探测请求失败（该 Connector 可能没有声明支持登录探测）。",
                tone: "error",
            }))
            .finally(() => setProbingId(null));
    };

    return (
        /**
         * 侧栏是固定宽度的网格轨道（300px／330px），而这里的行内有「徽标 + 连接名 + 三个按钮」
         * 与可能很长的适配器配置／授权范围文本：不给这条 flex/grid 链铺 `min-w-0`，它们会把
         * 自动最小尺寸撑到轨道之外，画到右侧计划列表上并挡住它的按钮（实测 398px，长授权范围
         * 时 1015px）。只要侧栏还是固定轨道、行内还是这类不换行的内容，这些 `min-w-0` 就不能删。
         */
        <div className="flex min-w-0 flex-col gap-2">
            {connections && connections.length > 0 ? (
                <ul className="grid min-w-0 gap-1">
                    {connections.map((connection) => (
                        <li
                            key={connection.id}
                            className="flex min-w-0 flex-col gap-1 rounded-sm border bg-card px-3 py-2 text-sm"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-2">
                                    <Badge variant={statusVariant[connection.status]}>
                                        {statusLabel[connection.status]}
                                    </Badge>
                                    <span className="truncate">{connection.name}</span>
                                    {connection.account ? (
                                        <span className="truncate text-xs text-muted-foreground">
                                            {connection.account}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="flex shrink-0 items-center gap-1">
                                    {probeSupportedConnectorIds.includes(connection.connectorId) ? (
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            disabled={probingId === connection.id}
                                            aria-label={`检查登录状态 ${connection.name}`}
                                            onClick={() => checkLogin(connection.id)}
                                        >
                                            {probingId === connection.id ? "检查中…" : "检查登录状态"}
                                        </Button>
                                    ) : null}
                                    {connection.status === "active" ? (
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            aria-label={`标记失效 ${connection.name}`}
                                            onClick={() => {
                                                setFailingId(connection.id);
                                                setFailureReason("");
                                            }}
                                        >
                                            标记失效
                                        </Button>
                                    ) : (
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            aria-label={`恢复可用 ${connection.name}`}
                                            onClick={() => restore(connection.id)}
                                        >
                                            恢复可用
                                        </Button>
                                    )}
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        aria-label={`删除连接 ${connection.name}`}
                                        onClick={() => remove(connection.id)}
                                    >
                                        删除
                                    </Button>
                                </span>
                            </div>
                            <dl className="grid min-w-0 gap-0.5 text-xs text-muted-foreground">
                                <div className="flex min-w-0 gap-1">
                                    <dt className="shrink-0">适配器配置</dt>
                                    <dd className="min-w-0 break-words">
                                        {connection.configJson === null
                                            ? "未记录"
                                            : formatJsonRecord(connection.configJson)}
                                    </dd>
                                </div>
                                <div className="flex min-w-0 gap-1">
                                    <dt className="shrink-0">授权范围</dt>
                                    <dd className="min-w-0 break-words">
                                        {connection.scopeJson === null
                                            ? "未记录"
                                            : formatJsonRecord(connection.scopeJson)}
                                    </dd>
                                </div>
                                <div className="flex min-w-0 gap-1">
                                    <dt className="shrink-0">失效原因</dt>
                                    <dd className="min-w-0 break-words">
                                        {connection.lastError ?? "未记录"}
                                    </dd>
                                </div>
                                <div className="flex min-w-0 gap-1">
                                    <dt className="shrink-0">上次检查</dt>
                                    <dd className="min-w-0 break-words">
                                        {connection.lastCheckedAt === null
                                            ? "未检查"
                                            : formatCheckedAt(connection.lastCheckedAt)}
                                    </dd>
                                </div>
                            </dl>
                            {probeNotice?.connectionId === connection.id ? (
                                <p
                                    role="status"
                                    className={probeNotice.tone === "ok"
                                        ? "text-xs text-muted-foreground"
                                        : "text-xs text-destructive"}
                                >
                                    {probeNotice.text}
                                </p>
                            ) : null}
                            {failingId === connection.id ? (
                                <div className="flex items-center gap-2">
                                    <Input
                                        aria-label={`失效原因 ${connection.name}`}
                                        placeholder="为什么失效（如：登录态已过期）"
                                        value={failureReason}
                                        onChange={(event) => setFailureReason(event.target.value)}
                                    />
                                    <Button
                                        size="xs"
                                        variant="outline"
                                        disabled={failureReason.trim() === ""}
                                        onClick={() => markFailed(connection.id)}
                                    >
                                        确认标记失效
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => {
                                            setFailingId(null);
                                            setFailureReason("");
                                        }}
                                    >
                                        取消
                                    </Button>
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-muted-foreground">
                    {messages.automation.connection.empty}
                </p>
            )}
            <div className="flex">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCreateOpen(true)}
                >
                    {messages.automation.connection.newButton}
                </Button>
            </div>
            {/*
             * 创建连接（Task 37）：表单从常驻内联搬进模态框。`onOpenChange` 覆盖了 Esc、
             * 遮罩点击与关闭按钮三条路径，都走 `closeCreate` 清空输入；焦点回到触发按钮
             * 由 Base UI 提供，不自行实现。
             */}
            <Dialog open={createOpen} onOpenChange={(open) => (open ? setCreateOpen(true) : closeCreate())}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{messages.automation.connection.dialogTitle}</DialogTitle>
                        <DialogDescription>
                            {messages.automation.connection.dialogDescription}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-1.5">
                        <Input
                            aria-label="连接名称"
                            placeholder="连接名称"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                        <Input
                            aria-label="连接 Connector"
                            placeholder="Connector（如 bilibili）"
                            value={connectorId}
                            onChange={(event) => {
                                setConnectorId(event.target.value);
                                setConnectorError(null);
                            }}
                        />
                        {connectorError ? (
                            <p role="alert" className="text-xs text-destructive">{connectorError}</p>
                        ) : null}
                        <Input
                            aria-label="连接适配器配置"
                            placeholder={'适配器配置（JSON，可选，如 {"profile": "chrome-main"}）'}
                            value={adapterConfig}
                            onChange={(event) => {
                                setAdapterConfig(event.target.value);
                                setAdapterConfigError(null);
                            }}
                        />
                        {adapterConfigError ? (
                            <p role="alert" className="text-xs text-destructive">{adapterConfigError}</p>
                        ) : null}
                        <Input
                            aria-label="连接授权范围"
                            placeholder={'授权范围（JSON，可选，如 {"read": true}）'}
                            value={scope}
                            onChange={(event) => {
                                setScope(event.target.value);
                                setScopeError(null);
                            }}
                        />
                        {scopeError ? (
                            <p role="alert" className="text-xs text-destructive">{scopeError}</p>
                        ) : null}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeCreate}>
                            {messages.automation.connection.cancel}
                        </Button>
                        <Button
                            disabled={name.trim() === ""}
                            onClick={create}
                        >
                            {messages.automation.connection.submit}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
