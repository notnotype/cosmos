"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import type {
    BoardBlock,
    BoardDetail,
    CollectionSummary,
    SavedView,
    TopicSummary,
} from "@cosmos/contracts";
import type { HttpCosmosClient } from "@cosmos/transport-http";

import { BoardBlockContent } from "./board-view/blocks";
import { AddBlockForm, AddSectionForm, BlockEditor, SectionEditor } from "./board-view/editor";
import { BlockPlaceholder, blockTypeLabel } from "./board-view/shared";
import type { BoardCommands, BoardViewProps } from "./board-view/types";

export type { BoardCommands } from "./board-view/types";
export type { BoardViewProps } from "./board-view/types";

// 浏览模式不需要拖拽；保留同一个编辑子树边界，避免首屏加载编辑依赖。
const BoardDndProvider = dynamic(() => import("./board-sortable-blocks").then((module) => module.BoardDndProvider));
const BoardBlockList = dynamic(() => import("./board-sortable-blocks").then((module) => module.BoardBlockList));


/**
 * 按 Board 树渲染首页主区：Section 顺序排列，Block 按 type 分发。区块是纯
 * 展示配置（ADR-0010）：渲染失败或引用悬空只降级占位，不影响其它区块。
 */
export function BoardView({
    board,
    client,
    planListSlot,
    topics,
    openingTopicId,
    onOpenTopic,
    onOpenStory,
    editable = false,
    commands,
    savedViews = [],
    collections = [],
    refreshToken = 0,
}: BoardViewProps) {
    const sections = (
        <div className="flex flex-col gap-10">
            {board.sections.map((section, sectionIndex) => {
                const hasVisibleBlock = section.blocks.some((block) => block.visible);
                return (
                    <section
                        key={section.id}
                        aria-label={section.title}
                        className="flex flex-col gap-5"
                        data-section-id={section.id}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                            {editable && commands ? (
                                <SectionEditor
                                    section={section}
                                    index={sectionIndex}
                                    total={board.sections.length}
                                    commands={commands}
                                />
                            ) : (
                                <h2 className="font-display text-xl font-semibold tracking-tight">
                                    {section.title}
                                </h2>
                            )}
                        </div>
                        {!hasVisibleBlock && !editable ? (
                            <BlockPlaceholder text="该分区还没有可见区块。" />
                        ) : (
                            <BlockList
                                board={board}
                                section={section}
                                editable={editable}
                                commands={commands}
                                client={client}
                                planListSlot={planListSlot}
                                savedViews={savedViews}
                                collections={collections}
                                topics={topics}
                                openingTopicId={openingTopicId}
                                onOpenTopic={onOpenTopic}
                                onOpenStory={onOpenStory}
                                refreshToken={refreshToken}
                            />
                        )}
                        {editable && commands ? (
                            <AddBlockForm
                                sectionId={section.id}
                                commands={commands}
                                savedViews={savedViews}
                                collections={collections}
                            />
                        ) : null}
                    </section>
                );
            })}
            {editable && commands ? (
                <AddSectionForm commands={commands} />
            ) : null}
        </div>
    );

    // 拖拽上下文必须罩住所有分区：只包一个分区的话，其它分区的区块既不是拖拽源也不是
    // 落点，跨分区拖拽永远解析不出目标。
    if (editable && commands) {
        return (
            <BoardDndProvider board={board} onMoveBlock={commands.moveBlock}>
                {sections}
            </BoardDndProvider>
        );
    }
    return sections;
}

/**
 * 分区内的区块渲染。编辑模式走 `BoardBlockList`，浏览模式保持原来的纯渲染——
 * 拖拽只在编辑模式存在，浏览视图不多包一层拖动容器。
 */
function BlockList({
    board,
    section,
    editable,
    commands,
    client,
    planListSlot,
    savedViews,
    collections,
    topics,
    openingTopicId,
    onOpenTopic,
    onOpenStory,
    refreshToken,
}: {
    board: BoardDetail;
    section: BoardDetail["sections"][number];
    editable: boolean;
    commands?: BoardCommands;
    client: HttpCosmosClient;
    planListSlot: ReactNode;
    savedViews: readonly SavedView[];
    collections: readonly CollectionSummary[];
    topics: readonly TopicSummary[];
    openingTopicId: string | null;
    onOpenTopic: (topicId: string) => void;
    onOpenStory: (storyId: string) => void;
    refreshToken: number;
}) {
    const renderContent = (block: BoardBlock): ReactNode =>
        block.visible ? (
            <BoardBlockContent
                block={block}
                client={client}
                boardId={board.id}
                planListSlot={planListSlot}
                savedViews={savedViews}
                topics={topics}
                openingTopicId={openingTopicId}
                onOpenTopic={onOpenTopic}
                onOpenStory={onOpenStory}
                refreshToken={refreshToken}
            />
        ) : editable ? (
            // 隐藏只影响浏览视图；编辑模式保留占位，便于恢复。
            <BlockPlaceholder text={`已隐藏：${blockTypeLabel(block.type)}`} />
        ) : null;

    if (editable && commands) {
        return (
            <BoardBlockList
                sectionId={section.id}
                blocks={section.blocks}
                renderBlock={(block, index) => (
                    <>
                        <BlockEditor
                            block={block}
                            index={index}
                            total={section.blocks.length}
                            sections={board.sections}
                            commands={commands}
                            savedViews={savedViews}
                            collections={collections}
                        />
                        {renderContent(block)}
                    </>
                )}
            />
        );
    }
    return (
        <>
            {section.blocks.map((block) => (
                <div
                    key={block.id}
                    data-block-id={block.id}
                    data-block-type={block.type}
                    className={block.visible ? "" : "opacity-60"}
                >
                    {renderContent(block)}
                </div>
            ))}
        </>
    );
}
