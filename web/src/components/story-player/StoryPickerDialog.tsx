"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, EmptyState, ErrorState, Icon, LoadingState, SegmentedButton, Tabs, TextField, cn } from "@/components/md3";
import { mdKeyboardArrowDown, mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { replaceAssetSourceRegion, useTheme } from "@/contexts/ThemeContext";
import type { StoryCatalogState } from "@/hooks/useStoryCatalogs";
import { getCharacterIconUrl, getEventLogoUrl, getEventStoryBannerUrl } from "@/lib/assets";
import type { SseWebRegion } from "@/lib/sseWeb/config";
import { STORY_KINDS, type StoryEpisode, type StoryGroup, type StoryKind } from "@/lib/storyPlayer/episodes";
import { STORY_KIND_LABEL_KEYS, storyEpisodeLabel, storyGroupTitle } from "./labels";

interface StoryPickerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    /** The server whose episodes are listed (the banners are its own). */
    region: SseWebRegion;
    /** The kind whose list is shown. */
    kind: StoryKind;
    onKindChange: (kind: StoryKind) => void;
    catalog: StoryCatalogState;
    onRetry: () => void;
    /** The episode playing now, marked in its list. */
    current: string | null;
    onSelect: (selector: string) => void;
}

/** How a kind's list is grouped: its own way, or by event (cards and area talks, as their story pages offer). */
type PickerView = "own" | "event";

/** Kinds whose groups are few and short: their groups are open from the start. */
const OPEN_KINDS: ReadonlySet<StoryKind> = new Set(["unit", "special"]);

/** The own grouping of each kind that can also be listed by event. */
const OWN_VIEW_LABEL_KEYS: Partial<Record<StoryKind, string>> = {
    card: "page.storyPlayer.byCharacter",
    area: "page.storyPlayer.byArea",
};

/** Card stories, the newest card first and each card's first part before its second. */
function newestCardsFirst(episodes: readonly StoryEpisode[]): StoryEpisode[] {
    const card = (episode: StoryEpisode) => Number(episode.selector.slice("card:".length, episode.selector.indexOf("/")));
    return [...episodes].sort((a, b) => card(b) - card(a) || (a.part === "former" ? -1 : 1));
}

/**
 * Chooses an episode: the five kinds of story in tabs, each grouped as the story pages group
 * it (events, unit chapters, characters, special stories, areas; cards and area talks also by
 * event), with a search over the kind shown and the current episode marked. Only the
 * episodes the server's story library holds are listed.
 *
 * The tabs and the search stay put above the list, which scrolls on its own.
 */
export function StoryPickerDialog({ isOpen, onClose, region, kind, onKindChange, catalog, onRetry, current, onSelect }: StoryPickerDialogProps) {
    const { t } = useI18n();
    const [query, setQuery] = useState("");
    const [views, setViews] = useState<Partial<Record<StoryKind, PickerView>>>({});
    /** Groups the reader opened or closed against their default. */
    const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
    const listRef = useRef<HTMLDivElement | null>(null);
    const needle = query.trim().toLocaleLowerCase();
    const ready = catalog.status === "ready" ? catalog.catalog : null;
    const view: PickerView = ready?.byEvent ? views[kind] ?? "own" : "own";
    const source = view === "event" ? ready?.byEvent : ready?.groups;
    const currentGroup = current ? source?.find(group => group.episodes.some(episode => episode.selector === current))?.key ?? null : null;

    const groups = useMemo(() => {
        if (!source) return [];
        const shown: StoryGroup[] = [];
        for (const group of source) {
            const title = storyGroupTitle(group, t);
            const names = [title, ...(group.event ? [`#${group.event.id}`] : [])];
            const episodes = !needle || names.some(name => name.toLocaleLowerCase().includes(needle))
                ? group.episodes
                : group.episodes.filter(episode => [episode.title, storyEpisodeLabel(episode, t), episode.selector]
                    .some(text => text.toLocaleLowerCase().includes(needle)));
            // a character's or an event's newest cards first
            if (episodes.length > 0) shown.push({ ...group, episodes: group.kind === "card" ? newestCardsFirst(episodes) : episodes });
        }
        // the newest events first (the lists by event come in the order they are shown)
        return view === "own" && ready?.kind === "event" ? shown.reverse() : shown;
    }, [source, view, ready, needle, t]);

    const isOpenGroup = (key: string) => {
        const byDefault = needle !== "" || key === currentGroup || (view === "own" && OPEN_KINDS.has(kind));
        return toggled.has(key) ? !byDefault : byDefault;
    };

    // Opening the dialog, or the current episode's list, brings that episode into view.
    useEffect(() => {
        if (!isOpen || !current || !ready) return;
        const frame = requestAnimationFrame(() => {
            listRef.current?.querySelector(`[data-selector="${CSS.escape(current)}"]`)?.scrollIntoView({ block: "center" });
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen, current, ready, view]);

    const toggle = (key: string) => setToggled(previous => {
        const next = new Set(previous);
        if (!next.delete(key)) next.add(key);
        return next;
    });

    const pick = (selector: string) => {
        onSelect(selector);
        onClose();
    };

    const ownViewLabel = OWN_VIEW_LABEL_KEYS[kind];

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.storyPlayer.chooseStory")}
            size="xl"
            fullscreenOnMobile
            // as tall as it may be whichever list is shown, so switching tabs does not resize it
            className="sm:h-[85vh]"
            bodyClassName="flex flex-col overflow-hidden px-0 pb-0"
        >
            <div className="flex shrink-0 flex-col gap-3 px-4 pb-3 sm:px-6">
                <Tabs
                    items={STORY_KINDS.map(value => ({ value, label: t(STORY_KIND_LABEL_KEYS[value]) }))}
                    value={kind}
                    onValueChange={onKindChange}
                    scrollable
                    aria-label={t("page.storyPlayer.kinds")}
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
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
                    {ready?.byEvent && ownViewLabel && (
                        <SegmentedButton<PickerView>
                            value={view}
                            onValueChange={next => setViews(previous => ({ ...previous, [kind]: next }))}
                            options={[
                                { value: "own", label: t(ownViewLabel) },
                                { value: "event", label: t("page.storyPlayer.byEvent") },
                            ]}
                            aria-label={t("page.storyPlayer.grouping")}
                            className="w-full shrink-0 sm:w-64"
                        />
                    )}
                </div>
            </div>

            <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-outline-variant px-4 pb-6 pt-3 sm:px-6">
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
                        region={region}
                        open={isOpenGroup(group.key)}
                        onToggle={() => toggle(group.key)}
                        current={current}
                        onPick={pick}
                    />
                ))}
            </div>
        </Dialog>
    );
}

/**
 * An event's picture: its story's banner, or its logo for an event without one; an empty
 * tile when the asset site has neither.
 */
function EventBanner({ assetbundleName, region }: { assetbundleName: string; region: SseWebRegion }) {
    const { assetSource } = useTheme();
    const source = replaceAssetSourceRegion(assetSource, region);
    const candidates = assetbundleName
        ? [getEventStoryBannerUrl(assetbundleName, source), getEventLogoUrl(assetbundleName, source)]
        : [];
    const [failed, setFailed] = useState(0);
    const box = "aspect-[488/208] w-24 shrink-0 rounded-md3-sm bg-surface-container-highest sm:w-32";
    if (failed >= candidates.length) return <span aria-hidden className={box} />;
    return (
        <img
            src={candidates[failed]}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(previous => previous + 1)}
            className={cn(box, failed === 0 ? "object-cover" : "object-contain p-1")}
        />
    );
}

function PickerGroup({ group, region, open, onToggle, current, onPick }: {
    group: StoryGroup;
    region: SseWebRegion;
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
                className="state-layer focus-ring flex w-full items-center gap-3 p-3 text-left sm:px-4"
            >
                {group.event && <EventBanner assetbundleName={group.event.assetbundleName} region={region} />}
                {group.character !== undefined && (
                    <img src={getCharacterIconUrl(group.character)} alt="" loading="lazy" className="size-10 shrink-0 rounded-full bg-surface-container-highest" />
                )}
                <span className="min-w-0 flex-1">
                    {group.event && (
                        <span className="mb-1 inline-flex rounded-md3-xs bg-surface-container-highest px-1.5 py-px font-mono type-label-s text-on-surface-variant">
                            #{group.event.id}
                        </span>
                    )}
                    <span className="line-clamp-2 type-title-s text-on-surface">{storyGroupTitle(group, t)}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 type-label-m text-on-surface-variant">
                        <span>{t("page.storyPlayer.episodeCount", { count: group.episodes.length })}</span>
                        {holdsCurrent && <span className="text-primary">{t("page.storyPlayer.playingHere")}</span>}
                    </span>
                </span>
                <Icon path={mdKeyboardArrowDown} size={24} className={cn("shrink-0 text-on-surface-variant transition-transform duration-200 ease-md3-standard", open && "rotate-180")} />
            </button>
            {open && (
                <ul id={panelId} className="grid gap-2 px-3 pb-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
                    {group.episodes.map(episode => (
                        <li key={episode.selector}>
                            <PickerEpisode
                                episode={episode}
                                // a group of one character has its picture already
                                showCharacters={group.character === undefined}
                                current={episode.selector === current}
                                onPick={() => onPick(episode.selector)}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function PickerEpisode({ episode, showCharacters, current, onPick }: { episode: StoryEpisode; showCharacters: boolean; current: boolean; onPick: () => void }) {
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
            {showCharacters && episode.characters && episode.characters.length > 0 && (
                <span className="flex flex-wrap gap-1">
                    {episode.characters.map(character => (
                        <img key={character} src={getCharacterIconUrl(character)} alt="" loading="lazy" className="size-7 rounded-full bg-surface-container-highest" />
                    ))}
                </span>
            )}
        </button>
    );
}
