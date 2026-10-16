"use client";
import { useEffect, useRef } from "react";
import { Banner, ErrorState, IconButton, LoadingState, Surface, cn } from "@/components/md3";
import { mdMyLocation } from "@/components/md3/icons";
import { StorySnippet } from "@/components/story/StorySnippet";
import { useI18n } from "@/contexts/I18nContext";
import type { IProcessedScenarioData } from "@/types/story";

export type StoryScriptState =
    | { status: "none" }
    | { status: "loading" }
    | { status: "ready"; data: IProcessedScenarioData }
    | { status: "missing"; paths: string[] }
    | { status: "error"; message: string };

interface StoryScriptPanelProps {
    script: StoryScriptState;
    /** The row of the node playing, or -1. */
    activeRow: number;
    /** Rows that take playback to a node, and the node each takes it to. */
    nodeOfRow: ReadonlyMap<number, number>;
    onSeek: (node: number) => void;
    /** The list follows the row playing. */
    follow: boolean;
    onFollowChange: (follow: boolean) => void;
    className?: string;
}

/**
 * The episode's script beside the stage, its rows as the story pages show them: the row
 * playing is marked and kept in view (inside the panel, which scrolls on its own), and a
 * row that playback has a node for takes it there.
 */
export function StoryScriptPanel({ script, activeRow, nodeOfRow, onSeek, follow, onFollowChange, className }: StoryScriptPanelProps) {
    const { t } = useI18n();
    const listRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const list = listRef.current;
        if (!follow || activeRow < 0 || !list) return;
        const row = list.querySelector<HTMLElement>(`[data-row="${activeRow}"]`);
        if (!row) return;
        const top = row.offsetTop;
        const bottom = top + row.offsetHeight;
        if (top < list.scrollTop + 12 || bottom > list.scrollTop + list.clientHeight - 12) {
            list.scrollTo({ top: Math.max(0, top - (list.clientHeight - row.offsetHeight) / 2), behavior: "smooth" });
        }
    }, [activeRow, follow]);

    return (
        <Surface tone="default" radius="xl" className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
            <div className="flex h-14 shrink-0 items-center gap-2 pl-5 pr-2">
                <h2 className="min-w-0 flex-1 truncate type-title-m text-on-surface">{t("page.storyPlayer.script")}</h2>
                <IconButton
                    icon={mdMyLocation}
                    label={t("page.story.reader.autoScroll")}
                    selected={follow}
                    onClick={() => onFollowChange(!follow)}
                />
            </div>
            <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-4">
                {script.status === "none" && (
                    <p className="px-2 py-8 text-center type-body-m text-on-surface-variant">{t("page.storyPlayer.scriptEmpty")}</p>
                )}
                {script.status === "loading" && <LoadingState label={t("page.story.reader.loading")} className="min-h-48" />}
                {script.status === "missing" && (
                    <Banner tone="warning" title={t("page.story.reader.assetMissingTitle")}>
                        <p>{t("page.storyPlayer.scriptMissing")}</p>
                    </Banner>
                )}
                {script.status === "error" && <ErrorState title={t("common.state.loadingFailed")} message={script.message} />}
                {script.status === "ready" && (
                    <div className="space-y-2">
                        {script.data.actions.map((action, index) => {
                            const node = nodeOfRow.get(index);
                            return (
                                <div
                                    key={index}
                                    data-row={index}
                                    className={node !== undefined ? "cursor-pointer" : undefined}
                                    onClick={node !== undefined ? (event) => {
                                        // the row's own controls (its voice button) keep their meaning
                                        if ((event.target as HTMLElement).closest("button, a, audio")) return;
                                        onSeek(node);
                                    } : undefined}
                                >
                                    <StorySnippet action={action} index={index} activeIndex={activeRow} playbackProgress={0} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Surface>
    );
}
