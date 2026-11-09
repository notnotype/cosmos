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
        const draft = { ...emptyModelDraft(), modelId: "gpt-x", name: "GPT X", contextWindow: "128000", maxOutputTokens: "4096" };
        expect(toCreateModelCommand(draft)).toEqual({
            ok: true,
            command: { modelId: "gpt-x", name: "GPT X", contextWindow: 128000, maxOutputTokens: 4096 },
        });

        const tooLarge = toCreateModelCommand({ ...draft, maxOutputTokens: "256000" });
        expect(tooLarge.ok).toBe(false);
    });

    it("预算字段不预填，留空按默认值提交", () => {
        const empty = emptyModelDraft();
        expect(empty.contextWindow).toBe("");
        expect(empty.maxOutputTokens).toBe("");

        // 数据库两列非空，输入框留空只能是「用默认值」，否则提交必然被 schema 拒绝。
        expect(toCreateModelCommand({ ...empty, modelId: "gpt-x", name: "GPT X", contextWindow: "", maxOutputTokens: "" }))
            .toEqual({
                ok: true,
                command: {
                    modelId: "gpt-x",
                    name: "GPT X",
                    contextWindow: defaultContextWindow,
                    maxOutputTokens: defaultMaxOutputTokens,
                },
            });
    });

    it("预算越界这类跨字段错误要落在具体输入框上，不能静默地什么都不做", () => {
        const result = toCreateModelCommand({ ...emptyModelDraft(), modelId: "gpt-x", name: "GPT X", contextWindow: "100", maxOutputTokens: "200" });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.maxOutputTokens).toBe("maxOutputTokens");
    });

    it("价格字段留空不进请求；非负数字正常提交；非法数字落字段错误", () => {
        const base = { ...emptyModelDraft(), modelId: "gpt-x", name: "GPT X" };

        expect(toCreateModelCommand(base)).toEqual({
            ok: true,
            command: { modelId: "gpt-x", name: "GPT X", contextWindow: defaultContextWindow, maxOutputTokens: defaultMaxOutputTokens },
        });

        const priced = toCreateModelCommand({ ...base, inputPricePerMillion: "1.5", outputPricePerMillion: "6" });
        expect(priced).toEqual({
            ok: true,
            command: {
                modelId: "gpt-x", name: "GPT X",
                contextWindow: defaultContextWindow, maxOutputTokens: defaultMaxOutputTokens,
                inputPricePerMillion: 1.5, outputPricePerMillion: 6,
            },
        });

        const invalidInput = toCreateModelCommand({ ...base, inputPricePerMillion: "-1" });
        expect(invalidInput.ok).toBe(false);
        if (invalidInput.ok) return;
        expect(invalidInput.errors.inputPricePerMillion).toBe("inputPricePerMillion");

        const invalidOutput = toCreateModelCommand({ ...base, outputPricePerMillion: "abc" });
        expect(invalidOutput.ok).toBe(false);
        if (invalidOutput.ok) return;
        expect(invalidOutput.errors.outputPricePerMillion).toBe("outputPricePerMillion");
    });

    it("一批多行：逐行校验、行内不合法就整批不提交、同批重复标记在行上", () => {
        const valid = modelRowCommands([
            createModelDraftRow("a", { modelId: "gpt-x", name: "GPT X" }),
            createModelDraftRow("b", { modelId: "gpt-y", name: "GPT Y" }),
        ]);
        expect(valid.ok).toBe(true);
        if (!valid.ok) return;
        expect(valid.commands.map((item) => item.command.modelId)).toEqual(["gpt-x", "gpt-y"]);
        expect(valid.commands[0]?.command.contextWindow).toBe(defaultContextWindow);

        const duplicate = modelRowCommands([
            createModelDraftRow("a", { modelId: "gpt-x", name: "GPT X" }),
            createModelDraftRow("b", { modelId: "gpt-x", name: "GPT X again" }),
        ]);
        expect(duplicate.ok).toBe(false);
        if (duplicate.ok) return;
        expect(duplicate.errors.get("b")).toEqual({ modelId: "duplicate" });

        const invalid = modelRowCommands([
            createModelDraftRow("a", { modelId: "gpt-x", name: "GPT X" }),
            createModelDraftRow("b", { modelId: "", name: "没有 ID" }),
        ]);
        expect(invalid.ok).toBe(false);
        if (invalid.ok) return;
        expect(invalid.errors.get("b")?.modelId).toBe("modelId");
    });

    it("完全空着的草稿行不阻塞提交，也不产生写入", () => {
        const blank = modelRowCommands([
            createModelDraftRow("empty"),
            createModelDraftRow("a", { modelId: "gpt-x", name: "GPT X" }),
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