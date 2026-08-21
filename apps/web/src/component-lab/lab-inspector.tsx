import {useState} from "react";
import type {ChangeEvent} from "react";

import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Field, FieldGroup, FieldLabel} from "@/components/ui/field";
import {Input} from "@/components/ui/input";

import {resolveLabTokenValueOnBlur} from "./draft";
import {serializeLabOverrideSnapshot} from "./snapshot";
import type {
    LabComponentDefinition,
    LabPrimitive,
    LabProps,
    LabTokenDefinition,
    LabTokenName,
} from "./types";

type LabInspectorProps = {
    definition: LabComponentDefinition;
    onChange: (name: string, value: LabPrimitive) => void;
    onImport: (raw: string) => void;
    onTokenChange: (name: LabTokenName, value: string) => void;
    props: LabProps;
    tokenDefinitions: readonly LabTokenDefinition[];
    tokenError: string | null;
    tokenOverrides: Readonly<Record<string, string>>;
};

function downloadSnapshot(overrides: Readonly<Record<string, string>>): void {
    const blob = new Blob([serializeLabOverrideSnapshot(overrides)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.download = "cosmos-component-lab.tokens.json";
    anchor.href = url;
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

export function LabInspector({
    definition,
    onChange,
    onImport,
    onTokenChange,
    props,
    tokenDefinitions,
    tokenError,
    tokenOverrides,
}: LabInspectorProps) {
    const [tokenValues, setTokenValues] = useState<Record<string, string>>({});
    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file === undefined) {
            return;
        }
        void file.text().then(onImport).catch(() => onImport(""));
    };

    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="text-base">属性与状态</CardTitle>
            </CardHeader>
            <CardContent>
                <FieldGroup>
                    {definition.controls.map((control) => {
                        const value = props[control.name] ?? control.defaultValue;
                        const id = `lab-control-${definition.id}-${control.name}`;
                        if (control.kind === "boolean") {
                            return (
                                <Field key={control.name} orientation="horizontal">
                                    <input
                                        checked={value === true}
                                        id={id}
                                        onChange={(event) => onChange(control.name, event.currentTarget.checked)}
                                        type="checkbox"
                                    />
                                    <FieldLabel htmlFor={id}>{control.label}</FieldLabel>
                                </Field>
                            );
                        }
                        if (control.kind === "select") {
                            return (
                                <Field key={control.name}>
                                    <FieldLabel htmlFor={id}>{control.label}</FieldLabel>
                                    <select
                                        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                                        id={id}
                                        onChange={(event) => onChange(control.name, event.currentTarget.value)}
                                        value={String(value)}
                                    >
                                        {control.options.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            );
                        }
                        return (
                            <Field key={control.name}>
                                <FieldLabel htmlFor={id}>{control.label}</FieldLabel>
                                <Input
                                    id={id}
                                    onChange={(event) => onChange(control.name, event.currentTarget.value)}
                                    type="text"
                                    value={String(value)}
                                />
                            </Field>
                        );
                    })}
                </FieldGroup>
                <section aria-labelledby="lab-token-heading" className="mt-6 border-t pt-5">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-medium" id="lab-token-heading">Token 草稿</h3>
                            <p className="mt-1 text-xs text-muted-foreground">只作用于预览根节点</p>
                        </div>
                        <Button onClick={() => downloadSnapshot(tokenOverrides)} size="sm" variant="outline">
                            导出 JSON
                        </Button>
                    </div>
                    <FieldGroup className="mt-4">
                        {tokenDefinitions.map((token) => (
                            <Field key={token.name}>
                                <FieldLabel htmlFor={`lab-token-${token.name}`}>
                                    {token.label}
                                    <span className="font-mono text-[10px] text-muted-foreground">{token.name}</span>
                                </FieldLabel>
                                <Input
                                    id={`lab-token-${token.name}`}
                                    onBlur={() => onTokenChange(
                                        token.name,
                                        resolveLabTokenValueOnBlur(tokenValues, tokenOverrides, token.name),
                                    )}
                                    onChange={(event) => {
                                        const value = event.currentTarget.value;
                                        setTokenValues((current) => ({...current, [token.name]: value}));
                                    }}
                                    placeholder={token.defaultValue}
                                    type="text"
                                    value={tokenValues[token.name] ?? tokenOverrides[token.name] ?? ""}
                                />
                            </Field>
                        ))}
                    </FieldGroup>
                    <div className="mt-4 flex flex-col gap-2">
                        <label className="text-xs font-medium" htmlFor="lab-token-import">导入 JSON</label>
                        <Input
                            accept="application/json,.json"
                            id="lab-token-import"
                            onChange={handleFileChange}
                            type="file"
                        />
                    </div>
                    {tokenError !== null && (
                        <p aria-live="polite" className="mt-3 text-xs text-destructive" role="alert">
                            {tokenError}
                        </p>
                    )}
                </section>
            </CardContent>
        </Card>
    );
}
