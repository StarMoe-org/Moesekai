import type { IScenarioData } from "@/types/story";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getAssetBaseUrl, getAssetRegion } from "./assets";

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

/** The scenario's path in the server's storage view. */
function scenarioPath(type: StoryAssetType, region: string, params: AssetParams): string {
    switch (type) {
        case "unit":
            return `scenario/unitstory/${params.assetbundleName}/${params.scenarioId}.json`;
        case "event":
            return `event_story/${params.assetbundleName}/scenario/${params.scenarioId}.json`;
        case "card":
            // The international server (en) keeps card stories in a directory of its own.
            return region === "en"
                ? `character/member_scenario/${params.assetbundleName}/${params.scenarioId}.json`
                : `character/member/${params.assetbundleName}/${params.scenarioId}.json`;
        case "talk":
            return `scenario/actionset/group${params.group}/${params.scenarioId}.json`;
        case "self":
            return `scenario/profile/${params.scenarioId}.json`;
        case "special":
            return `scenario/special/${params.assetbundleName}/${params.scenarioId}.json`;
    }
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

/** Fetches a scenario from the server's storage view on the asset site. */
export async function fetchStoryAssetFromMirror(
    type: StoryAssetType,
    source: AssetSourceType,
    params: AssetParams
): Promise<IScenarioData> {
    const path = scenarioPath(type, getAssetRegion(source), params);
    const data = await fetchScenario(`${getAssetBaseUrl(source)}/${path}`);
    if (!data) throw new StoryAssetMissingError([path]);
    return data;
}
