import { configuredModelSnapshotSchema } from "@cosmos/contracts";
import { describe, expect, it } from "vitest";

import {
    candidateOptions,
    createModelDraftRow,
    defaultContextWindow,
    defaultMaxOutputTokens,
    discoveryNotice,
    emptyModelDraft,
    fillDraftRows,
    modelRowCommands,
    toCreateProviderCommand,
    toCreateModelCommand,
    toUpdateModelCommand,
    modelDraftFromSnapshot,
    providerWriteOutcome,
    toUpdateProviderCommand,
    writeFailureNotice,
    type CandidateOption,
    type ProviderFormValues,
} from "@/components/cosmos/provider-model-draft";

/**
 * 模型页的三个判据都靠纯函数钉住，因为仓库没有 DOM 测试环境：
 * 保存时「留空保留已存 key」、编辑 Provider 只提交真的改过的字段、
 * 以及发现结果只把候选当建议、已配置的模型不能被重复添加。
 */
describe("四价与编辑模型命令", () => {
    const prices = { inputPricePerMillion: "1", outputPricePerMillion: "2", cacheWritePricePerMillion: "3", cacheReadPricePerMillion: "0" };
    const draft = () => ({ ...emptyModelDraft(), modelId: "priced", name: "Priced", ...prices });
    const legacy = configuredModelSnapshotSchema.parse({ id: "m", providerId: "p", modelId: "priced", name: "Priced", contextWindow: 4096, maxOutputTokens: 512, inputPricePerMillion: 1, outputPricePerMillion: 2, version: 4, createdAt: "2026-11-11T00:00:00Z", updatedAt: "2026-11-11T00:00:00Z" });

    it("四价必填、0有效，空白和非有限价格不能提交", () => {
        const result = toCreateModelCommand(draft());
        expect(result.ok && result.command).toMatchObject({ cacheReadPricePerMillion: 0, cacheWritePricePerMillion: 3 });
        for (const value of ["", "  ", "Infinity", "-1"]) {
            expect(toCreateModelCommand({ ...draft(), cacheReadPricePerMillion: value }).ok).toBe(false);
        }
    });
    it("CNY阶梯开启提交完整四价，关闭显式清空高档且不丢本地草稿", () => {
        const values = { ...draft(), currency: "CNY" as const, tieredPricingEnabled: true, tieredPricingThreshold: "500", highInputPricePerMillion: "4", highOutputPricePerMillion: "5", highCacheWritePricePerMillion: "6", highCacheReadPricePerMillion: "0" };
        expect(toCreateModelCommand(values)).toMatchObject({ ok: true, command: { currency: "CNY", tieredPricingThreshold: 500, highCacheReadPricePerMillion: 0 } });
        expect(toCreateModelCommand({ ...values, highCacheReadPricePerMillion: "" })).toMatchObject({ ok: false, errors: { highCacheReadPricePerMillion: "highCacheReadPricePerMillion" } });
        expect(toCreateModelCommand({ ...values, tieredPricingEnabled: false })).toMatchObject({ ok: true, command: { tieredPricingThreshold: null, highInputPricePerMillion: null, highCacheWritePricePerMillion: null } });
        expect(values.highInputPricePerMillion).toBe("4");
    });
    it("历史未知缓存价格允许仅改名称，定价修改必须补齐整组", () => {
        const values = modelDraftFromSnapshot(legacy);
        expect(values.cacheReadPricePerMillion).toBe("");
        expect(toUpdateModelCommand(legacy, { ...values, name: "Renamed" })).toEqual({ ok: true, command: { expectedVersion: 4, name: "Renamed" } });
        expect(toUpdateModelCommand(legacy, { ...values, inputPricePerMillion: "9" }).ok).toBe(false);
        expect(toUpdateModelCommand(legacy, { ...values, ...prices, currency: "CNY" })).toMatchObject({ ok: true, command: { expectedVersion: 4, currency: "CNY", inputPricePerMillion: 1, outputPricePerMillion: 2, cacheWritePricePerMillion: 3, cacheReadPricePerMillion: 0, tieredPricingEnabled: false, tieredPricingThreshold: null, highInputPricePerMillion: null, highOutputPricePerMillion: null, highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null } });
    });
});

const zeroPrices = { inputPricePerMillion: "0", outputPricePerMillion: "0", cacheWritePricePerMillion: "0", cacheReadPricePerMillion: "0" };
const zeroPricingCommand = { inputPricePerMillion: 0, outputPricePerMillion: 0, cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0, currency: "USD", tieredPricingEnabled: false, tieredPricingThreshold: null, highInputPricePerMillion: null, highOutputPricePerMillion: null, highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null };

const filled: ProviderFormValues = {
    name: "  测试服务商  ",
    api: "openai-completions",
    baseUrl: "  https://provider.example/v1  ",
    apiKey: "  synthetic-key  ",
};

const stored = {
    name: "测试服务商",
    api: "openai-completions",
    baseUrl: "https://provider.example/v1",
} as const;

describe("模型页表单", () => {
    it("创建时去掉名称与地址两端空白，但原样保留凭证", () => {
        const result = toCreateProviderCommand(filled);

        expect(result).toEqual({
            ok: true,
            command: {
                name: "测试服务商",
                api: "openai-completions",
                baseUrl: "https://provider.example/v1",
                // 凭证里的空白可能是密钥的一部分，裁掉就等于改密钥。
                apiKey: "  synthetic-key  ",
            },
        });
    });

    it("把创建失败定位到具体字段，不只报一句总错", () => {
        const result = toCreateProviderCommand({ ...filled, name: "   ", baseUrl: "http://provider.example/v1" });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.name).toBe("name");
        expect(result.errors.baseUrl).toBe("address");
    });

    it("改名时留空的 key 表示保留原值，命令里不出现凭证字段", () => {
        const result = toUpdateProviderCommand(3, stored, { ...stored, name: "新名字", apiKey: "   " });

        expect(result).toEqual({ ok: true, command: { expectedVersion: 3, name: "新名字" } });
    });

    it("只换 key 时不改动其它未动字段", () => {
        const result = toUpdateProviderCommand(3, stored, { ...stored, apiKey: " rotated " });

        expect(result).toEqual({ ok: true, command: { expectedVersion: 3, apiKey: " rotated " } });
    });

    it("编辑没有任何改动时拒绝提交，避免空写与版本消耗", () => {
        const result = toUpdateProviderCommand(3, stored, { ...stored, apiKey: "" });

        expect(result).toEqual({ ok: false, errors: { form: "unchanged" } });
    });

    it("把发现候选补成可保存的模型，并拒绝超出上限的预算", () => {
        const draft = { ...emptyModelDraft(), ...zeroPrices, modelId: "gpt-x", name: "GPT X", contextWindow: "128000", maxOutputTokens: "4096" };
        expect(toCreateModelCommand(draft)).toEqual({
            ok: true,
            command: { modelId: "gpt-x", name: "GPT X", contextWindow: 128000, maxOutputTokens: 4096, ...zeroPricingCommand },
        });

        const tooLarge = toCreateModelCommand({ ...draft, maxOutputTokens: "256000" });
        expect(tooLarge.ok).toBe(false);
    });

    it("预算字段不预填，留空按默认值提交", () => {
        const empty = emptyModelDraft();
        expect(empty.contextWindow).toBe("");
        expect(empty.maxOutputTokens).toBe("");

        // 数据库两列非空，输入框留空只能是「用默认值」，否则提交必然被 schema 拒绝。
        expect(toCreateModelCommand({ ...empty, ...zeroPrices, modelId: "gpt-x", name: "GPT X", contextWindow: "", maxOutputTokens: "" }))
            .toEqual({
                ok: true,
                command: {
                    modelId: "gpt-x",
                    name: "GPT X",
                    contextWindow: defaultContextWindow,
                    maxOutputTokens: defaultMaxOutputTokens,
                    ...zeroPricingCommand,
                },
            });
    });

    it("预算越界这类跨字段错误要落在具体输入框上，不能静默地什么都不做", () => {
        const result = toCreateModelCommand({ ...emptyModelDraft(), ...zeroPrices, modelId: "gpt-x", name: "GPT X", contextWindow: "100", maxOutputTokens: "200" });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.maxOutputTokens).toBe("maxOutputTokens");
    });

    it("拒绝空白价格且非负四价正常提交，非法数字落字段错误", () => {
        const base = { ...emptyModelDraft(), ...zeroPrices, modelId: "gpt-x", name: "GPT X" };
        expect(toCreateModelCommand({ ...base, inputPricePerMillion: "" }).ok).toBe(false);
        expect(toCreateModelCommand({ ...base, inputPricePerMillion: "1.5", outputPricePerMillion: "6" })).toMatchObject({
            ok: true, command: { inputPricePerMillion: 1.5, outputPricePerMillion: 6, cacheWritePricePerMillion: 0, cacheReadPricePerMillion: 0 },
        });
        const invalidInput = toCreateModelCommand({ ...base, inputPricePerMillion: "-1" });
        expect(invalidInput).toMatchObject({ ok: false, errors: { inputPricePerMillion: "inputPricePerMillion" } });
        const invalidOutput = toCreateModelCommand({ ...base, outputPricePerMillion: "abc" });
        expect(invalidOutput).toMatchObject({ ok: false, errors: { outputPricePerMillion: "outputPricePerMillion" } });
    });

    it("一批多行：逐行校验、行内不合法就整批不提交、同批重复标记在行上", () => {
        const valid = modelRowCommands([
            createModelDraftRow("a", { ...zeroPrices, modelId: "gpt-x", name: "GPT X" }),
            createModelDraftRow("b", { ...zeroPrices, modelId: "gpt-y", name: "GPT Y" }),
        ]);
        expect(valid.ok).toBe(true);
        if (!valid.ok) return;
        expect(valid.commands.map((item) => item.command.modelId)).toEqual(["gpt-x", "gpt-y"]);
        expect(valid.commands[0]?.command.contextWindow).toBe(defaultContextWindow);

        const duplicate = modelRowCommands([
            createModelDraftRow("a", { ...zeroPrices, modelId: "gpt-x", name: "GPT X" }),
            createModelDraftRow("b", { ...zeroPrices, modelId: "gpt-x", name: "GPT X again" }),
        ]);
        expect(duplicate.ok).toBe(false);
        if (duplicate.ok) return;
        expect(duplicate.errors.get("b")).toEqual({ modelId: "duplicate" });

        const invalid = modelRowCommands([
            createModelDraftRow("a", { ...zeroPrices, modelId: "gpt-x", name: "GPT X" }),
            createModelDraftRow("b", { ...zeroPrices, modelId: "", name: "没有 ID" }),
        ]);
        expect(invalid.ok).toBe(false);
        if (invalid.ok) return;
        expect(invalid.errors.get("b")?.modelId).toBe("modelId");
    });

    it("完全空着的草稿行不阻塞提交，也不产生写入", () => {
        const blank = modelRowCommands([
            createModelDraftRow("empty"),
            createModelDraftRow("a", { ...zeroPrices, modelId: "gpt-x", name: "GPT X" }),
        ]);
        expect(blank.ok).toBe(true);
        if (!blank.ok) return;
        expect(blank.commands).toHaveLength(1);

        const onlyBlank = modelRowCommands([createModelDraftRow("empty")]);
        expect(onlyBlank.ok).toBe(true);
        if (!onlyBlank.ok) return;
        expect(onlyBlank.commands).toHaveLength(0);
    });

    it("发现结果先填满空着的草稿行，多出来的才新建，默认空行不会永远留在最上面", () => {
        const selected: CandidateOption[] = [
            { modelId: "gpt-a", name: "GPT A", configured: false },
            { modelId: "gpt-b", name: "GPT B", configured: false },
        ];
        let next = 0;
        const nextKey = () => `draft-${(next += 1)}`;

        const first = fillDraftRows([createModelDraftRow("draft-0")], selected, nextKey);
        expect(first.rows.map((row) => row.values.modelId)).toEqual(["gpt-a", "gpt-b"]);
        expect(first.rows.map((row) => row.key)).toEqual(["draft-0", "draft-1"]);
        expect(first.touched).toEqual(["draft-0", "draft-1"]);

        // 已有内容（含只填了一半的行）不能被覆盖，新的候选只能追加。
        const second = fillDraftRows(
            [createModelDraftRow("kept", { modelId: "gpt-x", name: "GPT X" }), createModelDraftRow("draft-9")],
            [{ modelId: "gpt-c", name: "GPT C", configured: false }],
            nextKey,
        );
        expect(second.rows.map((row) => row.values.modelId)).toEqual(["gpt-x", "gpt-c"]);
        expect(second.touched).toEqual(["draft-9"]);
    });

    it("标记已配置的候选，而不是把它们从列表里藏掉", () => {
        const options = candidateOptions(
            [{ modelId: "gpt-x", name: "GPT X" }, { modelId: "gpt-y", name: "GPT Y" }],
            ["gpt-y"],
        );

        expect(options).toEqual([
            { modelId: "gpt-x", name: "GPT X", configured: false },
            { modelId: "gpt-y", name: "GPT Y", configured: true },
        ]);
    });

    it("把发现结果落成一句可行动的话，成功但空列表也要说清", () => {
        expect(discoveryNotice({ status: "succeeded", count: 3 })).toEqual({ kind: "found", count: 3 });
        expect(discoveryNotice({ status: "succeeded", count: 0 })).toEqual({ kind: "empty" });
        expect(discoveryNotice({ status: "failed", errorCode: "authentication_failed" }))
            .toEqual({ kind: "failed", reason: "authentication" });
        expect(discoveryNotice({ status: "failed", errorCode: "timeout" })).toEqual({ kind: "failed", reason: "timeout" });
        expect(discoveryNotice({ status: "failed", errorCode: "empty_result" })).toEqual({ kind: "empty" });
        expect(discoveryNotice({ status: "failed", errorCode: "response_too_large" }))
            .toEqual({ kind: "failed", reason: "tooLarge" });
        expect(discoveryNotice({ status: "failed", errorCode: "unsupported" }))
            .toEqual({ kind: "failed", reason: "unsupported" });
        expect(discoveryNotice({ status: "failed", errorCode: "malformed_response" }))
            .toEqual({ kind: "failed", reason: "malformed" });
        expect(discoveryNotice({ status: "failed", errorCode: "dependency_unavailable" }))
            .toEqual({ kind: "failed", reason: "unreachable" });
    });
});

describe("写操作失败的恢复提示", () => {
    it("版本冲突与凭证缺失分开，因为一个要重读、一个要补 key", () => {
        expect(writeFailureNotice(409, { code: "version_conflict" })).toBe("versionConflict");
        expect(writeFailureNotice(409, { code: "credential_missing" })).toBe("credentialMissing");
    });

    it("写来源未授权不能显示成网络故障", () => {
        // 403 forbidden_origin 是启动配置问题，提示必须指向来源白名单而不是网络。
        expect(writeFailureNotice(403, { code: "forbidden_origin" })).toBe("forbiddenOrigin");
    });

    it("重复录入不能提示成「稍后重试」，那个建议永远不成立", () => {
        expect(writeFailureNotice(409, { code: "already_exists" })).toBe("alreadyExists");
    });

    it("凭证还没写成功时不能显示成「保存成功」", () => {
        expect(writeFailureNotice(503, { code: "credential_write_failed" })).toBe("credentialWriteFailed");
        expect(writeFailureNotice(503, { code: "cleanup_pending" })).toBe("cleanupPending");
        expect(writeFailureNotice(409, { code: "operation_in_progress" })).toBe("operationInProgress");
    });

    it("未知形状或异常正文不泄漏成界面文案，退回统一的不可用提示", () => {
        expect(writeFailureNotice(400, { code: "invalid_input" })).toBe("unavailable");
        expect(writeFailureNotice(500, "secret-key-abc")).toBe("unavailable");
        expect(writeFailureNotice(404, null)).toBe("notFound");
    });
});
describe("服务商写入结果", () => {
    const provider = {
        id: "provider-1",
        name: "测试服务商",
        api: "openai-completions" as const,
        baseUrl: "https://provider.example/v1",
        version: 1,
        state: "active" as const,
        credentialState: "configured" as const,
        createdAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-20T00:00:00.000Z",
    };

    it("直接返回服务商快照时才算保存成功", () => {
        expect(providerWriteOutcome(provider)).toEqual({ kind: "saved", provider });
    });

    it("操作还在 pending 时不能当作成功：此时 key 可能还没落盘", () => {
        const operation = {
            id: "operation-1",
            kind: "create" as const,
            providerId: "provider-1",
            state: "pending" as const,
            resourceVersion: null,
        };
        expect(providerWriteOutcome(operation)).toEqual({ kind: "pending", operation });
    });

    it("失败的操作带原因，凭证写失败与版本冲突的恢复动作不同", () => {
        expect(providerWriteOutcome({
            id: "operation-2",
            kind: "update" as const,
            providerId: "provider-1",
            state: "failed" as const,
            resourceVersion: null,
            errorCode: "credential_write_failed" as const,
        })).toEqual({ kind: "failed", notice: "credentialWriteFailed" });
        expect(providerWriteOutcome({
            id: "operation-3",
            kind: "update" as const,
            providerId: "provider-1",
            state: "failed" as const,
            resourceVersion: null,
            errorCode: "version_conflict" as const,
        })).toEqual({ kind: "failed", notice: "versionConflict" });
    });
});