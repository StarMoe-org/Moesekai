"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, EmptyState, ErrorState, Icon, LoadingState, Tabs, TextField, cn } from "@/components/md3";
import { mdKeyboardArrowDown, mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { StoryCatalogState } from "@/hooks/useStoryCatalogs";
import { getCharacterIconUrl } from "@/lib/assets";
import { STORY_KINDS, type StoryEpisode, type StoryGroup, type StoryKind } from "@/lib/storyPlayer/episodes";
import { STORY_KIND_LABEL_KEYS, storyEpisodeLabel, storyGroupTitle } from "./labels";

interface StoryPickerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    /** The kind whose list is shown. */
    kind: StoryKind;
    onKindChange: (kind: StoryKind) => void;
    catalog: StoryCatalogState;
    onRetry: () => void;
    /** The episode playing now, marked in its list. */
    current: string | null;
    onSelect: (selector: string) => void;
}

/** Card stories, the newest card first and each card's first part before its second. */
function newestCardsFirst(episodes: readonly StoryEpisode[]): StoryEpisode[] {
    const card = (episode: StoryEpisode) => Number(episode.selector.slice("card:".length, episode.selector.indexOf("/")));
    return [...episodes].sort((a, b) => card(b) - card(a) || (a.part === "former" ? -1 : 1));
}

/** Kinds whose groups are few and short: their groups are open from the start. */
const OPEN_KINDS: ReadonlySet<StoryKind> = new Set(["unit", "special"]);

/**
 * Chooses an episode: the five kinds of story in tabs, each grouped as the story pages group
 * it (events, unit chapters, characters, special stories, areas), with a search over the
 * kind shown and the current episode marked. Only the episodes the server's story library
 * holds are listed.
 */
export function StoryPickerDialog({ isOpen, onClose, kind, onKindChange, catalog, onRetry, current, onSelect }: StoryPickerDialogProps) {
    const { t } = useI18n();
    const [query, setQuery] = useState("");
    /** Groups the reader opened or closed against their default. */
    const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
    const listRef = useRef<HTMLDivElement | null>(null);
    const needle = query.trim().toLocaleLowerCase();
    const ready = catalog.status === "ready" ? catalog.catalog : null;
    const currentGroup = ready && current ? ready.episodes.get(current)?.group ?? null : null;

    const groups = useMemo(() => {
        if (!ready) return [];
        const shown: StoryGroup[] = [];
        for (const group of ready.groups) {
            const title = storyGroupTitle(group, t);
            const episodes = !needle || title.toLocaleLowerCase().includes(needle)
                ? group.episodes
                : group.episodes.filter(episode => [episode.title, storyEpisodeLabel(episode, t), episode.selector]
                    .some(text => text.toLocaleLowerCase().includes(needle)));
            // a character's newest cards first, each with its first part first
            if (episodes.length > 0) shown.push({ ...group, episodes: group.kind === "card" ? newestCardsFirst(episodes) : episodes });
        }
        // the newest events first
        return ready.kind === "event" ? shown.reverse() : shown;
    }, [ready, needle, t]);

    const isOpenGroup = (key: string) => {
        const byDefault = needle !== "" || key === currentGroup || OPEN_KINDS.has(kind);
        return toggled.has(key) ? !byDefault : byDefault;
    };

    // Opening the dialog, or the current episode's list, brings that episode into view.
    useEffect(() => {
        if (!isOpen || !current || !ready) return;
        const frame = requestAnimationFrame(() => {
            listRef.current?.querySelector(`[data-selector="${CSS.escape(current)}"]`)?.scrollIntoView({ block: "center" });
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen, current, ready]);

    const toggle = (key: string) => setToggled(previous => {
        const next = new Set(previous);
        if (!next.delete(key)) next.add(key);
        return next;
    });

    const pick = (selector: string) => {
        onSelect(selector);
        onClose();
    };

    return (
        <Dialog isOpen={isOpen} onClose={onClose} title={t("page.storyPlayer.chooseStory")} size="xl" fullscreenOnMobile>
            <div className="flex flex-col gap-4">
                {/* The kinds and the search stay at the top while the list scrolls under them. */}
                <div className="sticky top-0 z-10 -mx-6 -mt-4 flex flex-col gap-4 bg-surface-container-high px-6 pb-2 pt-4">
                <Tabs
                    items={STORY_KINDS.map(value => ({ value, label: t(STORY_KIND_LABEL_KEYS[value]) }))}
                    value={kind}
                    onValueChange={onKindChange}
                    scrollable
                    aria-label={t("page.storyPlayer.kinds")}
                />
                <TextField
                    icon={mdSearch}
                    value={query}
                    onValueChange={setQuery}
                    clearable
                    clearLabel={t("common.md3.clear")}
                    placeholder={t("page.storyPlayer.searchPlaceholder")}
                    aria-label={t("page.storyPlayer.searchPlaceholder")}
                />
                </div>

                <div ref={listRef} className="flex flex-col gap-3">
                    {catalog.status === "loading" && <LoadingState label={t("page.storyPlayer.loadingList")} className="min-h-[30vh]" />}
                    {catalog.status === "error" && (
                        <ErrorState
                            title={t("page.storyPlayer.listFailed")}
                            message={catalog.message}
                            retryLabel={t("common.action.retry")}
                            onRetry={onRetry}
                        />
                    )}
                    {ready && groups.length === 0 && (
                        <EmptyState title={needle ? t("page.storyPlayer.noMatches") : t("page.storyPlayer.noEpisodes")} />
                    )}
                    {groups.map(group => (
                        <PickerGroup
                            key={group.key}
                            group={group}
                            open={isOpenGroup(group.key)}
                            onToggle={() => toggle(group.key)}
                            current={current}
                            onPick={pick}
                        />
                    ))}
                </div>
            </div>
        </Dialog>
    );
}

function PickerGroup({ group, open, onToggle, current, onPick }: {
    group: StoryGroup;
    open: boolean;
    onToggle: () => void;
    current: string | null;
    onPick: (selector: string) => void;
}) {
    const { t } = useI18n();
    const holdsCurrent = current !== null && group.episodes.some(episode => episode.selector === current);
    const panelId = `story-picker-${group.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
    return (
        <section className="overflow-hidden rounded-md3-lg bg-surface-container-low">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className="state-layer focus-ring flex w-full items-center gap-3 px-4 py-3 text-left"
            >
                {group.character !== undefined && (
                    <img src={getCharacterIconUrl(group.character)} alt="" loading="lazy" className="size-8 shrink-0 rounded-full bg-surface-container-highest" />
                )}
                <span className="min-w-0 flex-1">
                    <span className="block truncate type-title-s text-on-surface">{storyGroupTitle(group, t)}</span>
                    <span className="block type-label-m text-on-surface-variant">
                        {t("page.storyPlayer.episodeCount", { count: group.episodes.length })}
                        {holdsCurrent && <span className="ml-2 text-primary">{t("page.storyPlayer.playingHere")}</span>}
                    </span>
                </span>
                <Icon path={mdKeyboardArrowDown} size={24} className={cn("shrink-0 text-on-surface-variant transition-transform duration-200 ease-md3-standard", open && "rotate-180")} />
            </button>
            {open && (
                <ul id={panelId} className="grid gap-2 px-3 pb-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
                    {group.episodes.map(episode => (
                        <li key={episode.selector}>
                            <PickerEpisode episode={episode} current={episode.selector === current} onPick={() => onPick(episode.selector)} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function PickerEpisode({ episode, current, onPick }: { episode: StoryEpisode; current: boolean; onPick: () => void }) {
    const { t } = useI18n();
    const label = storyEpisodeLabel(episode, t);
    return (
        <button
            type="button"
            onClick={onPick}
            data-selector={episode.selector}
            aria-current={current ? "true" : undefined}
            className={cn(
                "state-layer focus-ring flex h-full w-full min-w-0 flex-col gap-1 rounded-md3-md px-3 py-2 text-left",
                current ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-on-surface",
            )}
        >
            <span className={cn("flex min-w-0 items-center gap-2 type-label-m", current ? "text-on-primary-container" : "text-primary")}>
                <span className="truncate">{label}</span>
                {current && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-px type-label-s text-on-primary">{t("page.storyPlayer.current")}</span>
                )}
            </span>
            {episode.title && episode.title !== label && <span className="line-clamp-2 type-body-m">{episode.title}</span>}
            {episode.characters && episode.characters.length > 0 && (
                <span className="flex flex-wrap gap-1">
                    {episode.characters.map(character => (
                        <img key={character} src={getCharacterIconUrl(character)} alt="" loading="lazy" className="size-7 rounded-full bg-surface-container-highest" />
                    ))}
                </span>
            )}
        </button>
    );
}
