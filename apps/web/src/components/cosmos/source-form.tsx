import type {FormEventHandler} from "react";
import type {UseFormReturn} from "react-hook-form";
import {z} from "zod";

import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";

export const sourceFormSchema = z.object({
    name: z.string().trim().min(1).max(200),
    fixturePath: z.string().trim().min(1),
});

export type SourceFormValues = z.input<typeof sourceFormSchema>;

type SourceFormProps = {
    form: UseFormReturn<SourceFormValues>;
    onSubmit: FormEventHandler<HTMLFormElement>;
};

export function SourceForm({form, onSubmit}: SourceFormProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>新建 RSS 来源</CardTitle>
                <CardDescription>
                    当前首条切片使用本地 fixture；真实 RSS 只需要把类型改为 RSS 并填写 Feed URL。
                </CardDescription>
            </CardHeader>
            <form onSubmit={onSubmit}>
                <CardContent>
                    <FieldGroup>
                        <Field data-invalid={Boolean(form.formState.errors.name)}>
                            <FieldLabel htmlFor="source-name">名称</FieldLabel>
                            <Input
                                id="source-name"
                                aria-invalid={Boolean(form.formState.errors.name)}
                                {...form.register("name")}
                            />
                            <FieldError errors={[form.formState.errors.name]} />
                        </Field>
                        <Field data-invalid={Boolean(form.formState.errors.fixturePath)}>
                            <FieldLabel htmlFor="fixture-path">Fixture 路径</FieldLabel>
                            <Textarea
                                id="fixture-path"
                                aria-invalid={Boolean(form.formState.errors.fixturePath)}
                                {...form.register("fixturePath")}
                            />
                            <FieldDescription>
                                相对于服务器工作目录的路径，例如 fixtures/rss/basic.xml。
                            </FieldDescription>
                            <FieldError errors={[form.formState.errors.fixturePath]} />
                        </Field>
                    </FieldGroup>
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? "保存中…" : "保存来源"}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
