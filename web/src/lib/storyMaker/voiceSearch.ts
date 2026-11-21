/**
 * Resolves Story Search chunks (`StoryChunk`) into playable per-line `StoryVoiceRef` entries
 * across all 6 scenario types (`event`, `unit`, `card`, `talk`, `self`, `special`), including
 * `partvoice` character-prefix mapping and bounded in-memory scenario JSON caching.
 */
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getAssetBaseUrl, getAssetLine, type AssetLine } from "@/lib/assets";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { parseDialogueLines } from "@/lib/story-search/dialogue";
import type { StoryChunk, StorySearchServer } from "@/lib/story-search/types";
import type { ICharacter2D, IScenarioData, ITalkData } from "@/types/story";
import type { StoryRegion, StoryVoiceKind, StoryVoiceRef } from "@/types/storyMaker";
import { STORY_ASSET_PATTERN } from "./limits";

export interface StorySearchVoiceLine {
    /** 0-based index within the chunk's dialogue lines. */
    lineIndex: number;
    speaker: string;
    text: string;
    /** Primary playable voice reference for this line, or null when unvoiced. */
    voiceRef: StoryVoiceRef | null;
    /** Extra voices when multiple characters speak together on the same line. */
    extraVoices: StoryVoiceRef[];
}

interface EventStoryMasterEntry {
    eventId: number;
    assetbundleName: string;
    eventStoryEpisodes?: Array<{ episodeNo?: number; scenarioId?: string }>;
}

interface UnitStoryMasterEntry {
    chapters?: Array<{
        assetbundleName?: string;
        episodes?: Array<{ scenarioId?: string }>;
    }>;
}

interface CardMasterEntry {
    id: number;
    assetbundleName: string;
}

interface CardEpisodeMasterEntry {
    cardId: number;
    scenarioId: string;
}

interface ActionSetMasterEntry {
    id: number;
    scenarioId?: string;
}

interface SpecialStoryMasterEntry {
    id: number;
    episodes?: Array<{
        assetbundleName?: string;
        scenarioId?: string;
    }>;
}

interface EventStoryLookup {
    byEventId: Map<number, string>;
    byScenarioId: Map<string, string>;
}

const MAX_SCENARIO_CACHE = 60;

/** Bounded LRU cache of fetched scenario JSONs keyed by `${source}|${path}`. */
const scenarioCache = new Map<string, IScenarioData>();
const inflightScenarios = new Map<string, Promise<IScenarioData | null>>();

/** Lazy per-server masterdata index caches. */
const eventLookupCache = new Map<StorySearchServer, Promise<EventStoryLookup>>();
const unitLookupCache = new Map<StorySearchServer, Promise<Map<string, string>>>();
const cardLookupCache = new Map<StorySearchServer, Promise<Map<number, string>>>();
const cardEpisodeLookupCache = new Map<StorySearchServer, Promise<Map<string, number>>>();
const actionSetLookupCache = new Map<StorySearchServer, Promise<Map<string, number>>>();
const specialLookupCache = new Map<StorySearchServer, Promise<Map<string, string>>>();
const character2dCache = new Map<StorySearchServer, Promise<Map<number, ICharacter2D>>>();

function createAbortError(): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException("The operation was aborted.", "AbortError");
    }
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    return err;
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(createAbortError());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(createAbortError());
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            },
        );
    });
}

function parseNumericSuffix(storyId: string, prefix: string): number | null {
    if (!storyId.startsWith(prefix)) return null;
    const raw = storyId.slice(prefix.length);
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function cachedServerLookup<T>(
    cache: Map<StorySearchServer, Promise<T>>,
    server: StorySearchServer,
    loader: () => Promise<T>,
    signal?: AbortSignal,
): Promise<T> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    let promise = cache.get(server);
    if (!promise) {
        promise = loader();
        cache.set(server, promise);
        promise.catch(() => cache.delete(server));
    }
    return withAbortSignal(promise, signal);
}

function getEventLookup(server: StorySearchServer, signal?: AbortSignal): Promise<EventStoryLookup> {
    return cachedServerLookup(eventLookupCache, server, async () => {
        const list = await fetchMasterDataForServer<EventStoryMasterEntry[]>(server, "eventStories.json");
        const byEventId = new Map<number, string>();
        const byScenarioId = new Map<string, string>();
        for (const item of list ?? []) {
            if (typeof item?.eventId === "number" && typeof item.assetbundleName === "string") {
                byEventId.set(item.eventId, item.assetbundleName);
                for (const ep of item.eventStoryEpisodes ?? []) {
                    if (typeof ep?.scenarioId === "string" && ep.scenarioId) {
                        byScenarioId.set(ep.scenarioId, item.assetbundleName);
                    }
                }
            }
        }
        return { byEventId, byScenarioId };
    }, signal);
}

function getUnitLookup(server: StorySearchServer, signal?: AbortSignal): Promise<Map<string, string>> {
    return cachedServerLookup(unitLookupCache, server, async () => {
        const list = await fetchMasterDataForServer<UnitStoryMasterEntry[]>(server, "unitStories.json");
        const byScenarioId = new Map<string, string>();
        for (const story of list ?? []) {
            for (const chapter of story?.chapters ?? []) {
                const bundle = chapter?.assetbundleName;
                if (!bundle) continue;
                for (const ep of chapter.episodes ?? []) {
                    if (typeof ep?.scenarioId === "string" && ep.scenarioId) {
                        byScenarioId.set(ep.scenarioId, bundle);
                    }
                }
            }
        }
        return byScenarioId;
    }, signal);
}

function getCardLookup(server: StorySearchServer, signal?: AbortSignal): Promise<Map<number, string>> {
    return cachedServerLookup(cardLookupCache, server, async () => {
        const list = await fetchMasterDataForServer<CardMasterEntry[]>(server, "cards.json");
        const byId = new Map<number, string>();
        for (const card of list ?? []) {
            if (typeof card?.id === "number" && typeof card.assetbundleName === "string") {
                byId.set(card.id, card.assetbundleName);
            }
        }
        return byId;
    }, signal);
}

function getCardEpisodeLookup(server: StorySearchServer, signal?: AbortSignal): Promise<Map<string, number>> {
    return cachedServerLookup(cardEpisodeLookupCache, server, async () => {
        const list = await fetchMasterDataForServer<CardEpisodeMasterEntry[]>(server, "cardEpisodes.json");
        const byScenarioId = new Map<string, number>();
        for (const ep of list ?? []) {
            if (typeof ep?.scenarioId === "string" && typeof ep.cardId === "number") {
                byScenarioId.set(ep.scenarioId, ep.cardId);
            }
        }
        return byScenarioId;
    }, signal);
}

function getActionSetLookup(server: StorySearchServer, signal?: AbortSignal): Promise<Map<string, number>> {
    return cachedServerLookup(actionSetLookupCache, server, async () => {
        const list = await fetchMasterDataForServer<ActionSetMasterEntry[]>(server, "actionSets.json");
        const byScenarioId = new Map<string, number>();
        for (const action of list ?? []) {
            if (typeof action?.id === "number" && typeof action.scenarioId === "string" && action.scenarioId) {
                byScenarioId.set(action.scenarioId, action.id);
            }
        }
        return byScenarioId;
    }, signal);
}

function getSpecialLookup(server: StorySearchServer, signal?: AbortSignal): Promise<Map<string, string>> {
    return cachedServerLookup(specialLookupCache, server, async () => {
        const list = await fetchMasterDataForServer<SpecialStoryMasterEntry[]>(server, "specialStories.json");
        const byScenarioId = new Map<string, string>();
        for (const story of list ?? []) {
            for (const ep of story?.episodes ?? []) {
                if (typeof ep?.scenarioId === "string" && typeof ep.assetbundleName === "string" && ep.scenarioId) {
                    byScenarioId.set(ep.scenarioId, ep.assetbundleName);
                }
            }
        }
        return byScenarioId;
    }, signal);
}

function getCharacter2dLookup(server: StorySearchServer, signal?: AbortSignal): Promise<Map<number, ICharacter2D>> {
    return cachedServerLookup(character2dCache, server, async () => {
        const list = await fetchMasterDataForServer<ICharacter2D[]>(server, "character2ds.json");
        const byId = new Map<number, ICharacter2D>();
        for (const entry of list ?? []) {
            if (typeof entry?.id === "number") {
                byId.set(entry.id, entry);
            }
        }
        return byId;
    }, signal);
}

/** Resolves the scenario JSON relative path under `sekai-<server>-assets/` for a search chunk. */
async function resolveScenarioJsonPath(chunk: StoryChunk, signal?: AbortSignal): Promise<string | null> {
    const scenarioId = chunk.scenario_id?.trim();
    if (!scenarioId) return null;
    const server = chunk.server;

    switch (chunk.type) {
        case "event": {
            const lookup = await getEventLookup(server, signal);
            const eventId = parseNumericSuffix(chunk.story_id, "event_");
            const bundle = (eventId !== null ? lookup.byEventId.get(eventId) : undefined)
                ?? lookup.byScenarioId.get(scenarioId);
            if (!bundle) return null;
            return `event_story/${bundle}/scenario/${scenarioId}.json`;
        }
        case "unit": {
            const lookup = await getUnitLookup(server, signal);
            const bundle = lookup.get(scenarioId);
            if (!bundle) return null;
            return `scenario/unitstory/${bundle}/${scenarioId}.json`;
        }
        case "card": {
            const cards = await getCardLookup(server, signal);
            let cardId = parseNumericSuffix(chunk.story_id, "card_");
            if (cardId === null || !cards.has(cardId)) {
                const episodes = await getCardEpisodeLookup(server, signal).catch(() => new Map<string, number>());
                cardId = episodes.get(scenarioId) ?? cardId;
            }
            const bundle = cardId !== null ? cards.get(cardId) : undefined;
            if (!bundle) return null;
            // The international server (en) stores card scenarios under `character/member_scenario/`.
            return server === "en"
                ? `character/member_scenario/${bundle}/${scenarioId}.json`
                : `character/member/${bundle}/${scenarioId}.json`;
        }
        case "talk": {
            let actionId = parseNumericSuffix(chunk.story_id, "talk_");
            if (actionId === null) {
                const actions = await getActionSetLookup(server, signal);
                actionId = actions.get(scenarioId) ?? null;
            }
            if (actionId === null) return null;
            const group = Math.floor(actionId / 100);
            return `scenario/actionset/group${group}/${scenarioId}.json`;
        }
        case "self": {
            return `scenario/profile/${scenarioId}.json`;
        }
        case "special": {
            const lookup = await getSpecialLookup(server, signal);
            const bundle = lookup.get(scenarioId);
            if (!bundle) return null;
            return `scenario/special/${bundle}/${scenarioId}.json`;
        }
        default:
            return null;
    }
}

function storeScenarioCache(cacheKey: string, data: IScenarioData): void {
    scenarioCache.delete(cacheKey);
    scenarioCache.set(cacheKey, data);
    while (scenarioCache.size > MAX_SCENARIO_CACHE) {
        const oldest = scenarioCache.keys().next().value;
        if (oldest === undefined) break;
        scenarioCache.delete(oldest);
    }
}

async function fetchScenarioCached(
    targetSource: AssetSourceType,
    relativePath: string,
    signal?: AbortSignal,
): Promise<IScenarioData | null> {
    if (signal?.aborted) throw createAbortError();
    const cacheKey = `${targetSource}|${relativePath}`;
    const cached = scenarioCache.get(cacheKey);
    if (cached) {
        storeScenarioCache(cacheKey, cached);
        return cached;
    }

    let pending = inflightScenarios.get(cacheKey);
    if (!pending) {
        const url = `${getAssetBaseUrl(targetSource)}/${relativePath}`;
        pending = (async (): Promise<IScenarioData | null> => {
            const response = await fetch(url, { mode: "cors", credentials: "omit" });
            if (!response.ok) return null;
            const data = await response.json() as IScenarioData;
            if (!data || typeof data !== "object") return null;
            storeScenarioCache(cacheKey, data);
            return data;
        })().finally(() => {
            inflightScenarios.delete(cacheKey);
        });
        inflightScenarios.set(cacheKey, pending);
    }

    return withAbortSignal(pending, signal);
}

function defaultVoiceKindForChunk(type: StoryChunk["type"]): StoryVoiceKind {
    if (type === "card") return "card";
    if (type === "talk") return "area";
    return "story";
}

function normalizeTalkBody(text: string): string {
    return text.replace(/[\r\n\t\u3000 ]+/g, " ").trim();
}

/** Converts a single scenario `TalkData.Voices` entry into a validated `StoryVoiceRef`, handling `partvoice`. */
export function buildVoiceRefFromTalkVoice(
    voiceIdRaw: string,
    voiceCharacter2dId: number | undefined,
    fallbackCharacter2dId: number | undefined,
    chunkType: StoryChunk["type"],
    scenarioId: string,
    chara2dById?: ReadonlyMap<number, ICharacter2D> | null,
    region?: StoryRegion,
): StoryVoiceRef | null {
    const voiceId = voiceIdRaw.trim();
    if (!voiceId || !STORY_ASSET_PATTERN.test(voiceId)) return null;

    const regionField = region ? { region } : {};
    const defaultKind = defaultVoiceKindForChunk(chunkType);
    if (voiceId.startsWith("partvoice")) {
        const chara2dId = voiceCharacter2dId || fallbackCharacter2dId || 0;
        const chara2d = chara2dId ? chara2dById?.get(chara2dId) : undefined;
        if (chara2d?.assetName && chara2d?.unit) {
            const chara = `${chara2d.assetName}_${chara2d.unit}`;
            // Matches `voiceUrlFinder.ts`: v2_*/clb* use `sound/scenario/voice/part_voice_<chara>/`,
            // while gen-1 characters primarily use `sound/scenario/part_voice/<chara>/`.
            if (chara.startsWith("v2_") || chara.startsWith("clb")) {
                const prefixed = `part_voice_${chara}`;
                if (STORY_ASSET_PATTERN.test(prefixed)) {
                    return { kind: "story", scenarioId: prefixed, voiceId, ...regionField };
                }
            } else if (STORY_ASSET_PATTERN.test(chara)) {
                return { kind: "part", scenarioId: chara, voiceId, ...regionField };
            }
        }
    }

    const cleanScenario = scenarioId.trim();
    if (!cleanScenario || !STORY_ASSET_PATTERN.test(cleanScenario)) return null;
    return { kind: defaultKind, scenarioId: cleanScenario, voiceId, ...regionField };
}

/**
 * Pure alignment helper mapping a `StoryChunk`'s dialogue lines against `scenario`'s Talk snippets
 * (`Snippet.Action === 1` -> `TalkData[ReferenceIndex]`), with normalized-body fallback matching.
 */
export function alignScenarioTalkVoices(
    chunk: StoryChunk,
    scenario: IScenarioData,
    chara2dById?: ReadonlyMap<number, ICharacter2D> | null,
): StorySearchVoiceLine[] {
    const talkList: ITalkData[] = [];
    for (const snippet of scenario.Snippets ?? []) {
        if (snippet.Action !== 1) continue;
        const talk = scenario.TalkData?.[snippet.ReferenceIndex];
        if (talk) talkList.push(talk);
    }

    const normalizedTalkBodies = talkList.map(talk => normalizeTalkBody(talk.Body ?? ""));
    const baseScenarioId = (scenario.ScenarioId || chunk.scenario_id || "").trim();

    const extractVoices = (talk: ITalkData | undefined): { voiceRef: StoryVoiceRef | null; extraVoices: StoryVoiceRef[] } => {
        if (!talk || !Array.isArray(talk.Voices) || talk.Voices.length === 0) {
            return { voiceRef: null, extraVoices: [] };
        }
        const fallbackChara2d = talk.TalkCharacters?.[0]?.Character2dId;
        const refs: StoryVoiceRef[] = [];
        const seen = new Set<string>();
        for (const voice of talk.Voices) {
            if (typeof voice?.VoiceId !== "string") continue;
            const ref = buildVoiceRefFromTalkVoice(
                voice.VoiceId,
                voice.Character2dId,
                fallbackChara2d,
                chunk.type,
                baseScenarioId,
                chara2dById,
                chunk.server as StoryRegion,
            );
            if (!ref) continue;
            const key = `${ref.kind}|${ref.scenarioId}|${ref.voiceId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            refs.push(ref);
        }
        return {
            voiceRef: refs[0] ?? null,
            extraVoices: refs.slice(1),
        };
    };

    const chunkLines = chunk.text ? parseDialogueLines(chunk.text) : [];
    const lineStart = Number.isInteger(chunk.line_start) && chunk.line_start >= 0 ? chunk.line_start : 0;

    if (chunkLines.length === 0) {
        const lineEnd = Number.isInteger(chunk.line_end) && chunk.line_end >= lineStart
            ? Math.min(talkList.length - 1, chunk.line_end)
            : Math.min(talkList.length - 1, lineStart + 7);
        const results: StorySearchVoiceLine[] = [];
        for (let idx = lineStart; idx <= lineEnd; idx++) {
            const talk = talkList[idx];
            if (!talk) continue;
            const { voiceRef, extraVoices } = extractVoices(talk);
            results.push({
                lineIndex: idx - lineStart,
                speaker: talk.WindowDisplayName || "",
                text: talk.Body || "",
                voiceRef,
                extraVoices,
            });
        }
        return results;
    }

    const usedTalkIndices = new Set<number>();
    const results: StorySearchVoiceLine[] = [];

    for (let lineIdx = 0; lineIdx < chunkLines.length; lineIdx++) {
        const line = chunkLines[lineIdx];
        const expectedIdx = lineStart + lineIdx;
        const normalizedSpeech = normalizeTalkBody(line.speech);
        let matchedIdx = -1;

        // 1. Direct index alignment verified by normalized body text.
        if (
            expectedIdx >= 0
            && expectedIdx < talkList.length
            && !usedTalkIndices.has(expectedIdx)
            && normalizedSpeech
            && normalizedTalkBodies[expectedIdx] === normalizedSpeech
        ) {
            matchedIdx = expectedIdx;
        }

        // 2. Nearby window search (±16) to absorb skipped empty bodies or minor index drift.
        if (matchedIdx === -1 && normalizedSpeech) {
            const windowStart = Math.max(0, expectedIdx - 16);
            const windowEnd = Math.min(talkList.length - 1, expectedIdx + 16);
            let bestDist = Infinity;
            for (let i = windowStart; i <= windowEnd; i++) {
                if (usedTalkIndices.has(i)) continue;
                if (normalizedTalkBodies[i] !== normalizedSpeech) continue;
                const dist = Math.abs(i - expectedIdx);
                if (dist < bestDist) {
                    bestDist = dist;
                    matchedIdx = i;
                }
            }
        }

        // 3. Whole-scenario normalized body fallback search.
        if (matchedIdx === -1 && normalizedSpeech) {
            for (let i = 0; i < talkList.length; i++) {
                if (usedTalkIndices.has(i)) continue;
                if (normalizedTalkBodies[i] === normalizedSpeech) {
                    matchedIdx = i;
                    break;
                }
            }
        }

        // 4. Positional fallback if text differed (e.g. player-name placeholder or formatting difference).
        if (matchedIdx === -1 && expectedIdx >= 0 && expectedIdx < talkList.length && !usedTalkIndices.has(expectedIdx)) {
            matchedIdx = expectedIdx;
        }

        const matchedTalk = matchedIdx !== -1 ? talkList[matchedIdx] : undefined;
        if (matchedIdx !== -1) usedTalkIndices.add(matchedIdx);
        const { voiceRef, extraVoices } = extractVoices(matchedTalk);

        results.push({
            lineIndex: lineIdx,
            speaker: line.speaker ?? matchedTalk?.WindowDisplayName ?? "",
            text: line.speech || matchedTalk?.Body || "",
            voiceRef,
            extraVoices,
        });
    }

    return results;
}

/**
 * Resolves playable voice references for every dialogue line in a Story Search `chunk`.
 * Fetches scenario JSON from `chunk.server` using the CDN line of `assetSource` (`main` / `backup`).
 */
export async function resolveStorySearchChunkVoices(
    chunk: StoryChunk,
    assetSource: AssetSourceType | AssetLine = "main",
    signal?: AbortSignal,
): Promise<StorySearchVoiceLine[]> {
    const line: AssetLine = getAssetLine(assetSource as AssetSourceType);
    const targetSource = `${line}-${chunk.server}` as AssetSourceType;

    const relativePath = await resolveScenarioJsonPath(chunk, signal);
    if (!relativePath) return [];

    const scenario = await fetchScenarioCached(targetSource, relativePath, signal);
    if (!scenario) return [];

    // Only load character2ds.json when this scenario actually references a `partvoice*` clip.
    const needsCharacter2ds = (scenario.TalkData ?? []).some(talk =>
        (talk?.Voices ?? []).some(v => typeof v?.VoiceId === "string" && v.VoiceId.startsWith("partvoice")),
    );
    let chara2dById: Map<number, ICharacter2D> | null = null;
    if (needsCharacter2ds) {
        chara2dById = await getCharacter2dLookup(chunk.server, signal).catch(() => null);
    }

    return alignScenarioTalkVoices(chunk, scenario, chara2dById);
}
