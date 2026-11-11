"use client";

import { Download, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { ConfiguredModelSnapshot, ModelProviderSnapshot } from "@cosmos/contracts";
import { CosmosTransportError, type HttpCosmosClient } from "@cosmos/transport-http";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    candidateOptions,
    createModelDraftRow,
    defaultContextWindow,
    defaultMaxOutputTokens,
    discoveryNotice,
    fillDraftRows,
    modelRowCommands,
    writeFailureNotice,
    type CandidateOption,
    type DiscoveryNotice,
    type ModelDraftRow,
    type ModelDraftValues,
    type ModelFormErrors,
    type WriteFailureNotice,
} from "@/components/cosmos/provider-model-draft";
import { ProviderModelDiscoveryDialog } from "@/components/cosmos/provider-model/discovery-dialog";
import { ConfiguredModelRow } from "@/components/cosmos/provider-model/configured-model-row";
import { ModelPricingFields } from "@/components/cosmos/provider-model/model-pricing-fields";
import { messages } from "@/copy/messages";
import { newRequestKey } from "@/lib/request-key";

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

const discoveryText: Record<DiscoveryNotice["kind"], string> = {
    found: "",
    empty: messages.models.discovery.empty,
    failed: messages.models.notices.discoveryFailed,
};

/** 字段错误只回传固定原因码，句子留在文案层；未知原因不显示，免得露出内部标识。 */
const fieldErrorText: Record<string, string> = {
    modelId: messages.models.errors.modelId,
    duplicate: messages.models.errors.duplicateModelId,
    name: messages.models.errors.name,
    contextWindow: messages.models.errors.contextWindow,
    maxOutputTokens: messages.models.errors.maxOutputTokens,
    inputPricePerMillion: messages.models.errors.inputPricePerMillion,
    outputPricePerMillion: messages.models.errors.outputPricePerMillion,
};

/**
 * 发现失败的原因各要一句不同的话：认证失败要用户去改 key，不支持列表接口要用户改手动录入，
 * 超时与连不上可以直接再试。合并成「获取失败」会让人不知道该改哪里。
 */
function reasonText(reason: Extract<DiscoveryNotice, { kind: "failed" }>["reason"]): string {
    return messages.models.discovery.reasons[reason];
}

type ProviderModelsSectionProps = {
    client: HttpCosmosClient;
    provider: ModelProviderSnapshot;
};

/**
 * 单个服务商的模型区（Proposal connection-credential-entry-v1）：
 * 手动录入模型，或让服务端读一次上游模型列表再从中挑选。
 *
 * 发现只提供模型 ID 与显示名称。调用的上下文窗口与输出上限必须由用户补齐——上游的列表
 * 接口不返回这两个数，凭空推断会让一次真实的模型请求在运行时才失败。所以发现结果先落成
 * 可编辑的草稿行，而不是直接提交。
 *
 * 这一区也不读取凭证：界面从不接触 key，发现请求由服务端带凭证发出。
 */
export function ProviderModelsSection({ client, provider }: ProviderModelsSectionProps) {
    const [models, setModels] = useState<readonly ConfiguredModelSnapshot[] | null>(null);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [discovering, setDiscovering] = useState(false);
    const [discovery, setDiscovery] = useState<DiscoveryNotice | null>(null);
    const [candidates, setCandidates] = useState<readonly CandidateOption[]>([]);
    const [pickingCandidates, setPickingCandidates] = useState(false);
    const [rows, setRows] = useState<readonly ModelDraftRow[]>(() => [createModelDraftRow("draft-0")]);
    const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, ModelFormErrors>>(new Map());
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const nextRowId = useRef(1);

    const providerId = provider.id;

    const loadModels = useCallback(async () => {
        setModelsError(null);
        try {
            const page = await client.listConfiguredModels(providerId);
            setModels(page.items);
        } catch (error) {
            setModelsError(
                error instanceof CosmosTransportError
                    ? failureText[writeFailureNotice(error.status, error.body)]
                    : messages.models.errors.modelsLoadFailed,
            );
        }
    }, [client, providerId]);

    useEffect(() => {
        // 初始读取必须在客户端 effect 中启动；loadModels 负责把网络结果写回页面状态。
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadModels();
    }, [loadModels]);

    /** 版本变化说明服务商被别处改过：旧的候选列表可能已过期，直接丢掉。 */
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCandidates([]);
        setDiscovery(null);
        setPickingCandidates(false);
    }, [provider.version]);

    const configuredIds = (models ?? []).map((model) => model.modelId);

    async function discover() {
        setDiscovering(true);
        setDiscovery(null);
        try {
            const snapshot = await client.discoverProviderModels(provider.id, provider.version);
            if (snapshot.status === "succeeded") {
                const options = candidateOptions(snapshot.candidates, configuredIds);
                setCandidates(options);
                setDiscovery(discoveryNotice({ status: "succeeded", count: options.length }));
                if (options.length > 0) setPickingCandidates(true);
            } else {
                setCandidates([]);
                setDiscovery(discoveryNotice({
                    status: "failed",
                    errorCode: snapshot.errorCode ?? "dependency_unavailable",
                }));
            }
        } catch (error) {
            setCandidates([]);
            setDiscovery({
                kind: "failed",
                reason: error instanceof CosmosTransportError && error.status === 401
                    ? "authentication"
                    : "unreachable",
            });
            if (error instanceof CosmosTransportError) {
                setNotice(failureText[writeFailureNotice(error.status, error.body)]);
            }
        } finally {
            setDiscovering(false);
        }
    }

    function addRow(values: Partial<ModelDraftValues> = {}) {
        const key = `draft-${nextRowId.current}`;
        nextRowId.current += 1;
        setRows((current) => [...current, createModelDraftRow(key, values)]);
        return key;
    }

    function updateRow<K extends keyof ModelDraftValues>(key: string, field: K, value: ModelDraftValues[K]) {
        setRows((current) => current.map((row) => row.key === key
            ? { ...row, values: { ...row.values, [field]: value } }
            : row));
        setRowErrors((current) => {
            if (!current.has(key)) return current;
            const next = new Map(current);
            next.delete(key);
            return next;
        });
    }

    function removeRow(key: string) {
        setRows((current) => {
            const remaining = current.filter((row) => row.key !== key);
            // 一个不剩时补一个空行：否则用户需要先找到「再加一行」才能继续录入。
            return remaining.length > 0 ? remaining : [createModelDraftRow("draft-empty")];
        });
        setRowErrors((current) => {
            if (!current.has(key)) return current;
            const next = new Map(current);
            next.delete(key);
            return next;
        });
    }

    /** 弹窗只挑「哪些」，选中项先填满空行、多出来的再新建；已填到一半的行不会被覆盖。 */
    function appendCandidates(selected: readonly CandidateOption[]) {
        setPickingCandidates(false);
        if (selected.length === 0) return;
        const result = fillDraftRows(rows, selected, () => {
            const key = `draft-${nextRowId.current}`;
            nextRowId.current += 1;
            return key;
        });
        setRows(result.rows);
        setRowErrors((current) => {
            const next = new Map(current);
            for (const key of result.touched) next.delete(key);
            return next;
        });
        setNotice(messages.models.models.appended(selected.length));
    }

    async function submitRows() {
        if (rows.length === 0) {
            setNotice(messages.models.models.nothingToSubmit);
            return;
        }
        const batch = modelRowCommands(rows);
        if (!batch.ok) {
            setRowErrors(batch.errors);
            setNotice(messages.models.models.batchBlocked);
            return;
        }

        setSaving(true);
        setRowErrors(new Map());
        setNotice(null);
        const failed = new Map<string, ModelFormErrors>();
        let saved = 0;

        // 串行提交：服务端按 provider 串行化配置写入，并发只会把冲突变成失败。
        for (const item of batch.commands) {
            try {
                await client.createConfiguredModel(provider.id, item.command, newRequestKey());
                saved += 1;
            } catch (error) {
                const noticeKey = error instanceof CosmosTransportError
                    ? writeFailureNotice(error.status, error.body)
                    : "unavailable";
                failed.set(item.key, { form: noticeKey });
            }
        }

        // 成功的行移除、失败的行原样留下：否则一次部分失败就要用户重新填一遍。
        const succeededKeys = new Set(batch.commands
            .filter((item) => !failed.has(item.key))
            .map((item) => item.key));
        setRows((current) => {
            const remaining = current.filter((row) => !succeededKeys.has(row.key));
            return remaining.length > 0 ? remaining : [createModelDraftRow("draft-empty")];
        });
        setRowErrors(failed);
        setNotice(failed.size === 0
            ? messages.models.models.batchSaved(saved)
            : messages.models.models.batchPartial(saved, failed.size));
        setSaving(false);
        if (saved > 0) await loadModels();
    }

    function rowFailureText(errors: ModelFormErrors | undefined): string | null {
        if (errors === undefined) return null;
        if (errors.form !== undefined) {
            return failureText[errors.form as WriteFailureNotice] ?? messages.models.notices.unavailable;
        }
        const field = (Object.keys(fieldErrorText) as (keyof typeof fieldErrorText)[])
            .find((key) => errors[key as keyof ModelFormErrors] !== undefined);
        return field === undefined ? null : fieldErrorText[field]!;
    }

    async function removeModel(model: ConfiguredModelSnapshot) {
        setRemovingId(model.id);
        setNotice(null);
        try {
            await client.deleteConfiguredModel(provider.id, model.id, model.version, newRequestKey());
            setRemovingId(null);
            await loadModels();
        } catch (error) {
            setNotice(
                error instanceof CosmosTransportError
                    ? failureText[writeFailureNotice(error.status, error.body)]
                    : messages.models.errors.modelsLoadFailed,
            );
            setRemovingId(null);
        }
    }

    return (
        <div className="flex flex-col gap-4 border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-medium">{messages.models.models.title}</h3>
                {models && models.length > 0 && (
                    <span className="text-[12px] text-muted-foreground">
                        {messages.models.models.count(models.length)}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <span className="hidden text-[12px] text-muted-foreground sm:inline">
                        {messages.models.discovery.hint}
                    </span>
                    <Button
                        disabled={discovering}
                        onClick={() => void discover()}
                        size="xs"
                        variant="outline"
                    >
                        <Download data-icon="inline-start" />
                        {discovering ? messages.models.discovery.running : messages.models.discovery.action}
                    </Button>
                </div>
            </div>

            {models === null && modelsError === null && (
                <p className="text-[12px] text-muted-foreground">{messages.models.errors.modelsLoading}</p>
            )}
            {modelsError && (
                <p className="text-[12px] text-destructive" role="alert">
                    {modelsError}
                </p>
            )}
            {models !== null && models.length === 0 && !modelsError && (
                <p className="text-[12px] text-muted-foreground">{messages.models.models.empty}</p>
            )}

            {models !== null && models.length > 0 && (
                <ul className="flex flex-col divide-y divide-border/60 rounded-[var(--radius-control)] border border-border/60">
                    {models.map((model) => (
                        <ConfiguredModelRow key={model.id} client={client} model={model} providerName={provider.name}
                            isDefault={false} disabled={saving || removingId === model.id}
                            onRemove={() => void removeModel(model)} onSaved={loadModels} />
                    ))}
                </ul>
            )}

            {discovery && (
                <p
                    className={discovery.kind === "failed" ? "text-[12px] text-destructive" : "text-[12px] text-muted-foreground"}
                    role="status"
                >
                    {discovery.kind === "failed"
                        ? reasonText(discovery.reason)
                        : discovery.kind === "empty"
                            ? discoveryText.empty
                            : messages.models.discovery.found(discovery.count)}
                </p>
            )}

            {notice && (
                <p className="text-[12px] text-muted-foreground" role="status">
                    {notice}
                </p>
            )}

            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline gap-2">
                    <h4 className="text-[13px] font-medium">{messages.models.models.manualTitle}</h4>
                    <span className="text-[12px] text-muted-foreground">{messages.models.models.manualHint}</span>
                </div>

                {rows.map((row) => {
                    const errors = rowErrors.get(row.key);
                    const failure = rowFailureText(errors);
                    return (
                        <div
                            className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border/60 p-3"
                            key={row.key}
                        >
                            <div className="flex items-center justify-end gap-2">
                                <Button
                                    aria-label={messages.models.models.removeRow}
                                    disabled={saving}
                                    onClick={() => removeRow(row.key)}
                                    size="icon-xs"
                                    variant="ghost"
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <Field
                                    error={errors?.modelId !== undefined && fieldErrorText[errors.modelId]}
                                    htmlFor={`model-id-${provider.id}-${row.key}`}
                                    label={messages.models.models.modelId}
                                >
                                    <Input
                                        id={`model-id-${provider.id}-${row.key}`}
                                        onChange={(event) => updateRow(row.key, "modelId", event.target.value)}
                                        value={row.values.modelId}
                                    />
                                </Field>
                                <Field
                                    error={errors?.name !== undefined && fieldErrorText.name}
                                    htmlFor={`model-name-${provider.id}-${row.key}`}
                                    label={messages.models.models.name}
                                >
                                    <Input
                                        id={`model-name-${provider.id}-${row.key}`}
                                        onChange={(event) => updateRow(row.key, "name", event.target.value)}
                                        value={row.values.name}
                                    />
                                </Field>
                                <Field
                                    error={errors?.contextWindow !== undefined && fieldErrorText.contextWindow}
                                    htmlFor={`model-context-${provider.id}-${row.key}`}
                                    label={messages.models.models.contextWindow}
                                >
                                    <Input
                                        id={`model-context-${provider.id}-${row.key}`}
                                        inputMode="numeric"
                                        onChange={(event) => updateRow(row.key, "contextWindow", event.target.value)}
                                        placeholder={String(defaultContextWindow)}
                                        value={row.values.contextWindow}
                                    />
                                </Field>
                                <Field
                                    error={errors?.maxOutputTokens !== undefined && fieldErrorText.maxOutputTokens}
                                    htmlFor={`model-output-${provider.id}-${row.key}`}
                                    label={messages.models.models.maxOutputTokens}
                                >
                                    <Input
                                        id={`model-output-${provider.id}-${row.key}`}
                                        inputMode="numeric"
                                        onChange={(event) => updateRow(row.key, "maxOutputTokens", event.target.value)}
                                        placeholder={String(defaultMaxOutputTokens)}
                                        value={row.values.maxOutputTokens}
                                    />
                                </Field>
                            </div>
                            <ModelPricingFields id={`create-${provider.id}-${row.key}`} values={row.values} errors={errors ?? {}}
                                disabled={saving} onChange={(field, value) => updateRow(row.key, field, value)} />
                            {failure !== null && (
                                <p className="text-[12px] text-destructive" role="alert">
                                    {failure}
                                </p>
                            )}
                        </div>
                    );
                })}

                <p className="text-[12px] text-muted-foreground">{messages.models.models.defaultsHint}</p>

                <div className="flex flex-wrap items-center gap-2">
                    <Button disabled={saving} onClick={() => addRow()} size="xs" variant="outline">
                        <Plus data-icon="inline-start" />
                        {messages.models.models.addRow}
                    </Button>
                    <Button disabled={saving} onClick={() => void submitRows()} size="xs">
                        <Plus data-icon="inline-start" />
                        {saving ? messages.models.models.submitting : messages.models.models.submitAll}
                    </Button>
                    {provider.credentialState === "cleanup_pending" && (
                        <Badge variant="outline">{messages.models.provider.credentialCleanupPending}</Badge>
                    )}
                </div>
            </div>

            {pickingCandidates && candidates.length > 0 && (
                <ProviderModelDiscoveryDialog
                    candidates={candidates}
                    onClose={() => setPickingCandidates(false)}
                    onSave={appendCandidates}
                />
            )}
        </div>
    );
}

function Field(props: {
    children: ReactNode;
    error: string | false | null | undefined;
    htmlFor: string;
    label: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <label className="text-[12px] text-muted-foreground" htmlFor={props.htmlFor}>
                {props.label}
            </label>
            {props.children}
            {props.error && <p className="text-[12px] text-destructive">{props.error}</p>}
        </div>
    );
}
