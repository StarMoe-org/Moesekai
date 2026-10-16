/**
 * The script of an episode the story player plays, read as the story pages read it but from
 * the chosen server's mirror (which need not be the server the site is set to).
 */
import { replaceAssetSourceRegion, type AssetSourceType } from "@/contexts/ThemeContext";
import type { SseWebRegion } from "@/lib/sseWeb/config";
import { fetchStoryAssetFromMirror } from "@/lib/storyAsset";
import { processScenarioForDisplay } from "@/lib/storyLoader";
import type { IProcessedScenarioData } from "@/types/story";
import type { StoryEpisode } from "./episodes";

/** The episode's script in `region`'s own text; throws `StoryAssetMissingError` when the mirror lacks it. */
export async function loadEpisodeScript(episode: StoryEpisode, region: SseWebRegion, assetSource: AssetSourceType): Promise<IProcessedScenarioData> {
    const source = replaceAssetSourceRegion(assetSource, region);
    const raw = await fetchStoryAssetFromMirror(episode.script.type, source, episode.script.params);
    return processScenarioForDisplay(raw, episode.script.voices, source, region);
}
