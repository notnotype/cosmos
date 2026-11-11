import {
    createModelProviderCommandSchema,
    updateModelProviderCommandSchema,
    type CreateModelProviderCommand,
    type UpdateModelProviderCommand,
} from "@cosmos/contracts";

export type ProviderFormValues = {
    name: string;
    api: "openai-completions" | "openai-responses";
    baseUrl: string;
    /** 空字符串表示「不修改已保存的凭证」；创建时必填。 */
    apiKey: string;
};

export type ProviderFormField = "name" | "api" | "baseUrl" | "apiKey";
/** `form` 是整体性拒绝，没有可定位的字段。 */
export type ProviderFormErrors = Partial<Record<ProviderFormField | "form", string>>;

export type DraftResult<TCommand, TErrors = ProviderFormErrors> =
    | { ok: true; command: TCommand }
    | { ok: false; errors: TErrors };

const issueReasons: Record<string, string> = {
    name: "name",
    api: "protocol",
    baseUrl: "address",
    apiKey: "credential",
};

function errorsFromIssues(issues: readonly { path: readonly PropertyKey[] }[]): ProviderFormErrors {
    const errors: ProviderFormErrors = {};
    for (const issue of issues) {
        const field = String(issue.path[0] ?? "");
        const reason = issueReasons[field];
        if (reason !== undefined && errors[field as ProviderFormField] === undefined) {
            errors[field as ProviderFormField] = reason;
        }
    }
    return errors;
}

function trimmedProvider(values: ProviderFormValues): ProviderFormValues {
    return {
        name: values.name.trim(),
        api: values.api,
        baseUrl: values.baseUrl.trim(),
        // 凭证两端空白可能是密钥本体的一部分，裁掉就等于改了密钥。
        apiKey: values.apiKey,
    };
}

export function toCreateProviderCommand(values: ProviderFormValues): DraftResult<CreateModelProviderCommand> {
    const parsed = createModelProviderCommandSchema.safeParse(trimmedProvider(values));
    return parsed.success
        ? { ok: true, command: parsed.data }
        : { ok: false, errors: errorsFromIssues(parsed.error.issues) };
}

export type StoredProvider = {
    name: string;
    api: ProviderFormValues["api"];
    baseUrl: string;
};

/**
 * 编辑只提交与已保存值不同的字段：不变的字段不进请求，就不会因为界面里的一次误触
 * 把 Provider 版本推高一格。留空的凭证表示保留原值——用户无法读出已保存的 key，
 * 所以「空 = 不改」是唯一不会把凭证删掉的解释。
 */
export function toUpdateProviderCommand(
    expectedVersion: number,
    stored: StoredProvider,
    values: ProviderFormValues,
): DraftResult<UpdateModelProviderCommand> {
    const next = trimmedProvider(values);
    const changed: Record<string, string | number> = { expectedVersion };
    if (next.name !== stored.name) changed.name = next.name;
    if (next.api !== stored.api) changed.api = next.api;
    if (next.baseUrl !== stored.baseUrl) changed.baseUrl = next.baseUrl;
    if (next.apiKey.trim() !== "") changed.apiKey = next.apiKey;

    if (Object.keys(changed).length === 1) {
        return { ok: false, errors: { form: "unchanged" } };
    }

    const parsed = updateModelProviderCommandSchema.safeParse(changed);
    return parsed.success
        ? { ok: true, command: parsed.data }
        : { ok: false, errors: errorsFromIssues(parsed.error.issues) };
}
