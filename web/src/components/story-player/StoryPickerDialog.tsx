"use client";
import { useEffect, useMemo, useState } from "react";
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

/**
 * A row of the list. It runs the dialog's full width, so its focus ring is drawn inside it
 * (the list's scroll box would cut one drawn outside).
 */
const ROW = "state-layer focus-ring flex w-full items-center gap-4 text-left focus-visible:outline-offset-[-3px]";

/** Card stories, the newest card first and each card's first part before its second. */
function newestCardsFirst(episodes: readonly StoryEpisode[]): StoryEpisode[] {
    const card = (episode: StoryEpisode) => Number(episode.selector.slice("card:".length, episode.selector.indexOf("/")));
    return [...episodes].sort((a, b) => card(b) - card(a) || (a.part === "former" ? -1 : 1));
}

/**
 * Chooses an episode, as a Material 3 dialog: full screen with a top app bar on a compact
 * window, a basic dialog (560 wide) on a larger one. Under its title come the search, the
 * five kinds of story as primary tabs and, for card stories and area talks, how to group
 * them; these never scroll. Below them only the list scrolls: each group (an event, a unit
 * chapter, a character, a special story, an area or an area talk category) is a list item
 * that opens to its episodes, its header staying on top of its open list. Only the episodes
 * the server's story library holds are listed; the current one is marked.
 */
export function StoryPickerDialog({ isOpen, onClose, region, kind, onKindChange, catalog, onRetry, current, onSelect }: StoryPickerDialogProps) {
    const { t } = useI18n();
    const [query, setQuery] = useState("");
    const [views, setViews] = useState<Partial<Record<StoryKind, PickerView>>>({});
    /** Groups the reader opened or closed against their default. */
    const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
    // the list's element as state: the dialog mounts its body a moment after it opens
    const [list, setList] = useState<HTMLDivElement | null>(null);
    const needle = query.trim().toLocaleLowerCase();
    const ready = catalog.status === "ready" ? catalog.catalog : null;
    // a kind that can be listed by event is, until the reader chooses otherwise (for this opening)
    const view: PickerView = ready?.byEvent ? views[kind] ?? "event" : "own";
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

    // Opening the dialog, or the current episode's list, brings that episode to the list's middle.
    // Layout offsets, not the screen's: the dialog opens with a scale, which they do not see.
    useEffect(() => {
        if (!isOpen || !current || !ready || !list) return;
        const row = list.querySelector<HTMLElement>(`[data-selector="${CSS.escape(current)}"]`);
        if (row) list.scrollTo({ top: Math.max(0, row.offsetTop - (list.clientHeight - row.offsetHeight) / 2) });
    }, [isOpen, current, ready, view, list]);

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
            size="md"
            fullscreenOnMobile
            // a basic dialog at most 560 wide; a fixed height, so changing tabs does not resize it
            className="max-w-[560px] sm:h-[min(85vh,56rem)]"
            // the body holds its own parts: the controls above, the list that scrolls
            bodyClassName="flex flex-col overflow-hidden px-0 pt-0 pb-0"
        >
            <div role="search" className="shrink-0 px-4 pb-2 pt-2 sm:px-6 sm:pt-4">
                <TextField
                    variant="filled"
                    icon={mdSearch}
                    value={query}
                    onValueChange={setQuery}
                    clearable
                    clearLabel={t("common.md3.clear")}
                    placeholder={t("page.storyPlayer.searchPlaceholder")}
                    aria-label={t("page.storyPlayer.searchPlaceholder")}
                    // a filled field one tone above the dialog's surface
                    containerClassName="bg-surface-container-highest hover:bg-surface-container-highest"
                />
            </div>
            <Tabs
                items={STORY_KINDS.map(value => ({ value, label: t(STORY_KIND_LABEL_KEYS[value]) }))}
                value={kind}
                onValueChange={onKindChange}
                scrollable
                aria-label={t("page.storyPlayer.kinds")}
                className="shrink-0 px-2 sm:px-4"
            />
            {ready?.byEvent && ownViewLabel && (
                <div className="shrink-0 px-4 pt-3 sm:px-6">
                    <SegmentedButton<PickerView>
                        value={view}
                        onValueChange={next => setViews(previous => ({ ...previous, [kind]: next }))}
                        options={[
                            { value: "own", label: t(ownViewLabel) },
                            { value: "event", label: t("page.storyPlayer.byEvent") },
                        ]}
                        density={-2}
                        aria-label={t("page.storyPlayer.grouping")}
                        className="w-fit"
                    />
                </div>
            )}

            <div
                ref={setList}
                role="tabpanel"
                aria-label={t(STORY_KIND_LABEL_KEYS[kind])}
                // no padding at its top: an open group's header sticks to the very top, with no gap above it to show the list through
                // `relative`: the rows' offsets are taken from it
                className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4"
            >
                {catalog.status === "loading" && <LoadingState label={t("page.storyPlayer.loadingList")} className="min-h-[30vh]" />}
                {catalog.status === "error" && (
                    <ErrorState
                        className="mx-4 sm:mx-6"
                        title={t("page.storyPlayer.listFailed")}
                        message={catalog.message}
                        retryLabel={t("common.action.retry")}
                        onRetry={onRetry}
                    />
                )}
                {ready && groups.length === 0 && (
                    <EmptyState title={needle ? t("page.storyPlayer.noMatches") : t("page.storyPlayer.noEpisodes")} />
                )}
                {groups.length > 0 && (
                    <ul role="list" className="pt-2">
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
                    </ul>
                )}
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
    const box = "aspect-[488/208] h-12 shrink-0 rounded-md3-sm bg-surface-container-highest";
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

/**
 * A group as a list item that opens to its episodes: a picture (an event's banner, a
 * character), its number (events), its name and how many episodes it has. While open, its
 * header stays at the top of the list above its episodes.
 */
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
        <li className="border-b border-outline-variant last:border-b-0">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className={cn(
                    ROW,
                    "min-h-[72px] px-4 py-2 sm:px-6",
                    // over the open list it heads, on the dialog's own surface
                    open && "sticky top-0 z-10 bg-surface-container-high",
                )}
            >
                {group.event && <EventBanner assetbundleName={group.event.assetbundleName} region={region} />}
                {group.character !== undefined && (
                    <img src={getCharacterIconUrl(group.character)} alt="" loading="lazy" className="size-10 shrink-0 rounded-full bg-surface-container-highest" />
                )}
                <span className="min-w-0 flex-1">
                    {group.event && <span className="block font-mono type-label-s text-on-surface-variant">#{group.event.id}</span>}
                    <span className="block truncate type-body-l text-on-surface">{storyGroupTitle(group, t)}</span>
                    <span className="block truncate type-body-m text-on-surface-variant">
                        {t("page.storyPlayer.episodeCount", { count: group.episodes.length })}
                        {holdsCurrent && <span className="text-primary"> · {t("page.storyPlayer.playingHere")}</span>}
                    </span>
                </span>
                <Icon
                    path={mdKeyboardArrowDown}
                    size={24}
                    className={cn("shrink-0 text-on-surface-variant transition-transform duration-200 ease-md3-standard", open && "rotate-180")}
                />
            </button>
            {open && (
                <ul id={panelId} role="list" className="pb-2">
                    {group.episodes.map(episode => (
                        <PickerEpisode
                            key={episode.selector}
                            episode={episode}
                            // a group of one character has its picture already
                            showCharacters={group.character === undefined}
                            current={episode.selector === current}
                            onPick={() => onPick(episode.selector)}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

/**
 * An episode as a two-line list item: where it is in its group over its title, and who is
 * in it where that helps. The current one has the list's selected colours and says so.
 */
function PickerEpisode({ episode, showCharacters, current, onPick }: { episode: StoryEpisode; showCharacters: boolean; current: boolean; onPick: () => void }) {
    const { t } = useI18n();
    const label = storyEpisodeLabel(episode, t);
    const title = episode.title && episode.title !== label ? episode.title : null;
    const characters = showCharacters ? episode.characters ?? [] : [];
    return (
        <li>
            <button
                type="button"
                onClick={onPick}
                data-selector={episode.selector}
                aria-current={current ? "true" : undefined}
                className={cn(
                    ROW,
                    // set in under its group's header
                    "min-h-14 py-2 pl-8 pr-4 sm:pl-10 sm:pr-6",
                    current ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                )}
            >
                <span className="min-w-0 flex-1">
                    {title && <span className={cn("block type-label-m", current ? "text-on-secondary-container" : "text-on-surface-variant")}>{label}</span>}
                    <span className="block truncate type-body-l">{title ?? label}</span>
                </span>
                {characters.length > 0 && (
                    <span className="flex shrink-0 -space-x-1.5">
                        {characters.slice(0, 4).map(character => (
                            <img key={character} src={getCharacterIconUrl(character)} alt="" loading="lazy" className="size-7 rounded-full bg-surface-container-highest ring-2 ring-surface-container-high" />
                        ))}
                    </span>
                )}
                {current && <span className="shrink-0 type-label-m text-on-secondary-container">{t("page.storyPlayer.current")}</span>}
            </button>
        </li>
    );
}
