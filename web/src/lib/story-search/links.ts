import { categoryToUrlParam, getAreaCategory, type IActionSet } from "@/app/story/area/areaCategory";
import { fetchMasterData } from "@/lib/fetch";
import { storyPlayerHref } from "@/lib/storyPlayer/episodes";
import type { StoryChunk, StorySearchServer } from "./types";

interface IUnitStoryRef {
    seq: number;
    unit: string;
    chapters: {
        assetbundleName: string;
        episodes: { episodeNo: number; scenarioId: string }[];
    }[];
}

export interface StoryLinkLookup {
    unitByScenario: Map<string, { seq: number; assetbundleName: string; isFirstChapter: boolean; episodeNo: number }>;
    actionById: Map<number, IActionSet>;
    actionByScenario: Map<string, IActionSet>;
}

const UNIT_FIELD_TO_SEQ: Record<string, number> = {
    light_sound: 1,
    idol: 2,
    street: 3,
    theme_park: 4,
    school_refusal: 5,
    piapro: 6,
};

const lookupPromises = new Map<StorySearchServer, Promise<StoryLinkLookup>>();

export function loadStoryLinkLookup(server: StorySearchServer): Promise<StoryLinkLookup> {
    const existing = lookupPromises.get(server);
    if (existing) return existing;

    const promise = Promise.all([
        fetchMasterData<IUnitStoryRef[]>("unitStories.json", false, server).catch(() => [] as IUnitStoryRef[]),
        fetchMasterData<IActionSet[]>("actionSets.json", false, server).catch(() => [] as IActionSet[]),
    ]).then(([unitStories, actionSets]) => {
        const unitByScenario = new Map<string, { seq: number; assetbundleName: string; isFirstChapter: boolean; episodeNo: number }>();
        for (const story of unitStories) {
            story.chapters?.forEach((chapter, chapterIdx) => {
                for (const ep of chapter.episodes ?? []) {
                    unitByScenario.set(ep.scenarioId, {
                        seq: story.seq,
                        assetbundleName: chapter.assetbundleName,
                        isFirstChapter: chapterIdx === 0,
                        episodeNo: ep.episodeNo,
                    });
                }
            });
        }

        const actionById = new Map<number, IActionSet>();
        const actionByScenario = new Map<string, IActionSet>();
        for (const action of actionSets) {
            actionById.set(action.id, action);
            if (action.scenarioId) {
                actionByScenario.set(action.scenarioId, action);
            }
        }

        return { unitByScenario, actionById, actionByScenario };
    });

    lookupPromises.set(server, promise);
    promise.catch(() => lookupPromises.delete(server));
    return promise;
}

function parseNumericSuffix(storyId: string, prefix: string): number | null {
    if (!storyId.startsWith(prefix)) return null;
    const raw = storyId.slice(prefix.length);
    const num = Number(raw);
    return Number.isInteger(num) && num > 0 ? num : null;
}

export interface ResolvedStoryLinks {
    storyHref: string | null;
    playerHref: string | null;
}

/**
 * Resolves direct links to `/story/...` and `/story-player` for a search hit.
 */
export function resolveChunkLinks(chunk: StoryChunk, lookup?: StoryLinkLookup | null): ResolvedStoryLinks {
    const server = chunk.server;

    switch (chunk.type) {
        case "event": {
            const eventId = parseNumericSuffix(chunk.story_id, "event_");
            const epNo = Number(chunk.ep);
            if (!eventId || !Number.isInteger(epNo) || epNo <= 0) {
                return { storyHref: "/story/event", playerHref: null };
            }
            return {
                storyHref: `/story/event/${eventId}/${epNo}`,
                playerHref: storyPlayerHref(server, `event:${eventId}/${epNo}`),
            };
        }
        case "unit": {
            const unitMeta = lookup?.unitByScenario.get(chunk.scenario_id);
            const rawUnit = chunk.story_id.startsWith("unit_") ? chunk.story_id.slice("unit_".length) : "";
            const fallbackSeq = /^\d+$/.test(rawUnit) ? Number(rawUnit) : UNIT_FIELD_TO_SEQ[rawUnit];
            const seq = unitMeta?.seq ?? fallbackSeq;
            const storyHref = seq && (unitMeta ? unitMeta.isFirstChapter : true)
                ? `/story/unit/${seq}/${encodeURIComponent(chunk.scenario_id)}`
                : seq
                    ? `/story/unit/${seq}`
                    : "/story/unit";
            const playerHref = unitMeta
                ? storyPlayerHref(server, `unit:${unitMeta.assetbundleName}/${unitMeta.episodeNo}`)
                : null;
            return { storyHref, playerHref };
        }
        case "card": {
            const cardId = parseNumericSuffix(chunk.story_id, "card_");
            if (!cardId) return { storyHref: "/story/card", playerHref: null };
            const isFormer =
                chunk.ep === "former"
                || chunk.ep === "first"
                || chunk.ep === "1"
                || chunk.ep === "Part 1"
                || chunk.ep === "\u524d\u7bc7"
                || chunk.ep === "\uc804\ud3b8";
            const part = isFormer ? "former" : "latter";
            const partIndex = isFormer ? 1 : 2;
            return {
                storyHref: `/story/card/${cardId}#part-episode-${partIndex}`,
                playerHref: storyPlayerHref(server, `card:${cardId}/${part}`),
            };
        }
        case "talk": {
            const actionId = parseNumericSuffix(chunk.story_id, "talk_");
            const action = (actionId ? lookup?.actionById.get(actionId) : undefined)
                ?? lookup?.actionByScenario.get(chunk.scenario_id);
            if (!action) {
                return { storyHref: "/story/area", playerHref: null };
            }
            const category = getAreaCategory(action);
            const storyHref = category !== ""
                ? `/story/area/${encodeURIComponent(categoryToUrlParam(category))}/${encodeURIComponent(chunk.scenario_id)}`
                : "/story/area";
            const playerHref = storyPlayerHref(server, `area:${action.areaId}/${action.id}`);
            return { storyHref, playerHref };
        }
        case "self": {
            const charaId = parseNumericSuffix(chunk.story_id, "self_");
            return {
                storyHref: charaId ? `/story/self/${charaId}` : "/story/self",
                playerHref: null,
            };
        }
        case "special": {
            const spId = parseNumericSuffix(chunk.story_id, "special_");
            const epNo = Number(chunk.ep);
            if (!spId) return { storyHref: "/story/special", playerHref: null };
            return {
                storyHref: spId === 2 ? null : `/story/special/${spId}`,
                playerHref: Number.isInteger(epNo) && epNo > 0 ? storyPlayerHref(server, `special:${spId}/${epNo}`) : null,
            };
        }
        default:
            return { storyHref: null, playerHref: null };
    }
}
