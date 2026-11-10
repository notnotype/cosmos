"use client";

import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { ModelProviderOperationSnapshot, ModelProviderSnapshot } from "@cosmos/contracts";
import { CosmosTransportError, type HttpCosmosClient } from "@cosmos/transport-http";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useToast } from "@/components/ui/toast";
import { ProviderModelsSection } from "@/components/cosmos/provider-models-section";
import {
    providerWriteOutcome,
    toCreateProviderCommand,
    toUpdateProviderCommand,
    writeFailureNotice,
    type ProviderFormErrors,
    type ProviderFormValues,
    type WriteFailureNotice,
} from "@/components/cosmos/provider-model-draft";
import { messages } from "@/copy/messages";
import { newRequestKey } from "@/lib/request-key";

const emptyValues: ProviderFormValues = {
    name: "",
    api: "openai-completions",
    baseUrl: "",
    apiKey: "",
};

const failureText: Record<WriteFailureNotice, string> = {
    versionConflict: messages.models.notices.versionConflict,
    alreadyExists: messages.models.notices.alreadyExists,
    inUse: messages.models.notices.inUse,
    credentialMissing: messages.models.notices.credentialMissing,
    operationInProgress: messages.models.notices.operationInProgress,
    cleanupPending: messages.models.notices.cleanupPending,
    credentialWriteFailed: messages.models.notices.credentialWriteFailed,
    forbiddenOrigin: messages.models.notices.forbiddenOrigin,
    notFound: messages.models.notices.notFound,
    payloadTooLarge: messages.models.notices.payloadTooLarge,
    unavailable: messages.models.notices.unavailable,
};

const failureReasonText: Record<WriteFailureNotice, string> = {
    versionConflict: messages.models.notices.failureReasons.versionConflict,
    alreadyExists: messages.models.notices.failureReasons.alreadyExists,
    inUse: messages.models.notices.failureReasons.inUse,
    credentialMissing: messages.models.notices.failureReasons.credentialMissing,
    operationInProgress: messages.models.notices.failureReasons.operationInProgress,
    cleanupPending: messages.models.notices.failureReasons.cleanupPending,
    credentialWriteFailed: messages.models.notices.failureReasons.credentialWriteFailed,
    forbiddenOrigin: messages.models.notices.failureReasons.forbiddenOrigin,
    notFound: messages.models.notices.failureReasons.notFound,
    payloadTooLarge: messages.models.notices.failureReasons.payloadTooLarge,
    unavailable: messages.models.notices.failureReasons.unavailable,
};

const protocolLabels = {
    "openai-completions": messages.models.provider.protocols.completions,
    "openai-responses": messages.models.provider.protocols.responses,
} as const satisfies Record<ProviderFormValues["api"], string>;

/** 表单里的一次编辑：要么新建，要么编辑已保存的那一行。 */
type EditorState =
    | { mode: "create" }
    | { mode: "edit"; provider: ModelProviderSnapshot };

type ModelProviderPanelProps = {
    client: HttpCosmosClient;
};

/**
 * 模型页的服务商区（Proposal connection-credential-entry-v1）：
 * 先添加服务商并保存它的凭证，再为它录入或发现模型；默认模型在设置页选择。
 *
 * 界面上有两个刻意的约束：
 * 1. 保存不调用模型。填完 key 就能保存是通过设计的——「保存成功」只表示配置与凭证落盘，
 *    不表示认证通过；因此这里在按钮旁写明「保存不调用模型」，防止误读。
 * 2. 已保存的 key 读不出来。编辑时的空白 key 一律解释为「保留原值」，因为用户无法
 *    重新看到它，任何「空 = 清空」的解释都会静默删掉凭证。
 */
export function ModelProviderPanel({ client }: ModelProviderPanelProps) {
    const toast = useToast();
    const [providers, setProviders] = useState<readonly ModelProviderSnapshot[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [values, setValues] = useState<ProviderFormValues>(emptyValues);
    const [errors, setErrors] = useState<ProviderFormErrors>({});
    const [saving, setSaving] = useState(false);
    /** 展开模型区的服务商；同一时刻只展开一个，避免十个模型列表同时请求。 */
    const [expandedId, setExpandedId] = useState<string | null>(null);
    /** 待确认删除的服务商；非空时弹确认框。 */
    const [removal, setRemoval] = useState<ModelProviderSnapshot | null>(null);
    const [removing, setRemoving] = useState(false);
    /** 删除被引用拒绝时的常驻原因。 */
    const [removalError, setRemovalError] = useState<string | null>(null);

    const loadProviders = useCallback(async () => {
        setLoadError(null);
        try {
            const page = await client.listModelProviders({ limit: 100 });
            setProviders(page.items);
        } catch (error) {
            setLoadError(
                error instanceof CosmosTransportError
                    ? failureText[writeFailureNotice(error.status, error.body)]
                    : messages.models.errors.load,
            );
        }
    }, [client]);

    useEffect(() => {
        // 初始读取必须在客户端 effect 中启动；loadProviders 负责把网络结果写回页面状态。
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadProviders();
    }, [loadProviders]);

    function openCreate() {
        setEditor({ mode: "create" });
        setValues(emptyValues);
        setErrors({});
    }

    function openEdit(provider: ModelProviderSnapshot) {
        setEditor({ mode: "edit", provider });
        setValues({
            name: provider.name,
            api: provider.api,
            baseUrl: provider.baseUrl,
            // 空白表示保留已保存的 key。
            apiKey: "",
        });
        setErrors({});
    }

    function closeEditor() {
        setEditor(null);
        setValues(emptyValues);
        setErrors({});
    }

    async function submit() {
        if (!editor) {
            return;
        }
        // 两个分支的草稿结论是不同命令类型，不能先算出一份再分派：那样 `command` 会退化成
        // 两种命令的联合，调用处只能靠断言收窄。
        if (editor.mode === "create") {
            const draft = toCreateProviderCommand(values);
            if (!draft.ok) {
                setErrors(draft.errors);
                return;
            }
            await write(
                () => client.createModelProvider(draft.command, newRequestKey()),
            );
            return;
        }
        const target = editor.provider;
        const draft = toUpdateProviderCommand(target.version, target, values);
        if (!draft.ok) {
            setErrors(draft.errors);
            return;
        }
        await write(
            () => client.updateModelProvider(target.id, draft.command, newRequestKey()),
        );
    }

    async function write(send: () => Promise<ModelProviderSnapshot | ModelProviderOperationSnapshot>) {
        setSaving(true);
        setErrors({});
        try {
            const outcome = providerWriteOutcome(await send());
            if (outcome.kind === "saved") {
                closeEditor();
                toast.success({ title: messages.models.notices.saved });
            } else if (outcome.kind === "pending") {
                // 202：服务端还在写凭证。关掉编辑框，但绝不能显示成「已保存」。
                closeEditor();
                toast.info({ title: messages.models.notices.stillPending });
            } else {
                if (outcome.notice === "versionConflict" || outcome.notice === "notFound") {
                    closeEditor();
                    await loadProviders();
                    toast.info({ title: failureText[outcome.notice] });
                } else {
                    setErrors({ form: outcome.notice });
                }
            }
            if (outcome.kind !== "failed" || (outcome.notice !== "versionConflict" && outcome.notice !== "notFound")) {
                await loadProviders();
            }
        } catch (error) {
            if (error instanceof CosmosTransportError) {
                const noticeKey = writeFailureNotice(error.status, error.body);
                // 版本冲突与「已不存在」都说明本地列表过期：重读，别让用户对着旧数据重试。
                if (noticeKey === "versionConflict" || noticeKey === "notFound") {
                    closeEditor();
                    await loadProviders();
                    toast.info({ title: failureText[noticeKey] });
                } else {
                    setErrors({ form: noticeKey });
                }
            } else {
                setErrors({ form: "unavailable" });
            }
        } finally {
            setSaving(false);
        }
    }

    /**
     * 删除一个服务商：连带它的模型与服务端保存的密钥。
     *
     * 系统默认模型会让服务端拒绝整次删除（409 in_use）。这时把原因留在列表上方，
     * 而不是弹一个几秒就消失的提示——用户要照着它去更换或清除默认模型。
     */
    async function confirmRemoval() {
        if (removal === null) return;
        setRemoving(true);
        setRemovalError(null);
        try {
            await client.deleteModelProvider(removal.id, removal.version, newRequestKey());
            setRemoval(null);
            toast.success({ title: messages.models.provider.removed });
            await loadProviders();
        } catch (error) {
            const noticeKey = error instanceof CosmosTransportError
                ? writeFailureNotice(error.status, error.body)
                : "unavailable";
            setRemoval(null);
            if (noticeKey === "inUse") {
                setRemovalError(`${failureText.inUse} ${failureReasonText.inUse}`);
            } else {
                toast.info({ title: failureText[noticeKey] ?? failureText.unavailable });
            }
            // 「已经不存在」说明列表过期：重读一次，别让用户对着一条已经不存在的记录再点。
            if (noticeKey === "notFound") await loadProviders();
        } finally {
            setRemoving(false);
        }
    }

    const providerEditor = editor && (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open) {
                    closeEditor();
                }
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {editor.mode === "create" ? messages.models.provider.addTitle : messages.models.provider.editTitle}
                    </DialogTitle>
                    <DialogDescription>{messages.models.provider.createsNoCall}</DialogDescription>
                </DialogHeader>
                <form
                    className="flex flex-col gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submit();
                    }}
                >
                    <Field
                        error={errors.name && messages.models.errors.name}
                        htmlFor="provider-name"
                        label={messages.models.provider.name}
                    >
                        <Input
                            autoComplete="off"
                            id="provider-name"
                            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                            value={values.name}
                        />
                    </Field>
                    <Field
                        error={errors.api && messages.models.errors.protocol}
                        hint={messages.models.provider.apiHint}
                        htmlFor="provider-api"
                        label={messages.models.provider.api}
                    >
                        <select
                            className="h-8 rounded-[var(--radius-control)] border border-border bg-background px-2 text-[13px]"
                            id="provider-api"
                            onChange={(event) => setValues((current) => ({
                                ...current,
                                api: event.target.value as ProviderFormValues["api"],
                            }))}
                            value={values.api}
                        >
                            <option value="openai-completions">{protocolLabels["openai-completions"]}</option>
                            <option value="openai-responses">{protocolLabels["openai-responses"]}</option>
                        </select>
                    </Field>
                    <Field
                        error={errors.baseUrl && messages.models.errors.address}
                        hint={messages.models.provider.baseUrlHint}
                        htmlFor="provider-base-url"
                        label={messages.models.provider.baseUrl}
                    >
                        <Input
                            autoComplete="off"
                            id="provider-base-url"
                            onChange={(event) => setValues((current) => ({ ...current, baseUrl: event.target.value }))}
                            placeholder="https://api.openai.com/v1"
                            value={values.baseUrl}
                        />
                    </Field>
                    <Field
                        error={errors.apiKey && messages.models.errors.credential}
                        hint={editor.mode === "create"
                            ? messages.models.provider.apiKeyCreateHint
                            : messages.models.provider.apiKeyKeepHint}
                        htmlFor="provider-api-key"
                        label={messages.models.provider.apiKey}
                    >
                        <Input
                            autoComplete="new-password"
                            id="provider-api-key"
                            onChange={(event) => setValues((current) => ({ ...current, apiKey: event.target.value }))}
                            type="password"
                            value={values.apiKey}
                        />
                    </Field>
                    {errors.form && (
                        <div className="flex flex-col gap-1 text-[12px] text-destructive" role="alert">
                            <p>
                                {errors.form === "unchanged"
                                    ? messages.models.errors.unchanged
                                    : failureText[errors.form as WriteFailureNotice]}
                            </p>
                            {errors.form !== "unchanged" && (
                                <p>{failureReasonText[errors.form as WriteFailureNotice]}</p>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={closeEditor} size="sm" type="button" variant="ghost">
                            {messages.models.provider.cancel}
                        </Button>
                        <Button disabled={saving} size="sm" type="submit">
                            {editor.mode === "create" ? messages.models.provider.create : messages.models.provider.save}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-medium">{messages.models.provider.title}</h2>
                {providers && providers.length > 0 && (
                    <span className="text-[12px] text-muted-foreground">
                        {messages.models.provider.count(providers.length)}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <span className="hidden text-[12px] text-muted-foreground sm:inline">
                        {messages.models.provider.createsNoCall}
                    </span>
                    <Button onClick={openCreate} size="sm">
                        <Plus data-icon="inline-start" />
                        {messages.models.provider.add}
                    </Button>
                </div>
            </div>

            {loadError && (
                <div
                    className="rounded-[var(--radius-control)] border border-destructive/30 bg-destructive/10 p-3 text-[13px] leading-6 text-destructive"
                    role="alert"
                >
                    {loadError}
                </div>
            )}

            {providers === null && loadError === null && (
                <p className="text-[12px] text-muted-foreground">{messages.models.errors.loading}</p>
            )}

            {providers !== null && providers.length === 0 && (
                <div className="rounded-[var(--radius-control)] border border-dashed border-border p-4 text-[13px] text-muted-foreground">
                    {messages.models.provider.empty}
                </div>
            )}

            <ul className="flex flex-col gap-2">
                {(providers ?? []).map((provider) => {
                    const expanded = expandedId === provider.id;
                    return (
                        <li
                            className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-card p-3"
                            key={provider.id}
                        >
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Button
                                    aria-expanded={expanded}
                                    aria-label={expanded
                                        ? messages.models.provider.collapse(provider.name)
                                        : messages.models.provider.expand(provider.name)}
                                    onClick={() => setExpandedId(expanded ? null : provider.id)}
                                    size="icon-xs"
                                    variant="ghost"
                                >
                                    <ChevronDown
                                        className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
                                    />
                                </Button>
                                <span className="min-w-0 truncate text-[13px] font-medium">{provider.name}</span>
                                <Badge variant="outline">{protocolLabels[provider.api]}</Badge>
                                <Badge variant={provider.credentialState === "configured" ? "default" : "outline"}>
                                    {provider.credentialState === "configured"
                                        ? messages.models.provider.credentialConfigured
                                        : messages.models.provider.credentialCleanupPending}
                                </Badge>
                                <code className="min-w-0 truncate rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                    {provider.baseUrl}
                                </code>
                                <Button
                                    aria-label={`${messages.models.provider.edit} ${provider.name}`}
                                    className="ml-auto"
                                    onClick={() => openEdit(provider)}
                                    size="icon-xs"
                                    variant="ghost"
                                >
                                    <Pencil />
                                </Button>
                                <Button
                                    aria-label={`${messages.models.provider.remove} ${provider.name}`}
                                    disabled={removing}
                                    onClick={() => {
                                        setRemovalError(null);
                                        setRemoval(provider);
                                    }}
                                    size="icon-xs"
                                    variant="ghost"
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                            {expanded && <ProviderModelsSection client={client} provider={provider} />}
                        </li>
                    );
                })}
            </ul>

            {removalError !== null && (
                <div
                    className="rounded-[var(--radius-control)] border border-destructive/30 bg-destructive/10 p-3 text-[13px] leading-6 text-destructive"
                    role="alert"
                >
                    {removalError}
                </div>
            )}

            <AlertDialog open={removal !== null} onOpenChange={(open) => { if (!open) setRemoval(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {removal === null ? "" : messages.models.provider.removeTitle(removal.name)}
                        </AlertDialogTitle>
                        <AlertDialogDescription>{messages.models.provider.removeHint}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={removing}>{messages.models.provider.cancel}</AlertDialogCancel>
                        <AlertDialogAction disabled={removing} onClick={() => void confirmRemoval()}>
                            {messages.models.provider.removeAction}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {providerEditor}
        </div>
    );
}

function Field(props: {
    children: ReactNode;
    error: string | false | null | undefined;
    hint?: string;
    htmlFor: string;
    label: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <label className="text-[12px] text-muted-foreground" htmlFor={props.htmlFor}>
                {props.label}
            </label>
            {props.children}
            {props.hint && !props.error && (
                <p className="text-[11px] text-muted-foreground">{props.hint}</p>
            )}
            {props.error && <p className="text-[12px] text-destructive">{props.error}</p>}
        </div>
    );
}
