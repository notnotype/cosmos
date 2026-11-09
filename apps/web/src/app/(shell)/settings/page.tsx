"use client";

import { client } from "@/app/home/page-runtime";

import { DefaultModelPanel } from "@/components/cosmos/default-model-panel";
import { StoragePanel } from "@/components/cosmos/storage-panel";
import { messages } from "@/copy/messages";

/*
 * 设置（PRD §8.6）。存储与数据管理这一面：Data Root 占用、媒体保留与清理、备份导出。
 * 单用户本地部署，没有账号、权限或通知渠道；媒体保留策略按来源配置，入口在 /automation
 * 的采集计划行内，这里只给全局的占用与清理。
 */
export default function SettingsPage() {
    return (
        <div className="flex w-full flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[15px] font-medium">{messages.pages.settings.title}</h1>
                <span className="text-[12px] text-muted-foreground">
                    {messages.pages.settings.description}
                </span>
            </div>

            <section aria-label={messages.pages.settings.storage} className="flex flex-col gap-3">
                <h2 className="text-[15px] font-medium">{messages.pages.settings.storage}</h2>
                <StoragePanel client={client} />
            </section>

            <section aria-label={messages.pages.settings.defaultModel.section} className="flex flex-col gap-3">
                <h2 className="text-[15px] font-medium">{messages.pages.settings.defaultModel.section}</h2>
                <DefaultModelPanel client={client} />
            </section>
        </div>
    );
}
