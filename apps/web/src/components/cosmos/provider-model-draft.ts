import {
    createConfiguredModelCommandSchema,
    updateConfiguredModelCommandSchema,
    type ConfiguredModelSnapshot,
    type UpdateConfiguredModelCommand,
    type CreateConfiguredModelCommand,
    type ModelProviderOperationSnapshot,
    type ModelProviderSnapshot,
    type ProviderModelDiscoveryCandidate,
    type ProviderModelDiscoveryErrorCode,
} from "@cosmos/contracts";

import type { DraftResult } from "./provider-model/provider-form-draft";
export {
    toCreateProviderCommand,
    toUpdateProviderCommand,
    type ProviderFormValues,
    type ProviderFormField,
    type ProviderFormErrors,
    type DraftResult,
    type StoredProvider,
} from "./provider-model/provider-form-draft";

/**
 * 模型页的表单只有一套判据：合同 schema。这里不重复写校验规则，只负责三件界面才关心的事——
 * 哪些空白要裁（名称、地址）而哪些不能裁（凭证）、编辑时怎么算出「真的改了什么」、
 * 以及把校验失败落到具体字段上。
 *
 * 逻辑放在 `.ts` 而不是组件里，是因为仓库没有 DOM 测试环境：这些判据要能被行为测试直接钉住。
 */

export type ModelDraftValues = {
    modelId: string;
    name: string;
    contextWindow: string;
    maxOutputTokens: string;
    inputPricePerMillion: string;
    outputPricePerMillion: string;
    cacheWritePricePerMillion: string;
    cacheReadPricePerMillion: string;
    currency: "USD" | "CNY";
    tieredPricingEnabled: boolean;
    tieredPricingThreshold: string;
    highInputPricePerMillion: string;
    highOutputPricePerMillion: string;
    highCacheWritePricePerMillion: string;
    highCacheReadPricePerMillion: string;
};

/**
 * 上游的模型列表只返回模型 ID 与显示名称，不返回两个预算。这两个字段在数据库里是非空列，
 * 所以「选填」只能做成「留空就提交默认值」：输入框里只放 placeholder，不预填数值。
 * 数值取主流长上下文档位，低于它的模型会被上游拒绝超长请求，用户可以按需改小。
 */
export const defaultContextWindow = 262_144;
export const defaultMaxOutputTokens = 32_768;

export function emptyModelDraft(): ModelDraftValues {
    return {
        modelId: "",
        name: "",
        contextWindow: "",
        maxOutputTokens: "",
        inputPricePerMillion: "",
        outputPricePerMillion: "",
        cacheWritePricePerMillion: "",
        cacheReadPricePerMillion: "",
        currency: "USD",
        tieredPricingEnabled: false,
        tieredPricingThreshold: "272000",
        highInputPricePerMillion: "",
        highOutputPricePerMillion: "",
        highCacheWritePricePerMillion: "",
        highCacheReadPricePerMillion: "",
    };
}

/** 一行待录入的模型。key 只用于 React 列表与「哪一行的错误」，不进入请求。 */
export type ModelDraftRow = { key: string; values: ModelDraftValues };

export function createModelDraftRow(key: string, values: Partial<ModelDraftValues> = {}): ModelDraftRow {
    return { key, values: { ...emptyModelDraft(), ...values } };
}

export type ModelFormField = keyof ModelDraftValues;
export type ModelFormErrors = Partial<Record<ModelFormField | "form", string>>;

const modelIssueReasons: Record<string, string> = {
    modelId: "modelId",
    name: "name",
    contextWindow: "contextWindow",
    maxOutputTokens: "maxOutputTokens",
    inputPricePerMillion: "inputPricePerMillion",
    outputPricePerMillion: "outputPricePerMillion",
    cacheWritePricePerMillion: "cacheWritePricePerMillion",
    cacheReadPricePerMillion: "cacheReadPricePerMillion",
    tieredPricingThreshold: "tieredPricingThreshold",
    highInputPricePerMillion: "highInputPricePerMillion",
    highOutputPricePerMillion: "highOutputPricePerMillion",
    highCacheWritePricePerMillion: "highCacheWritePricePerMillion",
    highCacheReadPricePerMillion: "highCacheReadPricePerMillion",
};

/** 数字输入框给的是字符串；空串与小数都要在提交前被拒，而不是 Number() 后变成 NaN 或 0。 */
function toBudget(value: string): number | null {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** 清空输入框表示「用默认预算」，不是 `0`：这两个字段在库里非空。 */
function toBudgetOrDefault(value: string, fallback: number): number | null {
    return value.trim() === "" ? fallback : toBudget(value);
}

/** 空白价格不是免费；用无效数值交给合同，将错误定位到对应价格字段。 */
function toPrice(value: string): number {
    return value.trim() === "" ? Number.NaN : Number(value);
}

const priceKeys = ["inputPricePerMillion", "outputPricePerMillion", "cacheWritePricePerMillion", "cacheReadPricePerMillion"] as const;
const highPriceKeys = ["highInputPricePerMillion", "highOutputPricePerMillion", "highCacheWritePricePerMillion", "highCacheReadPricePerMillion"] as const;

function pricingCommand(values: ModelDraftValues) {
    return {
        inputPricePerMillion: toPrice(values.inputPricePerMillion),
        outputPricePerMillion: toPrice(values.outputPricePerMillion),
        cacheWritePricePerMillion: toPrice(values.cacheWritePricePerMillion),
        cacheReadPricePerMillion: toPrice(values.cacheReadPricePerMillion),
        currency: values.currency,
        tieredPricingEnabled: values.tieredPricingEnabled,
        tieredPricingThreshold: values.tieredPricingEnabled ? (toBudget(values.tieredPricingThreshold) ?? Number.NaN) : null,
        highInputPricePerMillion: values.tieredPricingEnabled ? toPrice(values.highInputPricePerMillion) : null,
        highOutputPricePerMillion: values.tieredPricingEnabled ? toPrice(values.highOutputPricePerMillion) : null,
        highCacheWritePricePerMillion: values.tieredPricingEnabled ? toPrice(values.highCacheWritePricePerMillion) : null,
        highCacheReadPricePerMillion: values.tieredPricingEnabled ? toPrice(values.highCacheReadPricePerMillion) : null,
    };
}

function modelErrors(issues: readonly { path: readonly PropertyKey[] }[]): ModelFormErrors {
    const errors: ModelFormErrors = {};
    for (const issue of issues) {
        const field = issue.path.length === 0 ? "maxOutputTokens" : String(issue.path[0]);
        if (field in modelIssueReasons) errors[field as ModelFormField] = modelIssueReasons[field];
    }
    return errors;
}

export function toCreateModelCommand(values: ModelDraftValues): DraftResult<CreateConfiguredModelCommand, ModelFormErrors> {
    const parsed = createConfiguredModelCommandSchema.safeParse({
        modelId: values.modelId.trim(), name: values.name.trim(),
        contextWindow: toBudgetOrDefault(values.contextWindow, defaultContextWindow),
        maxOutputTokens: toBudgetOrDefault(values.maxOutputTokens, defaultMaxOutputTokens),
        ...pricingCommand(values),
    });
    return parsed.success ? { ok: true, command: parsed.data } : { ok: false, errors: modelErrors(parsed.error.issues) };
}

export function modelDraftFromSnapshot(model: ConfiguredModelSnapshot): ModelDraftValues {
    const values = { ...emptyModelDraft(), modelId: model.modelId, name: model.name,
        contextWindow: String(model.contextWindow), maxOutputTokens: String(model.maxOutputTokens),
        currency: model.currency, tieredPricingEnabled: model.tieredPricingEnabled,
        tieredPricingThreshold: String(model.tieredPricingThreshold ?? 272000) };
    for (const key of [...priceKeys, ...highPriceKeys]) values[key] = model[key] == null ? "" : String(model[key]);
    return values;
}

export function toUpdateModelCommand(
    model: ConfiguredModelSnapshot, values: ModelDraftValues,
): DraftResult<UpdateConfiguredModelCommand, ModelFormErrors> {
    const previous = modelDraftFromSnapshot(model);
    const changes: Record<string, unknown> = { expectedVersion: model.version };
    if (values.modelId.trim() !== model.modelId) changes.modelId = values.modelId.trim();
    if (values.name.trim() !== model.name) changes.name = values.name.trim();
    if (values.contextWindow !== previous.contextWindow) changes.contextWindow = toBudgetOrDefault(values.contextWindow, defaultContextWindow);
    if (values.maxOutputTokens !== previous.maxOutputTokens) changes.maxOutputTokens = toBudgetOrDefault(values.maxOutputTokens, defaultMaxOutputTokens);
    const pricingChanged = values.currency !== previous.currency || values.tieredPricingEnabled !== previous.tieredPricingEnabled
        || priceKeys.some((key) => values[key] !== previous[key])
        || (values.tieredPricingEnabled && (values.tieredPricingThreshold !== previous.tieredPricingThreshold
            || highPriceKeys.some((key) => values[key] !== previous[key])));
    if (pricingChanged) Object.assign(changes, pricingCommand(values));
    if (Object.keys(changes).length === 1) return { ok: false, errors: { form: "unchanged" } };
    const context = toBudgetOrDefault(values.contextWindow, defaultContextWindow);
    const output = toBudgetOrDefault(values.maxOutputTokens, defaultMaxOutputTokens);
    if (context !== null && output !== null && output > context) return { ok: false, errors: { maxOutputTokens: "maxOutputTokens" } };
    const parsed = updateConfiguredModelCommandSchema.safeParse(changes);
    return parsed.success ? { ok: true, command: parsed.data } : { ok: false, errors: modelErrors(parsed.error.issues) };
}

/**
 * 一次提交多行时的逐行校验：先整批校验，任一行不合法就一行都不提交——部分提交会让用户
 * 对着「有几个成功了」的列表重新数一遍。同一批里重复的模型 ID 由界面拦下，
 * 不必等一次必然失败的写入。
 *
 * 完全空着的行被跳过：默认表单就带着一行空行，发现结果追加后它会留在最上面，
 * 不跳过就等于要求用户先手动删掉它。只有模型 ID 与名称都为空才算空行，
 * 因为只填了预算的行多半是填到一半。
 */
export function modelRowCommands(
    rows: readonly ModelDraftRow[],
): { ok: true; commands: readonly { key: string; command: CreateConfiguredModelCommand }[] } | { ok: false; errors: ReadonlyMap<string, ModelFormErrors> } {
    const errors = new Map<string, ModelFormErrors>();
    const seen = new Set<string>();
    const commands: { key: string; command: CreateConfiguredModelCommand }[] = [];

    for (const row of rows) {
        if (row.values.modelId.trim() === "" && row.values.name.trim() === "") continue;
        const result = toCreateModelCommand(row.values);
        if (!result.ok) {
            errors.set(row.key, result.errors);
            continue;
        }
        const modelId = result.command.modelId;
        if (seen.has(modelId)) {
            errors.set(row.key, { modelId: "duplicate" });
            continue;
        }
        seen.add(modelId);
        commands.push({ key: row.key, command: result.command });
    }

    return errors.size > 0 ? { ok: false, errors } : { ok: true, commands };
}

export type CandidateOption = ProviderModelDiscoveryCandidate & { configured: boolean };

/** 已配置的候选仍然留在列表里并标出来：隐藏它们会让用户以为上游已经没有这个模型。 */
export function candidateOptions(
    candidates: readonly ProviderModelDiscoveryCandidate[],
    configuredModelIds: readonly string[],
): CandidateOption[] {
    const configured = new Set(configuredModelIds);
    return candidates.map((candidate) => ({
        modelId: candidate.modelId,
        name: candidate.name,
        configured: configured.has(candidate.modelId),
    }));
}

export type DiscoveryNotice =
    | { kind: "found"; count: number }
    | { kind: "empty" }
    | { kind: "failed"; reason: "authentication" | "unsupported" | "timeout" | "tooLarge" | "malformed" | "unreachable" };

/**
 * 把弹窗挑中的候选落成草稿行：先占用「模型 ID 与显示名称都为空」的行，多出来的才新建。
 * 一律新建会把默认那一行永远留在最上面，用户得先删掉它才能继续填。
 * `touched` 是这一轮被写入的行 key，用来清掉它们上一次的错误。
 */
export function fillDraftRows(
    rows: readonly ModelDraftRow[],
    selected: readonly CandidateOption[],
    nextKey: () => string,
): { rows: readonly ModelDraftRow[]; touched: readonly string[] } {
    if (selected.length === 0) return { rows, touched: [] };

    const emptyKeys = rows
        .filter((row) => row.values.modelId.trim() === "" && row.values.name.trim() === "")
        .map((row) => row.key);
    const filled = new Map(emptyKeys.slice(0, selected.length).map((key, position) => [key, selected[position]!]));
    const appended = selected.slice(filled.size).map((option) => createModelDraftRow(nextKey(), {
        modelId: option.modelId,
        name: option.name,
    }));
    const next = rows.map((row) => {
        const option = filled.get(row.key);
        return option === undefined
            ? row
            : { ...row, values: { ...row.values, modelId: option.modelId, name: option.name } };
    });

    return {
        rows: [...next, ...appended],
        touched: [...filled.keys(), ...appended.map((row) => row.key)],
    };
}

export type DiscoveryOutcome =
    | { status: "succeeded"; count: number }
    | { status: "failed"; errorCode: ProviderModelDiscoveryErrorCode };

const failureReasons: Record<ProviderModelDiscoveryErrorCode, DiscoveryNotice | null> = {
    authentication_failed: { kind: "failed", reason: "authentication" },
    unsupported: { kind: "failed", reason: "unsupported" },
    timeout: { kind: "failed", reason: "timeout" },
    response_too_large: { kind: "failed", reason: "tooLarge" },
    malformed_response: { kind: "failed", reason: "malformed" },
    dependency_unavailable: { kind: "failed", reason: "unreachable" },
    // 上游回了空列表和「上游没有可用模型」是同一件事，不必分成两句。
    empty_result: { kind: "empty" },
};

export function discoveryNotice(outcome: DiscoveryOutcome): DiscoveryNotice {
    if (outcome.status === "succeeded") {
        return outcome.count === 0 ? { kind: "empty" } : { kind: "found", count: outcome.count };
    }
    return failureReasons[outcome.errorCode] ?? { kind: "failed", reason: "unreachable" };
}

/**
 * 写操作失败的分级：界面必须能区分「你改慢了」「凭证没写进去」「服务暂时不可用」，
 * 因为恢复动作完全不同（重读再保存 / 再点一次让其补偿 / 稍后重试）。
 * 判据只来自 HTTP 状态与固定错误码，不回显服务端正文。
 */
export type WriteFailureNotice =
    | "versionConflict"
    | "alreadyExists"
    | "inUse"
    | "credentialMissing"
    | "operationInProgress"
    | "cleanupPending"
    | "credentialWriteFailed"
    | "forbiddenOrigin"
    | "notFound"
    | "payloadTooLarge"
    | "unavailable";

/** 只读状态码与 `body.code`：服务端正文不进界面，异常原文也不进。 */
export function writeFailureNotice(status: number, body: unknown): WriteFailureNotice {
    const code = typeof body === "object" && body !== null && "code" in body && typeof body.code === "string"
        ? body.code
        : null;
    if (code === "version_conflict") return "versionConflict";
    // 同一服务商下已有同一模型：重试永远不会成功，必须让人去核对已有条目。
    if (code === "already_exists") return "alreadyExists";
    // 被连接引用的模型删不掉：先改掉那些连接才可能成功，重试没有意义。
    if (code === "in_use") return "inUse";
    if (code === "credential_missing") return "credentialMissing";
    if (code === "operation_in_progress") return "operationInProgress";
    if (code === "cleanup_pending") return "cleanupPending";
    if (code === "credential_write_failed") return "credentialWriteFailed";
    // 写来源未授权和网络故障的恢复动作完全不同（改启动配置 vs 重试），
    // 归到 unavailable 会把用户引向检查地址和 Key。
    if (code === "forbidden_origin") return "forbiddenOrigin";
    if (status === 404) return "notFound";
    if (status === 413) return "payloadTooLarge";
    return "unavailable";
}
/**
 * 创建/更新的响应可能是「已存好的服务商」也可能是「还没写完的操作」：凭证写入失败或
 * 旧凭证清理未完时，服务端返回的是操作快照，而不是成功。把这件事单独建模，
 * 界面才不会把 `pending` 当成「保存成功」——那会让人以为 key 已经可用。
 */
export type ProviderWriteOutcome =
    | { kind: "saved"; provider: ModelProviderSnapshot }
    | { kind: "pending"; operation: ModelProviderOperationSnapshot }
    | { kind: "failed"; notice: WriteFailureNotice };

const operationErrorNotices: Record<string, WriteFailureNotice> = {
    credential_write_failed: "credentialWriteFailed",
    cleanup_pending: "cleanupPending",
    dependency_unavailable: "unavailable",
    version_conflict: "versionConflict",
    operation_in_progress: "operationInProgress",
};

export function providerWriteOutcome(
    result: ModelProviderSnapshot | ModelProviderOperationSnapshot,
): ProviderWriteOutcome {
    if (!("kind" in result)) {
        return { kind: "saved", provider: result };
    }
    if (result.state === "failed") {
        const notice = result.errorCode === null || result.errorCode === undefined
            ? "unavailable"
            : operationErrorNotices[result.errorCode] ?? "unavailable";
        return { kind: "failed", notice };
    }
    return { kind: "pending", operation: result };
}