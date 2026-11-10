"use client";

import { ModelProviderPanel } from "@/components/cosmos/model-provider-panel";
import { client } from "@/app/home/page-runtime";
import { messages } from "@/copy/messages";

/*
 * 模型与服务商独立管理；全局默认在设置页选择。
 *
 * 这一页是独立入口，不挂在自动化页里：凭证配置与采集计划无关，一个只想填 key 的人
 * 不该先看到计划、运行记录和连接。
 */
export default function ModelsPage() {
    return (
        <div className="flex w-full flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[15px] font-medium">{messages.pages.models.title}</h1>
                <span className="text-[12px] text-muted-foreground">
                    {messages.pages.models.description}
                </span>
            </div>

            <section aria-label={messages.pages.models.providers} className="flex flex-col gap-3">
                <ModelProviderPanel client={client} />
            </section>
        </div>
    );
}
