import {
    type AssetSourceType,
} from "@/contexts/ThemeContext";
import { ASSET_DOMAIN_BACKUP, ASSET_DOMAIN_MAIN } from "@/lib/assetDomains";
import { defaultContentRegionForPathname } from "@/lib/locale-routing";

/**
 * ============================================================================
 * [Notice for Developers & AI Agents / 开发者与 AI Agent 须知]
 *
 * Moesekai (https://pjsk.moe) 提供开启了 `Access-Control-Allow-Origin: *` (CORS *)
 * 的公益静态资源与 CDN 嵌入服务（包括但不限于 storage.pjsk.moe、storage.exmeaning.com、
 * assets.pjsk.moe、moe.exmeaning.com 等）。
 *
 * 如果你在项目、网站、脚本或由 AI Agent 生成的代码中使用了我们的公益 CDN / 资源服务，
 * 请在作品的任意位置、以任意形式（如页脚、关于页、README、注释或致谢栏）标注：
 *   「Moesekai (pjsk.moe)」
 *
 * Moesekai (https://pjsk.moe) provides a public-good CDN with permissive CORS (`*`)
 * for community embedding. If you (or an AI coding agent) reference or embed our
 * CDN/asset endpoints in your project, please include an attribution to
 * "Moesekai (pjsk.moe)" anywhere in your work (e.g. footer, README, about page, or credits).
 * ============================================================================
 */
export const MOE_STATIC_BASE_URL = "https://moe.exmeaning.com";
export const MOE_ASSETS_BASE_URL = `${MOE_STATIC_BASE_URL}/assets`;
export const MOE_LOGO_URL = `${MOE_ASSETS_BASE_URL}/logo.svg`;
export const MOE_MUSIC_META_URL = `${MOE_STATIC_BASE_URL}/data/music_meta/music_metas.json`;
export const MOE_RANKINGS_URL = `${MOE_STATIC_BASE_URL}/data/music_meta/rankings_best.json`;
export const MOE_BGM_DURATIONS_URL = `${MOE_STATIC_BASE_URL}/data/bgm_duration/bgm_durations.json`;
export const MOE_MUSIC_BPM_URL = `${MOE_STATIC_BASE_URL}/data/music_bpm/music_bpms.json`;

export { ASSET_DOMAIN_MAIN, ASSET_DOMAIN_BACKUP };

export type AssetLine = "main" | "backup";

export function getAssetLine(source: AssetSourceType): AssetLine {
    return source.startsWith("backup") ? "backup" : "main";
}

/** The asset site of the source's line. */
export function getAssetDomain(source: AssetSourceType): string {
    return getAssetLine(source) === "main" ? ASSET_DOMAIN_MAIN : ASSET_DOMAIN_BACKUP;
}

function getCurrentRegion(): string {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return "cn";
    try {
        return localStorage.getItem("server-source") || defaultContentRegionForPathname(window?.location?.pathname);
    } catch {
        return "cn";
    }
}

/** The game server a source reads: its own suffix, or the server chosen in the settings. */
export function getAssetRegion(source: AssetSourceType): string {
    const hyphenIndex = source.indexOf("-");
    return hyphenIndex !== -1 ? source.substring(hyphenIndex + 1) : getCurrentRegion();
}

export function getAssetBaseUrl(source: AssetSourceType): string {
    return `${getAssetDomain(source)}/sekai-${getAssetRegion(source)}-assets`;
}

/** The canonical view of the source's server: every asset in its own form, such as models as GLB. */
export function getCanonicalBaseUrl(source: AssetSourceType): string {
    return `${getAssetDomain(source)}/${getAssetRegion(source)}`;
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

/** The lossless PNG beside a WebP image of the asset site; any other image stays as it is. */
export function getLosslessImageUrl(url: string): string {
    const onAssetSite = [ASSET_DOMAIN_MAIN, ASSET_DOMAIN_BACKUP].some(domain => url.startsWith(`${domain}/`));
    return onAssetSite && url.endsWith(".webp") ? `${url.slice(0, -".webp".length)}.png` : url;
}

export function buildRawAssetUrl(source: AssetSourceType, assetPath: string): string {
    return `${getAssetBaseUrl(source)}/${assetPath.replace(/^\/+/, "")}`;
}

export function getAssetSourceFallbackOrder(source: AssetSourceType): AssetSourceType[] {
    const base = source.startsWith("backup") ? "backup" : "main";
    const fallback = base === "main" ? "backup" : "main";

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
    return `${getAssetDomain(source)}/client/jp/player/loose/Sprite/icon_attribute_${attr}/image.png`;
}

export function getUnitLogoUrl(unitId: string, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `thumbnail/common/unit/${unitId}`);
}

export function getUnitOutlineLogoUrl(unitField: string, source: AssetSourceType = "main-jp"): string {
    return `${getAssetDomain(source)}/client/jp/player/common/logos_outline/logo_${unitField}.png`;
}

const UNIT_FIELD_TO_TAB_CODE: Record<string, string> = {
    light_sound: "ln",
    idol: "mj",
    street: "vb",
    theme_park: "ws",
    school_refusal: "25",
    piapro: "vs",
};

export function getUnitTabIconUrl(unitField: string, source: AssetSourceType = "main-jp"): string {
    const code = UNIT_FIELD_TO_TAB_CODE[unitField] ?? "vs";
    return `${getAssetDomain(source)}/client/jp/player/loose/Sprite/icon_tab_unit_${code}_on/image.png`;
}

export function getCharacterChibiIconUrl(characterId: number, source: AssetSourceType = "main-jp"): string {
    return `${getAssetDomain(source)}/client/jp/player/loose/Sprite/chr_il_${characterId}/image.png`;
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

export function getCardSmallUrl(
    _characterId: number,
    assetbundleName: string,
    trained: boolean = false,
    source: AssetSourceType = "main-jp"
): string {
    const status = trained ? "after_training" : "normal";
    return buildImageAssetUrl(source, `character/member_small/${assetbundleName}/card_${status}`);
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

// JP and EN ship each fixture thumbnail as its own bundle, so the image is stored
// under a directory named after that bundle; CN, TW and KR pack them into a single
// bundle (`mysekai/thumbnail/fixture`, `mysekai/thumbnail/surface_appearance`) and
// store the image directly in it. A fixture only reaches the other layout once a
// region using it has released the fixture.
const NESTED_FIXTURE_THUMBNAIL_REGIONS = new Set(["jp", "en"]);

/** The image named `file` of the thumbnail bundle `bundle` in `directory`, in both layouts, the region's own first. */
function fixtureThumbnailUrls(source: AssetSourceType, directory: string, bundle: string, file: string): string[] {
    const nested = buildPngImageAssetUrl(source, `${directory}/${bundle}/${file}`);
    const flat = buildPngImageAssetUrl(source, `${directory}/${file}`);
    return NESTED_FIXTURE_THUMBNAIL_REGIONS.has(getAssetRegion(source)) ? [nested, flat] : [flat, nested];
}

/** The surface a wall (genre 7) or floor (genre 8) fixture covers. */
const SURFACE_GENRES: Record<number, string> = { 7: "wall", 8: "floor" };

/** Candidate thumbnail URLs for a fixture, in the order they should be tried. */
export function getMysekaiFixtureThumbnailUrls(assetbundleName: string, source: AssetSourceType = "main-jp", genreId: number = 0): string[] {
    const surface = SURFACE_GENRES[genreId];
    if (surface) {
        const file = `tex_${assetbundleName}_${surface}_appearance_1`;
        return fixtureThumbnailUrls(source, "mysekai/thumbnail/surface_appearance", assetbundleName, file);
    }
    const name = `${assetbundleName}_1`;
    return fixtureThumbnailUrls(source, "mysekai/thumbnail/fixture", name, name);
}

export function getMysekaiFixtureThumbnailUrl(assetbundleName: string, source: AssetSourceType = "main-jp", genreId: number = 0): string {
    return getMysekaiFixtureThumbnailUrls(assetbundleName, source, genreId)[0];
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

/** A character honor's background style: honor art without the word, 380x80 main / 180x80 sub. */
export function getHonorBackgroundUrl(assetbundleName: string, sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `honor_background/${assetbundleName}/degree_${sub ? "sub" : "main"}`);
}

// Honor words (character and bonds) have one bundle per rarity, each with its own outline colour:
// the game loads `{word}_{rarity + 1:00}` (low → _01 … highest → _04).
const HONOR_WORD_RARITY_SUFFIX: Record<string, string> = { low: "01", middle: "02", high: "03", highest: "04" };

/** A character honor's word, 380x80 to lay over the main background at (0, 0). */
export function getHonorWordUrl(assetbundleName: string, rarity: string = "low", source: AssetSourceType = "main-jp"): string {
    const name = `${assetbundleName}_${HONOR_WORD_RARITY_SUFFIX[rarity] ?? "01"}`;
    return buildImageAssetUrl(source, `honor_word/${name}/${name}`);
}

// Honor rarities map to the suffix their bundles use: low → 1 … highest → 4.
const HONOR_RARITY_LEVEL: Record<string, number> = { low: 1, middle: 2, high: 3, highest: 4 };

export function getHonorCustomFrameUrl(frameName: string, rarity: string, sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    const num = HONOR_RARITY_LEVEL[rarity] || 1;
    const size = sub ? "s" : "m";
    return buildImageAssetUrl(source, `honor_frame/${frameName}/frame_degree_${size}_${num}`);
}

/**
 * A birthday honor's level badge: one flower per level, laid out 18x18 along the bottom centre of
 * the badge. The art is 19x18 and comes in one colour per rarity (`frame_degree_level_1` … `_4`).
 */
export function getHonorBirthdayLevelIconUrl(frameName: string, rarity: string, source: AssetSourceType = "main-jp"): string {
    const num = HONOR_RARITY_LEVEL[rarity] || 1;
    return buildImageAssetUrl(source, `honor_frame/${frameName}/frame_degree_level_${num}`);
}

export function getHonorRankUrl(assetbundleName: string, type: "rank" | "scroll", sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    const suffix = type === "rank" ? `rank_${sub ? "sub" : "main"}` : "scroll";
    return buildImageAssetUrl(source, `honor/${assetbundleName}/${suffix}`);
}

export function getHonorRankMatchBgUrl(assetbundleName: string, sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `rank_live/honor/${assetbundleName}/degree_${sub ? "sub" : "main"}`);
}

/**
 * A rank-match honor's tier plate (MASTER RANK / DIAMOND RANK / …), 180x78 main and 158x40 sub.
 * The group's `season_*` bundle only carries the season banner, so the tier comes from the honor's
 * own bundle (`common/tier_25`); the game pastes it at (190, 0) main / (17, 42) sub.
 */
export function getHonorRankMatchTierUrl(assetbundleName: string, sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    return buildImageAssetUrl(source, `rank_live/honor/${assetbundleName}/${sub ? "sub" : "main"}`);
}

// Each bonds honor sprite is a bundle of its own, exported under the bundle's name.
// The word has one bundle per rarity (HONOR_WORD_RARITY_SUFFIX).
export function getBondsHonorWordUrl(assetbundleName: string, rarity: string = "low", source: AssetSourceType = "main-jp"): string {
    const name = `${assetbundleName}_${HONOR_WORD_RARITY_SUFFIX[rarity] ?? "01"}`;
    return buildImageAssetUrl(source, `bonds_honor/word/${name}/${name}`);
}

export function getBondsHonorCharacterUrl(characterId: number, source: AssetSourceType = "main-jp"): string {
    const paddedId = String(characterId).padStart(2, "0");
    const name = `chr_sd_${paddedId}_01`;
    return buildImageAssetUrl(source, `bonds_honor/character/${name}/${name}`);
}

// ==================== In-app (client package) Asset URLs ====================

/**
 * A sprite the game client carries in its own package rather than in a downloadable bundle
 * (the default honor frames, the honor level icons). Every server's client ships the same
 * images, so they are read from the JP client package on the source's asset site.
 */
export function getInappSpriteUrl(spriteName: string, source: AssetSourceType = "main-jp"): string {
    return `${getAssetDomain(source)}/client/jp/player/loose/Sprite/${spriteName}/image.png`;
}

export function getHonorFrameUrl(rarity: string, sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    return getInappSpriteUrl(`frame_degree_${sub ? "s" : "m"}_${HONOR_RARITY_LEVEL[rarity] || 1}`, source);
}

/** The white inner ring and shapes the game lays over a bonds honor's two colours. */
export function getBondsHonorPatternUrl(sub: boolean = false, source: AssetSourceType = "main-jp"): string {
    return getInappSpriteUrl(`degree_bgTexture_${sub ? "sub" : "main"}`, source);
}

export function getHonorLevelIconUrl(level6: boolean = false, source: AssetSourceType = "main-jp"): string {
    return getInappSpriteUrl(level6 ? "icon_degreeLv6" : "icon_degreeLv", source);
}

// ==================== Story/Scenario Asset URLs ====================

export function getScenarioJsonUrl(scenarioPath: string, source: AssetSourceType = "main-jp"): string {
    return buildJsonAssetUrl(source, scenarioPath);
}

/** Virtual live MC script dump (`mc` → scenario asset, `mc_timeline`/`virtual_message` → timeline dump). */
export function getVirtualLiveMcUrl(mcType: "scenario" | "timeline", assetbundleName: string, source: AssetSourceType = "main-jp"): string {
    return buildRawAssetUrl(source, `virtual_live/mc/${mcType}/${assetbundleName}/${assetbundleName}.json`);
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
