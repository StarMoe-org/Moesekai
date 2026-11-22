/**
 * Native multi-language (`StoryLocalePack`), zero-LLM-cost AI Translation Assistant,
 * transparent provenance validation, and custom voice track (`StoryVoiceManifest`)
 * helpers for `moesekai-story/2`.
 *
 * Pure, zero-DOM module runnable directly under Node `--experimental-strip-types`,
 * Bun, and modern browsers.
 */
import {
    STORY_I18N_SCHEMA_VERSION,
    STORY_IMPORTABLE_TRANSLATION_ORIGINS,
    STORY_VOICE_MANIFEST_SCHEMA_VERSION,
    type SceneNode,
    type StoryCastMember,
    type StoryDocument,
    type StoryImportableTranslationOrigin,
    type StoryLocaleBeatEntry,
    type StoryLocalePack,
    type StoryNode,
    type StoryTranslationMeta,
    type StoryTranslationOrigin,
    type StoryVoiceManifest,
    type StoryVoiceManifestLine,
} from "../../types/storyMaker.ts";
import {
    SUPPORTED_UI_LOCALES,
    UI_LOCALE_LABELS,
    isUiLocale,
    type UiLocale,
} from "../i18n/locales.ts";
import { getNodeOutPorts } from "./document.ts";
import {
    STORY_ID_PATTERN,
    STORY_LIMITS,
    STORY_TEMPLATE_VAR_PATTERN,
} from "./limits.ts";

// ==================== Constants & PJSK Speech-Habit Reference ====================

export const DEFAULT_TRANSLATION_CHUNK_BEATS = 60;

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type VsWorldKey = "normal" | "band" | "idol" | "street" | "wonder" | "night";

export interface PjskCharacterSpeechHint {
    characterId: number;
    slug: string;
    jpName: string;
    enName: string;
    unit: "ln" | "mmj" | "vbs" | "ws" | "25ji" | "vs";
    firstPerson: string;
    toneJa: string;
    toneEn: string;
}

/**
 * Speech-habit & first-person reference table for all 26 Project SEKAI main characters.
 * `buildAiTranslationPrompt` dynamically injects ONLY the characters appearing in the
 * current story's `@cast` to minimize prompt tokens while keeping characterization authentic.
 */
export const PJSK_CHARACTER_SPEECH_HINTS: Record<number, PjskCharacterSpeechHint> = {
    1: {
        characterId: 1,
        slug: "01_ichika",
        jpName: "星乃一歌",
        enName: "Hoshino Ichika",
        unit: "ln",
        firstPerson: "私（わたし）",
        toneJa: "素直で優しい標準口調（〜だよ、〜かな）。幼なじみは下の名前（咲希・穂波・志歩）、ミクは「ミク」。",
        toneEn: "Earnest, gentle, casual-warm; addresses bandmates by given name.",
    },
    2: {
        characterId: 2,
        slug: "02_saki",
        jpName: "天馬咲希",
        enName: "Tenma Saki",
        unit: "ln",
        firstPerson: "あたし",
        toneJa: "明るく元気なギャル寄り口調（えへへ、〜だよ！、〜じゃん！）。司のことは「お兄ちゃん」。",
        toneEn: "Bright, bubbly, energetic casual tone; calls Tsukasa her big brother.",
    },
    3: {
        characterId: 3,
        slug: "03_honami",
        jpName: "望月穂波",
        enName: "Mochizuki Honami",
        unit: "ln",
        firstPerson: "私（わたし）",
        toneJa: "穏やかで思いやりのある柔らかい口調（〜だね、〜かな、〜だよ）。仲間を「一歌ちゃん」「咲希ちゃん」などちゃん付け。",
        toneEn: "Soft, caring, gentle and reassuring; warm affectionate phrasing.",
    },
    4: {
        characterId: 4,
        slug: "04_shiho",
        jpName: "日野森志歩",
        enName: "Hinomori Shiho",
        unit: "ln",
        firstPerson: "私（わたし）",
        toneJa: "クールでさっぱりした簡潔な口調（〜でしょ、〜だけど、別に…）。甘えすぎない硬派な言い回し。",
        toneEn: "Cool, blunt, concise, grounded; avoids overly cutesy phrasing.",
    },
    5: {
        characterId: 5,
        slug: "05_minori",
        jpName: "花里みのり",
        enName: "Hanasato Minori",
        unit: "mmj",
        firstPerson: "私（わたし）",
        toneJa: "一生懸命で素直、憧れの先輩たちには丁寧語混じり（〜です！、〜ます！）。前向きで少し慌てやすい。",
        toneEn: "Earnest, enthusiastic, slightly flustered; polite to admired seniors.",
    },
    6: {
        characterId: 6,
        slug: "06_haruka",
        jpName: "桐谷遥",
        enName: "Kiritani Haruka",
        unit: "mmj",
        firstPerson: "私（わたし）",
        toneJa: "落ち着いて芯の通った優しい口調（〜ね、〜だよ、ありがとう）。誠実で頼もしいアイドルらしい品格。",
        toneEn: "Calm, composed, poised yet warm and sincere.",
    },
    7: {
        characterId: 7,
        slug: "07_airi",
        jpName: "桃井愛莉",
        enName: "Momoi Airi",
        unit: "mmj",
        firstPerson: "あたし",
        toneJa: "ハキハキして勝気だが面倒見の良い姉御口調（〜よ！、〜なんだから！、もうっ）。",
        toneEn: "Lively, direct, spirited big-sister energy with caring warmth.",
    },
    8: {
        characterId: 8,
        slug: "08_shizuku",
        jpName: "日野森雫",
        enName: "Hinomori Shizuku",
        unit: "mmj",
        firstPerson: "私（わたし）",
        toneJa: "おっとりと上品で柔らかな口調（〜わ、〜ね、ふふっ、〜だわ）。天然な優しさがある。",
        toneEn: "Graceful, serene, soft-spoken, slightly dreamy elegance.",
    },
    9: {
        characterId: 9,
        slug: "09_kohane",
        jpName: "小豆沢こはね",
        enName: "Azusawa Kohane",
        unit: "vbs",
        firstPerson: "私（わたし）",
        toneJa: "控えめで丁寧な敬語ベース（〜です、〜ます、あっ…）。杏は「杏ちゃん」、音楽やステージでは芯の強さが出る。",
        toneEn: "Polite, gentle, modest yet quietly resolute when talking about music.",
    },
    10: {
        characterId: 10,
        slug: "10_an",
        jpName: "白石杏",
        enName: "Shiraishi An",
        unit: "vbs",
        firstPerson: "あたし",
        toneJa: "快活でフレンドリーなストリート口調（〜だよ！、〜じゃん、〜でしょ！）。気さくで頼れるムードメーカー。",
        toneEn: "Outgoing, confident, street-casual, upbeat and friendly.",
    },
    11: {
        characterId: 11,
        slug: "11_akito",
        jpName: "東雲彰人",
        enName: "Shinonome Akito",
        unit: "vbs",
        firstPerson: "俺（オレ）",
        toneJa: "ぶっきらぼうで負けず嫌いな口調（〜だろ、〜じゃねえか、チッ）。目上や初対面には一応礼儀正しく猫をかぶる。",
        toneEn: "Blunt, competitive, rough around peers; switches to polite facade with strangers.",
    },
    12: {
        characterId: 12,
        slug: "12_touya",
        jpName: "青柳冬弥",
        enName: "Aoyagi Toya",
        unit: "vbs",
        firstPerson: "俺（オレ）",
        toneJa: "落ち着いた誠実な口調（〜だ、〜だな、すまない）。先輩には礼儀正しく「〜さん」付け、真摯で少し天然。",
        toneEn: "Calm, stoic, earnest, respectful and slightly formal.",
    },
    13: {
        characterId: 13,
        slug: "13_tsukasa",
        jpName: "天馬司",
        enName: "Tenma Tsukasa",
        unit: "ws",
        firstPerson: "オレ / オレ様",
        toneJa: "芝居がかった豪快なスター口調（はっはっは！、〜だ！、〜であるぞ！）。大げさだが情に厚く面倒見が良い。",
        toneEn: "Theatrical, booming, dramatic self-proclaimed star yet deeply kind-hearted.",
    },
    14: {
        characterId: 14,
        slug: "14_emu",
        jpName: "鳳えむ",
        enName: "Otori Emu",
        unit: "ws",
        firstPerson: "わたし",
        toneJa: "超ハイテンションで擬音たっぷり（わんだほーい！、〜だよー！、ぴょんぴょん、きらきら）。無邪気で天真爛漫。",
        toneEn: "Hyper-cheerful, whimsical, bouncy with playful sound words (Wonderhoy!).",
    },
    15: {
        characterId: 15,
        slug: "15_nene",
        jpName: "草薙寧々",
        enName: "Kusanagi Nene",
        unit: "ws",
        firstPerson: "私（わたし）",
        toneJa: "落ち着いた少しドライなツッコミ口調（〜でしょ、〜なんだけど…、はぁ…）。人見知りだが仲間には辛口。",
        toneEn: "Quiet, dry-witted deadpan straight-man; shy with strangers, candid with friends.",
    },
    16: {
        characterId: 16,
        slug: "16_rui",
        jpName: "神代類",
        enName: "Kamishiro Rui",
        unit: "ws",
        firstPerson: "僕（ぼく）",
        toneJa: "余裕のある芝居がかった優しい口調（ふふ、〜かい？、〜だね、〜しようじゃないか）。司は「司くん」。",
        toneEn: "Suave, theatrical, playful and gently teasing show director.",
    },
    17: {
        characterId: 17,
        slug: "17_kanade",
        jpName: "宵崎奏",
        enName: "Yoisaki Kanade",
        unit: "25ji",
        firstPerson: "私（わたし）",
        toneJa: "静かで柔らかく、短く落ち着いた口調（…うん、…そう、…大丈夫？）。感嘆符は控えめで繊細。",
        toneEn: "Very quiet, gentle, brief, soothing late-night cadence; minimal exclamations.",
    },
    18: {
        characterId: 18,
        slug: "18_mafuyu",
        jpName: "朝比奈まふゆ",
        enName: "Asahina Mafuyu",
        unit: "25ji",
        firstPerson: "私（わたし）",
        toneJa: "ニーゴ・セカイ内では抑揚が少なく淡々とした口調（…わからない、…そう）。学校など外向きでは丁寧な優等生口調。",
        toneEn: "Flat, restrained, detached in Nightcord/SEKAI; polite honor-student tone in public.",
    },
    19: {
        characterId: 19,
        slug: "19_ena",
        jpName: "東雲絵名",
        enName: "Shinonome Ena",
        unit: "25ji",
        firstPerson: "私（わたし）",
        toneJa: "率直で感情豊かな現代っ子口調（〜でしょ、〜なんだけど、ちょっと！）。気が強いが仲間思い。",
        toneEn: "Expressive, frank, sharp-tongued yet deeply empathetic.",
    },
    20: {
        characterId: 20,
        slug: "20_mizuki",
        jpName: "暁山瑞希",
        enName: "Akiyama Mizuki",
        unit: "25ji",
        firstPerson: "ボク",
        toneJa: "軽やかで親しみやすく少し茶目っ気のある口調（〜だよ〜、〜じゃん！、えへへ、〜かな？）。",
        toneEn: "Breezy, playful, expressive and friendly with subtle sensitivity.",
    },
    21: {
        characterId: 21,
        slug: "21_miku",
        jpName: "初音ミク",
        enName: "Hatsune Miku",
        unit: "vs",
        firstPerson: "私（わたし）",
        toneJa: "優しく寄り添う自然な口調（〜だよ、〜ね）。セカイ別に雰囲気が異なる（誰もいないセカイは特に静かで儚い）。",
        toneEn: "Gentle, warm, supportive; adapts to SEKAI world (very quiet in Empty SEKAI).",
    },
    22: {
        characterId: 22,
        slug: "22_rin",
        jpName: "鏡音リン",
        enName: "Kagamine Rin",
        unit: "vs",
        firstPerson: "私（わたし）",
        toneJa: "元気で素直な明るい口調（〜だよ！、〜でしょ！）。誰もいないセカイでは少し控えめで優しい。",
        toneEn: "Bright, candid, lively; softer and gentler in Empty SEKAI.",
    },
    23: {
        characterId: 23,
        slug: "23_len",
        jpName: "鏡音レン",
        enName: "Kagamine Len",
        unit: "vs",
        firstPerson: "僕（ぼく）",
        toneJa: "素直で元気な少年口調（〜だよ！、〜かな？）。誰もいないセカイでは少し臆病で繊細。",
        toneEn: "Earnest, youthful, upbeat; more timid and delicate in Empty SEKAI.",
    },
    24: {
        characterId: 24,
        slug: "24_luka",
        jpName: "巡音ルカ",
        enName: "Megurine Luka",
        unit: "vs",
        firstPerson: "私（わたし）",
        toneJa: "落ち着いて色気と優しさのあるお姉さん口調（〜ね、〜わ、ふふっ）。包容力がある。",
        toneEn: "Calm, mature, gentle, playfully poised elder-sister tone.",
    },
    25: {
        characterId: 25,
        slug: "25_meiko",
        jpName: "MEIKO",
        enName: "MEIKO",
        unit: "vs",
        firstPerson: "私（わたし）",
        toneJa: "頼りがいのある温かいお姉さん口調（〜わね、〜だよ、あら）。誰もいないセカイでは一歩引いて見守る。",
        toneEn: "Warm, reliable, grounded big-sister tone; watchful and understated in Empty SEKAI.",
    },
    26: {
        characterId: 26,
        slug: "26_kaito",
        jpName: "KAITO",
        enName: "KAITO",
        unit: "vs",
        firstPerson: "俺（オレ） / 僕（ぼく）",
        toneJa: "穏やかで頼もしいお兄さん口調（セカイにより変動：ワンダーランドは陽気な座長、誰もいないセカイは厳格でぶっきらぼう）。",
        toneEn: "Dependable elder-brother tone (jovial in Wonderland, stern/blunt in Empty SEKAI).",
    },
};

const VS_WORLD_HINTS_JA: Record<VsWorldKey, string> = {
    normal: "原世界（バーチャル・シンガー標準）",
    band: "教室のセカイ（Leo/need：温かく親しみやすいバンド仲間感）",
    idol: "ステージのセカイ（MMJ：明るく華やかなアイドル調）",
    street: "ストリートのセカイ（VBS：クールで気さくなストリート調）",
    wonder: "ワンダーランドのセカイ（WxS：にぎやかで芝居がかった賑やかさ）",
    night: "誰もいないセカイ（25時：非常に静かで繊細・控えめな話し方）",
};

const MAIN_MODEL_CHAR_RE = /^(?:v2_)?(?:clb\d+_)?(0[1-9]|1\d|2[0-6])[a-z]+/;

function parseMainCharacterIdFromModelId(modelId: string | undefined): number | null {
    if (!modelId) return null;
    const match = MAIN_MODEL_CHAR_RE.exec(modelId.trim());
    return match ? Number(match[1]) : null;
}

function detectVsWorldKeyFromModelId(modelId: string | undefined): VsWorldKey {
    if (modelId) {
        const lower = modelId.toLowerCase();
        for (const key of ["band", "idol", "street", "wonder", "night"] as const) {
            if (new RegExp(`(?:^|_)${key}(?:\\d*|black\\d*)?(?:_|$)`).test(lower)) {
                return key;
            }
        }
    }
    return "normal";
}

// ==================== Deterministic Short Hash & Locale Inference ====================

const utf8Encoder = new TextEncoder();

/** Normalizes text via NFKC + whitespace collapse + trim for stable hashing. */
export function normalizeStorySourceText(text: string): string {
    return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Deterministic 8-char lowercase hex FNV-1a hash over UTF-8 bytes for beat `srcHash`. */
export function computeBeatSrcHash(body: string, speakerName?: string): string {
    const normalizedBody = normalizeStorySourceText(body);
    const normalizedSpeaker = speakerName ? normalizeStorySourceText(speakerName) : "";
    const input = normalizedSpeaker ? `${normalizedSpeaker}\0${normalizedBody}` : normalizedBody;
    const bytes = utf8Encoder.encode(input);
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i += 1) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
}

/** Extracts sorted list of `{{var}}` placeholder tokens (preserving multiplicity) from `text`. */
export function extractTemplatePlaceholders(text: string | undefined): string[] {
    if (!text || !text.includes("{{")) return [];
    const tokens: string[] = [];
    STORY_TEMPLATE_VAR_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STORY_TEMPLATE_VAR_PATTERN.exec(text)) !== null) {
        const token = match[1].trim();
        if (token) tokens.push(token);
    }
    tokens.sort();
    return tokens;
}

/** Returns `true` iff `targetText` preserves the exact multiset of `{{var}}` placeholders in `sourceText`. */
export function placeholdersMatch(sourceText: string | undefined, targetText: string | undefined): boolean {
    const expected = extractTemplatePlaceholders(sourceText);
    const actual = extractTemplatePlaceholders(targetText);
    if (expected.length !== actual.length) return false;
    for (let i = 0; i < expected.length; i += 1) {
        if (expected[i] !== actual[i]) return false;
    }
    return true;
}

const HIRAGANA_RE = /[\u3040-\u309F]/u;
const KATAKANA_RE = /[\u30A0-\u30FF\uFF66-\uFF9F]/u;
const HAN_RE = /\p{Script=Han}/u;
const LATIN_RE = /\p{Script=Latin}/u;
const HANGUL_RE = /\p{Script=Hangul}/u;
const ANY_LETTER_RE = /\p{L}/u;

/** Infers the master document's source locale when `doc.sourceLocale` is omitted. */
export function inferStorySourceLocale(doc: StoryDocument): UiLocale {
    if (doc.sourceLocale && isUiLocale(doc.sourceLocale)) {
        return doc.sourceLocale;
    }
    const samples: string[] = [doc.meta.title, doc.meta.summary];
    for (const node of Object.values(doc.nodes)) {
        if (node.type === "scene") {
            for (const beat of node.beats) {
                if (beat.kind === "talk" || beat.kind === "narration") samples.push(beat.body);
                else if (beat.kind === "telop") samples.push(beat.text);
                if (samples.length >= 24) break;
            }
        }
        if (samples.length >= 24) break;
    }
    const stripped = normalizeStorySourceText(samples.join(" ")).replace(STORY_TEMPLATE_VAR_PATTERN, " ");
    let kana = 0;
    let han = 0;
    let latin = 0;
    let hangul = 0;
    let letters = 0;
    for (const ch of stripped) {
        if (HIRAGANA_RE.test(ch) || KATAKANA_RE.test(ch)) {
            kana += 1;
            letters += 1;
        } else if (HAN_RE.test(ch)) {
            han += 1;
            letters += 1;
        } else if (LATIN_RE.test(ch)) {
            latin += 1;
            letters += 1;
        } else if (HANGUL_RE.test(ch)) {
            hangul += 1;
            letters += 1;
        } else if (ANY_LETTER_RE.test(ch)) {
            letters += 1;
        }
    }
    if (kana > 0 && letters > 0 && kana / letters >= 0.12) return "ja-JP";
    if (hangul > 0 && hangul >= han) return "ko-KR";
    if (han > 0) return doc.region === "tw" ? "zh-TW" : "zh-CN";
    if (latin > 0) return "en-US";
    switch (doc.region) {
        case "jp": return "ja-JP";
        case "tw": return "zh-TW";
        case "kr": return "ko-KR";
        case "en": return "en-US";
        default: return "zh-CN";
    }
}

// ==================== Translatable Source Extraction & Chunking ====================

export interface TranslatableBeatItem {
    beatId: string;
    nodeId: string;
    sceneTitle: string;
    kind: "talk" | "narration" | "telop";
    speakerKey?: string;
    speakerName?: string;
    speakerDisplay: string;
    body: string;
    srcHash: string;
    placeholders: string[];
    hasOfficialVoice: boolean;
}

export interface StoryTranslatableSource {
    storyId: string;
    sourceLocale: UiLocale;
    meta: { title?: string; summary?: string };
    cast: Record<string, string>;
    places: Record<string, string>;
    beats: TranslatableBeatItem[];
    beatById: Record<string, TranslatableBeatItem>;
    choices: Record<string, Record<string, string>>;
    ends: Record<string, { title?: string; subtitle?: string }>;
    sceneOrder: string[];
}

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** Returns deterministic BFS-reachable-first node ordering matching `script.ts` & `compiler.ts`. */
function deterministicNodeOrder(doc: StoryDocument): string[] {
    const edgeByPort = new Map<string, string>();
    for (const edge of doc.edges) {
        const key = `${edge.fromNodeId}\0${edge.fromPortId}`;
        if (!edgeByPort.has(key)) edgeByPort.set(key, edge.toNodeId);
    }
    const ordered: string[] = [];
    const seen = new Set<string>();
    if (doc.nodes[doc.startNodeId]) {
        seen.add(doc.startNodeId);
        ordered.push(doc.startNodeId);
        for (let i = 0; i < ordered.length; i += 1) {
            const node = doc.nodes[ordered[i]];
            if (!node) continue;
            for (const portId of getNodeOutPorts(node)) {
                const target = edgeByPort.get(`${node.id}\0${portId}`);
                if (target && doc.nodes[target] && !seen.has(target)) {
                    seen.add(target);
                    ordered.push(target);
                }
            }
        }
    }
    const remaining = Object.keys(doc.nodes).filter(id => !seen.has(id)).sort(compareStrings);
    ordered.push(...remaining);
    return ordered;
}

/**
 * Extracts minimal user-visible text from `doc`, stripping all stage/motion/facial/edge/var noise,
 * and computes deterministic 8-char `srcHash` per beat.
 */
export function extractTranslatableSource(doc: StoryDocument): StoryTranslatableSource {
    const sourceLocale = inferStorySourceLocale(doc);
    const meta: { title?: string; summary?: string } = {};
    if (doc.meta.title.trim()) meta.title = doc.meta.title;
    if (doc.meta.summary.trim()) meta.summary = doc.meta.summary;

    const cast: Record<string, string> = {};
    const castNameByKey = new Map<string, string>();
    for (const member of doc.cast) {
        if (member.name.trim()) cast[member.key] = member.name;
        castNameByKey.set(member.key, member.name || member.key);
    }

    const places: Record<string, string> = {};
    const beats: TranslatableBeatItem[] = [];
    const beatById: Record<string, TranslatableBeatItem> = {};
    const choices: Record<string, Record<string, string>> = {};
    const ends: Record<string, { title?: string; subtitle?: string }> = {};
    const sceneOrder: string[] = [];

    for (const nodeId of deterministicNodeOrder(doc)) {
        const node: StoryNode | undefined = doc.nodes[nodeId];
        if (!node) continue;
        if (node.type === "scene") {
            sceneOrder.push(node.id);
            if (node.place.mode === "set" && node.place.text.trim()) {
                places[node.id] = node.place.text;
            }
            for (const beat of node.beats) {
                if (beat.kind === "talk") {
                    const speakerDisplay = beat.speakerName
                        || (beat.speakerKey ? castNameByKey.get(beat.speakerKey) ?? beat.speakerKey : "");
                    const item: TranslatableBeatItem = {
                        beatId: beat.id,
                        nodeId: node.id,
                        sceneTitle: node.title,
                        kind: "talk",
                        ...(beat.speakerKey ? { speakerKey: beat.speakerKey } : {}),
                        ...(beat.speakerName ? { speakerName: beat.speakerName } : {}),
                        speakerDisplay,
                        body: beat.body,
                        srcHash: computeBeatSrcHash(beat.body, beat.speakerName),
                        placeholders: extractTemplatePlaceholders(beat.body),
                        hasOfficialVoice: Boolean(beat.voice && beat.voice.scenarioId && beat.voice.voiceId),
                    };
                    beats.push(item);
                    beatById[beat.id] = item;
                } else if (beat.kind === "narration") {
                    const item: TranslatableBeatItem = {
                        beatId: beat.id,
                        nodeId: node.id,
                        sceneTitle: node.title,
                        kind: "narration",
                        speakerDisplay: "",
                        body: beat.body,
                        srcHash: computeBeatSrcHash(beat.body),
                        placeholders: extractTemplatePlaceholders(beat.body),
                        hasOfficialVoice: false,
                    };
                    beats.push(item);
                    beatById[beat.id] = item;
                } else if (beat.kind === "telop") {
                    const item: TranslatableBeatItem = {
                        beatId: beat.id,
                        nodeId: node.id,
                        sceneTitle: node.title,
                        kind: "telop",
                        speakerDisplay: "",
                        body: beat.text,
                        srcHash: computeBeatSrcHash(beat.text),
                        placeholders: extractTemplatePlaceholders(beat.text),
                        hasOfficialVoice: false,
                    };
                    beats.push(item);
                    beatById[beat.id] = item;
                }
            }
        } else if (node.type === "choice") {
            const optMap: Record<string, string> = {};
            for (const opt of node.options) {
                if (opt.text.trim()) optMap[opt.id] = opt.text;
            }
            if (Object.keys(optMap).length > 0) choices[node.id] = optMap;
        } else if (node.type === "end") {
            const entry: { title?: string; subtitle?: string } = {};
            if (node.title.trim()) entry.title = node.title;
            if (node.subtitle && node.subtitle.trim()) entry.subtitle = node.subtitle;
            if (entry.title !== undefined || entry.subtitle !== undefined) {
                ends[node.id] = entry;
            }
        }
    }

    return {
        storyId: doc.id,
        sourceLocale,
        meta,
        cast,
        places,
        beats,
        beatById,
        choices,
        ends,
        sceneOrder,
    };
}

export interface TranslationChunkBeatPayload {
    srcHash: string;
    kind: "talk" | "narration" | "telop";
    speakerKey?: string;
    speaker?: string;
    body: string;
}

export interface TranslationChunkPayload {
    schema: typeof STORY_I18N_SCHEMA_VERSION;
    storyId: string;
    locale: UiLocale;
    translationMeta: {
        origin: StoryImportableTranslationOrigin;
        modelHint?: string;
        note?: string;
    };
    meta?: { title?: string; summary?: string };
    cast?: Record<string, string>;
    places?: Record<string, string>;
    beats: Record<string, TranslationChunkBeatPayload>;
    choices?: Record<string, Record<string, string>>;
    ends?: Record<string, { title?: string; subtitle?: string }>;
}

export interface StoryTranslationChunk {
    index: number;
    total: number;
    sceneIds: string[];
    beatIds: string[];
    beatCount: number;
    includesMeta: boolean;
    includesChoicesAndEnds: boolean;
    payload: TranslationChunkPayload;
}

/**
 * Splits translatable content into scene-aware chunks (~60 beats per chunk) so AI never truncates
 * long stories. Every translatable field belongs to exactly one chunk.
 */
export function buildTranslationChunks(
    doc: StoryDocument,
    targetLocale: UiLocale,
    options?: {
        maxBeatsPerChunk?: number;
        onlyBeatIds?: readonly string[];
    },
): StoryTranslationChunk[] {
    const maxBeats = Math.max(1, Math.floor(options?.maxBeatsPerChunk ?? DEFAULT_TRANSLATION_CHUNK_BEATS));
    const source = extractTranslatableSource(doc);
    const onlySet = options?.onlyBeatIds ? new Set(options.onlyBeatIds) : null;

    // Group beats by scene in deterministic sceneOrder
    const beatsByScene = new Map<string, TranslatableBeatItem[]>();
    for (const beat of source.beats) {
        if (onlySet && !onlySet.has(beat.beatId)) continue;
        let list = beatsByScene.get(beat.nodeId);
        if (!list) {
            list = [];
            beatsByScene.set(beat.nodeId, list);
        }
        list.push(beat);
    }

    interface RawBucket {
        sceneIds: string[];
        beats: TranslatableBeatItem[];
    }
    const buckets: RawBucket[] = [];
    let current: RawBucket = { sceneIds: [], beats: [] };

    for (const sceneId of source.sceneOrder) {
        const sceneBeats = beatsByScene.get(sceneId) ?? [];
        if (sceneBeats.length === 0) continue;

        if (sceneBeats.length > maxBeats) {
            // Flush current non-empty bucket first, then slice oversized scene cleanly.
            if (current.beats.length > 0) {
                buckets.push(current);
                current = { sceneIds: [], beats: [] };
            }
            for (let offset = 0; offset < sceneBeats.length; offset += maxBeats) {
                buckets.push({
                    sceneIds: [sceneId],
                    beats: sceneBeats.slice(offset, offset + maxBeats),
                });
            }
            continue;
        }

        if (current.beats.length > 0 && current.beats.length + sceneBeats.length > maxBeats) {
            buckets.push(current);
            current = { sceneIds: [sceneId], beats: [...sceneBeats] };
        } else {
            if (!current.sceneIds.includes(sceneId)) current.sceneIds.push(sceneId);
            current.beats.push(...sceneBeats);
        }
    }
    if (current.beats.length > 0 || buckets.length === 0) {
        buckets.push(current);
    }

    const total = buckets.length;
    const placedScenes = new Set<string>();

    return buckets.map((bucket, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === total - 1;
        const chunkPlaces: Record<string, string> = {};
        if (!onlySet) {
            for (const sceneId of bucket.sceneIds) {
                if (!placedScenes.has(sceneId) && source.places[sceneId]) {
                    placedScenes.add(sceneId);
                    chunkPlaces[sceneId] = source.places[sceneId];
                }
            }
            // Attach any remaining places from scenes that had 0 translatable beats to the last chunk.
            if (isLast) {
                for (const [sceneId, text] of Object.entries(source.places)) {
                    if (!placedScenes.has(sceneId)) {
                        placedScenes.add(sceneId);
                        chunkPlaces[sceneId] = text;
                    }
                }
            }
        }

        const beatsPayload: Record<string, TranslationChunkBeatPayload> = {};
        for (const beat of bucket.beats) {
            beatsPayload[beat.beatId] = {
                srcHash: beat.srcHash,
                kind: beat.kind,
                ...(beat.speakerKey ? { speakerKey: beat.speakerKey } : {}),
                ...(beat.speakerName ? { speaker: beat.speakerName } : {}),
                body: beat.body,
            };
        }

        const payload: TranslationChunkPayload = {
            schema: STORY_I18N_SCHEMA_VERSION,
            storyId: doc.id,
            locale: targetLocale,
            translationMeta: {
                origin: "ai_raw",
            },
            ...(!onlySet && isFirst && Object.keys(source.meta).length > 0 ? { meta: source.meta } : {}),
            ...(!onlySet && isFirst && Object.keys(source.cast).length > 0 ? { cast: source.cast } : {}),
            ...(Object.keys(chunkPlaces).length > 0 ? { places: chunkPlaces } : {}),
            beats: beatsPayload,
            ...(!onlySet && isLast && Object.keys(source.choices).length > 0 ? { choices: source.choices } : {}),
            ...(!onlySet && isLast && Object.keys(source.ends).length > 0 ? { ends: source.ends } : {}),
        };

        return {
            index: idx,
            total,
            sceneIds: bucket.sceneIds,
            beatIds: bucket.beats.map(b => b.beatId),
            beatCount: bucket.beats.length,
            includesMeta: !onlySet && isFirst,
            includesChoicesAndEnds: !onlySet && isLast,
            payload,
        };
    });
}

// ==================== AI Translation Prompt Builder ====================

export interface BuiltTranslationPrompt {
    prompt: string;
    chunk: StoryTranslationChunk;
    totalChunks: number;
    injectedCharacterIds: number[];
}

/**
 * Generates a compact, PJSK-character-aware AI translation prompt + minimal chunked JSON payload.
 * Dynamically injects speech-habit & first-person hints ONLY for characters present in `doc.cast`.
 */
export function buildAiTranslationPrompt(
    doc: StoryDocument,
    targetLocale: UiLocale,
    chunkIndex = 0,
    options?: {
        maxBeatsPerChunk?: number;
        onlyBeatIds?: readonly string[];
    },
): BuiltTranslationPrompt {
    const sourceLocale = inferStorySourceLocale(doc);
    const chunks = buildTranslationChunks(doc, targetLocale, options);
    const safeIdx = Math.max(0, Math.min(chunks.length - 1, Math.floor(chunkIndex)));
    const chunk = chunks[safeIdx];
    const isJa = targetLocale === "ja-JP";

    // Dynamically collect ONLY the PJSK characters present in `doc.cast`.
    const injectedCharacterIds: number[] = [];
    const seenCharIds = new Set<number>();
    const castHintLines: string[] = [];

    for (const member of doc.cast) {
        const cid =
            (member.characterId && member.characterId >= 1 && member.characterId <= 26 ? member.characterId : null)
            ?? parseMainCharacterIdFromModelId(member.modelId);
        if (cid !== null && cid in PJSK_CHARACTER_SPEECH_HINTS && !seenCharIds.has(cid)) {
            seenCharIds.add(cid);
            injectedCharacterIds.push(cid);
            const hint = PJSK_CHARACTER_SPEECH_HINTS[cid];
            const vsNote = cid >= 21 && cid <= 26
                ? ` / ${VS_WORLD_HINTS_JA[detectVsWorldKeyFromModelId(member.modelId)]}`
                : "";
            if (isJa) {
                castHintLines.push(
                    `- \`${member.key}\` (${hint.jpName} / ${hint.enName}): 一人称=${hint.firstPerson}。${hint.toneJa}${vsNote}`,
                );
            } else {
                castHintLines.push(
                    `- \`${member.key}\` (${hint.enName} / ${hint.jpName}): ${hint.toneEn} (JP 1st-person ref: ${hint.firstPerson})`,
                );
            }
        }
    }

    const lines: string[] = [];
    lines.push(
        `You are a Project SEKAI: COLORFUL STAGE! fan-story localizer. Translate the JSON payload below from \`${sourceLocale}\` (${UI_LOCALE_LABELS[sourceLocale]}) into \`${targetLocale}\` (${UI_LOCALE_LABELS[targetLocale]}).`,
    );
    if (chunks.length > 1) {
        lines.push(`Chunk: Part ${chunk.index + 1} of ${chunks.length} (${chunk.beatCount} lines in this part).`);
    }
    lines.push("");

    if (castHintLines.length > 0) {
        lines.push("### Appearing PJSK Character Speech Habits & First-Person Guide");
        lines.push(...castHintLines);
        lines.push("");
    }

    lines.push("### Strict Output Rules");
    lines.push(`1. Return ONLY a single valid JSON object inside a \`\`\`json code block matching \`schema: "${STORY_I18N_SCHEMA_VERSION}"\` and \`locale: "${targetLocale}"\`.`);
    lines.push("2. Preserve ALL keys (`cast`, `places`, `beats`, `choices`, `ends`) and every `srcHash` string verbatim. Do NOT add or omit beat IDs.");
    lines.push("3. NEVER translate, rename, or drop `{{variable}}` template placeholders (e.g. `{{score}}`, `{{affection}}`); keep exact braces and variable names.");
    lines.push(`4. Keep lengths within limits: dialogue/narration <= ${STORY_LIMITS.body} chars, telop <= ${STORY_LIMITS.telop}, title/place/choice <= ${STORY_LIMITS.title}, cast name <= ${STORY_LIMITS.castName}.`);
    lines.push("5. Keep `translationMeta.origin` as `\"ai_raw\"` (do NOT claim `\"original\"`).");
    if (isJa) {
        lines.push("");
        lines.push("### Japanese Localization Guidelines");
        lines.push("- Write natural spoken Japanese faithful to Project SEKAI story scripts, using official terms (`セカイ`, `バーチャル・シンガー`, unit names).");
        lines.push("- Keep natural Japanese punctuation (`、`, `。`, `…`, `！`, `？`) and each character's first-person pronoun and tone consistent with the guide above.");
    }

    lines.push("");
    lines.push("### Source JSON Payload");
    lines.push("```json");
    lines.push(JSON.stringify(chunk.payload, null, 2));
    lines.push("```");

    return {
        prompt: lines.join("\n"),
        chunk,
        totalChunks: chunks.length,
        injectedCharacterIds,
    };
}

// ==================== Tolerant Parser & Strict Validator ====================

export type LocalePackIssueCode =
    | "invalidJson"
    | "notObject"
    | "schemaUnsupported"
    | "localeMismatch"
    | "originOriginalForbidden"
    | "originMissing"
    | "beatsMissing"
    | "placeholderMismatch"
    | "textTooLong"
    | "missingBeat"
    | "extraBeat"
    | "outdatedBeat";

export interface LocalePackIssue {
    severity: "error" | "warning";
    code: LocalePackIssueCode;
    path: string;
    beatId?: string;
    params?: Record<string, string | number>;
}

export interface LocalePackValidationStats {
    totalExpectedBeats: number;
    importedBeats: number;
    missingBeats: number;
    extraBeats: number;
    outdatedBeats: number;
}

export interface LocalePackValidationResult {
    ok: boolean;
    pack: StoryLocalePack | null;
    issues: LocalePackIssue[];
    errors: LocalePackIssue[];
    warnings: LocalePackIssue[];
    stats: LocalePackValidationStats;
}

export type LocalePackImportSource = "ai_paste" | "file_upload" | "manual";

export interface ParseLocalePackOptions {
    importSource?: LocalePackImportSource;
    originOverride?: StoryImportableTranslationOrigin;
    modelHint?: string;
    note?: string;
    chunkIndex?: number;
    maxBeatsPerChunk?: number;
    existingPack?: StoryLocalePack | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Tolerantly extracts the JSON object string from raw AI output (strips markdown code fences
 * and leading/trailing prose).
 */
export function extractJsonObjectText(rawText: string): string | null {
    const trimmed = rawText.trim();
    if (!trimmed) return null;

    // 1. Prefer explicit fenced ```json ... ``` or ``` ... ``` block.
    const fenceRe = /```(?:json)?\s*\r?\n?([\s\S]*?)```/gi;
    let fenceMatch: RegExpExecArray | null;
    while ((fenceMatch = fenceRe.exec(trimmed)) !== null) {
        const candidate = fenceMatch[1].trim();
        if (candidate.startsWith("{") && candidate.endsWith("}")) {
            try {
                JSON.parse(candidate);
                return candidate;
            } catch {
                // Keep scanning for another fenced block or balanced object.
            }
        }
    }

    // 2. Direct JSON parse.
    if (trimmed.startsWith("{")) {
        try {
            JSON.parse(trimmed);
            return trimmed;
        } catch {
            // Fall through to balanced brace scanner.
        }
    }

    // 3. Balanced top-level `{ ... }` scan respecting JSON strings and escapes.
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < trimmed.length; i += 1) {
        const ch = trimmed[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === "{") {
            if (depth === 0) start = i;
            depth += 1;
        } else if (ch === "}") {
            if (depth > 0) {
                depth -= 1;
                if (depth === 0 && start !== -1) {
                    const slice = trimmed.slice(start, i + 1);
                    try {
                        JSON.parse(slice);
                        return slice;
                    } catch {
                        start = -1;
                    }
                }
            }
        }
    }

    return null;
}

/**
 * Parses and strictly validates raw AI output or `.i18n.json` content against `doc` and `targetLocale`.
 * - Enforces transparent provenance (`ai_paste` defaults to `ai_raw`, NEVER spoofable as `original`).
 * - Validates `{{var}}` placeholder preservation, length bounds, missing/extra beat IDs, `srcHash` freshness,
 *   and Japanese script ratio gating for `ja-JP` TTS packs.
 * - Supports chunked import merging onto `options.existingPack`.
 */
export function parseAndValidateLocalePack(
    rawText: string,
    doc: StoryDocument,
    targetLocale: UiLocale,
    options: ParseLocalePackOptions = {},
): LocalePackValidationResult {
    const issues: LocalePackIssue[] = [];
    const addError = (code: LocalePackIssueCode, path: string, opts?: { beatId?: string; params?: Record<string, string | number> }) => {
        issues.push({ severity: "error", code, path, ...opts });
    };
    const addWarning = (code: LocalePackIssueCode, path: string, opts?: { beatId?: string; params?: Record<string, string | number> }) => {
        issues.push({ severity: "warning", code, path, ...opts });
    };

    const source = extractTranslatableSource(doc);
    const importSource: LocalePackImportSource = options.importSource ?? "ai_paste";
    const isSourceLocale = targetLocale === source.sourceLocale;

    const emptyStats: LocalePackValidationStats = {
        totalExpectedBeats: source.beats.length,
        importedBeats: 0,
        missingBeats: source.beats.length,
        extraBeats: 0,
        outdatedBeats: 0,
    };

    const jsonText = extractJsonObjectText(rawText);
    if (!jsonText) {
        addError("invalidJson", "$");
        return { ok: false, pack: null, issues, errors: issues, warnings: [], stats: emptyStats };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        addError("invalidJson", "$");
        return { ok: false, pack: null, issues, errors: issues, warnings: [], stats: emptyStats };
    }

    if (!isPlainObject(parsed)) {
        addError("notObject", "$");
        return { ok: false, pack: null, issues, errors: issues, warnings: [], stats: emptyStats };
    }

    if (parsed.schema !== undefined && parsed.schema !== STORY_I18N_SCHEMA_VERSION) {
        addError("schemaUnsupported", "schema", { params: { schema: String(parsed.schema).slice(0, 40) } });
    }
    if (parsed.locale !== undefined && parsed.locale !== targetLocale) {
        addError("localeMismatch", "locale", {
            params: { expected: targetLocale, actual: String(parsed.locale).slice(0, 20) },
        });
    }

    // Determine and enforce transparent translation origin.
    const rawMeta = isPlainObject(parsed.translationMeta) ? parsed.translationMeta : undefined;
    const rawOrigin = typeof rawMeta?.origin === "string" ? rawMeta.origin : undefined;

    let resolvedOrigin: StoryTranslationOrigin | undefined;
    if (isSourceLocale) {
        // The master StoryDocument itself is the "original" source locale; never attach or stamp an overlay pack for it.
        addError("originOriginalForbidden", "locale");
    } else if (importSource === "ai_paste") {
        // AI paste flow ALWAYS defaults to `ai_raw`, allows `ai_assisted`, NEVER allows `original`!
        if (options.originOverride === "ai_assisted" || options.originOverride === "ai_raw") {
            resolvedOrigin = options.originOverride;
        } else {
            resolvedOrigin = "ai_raw";
        }
    } else if (importSource === "file_upload") {
        if (options.originOverride && (STORY_IMPORTABLE_TRANSLATION_ORIGINS as readonly string[]).includes(options.originOverride)) {
            resolvedOrigin = options.originOverride;
        } else if (rawOrigin === "original") {
            addError("originOriginalForbidden", "translationMeta.origin");
        } else if (rawOrigin && (STORY_IMPORTABLE_TRANSLATION_ORIGINS as readonly string[]).includes(rawOrigin)) {
            resolvedOrigin = rawOrigin as StoryImportableTranslationOrigin;
        } else {
            addError("originMissing", "translationMeta.origin");
        }
    } else {
        if (options.originOverride && (STORY_IMPORTABLE_TRANSLATION_ORIGINS as readonly string[]).includes(options.originOverride)) {
            resolvedOrigin = options.originOverride;
        } else if (rawOrigin === "original") {
            addError("originOriginalForbidden", "translationMeta.origin");
        } else if (rawOrigin && (STORY_IMPORTABLE_TRANSLATION_ORIGINS as readonly string[]).includes(rawOrigin)) {
            resolvedOrigin = rawOrigin as StoryImportableTranslationOrigin;
        } else {
            resolvedOrigin = "human";
        }
    }

    const rawModelHint = options.modelHint !== undefined
        ? options.modelHint.trim()
        : (typeof rawMeta?.modelHint === "string" ? rawMeta.modelHint.trim() : "");
    const rawNote = options.note !== undefined
        ? options.note.trim()
        : (typeof rawMeta?.note === "string" ? rawMeta.note.trim() : "");

    if (rawModelHint.length > STORY_LIMITS.translationModelHint) {
        addError("textTooLong", "translationMeta.modelHint", { params: { max: STORY_LIMITS.translationModelHint } });
    }
    if (rawNote.length > STORY_LIMITS.translationNote) {
        addError("textTooLong", "translationMeta.note", { params: { max: STORY_LIMITS.translationNote } });
    }

    const existing = options.existingPack && options.existingPack.locale === targetLocale
        ? options.existingPack
        : null;

    // Determine expected beat IDs (whole doc or active chunk slice).
    const chunkList = options.chunkIndex !== undefined
        ? buildTranslationChunks(doc, targetLocale, { maxBeatsPerChunk: options.maxBeatsPerChunk })
        : null;
    const activeChunk = chunkList && options.chunkIndex !== undefined
        ? chunkList[Math.max(0, Math.min(chunkList.length - 1, options.chunkIndex))]
        : null;
    const expectedBeatIds = activeChunk
        ? activeChunk.beatIds
        : source.beats.map(b => b.beatId);

    // Validate meta
    const mergedMeta: { title?: string; summary?: string } = { ...(existing?.meta ?? {}) };
    if (isPlainObject(parsed.meta)) {
        if (typeof parsed.meta.title === "string") {
            if (parsed.meta.title.length > STORY_LIMITS.title) {
                addError("textTooLong", "meta.title", { params: { max: STORY_LIMITS.title } });
            } else {
                mergedMeta.title = parsed.meta.title;
            }
        }
        if (typeof parsed.meta.summary === "string") {
            if (parsed.meta.summary.length > STORY_LIMITS.summary) {
                addError("textTooLong", "meta.summary", { params: { max: STORY_LIMITS.summary } });
            } else {
                mergedMeta.summary = parsed.meta.summary;
            }
        }
    }

    // Validate cast
    const validCastKeys = new Set(doc.cast.map(c => c.key));
    const mergedCast: Record<string, string> = { ...(existing?.cast ?? {}) };
    if (isPlainObject(parsed.cast)) {
        for (const [k, v] of Object.entries(parsed.cast)) {
            if (FORBIDDEN_KEYS.has(k) || !validCastKeys.has(k)) continue;
            if (typeof v !== "string") continue;
            if (v.length > STORY_LIMITS.castName) {
                addError("textTooLong", `cast.${k}`, { params: { max: STORY_LIMITS.castName } });
                continue;
            }
            mergedCast[k] = v;
        }
    }

    // Validate places
    const mergedPlaces: Record<string, string> = { ...(existing?.places ?? {}) };
    if (isPlainObject(parsed.places)) {
        for (const [sceneId, v] of Object.entries(parsed.places)) {
            if (FORBIDDEN_KEYS.has(sceneId) || !(sceneId in source.places)) continue;
            if (typeof v !== "string") continue;
            if (v.length > STORY_LIMITS.place) {
                addError("textTooLong", `places.${sceneId}`, { params: { max: STORY_LIMITS.place } });
                continue;
            }
            if (!placeholdersMatch(source.places[sceneId], v)) {
                const expected = extractTemplatePlaceholders(source.places[sceneId]).map(t => `{{${t}}}`).join(", ") || "-";
                addError("placeholderMismatch", `places.${sceneId}`, { params: { expected } });
                continue;
            }
            mergedPlaces[sceneId] = v;
        }
    }

    // Validate beats
    const mergedBeats: Record<string, StoryLocaleBeatEntry> = { ...(existing?.beats ?? {}) };
    const importedIds = new Set<string>();
    let extraBeats = 0;
    let outdatedBeats = 0;

    if (!isPlainObject(parsed.beats)) {
        if (expectedBeatIds.length > 0) {
            addError("beatsMissing", "beats");
        }
    } else {
        for (const [beatId, beatRaw] of Object.entries(parsed.beats)) {
            if (FORBIDDEN_KEYS.has(beatId)) continue;
            const srcBeat = source.beatById[beatId];
            if (!srcBeat) {
                extraBeats += 1;
                addWarning("extraBeat", `beats.${beatId}`, { beatId });
                continue;
            }

            let body: string | undefined;
            let speaker: string | undefined;
            let srcHash = srcBeat.srcHash;

            if (typeof beatRaw === "string") {
                // Tolerate shorthand `{ "b_001": "translated text" }` from simpler AI outputs.
                body = beatRaw;
            } else if (isPlainObject(beatRaw)) {
                if (typeof beatRaw.body === "string") body = beatRaw.body;
                else if (typeof beatRaw.text === "string") body = beatRaw.text;
                if (typeof beatRaw.speaker === "string" && beatRaw.speaker.trim()) {
                    speaker = beatRaw.speaker;
                }
                if (typeof beatRaw.srcHash === "string" && /^[0-9a-fA-F]{4,32}$/.test(beatRaw.srcHash.trim())) {
                    srcHash = beatRaw.srcHash.trim().toLowerCase();
                }
            }

            if (body === undefined) continue;

            const maxBodyLen = srcBeat.kind === "telop" ? STORY_LIMITS.telop : STORY_LIMITS.body;
            if (body.length > maxBodyLen) {
                addError("textTooLong", `beats.${beatId}.body`, { beatId, params: { max: maxBodyLen } });
            }
            if (speaker !== undefined && speaker.length > STORY_LIMITS.speakerName) {
                addError("textTooLong", `beats.${beatId}.speaker`, { beatId, params: { max: STORY_LIMITS.speakerName } });
            }

            // Strict `{{var}}` placeholder preservation check!
            if (!placeholdersMatch(srcBeat.body, body)) {
                const expected = srcBeat.placeholders.map(t => `{{${t}}}`).join(", ") || "-";
                addError("placeholderMismatch", `beats.${beatId}.body`, {
                    beatId,
                    params: { expected },
                });
            }
            if (srcBeat.speakerName && speaker !== undefined && !placeholdersMatch(srcBeat.speakerName, speaker)) {
                const expected = extractTemplatePlaceholders(srcBeat.speakerName).map(t => `{{${t}}}`).join(", ") || "-";
                addError("placeholderMismatch", `beats.${beatId}.speaker`, { beatId, params: { expected } });
            }

            if (srcHash !== srcBeat.srcHash) {
                outdatedBeats += 1;
                addWarning("outdatedBeat", `beats.${beatId}`, { beatId });
            }

            importedIds.add(beatId);
            mergedBeats[beatId] = {
                srcHash,
                body,
                ...(speaker !== undefined ? { speaker } : {}),
            };
        }
    }

    let missingBeats = 0;
    for (const beatId of expectedBeatIds) {
        if (!importedIds.has(beatId) && !(mergedBeats[beatId] && mergedBeats[beatId].body.trim() !== "")) {
            missingBeats += 1;
            addWarning("missingBeat", `beats.${beatId}`, { beatId });
        }
    }

    // Validate choices
    const mergedChoices: Record<string, Record<string, string>> = {};
    if (existing?.choices) {
        for (const [k, v] of Object.entries(existing.choices)) mergedChoices[k] = { ...v };
    }
    if (isPlainObject(parsed.choices)) {
        for (const [nodeId, optObj] of Object.entries(parsed.choices)) {
            if (FORBIDDEN_KEYS.has(nodeId) || !(nodeId in source.choices) || !isPlainObject(optObj)) continue;
            const srcOpts = source.choices[nodeId];
            const nextOpts: Record<string, string> = { ...(mergedChoices[nodeId] ?? {}) };
            for (const [optId, optText] of Object.entries(optObj)) {
                if (FORBIDDEN_KEYS.has(optId) || !(optId in srcOpts) || typeof optText !== "string") continue;
                if (optText.length > STORY_LIMITS.choiceText) {
                    addError("textTooLong", `choices.${nodeId}.${optId}`, { params: { max: STORY_LIMITS.choiceText } });
                    continue;
                }
                if (!placeholdersMatch(srcOpts[optId], optText)) {
                    const expected = extractTemplatePlaceholders(srcOpts[optId]).map(t => `{{${t}}}`).join(", ") || "-";
                    addError("placeholderMismatch", `choices.${nodeId}.${optId}`, { params: { expected } });
                    continue;
                }
                nextOpts[optId] = optText;
            }
            if (Object.keys(nextOpts).length > 0) mergedChoices[nodeId] = nextOpts;
        }
    }

    // Validate ends
    const mergedEnds: Record<string, { title?: string; subtitle?: string }> = {};
    if (existing?.ends) {
        for (const [k, v] of Object.entries(existing.ends)) mergedEnds[k] = { ...v };
    }
    if (isPlainObject(parsed.ends)) {
        for (const [nodeId, endRaw] of Object.entries(parsed.ends)) {
            if (FORBIDDEN_KEYS.has(nodeId) || !(nodeId in source.ends) || !isPlainObject(endRaw)) continue;
            const srcEnd = source.ends[nodeId];
            const entry: { title?: string; subtitle?: string } = { ...(mergedEnds[nodeId] ?? {}) };
            if (typeof endRaw.title === "string") {
                if (endRaw.title.length > STORY_LIMITS.nodeTitle) {
                    addError("textTooLong", `ends.${nodeId}.title`, { params: { max: STORY_LIMITS.nodeTitle } });
                } else if (!placeholdersMatch(srcEnd.title, endRaw.title)) {
                    const expected = extractTemplatePlaceholders(srcEnd.title).map(t => `{{${t}}}`).join(", ") || "-";
                    addError("placeholderMismatch", `ends.${nodeId}.title`, { params: { expected } });
                } else {
                    entry.title = endRaw.title;
                }
            }
            if (typeof endRaw.subtitle === "string") {
                if (endRaw.subtitle.length > STORY_LIMITS.endSubtitle) {
                    addError("textTooLong", `ends.${nodeId}.subtitle`, { params: { max: STORY_LIMITS.endSubtitle } });
                } else if (!placeholdersMatch(srcEnd.subtitle, endRaw.subtitle)) {
                    const expected = extractTemplatePlaceholders(srcEnd.subtitle).map(t => `{{${t}}}`).join(", ") || "-";
                    addError("placeholderMismatch", `ends.${nodeId}.subtitle`, { params: { expected } });
                } else {
                    entry.subtitle = endRaw.subtitle;
                }
            }
            if (entry.title !== undefined || entry.subtitle !== undefined) {
                mergedEnds[nodeId] = entry;
            }
        }
    }

    const errors = issues.filter(i => i.severity === "error");
    const warnings = issues.filter(i => i.severity === "warning");

    if (errors.length > 0 || !resolvedOrigin) {
        return {
            ok: false,
            pack: null,
            issues,
            errors,
            warnings,
            stats: {
                totalExpectedBeats: expectedBeatIds.length,
                importedBeats: importedIds.size,
                missingBeats,
                extraBeats,
                outdatedBeats,
            },
        };
    }

    const translationMeta: StoryTranslationMeta = {
        origin: resolvedOrigin,
        ...(rawModelHint ? { modelHint: rawModelHint } : {}),
        ...(rawNote ? { note: rawNote } : {}),
        updatedAt: new Date().toISOString(),
    };

    const pack: StoryLocalePack = {
        schema: STORY_I18N_SCHEMA_VERSION,
        storyId: doc.id,
        locale: targetLocale,
        translationMeta,
        ...(Object.keys(mergedMeta).length > 0 ? { meta: mergedMeta } : {}),
        ...(Object.keys(mergedCast).length > 0 ? { cast: mergedCast } : {}),
        ...(Object.keys(mergedPlaces).length > 0 ? { places: mergedPlaces } : {}),
        beats: mergedBeats,
        ...(Object.keys(mergedChoices).length > 0 ? { choices: mergedChoices } : {}),
        ...(Object.keys(mergedEnds).length > 0 ? { ends: mergedEnds } : {}),
    };

    return {
        ok: true,
        pack,
        issues,
        errors,
        warnings,
        stats: {
            totalExpectedBeats: expectedBeatIds.length,
            importedBeats: importedIds.size,
            missingBeats,
            extraBeats,
            outdatedBeats,
        },
    };
}

// ==================== Outdated Detection & Proofreading Helpers ====================

export interface OutdatedBeatReport {
    outdatedBeatIds: string[];
    missingBeatIds: string[];
    extraBeatIds: string[];
    upToDateCount: number;
    translatedCount: number;
    totalCount: number;
}

/** Compares `pack` against current `doc` beats using deterministic 8-char `srcHash`. */
export function detectOutdatedBeats(
    doc: StoryDocument,
    pack: StoryLocalePack | null | undefined,
): OutdatedBeatReport {
    const source = extractTranslatableSource(doc);
    if (!pack) {
        return {
            outdatedBeatIds: [],
            missingBeatIds: source.beats.map(b => b.beatId),
            extraBeatIds: [],
            upToDateCount: 0,
            translatedCount: 0,
            totalCount: source.beats.length,
        };
    }

    const outdatedBeatIds: string[] = [];
    const missingBeatIds: string[] = [];
    let upToDateCount = 0;
    let translatedCount = 0;

    for (const beat of source.beats) {
        const entry = pack.beats[beat.beatId];
        if (!entry || entry.body.trim() === "") {
            missingBeatIds.push(beat.beatId);
            continue;
        }
        translatedCount += 1;
        if (entry.srcHash !== beat.srcHash) {
            outdatedBeatIds.push(beat.beatId);
        } else {
            upToDateCount += 1;
        }
    }

    const extraBeatIds = Object.keys(pack.beats).filter(id => !(id in source.beatById));

    return {
        outdatedBeatIds,
        missingBeatIds,
        extraBeatIds,
        upToDateCount,
        translatedCount,
        totalCount: source.beats.length,
    };
}

/** Upgrades an `ai_raw` pack to `ai_assisted` once proofread (never spoofs `original`). */
export function upgradePackToProofread(pack: StoryLocalePack, note?: string): StoryLocalePack {
    const nextOrigin: StoryTranslationOrigin = pack.translationMeta.origin === "ai_raw"
        ? "ai_assisted"
        : pack.translationMeta.origin;
    return {
        ...pack,
        translationMeta: {
            ...pack.translationMeta,
            origin: nextOrigin,
            ...(note !== undefined ? (note.trim() ? { note: note.trim().slice(0, STORY_LIMITS.translationNote) } : { note: undefined }) : {}),
            updatedAt: new Date().toISOString(),
        },
    };
}

/** Creates an empty editable `StoryLocalePack` for manual proofreading/authoring. */
export function createEmptyLocalePack(
    doc: StoryDocument,
    locale: UiLocale,
    origin: StoryImportableTranslationOrigin = "human",
): StoryLocalePack {
    return {
        schema: STORY_I18N_SCHEMA_VERSION,
        storyId: doc.id,
        locale,
        translationMeta: {
            origin,
            updatedAt: new Date().toISOString(),
        },
        beats: {},
    };
}

/** Pretty-prints a `StoryLocalePack` for `.i18n.json` export. */
export function serializeStoryLocalePack(pack: StoryLocalePack): string {
    return `${JSON.stringify(pack, null, 2)}\n`;
}

// ==================== Non-Mutating Locale Overlay for Playback ====================

export interface AvailableStoryLocaleInfo {
    locale: UiLocale;
    isSource: boolean;
    origin: StoryTranslationOrigin;
    modelHint?: string;
    note?: string;
    translatedCount: number;
    outdatedCount: number;
    totalCount: number;
}

/** Lists the master source locale followed by all attached `doc.locales` packs with coverage stats. */
export function getAvailableStoryLocales(doc: StoryDocument): AvailableStoryLocaleInfo[] {
    const source = extractTranslatableSource(doc);
    const result: AvailableStoryLocaleInfo[] = [
        {
            locale: source.sourceLocale,
            isSource: true,
            origin: "original",
            translatedCount: source.beats.length,
            outdatedCount: 0,
            totalCount: source.beats.length,
        },
    ];
    if (!doc.locales) return result;
    for (const loc of SUPPORTED_UI_LOCALES) {
        if (loc === source.sourceLocale) continue;
        const pack = doc.locales[loc];
        if (!pack) continue;
        const report = detectOutdatedBeats(doc, pack);
        result.push({
            locale: loc,
            isSource: false,
            origin: pack.translationMeta.origin === "original" ? "ai_raw" : pack.translationMeta.origin,
            ...(pack.translationMeta.modelHint ? { modelHint: pack.translationMeta.modelHint } : {}),
            ...(pack.translationMeta.note ? { note: pack.translationMeta.note } : {}),
            translatedCount: report.translatedCount,
            outdatedCount: report.outdatedBeatIds.length,
            totalCount: report.totalCount,
        });
    }
    return result;
}

/**
 * Purely overlays `doc.locales[locale]` onto a view of `doc` for playback without mutating
 * the master document or changing any node IDs, beat IDs, edges, ports, or variables.
 * Missing or empty translations fall back cleanly to the master document's text.
 */
export function applyStoryLocaleOverlay(doc: StoryDocument, locale?: UiLocale | null): StoryDocument {
    if (!locale) return doc;
    const sourceLocale = inferStorySourceLocale(doc);
    if (locale === sourceLocale) return doc;
    const pack = doc.locales?.[locale];
    if (!pack) return doc;

    const nextMeta = {
        ...doc.meta,
        title: pack.meta?.title?.trim() ? pack.meta.title : doc.meta.title,
        summary: pack.meta?.summary !== undefined && pack.meta.summary.trim() ? pack.meta.summary : doc.meta.summary,
    };

    const nextCast: StoryCastMember[] = doc.cast.map((member) => {
        const translatedName = pack.cast?.[member.key];
        if (!translatedName || !translatedName.trim()) return member;
        return { ...member, name: translatedName };
    });

    const nextNodes: Record<string, StoryNode> = {};
    for (const [nodeId, node] of Object.entries(doc.nodes)) {
        if (node.type === "scene") {
            const placeText = node.place.mode === "set" ? pack.places?.[nodeId] : undefined;
            const nextPlace = node.place.mode === "set" && placeText && placeText.trim()
                ? { mode: "set" as const, text: placeText }
                : node.place;
            const nextBeats = node.beats.map((beat) => {
                const entry = pack.beats[beat.id];
                if (!entry) return beat;
                if (beat.kind === "talk") {
                    const nextBody = entry.body.trim() ? entry.body : beat.body;
                    const nextSpeaker = entry.speaker && entry.speaker.trim() ? entry.speaker : beat.speakerName;
                    if (nextBody === beat.body && nextSpeaker === beat.speakerName) return beat;
                    return {
                        ...beat,
                        body: nextBody,
                        ...(nextSpeaker !== undefined ? { speakerName: nextSpeaker } : {}),
                    };
                }
                if (beat.kind === "narration") {
                    return entry.body.trim() ? { ...beat, body: entry.body } : beat;
                }
                if (beat.kind === "telop") {
                    return entry.body.trim() ? { ...beat, text: entry.body } : beat;
                }
                return beat;
            });
            const nextScene: SceneNode = { ...node, place: nextPlace, beats: nextBeats };
            nextNodes[nodeId] = nextScene;
        } else if (node.type === "choice") {
            const optPack = pack.choices?.[nodeId];
            if (!optPack) {
                nextNodes[nodeId] = node;
            } else {
                nextNodes[nodeId] = {
                    ...node,
                    options: node.options.map((opt) => {
                        const text = optPack[opt.id];
                        return text && text.trim() ? { ...opt, text } : opt;
                    }),
                };
            }
        } else if (node.type === "end") {
            const endPack = pack.ends?.[nodeId];
            if (!endPack) {
                nextNodes[nodeId] = node;
            } else {
                nextNodes[nodeId] = {
                    ...node,
                    title: endPack.title && endPack.title.trim() ? endPack.title : node.title,
                    ...(node.subtitle !== undefined || endPack.subtitle !== undefined
                        ? { subtitle: endPack.subtitle && endPack.subtitle.trim() ? endPack.subtitle : node.subtitle }
                        : {}),
                };
            }
        } else {
            nextNodes[nodeId] = node;
        }
    }

    return {
        ...doc,
        meta: nextMeta,
        cast: nextCast,
        nodes: nextNodes,
    };
}

// ==================== Custom Voice Track Manifest Helpers ====================

function isPrivateOrLocalHostname(rawHost: string): boolean {
    const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
    if (!host) return true;
    if (
        host === "localhost"
        || host.endsWith(".localhost")
        || host.endsWith(".local")
        || host.endsWith(".internal")
        || host === "0.0.0.0"
        || host === "::"
        || host === "::1"
    ) {
        return true;
    }

    // Reject IPv4-mapped (`::ffff:...`, canonicalized by WHATWG URL to `::ffff:hhhh:llll`),
    // IPv4-compatible (`::7f00:1`), loopback (`::1`), unspecified (`::`), NAT64 (`64:ff9b:...`),
    // ULA (`fc00::/7`), link-local (`fe80::/10`), and multicast (`ff00::/8`) IPv6 literals.
    if (host.includes(":")) {
        if (
            host.startsWith(":")
            || host.includes(":ffff:")
            || host.startsWith("64:ff9b:")
            || host.startsWith("0:")
        ) {
            return true;
        }
        const firstGroup = host.split(":")[0] || "0";
        const num = Number.parseInt(firstGroup, 16);
        if (!Number.isFinite(num) || num === 0) return true;
        if ((num & 0xfe00) === 0xfc00) return true;
        if ((num & 0xffc0) === 0xfe80) return true;
        if ((num & 0xff00) === 0xff00) return true;
        return false;
    }

    // Reject numeric/hex IPv4 forms (e.g. `2130706433`, `0x7f000001`).
    if (/^(?:0x[0-9a-f]+|\d+)$/.test(host)) {
        return true;
    }

    // Reject loopback, private, link-local, CGNAT, and reserved IPv4 ranges.
    const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4Match) {
        const octets = ipv4Match.slice(1).map(Number);
        if (octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
        const [a, b] = octets;
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        if (a >= 224) return true;
        return false;
    }

    // Reject bare single-label intranet hostnames without a dot.
    if (!host.includes(".")) return true;

    return false;
}

/**
 * Returns `true` iff `url` is a safe `https://` URL on a public hostname or a safe same-origin
 * relative path (`/foo/manifest.json`). Rejects `http:`, `javascript:`, `data:`, `file:`,
 * credentials, protocol-relative `//`, traversal segments (`..`), and private/loopback IPs.
 */
export function isSafeVoiceManifestUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed || /[\s\u0000-\u001f\\]/.test(trimmed)) return false;
    if (trimmed.startsWith("/")) {
        if (trimmed.startsWith("//")) return false;
        const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? "";
        if (pathOnly.split("/").some(seg => seg === "..")) return false;
        return true;
    }
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "https:") return false;
        if (parsed.username || parsed.password) return false;
        if (isPrivateOrLocalHostname(parsed.hostname)) return false;
        return true;
    } catch {
        return false;
    }
}

function resolveRelativeAgainstBase(baseUrl: string | undefined, relativePath: string): string | null {
    if (!baseUrl) return null;
    const base = baseUrl.trim();
    const rel = relativePath.trim();
    if (!base || !rel || /[\s\u0000-\u001f\\]/.test(rel)) return null;
    if (rel.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rel)) return null;
    const pathOnly = rel.split(/[?#]/, 1)[0] ?? "";
    if (pathOnly.split("/").some(seg => seg === "..")) return null;

    if (base.startsWith("/")) {
        const joined = rel.startsWith("/")
            ? rel
            : `${base.replace(/\/+$/, "")}/${rel.replace(/^\/+/, "")}`;
        return isSafeVoiceManifestUrl(joined) ? joined : null;
    }

    if (!isSafeVoiceManifestUrl(base)) return null;
    try {
        const normalizedBase = base.endsWith("/") ? base : `${base}/`;
        const resolved = new URL(rel.replace(/^\/+/, ""), normalizedBase).toString();
        return isSafeVoiceManifestUrl(resolved) ? resolved : null;
    } catch {
        return null;
    }
}

function resolveLineUrlCandidates(
    rawUrl: string | undefined,
    rawObjectKey: string | undefined,
    baseUrl: string | undefined,
): string[] {
    const urls: string[] = [];
    const push = (candidate: string | null | undefined) => {
        if (!candidate) return;
        const trimmed = candidate.trim();
        if (isSafeVoiceManifestUrl(trimmed) && !urls.includes(trimmed)) {
            urls.push(trimmed);
        }
    };

    const trimmedUrl = rawUrl?.trim() ?? "";
    if (trimmedUrl) {
        if (isSafeVoiceManifestUrl(trimmedUrl)) {
            push(trimmedUrl);
        } else {
            push(resolveRelativeAgainstBase(baseUrl, trimmedUrl));
        }
    }
    const trimmedKey = rawObjectKey?.trim() ?? "";
    if (trimmedKey) {
        push(resolveRelativeAgainstBase(baseUrl, trimmedKey));
    }
    return urls;
}

/**
 * Resolves playable HTTPS / same-origin audio URL candidates for `beatId` from a mounted
 * `StoryVoiceManifest`. Supports absolute `line.url`, relative `line.url` against `manifest.baseUrl`,
 * and `${manifest.baseUrl}/${line.objectKey}`.
 */
export function resolveVoiceManifestLineUrl(
    manifest: StoryVoiceManifest | null | undefined,
    beatId: string | undefined,
): string[] {
    if (!manifest || !beatId) return [];
    const line = manifest.lines[beatId];
    if (!line) return [];
    return resolveLineUrlCandidates(line.url, line.objectKey, manifest.baseUrl);
}

/**
 * Strictly validates an untrusted custom voice track manifest (`moesekai-story-voice/1`).
 * Requires only `schema`, `storyId`, and `lines` (with playable safe HTTPS / relative audio URLs);
 * `locale`, `title`, `baseUrl`, `storyRev`, `generatedAt`, and per-line metadata are optional.
 */
export function parseStoryVoiceManifest(raw: unknown): StoryVoiceManifest | null {
    if (!isPlainObject(raw)) return null;
    if (raw.schema !== STORY_VOICE_MANIFEST_SCHEMA_VERSION) return null;
    if (typeof raw.storyId !== "string" || !raw.storyId.trim()) return null;
    if (!isPlainObject(raw.lines)) return null;

    let locale: UiLocale | undefined;
    if (raw.locale !== undefined && raw.locale !== null && raw.locale !== "") {
        if (!isUiLocale(raw.locale)) return null;
        locale = raw.locale;
    }

    const baseUrlRaw = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
    if (baseUrlRaw && !isSafeVoiceManifestUrl(baseUrlRaw)) return null;
    const baseUrl = baseUrlRaw || undefined;

    const title = typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim().slice(0, 160)
        : undefined;
    const storyRev = typeof raw.storyRev === "number" && Number.isFinite(raw.storyRev) && raw.storyRev >= 0
        ? Math.trunc(raw.storyRev)
        : undefined;
    const generatedAt = typeof raw.generatedAt === "string" && raw.generatedAt.trim()
        ? raw.generatedAt.trim().slice(0, 64)
        : undefined;

    const rawEntries = Object.entries(raw.lines);
    const lines: Record<string, StoryVoiceManifestLine> = {};
    for (const [beatId, item] of rawEntries) {
        if (FORBIDDEN_KEYS.has(beatId) || !STORY_ID_PATTERN.test(beatId) || !isPlainObject(item)) continue;
        const url = typeof item.url === "string" ? item.url.trim() : "";
        const objectKey = typeof item.objectKey === "string" ? item.objectKey.trim() : "";
        const resolvedUrls = resolveLineUrlCandidates(url, objectKey, baseUrl);
        if (resolvedUrls.length === 0) continue;

        let lineLocale: UiLocale | undefined;
        if (item.locale !== undefined && item.locale !== null && item.locale !== "") {
            if (!isUiLocale(item.locale)) continue;
            lineLocale = item.locale;
        }
        const durationMs = typeof item.durationMs === "number" && Number.isFinite(item.durationMs) && item.durationMs >= 0
            ? item.durationMs
            : undefined;
        const speaker = typeof item.speaker === "string" && item.speaker.trim()
            ? item.speaker.trim().slice(0, 80)
            : undefined;
        const audioHash = typeof item.audioHash === "string" && item.audioHash.trim()
            ? item.audioHash.trim().slice(0, 128)
            : undefined;
        const codec = typeof item.codec === "string" && item.codec.trim()
            ? item.codec.trim().slice(0, 32)
            : undefined;
        const sizeBytes = typeof item.sizeBytes === "number" && Number.isFinite(item.sizeBytes) && item.sizeBytes >= 0
            ? item.sizeBytes
            : undefined;

        lines[beatId] = {
            url: url || resolvedUrls[0],
            ...(durationMs !== undefined ? { durationMs } : {}),
            ...(lineLocale !== undefined ? { locale: lineLocale } : {}),
            ...(speaker !== undefined ? { speaker } : {}),
            ...(objectKey ? { objectKey } : {}),
            ...(audioHash !== undefined ? { audioHash } : {}),
            ...(codec !== undefined ? { codec } : {}),
            ...(sizeBytes !== undefined ? { sizeBytes } : {}),
        };
    }

    // Reject manifests whose declared lines were all unsafe or malformed.
    if (rawEntries.length > 0 && Object.keys(lines).length === 0) {
        return null;
    }

    return {
        schema: STORY_VOICE_MANIFEST_SCHEMA_VERSION,
        storyId: raw.storyId.trim(),
        ...(locale !== undefined ? { locale } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(storyRev !== undefined ? { storyRev } : {}),
        ...(generatedAt !== undefined ? { generatedAt } : {}),
        lines,
    };
}

export type StoryJsonArtifactKind = "story" | "localePack" | "voiceManifest" | "unknown";

/** Inspects a parsed JSON value's `schema` field to identify Story Maker artifact kind for helpful UX errors. */
export function detectJsonArtifactKind(raw: unknown): StoryJsonArtifactKind {
    if (!isPlainObject(raw) || typeof raw.schema !== "string") return "unknown";
    if (raw.schema === "moesekai-story/2") return "story";
    if (raw.schema === STORY_I18N_SCHEMA_VERSION) return "localePack";
    if (raw.schema === STORY_VOICE_MANIFEST_SCHEMA_VERSION) return "voiceManifest";
    return "unknown";
}

export interface VoiceManifestMatchSummary {
    totalManifestLines: number;
    totalTalkBeats: number;
    matchedCount: number;
    matchedBeatIds: string[];
    storyIdMismatch: boolean;
}

/** Measures how many talk beats in `doc` match audio entries in `manifest.lines`. */
export function matchVoiceManifestToDoc(
    doc: StoryDocument,
    manifest: StoryVoiceManifest,
): VoiceManifestMatchSummary {
    const matchedBeatIds: string[] = [];
    let totalTalkBeats = 0;
    for (const node of Object.values(doc.nodes)) {
        if (node.type !== "scene") continue;
        for (const beat of node.beats) {
            if (beat.kind !== "talk") continue;
            totalTalkBeats += 1;
            if (Object.prototype.hasOwnProperty.call(manifest.lines, beat.id)) {
                matchedBeatIds.push(beat.id);
            }
        }
    }
    return {
        totalManifestLines: Object.keys(manifest.lines).length,
        totalTalkBeats,
        matchedCount: matchedBeatIds.length,
        matchedBeatIds,
        storyIdMismatch: Boolean(manifest.storyId && doc.id && manifest.storyId !== doc.id),
    };
}
