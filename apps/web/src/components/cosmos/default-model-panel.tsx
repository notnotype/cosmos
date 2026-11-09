"use client";

import { useEffect, useState } from "react";
import type { ConfiguredModelSnapshot, ModelProviderSnapshot } from "@cosmos/contracts";
import type { HttpCosmosClient } from "@cosmos/transport-http";
import { Button } from "@/components/ui/button";
import { messages } from "@/copy/messages";

const copy = messages.pages.settings.defaultModel;

type ModelOption = { id: string; label: string };

type DefaultModelPanelProps = { client: HttpCosmosClient };

/**
 * 默认模型选择面板：列出所有已配置模型供用户选择一个作为全局默认，不选则用"无"
 * （此时生成会拒绝请求）。
 */
export function DefaultModelPanel({ client }: DefaultModelPanelProps) {
    const [options, setOptions] = useState<readonly ModelOption[] | null>(null);
    const [currentId, setCurrentId] = useState<string | null | undefined>(undefined);
    const [selected, setSelected] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        void Promise.all([
            client.listModelProviders(),
            client.getDefaultModel(),
        ]).then(async ([providerPage, defaultModel]) => {
            if (!active) return;

            // 对每个 active Provider 拿模型列表，合并成扁平选项
            const allModels: ModelOption[] = [];
            const providers: ModelProviderSnapshot[] = [...providerPage.items];
            // 如果有分页，继续拉（通常 Provider 不多，第一页够用）
            for (const provider of providers) {
                if (provider.state !== "active") continue;
                try {
                    const page = await client.listConfiguredModels(provider.id);
                    for (const model of page.items) {
                        allModels.push({
                            id: model.id,
                            // 同一服务商下模型名可能相同，加上服务商名做区分
                            label: providers.length > 1
                                ? `${model.name}（${provider.name}）`
                                : model.name,
                        });
                    }
                } catch {
                    // 单个 Provider 失败不阻止其他加载
                }
            }

            if (!active) return;
            setOptions(allModels);
            setCurrentId(defaultModel.modelId);
            setSelected(defaultModel.modelId ?? "");
        }).catch(() => {
            if (active) setError(copy.loadFailed);
        });
        return () => { active = false; };
    }, [client]);

    const isDirty = currentId !== undefined && selected !== (currentId ?? "");

    async function save() {
        setSaving(true);
        setNotice(null);
        setError(null);
        try {
            const modelId = selected === "" ? null : selected;
            await client.setDefaultModel(modelId);
            setCurrentId(modelId);
            setNotice(copy.saved);
        } catch {
            setError(copy.saveFailed);
        } finally {
            setSaving(false);
        }
    }

    if (error && options === null) {
        return <p className="text-[12px] text-destructive" role="alert">{error}</p>;
    }
    if (options === null) {
        return <p className="text-[12px] text-muted-foreground">{copy.loading}</p>;
    }

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[12px] text-muted-foreground">{copy.hint}</p>
            <div className="flex flex-wrap items-center gap-3">
                <label className="text-[13px]">
                    {copy.label}
                    <select
                        aria-label={copy.label}
                        className="ml-2 rounded border border-border bg-background px-2 py-1 text-[13px]"
                        disabled={saving}
                        onChange={(e) => { setSelected(e.target.value); setNotice(null); }}
                        value={selected}
                    >
                        <option value="">{copy.none}</option>
                        {options.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                    </select>
                </label>
                <Button
                    disabled={saving || !isDirty}
                    onClick={() => void save()}
                    size="sm"
                >
                    {saving ? copy.saving : copy.save}
                </Button>
            </div>
            {notice && <p className="text-[12px] text-muted-foreground" role="status">{notice}</p>}
            {error && <p className="text-[12px] text-destructive" role="alert">{error}</p>}
            {options.length === 0 && (
                <p className="text-[12px] text-muted-foreground">{copy.noModels}</p>
            )}
        </div>
    );
}
