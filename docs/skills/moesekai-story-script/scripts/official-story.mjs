#!/usr/bin/env node
/**
 * Standalone MoeSekai Official Story & Asset Inspector CLI.
 *
 * Zero-dependency pure Node.js ESM (Node 18+) designed for AI agents and human authors writing
 * MoeSekai Script (`.msk`) stories. Queries Moesekai's public CORS-enabled endpoints
 * (`metadata.pjsk.moe`, `storage.pjsk.moe`, `assets.pjsk.moe`, `translation.exmeaning.com`)
 * so agents can study real official Project SEKAI scenarios and mine verified Live2D models,
 * `(motion, facial)` palettes with dialogue context, backgrounds, BGM tracks, SE clips, and voices.
 *
 * Public Asset Attribution: Moesekai (pjsk.moe)
 *
 * Subcommands:
 *   list         Discover official episodes from masterdata (fast, lightweight)
 *   search-text  Full-text dialogue search across all official episodes (sekai-story-search corpus)
 *   inspect      Extract L2D models, motions/facials, BGs, BGMs, SEs, voices & timeline from an episode
 *   study        Mine & aggregate a ready-to-use .msk asset kit across multiple official episodes
 *   catalog      Browse live Live2D models, motion/facial clips, BGM, BG, SE, or voice directories
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { brotliDecompressSync } from "node:zlib";

// ==================== Constants & Endpoints ====================

export const REGIONS = ["jp", "cn", "tw", "kr", "en"];

const MASTER_DOMAINS = {
    main: ["https://metadata.pjsk.moe", "https://metadata.exmeaning.com"],
    backup: ["https://metadata.exmeaning.com", "https://metadata.pjsk.moe"],
};

const STORAGE_DOMAINS = {
    main: ["https://storage.pjsk.moe", "https://storage.exmeaning.com"],
    backup: ["https://storage.exmeaning.com", "https://storage.pjsk.moe"],
};

const RIPPER_LIBRARY_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper";
const LIVE2D_INDEX_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-live2d";
const STORY_SEARCH_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story-search";
const TRANSLATION_BASE = "https://translation.exmeaning.com";

const CACHE_DIR = join(tmpdir(), "moesekai-msk-skill-cache");
const HTTP_TIMEOUT_MS = 20_000;
const CORPUS_TIMEOUT_MS = 60_000;

const TTL_MASTER_MS = 6 * 60 * 60 * 1000;
const TTL_MANIFEST_MS = 60 * 60 * 1000;
const TTL_SCENARIO_MS = 24 * 60 * 60 * 1000;

const SE_PACKS = ["se_pack00001_b", "se_pack00001"];
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|acb|flac)$/i;

export const UNIT_ALIASES = {
    ln: "light_sound",
    leoneed: "light_sound",
    "leo/need": "light_sound",
    light_sound: "light_sound",
    mmj: "idol",
    moremorejump: "idol",
    idol: "idol",
    vbs: "street",
    vividbadsquad: "street",
    street: "street",
    ws: "theme_park",
    wxs: "theme_park",
    wonderlands: "theme_park",
    theme_park: "theme_park",
    "25ji": "school_refusal",
    n25: "school_refusal",
    niigo: "school_refusal",
    nightcord: "school_refusal",
    school_refusal: "school_refusal",
    vs: "piapro",
    virtualsinger: "piapro",
    virtual_singer: "piapro",
    piapro: "piapro",
};

const UNIT_SHORT = {
    light_sound: "ln",
    idol: "mmj",
    street: "vbs",
    theme_park: "ws",
    school_refusal: "25ji",
    piapro: "vs",
};

export const CHARACTERS = [
    { id: 1, key: "ichika", prefix: "01ichika", unit: "light_sound", gender: "f", en: "Hoshino Ichika", jp: "星乃一歌", zh: "星乃一歌", aliases: ["一歌", "ichika", "hoshino"] },
    { id: 2, key: "saki", prefix: "02saki", unit: "light_sound", gender: "f", en: "Tenma Saki", jp: "天馬咲希", zh: "天马咲希", aliases: ["咲希", "saki"] },
    { id: 3, key: "honami", prefix: "03honami", unit: "light_sound", gender: "f", en: "Mochizuki Honami", jp: "望月穂波", zh: "望月穗波", aliases: ["穂波", "穗波", "honami", "mochizuki"] },
    { id: 4, key: "shiho", prefix: "04shiho", unit: "light_sound", gender: "f", en: "Hinomori Shiho", jp: "日野森志歩", zh: "日野森志步", aliases: ["志歩", "志步", "shiho"] },
    { id: 5, key: "minori", prefix: "05minori", unit: "idol", gender: "f", en: "Hanasato Minori", jp: "花里みのり", zh: "花里实乃理", aliases: ["みのり", "实乃理", "實乃理", "minori", "hanasato"] },
    { id: 6, key: "haruka", prefix: "06haruka", unit: "idol", gender: "f", en: "Kiritani Haruka", jp: "桐谷遥", zh: "桐谷遥", aliases: ["遥", "遙", "haruka", "kiritani"] },
    { id: 7, key: "airi", prefix: "07airi", unit: "idol", gender: "f", en: "Momoi Airi", jp: "桃井愛莉", zh: "桃井爱莉", aliases: ["愛莉", "爱莉", "airi", "momoi"] },
    { id: 8, key: "shizuku", prefix: "08shizuku", unit: "idol", gender: "f", en: "Hinomori Shizuku", jp: "日野森雫", zh: "日野森雫", aliases: ["雫", "shizuku"] },
    { id: 9, key: "kohane", prefix: "09kohane", unit: "street", gender: "f", en: "Azusawa Kohane", jp: "小豆沢こはね", zh: "小豆泽心羽", aliases: ["こはね", "心羽", "kohane", "azusawa"] },
    { id: 10, key: "an", prefix: "10an", unit: "street", gender: "f", en: "Shiraishi An", jp: "白石杏", zh: "白石杏", aliases: ["杏", "an", "shiraishi"] },
    { id: 11, key: "akito", prefix: "11akito", unit: "street", gender: "m", en: "Shinonome Akito", jp: "東雲彰人", zh: "东云彰人", aliases: ["彰人", "akito"] },
    { id: 12, key: "toya", prefix: "12touya", unit: "street", gender: "m", en: "Aoyagi Toya", jp: "青柳冬弥", zh: "青柳冬弥", aliases: ["冬弥", "冬彌", "toya", "touya", "aoyagi"] },
    { id: 13, key: "tsukasa", prefix: "13tsukasa", unit: "theme_park", gender: "m", en: "Tenma Tsukasa", jp: "天馬司", zh: "天马司", aliases: ["司", "tsukasa"] },
    { id: 14, key: "emu", prefix: "14emu", unit: "theme_park", gender: "f", en: "Otori Emu", jp: "鳳えむ", zh: "凤笑梦", aliases: ["えむ", "笑梦", "笑夢", "emu", "otori"] },
    { id: 15, key: "nene", prefix: "15nene", unit: "theme_park", gender: "f", en: "Kusanagi Nene", jp: "草薙寧々", zh: "草薙宁宁", aliases: ["寧々", "宁宁", "寧寧", "nene", "kusanagi"] },
    { id: 16, key: "rui", prefix: "16rui", unit: "theme_park", gender: "m", en: "Kamishiro Rui", jp: "神代類", zh: "神代类", aliases: ["類", "类", "rui", "kamishiro"] },
    { id: 17, key: "kanade", prefix: "17kanade", unit: "school_refusal", gender: "f", en: "Yoisaki Kanade", jp: "宵崎奏", zh: "宵崎奏", aliases: ["奏", "kanade", "yoisaki"] },
    { id: 18, key: "mafuyu", prefix: "18mafuyu", unit: "school_refusal", gender: "f", en: "Asahina Mafuyu", jp: "朝比奈まふゆ", zh: "朝比奈真冬", aliases: ["まふゆ", "真冬", "mafuyu", "asahina"] },
    { id: 19, key: "ena", prefix: "19ena", unit: "school_refusal", gender: "f", en: "Shinonome Ena", jp: "東雲絵名", zh: "东云绘名", aliases: ["絵名", "绘名", "繪名", "ena"] },
    { id: 20, key: "mizuki", prefix: "20mizuki", unit: "school_refusal", gender: "f", en: "Akiyama Mizuki", jp: "暁山瑞希", zh: "晓山瑞希", aliases: ["瑞希", "mizuki", "akiyama"] },
    { id: 21, key: "miku", prefix: "21miku", unit: "piapro", gender: "f", en: "Hatsune Miku", jp: "初音ミク", zh: "初音未来", aliases: ["ミク", "未来", "未來", "miku", "hatsune"] },
    { id: 22, key: "rin", prefix: "22rin", unit: "piapro", gender: "f", en: "Kagamine Rin", jp: "鏡音リン", zh: "镜音铃", aliases: ["リン", "铃", "鈴", "rin"] },
    { id: 23, key: "len", prefix: "23len", unit: "piapro", gender: "m", en: "Kagamine Len", jp: "鏡音レン", zh: "镜音连", aliases: ["レン", "连", "連", "len"] },
    { id: 24, key: "luka", prefix: "24luka", unit: "piapro", gender: "f", en: "Megurine Luka", jp: "巡音ルカ", zh: "巡音流歌", aliases: ["ルカ", "流歌", "luka", "megurine"] },
    { id: 25, key: "meiko", prefix: "25meiko", unit: "piapro", gender: "f", en: "MEIKO", jp: "MEIKO", zh: "MEIKO", aliases: ["meiko"] },
    { id: 26, key: "kaito", prefix: "26kaito", unit: "piapro", gender: "m", en: "KAITO", jp: "KAITO", zh: "KAITO", aliases: ["kaito"] },
];

const CHAR_BY_ID = new Map(CHARACTERS.map(c => [c.id, c]));
const CHAR_BY_KEY = new Map([
    ...CHARACTERS.map(c => [c.key, c]),
    ["touya", CHAR_BY_ID.get(12)],
]);

export const MODEL_KINDS = ["character", "sub", "collab", "mob"];
const KIND_ORDER = { character: 0, sub: 1, collab: 2, mob: 3 };
const MAIN_CHAR_MODEL_RE = /^(?:v2_)?(?:clb\d+_)?(0[1-9]|1[0-9]|2[0-6])[a-z]+/;
const MAIN_CHAR_CHILD_RE = /^(?:v2_)?sub_(?:child\d*_([a-z]+)|([a-z]+)child|([a-z]+)_princess)/;
const COLLAB_MODEL_RE = /^(?:v2_)?sub_(?:sanrio|enst|egg)_/;
const SUB_VARIANT_SEGMENTS = new Set([
    "black", "zoom", "side", "stage", "casual", "lesson",
    "rw", "patient", "sunset", "cloth", "jc", "school", "transform",
]);

// Compact 5-region story-derived supporting & collab character name table (verified against
// sekai-live2d-index models.json format 2 across jp/cn/tw/en/kr). Used to enrich format 1
// indexes and 404 storage directory fallbacks, and to supply canonical full-name search aliases.
export const SUB_CHARACTER_NAMES = {
    "anfather": { kind: "sub", names: { jp: "謙", cn: "谦", tw: "謙", en: "Ken", kr: "켄" }, aliases: ["白石谦", "白石謙", "杏的父亲", "杏的父親", "杏の父", "An's Father", "Shiraishi Ken"] },
    "arata": { kind: "sub", names: { cn: "新", en: "Arata", jp: "新", kr: "아라타", tw: "新" }, aliases: ["远野新", "遠野新", "Tono Arata"] },
    "arisa": { kind: "sub", names: { cn: "亚里纱", en: "Arisa", jp: "アリサ", kr: "아리사", tw: "亞梨沙" }, aliases: ["爱莉莎", "愛莉莎"] },
    "asahi": { kind: "sub", names: { cn: "旭", en: "Asahi", jp: "旭", kr: "아사히", tw: "旭" }, aliases: ["アルフレッド"] },
    "asrunp": { kind: "sub", names: { cn: "柊", en: "Hiiragi", jp: "柊", kr: "히이라기", tw: "柊" }, aliases: ["ASRUNのプロデューサー"] },
    "bakunoreki": { kind: "sub", names: { cn: "历", en: "Reki", jp: "歴", kr: "레키", tw: "歷" }, aliases: ["克幸", "日野"] },
    "byakkomachi": { kind: "sub", names: { cn: "白虎町", en: "Byakkomachi", jp: "白虎町", kr: "뱟코마치", tw: "白虎町" } },
    "chairman": { kind: "sub", names: { cn: "鬼岛", en: "Kijima", jp: "鬼島", kr: "키지마", tw: "鬼島" }, aliases: ["六郎"] },
    "cordnukio": { kind: "sub", names: { cn: "洸太郎", en: "Kotaro", jp: "洸太郎", kr: "코타로", tw: "洸太郎" }, aliases: ["ミュージシャン"] },
    "diva": { kind: "sub", names: { cn: "樱子", en: "Sakurako", jp: "櫻子", kr: "사쿠라코", tw: "櫻子" }, aliases: ["令嬢", "村長の娘"] },
    "egg_01_mametchi": { kind: "collab", names: { cn: "豆丁吉", en: "Mametchi", jp: "まめっち", kr: "마메치", tw: "豆丁吉" } },
    "egg_02_kuchipatchi": { kind: "collab", names: { cn: "大嘴吉", en: "Kuchipatchi", jp: "くちぱっち", kr: "구치파치", tw: "大嘴吉" } },
    "egg_03_mimitchi": { kind: "collab", names: { cn: "大耳吉", en: "Mimitchi", jp: "みみっち", kr: "미미치", tw: "大耳吉" } },
    "egg_04_memetchi": { kind: "collab", names: { cn: "玫玫吉", en: "Memetchi", jp: "めめっち", kr: "메메치", tw: "玫玫吉" } },
    "enst_01izumi": { kind: "collab", names: { cn: "泉", en: "Izumi", jp: "泉", kr: "이즈미", tw: "泉" }, aliases: ["濑名泉", "瀨名泉", "瀬名泉", "Sena Izumi"] },
    "enst_02chiaki": { kind: "collab", names: { cn: "千秋", en: "Chiaki", jp: "千秋", kr: "치아키", tw: "千秋" }, aliases: ["守泽千秋", "守澤千秋", "守沢千秋", "Morisawa Chiaki"] },
    "enst_03natsume": { kind: "collab", names: { cn: "夏目", en: "Natsume", jp: "夏目", kr: "나츠메", tw: "夏目" }, aliases: ["逆先夏目", "Sakasaki Natsume"] },
    "enst_04jun": { kind: "collab", names: { cn: "纯", en: "Jun", jp: "ジュン", kr: "쥰", tw: "純" }, aliases: ["涟纯", "漣純", "漣ジュン", "Sazanami Jun"] },
    "futaba": { kind: "sub", names: { cn: "二叶", en: "Futaba", jp: "二葉", kr: "후타바", tw: "二葉" } },
    "hanano": { kind: "sub", names: { cn: "花乃", en: "Hanano", jp: "花乃", kr: "하나노", tw: "花乃" } },
    "harukafan": { kind: "sub", names: { cn: "真依", en: "Mai", jp: "真依", kr: "마이", tw: "真依" } },
    "hikarin": { kind: "sub", names: { cn: "光光", en: "Hikarin", jp: "ひかりん", kr: "히카링", tw: "小光" } },
    "igs_princess": { kind: "sub", names: { jp: "エル", cn: "艾尔", tw: "艾爾", en: "Elle", kr: "엘" }, aliases: ["少女"] },
    "iori": { kind: "sub", names: { cn: "伊织", en: "Iori", jp: "イオリ", kr: "이오리", tw: "伊織" } },
    "kanadefather": { kind: "sub", names: { cn: "奏的父亲", en: "Kanade's Father", jp: "奏の父", kr: "카나데의 아빠", tw: "奏的父親" } },
    "kanademother": { kind: "sub", names: { cn: "奏的母亲", en: "Kanade's Mother", jp: "奏の母", kr: "카나데의 엄마", tw: "奏的母親" } },
    "liondancerobot": { kind: "sub", names: { cn: "舞狮机器人", en: "Lion Dance Robot", jp: "獅子舞ロボ", kr: "사자춤 로봇", tw: "舞獅機器人" }, aliases: ["獅子舞の神", "獅子舞"] },
    "mafuyufather": { kind: "sub", names: { cn: "真冬的父亲", en: "Mafuyu's Father", jp: "まふゆの父", kr: "마후유의 아빠", tw: "真冬的父親" } },
    "mafuyumother": { kind: "sub", names: { cn: "真冬的母亲", en: "Mafuyu's Mother", jp: "まふゆの母", kr: "마후유의 엄마", tw: "真冬的母親" } },
    "mikudayo": { kind: "sub", names: { cn: "初音未来的玩偶装", en: "Mikudayo Mascot", jp: "ミクの着ぐるみ", kr: "미쿠 인형 탈", tw: "初音未來玩偶" }, aliases: ["妖精"] },
    "mikudayoteacher": { kind: "sub", names: { cn: "大有老师", en: "Principal Mikudayo", jp: "ダヨー先生", kr: "에오 선생님", tw: "DAYO校長" }, aliases: ["ミクダヨー村長"] },
    "mikurobo": { kind: "sub", names: { cn: "邪不胜正", en: "Evil's Bane", jp: "アクハサカエヌー", kr: "악은망해오", tw: "邪不勝正" }, aliases: ["初音机器人", "初音機器人", "Robo-Miku", "Miku Robo", "ミクロボ"] },
    "mio": { kind: "sub", names: { cn: "美绪", en: "Mio", jp: "ミオ", kr: "미오", tw: "澪" } },
    "miu": { kind: "sub", names: { cn: "未羽", en: "Miu", jp: "未羽", kr: "미우", tw: "未羽" } },
    "mizukisister": { kind: "sub", names: { cn: "瑞希的姐姐", en: "Mizuki's Sister", jp: "瑞希の姉", kr: "미즈키의 언니", tw: "瑞希的姊姊" } },
    "mrmrhouse_landlord": { kind: "sub", names: { cn: "有泽", en: "Arisawa", jp: "有澤", kr: "아리사와", tw: "有澤" }, aliases: ["おばあさん", "大家"] },
    "nagi": { kind: "sub", names: { cn: "凪", en: "Nagi", jp: "凪", kr: "나기", tw: "凪" } },
    "nanamin": { kind: "sub", names: { cn: "七七", en: "Nanamin", jp: "ななみん", kr: "나나밍", tw: "七海海" } },
    "nenedayo": { kind: "sub", names: { cn: "宁宁机器人", en: "Robo-Nene", jp: "ネネロボ", kr: "네네 로봇", tw: "寧寧機器人" }, aliases: ["Nenerobo", "ネ・ネー", "ロボット", "ハカイスンゼー", "悪いロボボンボン"] },
    "otoribrother1": { kind: "sub", names: { cn: "庆介", en: "Keisuke", jp: "慶介", kr: "케이스케", tw: "慶介" }, aliases: ["慶介司令官"] },
    "otoribrother2": { kind: "sub", names: { cn: "晶介", en: "Shosuke", jp: "晶介", kr: "쇼스케", tw: "晶介" } },
    "otorifather": { kind: "sub", names: { cn: "笑梦的父亲", en: "Emu's Father", jp: "えむの父", kr: "에무의 아빠", tw: "笑夢的父親" } },
    "otorirakunosuke": { kind: "sub", names: { cn: "乐之介", en: "Rakunosuke", jp: "楽之介", kr: "라쿠노스케", tw: "樂之介" } },
    "otorisister": { kind: "sub", names: { cn: "阳诗", en: "Hinata", jp: "ひなた", kr: "히나타", tw: "日向" } },
    "partner": { kind: "sub", names: { cn: "大河", en: "Taiga", jp: "大河", kr: "타이가", tw: "大河" }, aliases: ["謎の男"] },
    "riho": { kind: "sub", names: { cn: "长谷川", en: "Hasegawa", jp: "長谷川", kr: "하세가와", tw: "長谷川" } },
    "rilley": { kind: "sub", names: { cn: "莱利", en: "Riley", jp: "ライリー", kr: "라일리", tw: "萊利" } },
    "rival_douglas": { kind: "sub", names: { jp: "ダグラス", cn: "道格拉斯", tw: "道格拉斯", en: "Douglas", kr: "더글러스" } },
    "rivalidol_akari": { kind: "sub", names: { cn: "灯", en: "Akari", jp: "あかり", kr: "아카리", tw: "燈" } },
    "rivalidol_chiharu": { kind: "sub", names: { cn: "千晴", en: "Chiharu", jp: "千晴", kr: "치하루", tw: "千晴" } },
    "rivalidol_yu": { kind: "sub", names: { cn: "结雨", en: "Yu", jp: "結雨", kr: "유우", tw: "結雨" } },
    "rivalsisters_elena": { kind: "sub", names: { cn: "艾琳娜", en: "Elena", jp: "エレナ", kr: "엘레나", tw: "艾琳娜" } },
    "rivalsisters_rebecca": { kind: "sub", names: { cn: "瑞贝卡", en: "Rebecca", jp: "レベッカ", kr: "레베카", tw: "蕾貝卡" } },
    "rivaltwins_cedric": { kind: "sub", names: { cn: "塞德里克", en: "Cedric", jp: "セドリック", kr: "세드릭", tw: "賽德利克" } },
    "rivaltwins_slade": { kind: "sub", names: { cn: "斯雷德", en: "Slade", jp: "スレイド", kr: "슬레이드", tw: "史雷德" } },
    "saito": { kind: "sub", names: { cn: "斋藤", en: "Saito", jp: "斎藤", kr: "사이토", tw: "齋藤" } },
    "sakaki": { kind: "sub", names: { cn: "榊", en: "Sakaki", jp: "榊", kr: "사카키", tw: "榊" } },
    "saku": { kind: "sub", names: { cn: "朔", en: "Saku", jp: "朔", kr: "사쿠", tw: "朔" } },
    "sanrio_cinnamoroll": { kind: "collab", names: { cn: "大耳狗", en: "Cinnamoroll", jp: "シナモン", kr: "시나몬", tw: "大耳狗喜拿" }, aliases: ["シナモロール", "玉桂狗"] },
    "sanrio_kitty": { kind: "collab", names: { cn: "凯蒂猫", en: "Hello Kitty", jp: "キティ", kr: "키티", tw: "Hello Kitty" }, aliases: ["ハローキティ"] },
    "sanrio_kuromi": { kind: "collab", names: { cn: "酷洛米", en: "KUROMI", jp: "クロミ", kr: "쿠로미", tw: "酷洛米" }, aliases: ["库洛米"] },
    "sanrio_mymelody": { kind: "collab", names: { cn: "美乐蒂", en: "My Melody", jp: "メロディ", kr: "멜로디", tw: "美樂蒂" }, aliases: ["マイメロディ"] },
    "sanrio_pochacco": { kind: "collab", names: { cn: "帕恰狗", en: "Pochacco", jp: "ポチャッコ", kr: "포차코", tw: "帕恰狗" } },
    "sanrio_pompompurin": { kind: "collab", names: { cn: "布丁狗", en: "Pompompurin", jp: "プリン", kr: "푸린", tw: "布丁狗" }, aliases: ["ポムポムプリン"] },
    "shinonomefather": { kind: "sub", names: { cn: "父亲", en: "Father", jp: "父親", kr: "아빠", tw: "父親" }, aliases: ["东云的父亲", "绘名的父亲", "彰人的父亲", "東雲の父", "Shinonome Father", "Ena's Father", "Akito's Father"] },
    "souma": { kind: "sub", names: { cn: "飒真", en: "Soma", jp: "颯真", kr: "소우마", tw: "颯真" } },
    "tatsuya": { kind: "sub", names: { cn: "达也", en: "Tatsuya", jp: "達也", kr: "타츠야", tw: "達也" }, aliases: ["EVERリーダー"] },
    "touyafather": { kind: "sub", names: { cn: "冬弥的父亲", en: "Toya's Father", jp: "冬弥の父", kr: "토우야의 아버지", tw: "冬彌的爸爸" } },
    "tsukasadoll": { kind: "sub", names: { cn: "兔兔玩偶", en: "Bunny Plushie", jp: "うさぎのぬいぐるみ", kr: "토끼 인형", tw: "兔子玩偶" } },
    "wl3_extra01": { kind: "sub", names: { jp: "少女", cn: "少女", tw: "少女", en: "Girl", kr: "소녀" } },
    "wl3_extra02": { kind: "sub", names: { jp: "ライセ", cn: "来濑", tw: "來瀨", en: "Raise", kr: "라이세" }, aliases: ["青年", "高校生の青年"] },
    "wl3_extra03": { kind: "sub", names: { jp: "ミナト", cn: "凑", tw: "湊", en: "Minato", kr: "미나토" } },
    "wl3_extra04": { kind: "sub", names: { jp: "少女", cn: "少女", tw: "少女", en: "Girl", kr: "소녀" } },
    "wl3_extra05": { kind: "sub", names: { jp: "守屋", cn: "守屋", tw: "守屋", en: "Moriya", kr: "모리야" }, aliases: ["誰かの想い"] },
    "wl3_extra06": { kind: "sub", names: { jp: "間島", cn: "间岛", tw: "間島", en: "Majima", kr: "마지마" }, aliases: ["誰かの想い"] },
    "wl3_extra07": { kind: "sub", names: { jp: "俊輝", cn: "俊辉", tw: "俊輝", en: "Toshiki", kr: "토시키" } },
    "wl3_extra08": { kind: "sub", names: { jp: "大輝", cn: "大辉", tw: "大輝", en: "Daiki", kr: "다이키" } },
    "wondermascot": { kind: "sub", names: { cn: "穿玩偶装的人", en: "Mascot", jp: "着ぐるみ", kr: "인형 탈", tw: "玩偶裝" } },
    "yoshiki": { kind: "sub", names: { cn: "真堂", en: "Shindo", jp: "真堂", kr: "신도", tw: "真堂" } },
    "youta": { kind: "sub", names: { cn: "叶太", en: "Yota", jp: "葉太", kr: "요우타", tw: "葉太" } },
    "yuina": { kind: "sub", names: { cn: "唯奈", en: "Yuina", jp: "唯奈", kr: "유이나", tw: "唯奈" }, aliases: ["みのりのファン"] },
    "yukihira": { kind: "sub", names: { cn: "雪平", en: "Yukihira", jp: "雪平", kr: "유키히라", tw: "雪平" } },
    "yuuka": { kind: "sub", names: { cn: "夕夏", en: "Yuka", jp: "夕夏", kr: "유우카", tw: "夕夏" }, aliases: ["人魚姫"] },
};

const SPECIAL_MODEL_NAMES = {
    "v2_03honami_april2025_school": { names: { cn: "多吃点儿", en: "Mealmonger", jp: "タントオタベ", kr: "마니머거", tw: "「哆吃典」" }, aliases: ["穂波"] },
    "v2_14emu_igs_princess": { names: { jp: "エル", cn: "艾尔", tw: "艾爾", en: "Elle", kr: "엘" } },
    "v2_15nene_april2026_transform": { names: { jp: "咲希が化けた寧々" } },
};

const SPECIAL_EFFECT_NAMES = {
    0: "None",
    1: "BlackIn",
    2: "BlackOut",
    3: "WhiteIn",
    4: "WhiteOut",
    5: "ShakeScreen",
    6: "ShakeWindow",
    7: "ChangeBackground",
    8: "Telop",
    9: "FlashbackIn",
    10: "FlashbackOut",
    11: "ChangeCardStill",
    12: "AmbientColorNormal",
    13: "AmbientColorEvening",
    14: "AmbientColorNight",
    15: "PlayScenarioEffect",
    16: "StopScenarioEffect",
    17: "ChangeBackgroundStill",
    18: "PlaceInfo",
    19: "Movie",
    20: "SekaiIn",
    21: "SekaiOut",
    22: "AttachCharacterShader",
    23: "SimpleSelectable",
    24: "FullScreenText",
    25: "StopShakeScreen",
    26: "StopShakeWindow",
    27: "MemoryIn",
    28: "MemoryOut",
    29: "BlackWipeInLeft",
    30: "BlackWipeOutLeft",
    31: "BlackWipeInRight",
    32: "BlackWipeOutRight",
    33: "BlackWipeInTop",
    34: "BlackWipeOutTop",
    35: "BlackWipeInBottom",
    36: "BlackWipeOutBottom",
    37: "PlayMV",
    38: "FullScreenTextShow",
    39: "FullScreenTextHide",
    40: "SekaiInCenter",
    41: "SekaiOutCenter",
    42: "ChangeCameraPosition",
    43: "ChangeCameraZoomLevel",
    44: "Blur",
};

const SIDE_TO_MSK_SLOT = {
    0: null,
    1: "farLeft",
    2: "farLeft",
    3: "left",
    4: "center",
    5: "center",
    6: "right",
    7: "right",
    8: "farRight",
};

// ==================== Pure Resolution Helpers ====================

export function resolveUnitKey(raw) {
    if (!raw) return null;
    const norm = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "");
    return UNIT_ALIASES[norm] ?? UNIT_ALIASES[String(raw).trim().toLowerCase()] ?? null;
}

export function resolveCharacterIds(raw) {
    if (!raw) return [];
    const tokens = String(raw).split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    const ids = new Set();
    for (const tok of tokens) {
        if (/^\d+$/.test(tok)) {
            const n = Number.parseInt(tok, 10);
            if (CHAR_BY_ID.has(n)) {
                ids.add(n);
                continue;
            }
        }
        const lower = tok.toLowerCase();
        const exact = CHARACTERS.find(c =>
            c.key === lower
            || c.prefix === lower
            || c.en.toLowerCase() === lower
            || c.jp === tok
            || c.zh === tok
            || c.aliases.some(a => a.toLowerCase() === lower),
        );
        if (exact) {
            ids.add(exact.id);
            continue;
        }
        const partial = CHARACTERS.find(c =>
            c.en.toLowerCase().includes(lower)
            || c.jp.includes(tok)
            || c.zh.includes(tok),
        );
        if (partial) {
            ids.add(partial.id);
        } else {
            throw new Error(`Unknown character '${tok}'. Use ID 1..26 or name (e.g. ichika, 17, mafuyu, 奏).`);
        }
    }
    return [...ids].sort((a, b) => a - b);
}

export function cleanSpeakerName(raw) {
    return String(raw ?? "")
        .replace(/[\r\n\u3000]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function stripSubMasterdataAnnotation(raw) {
    return cleanSpeakerName(
        String(raw ?? "").replace(/\s*[（(][^）)]*(?:エイプリルフール|コラボ|april|愚人节|愚人節|仮)[^）)]*[）)]\s*$/iu, ""),
    );
}

export function isPlaceholderSpeakerName(raw) {
    const s = cleanSpeakerName(raw);
    if (!s) return true;
    if (/^[\s?？.。・…—\-_~!！]+$/u.test(s)) return true;
    return s === "声" || s === "Voice" || s === "声音" || s === "聲音" || s === "목소리";
}

export function parseMainCharacterIdFromModel(idOrAsset) {
    const raw = String(idOrAsset ?? "").trim();
    if (!raw) return null;
    const direct = MAIN_CHAR_MODEL_RE.exec(raw);
    if (direct) {
        const cid = Number.parseInt(direct[1], 10);
        return CHAR_BY_ID.has(cid) ? cid : null;
    }
    const child = MAIN_CHAR_CHILD_RE.exec(raw);
    if (child) {
        const key = (child[1] || child[2] || child[3] || "").toLowerCase();
        return CHAR_BY_KEY.get(key)?.id ?? null;
    }
    return null;
}

export function deriveOwnerKey(idOrAsset) {
    let s = String(idOrAsset ?? "").trim();
    if (!s) return null;
    if (s.startsWith("v2_")) s = s.slice(3);
    if (s.startsWith("sub_")) s = s.slice(4);
    if (!s) return null;
    const parts = s.split("_").filter(Boolean);
    while (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (SUB_VARIANT_SEGMENTS.has(last) || /^live\d*$/.test(last)) {
            parts.pop();
        } else {
            break;
        }
    }
    if (parts.length > 0) {
        const last = parts[parts.length - 1];
        const m = /^(.+?)(?:black\d*|young)$/.exec(last);
        if (m && m[1].length >= 3) {
            parts[parts.length - 1] = m[1];
        }
    }
    return parts.join("_") || null;
}

function normalizeOwnerKeyWithKnown(rawKey, keySet) {
    if (!rawKey) return null;
    if (rawKey.endsWith("02")) {
        const stem = rawKey.slice(0, -2);
        if (stem && (keySet.has(stem) || Object.prototype.hasOwnProperty.call(SUB_CHARACTER_NAMES, stem))) {
            return stem;
        }
    }
    return rawKey;
}

const SHARED_MOTION_SUFFIXES = new Set(["black", "zoom", "stage", "casual", "lesson", "rw", "sunset", "cloth"]);

function deriveSubMotionStem(modelId) {
    let s = String(modelId ?? "").trim();
    const prefix = s.startsWith("v2_") ? "v2_" : "";
    if (prefix) s = s.slice(3);
    if (!s.startsWith("sub_")) return null;
    const parts = s.slice(4).split("_").filter(Boolean);
    while (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (SHARED_MOTION_SUFFIXES.has(last) || /^live\d*$/.test(last)) {
            parts.pop();
        } else {
            break;
        }
    }
    if (parts.length > 0) {
        const m = /^(.+?)black\d*$/.exec(parts[parts.length - 1]);
        if (m && m[1].length >= 3) parts[parts.length - 1] = m[1];
    }
    return parts.length > 0 ? `${prefix}sub_${parts.join("_")}` : null;
}

export function inferMotionBundleCandidates(modelId) {
    if (!modelId) return [];
    const out = [];
    const add = (name) => {
        if (!name) return;
        const bundle = `live2d/motion/${name}`;
        if (!out.includes(bundle)) out.push(bundle);
    };
    const mainChar = /^(v2_)?(\d{2}[a-z]+)_/.exec(modelId);
    if (mainChar) {
        add(`${mainChar[1] ?? ""}${mainChar[2]}_motion_base`);
        return out;
    }
    const collab = /^(v2_)?(clb\d+_\d{2}[a-z]+\d*)/.exec(modelId);
    if (collab) {
        add(`${modelId}_motion_base`);
        add(`${collab[1] ?? ""}${collab[2]}_motion_base`);
        return out;
    }
    const sub = /^(v2_)?(sub_[a-z0-9]+)/.exec(modelId);
    if (sub) {
        const stem = deriveSubMotionStem(modelId);
        if (stem) add(`${stem}_motion_base`);
        add(`${modelId}_motion_base`);
        const ownerKey = deriveOwnerKey(modelId);
        const normOwner = normalizeOwnerKeyWithKnown(ownerKey, new Set());
        if (ownerKey) add(`${sub[1] ?? ""}sub_${ownerKey}_motion_base`);
        if (normOwner && normOwner !== ownerKey) add(`${sub[1] ?? ""}sub_${normOwner}_motion_base`);
        const base = `${sub[1] ?? ""}${sub[2]}`;
        add(`${base}_motion_base`);
        const stripped = base.replace(/(?:black|white|zoom|young|child)?\d*$/, "");
        if (stripped && stripped !== base && stripped.length > 4) {
            add(`${stripped}_motion_base`);
        }
        return out;
    }
    add(`${modelId}_motion_base`);
    return out;
}

function pickLocalizedName(names, region) {
    if (!names || typeof names !== "object") return null;
    if (names[region]) return names[region];
    if (region === "tw" && names.cn) return names.cn;
    if (region === "cn" && names.tw) return names.tw;
    return names.jp || names.cn || names.en || names.tw || names.kr || null;
}

function buildCharacter2dLookups(chara2ds) {
    const byAsset = new Map();
    const byOwner = new Map();
    const byId = new Map();
    for (const c of chara2ds ?? []) {
        if (typeof c?.id === "number") byId.set(c.id, c);
        const asset = String(c?.assetName ?? "").trim();
        if (!asset) continue;
        if (!byAsset.has(asset)) byAsset.set(asset, c);
        const ok = deriveOwnerKey(asset);
        if (ok && !byOwner.has(ok)) byOwner.set(ok, c);
    }
    return { byAsset, byOwner, byId };
}

function findMatchingChara2d(modelId, assetName, rawC2dIds, lookups) {
    if (Array.isArray(rawC2dIds)) {
        for (const cid of rawC2dIds) {
            const hit = lookups.byId.get(cid);
            if (hit) return hit;
        }
    }
    if (assetName && lookups.byAsset.has(assetName)) return lookups.byAsset.get(assetName);
    if (lookups.byAsset.has(modelId)) return lookups.byAsset.get(modelId);
    const ok = deriveOwnerKey(assetName || modelId);
    if (ok && lookups.byOwner.has(ok)) return lookups.byOwner.get(ok);
    return null;
}

/**
 * Pure model catalog normalizer supporting:
 * 1. `models.json` format 2 (`format: 2, models: [...]`)
 * 2. `models.json` format 1 (`format: 1, models: [...]`, enriched with masterdata + built-in names)
 * 3. Storage directory fallback (`directories: [...]` + `character2ds.json` + `subGameCharacters.json` + built-in names)
 */
function isUntranslatedRegionName(regionKey, raw) {
    const s = cleanSpeakerName(raw);
    if (!s || regionKey === "jp") return false;
    if (/[\u3040-\u30FF]/.test(s)) return true;
    if (regionKey === "en" && /[\u4E00-\u9FFF]/.test(s)) return true;
    return false;
}

function overlayCleanRegionNames(target, source) {
    if (!source || typeof source !== "object") return;
    for (const [r, val] of Object.entries(source)) {
        const clean = cleanSpeakerName(val);
        if (clean && !isUntranslatedRegionName(r, clean)) target[r] = clean;
    }
}

export function normalizeCatalogModels(rawInput, ctx = {}) {
    const region = ctx.region ?? "jp";
    const chara2ds = rawInput?.chara2ds ?? ctx.chara2ds ?? [];
    const subGameChars = rawInput?.subGameChars ?? ctx.subGameChars ?? [];
    const lookups = buildCharacter2dLookups(chara2ds);
    const subCharById = new Map();
    for (const s of subGameChars ?? []) {
        if (typeof s?.id === "number" && typeof s?.name === "string") {
            const clean = stripSubMasterdataAnnotation(s.name);
            if (clean) subCharById.set(s.id, clean);
        }
    }

    const rawModels = Array.isArray(rawInput?.models)
        ? rawInput.models
        : Array.isArray(rawInput?.directories)
            ? rawInput.directories.map(id => ({ id }))
            : Array.isArray(rawInput)
                ? rawInput
                : [];

    // Pass 1: classify and extract raw ownerKeys so pass 2 can merge `foo02 -> foo`
    const staged = [];
    const ownerKeySet = new Set();
    for (const raw of rawModels) {
        const id = String(typeof raw === "string" ? raw : (raw?.id ?? "")).trim();
        if (!id) continue;
        const entry = typeof raw === "string" ? { id } : raw;
        const matchedC2d = findMatchingChara2d(id, entry.assetName, entry.character2dIds, lookups);
        const assetName = String(entry.assetName || matchedC2d?.assetName || "").trim() || null;
        const iconBundle = String(entry.iconBundle || matchedC2d?.characterIconAssetbundleName || "").trim() || null;

        let characterId = Number.isInteger(entry.characterId) ? entry.characterId : null;
        if (characterId == null && matchedC2d?.characterType === "game_character" && Number.isInteger(matchedC2d.characterId)) {
            characterId = matchedC2d.characterId;
        }
        if (characterId == null) {
            characterId = parseMainCharacterIdFromModel(id) ?? parseMainCharacterIdFromModel(assetName);
        }

        let subCharacterId = Number.isInteger(entry.subCharacterId) ? entry.subCharacterId : null;
        if (subCharacterId == null && matchedC2d?.characterType === "sub_game_character" && Number.isInteger(matchedC2d.characterId)) {
            subCharacterId = matchedC2d.characterId;
        }

        let kind;
        if (characterId != null) {
            kind = "character";
        } else if (
            entry.kind === "collab"
            || (iconBundle && iconBundle.endsWith("_collabo"))
            || COLLAB_MODEL_RE.test(id)
            || (assetName && COLLAB_MODEL_RE.test(assetName))
        ) {
            kind = "collab";
        } else {
            const probeOwner = String(entry.ownerKey || deriveOwnerKey(id) || deriveOwnerKey(assetName) || "").trim() || null;
            const hasKnownSub = Boolean(
                probeOwner && (
                    Object.prototype.hasOwnProperty.call(SUB_CHARACTER_NAMES, probeOwner)
                    || (probeOwner.endsWith("02") && Object.prototype.hasOwnProperty.call(SUB_CHARACTER_NAMES, probeOwner.slice(0, -2)))
                ),
            );
            const hasNonPlaceholderName = Boolean(entry.name && !isPlaceholderSpeakerName(entry.name));
            if (
                entry.kind === "sub"
                || matchedC2d?.characterType === "sub_game_character"
                || /^(?:v2_)?sub_/.test(id)
                || (assetName && /^(?:v2_)?sub_/.test(assetName))
                || hasKnownSub
                || hasNonPlaceholderName
            ) {
                kind = "sub";
            } else {
                kind = "mob";
            }
        }

        const rawOwnerKey = kind === "character"
            ? null
            : (String(entry.ownerKey ?? "").trim() || deriveOwnerKey(id) || deriveOwnerKey(assetName));
        if (rawOwnerKey) ownerKeySet.add(rawOwnerKey);

        staged.push({
            id,
            entry,
            matchedC2d,
            assetName,
            iconBundle,
            characterId,
            subCharacterId,
            kind,
            rawOwnerKey,
        });
    }

    // Pass 2: finalize ownerKey (`foo02 -> foo`), merge names/aliases, and build clean output objects
    return staged.map((item) => {
        const { id, entry, matchedC2d, assetName, iconBundle, characterId, subCharacterId, kind, rawOwnerKey } = item;
        const ownerKey = kind === "character" ? null : normalizeOwnerKeyWithKnown(rawOwnerKey, ownerKeySet);
        const motion = entry.motion ?? inferMotionBundleCandidates(id)[0] ?? null;
        const unit = entry.unit || matchedC2d?.unit || (characterId ? CHAR_BY_ID.get(characterId)?.unit : null) || null;
        const episodeCount = Number.isFinite(entry.episodeCount) ? entry.episodeCount : 0;
        const episodes = Array.isArray(entry.episodes) ? entry.episodes.filter(x => typeof x === "string") : [];

        if (kind === "character") {
            const baseChar = characterId ? CHAR_BY_ID.get(characterId) : null;
            const specialBuiltin = SPECIAL_MODEL_NAMES[id] ?? null;
            const rawNames = entry.names && typeof entry.names === "object" ? entry.names : {};
            const subMasterName = subCharacterId != null ? (subCharById.get(subCharacterId) ?? null) : null;
            const hasSpecialName = Boolean(entry.name || Object.keys(rawNames).length > 0 || specialBuiltin || subMasterName);

            const names = {};
            if (hasSpecialName) {
                Object.assign(names, specialBuiltin?.names ?? {});
                overlayCleanRegionNames(names, rawNames);
                if (subMasterName && !names[region] && !isUntranslatedRegionName(region, subMasterName)) {
                    names[region] = subMasterName;
                }
                const cleanEntryName = cleanSpeakerName(entry.name);
                if (cleanEntryName && !names[region] && !isUntranslatedRegionName(region, cleanEntryName)) {
                    names[region] = cleanEntryName;
                }
            } else if (baseChar) {
                names.jp = baseChar.jp;
                names.cn = baseChar.zh;
                names.en = baseChar.en;
            }
            const cleanEntryName = cleanSpeakerName(entry.name);
            const name = hasSpecialName
                ? ((!isUntranslatedRegionName(region, cleanEntryName) && cleanEntryName)
                    || pickLocalizedName(names, region)
                    || cleanEntryName
                    || (baseChar ? (region === "cn" ? baseChar.zh : region === "en" ? baseChar.en : baseChar.jp) : id))
                : (baseChar ? (region === "cn" ? baseChar.zh : region === "en" ? baseChar.en : baseChar.jp) : id);

            const aliasSet = new Set();
            const seenValues = new Set([name, ...Object.values(names)].filter(Boolean));
            for (const a of [...(Array.isArray(entry.aliases) ? entry.aliases : []), ...(specialBuiltin?.aliases ?? [])]) {
                const clean = cleanSpeakerName(a);
                if (clean && !seenValues.has(clean)) aliasSet.add(clean);
            }

            return {
                id,
                motion,
                kind,
                characterId,
                subCharacterId,
                ownerKey: null,
                unit,
                name,
                names,
                aliases: [...aliasSet],
                episodeCount,
                episodes,
                ...(hasSpecialName && baseChar ? { characterName: `${baseChar.en} / ${baseChar.jp}` } : {}),
            };
        }

        const builtin = ownerKey ? (SUB_CHARACTER_NAMES[ownerKey] ?? null) : null;
        const rawNames = entry.names && typeof entry.names === "object" ? entry.names : {};
        const subMasterName = subCharacterId != null ? (subCharById.get(subCharacterId) ?? null) : null;
        const names = {};
        if (builtin?.names) Object.assign(names, builtin.names);
        if (subMasterName && !rawNames[region] && !entry.name && !names[region] && !isUntranslatedRegionName(region, subMasterName)) {
            names[region] = subMasterName;
        }
        overlayCleanRegionNames(names, rawNames);
        const explicitName = cleanSpeakerName(entry.name);
        if (explicitName && !names[region] && !isUntranslatedRegionName(region, explicitName)) {
            names[region] = explicitName;
        }

        const name = (!isUntranslatedRegionName(region, explicitName) && explicitName)
            || pickLocalizedName(names, region)
            || explicitName
            || subMasterName
            || ownerKey
            || id;
        const seenValues = new Set([name, ...Object.values(names)].filter(Boolean));
        const aliasList = [];
        const addAlias = (val) => {
            const clean = cleanSpeakerName(val);
            if (!clean || seenValues.has(clean) || aliasList.includes(clean)) return;
            aliasList.push(clean);
        };
        for (const a of Array.isArray(entry.aliases) ? entry.aliases : []) addAlias(a);
        if (builtin?.names) {
            for (const val of Object.values(builtin.names)) addAlias(val);
        }
        for (const a of builtin?.aliases ?? []) addAlias(a);
        if (subMasterName) addAlias(subMasterName);

        return {
            id,
            motion,
            kind,
            characterId: null,
            subCharacterId,
            ownerKey,
            unit,
            name,
            names,
            aliases: aliasList,
            episodeCount,
            episodes,
        };
    });
}

function compactSearchText(s) {
    return String(s ?? "").toLowerCase().replace(/[\s\u3000]+/g, "");
}

function modelSearchScore(model, rawQuery) {
    const q = String(rawQuery ?? "").trim().toLowerCase();
    if (!q) return 1;
    const tokens = q.split(/[\s\u3000]+/).filter(Boolean);
    const baseChar = model.characterId ? CHAR_BY_ID.get(model.characterId) : null;

    const nameFields = [
        model.name,
        model.ownerKey,
        ...Object.values(model.names ?? {}),
        ...(model.aliases ?? []),
        ...(baseChar ? [baseChar.key, baseChar.prefix, baseChar.en, baseChar.jp, baseChar.zh, ...(baseChar.aliases ?? [])] : []),
    ].filter(Boolean).map(v => String(v));

    const nameLower = nameFields.map(v => v.toLowerCase());
    const nameCompact = nameFields.map(compactSearchText);
    const idLower = model.id.toLowerCase();
    const idCompact = compactSearchText(model.id);

    const tokenMatches = (tok) => {
        const tokCompact = compactSearchText(tok);
        if (nameLower.some(f => f === tok) || nameCompact.some(f => f === tokCompact) || idLower === tok) return 3;
        if (nameLower.some(f => f.includes(tok)) || nameCompact.some(f => f.includes(tokCompact))) return 2;
        if (idLower.includes(tok) || idCompact.includes(tokCompact)) return 1;
        return 0;
    };

    const wholeScore = tokenMatches(q);
    if (wholeScore > 0) return wholeScore;
    if (tokens.length <= 1) return 0;

    let minTokenScore = 3;
    for (const tok of tokens) {
        const sc = tokenMatches(tok);
        if (sc === 0) return 0;
        if (sc < minTokenScore) minTokenScore = sc;
    }
    return minTokenScore;
}

export function filterAndRankCatalogModels(models, opts = {}) {
    const rawKind = opts.kind ? String(opts.kind).trim().toLowerCase() : null;
    if (rawKind && rawKind !== "all" && !MODEL_KINDS.includes(rawKind)) {
        throw new Error(`Invalid model --kind '${opts.kind}' (expected ${MODEL_KINDS.join("|")}|all).`);
    }
    const charIds = opts.char ? new Set(resolveCharacterIds(opts.char)) : null;
    const searchQuery = String(opts.search || opts.query || opts.filter || "").trim();

    const scored = [];
    for (const m of models ?? []) {
        if (opts.v2Only && !m.id.startsWith("v2_")) continue;
        if (rawKind && rawKind !== "all" && m.kind !== rawKind) continue;
        if (charIds && (!m.characterId || !charIds.has(m.characterId))) continue;
        const score = searchQuery ? modelSearchScore(m, searchQuery) : 1;
        if (score === 0) continue;
        scored.push({ model: m, score });
    }

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ka = KIND_ORDER[a.model.kind] ?? 9;
        const kb = KIND_ORDER[b.model.kind] ?? 9;
        if (ka !== kb) return ka - kb;
        const av2 = Number(a.model.id.startsWith("v2_"));
        const bv2 = Number(b.model.id.startsWith("v2_"));
        if (bv2 !== av2) return bv2 - av2;
        const variantWeight = (id) => (/(?:^|_)black\d*(?:_|$)|[a-z]black\d*$/.test(id) ? 2 : (/_zoom$/.test(id) ? 1 : 0));
        const aSil = variantWeight(a.model.id);
        const bSil = variantWeight(b.model.id);
        if (aSil !== bSil) return aSil - bSil;
        if ((b.model.episodeCount ?? 0) !== (a.model.episodeCount ?? 0)) {
            return (b.model.episodeCount ?? 0) - (a.model.episodeCount ?? 0);
        }
        const oa = a.model.ownerKey ?? "";
        const ob = b.model.ownerKey ?? "";
        if (oa !== ob) return oa.localeCompare(ob);
        return a.model.id.localeCompare(b.model.id);
    });

    return scored.map(s => s.model);
}

export function formatLocalizedModelTag(model) {
    const parts = [];
    const seen = new Set();
    const primary = cleanSpeakerName(model.name);
    if (primary) seen.add(primary);
    const cn = cleanSpeakerName(model.names?.cn);
    const jp = cleanSpeakerName(model.names?.jp);
    const en = cleanSpeakerName(model.names?.en);
    if (cn && !seen.has(cn)) { parts.push(`CN: ${cn}`); seen.add(cn); }
    if (jp && !seen.has(jp)) { parts.push(`JP: ${jp}`); seen.add(jp); }
    if (en && !seen.has(en)) { parts.push(`EN: ${en}`); seen.add(en); }
    const locSuffix = parts.length > 0 ? ` (${parts.join(" / ")})` : "";
    const aliases = (model.aliases ?? []).filter(a => !seen.has(a)).slice(0, 3);
    const aliasSuffix = aliases.length > 0 ? ` [aka: ${aliases.join(", ")}]` : "";
    return `${primary || model.ownerKey || model.id}${locSuffix}${aliasSuffix}`;
}

export function isStoryCgBackground(bgId) {
    if (!bgId) return false;
    if (bgId.startsWith("bg_a")) {
        const num = Number.parseInt(bgId.slice(4), 10);
        return Number.isFinite(num) && num >= 1 && num <= 99;
    }
    return bgId.startsWith("bg_s");
}

export function parseSelector(raw) {
    const value = String(raw ?? "").trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) {
        return { kind: "url", url: value, canonical: value };
    }
    if (value.endsWith(".json") && value.includes("/")) {
        return { kind: "path", path: value.replace(/^\/+/, ""), canonical: value };
    }
    const talkShort = /^talk:(\d+)$/.exec(value);
    if (talkShort) {
        const actionSetId = Number.parseInt(talkShort[1], 10);
        return { kind: "area", areaId: null, actionSetId, canonical: `talk:${actionSetId}` };
    }
    const selfMatch = /^self:([A-Za-z0-9_.-]+)$/.exec(value);
    if (selfMatch) {
        return { kind: "self", scenarioId: selfMatch[1], canonical: `self:${selfMatch[1]}` };
    }
    const full = /^(event|unit|card|special|area):([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value);
    if (!full) return null;
    const [, kind, group, ep] = full;
    if (kind === "event") {
        if (!/^\d+$/.test(group) || !/^\d+$/.test(ep)) return null;
        return {
            kind: "event",
            eventId: Number.parseInt(group, 10),
            episodeNo: Number.parseInt(ep, 10),
            canonical: `event:${Number.parseInt(group, 10)}/${Number.parseInt(ep, 10)}`,
        };
    }
    if (kind === "unit") {
        if (!/^\d+$/.test(ep)) return null;
        return {
            kind: "unit",
            chapterOrUnit: group,
            episodeNo: Number.parseInt(ep, 10),
            canonical: `unit:${group}/${Number.parseInt(ep, 10)}`,
        };
    }
    if (kind === "card") {
        if (!/^\d+$/.test(group)) return null;
        const partMap = { former: "former", first: "former", "1": "former", latter: "latter", second: "latter", "2": "latter" };
        const part = partMap[ep.toLowerCase()];
        if (!part) return null;
        return {
            kind: "card",
            cardId: Number.parseInt(group, 10),
            part,
            canonical: `card:${Number.parseInt(group, 10)}/${part}`,
        };
    }
    if (kind === "special") {
        if (!/^\d+$/.test(group) || !/^\d+$/.test(ep)) return null;
        return {
            kind: "special",
            specialId: Number.parseInt(group, 10),
            episodeNo: Number.parseInt(ep, 10),
            canonical: `special:${Number.parseInt(group, 10)}/${Number.parseInt(ep, 10)}`,
        };
    }
    if (kind === "area") {
        if (!/^\d+$/.test(group) || !/^\d+$/.test(ep)) return null;
        return {
            kind: "area",
            areaId: Number.parseInt(group, 10),
            actionSetId: Number.parseInt(ep, 10),
            canonical: `area:${Number.parseInt(group, 10)}/${Number.parseInt(ep, 10)}`,
        };
    }
    return null;
}

function truncate(text, maxLen = 72) {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim();
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, Math.max(1, maxLen - 1))}…`;
}

function encodePath(p) {
    return String(p).split("/").map(encodeURIComponent).join("/");
}

// ==================== Disk Cache & HTTP Helpers ====================

function cacheFilePath(namespace, key, ext = "json") {
    const safeKey = createHash("sha256").update(`${namespace}:${key}`).digest("hex").slice(0, 24);
    const prefix = namespace.replace(/[^A-Za-z0-9_-]+/g, "_");
    return join(CACHE_DIR, `${prefix}_${safeKey}.${ext}`);
}

async function readCacheFile(filePath, ttlMs, noCache) {
    if (noCache) return null;
    try {
        const info = await stat(filePath);
        if (ttlMs > 0 && Date.now() - info.mtimeMs > ttlMs) return null;
        return await readFile(filePath);
    } catch {
        return null;
    }
}

async function writeCacheFile(filePath, data) {
    try {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(filePath, data);
    } catch {
        // Cache write errors are non-fatal (e.g. read-only tmpfs).
    }
}

async function fetchJsonWithFallback(urls, cacheNs, cacheKey, ttlMs, noCache) {
    const filePath = cacheFilePath(cacheNs, cacheKey, "json");
    const cached = await readCacheFile(filePath, ttlMs, noCache);
    if (cached) {
        return JSON.parse(cached.toString("utf8"));
    }
    let lastErr = null;
    for (const url of urls) {
        try {
            const res = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
            });
            if (res.ok) {
                const text = await res.text();
                const parsed = JSON.parse(text);
                await writeCacheFile(filePath, text);
                return parsed;
            }
            lastErr = new Error(`${url}: HTTP ${res.status}`);
            if (res.status === 404 && urls.length === 1) throw lastErr;
        } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
        }
    }
    throw lastErr ?? new Error(`Failed to fetch ${cacheKey}`);
}

function fetchMaster(region, filename, opts) {
    const domains = MASTER_DOMAINS[opts.line] ?? MASTER_DOMAINS.main;
    const urls = domains.map(d => `${d}/${region}/master/${filename}`);
    return fetchJsonWithFallback(urls, "master", `${region}:${filename}`, TTL_MASTER_MS, opts.noCache);
}

function storageUrl(region, relPath, line = "main") {
    const domain = (STORAGE_DOMAINS[line] ?? STORAGE_DOMAINS.main)[0];
    return `${domain}/sekai-${region}-assets/${relPath.replace(/^\/+/, "")}`;
}

function fetchStorageJson(region, relPath, opts, ttlMs = TTL_SCENARIO_MS) {
    const clean = relPath.replace(/^\/+/, "");
    const domains = STORAGE_DOMAINS[opts.line] ?? STORAGE_DOMAINS.main;
    const urls = domains.map(d => `${d}/sekai-${region}-assets/${clean}`);
    return fetchJsonWithFallback(urls, "storage", `${region}:${clean}`, ttlMs, opts.noCache);
}

async function fetchDirectoryListing(region, dirPath, opts) {
    const clean = dirPath.replace(/^\/+/, "").replace(/\/?$/, "/");
    const data = await fetchStorageJson(region, clean, opts, TTL_MASTER_MS);
    const directories = Array.isArray(data.directories)
        ? data.directories.filter(x => typeof x === "string")
        : [];
    const files = Array.isArray(data.files)
        ? data.files.map(x => (typeof x === "string" ? x : x?.name)).filter(x => typeof x === "string")
        : [];
    return { directories, files };
}

async function loadSePackIndex(region, opts) {
    const results = await Promise.all(
        SE_PACKS.map(async (pack) => {
            try {
                const { files } = await fetchDirectoryListing(region, `sound/scenario/se/${pack}/`, opts);
                return { pack, files };
            } catch {
                return { pack, files: [] };
            }
        }),
    );
    const byBare = new Map();
    const allItems = [];
    for (const { pack, files } of results) {
        for (const file of files) {
            const label = file.replace(AUDIO_EXT_RE, "");
            if (!label) continue;
            if (!byBare.has(label)) byBare.set(label, pack);
            allItems.push({ pack, label, path: `${pack}/${label}` });
        }
    }
    return { byBare, allItems };
}

async function loadBgmMetadata(region, opts) {
    const [tracks, cats] = await Promise.all([
        fetchMaster(region, "musicSoundTracks.json", opts).catch(() => []),
        fetchMaster(region, "musicSoundTrackCategories.json", opts).catch(() => []),
    ]);
    const catById = new Map();
    for (const c of cats ?? []) {
        if (typeof c?.id === "number" && typeof c?.name === "string") catById.set(c.id, c.name);
    }
    const byName = new Map();
    const list = [];
    for (const t of tracks ?? []) {
        const dir = String(t?.assetbundleName ?? "").trim().replace(/^\/+|\/+$/g, "");
        const rawFile = String(t?.assetbundleFileName || dir.split("/").pop() || "").trim().replace(AUDIO_EXT_RE, "");
        if (!dir || !rawFile) continue;
        let canonical;
        if (dir.startsWith("sound/scenario/bgm/")) {
            const sub = dir.slice("sound/scenario/bgm/".length);
            canonical = sub === rawFile ? rawFile : `${sub}/${rawFile}`;
        } else {
            canonical = `${dir}/${rawFile}`;
        }
        const entry = {
            name: canonical,
            bareDir: dir.startsWith("sound/scenario/bgm/") ? dir.slice("sound/scenario/bgm/".length) : canonical,
            title: t.title || canonical,
            category: catById.get(t.musicSoundTrackCategoryId) ?? "",
            mysekai: dir.startsWith("mysekai/"),
        };
        byName.set(canonical, entry);
        if (!byName.has(entry.bareDir)) byName.set(entry.bareDir, entry);
        list.push(entry);
    }
    return { byName, list };
}

async function loadCharacter2dMap(region, opts) {
    const list = await fetchMaster(region, "character2ds.json", opts).catch(() => []);
    const map = new Map();
    for (const item of list ?? []) {
        if (typeof item?.id === "number") map.set(item.id, item);
    }
    return map;
}

async function loadSubGameCharacterMap(region, opts) {
    const list = await fetchMaster(region, "subGameCharacters.json", opts).catch(() => []);
    const map = new Map();
    for (const item of list ?? []) {
        if (typeof item?.id === "number" && typeof item?.name === "string") {
            const clean = stripSubMasterdataAnnotation(item.name);
            if (clean) map.set(item.id, clean);
        }
    }
    return map;
}

async function fetchTranslationEpisode(kind, fileId, episodeKey, locale, opts) {
    if (!locale || (locale !== "zh-CN" && locale !== "en-US")) return null;
    const prefixMap = {
        event: "eventStory/event_",
        card: "cardStory/card_",
        area: "areaTalk/group_",
    };
    const prefix = prefixMap[kind];
    if (!prefix || fileId == null) return null;
    const base = locale === "en-US"
        ? `${TRANSLATION_BASE}/v2/en-US/translation`
        : `${TRANSLATION_BASE}/translation`;
    const url = `${base}/${prefix}${fileId}.json`;
    try {
        const data = await fetchJsonWithFallback([url], "translation", `${locale}:${kind}:${fileId}`, TTL_SCENARIO_MS, opts.noCache);
        const episodes = data?.episodes ?? data;
        return episodes?.[String(episodeKey)] ?? null;
    } catch {
        return null;
    }
}

// ==================== Story Selector -> Scenario Path Resolver ====================

function selectCardParts(episodes) {
    const sorted = [...episodes].sort((a, b) => (a.seq ?? a.id ?? 0) - (b.seq ?? b.id ?? 0));
    if (sorted.length === 0) return [];
    return sorted.slice(0, 2);
}

async function resolveSelectorTarget(parsed, region, opts) {
    if (parsed.kind === "url") {
        return {
            selector: parsed.canonical,
            storyKind: "event",
            scenarioUrl: parsed.url,
            scenarioPath: null,
            storyTitle: "",
            episodeTitle: "",
            translationRef: null,
        };
    }
    if (parsed.kind === "path") {
        return {
            selector: parsed.canonical,
            storyKind: "event",
            scenarioPath: parsed.path,
            scenarioUrl: storageUrl(region, parsed.path, opts.line),
            storyTitle: "",
            episodeTitle: "",
            translationRef: null,
        };
    }
    if (parsed.kind === "event") {
        const [events, stories] = await Promise.all([
            fetchMaster(region, "events.json", opts),
            fetchMaster(region, "eventStories.json", opts),
        ]);
        const story = stories.find(s => s.eventId === parsed.eventId);
        if (!story) throw new Error(`Event story ${parsed.eventId} not found on region '${region}'.`);
        const ep = (story.eventStoryEpisodes ?? []).find(e => e.episodeNo === parsed.episodeNo);
        if (!ep) throw new Error(`Episode ${parsed.episodeNo} not found in event ${parsed.eventId}.`);
        const ev = events.find(e => e.id === parsed.eventId);
        const relPath = `event_story/${story.assetbundleName}/scenario/${ep.scenarioId}.json`;
        return {
            selector: parsed.canonical,
            storyKind: "event",
            scenarioId: ep.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: ev?.name ?? `Event ${parsed.eventId}`,
            episodeTitle: ep.title ?? `Ep ${parsed.episodeNo}`,
            translationRef: { kind: "event", fileId: parsed.eventId, episodeKey: parsed.episodeNo },
        };
    }
    if (parsed.kind === "unit") {
        const [unitStories, unitProfiles] = await Promise.all([
            fetchMaster(region, "unitStories.json", opts),
            fetchMaster(region, "unitProfiles.json", opts).catch(() => []),
        ]);
        const normalizedUnit = resolveUnitKey(parsed.chapterOrUnit);
        let matchedStory = null;
        let matchedChapter = null;
        for (const us of unitStories) {
            for (const ch of us.chapters ?? []) {
                if (ch.assetbundleName === parsed.chapterOrUnit) {
                    matchedStory = us;
                    matchedChapter = ch;
                    break;
                }
            }
            if (matchedChapter) break;
        }
        if (!matchedChapter && normalizedUnit) {
            matchedStory = unitStories.find(us => us.unit === normalizedUnit) ?? null;
            matchedChapter = matchedStory?.chapters?.[0] ?? null;
        }
        if (!matchedChapter) {
            throw new Error(`Unit chapter '${parsed.chapterOrUnit}' not found on region '${region}'.`);
        }
        const ep = (matchedChapter.episodes ?? []).find(e => e.episodeNo === parsed.episodeNo);
        if (!ep) throw new Error(`Episode ${parsed.episodeNo} not found in unit chapter '${matchedChapter.assetbundleName}'.`);
        const profile = unitProfiles.find(p => p.unit === matchedStory.unit);
        const relPath = `scenario/unitstory/${matchedChapter.assetbundleName}/${ep.scenarioId}.json`;
        return {
            selector: `unit:${matchedChapter.assetbundleName}/${ep.episodeNo}`,
            storyKind: "unit",
            scenarioId: ep.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: matchedChapter.title || profile?.unitName || matchedStory.unit,
            episodeTitle: ep.title ?? `Ep ${ep.episodeNo}`,
            translationRef: null,
        };
    }
    if (parsed.kind === "card") {
        const [cards, episodes] = await Promise.all([
            fetchMaster(region, "cards.json", opts),
            fetchMaster(region, "cardEpisodes.json", opts),
        ]);
        const card = cards.find(c => c.id === parsed.cardId);
        if (!card) throw new Error(`Card ${parsed.cardId} not found on region '${region}'.`);
        const parts = selectCardParts(episodes.filter(e => e.cardId === parsed.cardId));
        const idx = parsed.part === "latter" ? 1 : 0;
        const ep = parts[idx];
        if (!ep) throw new Error(`Card ${parsed.cardId} has no '${parsed.part}' side story.`);
        const baseDir = region === "en" ? "character/member_scenario" : "character/member";
        const relPath = `${baseDir}/${card.assetbundleName}/${ep.scenarioId}.json`;
        return {
            selector: `card:${parsed.cardId}/${parsed.part}`,
            storyKind: "card",
            scenarioId: ep.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: card.prefix || `Card ${parsed.cardId}`,
            episodeTitle: ep.title || parsed.part,
            translationRef: { kind: "card", fileId: parsed.cardId, episodeKey: idx + 1 },
        };
    }
    if (parsed.kind === "area") {
        const [actions, areas] = await Promise.all([
            fetchMaster(region, "actionSets.json", opts),
            fetchMaster(region, "areas.json", opts).catch(() => []),
        ]);
        const action = actions.find(a => a.id === parsed.actionSetId);
        if (!action || !action.scenarioId) {
            throw new Error(`Area actionSet ${parsed.actionSetId} not found on region '${region}'.`);
        }
        const area = areas.find(a => a.id === action.areaId);
        const group = Math.floor(action.id / 100);
        const relPath = `scenario/actionset/group${group}/${action.scenarioId}.json`;
        return {
            selector: `area:${action.areaId}/${action.id}`,
            storyKind: "area",
            scenarioId: action.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: area ? (area.subName ? `${area.name} - ${area.subName}` : area.name) : `Area ${action.areaId}`,
            episodeTitle: `ActionSet ${action.id}`,
            translationRef: { kind: "area", fileId: group, episodeKey: action.scenarioId },
        };
    }
    if (parsed.kind === "special") {
        const specials = await fetchMaster(region, "specialStories.json", opts);
        const story = specials.find(s => s.id === parsed.specialId);
        if (!story) throw new Error(`Special story ${parsed.specialId} not found on region '${region}'.`);
        const ep = (story.episodes ?? []).find(e => e.episodeNo === parsed.episodeNo);
        if (!ep) throw new Error(`Episode ${parsed.episodeNo} not found in special story ${parsed.specialId}.`);
        const relPath = `scenario/special/${ep.assetbundleName}/${ep.scenarioId}.json`;
        return {
            selector: `special:${parsed.specialId}/${parsed.episodeNo}`,
            storyKind: "special",
            scenarioId: ep.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: story.title || `Special ${parsed.specialId}`,
            episodeTitle: ep.title || `Ep ${parsed.episodeNo}`,
            translationRef: null,
        };
    }
    if (parsed.kind === "self") {
        const relPath = `scenario/profile/${parsed.scenarioId}.json`;
        return {
            selector: `self:${parsed.scenarioId}`,
            storyKind: "self",
            scenarioId: parsed.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: "Self Introduction",
            episodeTitle: parsed.scenarioId,
            translationRef: null,
        };
    }
    throw new Error(`Unsupported selector '${parsed.canonical}'.`);
}

// ==================== Pure Scenario Extractor (Study Report) ====================

function buildMskVoiceString(voiceIdRaw, voiceChara2dId, fallbackChara2dId, storyKind, scenarioId, chara2dById, region) {
    const voiceId = String(voiceIdRaw ?? "").trim();
    if (!voiceId) return null;
    if (voiceId.startsWith("partvoice")) {
        const c2dId = voiceChara2dId || fallbackChara2dId || 0;
        const c2d = c2dId ? chara2dById?.get(c2dId) : null;
        if (c2d?.assetName && c2d?.unit) {
            const chara = `${c2d.assetName}_${c2d.unit}`;
            if (chara.startsWith("v2_") || chara.startsWith("clb")) {
                return `voice(story:part_voice_${chara}:${voiceId}@${region})`;
            }
            return `voice(part:${chara}:${voiceId}@${region})`;
        }
    }
    const kind = storyKind === "card" ? "card" : storyKind === "area" ? "area" : "story";
    return `voice(${kind}:${scenarioId}:${voiceId}@${region})`;
}

/**
 * Pure scenario analyzer: walks `IScenarioData` snippets in playback order and extracts
 * everything an AI agent needs to learn from an official Project SEKAI script.
 */
export function extractScenarioStudy(scenario, ctx = {}) {
    const region = ctx.region ?? "jp";
    const line = ctx.line ?? "main";
    const storyKind = ctx.storyKind ?? "event";
    const scenarioId = scenario.ScenarioId || ctx.scenarioId || "";
    const chara2dById = ctx.chara2dById ?? new Map();
    const subGameCharById = ctx.subGameCharById ?? new Map();
    const sePackByName = ctx.sePackByName ?? new Map();
    const bgmTitleByName = ctx.bgmTitleByName ?? new Map();
    const translationTalk = ctx.translationEpisode?.talkData ?? null;
    const maxExamples = ctx.maxExamples ?? 2;

    const translateText = (raw) => {
        if (!translationTalk || !raw) return null;
        return translationTalk[raw] ?? translationTalk[raw.trim()] ?? null;
    };

    // Pre-scan TalkData WindowDisplayName per Character2dId so supporting & collab characters
    // receive their real human-readable story speaker names in @cast summaries.
    const speakerNameCounts = new Map();
    for (const td of scenario.TalkData ?? []) {
        if (!td || !Array.isArray(td.TalkCharacters) || td.TalkCharacters.length !== 1) continue;
        const c2dId = td.TalkCharacters[0]?.Character2dId;
        if (!c2dId) continue;
        const rawDisp = cleanSpeakerName(td.WindowDisplayName);
        if (!rawDisp) continue;
        const disp = cleanSpeakerName(translateText(td.WindowDisplayName)) || rawDisp;
        let bucket = speakerNameCounts.get(c2dId);
        if (!bucket) {
            bucket = { real: new Map(), placeholder: new Map() };
            speakerNameCounts.set(c2dId, bucket);
        }
        const targetMap = isPlaceholderSpeakerName(disp) ? bucket.placeholder : bucket.real;
        targetMap.set(disp, (targetMap.get(disp) ?? 0) + 1);
    }

    const pickStoryDisplayNames = (c2dId) => {
        const bucket = speakerNameCounts.get(c2dId);
        if (!bucket) return [];
        const map = bucket.real.size > 0 ? bucket.real : bucket.placeholder;
        return [...map.entries()]
            .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
            .map(([label]) => label);
    };

    const resolveActorInfo = (char2dId, explicitModelId) => {
        const c2d = chara2dById.get(char2dId);
        const charId = c2d?.characterType === "game_character" ? c2d.characterId : null;
        const baseChar = charId ? CHAR_BY_ID.get(charId) : null;
        const modelId = explicitModelId || "";
        const rawKey = baseChar?.key ?? (c2d?.assetName || modelId || (char2dId ? `char2d_${char2dId}` : "unknown"));
        const inferredKey = String(rawKey).replace(/[^A-Za-z0-9_-]+/g, "_") || "unknown";
        const storyDisplayNames = pickStoryDisplayNames(char2dId);
        const storyDisplayName = storyDisplayNames[0] ?? null;
        const motionBundle = modelId ? (inferMotionBundleCandidates(modelId)[0] ?? null) : null;

        if (baseChar) {
            return {
                actorKey: modelId ? `${inferredKey}:${modelId}` : `${inferredKey}:id${char2dId}`,
                shortKey: inferredKey,
                char2dId,
                charId,
                name: `${baseChar.en} / ${baseChar.jp}`,
                storyDisplayName,
                storyDisplayNames: storyDisplayNames.slice(0, 4),
                ownerKey: null,
                kind: "character",
                unit: c2d?.unit ?? baseChar.unit ?? "",
                modelId,
                motionBundle,
                isSubOrMob: false,
            };
        }

        const ownerKey = normalizeOwnerKeyWithKnown(deriveOwnerKey(modelId || c2d?.assetName || ""), new Set());
        const builtin = ownerKey ? (SUB_CHARACTER_NAMES[ownerKey] ?? null) : null;
        const subMasterName = c2d?.characterType === "sub_game_character" ? (subGameCharById.get(c2d.characterId) ?? null) : null;
        const iconBundle = c2d?.characterIconAssetbundleName ?? null;
        const kind = (iconBundle && iconBundle.endsWith("_collabo")) || COLLAB_MODEL_RE.test(modelId) || (c2d?.assetName && COLLAB_MODEL_RE.test(c2d.assetName))
            ? "collab"
            : (c2d?.characterType === "sub_game_character" || /^(?:v2_)?sub_/.test(modelId) || (c2d?.assetName && /^(?:v2_)?sub_/.test(c2d.assetName)) || builtin || storyDisplayName)
                ? "sub"
                : "mob";
        const localizedFallback = pickLocalizedName(builtin?.names, region);
        const name = storyDisplayName || subMasterName || localizedFallback || c2d?.assetName || `Char2d#${char2dId}`;

        return {
            actorKey: modelId ? `${inferredKey}:${modelId}` : `${inferredKey}:id${char2dId}`,
            shortKey: inferredKey,
            char2dId,
            charId: null,
            name,
            storyDisplayName,
            storyDisplayNames: storyDisplayNames.slice(0, 4),
            ownerKey,
            kind,
            localizedNames: builtin?.names ? { ...builtin.names } : undefined,
            unit: c2d?.unit ?? "",
            modelId,
            motionBundle,
            isSubOrMob: true,
        };
    };

    // 1. Catalog appearing cast & costumes
    const castEntries = [];
    const castSeen = new Set();
    const activeCostumeByChara2d = new Map();
    for (const appear of scenario.AppearCharacters ?? []) {
        const c2dId = appear.Character2dId;
        const modelId = String(appear.CostumeType ?? "").trim();
        if (modelId && !activeCostumeByChara2d.has(c2dId)) {
            activeCostumeByChara2d.set(c2dId, modelId);
        }
        const dedupeKey = `${c2dId}|${modelId}`;
        if (castSeen.has(dedupeKey)) continue;
        castSeen.add(dedupeKey);
        castEntries.push(resolveActorInfo(c2dId, modelId));
    }

    // Pre-index talks by snippet position so SE/BGM/Layout can grab nearest surrounding dialogue context.
    const snippets = Array.isArray(scenario.Snippets) ? scenario.Snippets : [];
    const talkBySnippetIdx = new Map();
    const talkOrderBySnippetIdx = new Map();
    let totalTalks = 0;
    for (let i = 0; i < snippets.length; i++) {
        const sn = snippets[i];
        if (sn?.Action === 1) {
            const td = scenario.TalkData?.[sn.ReferenceIndex];
            if (td) {
                totalTalks += 1;
                talkBySnippetIdx.set(i, td);
                talkOrderBySnippetIdx.set(i, totalTalks);
            }
        }
    }

    const formatTalkShort = (td) => {
        if (!td) return "";
        const speaker = translateText(td.WindowDisplayName) || td.WindowDisplayName || "Narration";
        const body = translateText(td.Body) || td.Body || "";
        return `${speaker}: "${truncate(body, 64)}"`;
    };

    const findAdjacentTalk = (snippetIdx, direction) => {
        const step = direction < 0 ? -1 : 1;
        for (let i = snippetIdx + step; i >= 0 && i < snippets.length && Math.abs(i - snippetIdx) <= 25; i += step) {
            const td = talkBySnippetIdx.get(i);
            if (td && td.Body) {
                return { talkLine: talkOrderBySnippetIdx.get(i), text: formatTalkShort(td) };
            }
        }
        return null;
    };

    // 2. Trackers for backgrounds, BGM, SE, clips, voices, effects, timeline
    const bgMap = new Map();
    const bgmMap = new Map();
    const seMap = new Map();
    const charClipsMap = new Map();
    const voiceSamples = [];
    const effects = {
        transitions: {},
        shakes: 0,
        flashes: 0,
        telops: [],
        places: [],
        enterCount: 0,
        moveCount: 0,
        exitCount: 0,
        coStarReactionCount: 0,
    };
    const timeline = [];

    let currentBg = null;
    let currentPlace = "";
    let currentTalkLine = 0;

    const recordBg = (bgId, talkLine, placeHint) => {
        const id = String(bgId ?? "").trim();
        if (!id || id === "bg_a000000") return;
        currentBg = id;
        let entry = bgMap.get(id);
        if (!entry) {
            entry = {
                id,
                count: 0,
                firstTalkLine: talkLine,
                places: [],
                isCg: isStoryCgBackground(id),
                webp: storageUrl(region, `scenario/background/${id}/${id}.webp`, line),
                png: storageUrl(region, `scenario/background/${id}/${id}.png`, line),
            };
            bgMap.set(id, entry);
        }
        entry.count += 1;
        if (placeHint && !entry.places.includes(placeHint)) {
            entry.places.push(placeHint);
        }
    };

    const recordBgm = (bgmRaw, talkLine, snippetIdx) => {
        const raw = String(bgmRaw ?? "").trim();
        if (!raw || raw === "bgm00000") return;
        const meta = bgmTitleByName.get(raw);
        const canonical = meta?.name ?? raw;
        let entry = bgmMap.get(canonical);
        if (!entry) {
            const after = snippetIdx >= 0 ? findAdjacentTalk(snippetIdx, +1) : findAdjacentTalk(-1, +1);
            const url = canonical.startsWith("mysekai/") || canonical.startsWith("sound/")
                ? storageUrl(region, `${canonical}.mp3`, line)
                : canonical.includes("/")
                    ? storageUrl(region, `sound/scenario/bgm/${canonical}.mp3`, line)
                    : storageUrl(region, `sound/scenario/bgm/${canonical}/${canonical}.mp3`, line);
            entry = {
                name: canonical,
                raw,
                title: meta?.title ?? "",
                category: meta?.category ?? "",
                count: 0,
                firstTalkLine: talkLine,
                sampleContext: after?.text ?? "",
                url,
            };
            bgmMap.set(canonical, entry);
        }
        entry.count += 1;
    };

    const recordSe = (seRaw, talkLine, snippetIdx) => {
        const raw = String(seRaw ?? "").trim();
        if (!raw) return;
        const pack = raw.includes("/") ? raw.split("/")[0] : (sePackByName.get(raw) ?? (raw.endsWith("_b") ? "se_pack00001_b" : null));
        const path = raw.includes("/") ? raw : (pack ? `${pack}/${raw}` : raw);
        let entry = seMap.get(path);
        if (!entry) {
            entry = {
                raw,
                path,
                pack: pack ?? "unknown",
                count: 0,
                examples: [],
                url: pack ? storageUrl(region, `sound/scenario/se/${path}.mp3`, line) : storageUrl(region, `sound/scenario/se/se_pack00001_b/${raw}.mp3`, line),
            };
            seMap.set(path, entry);
        }
        entry.count += 1;
        if (entry.examples.length < maxExamples) {
            const before = findAdjacentTalk(snippetIdx, -1);
            const after = findAdjacentTalk(snippetIdx, +1);
            entry.examples.push({
                talkLine,
                before: before?.text ?? "",
                after: after?.text ?? "",
            });
        }
    };

    const recordClip = (char2dId, motionRaw, facialRaw, source, contextText, explicitModelId) => {
        const motion = String(motionRaw ?? "").trim();
        const facial = String(facialRaw ?? "").trim();
        if (!motion && !facial) return;
        const modelId = String(explicitModelId ?? "").trim() || activeCostumeByChara2d.get(char2dId) || "";
        const info = resolveActorInfo(char2dId, modelId);
        let bucket = charClipsMap.get(info.actorKey);
        if (!bucket) {
            bucket = {
                actorKey: info.actorKey,
                shortKey: info.shortKey,
                char2dId: info.char2dId,
                charId: info.charId,
                name: info.name,
                modelId: info.modelId,
                motionBundle: info.motionBundle,
                pairMap: new Map(),
            };
            charClipsMap.set(info.actorKey, bucket);
        }
        const pairKey = `${motion}\0${facial}`;
        let pair = bucket.pairMap.get(pairKey);
        if (!pair) {
            pair = { motion, facial, count: 0, sources: new Set(), examples: [] };
            bucket.pairMap.set(pairKey, pair);
        }
        pair.count += 1;
        pair.sources.add(source);
        if (contextText && pair.examples.length < maxExamples && !pair.examples.includes(contextText)) {
            pair.examples.push(contextText);
        }
    };

    // 3. Process header fields
    if (scenario.FirstBackground) {
        if (scenario.FirstBackground === "bg_a000000") {
            timeline.push({ kind: "bg", talkLine: 0, bg: "bg_a000000 (black)" });
        } else {
            recordBg(scenario.FirstBackground, 0, "");
            timeline.push({ kind: "bg", talkLine: 0, bg: scenario.FirstBackground });
        }
    }
    if (scenario.FirstBgm && scenario.FirstBgm !== "bgm00000") {
        recordBgm(scenario.FirstBgm, 0, -1);
        timeline.push({ kind: "bgm", talkLine: 0, bgm: bgmTitleByName.get(scenario.FirstBgm)?.name ?? scenario.FirstBgm });
    }
    for (const fl of scenario.FirstLayout ?? []) {
        if (fl.CostumeType) activeCostumeByChara2d.set(fl.Character2dId, fl.CostumeType);
        const info = resolveActorInfo(fl.Character2dId, fl.CostumeType || activeCostumeByChara2d.get(fl.Character2dId));
        recordClip(fl.Character2dId, fl.MotionName, fl.FacialName, "firstLayout", "(opening pose)", fl.CostumeType);
        timeline.push({
            kind: "enter",
            talkLine: 0,
            actor: info.shortKey,
            modelId: info.modelId,
            slot: SIDE_TO_MSK_SLOT[fl.PositionSide] ?? `side:${fl.PositionSide}`,
            motion: fl.MotionName || "",
            facial: fl.FacialName || "",
        });
    }

    // 4. Walk Snippets sequentially
    for (let i = 0; i < snippets.length; i++) {
        const sn = snippets[i];
        if (!sn) continue;

        if (sn.Action === 1) {
            const td = scenario.TalkData?.[sn.ReferenceIndex];
            if (!td) continue;
            currentTalkLine += 1;
            const speakerChara2d = td.TalkCharacters?.[0]?.Character2dId ?? 0;
            const speakerName = translateText(td.WindowDisplayName) || td.WindowDisplayName || "";
            const bodyOrig = td.Body ?? "";
            const bodyTr = translateText(bodyOrig);
            const displayBody = bodyTr ? `${truncate(bodyTr, 80)} [JP: ${truncate(bodyOrig, 48)}]` : truncate(bodyOrig, 100);
            const ctxLine = `${speakerName || "Narration"}: "${truncate(bodyTr || bodyOrig, 64)}"`;

            const speakerMotions = [];
            const reactions = [];
            for (const m of td.Motions ?? []) {
                if (!m) continue;
                const targetId = m.Character2dId || speakerChara2d;
                const isReaction = speakerChara2d > 0 && targetId !== speakerChara2d;
                if (isReaction) effects.coStarReactionCount += 1;
                recordClip(targetId, m.MotionName, m.FacialName, isReaction ? "react" : "talk", ctxLine);
                const actorInfo = resolveActorInfo(targetId, activeCostumeByChara2d.get(targetId));
                if (isReaction) {
                    reactions.push({ actor: actorInfo.shortKey, motion: m.MotionName || "", facial: m.FacialName || "" });
                } else {
                    speakerMotions.push({ motion: m.MotionName || "", facial: m.FacialName || "" });
                }
            }

            let voiceRef = null;
            if (Array.isArray(td.Voices) && td.Voices.length > 0) {
                const v = td.Voices[0];
                voiceRef = buildMskVoiceString(v.VoiceId, v.Character2dId, speakerChara2d, storyKind, scenarioId, chara2dById, region);
                if (voiceRef && voiceSamples.length < 12) {
                    voiceSamples.push({ ref: voiceRef, speaker: speakerName, text: truncate(bodyTr || bodyOrig, 56) });
                }
            }

            const speakerActor = speakerChara2d ? resolveActorInfo(speakerChara2d, activeCostumeByChara2d.get(speakerChara2d)).shortKey : "";
            timeline.push({
                kind: "talk",
                talkLine: currentTalkLine,
                actor: speakerActor,
                speaker: speakerName,
                body: displayBody,
                motion: speakerMotions[0]?.motion ?? "",
                facial: speakerMotions[0]?.facial ?? "",
                reactions,
                voice: voiceRef,
            });
        } else if (sn.Action === 2 || sn.Action === 4) {
            const l = scenario.LayoutData?.[sn.ReferenceIndex];
            if (!l) continue;
            if (l.CostumeType) activeCostumeByChara2d.set(l.Character2dId, l.CostumeType);
            const info = resolveActorInfo(l.Character2dId, l.CostumeType || activeCostumeByChara2d.get(l.Character2dId));
            const nextTalk = findAdjacentTalk(i, +1);
            const prevTalk = findAdjacentTalk(i, -1);
            const ctxText = nextTalk?.text ?? prevTalk?.text ?? "";

            if (sn.Action === 4 || l.Type === 0) {
                recordClip(l.Character2dId, l.MotionName, l.FacialName, "pose", ctxText, l.CostumeType);
                timeline.push({
                    kind: "pose",
                    talkLine: currentTalkLine,
                    actor: info.shortKey,
                    motion: l.MotionName || "",
                    facial: l.FacialName || "",
                });
            } else if (l.Type === 2) {
                effects.enterCount += 1;
                recordClip(l.Character2dId, l.MotionName, l.FacialName, "enter", ctxText, l.CostumeType);
                timeline.push({
                    kind: "enter",
                    talkLine: currentTalkLine,
                    actor: info.shortKey,
                    modelId: info.modelId,
                    slot: SIDE_TO_MSK_SLOT[l.SideTo] ?? `side:${l.SideTo}`,
                    motion: l.MotionName || "",
                    facial: l.FacialName || "",
                });
            } else if (l.Type === 1) {
                effects.moveCount += 1;
                recordClip(l.Character2dId, l.MotionName, l.FacialName, "move", ctxText, l.CostumeType);
                timeline.push({
                    kind: "move",
                    talkLine: currentTalkLine,
                    actor: info.shortKey,
                    slot: SIDE_TO_MSK_SLOT[l.SideTo] ?? `side:${l.SideTo}`,
                    motion: l.MotionName || "",
                    facial: l.FacialName || "",
                });
            } else if (l.Type === 3) {
                effects.exitCount += 1;
                timeline.push({
                    kind: "exit",
                    talkLine: currentTalkLine,
                    actor: info.shortKey,
                });
            }
        } else if (sn.Action === 6) {
            const fx = scenario.SpecialEffectData?.[sn.ReferenceIndex];
            if (!fx) continue;
            const fxName = SPECIAL_EFFECT_NAMES[fx.EffectType] ?? `Effect#${fx.EffectType}`;
            if (fx.EffectType === 7 || fx.EffectType === 17) {
                const bgId = fx.StringValSub || fx.StringVal;
                if (bgId === "bg_a000000") {
                    currentBg = null;
                    timeline.push({ kind: "bg", talkLine: currentTalkLine, bg: "bg_a000000 (black)" });
                } else {
                    recordBg(bgId, currentTalkLine, currentPlace);
                    timeline.push({ kind: "bg", talkLine: currentTalkLine, bg: bgId });
                }
            } else if (fx.EffectType === 18) {
                const placeText = translateText(fx.StringVal) || fx.StringVal || "";
                currentPlace = placeText;
                if (placeText && !effects.places.includes(placeText)) effects.places.push(placeText);
                if (currentBg && bgMap.has(currentBg) && placeText) {
                    const b = bgMap.get(currentBg);
                    if (!b.places.includes(placeText)) b.places.push(placeText);
                }
                timeline.push({ kind: "place", talkLine: currentTalkLine, text: placeText });
            } else if (fx.EffectType === 8) {
                const telopText = translateText(fx.StringVal) || fx.StringVal || "";
                if (telopText) effects.telops.push(telopText);
                timeline.push({ kind: "telop", talkLine: currentTalkLine, text: telopText });
            } else if (fx.EffectType === 5 || fx.EffectType === 6) {
                effects.shakes += 1;
                timeline.push({ kind: "fx", talkLine: currentTalkLine, fx: fxName, duration: fx.Duration });
            } else if (fx.EffectType >= 1 && fx.EffectType <= 4) {
                effects.transitions[fxName] = (effects.transitions[fxName] ?? 0) + 1;
                if (fx.EffectType === 3 || fx.EffectType === 4) effects.flashes += 1;
                timeline.push({ kind: "fx", talkLine: currentTalkLine, fx: fxName, duration: fx.Duration });
            } else if (fx.EffectType === 24 && fx.StringVal) {
                timeline.push({ kind: "telop", talkLine: currentTalkLine, text: `[FullScreen] ${truncate(translateText(fx.StringVal) || fx.StringVal, 80)}` });
            }
        } else if (sn.Action === 7) {
            const snd = scenario.SoundData?.[sn.ReferenceIndex];
            if (!snd) continue;
            if (snd.Bgm) {
                if (snd.Bgm === "bgm00000") {
                    timeline.push({ kind: "bgm", talkLine: currentTalkLine, bgm: "STOP" });
                } else {
                    recordBgm(snd.Bgm, currentTalkLine, i);
                    const canonical = bgmTitleByName.get(snd.Bgm)?.name ?? snd.Bgm;
                    timeline.push({ kind: "bgm", talkLine: currentTalkLine, bgm: canonical });
                }
            }
            if (snd.Se) {
                recordSe(snd.Se, currentTalkLine, i);
                const pack = sePackByName.get(snd.Se);
                const resolvedSe = snd.Se.includes("/") ? snd.Se : (pack ? `${pack}/${snd.Se}` : snd.Se);
                timeline.push({ kind: "se", talkLine: currentTalkLine, se: resolvedSe });
            }
        }
    }

    const characterClips = [...charClipsMap.values()]
        .sort((a, b) => (a.charId ?? 999) - (b.charId ?? 999) || a.actorKey.localeCompare(b.actorKey))
        .map(bucket => ({
            actorKey: bucket.actorKey,
            shortKey: bucket.shortKey,
            charId: bucket.charId,
            name: bucket.name,
            modelId: bucket.modelId,
            motionBundle: bucket.motionBundle,
            pairs: [...bucket.pairMap.values()]
                .sort((a, b) => b.count - a.count || a.motion.localeCompare(b.motion) || a.facial.localeCompare(b.facial))
                .map(p => ({
                    motion: p.motion,
                    facial: p.facial,
                    count: p.count,
                    sources: [...p.sources],
                    examples: p.examples,
                })),
        }));

    return {
        meta: {
            selector: ctx.selector ?? scenarioId,
            region,
            storyKind,
            scenarioId,
            storyTitle: ctx.storyTitle ?? "",
            episodeTitle: ctx.episodeTitle ?? "",
            scenarioUrl: ctx.scenarioUrl ?? "",
            talkCount: totalTalks,
            snippetCount: snippets.length,
        },
        cast: castEntries,
        backgrounds: [...bgMap.values()],
        bgm: [...bgmMap.values()],
        se: [...seMap.values()].sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
        characterClips,
        voices: voiceSamples,
        effects,
        timeline,
    };
}

/**
 * Pure aggregator: merges multiple `extractScenarioStudy()` reports into a single `.msk` Authoring Asset Kit.
 */
export function aggregateStudyReports(reports, targetCharIds = []) {
    const targetSet = new Set(targetCharIds);
    const castByChar = new Map();
    const bgMap = new Map();
    const bgmMap = new Map();
    const seMap = new Map();
    const clipsByChar = new Map();

    for (const rep of reports) {
        for (const c of rep.cast) {
            if (!c.modelId) continue;
            if (targetSet.size > 0 && c.charId != null && !targetSet.has(c.charId)) continue;
            const key = `${c.charId ?? c.shortKey}|${c.modelId}`;
            const existing = castByChar.get(key);
            if (!existing) {
                castByChar.set(key, {
                    ...c,
                    storyDisplayNames: [...(c.storyDisplayNames ?? [])],
                    count: 1,
                    isV2: c.modelId.startsWith("v2_"),
                });
            } else {
                existing.count += 1;
                for (const dn of c.storyDisplayNames ?? []) {
                    if (dn && !existing.storyDisplayNames.includes(dn) && existing.storyDisplayNames.length < 4) {
                        existing.storyDisplayNames.push(dn);
                    }
                }
                if (c.isSubOrMob && c.storyDisplayName && !existing.storyDisplayName) {
                    existing.storyDisplayName = c.storyDisplayName;
                    existing.name = c.storyDisplayName;
                }
            }
        }

        for (const bg of rep.backgrounds) {
            const cur = bgMap.get(bg.id) ?? { ...bg, count: 0, places: [], episodes: [] };
            cur.count += bg.count;
            for (const p of bg.places) if (!cur.places.includes(p)) cur.places.push(p);
            if (!cur.episodes.includes(rep.meta.selector)) cur.episodes.push(rep.meta.selector);
            bgMap.set(bg.id, cur);
        }

        for (const b of rep.bgm) {
            const cur = bgmMap.get(b.name) ?? { ...b, count: 0, episodes: [] };
            cur.count += b.count;
            if (!cur.episodes.includes(rep.meta.selector)) cur.episodes.push(rep.meta.selector);
            bgmMap.set(b.name, cur);
        }

        for (const s of rep.se) {
            const cur = seMap.get(s.path) ?? { ...s, count: 0, examples: [], episodes: [] };
            cur.count += s.count;
            if (!cur.episodes.includes(rep.meta.selector)) cur.episodes.push(rep.meta.selector);
            for (const ex of s.examples) {
                if (cur.examples.length < 3) cur.examples.push({ ...ex, selector: rep.meta.selector });
            }
            seMap.set(s.path, cur);
        }

        for (const cc of rep.characterClips) {
            if (targetSet.size > 0 && cc.charId != null && !targetSet.has(cc.charId)) continue;
            const groupKey = cc.charId != null ? `char:${cc.charId}:${cc.modelId.startsWith("v2_") ? "v2" : "v1"}` : cc.actorKey;
            let bucket = clipsByChar.get(groupKey);
            if (!bucket) {
                bucket = {
                    shortKey: cc.shortKey,
                    charId: cc.charId,
                    name: cc.name,
                    models: new Set(),
                    pairMap: new Map(),
                };
                clipsByChar.set(groupKey, bucket);
            }
            if (cc.modelId) bucket.models.add(cc.modelId);
            for (const p of cc.pairs) {
                const pk = `${p.motion}\0${p.facial}`;
                let cur = bucket.pairMap.get(pk);
                if (!cur) {
                    cur = { motion: p.motion, facial: p.facial, count: 0, examples: [] };
                    bucket.pairMap.set(pk, cur);
                }
                cur.count += p.count;
                for (const ex of p.examples) {
                    if (cur.examples.length < 2 && !cur.examples.includes(ex)) cur.examples.push(ex);
                }
            }
        }
    }

    const recommendedCast = [...castByChar.values()]
        .sort((a, b) => Number(b.isV2) - Number(a.isV2) || (a.charId ?? 999) - (b.charId ?? 999) || b.count - a.count);

    const characterClips = [...clipsByChar.values()]
        .sort((a, b) => (a.charId ?? 999) - (b.charId ?? 999))
        .map(b => ({
            shortKey: b.shortKey,
            charId: b.charId,
            name: b.name,
            models: [...b.models],
            pairs: [...b.pairMap.values()].sort((x, y) => y.count - x.count).slice(0, 14),
        }));

    return {
        sources: reports.map(r => ({
            selector: r.meta.selector,
            storyTitle: r.meta.storyTitle,
            episodeTitle: r.meta.episodeTitle,
            talkCount: r.meta.talkCount,
        })),
        recommendedCast,
        backgrounds: [...bgMap.values()].sort((a, b) => Number(a.isCg) - Number(b.isCg) || b.count - a.count),
        bgm: [...bgmMap.values()].sort((a, b) => b.count - a.count),
        se: [...seMap.values()].sort((a, b) => b.count - a.count),
        characterClips,
    };
}

// ==================== Subcommand Implementations ====================

async function discoverEpisodes(opts) {
    const region = opts.region;
    const kind = opts.kind ?? "event";
    const unitKey = resolveUnitKey(opts.unit);
    const charIds = opts.char ? resolveCharacterIds(opts.char) : [];
    const charSet = new Set(charIds);
    const queryLower = (opts.query ?? "").trim().toLowerCase();
    const limit = opts.limit ?? 15;
    const sortLatest = opts.oldest ? false : true;

    const unitCharIds = unitKey
        ? new Set(CHARACTERS.filter(c => c.unit === unitKey).map(c => c.id))
        : null;

    if (kind === "event") {
        const [events, stories, gcu, eventCards, cards] = await Promise.all([
            fetchMaster(region, "events.json", opts),
            fetchMaster(region, "eventStories.json", opts),
            fetchMaster(region, "gameCharacterUnits.json", opts).catch(() => []),
            (charSet.size > 0 || unitKey) ? fetchMaster(region, "eventCards.json", opts).catch(() => []) : Promise.resolve([]),
            (charSet.size > 0 || unitKey) ? fetchMaster(region, "cards.json", opts).catch(() => []) : Promise.resolve([]),
        ]);
        const eventById = new Map(events.map(e => [e.id, e]));
        const gcuById = new Map(gcu.map(u => [u.id, u]));
        const cardCharById = new Map(cards.map(c => [c.id, c.characterId]));
        const eventChars = new Map();
        for (const ec of eventCards) {
            const cid = cardCharById.get(ec.cardId);
            if (!cid) continue;
            let set = eventChars.get(ec.eventId);
            if (!set) { set = new Set(); eventChars.set(ec.eventId, set); }
            set.add(cid);
        }

        const matched = [];
        for (const s of stories) {
            const ev = eventById.get(s.eventId);
            const bannerUnit = gcuById.get(s.bannerGameCharacterUnitId);
            const bannerCharId = bannerUnit?.gameCharacterId ?? null;
            const bannerUnitName = bannerUnit?.unit ?? null;
            const charsInEv = new Set(eventChars.get(s.eventId) ?? []);
            if (bannerCharId) charsInEv.add(bannerCharId);

            if (unitKey) {
                const unitCardCount = [...charsInEv].filter(cid => unitCharIds?.has(cid)).length;
                const isUnitMajority = charsInEv.size > 0 && unitCardCount >= Math.max(2, Math.ceil(charsInEv.size * 0.6));
                const isUnitFocus = bannerUnitName === unitKey || (!bannerUnitName && isUnitMajority);
                const isMixedMatch = unitCardCount >= 1;
                if (opts.includeMixed ? !isMixedMatch : !isUnitFocus) continue;
            }
            if (charSet.size > 0) {
                const matchAll = [...charSet].every(cid => charsInEv.has(cid));
                if (!matchAll) continue;
            }
            const title = ev?.name ?? `Event ${s.eventId}`;
            const outline = s.outline ?? "";
            const eps = [...(s.eventStoryEpisodes ?? [])].sort((a, b) => a.episodeNo - b.episodeNo);
            if (queryLower) {
                const hay = `${title} ${outline} ${s.assetbundleName} ${eps.map(e => e.title).join(" ")}`.toLowerCase();
                if (!hay.includes(queryLower)) continue;
            }
            const firstEp = eps[0];
            if (!firstEp) continue;
            matched.push({
                selector: `event:${s.eventId}/${firstEp.episodeNo}`,
                kind: "event",
                eventId: s.eventId,
                title,
                episodeCount: eps.length,
                firstEpisodeTitle: firstEp.title,
                scenarioId: firstEp.scenarioId,
                bannerChar: bannerCharId ? CHAR_BY_ID.get(bannerCharId)?.key ?? String(bannerCharId) : "",
                unit: bannerUnitName ? (UNIT_SHORT[bannerUnitName] ?? bannerUnitName) : "",
                outline: truncate(outline, 90),
            });
        }
        matched.sort((a, b) => (sortLatest ? b.eventId - a.eventId : a.eventId - b.eventId));
        return matched.slice(0, limit);
    }

    if (kind === "unit") {
        const [unitStories, profiles] = await Promise.all([
            fetchMaster(region, "unitStories.json", opts),
            fetchMaster(region, "unitProfiles.json", opts).catch(() => []),
        ]);
        const profileByUnit = new Map(profiles.map(p => [p.unit, p.unitName]));
        const out = [];
        for (const us of unitStories) {
            if (unitKey && us.unit !== unitKey) continue;
            if (charSet.size > 0) {
                const unitMembers = new Set(CHARACTERS.filter(c => c.unit === us.unit).map(c => c.id));
                if (![...charSet].some(cid => unitMembers.has(cid))) continue;
            }
            for (const ch of us.chapters ?? []) {
                for (const ep of ch.episodes ?? []) {
                    const title = `${ch.title || profileByUnit.get(us.unit) || us.unit} — ${ep.title}`;
                    if (queryLower && !title.toLowerCase().includes(queryLower) && !ep.scenarioId.toLowerCase().includes(queryLower)) continue;
                    out.push({
                        selector: `unit:${ch.assetbundleName}/${ep.episodeNo}`,
                        kind: "unit",
                        unit: UNIT_SHORT[us.unit] ?? us.unit,
                        title,
                        scenarioId: ep.scenarioId,
                    });
                }
            }
        }
        return out.slice(0, limit);
    }

    if (kind === "card") {
        const [cards, episodes] = await Promise.all([
            fetchMaster(region, "cards.json", opts),
            fetchMaster(region, "cardEpisodes.json", opts),
        ]);
        const epsByCard = new Map();
        for (const ep of episodes) {
            const arr = epsByCard.get(ep.cardId) ?? [];
            arr.push(ep);
            epsByCard.set(ep.cardId, arr);
        }
        const matched = [];
        for (const c of cards) {
            if (charSet.size > 0 && !charSet.has(c.characterId)) continue;
            if (unitCharIds && !unitCharIds.has(c.characterId)) continue;
            const parts = selectCardParts(epsByCard.get(c.id) ?? []);
            if (parts.length === 0) continue;
            const chInfo = CHAR_BY_ID.get(c.characterId);
            const title = `${chInfo?.en ?? c.characterId} — ${c.prefix}`;
            if (queryLower && !title.toLowerCase().includes(queryLower) && !c.assetbundleName.toLowerCase().includes(queryLower)) continue;
            matched.push({
                selector: `card:${c.id}/former`,
                latterSelector: parts[1] ? `card:${c.id}/latter` : null,
                kind: "card",
                cardId: c.id,
                char: chInfo?.key ?? String(c.characterId),
                title,
                scenarioId: parts[0].scenarioId,
            });
        }
        matched.sort((a, b) => (sortLatest ? b.cardId - a.cardId : a.cardId - b.cardId));
        return matched.slice(0, limit);
    }

    if (kind === "area") {
        const [actions, areas, c2dMap] = await Promise.all([
            fetchMaster(region, "actionSets.json", opts),
            fetchMaster(region, "areas.json", opts).catch(() => []),
            loadCharacter2dMap(region, opts),
        ]);
        const areaById = new Map(areas.map(a => [a.id, a]));
        const matched = [];
        for (const a of actions) {
            if (!a.scenarioId) continue;
            const chars = [...new Set((a.characterIds ?? []).map(id => c2dMap.get(id)?.characterId).filter(Boolean))];
            if (charSet.size > 0 && ![...charSet].every(cid => chars.includes(cid))) continue;
            if (unitCharIds && !chars.some(cid => unitCharIds.has(cid))) continue;
            const area = areaById.get(a.areaId);
            const areaName = area ? (area.subName ? `${area.name} - ${area.subName}` : area.name) : `Area ${a.areaId}`;
            if (queryLower && !areaName.toLowerCase().includes(queryLower) && !a.scenarioId.toLowerCase().includes(queryLower)) continue;
            matched.push({
                selector: `area:${a.areaId}/${a.id}`,
                kind: "area",
                actionSetId: a.id,
                title: areaName,
                chars: chars.map(cid => CHAR_BY_ID.get(cid)?.key ?? String(cid)),
                scenarioId: a.scenarioId,
            });
        }
        matched.sort((a, b) => (sortLatest ? b.actionSetId - a.actionSetId : a.actionSetId - b.actionSetId));
        return matched.slice(0, limit);
    }

    if (kind === "special") {
        const specials = await fetchMaster(region, "specialStories.json", opts);
        const matched = [];
        for (const s of specials) {
            for (const ep of s.episodes ?? []) {
                const title = `${s.title || `Special ${s.id}`} — ${ep.title || `Ep ${ep.episodeNo}`}`;
                if (queryLower && !title.toLowerCase().includes(queryLower)) continue;
                matched.push({
                    selector: `special:${s.id}/${ep.episodeNo}`,
                    kind: "special",
                    id: s.id,
                    title,
                    scenarioId: ep.scenarioId,
                });
            }
        }
        return matched.slice(0, limit);
    }

    throw new Error(`Unknown --kind '${kind}' (expected event|unit|card|area|special).`);
}

async function resolveChunkToSelector(chunk, region, opts, caches) {
    if (chunk.type === "event") {
        const evMatch = /^event_(\d+)$/.exec(chunk.story_id || "");
        if (evMatch && /^\d+$/.test(String(chunk.ep || ""))) {
            return `event:${evMatch[1]}/${chunk.ep}`;
        }
    }
    if (chunk.type === "card") {
        const cardMatch = /^card_(\d+)$/.exec(chunk.story_id || "");
        if (cardMatch) {
            const epStr = String(chunk.ep || "").toLowerCase();
            const part = (epStr === "2" || epStr.includes("后") || epStr.includes("後") || epStr.includes("latter") || epStr.includes("2")) ? "latter" : "former";
            return `card:${cardMatch[1]}/${part}`;
        }
    }
    if (chunk.type === "talk") {
        const talkMatch = /^talk_(\d+)$/.exec(chunk.story_id || "");
        if (talkMatch) return `talk:${talkMatch[1]}`;
    }
    if (chunk.type === "self") {
        return chunk.scenario_id ? `self:${chunk.scenario_id}` : null;
    }
    if (chunk.type === "unit" && chunk.scenario_id) {
        if (!caches.unitByScenario) {
            const us = await fetchMaster(region, "unitStories.json", opts).catch(() => []);
            caches.unitByScenario = new Map();
            for (const u of us) {
                for (const ch of u.chapters ?? []) {
                    for (const ep of ch.episodes ?? []) {
                        if (ep.scenarioId) caches.unitByScenario.set(ep.scenarioId, `unit:${ch.assetbundleName}/${ep.episodeNo}`);
                    }
                }
            }
        }
        return caches.unitByScenario.get(chunk.scenario_id) ?? null;
    }
    if (chunk.type === "special" && chunk.scenario_id) {
        if (!caches.specialByScenario) {
            const sp = await fetchMaster(region, "specialStories.json", opts).catch(() => []);
            caches.specialByScenario = new Map();
            for (const s of sp) {
                for (const ep of s.episodes ?? []) {
                    if (ep.scenarioId) caches.specialByScenario.set(ep.scenarioId, `special:${s.id}/${ep.episodeNo}`);
                }
            }
        }
        return caches.specialByScenario.get(chunk.scenario_id) ?? null;
    }
    return null;
}

async function runSearchText(query, opts) {
    const region = opts.region;
    const manifest = await fetchJsonWithFallback(
        [`${STORY_SEARCH_BASE}/manifest.json`],
        "story-search-manifest",
        "manifest",
        TTL_MANIFEST_MS,
        opts.noCache,
    );
    const serverEntry = manifest?.servers?.[region] ?? manifest?.[region];
    if (!serverEntry) throw new Error(`Story search corpus not available for region '${region}'.`);
    const chunkPath = serverEntry.chunks?.path ?? serverEntry.corpus?.path;
    const sha = serverEntry.chunks?.sha256 ?? serverEntry.version ?? chunkPath;
    if (!chunkPath) throw new Error(`No chunks path found in manifest for '${region}'.`);

    const corpusCacheFile = cacheFilePath("corpus-jsonl", `${region}:${sha}`, "jsonl");
    let rawText = null;
    const cachedBuf = await readCacheFile(corpusCacheFile, 0, opts.noCache);
    if (cachedBuf) {
        rawText = cachedBuf.toString("utf8");
    } else {
        const url = chunkPath.startsWith("http") ? chunkPath : `${STORY_SEARCH_BASE}/${chunkPath.replace(/^\/+/, "")}`;
        if (!opts.json) {
            process.stderr.write(`Downloading ${region} story corpus (${((serverEntry.chunks?.br_bytes ?? 0) / 1048576).toFixed(1)} MB Brotli, cached for future runs)...\n`);
        }
        const res = await fetch(url, { signal: AbortSignal.timeout(CORPUS_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        const compressed = Buffer.from(await res.arrayBuffer());
        const decompressed = brotliDecompressSync(compressed);
        rawText = decompressed.toString("utf8");
        await writeCacheFile(corpusCacheFile, decompressed);
    }

    const charIds = opts.char ? resolveCharacterIds(opts.char) : [];
    const kindFilter = opts.kind && opts.kind !== "all" ? (opts.kind === "area" ? "talk" : opts.kind) : null;
    const limit = opts.limit ?? 12;
    const re = opts.regex ? new RegExp(query, "i") : null;
    const needle = query.toLowerCase();

    const hits = [];
    const seenEpisodes = new Set();
    const lines = rawText.split("\n");
    const caches = {};
    let totalMatchingChunks = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // Fast pre-check on raw JSON line before JSON.parse
        if (!re && needle && !line.toLowerCase().includes(needle)) continue;
        let chunk;
        try { chunk = JSON.parse(line); } catch { continue; }
        if (kindFilter && chunk.type !== kindFilter) continue;
        if (charIds.length > 0) {
            const cids = Array.isArray(chunk.char_ids) ? chunk.char_ids : [];
            if (!charIds.every(cid => cids.includes(cid))) continue;
        }
        const text = chunk.text ?? "";
        if (re) {
            if (!re.test(text)) continue;
        } else if (needle && !text.toLowerCase().includes(needle)) {
            continue;
        }
        totalMatchingChunks += 1;
        const epKey = `${chunk.type}|${chunk.story_id}|${chunk.ep}|${chunk.scenario_id}`;
        if (seenEpisodes.has(epKey)) continue;
        seenEpisodes.add(epKey);

        const selector = await resolveChunkToSelector(chunk, region, opts, caches);
        const dialogueLines = text.split("\n").filter(l => l.trim() && !l.startsWith("["));
        const matchedLines = dialogueLines.filter(l => (re ? re.test(l) : l.toLowerCase().includes(needle))).slice(0, 3);
        hits.push({
            selector: selector ?? `${chunk.type}:${chunk.scenario_id}`,
            type: chunk.type,
            story: chunk.story,
            ep: chunk.ep,
            scenarioId: chunk.scenario_id,
            lineRange: `${(chunk.line_start ?? 0) + 1}..${(chunk.line_end ?? 0) + 1}`,
            chars: chunk.chars ?? [],
            matchedLines: matchedLines.length > 0 ? matchedLines : dialogueLines.slice(0, 2),
        });
        if (hits.length >= limit) break;
    }

    return {
        region,
        query,
        totalMatchingChunks,
        returnedEpisodes: hits.length,
        hits,
    };
}

async function runInspectOne(selectorRaw, opts) {
    const parsed = parseSelector(selectorRaw);
    if (!parsed) {
        throw new Error(`Invalid selector '${selectorRaw}'. Examples: event:203/1, unit:light_sound/1, card:900/former, area:1/100, special:1/1`);
    }
    const region = opts.region;
    const target = await resolveSelectorTarget(parsed, region, opts);
    const [scenario, chara2dById, subGameCharById, seIndex, bgmMeta, translationEpisode] = await Promise.all([
        target.scenarioPath
            ? fetchStorageJson(region, target.scenarioPath, opts, TTL_SCENARIO_MS)
            : fetchJsonWithFallback([target.scenarioUrl], "scenario-url", target.scenarioUrl, TTL_SCENARIO_MS, opts.noCache),
        loadCharacter2dMap(region, opts),
        loadSubGameCharacterMap(region, opts),
        loadSePackIndex(region, opts),
        loadBgmMetadata(region, opts),
        opts.translate && target.translationRef
            ? fetchTranslationEpisode(target.translationRef.kind, target.translationRef.fileId, target.translationRef.episodeKey, opts.translate, opts)
            : Promise.resolve(null),
    ]);

    return extractScenarioStudy(scenario, {
        region,
        line: opts.line,
        selector: target.selector,
        storyKind: target.storyKind,
        scenarioId: target.scenarioId,
        storyTitle: target.storyTitle,
        episodeTitle: target.episodeTitle,
        scenarioUrl: target.scenarioUrl,
        chara2dById,
        subGameCharById,
        sePackByName: seIndex.byBare,
        bgmTitleByName: bgmMeta.byName,
        translationEpisode,
        maxExamples: opts.maxExamples ?? 2,
    });
}

async function runStudy(opts) {
    let selectors = [];
    if (opts.selectors) {
        selectors = opts.selectors.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    } else {
        const sampleCount = Math.min(8, Math.max(1, opts.sample ?? 3));
        const discovered = await discoverEpisodes({ ...opts, limit: sampleCount });
        selectors = discovered.map(d => d.selector);
    }
    if (selectors.length === 0) {
        throw new Error("No matching official episodes found to study. Try broadening --unit / --char / --query or specify --selectors.");
    }
    const capped = selectors.slice(0, 8);
    const reports = [];
    const errors = [];
    for (const sel of capped) {
        try {
            const rep = await runInspectOne(sel, { ...opts, maxExamples: 2 });
            reports.push(rep);
        } catch (err) {
            errors.push({ selector: sel, error: err instanceof Error ? err.message : String(err) });
        }
    }
    if (reports.length === 0) {
        throw new Error(`All episodes failed to load: ${errors.map(e => `${e.selector}: ${e.error}`).join("; ")}`);
    }
    let targetCharIds = opts.char ? resolveCharacterIds(opts.char) : [];
    if (targetCharIds.length === 0 && opts.unit) {
        const uk = resolveUnitKey(opts.unit);
        if (uk) {
            targetCharIds = CHARACTERS
                .filter(c => c.unit === uk || c.unit === "piapro")
                .map(c => c.id);
        }
    }
    const kit = aggregateStudyReports(reports, targetCharIds);
    return { region: opts.region, ...kit, errors };
}

async function runCatalog(subkind, arg, opts) {
    const region = opts.region;
    const limit = opts.limit ?? 40;
    const filterLower = (opts.filter || opts.query || "").trim().toLowerCase();

    if (subkind === "models") {
        const searchQuery = String(opts.search || opts.query || opts.filter || arg || "").trim();
        let models = [];
        let source = "models-v2";
        try {
            const idx = await fetchJsonWithFallback(
                [`${LIVE2D_INDEX_BASE}/${region}/models.json`],
                "live2d-index",
                region,
                TTL_MASTER_MS,
                opts.noCache,
            );
            if (idx?.format === 2) {
                source = "models-v2";
                models = normalizeCatalogModels(idx, { region });
            } else {
                source = "models-v1-enriched";
                const [chara2ds, subGameChars] = await Promise.all([
                    fetchMaster(region, "character2ds.json", opts).catch(() => []),
                    fetchMaster(region, "subGameCharacters.json", opts).catch(() => []),
                ]);
                models = normalizeCatalogModels({ ...idx, chara2ds, subGameChars }, { region });
            }
        } catch {
            // Graceful fallback when models.json is 404: combine storage live2d/model/ +
            // character2ds.json + subGameCharacters.json + built-in story-derived supporting names.
            source = "storage-fallback";
            const [{ directories }, chara2ds, subGameChars] = await Promise.all([
                fetchDirectoryListing(region, "live2d/model/", opts),
                fetchMaster(region, "character2ds.json", opts).catch(() => []),
                fetchMaster(region, "subGameCharacters.json", opts).catch(() => []),
            ]);
            models = normalizeCatalogModels({ directories, chara2ds, subGameChars }, { region });
        }
        const filtered = filterAndRankCatalogModels(models, {
            ...opts,
            search: searchQuery,
        });
        return {
            kind: "models",
            region,
            source,
            filterKind: opts.kind ? String(opts.kind).trim().toLowerCase() : null,
            search: searchQuery || null,
            total: filtered.length,
            items: filtered.slice(0, limit),
        };
    }

    if (subkind === "clips") {
        const modelId = (arg || opts.model || "").trim();
        if (!modelId) throw new Error("Usage: catalog clips <modelId> [--type all|motion|facial] [--filter <text>]");
        const candidates = inferMotionBundleCandidates(modelId);
        let manifest = null;
        let matchedBundle = null;
        for (const bundle of candidates) {
            const url = `${RIPPER_LIBRARY_BASE}/${region}/library/${encodePath(bundle)}/_ripper.json`;
            try {
                manifest = await fetchJsonWithFallback([url], "ripper-motion", `${region}:${bundle}`, TTL_SCENARIO_MS, opts.noCache);
                matchedBundle = bundle;
                break;
            } catch {
                // try next candidate
            }
        }
        if (!manifest) {
            throw new Error(`Motion bundle _ripper.json not found for '${modelId}' (tried: ${candidates.join(", ")}).`);
        }
        const motions = [];
        const facials = [];
        for (const f of manifest.files ?? []) {
            const match = /^(motion|facial)\/(.+)\.sse-motion\.json$/.exec(String(f?.path ?? ""));
            if (!match) continue;
            if (filterLower && !match[2].toLowerCase().includes(filterLower)) continue;
            if (match[1] === "motion") motions.push(match[2]);
            else facials.push(match[2]);
        }
        motions.sort();
        facials.sort();
        const type = opts.type ?? "all";
        return {
            kind: "clips",
            region,
            modelId,
            motionBundle: matchedBundle,
            totalMotions: motions.length,
            totalFacials: facials.length,
            motions: type === "facial" ? [] : motions.slice(0, limit),
            facials: type === "motion" ? [] : facials.slice(0, limit),
        };
    }

    if (subkind === "bgm") {
        const { list } = await loadBgmMetadata(region, opts);
        const catLower = (opts.category ?? "").trim().toLowerCase();
        const filtered = list.filter(item => {
            if (catLower && !item.category.toLowerCase().includes(catLower)) return false;
            if (filterLower) {
                const hay = `${item.name} ${item.title} ${item.category}`.toLowerCase();
                if (!hay.includes(filterLower)) return false;
            }
            return true;
        });
        return { kind: "bgm", region, total: filtered.length, items: filtered.slice(0, limit) };
    }

    if (subkind === "bg") {
        const { directories } = await fetchDirectoryListing(region, "scenario/background/", opts);
        const filtered = directories
            .filter(id => id.startsWith("bg") && id !== "bg_a000000")
            .filter(id => opts.includeCg || !isStoryCgBackground(id))
            .filter(id => !filterLower || id.toLowerCase().includes(filterLower))
            .sort();
        return {
            kind: "bg",
            region,
            total: filtered.length,
            items: filtered.slice(0, limit).map(id => ({
                id,
                isCg: isStoryCgBackground(id),
                webp: storageUrl(region, `scenario/background/${id}/${id}.webp`, opts.line),
            })),
        };
    }

    if (subkind === "se") {
        const { allItems } = await loadSePackIndex(region, opts);
        const filtered = allItems
            .filter(item => !filterLower || item.path.toLowerCase().includes(filterLower))
            .sort((a, b) => a.label.localeCompare(b.label));
        return { kind: "se", region, total: filtered.length, items: filtered.slice(0, limit) };
    }

    if (subkind === "voices") {
        const scenarioId = (arg || opts.scenario || "").trim();
        const vkind = opts.kind ?? "story";
        const dirMap = {
            story: "sound/scenario/voice/",
            card: "sound/card_scenario/voice/",
            area: "sound/actionset/voice/",
            part: "sound/scenario/part_voice/",
        };
        const root = dirMap[vkind];
        if (!root) throw new Error(`Invalid voice --kind '${vkind}' (story|card|area|part).`);
        if (!scenarioId) {
            const { directories } = await fetchDirectoryListing(region, root, opts);
            const filtered = directories.filter(d => !filterLower || d.toLowerCase().includes(filterLower)).sort();
            return { kind: "voices-scenarios", region, voiceKind: vkind, total: filtered.length, items: filtered.slice(0, limit) };
        }
        const { files } = await fetchDirectoryListing(region, `${root}${encodeURIComponent(scenarioId)}/`, opts);
        const clips = files.map(f => f.replace(AUDIO_EXT_RE, "")).filter(c => !filterLower || c.toLowerCase().includes(filterLower)).sort();
        return {
            kind: "voices",
            region,
            voiceKind: vkind,
            scenarioId,
            total: clips.length,
            items: clips.slice(0, limit).map(v => `voice(${vkind}:${scenarioId}:${v}@${region})`),
        };
    }

    throw new Error(`Unknown catalog subkind '${subkind ?? ""}' (expected models|clips|bgm|bg|se|voices).`);
}

// ==================== Human / Agent-Friendly Printing ====================

function printList(items, opts) {
    console.log(`=== Official Episodes (kind=${opts.kind ?? "event"}, region=${opts.region}, shown=${items.length}) ===`);
    if (items.length === 0) {
        console.log("  (no matches)");
        return;
    }
    for (const it of items) {
        const metaParts = [];
        if (it.unit) metaParts.push(`unit=${it.unit}`);
        if (it.bannerChar) metaParts.push(`banner=${it.bannerChar}`);
        if (it.char) metaParts.push(`char=${it.char}`);
        if (it.chars?.length) metaParts.push(`chars=${it.chars.join(",")}`);
        if (it.episodeCount) metaParts.push(`${it.episodeCount} eps`);
        console.log(`  ${it.selector.padEnd(24)} | ${it.title}${metaParts.length ? ` (${metaParts.join(", ")})` : ""}`);
        if (it.outline) console.log(`      ${it.outline}`);
    }
    console.log(`\nNext step: node scripts/official-story.mjs inspect <selector> --region ${opts.region}`);
}

function printSearchText(result) {
    console.log(`=== Story Text Search (region=${result.region}, query="${result.query}", matchedChunks=${result.totalMatchingChunks}, shown=${result.returnedEpisodes}) ===`);
    if (result.hits.length === 0) {
        console.log("  (no matches)");
        return;
    }
    for (const h of result.hits) {
        console.log(`  ${h.selector} | ${h.story} (ep ${h.ep}, lines ${h.lineRange}) [${h.chars.slice(0, 5).join(", ")}]`);
        for (const l of h.matchedLines) {
            console.log(`      ${truncate(l, 110)}`);
        }
    }
    console.log(`\nNext step: node scripts/official-story.mjs inspect <selector> --region ${result.region} --timeline`);
}

function parseLineRange(raw) {
    if (!raw) return null;
    const m = /^(\d+)?\.\.(\d+)?$/.exec(String(raw).trim());
    if (!m) {
        const single = Number.parseInt(raw, 10);
        if (Number.isInteger(single) && single > 0) return [single, single + 20];
        throw new Error(`Invalid --lines '${raw}' (expected start..end, e.g. 1..25)`);
    }
    return [m[1] ? Number.parseInt(m[1], 10) : 1, m[2] ? Number.parseInt(m[2], 10) : Number.MAX_SAFE_INTEGER];
}

function printInspect(rep, opts) {
    const m = rep.meta;
    console.log(`=== Official Scenario Study: ${m.selector} (region=${m.region}) ===`);
    console.log(`Title: ${m.storyTitle}${m.episodeTitle ? ` — ${m.episodeTitle}` : ""}`);
    console.log(`Scenario: ${m.scenarioId} (${m.talkCount} talk lines, ${m.snippetCount} snippets)`);
    console.log(`JSON URL: ${m.scenarioUrl}`);

    console.log(`\n[Cast & Live2D Models (${rep.cast.length})]`);
    for (const c of rep.cast) {
        const charTag = c.charId ? ` char=${c.charId}` : "";
        const notes = [];
        if (c.isSubOrMob) {
            const tag = c.ownerKey ? `${c.kind ?? "sub"}:${c.ownerKey}` : (c.kind ?? "sub");
            notes.push(tag);
            const loc = c.localizedNames
                ? formatLocalizedModelTag({ id: c.modelId, name: c.name, names: c.localizedNames, aliases: [] })
                : "";
            if (loc && loc !== c.name) notes.push(loc);
        }
        if (c.motionBundle) notes.push(`motionBundle=${c.motionBundle}`);
        console.log(`  @cast ${c.shortKey} "${c.name}" model="${c.modelId}"${charTag}${notes.length ? `  # ${notes.join("; ")}` : ""}`);
    }

    console.log(`\n[Backgrounds (${rep.backgrounds.length})]`);
    for (const bg of rep.backgrounds) {
        const tags = [];
        if (bg.isCg) tags.push("STORY-CG");
        if (bg.places.length > 0) tags.push(`place: ${bg.places.join(" / ")}`);
        console.log(`  - ${bg.id} (x${bg.count}, line ${bg.firstTalkLine})${tags.length ? ` [${tags.join("; ")}]` : ""}`);
        console.log(`    webp: ${bg.webp}`);
    }

    console.log(`\n[BGM (${rep.bgm.length})]`);
    for (const b of rep.bgm) {
        const title = b.title ? ` "${b.title}"${b.category ? ` (${b.category})` : ""}` : "";
        console.log(`  - ${b.name}${title} (x${b.count}, line ${b.firstTalkLine})`);
        if (b.sampleContext) console.log(`    context: ${b.sampleContext}`);
    }

    console.log(`\n[SE (${rep.se.length})]`);
    for (const s of rep.se) {
        console.log(`  - ${s.path} (x${s.count})`);
        for (const ex of s.examples) {
            const parts = [];
            if (ex.before) parts.push(`before: ${ex.before}`);
            if (ex.after) parts.push(`after: ${ex.after}`);
            if (parts.length) console.log(`    line ${ex.talkLine}: ${parts.join(" -> ")}`);
        }
    }

    console.log(`\n[Per-Character Authentic Motions & Facials (${rep.characterClips.length} actor(s))]`);
    for (const cc of rep.characterClips) {
        console.log(`  * ${cc.shortKey} (${cc.modelId || "no-model"}):`);
        for (const p of cc.pairs.slice(0, 12)) {
            const parts = [];
            if (p.motion) parts.push(`motion="${p.motion}"`);
            if (p.facial) parts.push(`facial="${p.facial}"`);
            const ex = p.examples[0] ? `  e.g. ${p.examples[0]}` : "";
            console.log(`      ${parts.join(" ")} (x${p.count})${ex}`);
        }
        if (cc.pairs.length > 12) console.log(`      ... (+${cc.pairs.length - 12} more pairs; use --json for all)`);
    }

    if (rep.voices.length > 0) {
        console.log(`\n[Sample .msk Voice Refs (${rep.voices.length} shown)]`);
        for (const v of rep.voices.slice(0, 6)) {
            console.log(`  - ${v.ref}  # ${v.speaker}: "${v.text}"`);
        }
    }

    const fx = rep.effects;
    const transStr = Object.entries(fx.transitions).map(([k, v]) => `${k}x${v}`).join(", ");
    console.log(
        `\n[Directing Summary] enters=${fx.enterCount}, moves=${fx.moveCount}, exits=${fx.exitCount}, `
        + `coStarReacts=${fx.coStarReactionCount}, shakes=${fx.shakes}, flashes=${fx.flashes}`
        + (transStr ? `, transitions=[${transStr}]` : ""),
    );

    if (opts.timeline || opts.lines) {
        const range = parseLineRange(opts.lines);
        const startLine = range ? range[0] : 0;
        const endLine = range ? range[1] : Number.MAX_SAFE_INTEGER;
        console.log(`\n[Stageplay Timeline${range ? ` (talk lines ${startLine}..${endLine})` : ""}]`);
        for (const ev of rep.timeline) {
            if (ev.talkLine < startLine || ev.talkLine > endLine) continue;
            const ln = String(ev.talkLine).padStart(3, " ");
            if (ev.kind === "bg") console.log(`  L${ln} [BG] ${ev.bg}`);
            else if (ev.kind === "place") console.log(`  L${ln} [PLACE] "${ev.text}"`);
            else if (ev.kind === "telop") console.log(`  L${ln} [TELOP] "${ev.text}"`);
            else if (ev.kind === "bgm") console.log(`  L${ln} [BGM] ${ev.bgm}`);
            else if (ev.kind === "se") console.log(`  L${ln} [SE] ${ev.se}`);
            else if (ev.kind === "fx") console.log(`  L${ln} [FX] ${ev.fx}${ev.duration ? ` (${ev.duration}s)` : ""}`);
            else if (ev.kind === "enter") console.log(`  L${ln} [ENTER] ${ev.actor} at ${ev.slot}${ev.modelId ? ` (${ev.modelId})` : ""}${ev.motion ? ` motion="${ev.motion}"` : ""}${ev.facial ? ` facial="${ev.facial}"` : ""}`);
            else if (ev.kind === "move") console.log(`  L${ln} [MOVE] ${ev.actor} -> ${ev.slot}${ev.motion ? ` motion="${ev.motion}"` : ""}${ev.facial ? ` facial="${ev.facial}"` : ""}`);
            else if (ev.kind === "exit") console.log(`  L${ln} [EXIT] ${ev.actor}`);
            else if (ev.kind === "pose") console.log(`  L${ln} [POSE] ${ev.actor}${ev.motion ? ` motion="${ev.motion}"` : ""}${ev.facial ? ` facial="${ev.facial}"` : ""}`);
            else if (ev.kind === "talk") {
                const extras = [];
                if (ev.motion) extras.push(`motion="${ev.motion}"`);
                if (ev.facial) extras.push(`facial="${ev.facial}"`);
                for (const r of ev.reactions ?? []) {
                    const rp = [r.motion ? `motion="${r.motion}"` : "", r.facial ? `facial="${r.facial}"` : ""].filter(Boolean).join(" ");
                    extras.push(`react(${r.actor}${rp ? ` ${rp}` : ""})`);
                }
                console.log(`  L${ln} [TALK] ${ev.speaker || ev.actor || "Narration"}: ${ev.body}${extras.length ? `  | ${extras.join(" ")}` : ""}`);
            }
        }
    }
}

function printStudy(kit) {
    console.log(`=== Official Story Authoring Kit (region=${kit.region}, sampled=${kit.sources.length} episode(s)) ===`);
    console.log("Sources:");
    for (const s of kit.sources) {
        console.log(`  - ${s.selector}: ${s.storyTitle} — ${s.episodeTitle} (${s.talkCount} lines)`);
    }
    if (kit.errors?.length) {
        console.log("Skipped:");
        for (const e of kit.errors) console.log(`  - ${e.selector}: ${e.error}`);
    }

    console.log(`\n[Recommended @cast Directives (top verified models)]`);
    for (const c of kit.recommendedCast.slice(0, 16)) {
        const charTag = c.charId ? ` char=${c.charId}` : "";
        const notes = [`seen in ${c.count} ep(s)`];
        if (c.isSubOrMob) {
            notes.push(c.ownerKey ? `${c.kind ?? "sub"}:${c.ownerKey}` : (c.kind ?? "sub"));
            if (c.storyDisplayNames?.length > 1) notes.push(`names: ${c.storyDisplayNames.join(" / ")}`);
        }
        console.log(`  @cast ${c.shortKey} "${c.name}" model="${c.modelId}"${charTag}  # ${notes.join("; ")}`);
    }

    console.log(`\n[Top Backgrounds (${kit.backgrounds.length})]`);
    for (const bg of kit.backgrounds.slice(0, 12)) {
        const place = bg.places.length ? ` | place: ${bg.places.join(" / ")}` : "";
        const cg = bg.isCg ? " [STORY-CG]" : "";
        console.log(`  - ${bg.id} (x${bg.count})${cg}${place}`);
        console.log(`    webp: ${bg.webp}`);
    }

    console.log(`\n[Top BGM Tracks (${kit.bgm.length})]`);
    for (const b of kit.bgm.slice(0, 12)) {
        const title = b.title ? ` "${b.title}"${b.category ? ` (${b.category})` : ""}` : "";
        console.log(`  - ${b.name}${title} (x${b.count})`);
    }

    console.log(`\n[Top SE Clips (${kit.se.length}, pack-qualified for .msk)]`);
    for (const s of kit.se.slice(0, 14)) {
        const ex = s.examples[0];
        const ctx = ex ? `  | ${[ex.before, ex.after].filter(Boolean).join(" -> ")}` : "";
        console.log(`  - ${s.path} (x${s.count})${ctx}`);
    }

    console.log(`\n[Top Authentic (motion, facial) Palettes per Character]`);
    for (const cc of kit.characterClips) {
        console.log(`  * ${cc.shortKey} (models: ${cc.models.slice(0, 3).join(", ")}):`);
        for (const p of cc.pairs.slice(0, 8)) {
            const parts = [];
            if (p.motion) parts.push(`motion="${p.motion}"`);
            if (p.facial) parts.push(`facial="${p.facial}"`);
            const ex = p.examples[0] ? `  e.g. ${p.examples[0]}` : "";
            console.log(`      ${parts.join(" ")} (x${p.count})${ex}`);
        }
    }
}

function printCatalog(res) {
    if (res.kind === "models") {
        const hdrParts = [`region=${res.region}`];
        if (res.filterKind) hdrParts.push(`kind=${res.filterKind}`);
        if (res.search) hdrParts.push(`search="${res.search}"`);
        if (res.source) hdrParts.push(`source=${res.source}`);
        hdrParts.push(`total=${res.total}`, `shown=${res.items.length}`);
        console.log(`=== Live2D Models (${hdrParts.join(", ")}) ===`);
        if (res.items.length === 0) {
            console.log("  (no matches)");
            return;
        }
        for (const m of res.items) {
            const ownerTag = m.ownerKey
                ? `owner=${m.ownerKey}`
                : (m.characterId ? `char=${m.characterId}` : "");
            const nameTag = formatLocalizedModelTag(m);
            const epTag = m.episodeCount > 0 ? ` | eps=${m.episodeCount}` : "";
            const motionTag = m.motion ? `  (${m.motion})` : "";
            console.log(`  - ${m.id}  [${m.kind}${ownerTag ? ` ${ownerTag}` : ""}]  ${nameTag}${epTag}${motionTag}`);
        }
        return;
    }
    if (res.kind === "clips") {
        console.log(`=== Live2D Clips for ${res.modelId} (region=${res.region}, bundle=${res.motionBundle}) ===`);
        if (res.motions.length > 0) {
            console.log(`Motions (${res.motions.length}/${res.totalMotions}):`);
            console.log(`  ${res.motions.join(", ")}`);
        }
        if (res.facials.length > 0) {
            console.log(`Facials (${res.facials.length}/${res.totalFacials}):`);
            console.log(`  ${res.facials.join(", ")}`);
        }
        return;
    }
    if (res.kind === "bgm") {
        console.log(`=== BGM Catalog (region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const b of res.items) {
            console.log(`  - ${b.name.padEnd(26)} | ${b.title}${b.category ? ` [${b.category}]` : ""}`);
        }
        return;
    }
    if (res.kind === "bg") {
        console.log(`=== Backgrounds (region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const b of res.items) {
            console.log(`  - ${b.id}${b.isCg ? " [CG]" : ""}  ${b.webp}`);
        }
        return;
    }
    if (res.kind === "se") {
        console.log(`=== SE Clips (region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const s of res.items) {
            console.log(`  - ${s.path}`);
        }
        return;
    }
    if (res.kind === "voices-scenarios") {
        console.log(`=== Voice Scenario Dirs (kind=${res.voiceKind}, region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const d of res.items) console.log(`  - ${d}`);
        return;
    }
    if (res.kind === "voices") {
        console.log(`=== Voice Clips (kind=${res.voiceKind}, scenario=${res.scenarioId}, region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const v of res.items) console.log(`  - ${v}`);
    }
}

// ==================== CLI Argument Parsing & Main ====================

const HELP_TEXT = `MoeSekai Official Story & Asset Inspector CLI (zero-dependency Node 18+)

Usage:
  node scripts/official-story.mjs <command> [args] [options]

Commands:
  list [options]
      Discover official episodes from masterdata (fast, no heavy corpus download).
      --kind <event|unit|card|area|special>   Story type (default: event)
      --unit <ln|mmj|vbs|ws|25ji|vs>          Filter by unit (events default to unit-focus; add --include-mixed for crossovers)
      --include-mixed                         Include mixed-unit crossover events when filtering by --unit
      --char <id|name,...>                    Filter by character(s), e.g. 17,18 or kanade,mafuyu or 奏,真冬
      --query <text>                          Substring filter on title/outline/episode
      --oldest                                Sort oldest-first (default: newest-first for modern v2_ assets)
      --limit <n>                             Max results (default: 15)

  search-text "<query>" [options]
      Full-text search across all official dialogue chunks (uses Moesekai's Brotli story-search corpus).
      --region <jp|cn|tw|kr|en>               Server language to search (default: jp; use cn for Chinese, en for English)
      --kind <all|event|unit|card|talk|self|special>
      --char <id|name,...>                    Filter chunks containing these character(s)
      --regex                                 Treat query as regular expression
      --limit <n>                             Max distinct episodes returned (default: 12)

  inspect <selector|url> [options]
      Extract verified L2D models, (motion, facial) palettes, BGs, BGMs (with titles), pack-qualified SEs
      (with surrounding dialogue context), voices, and directing timeline from an official episode.
      Selectors: event:203/1 | unit:light_sound/1 | card:900/former | area:1/100 | talk:100 | special:1/1
      --translate <zh-CN|en-US>               Overlay translation when inspecting a JP event/card/area
      --timeline                              Print beat-by-beat stageplay timeline
      --lines <start..end>                    Slice timeline to talk line range (e.g. 1..25)

  study [options]
      Mine & aggregate a ready-to-use .msk Authoring Asset Kit across multiple official episodes at once!
      --selectors <sel1,sel2,...>             Explicit comma-separated episode selectors
      OR discovery filters: --kind, --unit, --char, --query, --sample <1..8> (default: 3)

  catalog <models|clips|bgm|bg|se|voices> [arg] [options]
      Browse live Moesekai asset catalogs directly:
      catalog models [--kind character|sub|collab|mob] [--search <name>] [--char ...] [--v2-only]
      catalog clips <modelId> [--type all|motion|facial] [--filter <text>]
      catalog bgm [--query <text>] [--category <text>]
      catalog bg [--filter <text>] [--include-cg]
      catalog se [--query <text>]
      catalog voices [scenarioId] [--kind story|card|area|part] [--filter <text>]

Global Options:
  --region <jp|cn|tw|kr|en>    Game server region (default: jp)
  --line <main|backup>         CDN line (default: main -> pjsk.moe, auto-fallback to exmeaning.com)
  --json                       Emit machine-readable JSON
  --no-cache                   Bypass local OS temp cache (${CACHE_DIR})
  -h, --help                   Show this help
`;

function parseCliArgs(argv) {
    const positionals = [];
    const opts = {
        region: "jp",
        line: "main",
        json: false,
        noCache: false,
        help: false,
    };

    const valueFlags = new Set([
        "--region", "--line", "--kind", "--unit", "--char", "--query", "--filter", "--search",
        "--limit", "--sample", "--selectors", "--translate", "--lines", "--type",
        "--category", "--model", "--scenario", "--max-examples",
    ]);

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            opts.help = true;
        } else if (arg === "--json") {
            opts.json = true;
        } else if (arg === "--no-cache") {
            opts.noCache = true;
        } else if (arg === "--oldest") {
            opts.oldest = true;
        } else if (arg === "--latest") {
            opts.oldest = false;
            const next = argv[i + 1];
            if (next && /^\d+$/.test(next)) {
                const n = Number.parseInt(argv[++i], 10);
                opts.limit = n;
                opts.sample = n;
            }
        } else if (arg === "--regex") {
            opts.regex = true;
        } else if (arg === "--timeline") {
            opts.timeline = true;
        } else if (arg === "--v2-only") {
            opts.v2Only = true;
        } else if (arg === "--include-cg") {
            opts.includeCg = true;
        } else if (arg === "--include-mixed") {
            opts.includeMixed = true;
        } else if (valueFlags.has(arg)) {
            const val = argv[++i];
            if (val === undefined) throw new Error(`Missing value for ${arg}`);
            const key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            if (key === "limit" || key === "sample" || key === "maxExamples") {
                const n = Number.parseInt(val, 10);
                if (!Number.isInteger(n) || n < 1 || n > 500) {
                    throw new Error(`Invalid ${arg} '${val}' (expected integer 1..500)`);
                }
                opts[key] = n;
            } else {
                opts[key] = val;
            }
        } else if (arg.startsWith("-")) {
            throw new Error(`Unknown option '${arg}'`);
        } else {
            positionals.push(arg);
        }
    }

    if (!REGIONS.includes(opts.region)) {
        throw new Error(`Invalid --region '${opts.region}' (expected ${REGIONS.join("|")})`);
    }
    if (opts.line !== "main" && opts.line !== "backup") {
        throw new Error(`Invalid --line '${opts.line}' (expected main|backup)`);
    }

    return { command: positionals[0] ?? null, args: positionals.slice(1), opts };
}

async function main() {
    let parsed;
    try {
        parsed = parseCliArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        console.error(HELP_TEXT);
        process.exit(2);
    }

    const { command, args, opts } = parsed;
    if (opts.help || !command) {
        console.log(HELP_TEXT);
        process.exit(opts.help ? 0 : 2);
    }

    try {
        if (command === "list") {
            const items = await discoverEpisodes(opts);
            if (opts.json) console.log(JSON.stringify(items, null, 2));
            else printList(items, opts);
        } else if (command === "search-text") {
            const query = args.join(" ").trim() || (opts.query ?? "").trim();
            if (!query) throw new Error("Usage: search-text \"<query>\" [--region jp|cn|en] [--char ...] [--kind ...]");
            const result = await runSearchText(query, opts);
            if (opts.json) console.log(JSON.stringify(result, null, 2));
            else printSearchText(result);
        } else if (command === "inspect") {
            const selector = args[0];
            if (!selector) throw new Error("Usage: inspect <selector|url> [--region jp|cn|en] [--timeline] [--lines 1..25]");
            const rep = await runInspectOne(selector, opts);
            if (opts.json) console.log(JSON.stringify(rep, null, 2));
            else printInspect(rep, opts);
        } else if (command === "study") {
            const kit = await runStudy(opts);
            if (opts.json) console.log(JSON.stringify(kit, null, 2));
            else printStudy(kit);
        } else if (command === "catalog") {
            const subkind = args[0];
            const res = await runCatalog(subkind, args[1], opts);
            if (opts.json) console.log(JSON.stringify(res, null, 2));
            else printCatalog(res);
        } else {
            throw new Error(`Unknown command '${command}'. Run with --help to see available commands.`);
        }
    } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}

function isDirectExecution() {
    if (!process.argv[1]) return false;
    try {
        return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
    } catch {
        return false;
    }
}

if (isDirectExecution()) {
    main();
}
