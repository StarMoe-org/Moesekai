import { type AssetSourceType, getAssetSourceRegion } from "@/contexts/ThemeContext";
import { buildRawAssetUrl, getAssetBaseUrl, getMysekaiRawAssetUrl, getStoryBgmUrl, getMusicVocalAudioUrl } from "@/lib/assets";

export const MYSEKAI_PREVIEW_STORAGE_KEY = "mysekai_scene_preview_options_v2";
export const LOCAL_TEST_LAYOUT_URL = "/data/mysekai-preview/testmysekai.json";

export function getMysekaiCandidateRawUrls(assetPath: string, source: AssetSourceType): string[] {
    if (/^https?:\/\//i.test(assetPath)) return [assetPath];
    return [getMysekaiRawAssetUrl(assetPath, source)];
}

export function getMysekaiMasterDataUrls(path: string, source: AssetSourceType): string[] {
    const region = getAssetSourceRegion(source);
    const normalizedPath = path.replace(/^\/+/, "");
    return [
        `https://metadata.pjsk.moe/${region}/master/${normalizedPath}`,
        `https://metadata.exmeaning.com/${region}/master/${normalizedPath}`,
    ];
}

function withoutMdlPrefix(assetName: string): string {
    return assetName.replace(/^mdl_/, "");
}

function customBaseUsesPreview(assetName: string): boolean {
    const shortName = withoutMdlPrefix(assetName);
    const customPart = shortName.match(/^cst\d+_custom_(.+)$/)?.[1] || "";
    return /^bottom\d+mount\d+$/.test(customPart) || /^collection\d+board\d+$/.test(customPart);
}

function customBasePreviewTexturePath(assetName: string, textureId: number): string {
    const shortName = withoutMdlPrefix(assetName);
    const customPart = shortName.match(/^cst\d+_custom_(.+)$/)?.[1] || "";
    const suffix = /^collection\d+board\d+$/.test(customPart) ? `_preview_${textureId}` : "_preview";
    return `fixture/${assetName}/tex_${shortName}${suffix}.webp`;
}

function customAttachTextureName(assetName: string): string {
    const shortName = withoutMdlPrefix(assetName);
    const match = shortName.match(/^(cst\d+)_([^_]+)_(.+)$/);
    if (!match) return shortName;
    const [, prefix, category, rest] = match;
    if (category === "attach") return `${prefix}_attach_common_${rest}`;
    if (category === "record") return `${prefix}_record_common_${rest}`;
    if (category === "title") return `${prefix}_title_${rest}_common`;
    return shortName;
}

function uniquePaths(paths: string[]): string[] {
    return Array.from(new Set(paths));
}

const NO_TEXTURE_FIXTURE_ASSETS = new Set([
    "mdl_non3001_block_cl1",
    "mdl_non3001_block_cl2",
]);

const NO_TEXTURE_CUSTOM_ATTACH_ASSETS = new Set([
    "mdl_cst0002_attach_acrylic1stage1",
    "mdl_cst0002_attach_acrylic1stand1",
    "mdl_cst0002_attach_logo1board1",
    "mdl_cst0002_attach_logo1stage1",
    "mdl_cst0002_attach_tapestry1board1",
    "mdl_cst0002_attach_ticketholder1stage1",
]);

const CUSTOM_ATTACH_MODEL_OBJECT_FILE_BY_ASSET: Record<string, string> = {
    mdl_cst0006_photo_type1stand1: "mdl_cst0006_photo_type1stand1.obj",
    mdl_viewer_photo_stand1small: "mdl_cst0006_photo_type1stand1.obj",
};

const CUSTOM_ATTACH_OBJECT_PATHS_BY_ASSET: Record<string, string[]> = {
    mdl_cst0002_attach_penlight1stage1: [
        "custom_fixture_attach/mdl_cst0002_attach_penlight1stage1/mdl_cst0002_attach_penlight1stage1.obj",
        "custom_fixture_attach/mdl_cst0002_attach_penlight1stand1/mdl_cst0002_attach_penlight1stand1.obj",
    ],
};

const CUSTOM_ATTACH_OBJECT_FILE_BY_ASSET: Record<string, string> = {
    mdl_viewer_canvas_board1large1: "mdl_cst0005_canvas_large1board1.obj",
    mdl_viewer_canvas_board1medium1: "mdl_cst0005_canvas_medium1board1.obj",
    mdl_viewer_canvas_board1small1: "mdl_cst0005_canvas_small1board1.obj",
    mdl_viewer_canvas_stand1large1: "mdl_cst0005_canvas_large1stand1.obj",
    mdl_viewer_canvas_stand1medium1: "mdl_cst0005_canvas_medium1stand1.obj",
    mdl_viewer_canvas_stand1small1: "mdl_cst0005_canvas_small1stand1.obj",
    mdl_viewer_custom_board: "mdl_cst0002_attach_badge1board1.obj",
    mdl_viewer_custom_stage: "mdl_cst0002_attach_badge1stage1.obj",
    mdl_viewer_title1_board: "mdl_cst0004_title_type1board1.obj",
    mdl_viewer_title1_stand: "mdl_cst0004_title_type1stand1.obj",
};

const CUSTOM_ATTACH_TEXTURE_FILES_BY_ASSET: Record<string, string[]> = {
    mdl_viewer_canvas_board1large1: ["tex_cst0005_canvas_main_large1board1_1", "tex_cst0005_canvas_common_large1board1_1"],
    mdl_viewer_canvas_board1medium1: ["tex_cst0005_canvas_main_medium1stand1_1", "tex_cst0005_canvas_common_medium1stand1_1"],
    mdl_viewer_canvas_board1small1: ["tex_cst0005_canvas_main_small1stand1_1", "tex_cst0005_canvas_common_small1stand1_1"],
    mdl_viewer_canvas_stand1large1: ["tex_cst0005_canvas_large1stand1_1", "tex_viewer_canvas_stand1large_main"],
    mdl_viewer_canvas_stand1medium1: ["tex_cst0005_canvas_medium1stand1_1", "tex_viewer_canvas_stand1medium_main"],
    mdl_viewer_canvas_stand1small1: ["tex_cst0005_canvas_small1stand1_1", "tex_viewer_canvas_stand1small_main"],
    mdl_viewer_custom_board: ["tex_attach_badge1_main", "tex_attach_badge1_common"],
    mdl_viewer_custom_stage: ["tex_attach_badge1_main", "tex_attach_badge1_common"],
    mdl_viewer_custom_stand: ["tex_attach_badge1_main", "tex_attach_badge1_common"],
    mdl_viewer_title1_board: ["tex_cst0004_title_main_type1board1_1", "tex_cst0004_title_type1board1_common_1"],
    mdl_viewer_title1_stand: ["tex_cst0004_title_main_type1stand1_1", "tex_cst0004_title_type1stand1_common_1"],
};

function isCanvasFixtureAsset(assetName: string): boolean {
    return assetName.startsWith("mdl_cst0005_canvas_");
}

function getFixtureAliasObjectFile(assetName: string): string | null {
    const chr103DollMatch = assetName.match(/^mdl_chr103_fixture_doll1(large|medium|small)$/);
    if (chr103DollMatch) return `mdl_chr103_fixture_ldoll1${chr103DollMatch[1]}.obj`;

    const crystalMatch = assetName.match(/^(mdl_crs\d+_fixture_crystal1)(medium|small)$/);
    if (crystalMatch) return `${crystalMatch[1]}large.obj`;

    if (assetName === "mdl_cst0001_custom_middle3mount1") return "mdl_cst0001_custom_top3mount1.obj";

    const triblockMatch = assetName.match(/^mdl_non3002_triblock_([a-z]+)([12])$/);
    if (triblockMatch && !["brick", "concre", "grain"].includes(triblockMatch[1])) {
        return `mdl_non3002_triblock_chip${triblockMatch[2]}.obj`;
    }

    const fanblockMatch = assetName.match(/^mdl_non3003_fanblock_([a-z]+)([12])$/);
    if (fanblockMatch && !["brick", "concre", "grain"].includes(fanblockMatch[1])) {
        return `mdl_non3003_fanblock_chip${fanblockMatch[2]}.obj`;
    }

    return null;
}

function customAttachTexturePath(assetName: string, fileName: string): string {
    return `custom_fixture_attach/${assetName}/${fileName}.webp`;
}

function customAttachKnownTextureIdPaths(assetName: string, baseName: string, textureId: number, validTextureIds: number[] = [1]): string[] {
    const ids = uniquePaths([String(textureId), "1"]).filter((id) => validTextureIds.includes(Number(id)));
    return ids.map((id) => customAttachTexturePath(assetName, `${baseName}_${id}`));
}

function getRootAssetCandidateUrls(assetPath: string, source: AssetSourceType): string[] {
    return [buildRawAssetUrl(source, assetPath)];
}

export function getFixtureObjectPaths(assetName: string, handleType?: string, fixtureType?: string): string[] {
    if (fixtureType === "canvas" || isCanvasFixtureAsset(assetName)) {
        return [`fixture/${assetName}/${assetName}.obj`];
    }
    if (handleType === "road" || /^mdl_non200[13]_road_/.test(assetName)) {
        return [`fixture/${assetName}/${assetName}.obj`];
    }
    if (handleType === "fence" || assetName.startsWith("mdl_non2002_fence_")) {
        return [`fixture/${assetName}/${assetName}.obj`];
    }
    if (assetName.startsWith("mdl_cst0001_custom_") && customBaseUsesPreview(assetName)) {
        return [`fixture/${assetName}/${assetName}.obj`];
    }
    const aliasObjectFile = getFixtureAliasObjectFile(assetName);
    if (aliasObjectFile) return [`fixture/${assetName}/${aliasObjectFile}`];
    return [`fixture/${assetName}/${assetName}.obj`];
}

export function getCustomFixtureAttachObjectPaths(assetName: string): string[] {
    const objectPaths = CUSTOM_ATTACH_OBJECT_PATHS_BY_ASSET[assetName];
    if (objectPaths) return objectPaths;
    const modelObjectFile = CUSTOM_ATTACH_MODEL_OBJECT_FILE_BY_ASSET[assetName];
    if (modelObjectFile) return [`custom_fixture_attach/${assetName}/${modelObjectFile}`];
    const objectFile = CUSTOM_ATTACH_OBJECT_FILE_BY_ASSET[assetName] || `${assetName}.obj`;
    return [`custom_fixture_attach/${assetName}/${objectFile}`];
}

export function getFixtureTexturePaths(assetName: string, textureId: number, handleType?: string): string[] {
    if (NO_TEXTURE_FIXTURE_ASSETS.has(assetName)) return [];
    const shortName = withoutMdlPrefix(assetName);
    if (assetName.startsWith("mdl_cst0001_custom_") && customBaseUsesPreview(assetName)) {
        const customPreviewPath = customBasePreviewTexturePath(assetName, textureId);
        return uniquePaths([
            customPreviewPath,
            textureId === 1 ? customPreviewPath : customBasePreviewTexturePath(assetName, 1),
        ]);
    }
    if (handleType === "idle_timeline" || /^mdl_clb1102_fixture_egg\d+$/.test(assetName)) {
        return uniquePaths([
            `fixture/${assetName}/tex_${shortName}_body_${textureId}.webp`,
            `fixture/${assetName}/tex_${shortName}_body_1.webp`,
        ]);
    }
    return uniquePaths([
        `fixture/${assetName}/tex_${shortName}_${textureId}.webp`,
        `fixture/${assetName}/tex_${shortName}_1.webp`,
    ]);
}

export function getCustomFixtureAttachTexturePaths(assetName: string, textureId: number): string[] {
    if (NO_TEXTURE_CUSTOM_ATTACH_ASSETS.has(assetName)) return [];

    const specialTextureFiles = CUSTOM_ATTACH_TEXTURE_FILES_BY_ASSET[assetName];
    if (specialTextureFiles) {
        return uniquePaths(specialTextureFiles.map((fileName) => customAttachTexturePath(assetName, fileName)));
    }

    if (assetName === "mdl_viewer_env0006_window_window1") {
        return uniquePaths([
            ...customAttachKnownTextureIdPaths(assetName, "tex_env0006_window_window1", textureId, [1, 2, 3]),
            ...customAttachKnownTextureIdPaths(assetName, "tex_env0006_window_window1_dep1", textureId, [1, 2, 3]),
        ]);
    }

    if (assetName === "mdl_cst0006_photo_type1stand1" || assetName === "mdl_viewer_photo_stand1small") {
        return uniquePaths([
            ...customAttachKnownTextureIdPaths(assetName, "tex_cst0006_photo_type1stand1", textureId),
            ...customAttachKnownTextureIdPaths(assetName, "tex_cst0006_photo_main_type1stand1", textureId),
        ]);
    }

    if (assetName === "mdl_viewer_viewer_record1_board") {
        return uniquePaths([
            ...customAttachKnownTextureIdPaths(assetName, "tex_cst0003_record_common_type1board1", textureId),
            customAttachTexturePath(assetName, "jacket_customdefault_s"),
        ]);
    }

    if (assetName === "mdl_cst0002_attach_penlight1stage1") {
        return uniquePaths([
            ...customAttachKnownTextureIdPaths(assetName, "tex_cst0002_attach_common_penlight1stage1", textureId),
            ...customAttachKnownTextureIdPaths("mdl_cst0002_attach_penlight1stand1", "tex_cst0002_attach_common_penlight1stand1", textureId),
        ]);
    }

    const textureName = customAttachTextureName(assetName);
    const paths = customAttachKnownTextureIdPaths(assetName, `tex_${textureName}`, textureId);
    if (assetName.startsWith("mdl_cst0003_record_")) {
        paths.push(customAttachTexturePath(assetName, "jacket_customdefault_s"));
    }
    return uniquePaths(paths);
}

function buildRoomSkinUvsetTexturePaths(assetName: string, textureId: number, prefix: "floor_floor1" | "wall_wall1"): string[] {
    const out: string[] = [];
    for (const texId of uniquePaths([String(textureId), "1"])) {
        for (let uv = 1; uv <= 4; uv++) {
            out.push(`site/field/my_room_asset/skin/${assetName}/tex_${assetName}_${prefix}_uvset${uv}_${texId}.webp`);
        }
    }
    return uniquePaths(out);
}

export function getRoomSkinFloorTexturePaths(assetName: string, textureId: number): string[] {
    return buildRoomSkinUvsetTexturePaths(assetName, textureId, "floor_floor1");
}

export function getRoomSkinWallTexturePaths(assetName: string, textureId: number): string[] {
    return buildRoomSkinUvsetTexturePaths(assetName, textureId, "wall_wall1");
}

export function getRoomSkinDoorTexturePaths(assetName: string, textureId: number): string[] {
    return uniquePaths([
        `site/field/my_room_asset/skin/${assetName}/tex_${assetName}_door_door1_${textureId}.webp`,
        `site/field/my_room_asset/skin/${assetName}/tex_${assetName}_door_door1_1.webp`,
    ]);
}

export function getRoomSkinDoorObjectPaths(assetName: string): string[] {
    return uniquePaths([
        `site/field/my_room_asset/skin/${assetName}/mdl_${assetName}_door_door1.obj`,
        `site/field/my_room_asset/skin/${assetName}/${assetName}_door_door1.obj`,
    ]);
}

export function getOutdoorGrassTexturePath(): string {
    return "site/field/grasslands/tex_site_base_grasslands_grass01.webp";
}

export function getMysekaiCanvasCardTextureUrls(assetbundleName: string, trained: boolean, fixtureId: number, source: AssetSourceType): string[] {
    const status = trained ? "after_training" : "normal";
    const path = fixtureId === 439 || fixtureId === 442
        ? `thumbnail/chara/${assetbundleName}_${status}.webp`
        : fixtureId === 441 || fixtureId === 444
            ? `character/member_small/${assetbundleName}/card_${status}.webp`
            : `character/member_cutout/${assetbundleName}/${status}.webp`;
    return getRootAssetCandidateUrls(path, source);
}

export function getMusicJacketTexturePaths(assetbundleName: string, source: AssetSourceType): string[] {
    return uniquePaths([
        ...getRootAssetCandidateUrls(`thumbnail/music_jacket/${assetbundleName}.webp`, source),
        ...getRootAssetCandidateUrls(`music/jacket/${assetbundleName}/${assetbundleName}.webp`, source),
    ]);
}

export function getMysekaiMusicVocalAudioUrl(assetbundleName: string, source: AssetSourceType): string {
    return getMusicVocalAudioUrl(assetbundleName, source);
}

export function getMysekaiSoundTrackAudioUrl(assetbundleName: string | undefined, assetbundleFileName: string | undefined, source: AssetSourceType): string | null {
    const fileName = String(assetbundleFileName || assetbundleName?.split("/").pop() || "").trim();
    if (!fileName) return null;
    const normalizedAssetPath = String(assetbundleName || "").replace(/^\/+/, "");
    if (normalizedAssetPath.startsWith("mysekai/")) {
        const dir = normalizedAssetPath.replace(/\/+$/, "");
        return `${getAssetBaseUrl(source)}/${dir}/${fileName}.mp3`;
    }
    const dir = normalizedAssetPath.replace(/\/+$/, "");
    if (dir.startsWith("sound/scenario/bgm/") && dir.split("/").pop() !== fileName) {
        return `${getAssetBaseUrl(source)}/${dir}/${fileName}.mp3`;
    }
    return getStoryBgmUrl(fileName, source);
}
