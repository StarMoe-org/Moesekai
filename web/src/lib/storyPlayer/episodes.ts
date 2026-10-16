/**
 * The episodes the story player page lists: what each server's masterdata names, kept to
 * those its story library holds (`ripper.lock.json`). An episode is named by its selector in
 * the library, as the story pages name it to the Live2D player:
 *
 * - event `event:<event>/<episode>`
 * - main story `unit:<chapter's assetbundleName>/<episode>`
 * - card `card:<card>/former` (first part) or `card:<card>/latter` (second part)
 * - special `special:<id>/<episode>`
 * - area talk `area:<area>/<actionSet>`
 *
 * Self introductions are not in the library and are not listed.
 */
import { getAreaCategory, categoryToUrlParam, type IActionSet } from "@/app/story/area/areaCategory";
import { selectCardStoryParts, type ICardStoryEpisode } from "@/app/story/card/cardStoryParts";
import { fetchMasterData } from "@/lib/fetch";
import { sseWebSources, type SseWebRegion } from "@/lib/sseWeb/config";
import type { AssetParams, StoryAssetType } from "@/lib/storyAsset";

export const STORY_KINDS = ["event", "unit", "card", "special", "area"] as const;

export type StoryKind = (typeof STORY_KINDS)[number];

/** The page's address for an episode of a server's library. */
export function storyPlayerHref(region: string, selector?: string | null): string {
    // the selector's `:` and `/` may stand in a query as they are: the address stays readable
    const query = [`server=${encodeURIComponent(region)}`, ...(selector ? [`ep=${encodeURIComponent(selector).replace(/%3A/g, ":").replace(/%2F/g, "/")}`] : [])];
    return `/story-player?${query.join("&")}`;
}

/** The kind of a selector, or null when it is not one of the five. */
export function selectorKind(selector: string): StoryKind | null {
    const kind = selector.slice(0, selector.indexOf(":"));
    return (STORY_KINDS as readonly string[]).includes(kind) ? kind as StoryKind : null;
}

/**
 * A selector as the page takes it from its address: one of the five forms, with the card's
 * older `first` / `second` read as `former` / `latter`. Null for anything else.
 */
export function parseSelector(raw: string | null | undefined): string | null {
    const value = raw?.trim();
    if (!value || value.length > 200) return null;
    const match = /^(event|unit|card|special|area):([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value);
    if (!match) return null;
    const [, kind, group, episode] = match;
    if (kind === "card") {
        const part = { former: "former", first: "former", latter: "latter", second: "latter" }[episode];
        return /^\d+$/.test(group) && part ? `card:${group}/${part}` : null;
    }
    if (kind !== "unit" && !/^\d+$/.test(group)) return null;
    return /^\d+$/.test(episode) ? value : null;
}

/** How the script of an episode is read from the asset mirror (see `fetchStoryAssetFromMirror`). */
export interface StoryScriptSource {
    type: StoryAssetType;
    params: AssetParams;
    /** Where its voices are, for `processScenarioForDisplay`. */
    voices: "scenario" | "card" | "talk" | "special";
}

export interface StoryEpisode {
    selector: string;
    kind: StoryKind;
    /** The key of its group in the catalog. */
    group: string;
    /** The episode's number in its group (an event's or a chapter's episode, the special story's part). */
    episodeNo?: number;
    /** How masterdata numbers it, where that is not `episodeNo` (a chapter numbers each of its parts from 1). */
    numberLabel?: string;
    /** A card story's part. */
    part?: "former" | "latter";
    /** An area talk's actionSet. */
    actionSet?: number;
    /** The masterdata's title, in the server's language (none for an area talk). */
    title: string;
    /** Who is in it (game character ids): an area talk's characters, a card's character. */
    characters?: number[];
    /** This episode on the story pages, or null where they have no page for it. */
    readerHref: string | null;
    script: StoryScriptSource;
}

export interface StoryGroup {
    key: string;
    kind: StoryKind;
    /** The group's id in its kind: the event, unit, character, special story or area. */
    id: number | string;
    /** Its name from masterdata; null when masterdata names none. */
    title: string | null;
    /** A game character to show beside the group (a card group's). */
    character?: number;
    /** The event the group is (its number and banner are shown with it). */
    event?: { id: number; assetbundleName: string };
    /**
     * What a group masterdata gives no name of its own is (the categories of the area talk
     * pages; the cards of no event): its name comes from the UI's words.
     */
    category?: "grade1" | "grade2" | "theater" | "limited" | "aprilfool" | "noEvent" | "other";
    episodes: StoryEpisode[];
}

/** One kind's groups in the story pages' order (oldest first). */
export interface StoryCatalog {
    kind: StoryKind;
    groups: StoryGroup[];
    /**
     * The same episodes by event, for the kinds the story pages also list that way (card
     * stories by the event a card came with, area talks by the area pages' categories), in
     * the order they are shown: newest event first.
     */
    byEvent?: StoryGroup[];
    /** Every episode by its selector. */
    episodes: Map<string, StoryEpisode>;
    /** Every episode in order, for the previous and next ones. */
    order: StoryEpisode[];
}

/** The game server's masterdata (the cached copy when it is the server the site is set to). */
function master<T>(region: SseWebRegion, path: string): Promise<T> {
    return fetchMasterData<T>(path, false, region);
}

interface RipperLock {
    episodes?: unknown;
}

const libraries = new Map<SseWebRegion, Promise<Set<string>>>();

/**
 * The selectors the server's story library holds (its `ripper.lock.json`), cards written
 * `former` / `latter`. Read once per page load.
 */
export function fetchLibraryEpisodes(region: SseWebRegion): Promise<Set<string>> {
    const known = libraries.get(region);
    if (known) return known;
    const sources = sseWebSources(region);
    if (!sources) return Promise.resolve(new Set());
    const url = `${sources.library}ripper.lock.json`;
    const loading = fetch(sources.proxy ? url.replace(/^https:\/\//, sources.proxy) : url)
        .then(response => {
            if (!response.ok) throw new Error(`ripper.lock.json: HTTP ${response.status}`);
            return response.json() as Promise<RipperLock>;
        })
        .then(lock => {
            if (!Array.isArray(lock.episodes)) throw new Error("ripper.lock.json: no episodes");
            return new Set(lock.episodes.flatMap(episode => {
                const selector = parseSelector(typeof episode === "string" ? episode : null);
                return selector ? [selector] : [];
            }));
        });
    libraries.set(region, loading);
    // a failure is not kept: the next call tries again
    loading.catch(() => libraries.delete(region));
    return loading;
}

interface IEventInfo { id: number; name: string; assetbundleName: string }
interface IEventCard { cardId: number; eventId: number }
interface IEventStory {
    eventId: number;
    assetbundleName: string;
    eventStoryEpisodes: { episodeNo: number; title: string; scenarioId: string }[];
}
interface IUnitStory {
    seq: number;
    unit: string;
    chapters: { assetbundleName: string; title?: string; episodes: { episodeNo: number; episodeNoLabel?: string; title: string; scenarioId: string }[] }[];
}
interface IUnitProfile { seq: number; unit: string; unitName: string }
interface ICard { id: number; characterId: number; prefix: string; assetbundleName: string }
interface IGameCharacter { id: number; firstName?: string; givenName: string }
interface ISpecialStory {
    id: number;
    seq: number;
    title?: string;
    episodes: { episodeNo: number; title: string; assetbundleName: string; scenarioId: string }[];
}
interface IArea { id: number; name: string; subName?: string }
interface ICharacter2D { id: number; characterType: string; characterId: number }

type Builder = (region: SseWebRegion, library: Set<string>) => Promise<{ groups: StoryGroup[]; byEvent?: StoryGroup[] }>;

/** A group for an event, named and pictured as the event is. */
function eventGroup(key: string, kind: StoryKind, event: IEventInfo | undefined, id: number): StoryGroup {
    return { key, kind, id, title: event?.name ?? null, event: { id, assetbundleName: event?.assetbundleName ?? "" }, episodes: [] };
}

const buildEvents: Builder = async (region, library) => {
    const [events, stories] = await Promise.all([
        master<IEventInfo[]>(region, "events.json"),
        master<IEventStory[]>(region, "eventStories.json"),
    ]);
    const names = new Map(events.map(event => [event.id, event.name]));
    return { groups: [...stories].sort((a, b) => a.eventId - b.eventId).map(story => ({
        key: `event:${story.eventId}`,
        kind: "event" as const,
        id: story.eventId,
        title: names.get(story.eventId) ?? null,
        event: { id: story.eventId, assetbundleName: story.assetbundleName },
        episodes: [...story.eventStoryEpisodes].sort((a, b) => a.episodeNo - b.episodeNo).map(episode => ({
            selector: `event:${story.eventId}/${episode.episodeNo}`,
            kind: "event" as const,
            group: `event:${story.eventId}`,
            episodeNo: episode.episodeNo,
            title: episode.title,
            readerHref: `/story/event/${story.eventId}/${episode.episodeNo}`,
            script: { type: "event" as const, params: { assetbundleName: story.assetbundleName, scenarioId: episode.scenarioId }, voices: "scenario" as const },
        })).filter(episode => library.has(episode.selector)),
    })) };
};

const buildUnits: Builder = async (region, library) => {
    const [stories, profiles] = await Promise.all([
        master<IUnitStory[]>(region, "unitStories.json"),
        master<IUnitProfile[]>(region, "unitProfiles.json"),
    ]);
    return { groups: [...stories].sort((a, b) => a.seq - b.seq).flatMap(story => story.chapters.map((chapter, index) => ({
        key: `unit:${chapter.assetbundleName}`,
        kind: "unit" as const,
        id: chapter.assetbundleName,
        title: chapter.title ?? profiles.find(profile => profile.seq === story.seq)?.unitName ?? null,
        episodes: [...chapter.episodes].sort((a, b) => a.episodeNo - b.episodeNo).map(episode => ({
            selector: `unit:${chapter.assetbundleName}/${episode.episodeNo}`,
            kind: "unit" as const,
            group: `unit:${chapter.assetbundleName}`,
            episodeNo: episode.episodeNo,
            numberLabel: episode.episodeNoLabel || undefined,
            title: episode.title,
            // the main story's pages read a unit's first chapter
            readerHref: index === 0 ? `/story/unit/${story.seq}/${encodeURIComponent(episode.scenarioId)}` : null,
            script: { type: "unit" as const, params: { assetbundleName: chapter.assetbundleName, scenarioId: episode.scenarioId }, voices: "scenario" as const },
        })).filter(episode => library.has(episode.selector)),
    }))) };
};

const buildCards: Builder = async (region, library) => {
    const [cards, episodes, characters, events, eventCards] = await Promise.all([
        master<ICard[]>(region, "cards.json"),
        master<ICardStoryEpisode[]>(region, "cardEpisodes.json"),
        master<IGameCharacter[]>(region, "gameCharacters.json"),
        master<IEventInfo[]>(region, "events.json").catch(() => [] as IEventInfo[]),
        master<IEventCard[]>(region, "eventCards.json").catch(() => [] as IEventCard[]),
    ]);
    // a card that came with two events (a few did) is listed with the first
    const eventOfCard = new Map<number, number>();
    for (const { cardId, eventId } of eventCards) {
        if (!eventOfCard.has(cardId) || eventId < eventOfCard.get(cardId)!) eventOfCard.set(cardId, eventId);
    }
    const eventById = new Map(events.map(event => [event.id, event]));
    const byEvent = new Map<number, StoryGroup>();
    const noEvent: StoryGroup = { key: "card-event:none", kind: "card", id: "none", title: null, category: "noEvent", episodes: [] };
    const byCard = new Map<number, ICardStoryEpisode[]>();
    for (const episode of episodes) byCard.set(episode.cardId, [...(byCard.get(episode.cardId) ?? []), episode]);
    const groups = new Map<number, StoryGroup>();
    const separator = region === "en" ? " " : "";
    for (const character of [...characters].sort((a, b) => a.id - b.id)) {
        groups.set(character.id, {
            key: `card:${character.id}`,
            kind: "card",
            id: character.id,
            title: [character.firstName, character.givenName].filter(Boolean).join(separator) || null,
            character: character.id,
            episodes: [],
        });
    }
    for (const card of [...cards].sort((a, b) => a.id - b.id)) {
        const parts = selectCardStoryParts(byCard.get(card.id) ?? []);
        const group = groups.get(card.characterId);
        if (!parts || !group) continue;
        const eventId = eventOfCard.get(card.id);
        let eventGroupOfCard = noEvent;
        if (eventId !== undefined) {
            eventGroupOfCard = byEvent.get(eventId) ?? eventGroup(`card-event:${eventId}`, "card", eventById.get(eventId), eventId);
            byEvent.set(eventId, eventGroupOfCard);
        }
        parts.forEach((episode, index) => {
            const part = index === 0 ? "former" : "latter";
            const selector = `card:${card.id}/${part}`;
            if (!library.has(selector)) return;
            const entry: StoryEpisode = {
                selector,
                kind: "card",
                group: group.key,
                part,
                title: card.prefix,
                characters: [card.characterId],
                readerHref: `/story/card/${card.id}#part-episode-${index + 1}`,
                script: { type: "card", params: { assetbundleName: card.assetbundleName, scenarioId: episode.scenarioId }, voices: "card" },
            };
            group.episodes.push(entry);
            eventGroupOfCard.episodes.push(entry);
        });
    }
    return {
        groups: [...groups.values()],
        byEvent: [...[...byEvent.values()].sort((a, b) => (b.event?.id ?? 0) - (a.event?.id ?? 0)), noEvent],
    };
};

const buildSpecials: Builder = async (region, library) => {
    const stories = await master<ISpecialStory[]>(region, "specialStories.json");
    return { groups: [...stories].sort((a, b) => a.seq - b.seq || a.id - b.id).map(story => ({
        key: `special:${story.id}`,
        kind: "special" as const,
        id: story.id,
        title: story.title ?? story.episodes[0]?.title ?? null,
        episodes: [...story.episodes].sort((a, b) => a.episodeNo - b.episodeNo).map(episode => ({
            selector: `special:${story.id}/${episode.episodeNo}`,
            kind: "special" as const,
            group: `special:${story.id}`,
            episodeNo: episode.episodeNo,
            title: episode.title,
            // the special story pages leave out the opening (2)
            readerHref: story.id === 2 ? null : `/story/special/${story.id}`,
            script: { type: "special" as const, params: { assetbundleName: episode.assetbundleName, scenarioId: episode.scenarioId }, voices: "special" as const },
        })).filter(episode => library.has(episode.selector)),
    })) };
};

const buildAreas: Builder = async (region, library) => {
    const [actionSets, areas, character2ds, events] = await Promise.all([
        master<IActionSet[]>(region, "actionSets.json"),
        master<IArea[]>(region, "areas.json"),
        master<ICharacter2D[]>(region, "character2ds.json").catch(() => [] as ICharacter2D[]),
        master<IEventInfo[]>(region, "events.json").catch(() => [] as IEventInfo[]),
    ]);
    const eventById = new Map(events.map(event => [event.id, event]));
    const areaById = new Map(areas.map(area => [area.id, area]));
    // the area talk pages' categories (`getAreaCategory`), each a group
    const categories = new Map<string, StoryGroup>();
    const categoryGroup = (category: ReturnType<typeof getAreaCategory>): StoryGroup => {
        const key = `area-event:${category === "" ? "other" : category}`;
        const known = categories.get(key);
        if (known) return known;
        let group: StoryGroup;
        if (typeof category === "number") group = eventGroup(key, "area", eventById.get(category), category);
        else if (category === "grade1" || category === "grade2" || category === "theater") group = { key, kind: "area", id: category, title: null, category, episodes: [] };
        else if (category.startsWith("limited_")) {
            const areaId = Number(category.slice("limited_".length));
            const area = areaById.get(areaId);
            group = { key, kind: "area", id: areaId, title: area ? (area.subName ? `${area.name} - ${area.subName}` : area.name) : null, category: "limited", episodes: [] };
        } else if (category.startsWith("aprilfool")) group = { key, kind: "area", id: category.slice("aprilfool".length), title: null, category: "aprilfool", episodes: [] };
        else group = { key, kind: "area", id: "other", title: null, category: "other", episodes: [] };
        categories.set(key, group);
        return group;
    };
    const characterOf = new Map(character2ds.filter(c => c.characterType === "game_character").map(c => [c.id, c.characterId]));
    const groups = new Map<number, StoryGroup>(
        [...areas].sort((a, b) => a.id - b.id).map(area => [area.id, {
            key: `area:${area.id}`,
            kind: "area",
            id: area.id,
            title: area.subName ? `${area.name} - ${area.subName}` : area.name,
            episodes: [],
        }]),
    );
    for (const action of [...actionSets].sort((a, b) => a.id - b.id)) {
        const selector = `area:${action.areaId}/${action.id}`;
        if (!action.scenarioId || !library.has(selector)) continue;
        let group = groups.get(action.areaId);
        if (!group) {
            group = { key: `area:${action.areaId}`, kind: "area", id: action.areaId, title: null, episodes: [] };
            groups.set(action.areaId, group);
        }
        const category = getAreaCategory(action);
        const entry: StoryEpisode = {
            selector,
            kind: "area",
            group: group.key,
            actionSet: action.id,
            title: "",
            characters: [...new Set((action.characterIds ?? []).flatMap(id => characterOf.get(id) ?? []))],
            readerHref: category === "" ? null : `/story/area/${encodeURIComponent(categoryToUrlParam(category))}/${encodeURIComponent(action.scenarioId)}`,
            script: { type: "talk", params: { scenarioId: action.scenarioId, group: Math.floor(action.id / 100) }, voices: "talk" },
        };
        group.episodes.push(entry);
        categoryGroup(category).episodes.push(entry);
    }
    // as the area talk pages order them: daily and theater, the events newest first, the
    // limited areas, April Fools', then what has no category
    const ranks: Partial<Record<NonNullable<StoryGroup["category"]>, number>> = { grade1: 0, grade2: 1, theater: 2, limited: 4, aprilfool: 5, other: 6 };
    const rank = (group: StoryGroup) => (group.event ? 3 : ranks[group.category ?? "other"] ?? 6);
    const byEvent = [...categories.values()].sort((a, b) => rank(a) - rank(b)
        || (b.event?.id ?? 0) - (a.event?.id ?? 0)
        || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    return { groups: [...groups.values()], byEvent };
};

const BUILDERS: Record<StoryKind, Builder> = {
    event: buildEvents,
    unit: buildUnits,
    card: buildCards,
    special: buildSpecials,
    area: buildAreas,
};

const catalogs = new Map<string, Promise<StoryCatalog>>();

/**
 * The episodes of one kind that the server's library holds, grouped as the story pages group
 * them. Kept for the page's life; a failed load is tried again on the next call.
 */
export function fetchStoryCatalog(region: SseWebRegion, kind: StoryKind): Promise<StoryCatalog> {
    const key = `${region}:${kind}`;
    const known = catalogs.get(key);
    if (known) return known;
    const loading = fetchLibraryEpisodes(region)
        .then(library => BUILDERS[kind](region, library))
        .then(built => {
            const groups = built.groups.filter(group => group.episodes.length > 0);
            const byEvent = built.byEvent?.filter(group => group.episodes.length > 0);
            const order = groups.flatMap(group => group.episodes);
            return { kind, groups, ...(byEvent ? { byEvent } : {}), order, episodes: new Map(order.map(episode => [episode.selector, episode])) };
        });
    catalogs.set(key, loading);
    loading.catch(() => catalogs.delete(key));
    return loading;
}
