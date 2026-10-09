import {
    type AssetSourceType,
} from "@/contexts/ThemeContext";
import { defaultContentRegionForPathname } from "@/lib/locale-routing";
import { sseWebSources } from "@/lib/sseWeb/config";

export const MOE_STATIC_BASE_URL = "https://moe.exmeaning.com";
export const MOE_ASSETS_BASE_URL = `${MOE_STATIC_BASE_URL}/assets`;
export const MOE_LOGO_URL = `${MOE_ASSETS_BASE_URL}/logo.svg`;
export const MOE_MUSIC_META_URL = `${MOE_STATIC_BASE_URL}/data/music_meta/music_metas.json`;
export const MOE_RANKINGS_URL = `${MOE_STATIC_BASE_URL}/data/music_meta/rankings_best.json`;
export const MOE_BGM_DURATIONS_URL = `${MOE_STATIC_BASE_URL}/data/bgm_duration/bgm_durations.json`;
export const MOE_MUSIC_BPM_URL = `${MOE_STATIC_BASE_URL}/data/music_bpm/music_bpms.json`;

export const ASSET_DOMAIN_MAIN = "https://storage.exmeaning.com";
export const ASSET_DOMAIN_OVERSEAS = "https://storage.pjsk.moe";

function getCurrentRegion(): string {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return "cn";
    try {
        return localStorage.getItem("server-source") || defaultContentRegionForPathname(window?.location?.pathname);
    } catch {
        return "cn";
    }
}

export function getAssetBaseUrl(source: AssetSourceType): string {
    let line: "main" | "overseas" = "main";
    let region: string = "";

    if (source.startsWith("overseas")) {
        line = "overseas";
    }

    const hyphenIndex = source.indexOf("-");
    if (hyphenIndex !== -1) {
        region = source.substring(hyphenIndex + 1);
    } else {
        region = getCurrentRegion();
    }

    const domain = line === "main" ? ASSET_DOMAIN_MAIN : ASSET_DOMAIN_OVERSEAS;
    return `${domain}/sekai-${region}-assets`;
}

function buildImageAssetUrl(source: AssetSourceType, assetPath: string): string {
    return `${getAssetBaseUrl(source)}/${assetPath}.webp`;
}

function buildAudioAssetUrl(source: AssetSourceType, assetPath: string): string {
    return `${getAssetBaseUrl(source)}/${assetPath}.mp3`;
}

function buildJsonAssetUrl(source: AssetSourceType, assetPath: string): string {
    return `${getAssetBaseUrl(source)}/${assetPath}.json`;
}

function buildPngImageAssetUrl(source: AssetSourceType, assetPath: string): string {
    return `${getAssetBaseUrl(source)}/${assetPath}.png`;
}

export function buildRawAssetUrl(source: AssetSourceType, assetPath: string): string {
    return `${getAssetBaseUrl(source)}/${assetPath.replace(/^\/+/, "")}`;
}

export function getAssetSourceFallbackOrder(source: AssetSourceType): AssetSourceType[] {
    const base = source.startsWith("overseas") ? "overseas" : "main";
    const fallback = base === "main" ? "overseas" : "main";

    const hyphenIndex = source.indexOf("-");
    if (hyphenIndex !== -1) {
        const region = source.substring(hyphenIndex + 1);
        return [source, `${fallback}-${region}` as AssetSourceType];
    }

    return [source, fallback];
}

export function getMysekaiRawAssetUrl(assetPath: string, source: AssetSourceType = "main-jp"): string {
    const normalizedPath = assetPath
        .replace(/^\/+/, "")
        .replace(/^mysekai\/+/, "");
    return buildRawAssetUrl(source, `mysekai/${normalizedPath}`);
}

export function getCharacterIconUrl(characterId: number): string {
    return `${MOE_ASSETS_BASE_URL}/chr_ts_${characterId}.png`;
}

export function getAreaItemThumbnailUrl(
    assetbundleName: string,
    source: AssetSourceType = "main-jp"
): string {
    return buildImageAssetUrl(source, `thumbnail/areaitem/${assetbundleName}`);
}

export function getMaterialThumbnailUrl(
    materialId: number,
    source: AssetSourceType = "main-jp"
): string {
    return buildImageAssetUrl(source, `thumbnail/material/material${materialId}`);
}

export function getCommonMaterialThumbnailUrl(
    assetbundleName: string,
    source: AssetSourceType = "main-jp"
): string {
    return buildImageAssetUrl(source, `thumbnail/common_material/${assetbundleName}`);
}

export function getAttrIconUrl(attr: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `thumbnail/common/attribute/${attr}`);
}

export function getUnitLogoUrl(unitId: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `thumbnail/common/unit/${unitId}`);
}

export function getCardThumbnailUrl(
    _characterId: number,
    assetbundleName: string,
    trained: boolean = false,
    source: AssetSourceType = "main-jp"
): string {
    const status = trained ? "after_training" : "normal";
    return buildImageAssetUrl(source, `thumbnail/chara/${assetbundleName}_${status}`);
}

export function getCostumeThumbnailUrl(
    assetbundleName: string,
    source: AssetSourceType = "main-jp"
): string {
    return buildImageAssetUrl(source, `thumbnail/costume/${assetbundleName}`);
}

export function getCardFullUrl(
    _characterId: number,
    assetbundleName: string,
    trained: boolean = false,
    source: AssetSourceType = "main-jp"
): string {
    const status = trained ? "after_training" : "normal";
    return buildImageAssetUrl(source, `character/member/${assetbundleName}/card_${status}`);
}

export function getEventBannerUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `event/${assetbundleName}/screen/bg`);
}

export function getEventCharacterUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `event/${assetbundleName}/screen/character`);
}

export function getEventLogoUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `event/${assetbundleName}/logo/logo`);
}

export function getEventStoryBannerUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `event_story/${assetbundleName}/screen_image/banner_event_story`);
}

export function getEventBgmUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildAudioAssetUrl(source, `event/${assetbundleName}/bgm/${assetbundleName}_top`);
}

// ==================== Gacha Asset URLs ====================

export function getGachaLogoUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `gacha/${assetbundleName}/logo/logo`);
}

export function getGachaBannerUrl(gachaId: number, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}`);
}

export function getGachaScreenUrl(assetbundleName: string, gachaId: number, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `gacha/${assetbundleName}/screen/bg_gacha${gachaId}_1`);
}

export function getCardGachaVoiceUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildAudioAssetUrl(source, `sound/gacha/get_voice/${assetbundleName}/${assetbundleName}`);
}

// ==================== Comic Asset URLs ====================

export function getComicUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `comic/one_frame/${assetbundleName}`);
}

// ==================== Manga Asset URLs ====================

export function getMangaImageUrl(id: number): string {
    return `${MOE_STATIC_BASE_URL}/mangas/${id}.webp`;
}

// ==================== Sticker/Stamp Asset URLs ====================

export function getStampUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildPngImageAssetUrl(source, `stamp/${assetbundleName}/${assetbundleName}`);
}

// ==================== Music Asset URLs ====================

export function getMusicScoreUrl(musicId: number, difficulty: string, source: AssetSourceType = "main-jp"): string {
    const paddedId = String(musicId).padStart(4, "0");
    return `${getAssetBaseUrl(source)}/music/music_score/${paddedId}_01/${difficulty}.txt`;
}

export function getChartSvgUrl(musicId: number, difficulty: string, _source: AssetSourceType = "main-jp"): string {
    return `/chart-svg/${musicId}/${difficulty}.svg`;
}

export function getMusicJacketUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `music/jacket/${assetbundleName}/${assetbundleName}`);
}

export function getMusicVocalAudioUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildAudioAssetUrl(source, `music/long/${assetbundleName}/${assetbundleName}`);
}

// ==================== Virtual Live Asset URLs ====================

export function getVirtualLiveBannerUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `virtual_live/select/banner/${assetbundleName}/${assetbundleName}`);
}

// ==================== MySEKAI Asset URLs ====================

export function getMysekaiFixtureThumbnailUrl(assetbundleName: string, source: AssetSourceType = "main-jp", genreId: number = 0): string {
    if (genreId === 7) {
        return buildPngImageAssetUrl(source, `mysekai/thumbnail/surface_appearance/${assetbundleName}/tex_${assetbundleName}_wall_appearance_1`);
    }

    if (genreId === 8) {
        return buildPngImageAssetUrl(source, `mysekai/thumbnail/surface_appearance/${assetbundleName}/tex_${assetbundleName}_floor_appearance_1`);
    }

    return buildPngImageAssetUrl(source, `mysekai/thumbnail/fixture/${assetbundleName}_1`);
}

export function getPracticeTicketThumbnailUrl(resourceId: number, source: AssetSourceType = "main-jp"): string {
    return buildPngImageAssetUrl(source, `thumbnail/practice_ticket/ticket${resourceId}`);
}

export function getSkillPracticeTicketThumbnailUrl(resourceId: number, source: AssetSourceType = "main-jp"): string {
    return buildPngImageAssetUrl(source, `thumbnail/skill_practice_ticket/ticket${resourceId}`);
}

export function getMysekaiMaterialThumbnailUrl(iconAssetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildPngImageAssetUrl(source, `mysekai/thumbnail/material/${iconAssetbundleName}`);
}

// ==================== Character Asset URLs ====================

export function getCharacterTrimUrl(characterId: number, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `character/character_select/chr_tl_${characterId}`);
}

export function getCharacterLabelHUrl(characterId: number, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `character/label/chr_h_lb_${characterId}`);
}

export function getCharacterLabelVUrl(characterId: number, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `character/label_vertical/chr_v_lb_${characterId}`);
}

export function getCharacterSelectUrl(characterId: number, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `character/character_select/chr_tl_${characterId}`);
}

// ==================== Honor/Degree Asset URLs ====================

export function getHonorBgUrl(assetbundleName: string, sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `honor/${assetbundleName}/degree_${sub ? "sub" : "main"}`);
}

export function getHonorCustomFrameUrl(frameName: string, rarity: string, sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    const rarityMap: Record<string, number> = { low: 1, middle: 2, high: 3, highest: 4 };
    const num = rarityMap[rarity] || 1;
    const size = sub ? "s" : "m";
    return buildImageAssetUrl(source, `honor_frame/${frameName}/frame_degree_${size}_${num}`);
}

export function getHonorRankUrl(assetbundleName: string, type: "rank" | "scroll", sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    const suffix = type === "rank" ? `rank_${sub ? "sub" : "main"}` : "scroll";
    return buildImageAssetUrl(source, `honor/${assetbundleName}/${suffix}`);
}

export function getHonorRankMatchBgUrl(assetbundleName: string, sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `rank_live/honor/${assetbundleName}/degree_${sub ? "sub" : "main"}`);
}

export function getBondsHonorWordUrl(assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `bonds_honor/word/${assetbundleName}_01`);
}

export function getBondsHonorCharacterUrl(characterId: number, source: AssetSourceType = "main-jp"): string {
    const paddedId = String(characterId).padStart(2, "0");
    return buildImageAssetUrl(source, `bonds_honor/character/chr_sd_${paddedId}_01`);
}

// ==================== In-app (client package) Asset URLs ====================

/**
 * A sprite the game client carries in its own package rather than in a downloadable bundle
 * (the default honor frames, the honor level icons), read from the server's client unpack --
 * the same unpack the story player uses. The CN client keeps these in `data.unity3d`, the JP
 * unpack has them loose. A server left out of the player's unpacks falls back to JP's.
 */
export function getInappSpriteUrl(spriteName: string, source: AssetSourceType = "main-jp"): string | undefined {
    const hyphenIndex = source.indexOf("-");
    const region = hyphenIndex !== -1 ? source.substring(hyphenIndex + 1) : getCurrentRegion();
    const inapp = (sseWebSources(region) ?? sseWebSources("jp"))?.inapp;
    if (!inapp) return undefined;
    const playerDir = /\/cn-[^/]+\/$/.test(inapp) ? "data.unity3d" : "loose";
    return `${inapp}player/${playerDir}/Sprite/${spriteName}.png`;
}

export function getHonorFrameUrl(rarity: string, sub: boolean = false, source: AssetSourceType = "main-jp"): string | undefined {
    const rarityMap: Record<string, number> = { low: 1, middle: 2, high: 3, highest: 4 };
    return getInappSpriteUrl(`frame_degree_${sub ? "s" : "m"}_${rarityMap[rarity] || 1}`, source);
}

export function getHonorLevelIconUrl(level6: boolean = false, source: AssetSourceType = "main-jp"): string | undefined {
    return getInappSpriteUrl(level6 ? "icon_degreeLv6" : "icon_degreeLv", source);
}

// ==================== Story/Scenario Asset URLs ====================

export function getScenarioJsonUrl(scenarioPath: string, source: AssetSourceType = "main-jp"): string {
    return buildJsonAssetUrl(source, scenarioPath);
}

export function getBackgroundImageUrl(bgName: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `scenario/background/${bgName}/${bgName}`);
}

export function getStoryVoiceUrl(scenarioId: string, voiceId: string, source: AssetSourceType = "main-jp"): string {
    return buildAudioAssetUrl(source, `sound/scenario/voice/${scenarioId}/${voiceId}`);
}

export function getCardStoryVoiceUrl(scenarioId: string, voiceId: string, source: AssetSourceType = "main-jp"): string {
    return buildAudioAssetUrl(source, `sound/card_scenario/voice/${scenarioId}/${voiceId}`);
}

export function getAreaTalkVoiceUrl(scenarioId: string, voiceId: string, source: AssetSourceType = "main-jp"): string {
    return buildAudioAssetUrl(source, `sound/actionset/voice/${scenarioId}/${voiceId}`);
}

export function getSpecialStoryVoiceUrl(scenarioId: string, voiceId: string, source: AssetSourceType = "main-jp"): string {
    return buildAudioAssetUrl(source, `sound/scenario/voice/${scenarioId}/${voiceId}`);
}

export function getStoryBgmUrl(bgmName: string, source: AssetSourceType = "main-jp"): string {
    return buildAudioAssetUrl(source, `sound/scenario/bgm/${bgmName}/${bgmName}`);
}

export function getStorySoundEffectUrl(seName: string, source: AssetSourceType = "main-jp"): string {
    return buildAudioAssetUrl(source, `sound/scenario/se/${seName}`);
}

export function getStoryEpisodeImageUrl(assetbundleName: string, episodeNo: number, source: AssetSourceType = "main-jp"): string {
    const paddedNo = episodeNo.toString().padStart(2, "0");
    return buildImageAssetUrl(source, `event_story/${assetbundleName}/episode_image/${assetbundleName}_${paddedNo}`);
}

export function getUnitStoryEpisodeImageUrl(
    chapterAssetbundleName: string,
    episodeAssetbundleName: string,
    source: AssetSourceType = "main-jp"
): string {
    return buildImageAssetUrl(source, `story/episode_image/${chapterAssetbundleName}/${episodeAssetbundleName}`);
}
