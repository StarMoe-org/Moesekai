import type { IScenarioData } from "@/types/story";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getAssetBaseUrl } from "./assets";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StoryAssetType = "unit" | "event" | "card" | "talk" | "self" | "special";

export interface AssetParams {
    scenarioId: string;
    assetbundleName?: string; // required for unit/event/card/special
    group?: number;           // required for talk: Math.floor(actionSetId / 100)
}

export class StoryAssetMissingError extends Error {
    public readonly missingPaths: string[];
    constructor(missingPaths: string[]) {
        super("Story asset not found in mirror");
        this.name = "StoryAssetMissingError";
        this.missingPaths = missingPaths;
    }
}

// ── Path builder ──────────────────────────────────────────────────────────────

/** Extract region from AssetSourceType (e.g. "main-en" → "en", "main" → from localStorage) */
function getRegionFromSource(source: AssetSourceType): string {
    const hyphenIndex = source.indexOf("-");
    if (hyphenIndex !== -1) {
        return source.substring(hyphenIndex + 1);
    }
    // For bare "main" / "overseas", fall back to localStorage
    if (typeof window !== "undefined") {
        return localStorage.getItem("server-source") || "jp";
    }
    return "jp";
}

function buildPath(type: StoryAssetType, source: AssetSourceType, params: AssetParams): string {
    const base = `${getAssetBaseUrl(source)}/`;
    switch (type) {
        case "unit":
            return `${base}scenario/unitstory/${params.assetbundleName}/${params.scenarioId}.json`;
        case "event":
            return `${base}event_story/${params.assetbundleName}/scenario/${params.scenarioId}.json`;
        case "card": {
            // International server (en) uses a different directory structure
            const region = getRegionFromSource(source);
            if (region === "en") {
                return `${base}character/member_scenario/${params.assetbundleName}/${params.scenarioId}.json`;
            }
            return `${base}character/member/${params.assetbundleName}/${params.scenarioId}.json`;
        }
        case "talk":
            return `${base}scenario/actionset/group${params.group}/${params.scenarioId}.json`;
        case "self":
            return `${base}scenario/profile/${params.scenarioId}.json`;
        case "special":
            return `${base}scenario/special/${params.assetbundleName}/${params.scenarioId}.json`;
    }
}

// ── Language check ────────────────────────────────────────────────────────────

/**
 * The asset mirror has served other servers' scenarios under a server's own path: JP events
 * 168, 169 and 172–174 (and the same EN paths) are the Taiwan server's Traditional Chinese
 * text, and some JP card and special stories are Korean. Their `ScenarioId` says nothing
 * (the genuine JP files of those events name themselves one event lower too), so the check
 * reads the text. The rules are those SekaiStoryRipper (0.11.2) uses to reject a served
 * scenario.
 */
export const STORY_LIBRARY_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/";

export interface ScriptCounts {
    kana: number;
    hangul: number;
    han: number;
    latin: number;
}

/** Counts kana, hangul, CJK ideographs and ASCII letters in the scenario's spoken text. */
export function countScenarioScripts(scenario: unknown): ScriptCounts {
    const counts: ScriptCounts = { kana: 0, hangul: 0, han: 0, latin: 0 };
    const talks = (scenario as { TalkData?: unknown } | null)?.TalkData;
    if (!Array.isArray(talks)) return counts;
    for (const talk of talks) {
        const body = (talk as { Body?: unknown } | null)?.Body;
        if (typeof body !== "string") continue;
        for (let i = 0; i < body.length; i++) {
            const c = body.charCodeAt(i);
            if (c >= 0x3041 && c <= 0x30ff) counts.kana++;
            else if ((c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f) || (c >= 0xac00 && c <= 0xd7a3)) counts.hangul++;
            else if ((c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff)) counts.han++;
            else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) counts.latin++;
        }
    }
    return counts;
}

/**
 * Whether a scenario's text is written in `region`'s language. Lines of symbols only (no
 * letters of any of the four kinds) pass, and so does a region without a rule.
 */
export function scenarioTextMatchesRegion(region: string, scenario: unknown): boolean {
    const { kana, hangul, han, latin } = countScenarioScripts(scenario);
    if (kana + hangul + han + latin === 0) return true;
    switch (region) {
        case "jp":
            return kana * 4 > han;
        case "kr":
            return hangul * 4 > han;
        case "en":
            return latin > kana + hangul + han;
        case "cn":
        case "tw":
            return kana * 10 < han && hangul * 10 < han && han > latin;
        default:
            return true;
    }
}

/**
 * The story library's copy of a mirror file (`<region>/library/<the same path>`), unpacked
 * from the game's own bundle, or null when the URL is not a mirror path.
 */
export function storyLibraryUrlFor(mirrorUrl: string): { region: string; url: string } | null {
    const match = /^https?:\/\/[^/]+\/sekai-([a-z]+)-assets\/(.+)$/.exec(mirrorUrl);
    if (!match) return null;
    const [, region, path] = match;
    return { region, url: `${STORY_LIBRARY_BASE}${region}/library/${path}` };
}

async function fetchScenario(url: string): Promise<IScenarioData | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json() as IScenarioData;
        return data && typeof data === "object" ? data : null;
    } catch {
        return null;
    }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetches a scenario from the asset mirror. When the mirror's text is not in the server's
 * language, the story library's copy of the same path is read instead; if the library has
 * none yet, the mirror's file is still shown.
 */
export async function fetchStoryAssetFromMirror(
    type: StoryAssetType,
    source: AssetSourceType,
    params: AssetParams
): Promise<IScenarioData> {
    const url = buildPath(type, source, params);
    const data = await fetchScenario(url);
    if (data) {
        const library = storyLibraryUrlFor(url);
        if (library && !scenarioTextMatchesRegion(library.region, data)) {
            const replacement = await fetchScenario(library.url);
            if (replacement) return replacement;
            console.warn("[story] the mirror's scenario is not in the server's language and the story library has no copy", { url });
        }
        return data;
    }

    // Strip domain and assets prefix for display
    const displayPath = url.replace(/^https?:\/\/[^\/]+\/(sekai-[a-z]+-assets\/)?/, "");
    throw new StoryAssetMissingError([displayPath]);
}
