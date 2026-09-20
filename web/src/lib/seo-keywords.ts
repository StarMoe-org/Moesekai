/**
 * Localized SEO constants and helpers for Moesekai.
 *
 * Keep SEO copy in this server-safe module instead of scattering hardcoded
 * metadata across routes. Adding a future locale such as ja-JP should be a
 * data-only change here plus the shared UI locale registry/messages.
 */

import { DEFAULT_UI_LOCALE, type UiLocale } from "@/lib/i18n/locales";
import { interpolateMessage, type MessageInterpolationValues } from "@/lib/i18n/format";
import {
  ZH_TW_DETAIL_FALLBACK_DESCRIPTIONS,
  ZH_TW_DETAIL_FALLBACK_TITLES,
  ZH_TW_DETAIL_SEO_TEMPLATES,
  ZH_TW_DYNAMIC_SEO_TEMPLATES,
  ZH_TW_SEO_PAGE_METADATA,
} from "@/lib/seo-zh-tw";

// ==================== Types ====================

export type SeoPageKey = keyof typeof SEO_PAGE_METADATA;
export type DetailSeoKind = keyof typeof DETAIL_SEO_TEMPLATES;
export type DynamicSeoKind = keyof typeof DYNAMIC_SEO_TEMPLATES;
export type DetailFallbackKind = keyof typeof DETAIL_FALLBACK_TITLES;

interface SeoLocaleConfig {
  htmlLang: string;
  openGraphLocale: string;
  alternateOpenGraphLocales: readonly string[];
  titleTemplate: string;
  suffix: string;
  detailSuffix: string;
  root: {
    title: string;
    description: string;
    keywords: readonly string[];
    jsonLdAlternateName: readonly string[];
    jsonLdDescription: string;
  };
}

type LocalizedText = Partial<Record<UiLocale, string>> & { "zh-CN": string };
type LocalizedKeywords = Partial<Record<UiLocale, readonly string[]>> & { "zh-CN": readonly string[] };

type SeoPageDefinition = {
  readonly path: string;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly keywords: LocalizedKeywords;
};

// ==================== Locale Strategy ====================

/**
 * SEO locale registry. When ja-JP is added to SUPPORTED_UI_LOCALES, TypeScript
 * will require adding the Japanese SEO copy here as well.
 */
export const SEO_LOCALE_CONFIG = {
  "zh-CN": {
    htmlLang: "zh-CN",
    openGraphLocale: "zh_CN",
    alternateOpenGraphLocales: ["zh_TW", "en_US", "ja_JP", "ko_KR"],
    titleTemplate: "%s | Moesekai - PJSK / 世界计划资料站",
    suffix: " — 新一代 PJSK WIKI 与 Project SEKAI / 世界计划游戏资料库",
    detailSuffix: " | PJSK WIKI / 世界计划资料站",
    root: {
      title: "Moesekai - 新一代 PJSK WIKI | Project SEKAI / 世界计划 游戏资料库",
      description:
        "Moesekai（原 Snowy SekaiViewer）是新一代 PJSK WIKI 与 Project SEKAI（世界计划 缤纷舞台 / PRSK）游戏数据资料站，提供卡牌图鉴、音乐谱面、活动预测、扭蛋、剧情、实时排行、MySekai 与实用工具。",
      keywords: [
        "新一代PJSK WIKI",
        "PJSK WIKI",
        "PJSK wiki",
        "PJSK",
        "PJSK图鉴",
        "PJSK数据库",
        "Project SEKAI",
        "Project Sekai",
        "PRSK",
        "世界计划",
        "世界计划WIKI",
        "世界计划缤纷舞台",
        "世界计划多彩舞台",
        "初音未来缤纷舞台WIKI",
        "初音未来缤纷舞台",
        "啤酒烧烤",
        "プロセカ",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdAlternateName: [
        "PJSK WIKI",
        "新一代PJSK WIKI",
        "PJSK Wiki",
        "Project SEKAI Wiki",
        "世界计划 WIKI",
        "PRSK Wiki",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdDescription:
        "新一代 PJSK WIKI 与 Project SEKAI（世界计划 缤纷舞台 / PRSK）游戏数据查看器，提供卡牌、音乐谱面、活动预测、扭蛋、剧情、实时排行、MySekai 与实用工具。",
    },
  },
  "en-US": {
    htmlLang: "en-US",
    openGraphLocale: "en_US",
    alternateOpenGraphLocales: ["zh_CN", "zh_TW", "ja_JP", "ko_KR"],
    titleTemplate: "%s | Moesekai - PJSK / Project SEKAI Wiki",
    suffix: " — Next-generation PJSK Wiki & Project SEKAI Database",
    detailSuffix: " | PJSK Wiki / Project SEKAI",
    root: {
      title: "Moesekai - Next-generation PJSK Wiki & Project SEKAI Database",
      description:
        "Moesekai (formerly Snowy SekaiViewer) is a next-generation PJSK wiki and Project SEKAI: COLORFUL STAGE! (PRSK / Hatsune Miku: Colorful Stage) data viewer for cards, songs, events, gachas, stories, live rankings, MySekai, and fan tools.",
      keywords: [
        "PJSK wiki",
        "PJSK",
        "PJSK Wiki",
        "Project Sekai wiki",
        "Project SEKAI wiki",
        "Project SEKAI database",
        "PRSK",
        "PRSK wiki",
        "Project Sekai cards",
        "Project Sekai songs",
        "Project Sekai events",
        "Hatsune Miku Colorful Stage wiki",
        "Colorful Stage",
        "Proseka",
        "プロセカ",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdAlternateName: [
        "PJSK Wiki",
        "PJSK WIKI",
        "Project SEKAI Wiki",
        "Project SEKAI Database",
        "PRSK Wiki",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdDescription:
        "A next-generation PJSK wiki and Project SEKAI database for cards, songs, events, gachas, stories, live rankings, MySekai, and fan tools.",
    },
  },
  "ja-JP": {
    htmlLang: "ja-JP",
    openGraphLocale: "ja_JP",
    alternateOpenGraphLocales: ["zh_CN", "zh_TW", "en_US", "ko_KR"],
    titleTemplate: "%s | Moesekai - プロセカ / PJSK / PRSK Wiki",
    suffix: " — プロセカ攻略・PJSK / PRSK (Project SEKAI) 次世代Wiki",
    detailSuffix: " | プロセカ / PJSK Wiki",
    root: {
      title: "Moesekai - プロセカ攻略・次世代 PJSK / PRSK Wiki (Project SEKAI DB)",
      description:
        "Moesekai（旧 Snowy SekaiViewer）は『プロジェクトセカイ カラフルステージ！ feat. 初音ミク（プロセカ / PJSK / PRSK）』のデータビューア＆非公式Wiki攻略サイトです。カード、楽曲、譜面、イベント、ガチャ、ストーリー、ランキング、MySekai などの最新データを網羅。",
      keywords: [
        "プロセカ",
        "プロセカ wiki",
        "プロセカ 攻略",
        "PJSK",
        "PJSK wiki",
        "PRSK",
        "PRSK wiki",
        "プロジェクトセカイ",
        "プロジェクトセカイ wiki",
        "Project SEKAI データベース",
        "プロセカ カード",
        "プロセカ 楽曲",
        "プロセカ 譜面",
        "プロセカ イベント",
        "Project Sekai",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdAlternateName: [
        "プロセカ Wiki",
        "PJSK Wiki",
        "PRSK Wiki",
        "プロセカ 攻略",
        "Project SEKAI Database",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdDescription:
        "プロジェクトセカイ（プロセカ / PJSK / PRSK）のカード、楽曲、譜面、イベント、ガチャ、ストーリー、ランキング、MySekai、便利ツールを扱うデータビューアです。",
    },
  },
  "ko-KR": {
    htmlLang: "ko-KR",
    openGraphLocale: "ko_KR",
    alternateOpenGraphLocales: ["zh_CN", "zh_TW", "en_US", "ja_JP"],
    titleTemplate: "%s | Moesekai - 프로세카 / PJSK Wiki",
    suffix: " — 차세대 PJSK / 프로세카 (Project SEKAI) Wiki",
    detailSuffix: " | PJSK / 프로세카 Wiki",
    root: {
      title: "Moesekai - 차세대 PJSK / 프로세카 Wiki (Project SEKAI DB)",
      description:
        "Moesekai(구 Snowy SekaiViewer)는 ‘프로젝트 세카이(프로세카 / PJSK / PRSK)’의 데이터 뷰어이자 비공식 위키입니다. 카드, 악곡, 채보, 이벤트, 가샤, 스토리, 실시간 랭킹, MySekai 및 다양한 도구를 제공합니다.",
      keywords: [
        "PJSK wiki",
        "PJSK",
        "프로세카",
        "프로세카 위키",
        "프로젝트 세카이",
        "프로젝트 세카이 wiki",
        "PRSK",
        "프로세카 카드",
        "프로세카 곡",
        "프로세카 이벤트",
        "Project Sekai",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdAlternateName: [
        "PJSK Wiki",
        "프로세카 위키",
        "Project SEKAI Database",
        "PRSK Wiki",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdDescription:
        "Project SEKAI(프로세카 / PJSK / PRSK)의 카드, 악곡, 채보, 이벤트, 가샤, 스토리, MySekai 및 다양한 도구를 제공하는 데이터 뷰어입니다.",
    },
  },
  "zh-TW": {
    htmlLang: "zh-TW",
    openGraphLocale: "zh_TW",
    alternateOpenGraphLocales: ["zh_CN", "en_US", "ja_JP", "ko_KR"],
    titleTemplate: "%s | Moesekai - PJSK / 世界計畫資料庫",
    suffix: " — 次世代 PJSK Wiki 與 Project SEKAI / 世界計畫遊戲資料庫",
    detailSuffix: " | PJSK / 世界計畫資料庫",
    root: {
      title: "Moesekai - 次世代 PJSK Wiki | Project SEKAI / 世界計畫 遊戲資料庫",
      description:
        "Moesekai（原 Snowy SekaiViewer）是專注於《Project SEKAI COLORFUL STAGE! feat. 初音未來》（世界計畫 繽紛舞台 / PJSK / PRSK）的遊戲資料庫與繁中 Wiki，提供卡牌、歌曲譜面、活動、轉蛋、劇情、即時榜單、MySekai 與實用工具。",
      keywords: [
        "PJSK Wiki",
        "PJSK",
        "世界計畫 Wiki",
        "世界計畫",
        "世界計畫 繽紛舞台",
        "Project SEKAI Wiki",
        "Project SEKAI",
        "PRSK",
        "プロセカ",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdAlternateName: [
        "PJSK Wiki",
        "世界計畫 Wiki",
        "次世代 PJSK Wiki",
        "Project SEKAI Database",
        "PRSK Wiki",
        "Moesekai",
        "Snowy SekaiViewer",
      ],
      jsonLdDescription:
        "Project SEKAI（世界計畫 / PJSK / PRSK）的卡牌、歌曲、活動、轉蛋、劇情、即時榜單、MySekai 與實用工具資料庫。",
    },
  },
} as const satisfies Record<UiLocale, SeoLocaleConfig>;

export function getSeoLocaleConfig(locale: UiLocale = DEFAULT_UI_LOCALE): SeoLocaleConfig {
  return SEO_LOCALE_CONFIG[locale] ?? SEO_LOCALE_CONFIG[DEFAULT_UI_LOCALE];
}

// ==================== Page Metadata ====================

const COMMON_BRAND_KEYWORDS = {
  "zh-CN": ["PJSK", "PJSK Wiki", "Project Sekai", "Project SEKAI", "PRSK", "世界计划", "世界计划缤纷舞台", "プロセカ", "Moesekai"],
  "zh-TW": ["PJSK", "PJSK Wiki", "Project Sekai", "Project SEKAI", "PRSK", "世界計畫", "世界計畫 繽紛舞台", "プロセカ", "Moesekai"],
  "en-US": ["PJSK", "PJSK Wiki", "Project Sekai", "Project SEKAI", "PRSK", "Colorful Stage", "Hatsune Miku Colorful Stage", "Proseka", "プロセカ", "Moesekai"],
  "ja-JP": ["プロセカ", "PJSK", "PRSK", "プロジェクトセカイ", "プロセカ 攻略", "プロセカ wiki", "Project Sekai", "Project SEKAI", "Moesekai"],
  "ko-KR": ["PJSK", "PJSK Wiki", "프로젝트 세카이", "프로세카", "PRSK", "Project Sekai", "Project SEKAI", "Moesekai"],
} as const satisfies Record<UiLocale, readonly string[]>;

function localizedText(value: LocalizedText, locale: UiLocale): string {
  return value[locale] ?? value["en-US"] ?? value["zh-CN"];
}

function localizedKeywordsValue(value: LocalizedKeywords, locale: UiLocale): readonly string[] {
  return value[locale] ?? value["en-US"] ?? value["zh-CN"];
}

function withBrandKeywords(keywords: LocalizedKeywords): Record<UiLocale, readonly string[]> {
  const localizedKeywords = {} as Record<UiLocale, readonly string[]>;

  for (const locale of Object.keys(COMMON_BRAND_KEYWORDS) as UiLocale[]) {
    localizedKeywords[locale] = [...new Set([...localizedKeywordsValue(keywords, locale), ...COMMON_BRAND_KEYWORDS[locale]])];
  }

  return localizedKeywords;
}

function definePage(path: string, title: LocalizedText, description: LocalizedText, keywords: LocalizedKeywords): SeoPageDefinition {
  return { path, title, description, keywords: withBrandKeywords(keywords) };
}

export const SEO_PAGE_METADATA = {
  about: definePage(
    "/about",
    { "zh-CN": "关于", "en-US": "About", "ja-JP": "Moesekaiについて" },
    {
      "zh-CN": "了解 Moesekai（原 Snowy SekaiViewer）的站点定位、数据来源与致谢。",
      "en-US": "Learn about Moesekai (formerly Snowy SekaiViewer), its data sources, credits, and site mission.",
      "ja-JP": "Moesekai（旧 Snowy SekaiViewer）のサイト方針、データ出典、クレジットを確認できます。",
    },
    {
      "zh-CN": ["关于", "数据来源", "致谢"],
      "en-US": ["about Moesekai", "data sources", "credits"],
      "ja-JP": ["Moesekaiについて", "データ出典", "クレジット"],
    },
  ),
  cards: definePage(
    "/cards",
    { "zh-CN": "卡牌图鉴", "en-US": "Card Encyclopedia", "ja-JP": "カード図鑑" },
    {
      "zh-CN": "浏览 Project SEKAI 全部卡牌，按角色、稀有度、属性、技能与团体归属筛选。",
      "en-US": "Browse all Project Sekai cards with character, rarity, attribute, skill, and unit filters.",
      "ja-JP": "Project SEKAI のカードをキャラクター、レアリティ、属性、スキル、ユニットで絞り込めます。",
    },
    {
      "zh-CN": ["卡牌", "卡牌图鉴", "卡牌数据库"],
      "en-US": ["cards", "card database", "card encyclopedia"],
      "ja-JP": ["カード", "カード図鑑", "カードデータベース"],
    },
  ),
  music: definePage(
    "/music",
    { "zh-CN": "歌曲图鉴", "en-US": "Music Encyclopedia", "ja-JP": "楽曲図鑑" },
    {
      "zh-CN": "浏览 Project SEKAI 歌曲列表，查看谱面难度、定数、作词作曲与 MV 信息。",
      "en-US": "Browse Project Sekai songs with chart difficulty, constants, lyricist, composer, and MV information.",
      "ja-JP": "Project SEKAI の楽曲一覧、譜面難易度、定数、作詞作曲、MV 情報を確認できます。",
    },
    {
      "zh-CN": ["音乐", "歌曲图鉴", "谱面", "歌曲Meta"],
      "en-US": ["songs", "music", "chart difficulty", "song database"],
      "ja-JP": ["楽曲", "楽曲図鑑", "譜面", "楽曲データベース"],
    },
  ),
  lyrics: definePage(
    "/lyrics",
    { "zh-CN": "歌词资料库", "en-US": "Lyrics Library", "ja-JP": "歌詞ライブラリ", "ko-KR": "가사 라이브러리" },
    {
      "zh-CN": "浏览 Project SEKAI 已发布歌曲歌词，对照日文原文、简体中文与英文翻译。",
      "en-US": "Browse published Project Sekai song lyrics with Japanese source text, Simplified Chinese, and English translations.",
      "ja-JP": "Project SEKAI の公開済み歌詞を、日本語原文・簡体字中国語・英語翻訳で閲覧できます。",
      "ko-KR": "Project SEKAI의 공개된 노래 가사를 일본어 원문, 중국어 간체 및 영어 번역과 함께 확인할 수 있습니다.",
    },
    {
      "zh-CN": ["歌词", "歌曲歌词", "歌词翻译"],
      "en-US": ["lyrics", "song lyrics", "lyrics translation"],
      "ja-JP": ["歌詞", "楽曲歌詞", "歌詞翻訳"],
      "ko-KR": ["가사", "노래 가사", "가사 번역"],
    },
  ),
  soundtrack: definePage(
    "/soundtrack",
    { "zh-CN": "游戏原声带", "en-US": "Soundtrack", "ja-JP": "サウンドトラック" },
    {
      "zh-CN": "收听与浏览 Project SEKAI 游戏原声带、背景音乐与相关音频资源。",
      "en-US": "Browse Project Sekai soundtrack, background music, and related in-game audio resources.",
      "ja-JP": "Project SEKAI のサウンドトラック、BGM、ゲーム内音源を閲覧できます。",
    },
    {
      "zh-CN": ["游戏原声带", "背景音乐", "BGM", "OST"],
      "en-US": ["soundtrack", "BGM", "OST", "game audio"],
      "ja-JP": ["サウンドトラック", "BGM", "OST", "ゲーム音源"],
    },
  ),
  music_meta: definePage(
    "/music/meta",
    { "zh-CN": "歌曲 Meta", "en-US": "Music Meta", "ja-JP": "楽曲Meta" },
    {
      "zh-CN": "查看 Project SEKAI 歌曲效率、难度定数与活动周回相关 Meta 数据。",
      "en-US": "Explore Project Sekai song meta data for efficiency, chart constants, and event play planning.",
      "ja-JP": "Project SEKAI の楽曲効率、譜面定数、イベント周回に役立つMetaデータを確認できます。",
    },
    {
      "zh-CN": ["歌曲Meta", "效率排行", "定数", "周回"],
      "en-US": ["music meta", "efficiency ranking", "chart constants"],
      "ja-JP": ["楽曲Meta", "効率ランキング", "譜面定数", "周回"],
    },
  ),
  events: definePage(
    "/events",
    { "zh-CN": "活动图鉴", "en-US": "Event Encyclopedia", "ja-JP": "イベント図鑑" },
    {
      "zh-CN": "浏览 Project SEKAI 活动列表，查看活动详情、加成角色、活动歌曲与排名数据。",
      "en-US": "Browse Project Sekai events with event details, bonus characters, event songs, and ranking data.",
      "ja-JP": "Project SEKAI のイベント一覧、イベント詳細、ボーナスキャラクター、関連楽曲、ランキングデータを確認できます。",
    },
    {
      "zh-CN": ["活动", "活动图鉴", "活动排名"],
      "en-US": ["events", "event database", "event rankings"],
      "ja-JP": ["イベント", "イベント図鑑", "イベントランキング"],
    },
  ),
  information: definePage(
    "/information",
    { "zh-CN": "游戏公告", "en-US": "Game Announcements", "ja-JP": "ゲームお知らせ" },
    {
      "zh-CN": "查看 Project SEKAI 日服与国服游戏公告、活动预告、招募资讯与歌曲追加情报。",
      "en-US": "View Project SEKAI JP and CN game announcements, event previews, gacha news, and song updates.",
      "ja-JP": "Project SEKAI の日本版・簡体字版のお知らせ、イベント予告、ガチャ情報、楽曲追加情報を確認できます。",
    },
    {
      "zh-CN": ["公告", "游戏公告", "活动预告", "最新资讯"],
      "en-US": ["announcements", "game news", "event preview", "notice"],
      "ja-JP": ["お知らせ", "ゲームお知らせ", "イベント予告", "最新情報"],
    },
  ),
  gacha: definePage(
    "/gacha",
    { "zh-CN": "扭蛋数据库", "en-US": "Gacha Database", "ja-JP": "ガチャデータベース" },
    {
      "zh-CN": "浏览 Project SEKAI 扭蛋卡池，查看卡池时间、PU 卡牌与概率信息。",
      "en-US": "Browse Project Sekai gacha banners with schedules, pickup cards, and rate information.",
      "ja-JP": "Project SEKAI のガチャ一覧、開催期間、ピックアップカード、提供割合を確認できます。",
    },
    {
      "zh-CN": ["扭蛋", "卡池", "Gacha", "PU卡牌"],
      "en-US": ["gacha", "banners", "pickup cards", "rates"],
      "ja-JP": ["ガチャ", "ガチャ一覧", "ピックアップカード", "提供割合"],
    },
  ),
  character: definePage(
    "/character",
    { "zh-CN": "角色图鉴", "en-US": "Character Encyclopedia", "ja-JP": "キャラクター図鑑" },
    {
      "zh-CN": "浏览 Project SEKAI 角色资料、组合信息、生日与角色详情。",
      "en-US": "Browse Project Sekai character profiles, units, birthdays, and detailed character information.",
      "ja-JP": "Project SEKAI のキャラクター情報、ユニット、誕生日、詳細プロフィールを確認できます。",
    },
    {
      "zh-CN": ["角色", "角色图鉴", "组合", "生日"],
      "en-US": ["characters", "character profiles", "units", "birthdays"],
      "ja-JP": ["キャラクター", "キャラクター図鑑", "ユニット", "誕生日"],
    },
  ),
  comic: definePage(
    "/comic",
    { "zh-CN": "一格漫画", "en-US": "Comic Database", "ja-JP": "1コマ漫画" },
    {
      "zh-CN": "浏览 Project SEKAI 官方一格漫画，按发布时间查找作品，并阅读站内收录的中文翻译与角色趣味日常。",
      "en-US": "Browse official Project SEKAI one-panel comics by release date, with available translations and short character-focused stories collected in one place.",
      "ja-JP": "Project SEKAI 公式1コマ漫画を公開順に閲覧し、収録済みの翻訳やキャラクターの日常を描いた短編を確認できます。",
      "ko-KR": "Project SEKAI 공식 1컷 만화를 공개 순서대로 살펴보고, 제공되는 번역과 캐릭터의 일상을 담은 짧은 이야기를 확인할 수 있습니다.",
    },
    {
      "zh-CN": ["漫画", "一格漫画", "官方漫画"],
      "en-US": ["comic", "one-panel comics", "official comics"],
      "ja-JP": ["漫画", "1コマ漫画", "公式漫画"],
    },
  ),
  costumes: definePage(
    "/costumes",
    { "zh-CN": "服装图鉴", "en-US": "Costumes", "ja-JP": "衣装図鑑" },
    {
      "zh-CN": "浏览 Project SEKAI 服装图鉴，按角色、获取来源与服装信息筛选。",
      "en-US": "Browse Project SEKAI costumes with character, source, and costume detail filters.",
      "ja-JP": "Project SEKAI の衣装をキャラクター、入手方法、衣装情報で絞り込めます。",
    },
    {
      "zh-CN": ["服装", "服装图鉴", "衣装"],
      "en-US": ["costumes", "outfits", "costume database"],
      "ja-JP": ["衣装", "衣装図鑑", "コスチューム"],
    },
  ),
  exchanges: definePage(
    "/exchanges",
    { "zh-CN": "兑换所", "en-US": "Exchange Shop", "ja-JP": "交換所" },
    {
      "zh-CN": "浏览 Project SEKAI 兑换所与兑换条目，查看奖励、消耗与开放时间。",
      "en-US": "Browse Project Sekai exchange shops and entries with rewards, costs, and availability.",
      "ja-JP": "Project SEKAI の交換所と交換アイテムを閲覧し、報酬、必要素材、開催期間を確認できます。",
    },
    {
      "zh-CN": ["兑换所", "兑换奖励", "交换所"],
      "en-US": ["exchange shop", "exchange rewards", "shop entries"],
      "ja-JP": ["交換所", "交換アイテム", "報酬交換"],
    },
  ),
  manga: definePage(
    "/manga",
    { "zh-CN": "官方四格漫画", "en-US": "Official 4-Koma", "ja-JP": "公式4コマ" },
    {
      "zh-CN": "浏览 Project SEKAI 官方四格漫画章节，按连载顺序查找各话内容，并查看对应封面与漫画图片。",
      "en-US": "Browse official Project SEKAI four-panel comic episodes in publication order, with chapter titles, cover information, and available comic images.",
      "ja-JP": "Project SEKAI 公式4コマ漫画を連載順に閲覧し、各話のタイトル、表紙情報、収録画像を確認できます。",
      "ko-KR": "Project SEKAI 공식 4컷 만화를 연재 순서대로 살펴보고 각 화의 제목, 표지 정보, 수록 이미지를 확인할 수 있습니다.",
    },
    {
      "zh-CN": ["四格漫画", "官方四格", "漫画"],
      "en-US": ["4-koma", "four-panel comics", "official manga"],
      "ja-JP": ["4コマ", "公式4コマ", "漫画"],
    },
  ),
  materials: definePage(
    "/materials",
    { "zh-CN": "素材数据库", "en-US": "Materials Database", "ja-JP": "素材データベース" },
    {
      "zh-CN": "浏览 Project SEKAI 素材、持有物与 MySekai 材料数据。",
      "en-US": "Browse Project Sekai materials, items, and MySekai resource data.",
      "ja-JP": "Project SEKAI の素材、所持アイテム、MySekai関連リソースを確認できます。",
    },
    {
      "zh-CN": ["持有物", "素材", "材料", "MySekai材料"],
      "en-US": ["materials", "items", "resources", "MySekai materials"],
      "ja-JP": ["素材", "アイテム", "リソース", "MySekai素材"],
    },
  ),
  honors: definePage(
    "/honors",
    { "zh-CN": "称号成就", "en-US": "Honor Achievements", "ja-JP": "称号・実績" },
    {
      "zh-CN": "浏览 Project SEKAI 称号与成就数据库，查看普通称号、活动排名称号及角色羁绊称号的图标和获取条件。",
      "en-US": "Browse the Project SEKAI honor database, including achievement, event ranking, and character bonds honors with icons and unlock requirements.",
      "ja-JP": "Project SEKAI の称号データベースで、実績称号、イベントランキング称号、キズナ称号の画像と獲得条件を確認できます。",
      "ko-KR": "Project SEKAI 칭호 데이터베이스에서 업적, 이벤트 랭킹, 인연 칭호의 이미지와 획득 조건을 확인할 수 있습니다.",
    },
    {
      "zh-CN": ["称号", "成就", "羁绊称号"],
      "en-US": ["honors", "achievements", "bonds honors"],
      "ja-JP": ["称号", "実績", "キズナ称号"],
    },
  ),
  live: definePage(
    "/live",
    { "zh-CN": "虚拟 Live 数据库", "en-US": "Virtual Live Database", "ja-JP": "バーチャルライブDB" },
    {
      "zh-CN": "浏览 Project SEKAI 虚拟 Live、演唱会时间与奖励信息。",
      "en-US": "Browse Project Sekai virtual live schedules, live details, and rewards.",
      "ja-JP": "Project SEKAI のバーチャルライブ、開催時間、報酬情報を確認できます。",
    },
    {
      "zh-CN": ["演唱会", "虚拟Live", "Virtual Live"],
      "en-US": ["virtual live", "live schedule", "concerts"],
      "ja-JP": ["バーチャルライブ", "ライブスケジュール", "報酬"],
    },
  ),
  sticker: definePage(
    "/sticker",
    { "zh-CN": "贴纸表情", "en-US": "Sticker Database", "ja-JP": "スタンプデータベース" },
    {
      "zh-CN": "浏览 Project SEKAI 贴纸与表情数据库，按角色查找游戏内 Stamp，查看名称、台词和高清图片资源。",
      "en-US": "Browse Project SEKAI stickers and in-game stamps by character, with names, voice lines, and high-quality image assets for each entry.",
      "ja-JP": "Project SEKAI のゲーム内スタンプをキャラクター別に検索し、名称、セリフ、高画質画像を確認できます。",
      "ko-KR": "Project SEKAI 게임 내 스탬프를 캐릭터별로 검색하고 이름, 대사, 고화질 이미지 자료를 확인할 수 있습니다.",
    },
    {
      "zh-CN": ["贴纸", "表情", "Stamp"],
      "en-US": ["stickers", "emotes", "stamps"],
      "ja-JP": ["スタンプ", "エモート", "ステッカー"],
    },
  ),
  mysekai_interactions: definePage(
    "/mysekai/interactions",
    { "zh-CN": "烤森对话", "en-US": "MYSEKAI Conversations & Interactions", "ja-JP": "マイセカイの会話とふれあい" },
    {
      "zh-CN": "按家具和角色浏览烤森对话、家具演出与无对白互动，在独立场景中查看和播放。国服与日服资源独立标注。",
      "en-US": "Explore MYSEKAI conversations, furniture performances and character activities by furniture or character. Inspect and play them in an independent scene with explicitly separated CN and JP resources.",
      "ja-JP": "家具やキャラクターからマイセカイの会話、家具の演出、セリフのないふれあいを探し、独立したシーンで鑑賞できます。中国版と日本版のリソースを明確に区別しています。",
    },
    { "zh-CN": ["MYSEKAI", "家具互动", "角色动作", "对话"], "en-US": ["MYSEKAI", "furniture interactions", "character activities", "conversations"], "ja-JP": ["マイセカイ", "家具", "会話", "ふれあい"] },
  ),
  mysekai: definePage(
    "/mysekai",
    { "zh-CN": "MySekai 家具数据库", "en-US": "Furniture Database", "ja-JP": "MySekai家具DB" },
    {
      "zh-CN": "浏览 Project SEKAI MySekai 家具、摆件、素材与风味文本。",
      "en-US": "Browse the Project SEKAI MySEKAI furniture database with fixtures, materials, and flavor text.",
      "ja-JP": "Project SEKAI MySekai の家具、設置物、素材、フレーバーテキストを閲覧できます。",
    },
    {
      "zh-CN": ["家具", "MySekai", "摆件", "MySekai材料"],
      "en-US": ["MySekai", "furniture", "fixtures", "housing"],
      "ja-JP": ["MySekai", "家具", "設置物", "ハウジング"],
    },
  ),
  prediction: definePage(
    "/prediction",
    { "zh-CN": "活动预测", "en-US": "Event Prediction", "ja-JP": "イベント予測" },
    {
      "zh-CN": "查看 Project SEKAI 活动预测与排名走势，通过历史数据、分数线变化和图表分析活动竞争趋势。",
      "en-US": "Review Project SEKAI event forecasts and ranking trends using historical results, border score changes, and charts for analyzing event competition.",
      "ja-JP": "Project SEKAI のイベント予測とランキング推移を、過去データ、ボーダースコアの変化、分析チャートから確認できます。",
      "ko-KR": "과거 결과, 보더 점수 변화, 분석 차트를 바탕으로 Project SEKAI 이벤트 예측과 랭킹 추이를 확인할 수 있습니다.",
    },
    {
      "zh-CN": ["活动预测", "排名预测", "预测线"],
      "en-US": ["event prediction", "ranking prediction", "forecast"],
      "ja-JP": ["イベント予測", "ランキング予測", "ボーダー予測"],
    },
  ),
  prediction_next: definePage(
    "/prediction-next",
    { "zh-CN": "活动预测 Next", "en-US": "Event Prediction Next", "ja-JP": "イベント予測 Next" },
    {
      "zh-CN": "全新 AkiYome v2.0.0-Tori 预测模型与冲榜目标规划器，支持 World Link 3 独立章节预测、贝叶斯-卡尔曼实时拟合与多人协力周回分析。",
      "en-US": "Next-generation Project SEKAI event border predictions powered by AkiYome v2.0.0-Tori Bayesian-Kalman engine, World Link 3 chapter predictions, and goal strategy planner.",
      "ja-JP": "AkiYome v2.0.0-Tori ベイズ・カルマン予測エンジンを搭載した新世代イベントボーダー予測と目標プランナー。World Link 3 各章予測に対応。",
      "ko-KR": "AkiYome v2.0.0-Tori 베이지안-칼만 예측 엔진과 이벤트 목표 전략 플래너를 탑재한 차세대 Project SEKAI 이벤트 예측.",
    },
    {
      "zh-CN": ["活动预测 Next", "AkiYome", "World Link预测", "冲榜规划"],
      "en-US": ["event prediction next", "AkiYome", "world link prediction", "border forecast"],
      "ja-JP": ["イベント予測 Next", "AkiYome", "ボーダー予測", "ワールドリンク予測"],
    },
  ),
  deck_recommend: definePage(
    "/deck-recommend",
    { "zh-CN": "组卡推荐", "en-US": "Deck Recommender", "ja-JP": "編成レコメンド" },
    {
      "zh-CN": "使用 Project SEKAI 组卡推荐工具自动计算活动收益、分数与最优卡组。",
      "en-US": "Use the Project Sekai deck recommender to calculate event bonus, score, and optimal decks.",
      "ja-JP": "Project SEKAI のイベントボーナス、スコア、最適編成を自動計算できます。",
    },
    {
      "zh-CN": ["组卡推荐", "卡组推荐", "最优卡组"],
      "en-US": ["deck recommender", "deck builder", "optimal deck"],
      "ja-JP": ["編成レコメンド", "編成計算", "最適編成"],
    },
  ),
  deck_comparator: definePage(
    "/deck-comparator",
    { "zh-CN": "组卡比较", "en-US": "Deck Comparator", "ja-JP": "編成比較" },
    {
      "zh-CN": "比较 Project SEKAI 多人 Live 的 PT、分数与不同卡组收益。",
      "en-US": "Compare Project Sekai multi-live PT, score outcomes, and deck performance.",
      "ja-JP": "Project SEKAI のマルチライブ PT、スコア、編成ごとの効率を比較できます。",
    },
    {
      "zh-CN": ["组卡比较", "卡组比较", "收益比较"],
      "en-US": ["deck comparator", "deck comparison", "multi-live score"],
      "ja-JP": ["編成比較", "スコア比較", "マルチライブ"],
    },
  ),
  chart_preview: definePage(
    "/chart-preview",
    { "zh-CN": "谱面预览", "en-US": "Chart Previewer", "ja-JP": "譜面プレビュー" },
    {
      "zh-CN": "使用 MikuMikuWorld 风格 3D 谱面预览器查看歌曲谱面或自定义 SUS/BGM URL。",
      "en-US": "Preview Project Sekai charts in a MikuMikuWorld-style 3D viewer with song selection or custom SUS/BGM URLs.",
      "ja-JP": "MikuMikuWorld 風の 3D ビューアで楽曲譜面やカスタム SUS/BGM URL をプレビューできます。",
    },
    {
      "zh-CN": ["谱面预览", "3D谱面", "SUS", "MikuMikuWorld"],
      "en-US": ["chart preview", "3D chart", "SUS", "MikuMikuWorld"],
      "ja-JP": ["譜面プレビュー", "3D譜面", "SUS", "MikuMikuWorld"],
    },
  ),
  chart_image: definePage(
    "/chart-image",
    { "zh-CN": "谱面图片预览", "en-US": "Chart Image Viewer", "ja-JP": "譜面画像プレビュー" },
    {
      "zh-CN": "在浏览器中将 Project SEKAI 谱面渲染为可缩放的整曲谱面图，支持导出 PNG。",
      "en-US": "Render Project Sekai charts into a zoomable full-song chart image in your browser, with PNG export.",
      "ja-JP": "Project SEKAI の譜面をブラウザ上でズーム可能な譜面画像としてレンダリングし、PNG 出力にも対応します。",
    },
    {
      "zh-CN": ["谱面图片", "谱面预览", "SUS"],
      "en-US": ["chart image", "chart preview", "SUS"],
      "ja-JP": ["譜面画像", "譜面プレビュー", "SUS"],
    },
  ),
  mysekai_interaction_resources: definePage(
    "/mysekai/interactions/resources",
    { "zh-CN": "MYSEKAI 互动资源管理", "en-US": "MYSEKAI Interaction Resources", "ja-JP": "MYSEKAI ふれあいリソース管理" },
    {
      "zh-CN": "查看、删除并重新加载 MYSEKAI 对话与互动的本地缓存资源。",
      "en-US": "Inspect, remove and reload locally cached MYSEKAI interaction resources.",
      "ja-JP": "MYSEKAI の会話とふれあいに必要なローカルリソースを確認・削除・再読み込みできます。",
    },
    { "zh-CN": ["MYSEKAI", "资源管理"], "en-US": ["MYSEKAI", "resources"], "ja-JP": ["MYSEKAI", "リソース管理"] },
  ),
  mysekai_preview: definePage(
    "/mysekai-preview",
    { "zh-CN": "烤森百景", "en-US": "MySekai Housing Competition", "ja-JP": "MySekaiハウジングコンテスト" },
    {
      "zh-CN": "浏览 Project SEKAI MySekai 家具大赛作品、排行榜缩略图与 3D 预览。",
      "en-US": "Browse top Project Sekai MySekai housing competition entries, thumbnails, rankings, and 3D previews.",
      "ja-JP": "Project SEKAI MySekai ハウジングコンテスト作品、ランキング、サムネイル、3D プレビューを閲覧できます。",
    },
    {
      "zh-CN": ["烤森百景", "百景排行", "MySekai活动", "3D预览"],
      "en-US": ["MySekai", "housing competition", "top entries", "3D preview"],
      "ja-JP": ["MySekai", "ハウジングコンテスト", "ランキング", "3Dプレビュー"],
    },
  ),
  mysekai_preview_ranking: definePage(
    "/mysekai-preview/ranking",
    { "zh-CN": "MySekai 排名作品预览", "en-US": "MySekai Housing Entry Preview", "ja-JP": "MySekaiランキング作品プレビュー" },
    {
      "zh-CN": "预览 Project SEKAI MySekai 家具大赛排名作品的 3D 房间布局。",
      "en-US": "View a 3D layout preview for a ranked Project Sekai MySekai housing competition entry.",
      "ja-JP": "Project SEKAI MySekai ハウジングコンテストのランキング作品を 3D でプレビューできます。",
    },
    {
      "zh-CN": ["MySekai", "百景排行", "排名作品", "3D预览"],
      "en-US": ["MySekai", "ranked entry", "housing competition", "3D preview"],
      "ja-JP": ["MySekai", "ランキング作品", "ハウジングコンテスト", "3Dプレビュー"],
    },
  ),
  mysekai_preview_scene: definePage(
    "/mysekai-preview/scene",
    { "zh-CN": "MySekai 3D 预览器", "en-US": "MySekai 3D Previewer", "ja-JP": "MySekai 3Dプレビュー" },
    {
      "zh-CN": "通过日服/国服 UID、本地 JSON 文件或公开 JSON URL 预览 MySekai 房间布局。",
      "en-US": "Preview MySekai room layouts by JP / CN UID, local JSON files, or public JSON URLs.",
      "ja-JP": "JP / CN UID、ローカル JSON、公開 JSON URL から MySekai ルームレイアウトを 3D プレビューできます。",
    },
    {
      "zh-CN": ["MySekai", "UID", "房间布局", "JSON", "3D"],
      "en-US": ["MySekai", "UID", "layout JSON", "scene preview", "3D"],
      "ja-JP": ["MySekai", "UID", "ルームレイアウト", "JSON", "3D"],
    },
  ),
  my_cards: definePage(
    "/my-cards",
    { "zh-CN": "卡牌进度", "en-US": "Card Progress", "ja-JP": "カード進捗" },
    {
      "zh-CN": "追踪你的 Project SEKAI 卡牌收集进度、练度与账号卡牌数据。",
      "en-US": "Track your Project Sekai card collection progress, training status, and account card data.",
      "ja-JP": "Project SEKAI のカード収集状況、育成状態、アカウントカードデータを管理できます。",
    },
    {
      "zh-CN": ["卡牌进度", "卡牌收集", "账号管理"],
      "en-US": ["card progress", "card collection", "account cards"],
      "ja-JP": ["カード進捗", "カード収集", "アカウントカード"],
    },
  ),
  my_musics: definePage(
    "/my-musics",
    { "zh-CN": "歌曲进度", "en-US": "Music Progress", "ja-JP": "楽曲進捗" },
    {
      "zh-CN": "追踪你的 Project SEKAI 歌曲游玩、Clear、Full Combo 与 AP 进度。",
      "en-US": "Track your Project Sekai song play progress, clears, full combos, and AP status.",
      "ja-JP": "Project SEKAI の楽曲プレイ状況、クリア、フルコンボ、AP 進捗を管理できます。",
    },
    {
      "zh-CN": ["歌曲进度", "歌曲游玩", "FC", "AP"],
      "en-US": ["music progress", "song clears", "full combo", "AP"],
      "ja-JP": ["楽曲進捗", "クリア", "フルコンボ", "AP"],
    },
  ),
  my_materials: definePage(
    "/my-materials",
    { "zh-CN": "资源库存", "en-US": "Resource Inventory", "ja-JP": "リソース在庫" },
    {
      "zh-CN": "查询你的 Project SEKAI 资源、材料库存与账号素材数据。",
      "en-US": "Check your Project Sekai resources, material inventory, and account item data.",
      "ja-JP": "Project SEKAI のリソース、素材在庫、アカウント所持アイテムを確認できます。",
    },
    {
      "zh-CN": ["资源查询", "材料库存", "账号资源"],
      "en-US": ["resource inventory", "materials", "account resources"],
      "ja-JP": ["リソース在庫", "素材", "アカウント資源"],
    },
  ),
  profile: definePage(
    "/profile",
    { "zh-CN": "个人主页", "en-US": "My Profile", "ja-JP": "マイプロフィール" },
    {
      "zh-CN": "管理 Moesekai 个人主页、绑定账号、公开 API 与 OAuth2 授权数据。",
      "en-US": "Manage your Moesekai profile, connected accounts, Public API data, and OAuth2 bindings.",
      "ja-JP": "Moesekai のプロフィール、連携アカウント、Public API データ、OAuth2 連携を管理できます。",
    },
    {
      "zh-CN": ["个人主页", "账号管理", "OAuth2"],
      "en-US": ["profile", "account management", "OAuth2"],
      "ja-JP": ["プロフィール", "アカウント管理", "OAuth2"],
    },
  ),
  score_control: definePage(
    "/score-control",
    { "zh-CN": "控分计算器", "en-US": "Score Control Calculator", "ja-JP": "スコア調整計算機" },
    {
      "zh-CN": "使用 Project SEKAI 控分计算器规划挂机、放置与目标分数路线。",
      "en-US": "Use the Project Sekai score control calculator to plan AFK routes and target score outcomes.",
      "ja-JP": "Project SEKAI の放置・AFK ルートや目標スコアに向けたスコア調整を計算できます。",
    },
    {
      "zh-CN": ["控分计算", "挂机", "分数路线"],
      "en-US": ["score control", "AFK routes", "score calculator"],
      "ja-JP": ["スコア調整", "放置", "スコア計算"],
    },
  ),
  sticker_maker: definePage(
    "/sticker-maker",
    { "zh-CN": "表情包制作", "en-US": "Sticker Maker", "ja-JP": "スタンプメーカー" },
    {
      "zh-CN": "在线制作 Project SEKAI 风格自定义贴纸与表情包，选择角色图片并调整文字、颜色和排版后导出成品。",
      "en-US": "Create custom Project SEKAI-style stickers online by choosing character art, editing text, colors, and layout, then exporting the finished image.",
      "ja-JP": "キャラクター画像、文字、色、レイアウトを調整して、Project SEKAI 風のオリジナルスタンプを作成・書き出しできます。",
      "ko-KR": "캐릭터 이미지, 문구, 색상, 배치를 조정하여 Project SEKAI 스타일의 맞춤 스탬프를 만들고 이미지로 저장할 수 있습니다.",
    },
    {
      "zh-CN": ["表情包制作", "贴纸制作", "自定义贴纸"],
      "en-US": ["sticker maker", "custom stickers", "emote maker"],
      "ja-JP": ["スタンプメーカー", "カスタムスタンプ", "エモート"],
    },
  ),
  realtime_ranking: definePage(
    "/realtime-ranking",
    { "zh-CN": "实时排行榜", "en-US": "Live Ranking", "ja-JP": "リアルタイムランキング" },
    {
      "zh-CN": "查看 Project SEKAI 实时排名，支持 CN / JP / TW / KR / EN 区服切换与分数变化提示。",
      "en-US": "View Project SEKAI live ranking with CN / JP / TW / KR / EN region switching and score change hints.",
      "ja-JP": "Project SEKAI のリアルタイムランキングを CN / JP / TW / KR / EN リージョン切替とスコア変動表示つきで確認できます。",
    },
    {
      "zh-CN": ["实时排行榜", "排名查询", "分数变化"],
      "en-US": ["live ranking", "real-time ranking", "score changes"],
      "ja-JP": ["リアルタイムランキング", "ランキング確認", "スコア変動"],
    },
  ),
  realtime_ranking_next: definePage(
    "/realtime-ranking-next",
    { "zh-CN": "实时排行榜 Next", "en-US": "Live Ranking Next", "ja-JP": "リアルタイムランキング Next" },
    {
      "zh-CN": "全新重构的 Project SEKAI 实时排行榜，提供个人排名详情、分数曲线、48 小时热力图、时速与周回分析。",
      "en-US": "Rebuilt Project SEKAI live ranking with player detail pages, score curves, 48h heatmaps, speed and lap analysis.",
      "ja-JP": "刷新された Project SEKAI リアルタイムランキング。個人詳細、スコア曲線、48時間ヒートマップ、時速・周回分析を提供します。",
    },
    {
      "zh-CN": ["实时排行榜", "个人排名详情", "分数曲线", "时速分析"],
      "en-US": ["live ranking", "player detail", "score curve", "speed analysis"],
      "ja-JP": ["リアルタイムランキング", "個人詳細", "スコア曲線", "時速分析"],
    },
  ),
  guess_jacket: definePage(
    "/guess-jacket",
    { "zh-CN": "猜曲绘", "en-US": "Guess Jacket", "ja-JP": "ジャケットクイズ" },
    {
      "zh-CN": "游玩 Project SEKAI 猜曲绘小游戏，根据逐步揭示的歌曲封面猜出对应乐曲，挑战你的曲库熟悉度。",
      "en-US": "Play a Project SEKAI music jacket quiz, identify songs from progressively revealed cover artwork, and test how well you know the game soundtrack.",
      "ja-JP": "少しずつ表示されるジャケット画像から楽曲名を当てる Project SEKAI クイズで、収録曲の知識を試せます。",
      "ko-KR": "조금씩 공개되는 재킷 이미지로 곡명을 맞히는 Project SEKAI 퀴즈에서 수록곡에 대한 지식을 시험할 수 있습니다.",
    },
    {
      "zh-CN": ["猜曲绘", "歌曲封面", "小游戏"],
      "en-US": ["guess jacket", "music cover", "guessing game"],
      "ja-JP": ["ジャケットクイズ", "楽曲ジャケット", "ミニゲーム"],
    },
  ),
  guess_jacket_multiplayer: definePage(
    "/guess-jacket/multiplayer",
    { "zh-CN": "猜曲绘联机", "en-US": "Guess Jacket Multiplayer", "ja-JP": "ジャケットクイズ マルチ" },
    {
      "zh-CN": "和朋友联机游玩 Project SEKAI 猜曲绘对战。",
      "en-US": "Play Project Sekai music jacket guessing multiplayer battles with friends.",
      "ja-JP": "友達と Project SEKAI 楽曲ジャケット当て対戦をマルチプレイで楽しめます。",
    },
    {
      "zh-CN": ["猜曲绘联机", "多人对战", "歌曲封面"],
      "en-US": ["guess jacket multiplayer", "multiplayer battle", "music cover"],
      "ja-JP": ["ジャケットクイズ マルチ", "対戦", "楽曲ジャケット"],
    },
  ),
  guess_who: definePage(
    "/guess-who",
    { "zh-CN": "猜角色", "en-US": "Guess Who", "ja-JP": "キャラクタークイズ" },
    {
      "zh-CN": "游玩 Project SEKAI 猜角色小游戏，根据角色资料与逐步给出的线索判断答案，挑战你的角色知识。",
      "en-US": "Play a Project SEKAI character quiz, identify the answer from progressively revealed profile clues, and test your knowledge of the cast.",
      "ja-JP": "プロフィール情報や段階的に表示されるヒントから答えを導く Project SEKAI キャラクタークイズを遊べます。",
      "ko-KR": "프로필 정보와 단계별 힌트로 정답을 찾는 Project SEKAI 캐릭터 퀴즈에서 등장인물에 대한 지식을 시험할 수 있습니다.",
    },
    {
      "zh-CN": ["猜角色", "角色竞猜", "小游戏"],
      "en-US": ["guess who", "character guessing", "guessing game"],
      "ja-JP": ["キャラクタークイズ", "キャラ当て", "ミニゲーム"],
    },
  ),
  guess_who_multiplayer: definePage(
    "/guess-who/multiplayer",
    { "zh-CN": "猜角色联机", "en-US": "Guess Who Multiplayer", "ja-JP": "キャラクタークイズ マルチ" },
    {
      "zh-CN": "和朋友联机游玩 Project SEKAI 猜角色对战。",
      "en-US": "Play Project Sekai character guessing multiplayer battles with friends.",
      "ja-JP": "友達と Project SEKAI キャラクター当て対戦をマルチプレイで楽しめます。",
    },
    {
      "zh-CN": ["猜角色联机", "多人对战", "角色竞猜"],
      "en-US": ["guess who multiplayer", "multiplayer battle", "character guessing"],
      "ja-JP": ["キャラクタークイズ マルチ", "対戦", "キャラ当て"],
    },
  ),
  goods_gacha: definePage(
    "/goods-gacha",
    { "zh-CN": "谷子盲抽", "en-US": "Goods Gacha Simulator", "ja-JP": "グッズガチャシミュレーター" },
    {
      "zh-CN": "使用 Project SEKAI 周边盲抽模拟器，自定义角色、商品与抽取规则，模拟随机谷子开箱和收藏结果。",
      "en-US": "Simulate random Project SEKAI merchandise pulls with customizable characters, goods, and draw rules to preview blind-box collection results.",
      "ja-JP": "キャラクター、グッズ、抽選ルールを設定し、Project SEKAI グッズのランダム購入やコレクション結果をシミュレーションできます。",
      "ko-KR": "캐릭터, 상품, 추첨 규칙을 설정하여 Project SEKAI 굿즈의 랜덤 구매와 수집 결과를 시뮬레이션할 수 있습니다.",
    },
    {
      "zh-CN": ["谷子盲抽", "周边", "抽卡模拟"],
      "en-US": ["goods gacha", "merchandise", "pull simulator"],
      "ja-JP": ["グッズガチャ", "グッズ", "シミュレーター"],
    },
  ),
  story: definePage(
    "/story",
    { "zh-CN": "剧情浏览", "en-US": "Story Browser", "ja-JP": "ストーリーブラウザ" },
    {
      "zh-CN": "浏览 Project SEKAI 主线、活动、卡牌、区域、自我介绍与特殊剧情。",
      "en-US": "Browse Project Sekai main, event, card, area, character introduction, and special stories.",
      "ja-JP": "Project SEKAI のメイン、イベント、カード、エリア、自己紹介、特殊ストーリーを閲覧できます。",
    },
    {
      "zh-CN": ["剧情", "故事", "剧情翻译"],
      "en-US": ["stories", "story reader", "translations"],
      "ja-JP": ["ストーリー", "ストーリーブラウザ", "翻訳"],
    },
  ),
  story_unit: definePage(
    "/story/unit",
    { "zh-CN": "主线剧情", "en-US": "Main Stories", "ja-JP": "メインストーリー" },
    {
      "zh-CN": "浏览 Project SEKAI 主线剧情与组合剧情章节。",
      "en-US": "Browse Project Sekai main story and unit story episodes.",
      "ja-JP": "Project SEKAI のメインストーリーとユニットストーリーのエピソードを閲覧できます。",
    },
    {
      "zh-CN": ["主线剧情", "组合剧情", "Main Story"],
      "en-US": ["main story", "unit stories", "story episodes"],
      "ja-JP": ["メインストーリー", "ユニットストーリー", "エピソード"],
    },
  ),
  story_event: definePage(
    "/story/event",
    { "zh-CN": "活动剧情", "en-US": "Event Stories", "ja-JP": "イベントストーリー" },
    {
      "zh-CN": "浏览 Project SEKAI 活动剧情、章节与剧情翻译。",
      "en-US": "Browse Project Sekai event stories, episodes, and story translations.",
      "ja-JP": "Project SEKAI のイベントストーリー、エピソード、翻訳を閲覧できます。",
    },
    {
      "zh-CN": ["活动剧情", "Event Story", "剧情翻译"],
      "en-US": ["event story", "story translations", "episodes"],
      "ja-JP": ["イベントストーリー", "ストーリー翻訳", "エピソード"],
    },
  ),
  story_card: definePage(
    "/story/card",
    { "zh-CN": "卡牌剧情", "en-US": "Card Stories", "ja-JP": "カードストーリー" },
    {
      "zh-CN": "浏览 Project SEKAI 卡牌剧情前篇、后篇与翻译。",
      "en-US": "Browse Project Sekai card stories, side story parts, and translations.",
      "ja-JP": "Project SEKAI のカードストーリー前編・後編と翻訳を閲覧できます。",
    },
    {
      "zh-CN": ["卡牌剧情", "Card Story", "前后篇"],
      "en-US": ["card story", "side story", "story parts"],
      "ja-JP": ["カードストーリー", "サイドストーリー", "前編 後編"],
    },
  ),
  story_area: definePage(
    "/story/area",
    { "zh-CN": "区域对话", "en-US": "Area Conversations", "ja-JP": "エリア会話" },
    {
      "zh-CN": "浏览 Project SEKAI 区域对话、场景对话与 Area Talk。",
      "en-US": "Browse Project Sekai area conversations, scenario talks, and Area Talk entries.",
      "ja-JP": "Project SEKAI のエリア会話、シナリオトーク、Area Talk を閲覧できます。",
    },
    {
      "zh-CN": ["区域对话", "Area Conversation", "Area Talk"],
      "en-US": ["area conversations", "Area Talk", "scenario talks"],
      "ja-JP": ["エリア会話", "Area Talk", "シナリオトーク"],
    },
  ),
  story_self: definePage(
    "/story/self",
    { "zh-CN": "自我介绍", "en-US": "Character Introductions", "ja-JP": "キャラクター自己紹介" },
    {
      "zh-CN": "浏览 Project SEKAI 角色自我介绍、角色介绍与语音剧情。",
      "en-US": "Browse Project Sekai character introductions, self introductions, and voiced story entries.",
      "ja-JP": "Project SEKAI のキャラクター自己紹介、プロフィール紹介、ボイス付きストーリーを閲覧できます。",
    },
    {
      "zh-CN": ["自我介绍", "角色介绍", "Character Introduction"],
      "en-US": ["character introductions", "self introductions", "voiced stories"],
      "ja-JP": ["自己紹介", "キャラクター紹介", "ボイスストーリー"],
    },
  ),
  story_special: definePage(
    "/story/special",
    { "zh-CN": "特殊剧情", "en-US": "Special Stories", "ja-JP": "スペシャルストーリー" },
    {
      "zh-CN": "浏览 Project SEKAI 特殊剧情、周年剧情与限定故事。",
      "en-US": "Browse Project Sekai special stories, anniversary stories, and limited story entries.",
      "ja-JP": "Project SEKAI のスペシャルストーリー、周年ストーリー、期間限定ストーリーを閲覧できます。",
    },
    {
      "zh-CN": ["特殊剧情", "Special Story", "周年剧情"],
      "en-US": ["special story", "anniversary story", "limited stories"],
      "ja-JP": ["スペシャルストーリー", "周年ストーリー", "限定ストーリー"],
    },
  ),
  guides: definePage(
    "/guides",
    { "zh-CN": "社区攻略", "en-US": "Guides", "ja-JP": "コミュニティガイド", "ko-KR": "커뮤니티 가이드" },
    {
      "zh-CN": "浏览 PROJECT SEKAI 社区攻略与教程，查找玩法机制、活动规划、养成建议和实用工具的专题指南。",
      "en-US": "Browse PROJECT SEKAI community guides covering game mechanics, event planning, progression advice, practical tools, and other reference topics.",
      "ja-JP": "PROJECT SEKAI のゲームシステム、イベント計画、育成、便利ツールを扱うコミュニティ攻略やチュートリアルを閲覧できます。",
      "ko-KR": "PROJECT SEKAI의 게임 시스템, 이벤트 계획, 성장 조언, 실용 도구를 다루는 커뮤니티 공략과 튜토리얼을 찾아볼 수 있습니다.",
    },
    {
      "zh-CN": ["攻略", "社区攻略", "Guide"],
      "en-US": ["guides", "community guides", "tutorials"],
      "ja-JP": ["攻略", "コミュニティガイド", "チュートリアル"],
      "ko-KR": ["가이드", "커뮤니티 가이드", "튜토리얼"],
    },
  ),
  patreon: definePage(
    "/patreon",
    { "zh-CN": "支持我们", "en-US": "Support Us", "ja-JP": "サポート" },
    {
      "zh-CN": "支持 Moesekai 的持续维护、数据更新与社区工具开发。",
      "en-US": "Support ongoing Moesekai maintenance, data updates, and community tool development.",
      "ja-JP": "Moesekai の継続的なメンテナンス、データ更新、コミュニティツール開発を支援できます。",
    },
    {
      "zh-CN": ["支持我们", "赞助", "Patreon"],
      "en-US": ["support Moesekai", "Patreon", "sponsor"],
      "ja-JP": ["Moesekaiサポート", "Patreon", "スポンサー"],
    },
  ),
  privacy: definePage(
    "/privacy",
    { "zh-CN": "隐私政策", "en-US": "Privacy Policy", "ja-JP": "プライバシーポリシー" },
    {
      "zh-CN": "阅读 Moesekai 隐私政策，了解本地存储、Cookie、广告与第三方服务说明。",
      "en-US": "Read the Moesekai privacy policy covering local storage, cookies, ads, and third-party services.",
      "ja-JP": "Moesekai のローカルストレージ、Cookie、広告、外部サービスに関するプライバシーポリシーを確認できます。",
    },
    {
      "zh-CN": ["隐私政策", "Cookie", "广告"],
      "en-US": ["privacy policy", "cookies", "ads"],
      "ja-JP": ["プライバシーポリシー", "Cookie", "広告"],
    },
  ),
  terms: definePage(
    "/terms",
    { "zh-CN": "服务条款", "en-US": "Terms of Service", "ja-JP": "利用規約" },
    {
      "zh-CN": "阅读 Moesekai 服务条款，了解站点性质、用户行为、免责声明与开源协议。",
      "en-US": "Read the Moesekai terms of service covering site scope, user behavior, disclaimers, and open-source licenses.",
      "ja-JP": "Moesekai のサイト範囲、ユーザー行動、免責事項、オープンソースライセンスに関する利用規約を確認できます。",
    },
    {
      "zh-CN": ["服务条款", "免责声明", "开源协议"],
      "en-US": ["terms of service", "disclaimer", "open source"],
      "ja-JP": ["利用規約", "免責事項", "オープンソース"],
    },
  ),
  breadcrumb_activity: definePage(
    "/breadcrumb-activity",
    { "zh-CN": "活动", "en-US": "Activity", "ja-JP": "アクティビティ" },
    {
      "zh-CN": "Moesekai 活动相关页面入口。",
      "en-US": "Moesekai activity-related page shortcuts.",
      "ja-JP": "Moesekai のイベント・アクティビティ関連ページへのショートカットです。",
    },
    {
      "zh-CN": ["活动入口", "活动工具"],
      "en-US": ["activity shortcuts", "activity tools"],
      "ja-JP": ["アクティビティ入口", "イベントツール"],
    },
  ),
  breadcrumb_community: definePage(
    "/breadcrumb-community",
    { "zh-CN": "社区", "en-US": "Community", "ja-JP": "コミュニティ" },
    {
      "zh-CN": "Moesekai 社区相关页面入口。",
      "en-US": "Moesekai community-related page shortcuts.",
      "ja-JP": "Moesekai のコミュニティ関連ページへのショートカットです。",
    },
    {
      "zh-CN": ["社区入口", "攻略"],
      "en-US": ["community shortcuts", "guides"],
      "ja-JP": ["コミュニティ入口", "ガイド"],
    },
  ),
  breadcrumb_database: definePage(
    "/breadcrumb-database",
    { "zh-CN": "数据库", "en-US": "Database", "ja-JP": "データベース" },
    {
      "zh-CN": "Moesekai 数据库页面入口。",
      "en-US": "Moesekai database page shortcuts.",
      "ja-JP": "Moesekai のデータベース関連ページへのショートカットです。",
    },
    {
      "zh-CN": ["数据库入口", "图鉴"],
      "en-US": ["database shortcuts", "encyclopedia"],
      "ja-JP": ["データベース入口", "図鑑"],
    },
  ),
  breadcrumb_personal: definePage(
    "/breadcrumb-personal",
    { "zh-CN": "个人", "en-US": "Personal", "ja-JP": "パーソナル" },
    {
      "zh-CN": "Moesekai 个人数据与账号相关页面入口。",
      "en-US": "Moesekai personal data and account page shortcuts.",
      "ja-JP": "Moesekai の個人データ・アカウント関連ページへのショートカットです。",
    },
    {
      "zh-CN": ["个人入口", "账号"],
      "en-US": ["personal shortcuts", "account"],
      "ja-JP": ["パーソナル入口", "アカウント"],
    },
  ),
  breadcrumb_story: definePage(
    "/breadcrumb-story",
    { "zh-CN": "剧情", "en-US": "Story", "ja-JP": "ストーリー" },
    {
      "zh-CN": "Moesekai 剧情相关页面入口。",
      "en-US": "Moesekai story-related page shortcuts.",
      "ja-JP": "Moesekai のストーリー関連ページへのショートカットです。",
    },
    {
      "zh-CN": ["剧情入口", "故事"],
      "en-US": ["story shortcuts", "stories"],
      "ja-JP": ["ストーリー入口", "物語"],
    },
  ),
  breadcrumb_games: definePage(
    "/breadcrumb-games",
    { "zh-CN": "游戏", "en-US": "Games", "ja-JP": "ゲーム" },
    {
      "zh-CN": "Moesekai 游戏与小游戏页面入口。",
      "en-US": "Moesekai games and mini-games page shortcuts.",
      "ja-JP": "Moesekai のゲーム・ミニゲーム関連ページへのショートカットです。",
    },
    {
      "zh-CN": ["游戏入口", "小游戏", "互动游戏"],
      "en-US": ["game shortcuts", "mini-games", "interactive games"],
      "ja-JP": ["ゲーム入口", "ミニゲーム", "ゲーム"],
    },
  ),
  breadcrumb_tools: definePage(
    "/breadcrumb-tools",
    { "zh-CN": "工具", "en-US": "Tools", "ja-JP": "ツール" },
    {
      "zh-CN": "Moesekai 实用工具页面入口。",
      "en-US": "Moesekai utility tool page shortcuts.",
      "ja-JP": "Moesekai の便利ツール関連ページへのショートカットです。",
    },
    {
      "zh-CN": ["工具入口", "实用工具"],
      "en-US": ["tool shortcuts", "utilities"],
      "ja-JP": ["ツール入口", "便利ツール"],
    },
  ),
  asset_viewer: definePage(
    "/asset-viewer",
    { "zh-CN": "资产浏览器", "en-US": "Asset Browser", "ja-JP": "アセットブラウザ" },
    {
      "zh-CN": "浏览 Project SEKAI 各区服的静态资源目录，支持查找、预览图片及音频等文件。",
      "en-US": "Browse Project Sekai static asset directories across regions, search, and preview image/audio files.",
      "ja-JP": "Project SEKAI 各サーバーの静的アセットディレクトリを閲覧し、ファイルの検索やプレビューができます。",
    },
    {
      "zh-CN": ["资产浏览器", "静态资源", "资源下载", "音源预览"],
      "en-US": ["asset browser", "static assets", "asset explorer", "download"],
      "ja-JP": ["アセットブラウザ", "アセット", "ファイルプレビュー", "ダウンロード"],
    },
  ),
  asset_versions: definePage(
    "/asset-versions",
    { "zh-CN": "版本更新记录", "en-US": "Asset Version Changelog", "ja-JP": "バージョン更新履歴" },
    {
      "zh-CN": "查看 Project SEKAI 各区服资源版本更新历史，浏览每个版本新增与更新的文件明细并预览变更资源。",
      "en-US": "Track Project Sekai asset version history across regions and inspect the added/updated file diff of each update.",
      "ja-JP": "Project SEKAI 各サーバーのアセットバージョン履歴を追跡し、各更新の追加・更新ファイル差分を確認できます。",
    },
    {
      "zh-CN": ["版本更新记录", "资源版本", "更新日志", "版本diff"],
      "en-US": ["asset changelog", "asset versions", "update history", "version diff"],
      "ja-JP": ["バージョン履歴", "アセット更新", "更新履歴", "差分"],
    },
  ),
  blank: definePage(
    "/blank",
    { "zh-CN": "空白素材页", "en-US": "Blank Asset Page", "ja-JP": "空白アセットページ" },
    {
      "zh-CN": "Moesekai 空白素材展示页。",
      "en-US": "A blank Moesekai asset display page.",
      "ja-JP": "Moesekai の空白アセット表示ページです。",
    },
    {
      "zh-CN": ["空白页", "素材页"],
      "en-US": ["blank page", "asset page"],
      "ja-JP": ["空白ページ", "アセットページ"],
    },
  ),
  guides_detail: definePage(
    "/guides",
    { "zh-CN": "攻略详情", "en-US": "Guide Details", "ja-JP": "ガイド詳細" },
    {
      "zh-CN": "阅读 PROJECT SEKAI 社区攻略详情。",
      "en-US": "Read detailed PROJECT SEKAI community guide content.",
      "ja-JP": "PROJECT SEKAI コミュニティガイドの詳細を閲覧できます。",
    },
    {
      "zh-CN": ["攻略详情", "社区攻略"],
      "en-US": ["guide details", "community guides"],
      "ja-JP": ["ガイド詳細", "コミュニティガイド"],
    },
  ),
  oauth2_connect: definePage(
    "/oauth2/connect",
    { "zh-CN": "OAuth2 绑定", "en-US": "OAuth2 Connect", "ja-JP": "OAuth2連携" },
    {
      "zh-CN": "通过 OAuth2 将 Haruki 账号与 Moesekai 绑定。",
      "en-US": "Connect a Haruki account to Moesekai through OAuth2.",
      "ja-JP": "OAuth2 を通じて Haruki アカウントを Moesekai に連携します。",
    },
    {
      "zh-CN": ["OAuth2绑定", "账号绑定"],
      "en-US": ["OAuth2 connect", "account binding"],
      "ja-JP": ["OAuth2連携", "アカウント連携"],
    },
  ),
  oauth2_callback: definePage(
    "/oauth2/callback/code",
    { "zh-CN": "OAuth2 回调", "en-US": "OAuth2 Callback", "ja-JP": "OAuth2コールバック" },
    {
      "zh-CN": "处理 Moesekai OAuth2 授权回调。",
      "en-US": "Handle the Moesekai OAuth2 authorization callback.",
      "ja-JP": "Moesekai OAuth2 認可コールバックを処理します。",
    },
    {
      "zh-CN": ["OAuth2回调", "授权回调"],
      "en-US": ["OAuth2 callback", "authorization callback"],
      "ja-JP": ["OAuth2コールバック", "認可コールバック"],
    },
  ),
  story_area_category: definePage(
    "/story/area",
    { "zh-CN": "区域对话", "en-US": "Area Conversations", "ja-JP": "エリア会話" },
    {
      "zh-CN": "浏览指定分类下的 Project SEKAI 区域对话。",
      "en-US": "Browse Project Sekai area conversations in a selected category.",
      "ja-JP": "選択したカテゴリの Project SEKAI エリア会話を閲覧できます。",
    },
    {
      "zh-CN": ["区域对话", "Area Talk"],
      "en-US": ["area conversations", "Area Talk"],
      "ja-JP": ["エリア会話", "Area Talk"],
    },
  ),
  story_area_reader: definePage(
    "/story/area",
    { "zh-CN": "区域对话阅读", "en-US": "Area Conversation Reader", "ja-JP": "エリア会話リーダー" },
    {
      "zh-CN": "阅读 Project SEKAI 区域对话内容。",
      "en-US": "Read Project Sekai area conversation content.",
      "ja-JP": "Project SEKAI のエリア会話本文を閲覧できます。",
    },
    {
      "zh-CN": ["区域对话阅读", "Area Talk"],
      "en-US": ["area conversation reader", "Area Talk"],
      "ja-JP": ["エリア会話リーダー", "Area Talk"],
    },
  ),
  story_card_reader: definePage(
    "/story/card",
    { "zh-CN": "卡牌剧情阅读", "en-US": "Card Story Reader", "ja-JP": "カードストーリーリーダー" },
    {
      "zh-CN": "阅读 Project SEKAI 卡牌剧情内容。",
      "en-US": "Read Project Sekai card story content.",
      "ja-JP": "Project SEKAI のカードストーリー本文を閲覧できます。",
    },
    {
      "zh-CN": ["卡牌剧情阅读", "Card Story"],
      "en-US": ["card story reader", "Card Story"],
      "ja-JP": ["カードストーリーリーダー", "カードストーリー"],
    },
  ),
  story_event_group: definePage(
    "/story/event",
    { "zh-CN": "活动剧情", "en-US": "Event Story", "ja-JP": "イベントストーリー" },
    {
      "zh-CN": "浏览指定 Project SEKAI 活动的剧情章节。",
      "en-US": "Browse story episodes for a selected Project Sekai event.",
      "ja-JP": "選択した Project SEKAI イベントのストーリーエピソードを閲覧できます。",
    },
    {
      "zh-CN": ["活动剧情", "剧情章节"],
      "en-US": ["event story", "story episodes"],
      "ja-JP": ["イベントストーリー", "ストーリーエピソード"],
    },
  ),
  story_event_reader: definePage(
    "/story/event",
    { "zh-CN": "活动剧情阅读", "en-US": "Event Story Reader", "ja-JP": "イベントストーリーリーダー" },
    {
      "zh-CN": "阅读 Project SEKAI 活动剧情内容。",
      "en-US": "Read Project Sekai event story content.",
      "ja-JP": "Project SEKAI のイベントストーリー本文を閲覧できます。",
    },
    {
      "zh-CN": ["活动剧情阅读", "Event Story"],
      "en-US": ["event story reader", "Event Story"],
      "ja-JP": ["イベントストーリーリーダー", "イベントストーリー"],
    },
  ),
  story_self_reader: definePage(
    "/story/self",
    { "zh-CN": "角色介绍阅读", "en-US": "Character Introduction Reader", "ja-JP": "自己紹介リーダー" },
    {
      "zh-CN": "阅读 Project SEKAI 角色自我介绍内容。",
      "en-US": "Read Project Sekai character introduction content.",
      "ja-JP": "Project SEKAI のキャラクター自己紹介本文を閲覧できます。",
    },
    {
      "zh-CN": ["角色介绍阅读", "自我介绍"],
      "en-US": ["character introduction reader", "self introduction"],
      "ja-JP": ["自己紹介リーダー", "キャラクター紹介"],
    },
  ),
  story_special_reader: definePage(
    "/story/special",
    { "zh-CN": "特殊剧情阅读", "en-US": "Special Story Reader", "ja-JP": "スペシャルストーリーリーダー" },
    {
      "zh-CN": "阅读 Project SEKAI 特殊剧情内容。",
      "en-US": "Read Project Sekai special story content.",
      "ja-JP": "Project SEKAI のスペシャルストーリー本文を閲覧できます。",
    },
    {
      "zh-CN": ["特殊剧情阅读", "Special Story"],
      "en-US": ["special story reader", "Special Story"],
      "ja-JP": ["スペシャルストーリーリーダー", "スペシャルストーリー"],
    },
  ),
  story_unit_group: definePage(
    "/story/unit",
    { "zh-CN": "主线剧情", "en-US": "Main Story", "ja-JP": "メインストーリー" },
    {
      "zh-CN": "浏览指定组合的 Project SEKAI 主线剧情章节。",
      "en-US": "Browse Project Sekai main story episodes for a selected unit.",
      "ja-JP": "選択したユニットの Project SEKAI メインストーリーエピソードを閲覧できます。",
    },
    {
      "zh-CN": ["主线剧情", "组合剧情"],
      "en-US": ["main story", "unit stories"],
      "ja-JP": ["メインストーリー", "ユニットストーリー"],
    },
  ),
  story_unit_reader: definePage(
    "/story/unit",
    { "zh-CN": "主线剧情阅读", "en-US": "Main Story Reader", "ja-JP": "メインストーリーリーダー" },
    {
      "zh-CN": "阅读 Project SEKAI 主线剧情内容。",
      "en-US": "Read Project Sekai main story content.",
      "ja-JP": "Project SEKAI のメインストーリー本文を閲覧できます。",
    },
    {
      "zh-CN": ["主线剧情阅读", "Main Story"],
      "en-US": ["main story reader", "Main Story"],
      "ja-JP": ["メインストーリーリーダー", "メインストーリー"],
    },
  ),
} as const;

export function getRootKeywords(locale: UiLocale = DEFAULT_UI_LOCALE): string[] {
  return [...SEO_LOCALE_CONFIG[locale].root.keywords];
}

export function getPageKeywords(pageName: string, locale: UiLocale = DEFAULT_UI_LOCALE): string[] {
  const page = SEO_PAGE_METADATA[pageName as SeoPageKey];
  if (!page) return getRootKeywords(locale).slice(0, 10);
  if (locale === "zh-TW") {
    const localized = ZH_TW_SEO_PAGE_METADATA[pageName as keyof typeof ZH_TW_SEO_PAGE_METADATA];
    if (localized) {
      return [...new Set([...localized.keywords, ...COMMON_BRAND_KEYWORDS[locale]])];
    }
  }
  return [...localizedKeywordsValue(page.keywords, locale)];
}

export function getPageSeo(pageKey: SeoPageKey, locale: UiLocale = DEFAULT_UI_LOCALE) {
  const page = SEO_PAGE_METADATA[pageKey];
  const zhTWPage = locale === "zh-TW" ? ZH_TW_SEO_PAGE_METADATA[pageKey as keyof typeof ZH_TW_SEO_PAGE_METADATA] : undefined;
  return {
    path: page.path,
    title: zhTWPage?.title ?? localizedText(page.title, locale),
    description: `${zhTWPage?.description ?? localizedText(page.description, locale)}${getSeoLocaleConfig(locale).suffix}`,
    keywords: getPageKeywords(pageKey, locale),
  };
}

export function getRootSeo(locale: UiLocale = DEFAULT_UI_LOCALE) {
  const config = getSeoLocaleConfig(locale);
  return {
    title: config.root.title,
    description: config.root.description,
    keywords: getRootKeywords(locale),
  };
}

// Compatibility exports for older route metadata. Prefer localized helpers above.
export const SEO_SUFFIX = SEO_LOCALE_CONFIG[DEFAULT_UI_LOCALE].suffix;
export const DETAIL_SEO_SUFFIX = SEO_LOCALE_CONFIG[DEFAULT_UI_LOCALE].detailSuffix;

// ==================== Dynamic Page Metadata Templates ====================

export const DYNAMIC_SEO_TEMPLATES = {
  guide: {
    title: {
      "zh-CN": "{title}",
      "en-US": "{title}",
      "ja-JP": "{title}",
    },
    description: {
      "zh-CN": "阅读 PROJECT SEKAI 社区攻略「{title}」，分类：{category}，标签：{tags}",
      "en-US": "Read the PROJECT SEKAI community guide \"{title}\". Category: {category}. Tags: {tags}",
      "ja-JP": "PROJECT SEKAI コミュニティガイド「{title}」を閲覧できます。カテゴリ：{category}。タグ：{tags}",
    },
    fallbackTitle: {
      "zh-CN": "攻略详情",
      "en-US": "Guide Details",
      "ja-JP": "ガイド詳細",
    },
    fallbackDescription: {
      "zh-CN": "阅读 PROJECT SEKAI 社区攻略详情",
      "en-US": "Read detailed PROJECT SEKAI community guide content",
      "ja-JP": "PROJECT SEKAI コミュニティガイドの詳細を閲覧できます",
    },
  },
  storyAreaCategory: {
    title: {
      "zh-CN": "{category} - 区域对话",
      "en-US": "{category} - Area Conversations",
      "ja-JP": "{category} - エリア会話",
    },
    description: {
      "zh-CN": "浏览 Project SEKAI 区域对话分类「{category}」，按场景查看收录的 {count} 段角色对话与剧情内容。",
      "en-US": "Browse {count} Project SEKAI area conversations in the \"{category}\" category, organized by scene for reading.",
      "ja-JP": "Project SEKAI のエリア会話カテゴリ「{category}」に収録された {count} 件のキャラクター会話をシーン別に閲覧できます。",
      "ko-KR": "Project SEKAI 에어리어 대화 ‘{category}’에 수록된 {count}개의 캐릭터 대화를 장면별로 확인할 수 있습니다.",
    },
    fallbackTitle: {
      "zh-CN": "区域对话",
      "en-US": "Area Conversations",
      "ja-JP": "エリア会話",
    },
    fallbackDescription: {
      "zh-CN": "浏览 Project SEKAI 区域对话分类",
      "en-US": "Browse Project Sekai area conversation categories",
      "ja-JP": "Project SEKAI のエリア会話カテゴリを閲覧できます",
    },
  },
  storyAreaReader: {
    title: {
      "zh-CN": "{area} - 区域对话",
      "en-US": "{area} - Area Conversation",
      "ja-JP": "{area} - エリア会話",
    },
    description: {
      "zh-CN": "阅读 Project SEKAI 区域「{area}」的角色对话与完整场景文本；场景 ID：{scenarioId}。",
      "en-US": "Read the character dialogue and complete scene text for the Project SEKAI area conversation \"{area}\". Scenario ID: {scenarioId}.",
      "ja-JP": "Project SEKAI のエリア会話「{area}」について、キャラクター会話とシーン本文を閲覧できます。シナリオID：{scenarioId}。",
      "ko-KR": "Project SEKAI 에어리어 대화 ‘{area}’의 캐릭터 대사와 전체 장면 텍스트를 확인할 수 있습니다. 시나리오 ID: {scenarioId}.",
    },
    fallbackTitle: {
      "zh-CN": "区域对话阅读",
      "en-US": "Area Conversation Reader",
      "ja-JP": "エリア会話リーダー",
    },
    fallbackDescription: {
      "zh-CN": "阅读 Project SEKAI 区域对话内容",
      "en-US": "Read Project Sekai area conversation content",
      "ja-JP": "Project SEKAI のエリア会話本文を閲覧できます",
    },
  },
  storyCardReader: {
    title: {
      "zh-CN": "{card} - 卡牌剧情",
      "en-US": "{card} - Card Story",
      "ja-JP": "{card} - カードストーリー",
    },
    description: {
      "zh-CN": "阅读 Project SEKAI 卡牌「{card}」的前篇与后篇剧情，查看角色对话和完整故事文本。",
      "en-US": "Read both side-story parts for the Project SEKAI card \"{card}\", including character dialogue and complete story text.",
      "ja-JP": "Project SEKAI カード「{card}」の前編・後編ストーリーとキャラクター会話の本文を閲覧できます。",
      "ko-KR": "Project SEKAI 카드 ‘{card}’의 전편과 후편 사이드 스토리, 캐릭터 대화와 전체 본문을 확인할 수 있습니다.",
    },
    fallbackTitle: {
      "zh-CN": "卡牌剧情阅读",
      "en-US": "Card Story Reader",
      "ja-JP": "カードストーリーリーダー",
    },
    fallbackDescription: {
      "zh-CN": "阅读 Project SEKAI 卡牌剧情内容",
      "en-US": "Read Project Sekai card story content",
      "ja-JP": "Project SEKAI のカードストーリー本文を閲覧できます",
    },
  },
  storyEventGroup: {
    title: {
      "zh-CN": "{event} - 活动剧情",
      "en-US": "{event} - Event Story",
      "ja-JP": "{event} - イベントストーリー",
    },
    description: {
      "zh-CN": "浏览 Project SEKAI 活动「{event}」收录的 {count} 个剧情章节，按话数阅读活动故事。",
      "en-US": "Browse all {count} story episodes from the Project SEKAI event \"{event}\", organized in episode order for reading.",
      "ja-JP": "Project SEKAI イベント「{event}」に収録された全 {count} 話のストーリーをエピソード順に閲覧できます。",
      "ko-KR": "Project SEKAI 이벤트 ‘{event}’에 수록된 총 {count}화의 스토리를 에피소드 순서대로 확인할 수 있습니다.",
    },
    fallbackTitle: {
      "zh-CN": "活动剧情",
      "en-US": "Event Story",
      "ja-JP": "イベントストーリー",
    },
    fallbackDescription: {
      "zh-CN": "浏览指定 Project SEKAI 活动的剧情章节",
      "en-US": "Browse story episodes for a selected Project Sekai event",
      "ja-JP": "選択した Project SEKAI イベントのストーリーエピソードを閲覧できます",
    },
  },
  storyEventReader: {
    title: {
      "zh-CN": "{episode} - {event}",
      "en-US": "{episode} - {event}",
      "ja-JP": "{episode} - {event}",
    },
    description: {
      "zh-CN": "阅读 Project SEKAI 活动「{event}」第 {episodeNo} 话「{episode}」的角色对话与完整剧情文本。",
      "en-US": "Read episode {episodeNo}, \"{episode}\", from the Project SEKAI event story \"{event}\", with character dialogue and complete scene text.",
      "ja-JP": "Project SEKAI イベント「{event}」第 {episodeNo} 話「{episode}」のキャラクター会話とストーリー本文を閲覧できます。",
      "ko-KR": "Project SEKAI 이벤트 ‘{event}’ 제 {episodeNo}화 ‘{episode}’의 캐릭터 대화와 전체 스토리 본문을 확인할 수 있습니다.",
    },
    fallbackTitle: {
      "zh-CN": "活动剧情阅读",
      "en-US": "Event Story Reader",
      "ja-JP": "イベントストーリーリーダー",
    },
    fallbackDescription: {
      "zh-CN": "阅读 Project SEKAI 活动剧情内容",
      "en-US": "Read Project Sekai event story content",
      "ja-JP": "Project SEKAI のイベントストーリー本文を閲覧できます",
    },
  },
  storySelfReader: {
    title: {
      "zh-CN": "{character} - 角色介绍",
      "en-US": "{character} - Character Introduction",
      "ja-JP": "{character} - 自己紹介",
    },
    description: {
      "zh-CN": "阅读 Project SEKAI 角色「{character}」的自我介绍、语音剧情与完整角色对话文本。",
      "en-US": "Read the Project SEKAI character introduction and voiced story for \"{character}\", including the complete dialogue text.",
      "ja-JP": "Project SEKAI キャラクター「{character}」の自己紹介、ボイス付きストーリー、会話本文を閲覧できます。",
      "ko-KR": "Project SEKAI 캐릭터 ‘{character}’의 자기소개, 음성 스토리와 전체 대화 내용을 확인할 수 있습니다.",
    },
    fallbackTitle: {
      "zh-CN": "角色介绍阅读",
      "en-US": "Character Introduction Reader",
      "ja-JP": "自己紹介リーダー",
    },
    fallbackDescription: {
      "zh-CN": "阅读 Project SEKAI 角色自我介绍内容",
      "en-US": "Read Project Sekai character introduction content",
      "ja-JP": "Project SEKAI のキャラクター自己紹介本文を閲覧できます",
    },
  },
  storySpecialReader: {
    title: {
      "zh-CN": "{title} - 特殊剧情",
      "en-US": "{title} - Special Story",
      "ja-JP": "{title} - スペシャルストーリー",
    },
    description: {
      "zh-CN": "阅读 Project SEKAI 特殊剧情「{title}」收录的全部 {count} 个章节与角色对话文本。",
      "en-US": "Read all {count} episodes and character dialogue from the Project SEKAI special story \"{title}\".",
      "ja-JP": "Project SEKAI スペシャルストーリー「{title}」に収録された全 {count} 話とキャラクター会話を閲覧できます。",
      "ko-KR": "Project SEKAI 스페셜 스토리 ‘{title}’에 수록된 총 {count}화와 캐릭터 대화를 확인할 수 있습니다.",
    },
    fallbackTitle: {
      "zh-CN": "特殊剧情阅读",
      "en-US": "Special Story Reader",
      "ja-JP": "スペシャルストーリーリーダー",
    },
    fallbackDescription: {
      "zh-CN": "阅读 Project SEKAI 特殊剧情内容",
      "en-US": "Read Project Sekai special story content",
      "ja-JP": "Project SEKAI のスペシャルストーリー本文を閲覧できます",
    },
  },
  storyUnitGroup: {
    title: {
      "zh-CN": "{unit} - 主线剧情",
      "en-US": "{unit} - Main Story",
      "ja-JP": "{unit} - メインストーリー",
    },
    description: {
      "zh-CN": "浏览 Project SEKAI 组合「{unit}」收录的 {count} 个主线剧情章节，按顺序阅读组合故事。",
      "en-US": "Browse all {count} main story episodes for the Project SEKAI unit \"{unit}\", organized in story order for reading.",
      "ja-JP": "Project SEKAI ユニット「{unit}」に収録されたメインストーリー全 {count} 話を順番に閲覧できます。",
      "ko-KR": "Project SEKAI 유닛 ‘{unit}’의 메인 스토리 총 {count}화를 이야기 순서대로 확인할 수 있습니다.",
    },
    fallbackTitle: {
      "zh-CN": "主线剧情",
      "en-US": "Main Story",
      "ja-JP": "メインストーリー",
    },
    fallbackDescription: {
      "zh-CN": "浏览指定组合的 Project SEKAI 主线剧情章节",
      "en-US": "Browse Project Sekai main story episodes for a selected unit",
      "ja-JP": "選択したユニットの Project SEKAI メインストーリーエピソードを閲覧できます",
    },
  },
  storyUnitReader: {
    title: {
      "zh-CN": "{episode} - {unit}",
      "en-US": "{episode} - {unit}",
      "ja-JP": "{episode} - {unit}",
    },
    description: {
      "zh-CN": "阅读 Project SEKAI 组合「{unit}」主线剧情「{episode}」的角色对话与完整章节文本。",
      "en-US": "Read the Project SEKAI main story episode \"{episode}\" for \"{unit}\", including character dialogue and complete chapter text.",
      "ja-JP": "Project SEKAI ユニット「{unit}」のメインストーリー「{episode}」について、キャラクター会話と章本文を閲覧できます。",
      "ko-KR": "Project SEKAI 유닛 ‘{unit}’의 메인 스토리 ‘{episode}’에서 캐릭터 대화와 전체 챕터 내용을 확인할 수 있습니다.",
    },
    fallbackTitle: {
      "zh-CN": "主线剧情阅读",
      "en-US": "Main Story Reader",
      "ja-JP": "メインストーリーリーダー",
    },
    fallbackDescription: {
      "zh-CN": "阅读 Project SEKAI 主线剧情内容",
      "en-US": "Read Project Sekai main story content",
      "ja-JP": "Project SEKAI のメインストーリー本文を閲覧できます",
    },
  },
} as const;

function dynamicText(kind: DynamicSeoKind, field: keyof typeof DYNAMIC_SEO_TEMPLATES[DynamicSeoKind], locale: UiLocale): string {
  if (locale === "zh-TW") {
    return ZH_TW_DYNAMIC_SEO_TEMPLATES[kind][field];
  }
  return localizedText(DYNAMIC_SEO_TEMPLATES[kind][field], locale);
}

export function formatDynamicSeoTitle(
  kind: DynamicSeoKind,
  values: MessageInterpolationValues,
  locale: UiLocale = DEFAULT_UI_LOCALE,
): string {
  return interpolateMessage(dynamicText(kind, "title", locale), values);
}

export function formatDynamicSeoDescription(
  kind: DynamicSeoKind,
  values: MessageInterpolationValues,
  locale: UiLocale = DEFAULT_UI_LOCALE,
): string {
  return `${interpolateMessage(dynamicText(kind, "description", locale), values)}${getSeoLocaleConfig(locale).detailSuffix}`;
}

export function getDynamicFallbackTitle(kind: DynamicSeoKind, locale: UiLocale = DEFAULT_UI_LOCALE): string {
  return dynamicText(kind, "fallbackTitle", locale);
}

export function getDynamicFallbackDescription(kind: DynamicSeoKind, locale: UiLocale = DEFAULT_UI_LOCALE): string {
  return `${dynamicText(kind, "fallbackDescription", locale)}${getSeoLocaleConfig(locale).detailSuffix}`;
}

// ==================== Detail Metadata Templates ====================

export const DETAIL_FALLBACK_TITLES = {
  card: { "zh-CN": "卡牌详情", "en-US": "Card Details", "ja-JP": "カード詳細" },
  character: { "zh-CN": "角色详情", "en-US": "Character Details", "ja-JP": "キャラクター詳細" },
  costume: { "zh-CN": "服装详情", "en-US": "Costume Details", "ja-JP": "衣装詳細" },
  event: { "zh-CN": "活动详情", "en-US": "Event Details", "ja-JP": "イベント詳細" },
  exchange: { "zh-CN": "兑换条目详情", "en-US": "Exchange Entry Details", "ja-JP": "交換アイテム詳細" },
  gacha: { "zh-CN": "扭蛋详情", "en-US": "Gacha Details", "ja-JP": "ガチャ詳細" },
  live: { "zh-CN": "虚拟 Live 详情", "en-US": "Virtual Live Details", "ja-JP": "バーチャルライブ詳細" },
  manga: { "zh-CN": "漫画详情", "en-US": "Comic Details", "ja-JP": "コミック詳細" },
  music: { "zh-CN": "歌曲详情", "en-US": "Music Details", "ja-JP": "楽曲詳細" },
  lyrics: { "zh-CN": "歌词详情", "en-US": "Lyrics Details", "ja-JP": "歌詞詳細" },
  mysekai: { "zh-CN": "家具详情", "en-US": "Furniture Details", "ja-JP": "家具詳細" },
} as const satisfies Record<string, LocalizedText>;

export const DETAIL_FALLBACK_DESCRIPTIONS = {
  card: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）卡牌详情、角色、稀有度与图片资源",
    "en-US": "View Project Sekai (PJSK) card details, character, rarity, and card artwork",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）のカード詳細、キャラクター、レアリティ、画像を確認できます",
  },
  character: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）角色资料、组合、生日与相关内容",
    "en-US": "View Project Sekai (PJSK) character profiles, units, birthdays, and related content",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）のキャラクター情報、ユニット、誕生日、関連コンテンツを確認できます",
  },
  costume: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）服装详情、适用角色与获取信息",
    "en-US": "View Project SEKAI (PJSK) costume details, supported characters, and acquisition info",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）の衣装詳細、対応キャラクター、入手情報を確認できます",
  },
  event: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）活动详情、时间、奖励与相关数据",
    "en-US": "View Project Sekai (PJSK) event details, schedules, rewards, and related data",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）のイベント詳細、開催期間、報酬、関連データを確認できます",
  },
  exchange: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）兑换条目详情、奖励、消耗与开放时间",
    "en-US": "View Project Sekai (PJSK) exchange entry details, rewards, costs, and availability",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）の交換アイテム詳細、報酬、必要素材、開催期間を確認できます",
  },
  gacha: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）扭蛋详情、卡池时间、PU 卡牌与概率信息",
    "en-US": "View Project SEKAI (PJSK) gacha details, banner schedule, pickup cards, and rates",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）のガチャ詳細、開催期間、ピックアップカード、提供割合を確認できます",
  },
  live: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）虚拟 Live 详情、时间与奖励信息",
    "en-US": "View Project Sekai (PJSK) virtual live details, schedules, and rewards",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）のバーチャルライブ詳細、開催時間、報酬を確認できます",
  },
  manga: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）官方四格漫画章节详情",
    "en-US": "View Project Sekai (PJSK) official four-panel comic episode details",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）公式4コマのエピソード詳細を確認できます",
  },
  music: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）歌曲详情、谱面、作词作曲与封面资源",
    "en-US": "View Project Sekai (PJSK) song details, charts, credits, and jacket artwork",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）の楽曲詳細、譜面、クレジット、ジャケット画像を確認できます",
  },
  lyrics: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）歌曲歌词、日文原文与已发布翻译",
    "en-US": "View Project Sekai (PJSK) song lyrics, Japanese source text, and published translations",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）の楽曲歌詞、日本語原文、公開済み翻訳を確認できます",
  },
  mysekai: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）MySekai 家具详情、素材与风味文本",
    "en-US": "View Project SEKAI (PJSK) MySEKAI furniture details, materials, and flavor text",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）MySekai の家具詳細、素材、フレーバーテキストを確認できます",
  },
} as const satisfies Record<DetailFallbackKind, LocalizedText>;

export const DETAIL_SEO_TEMPLATES = {
  card: {
    "zh-CN": "查看 {character} 的 Project SEKAI（世界计划 / PJSK）卡牌「{prefix}」，包含卡牌稀有度、属性、技能、数值与高清卡面资源。",
    "en-US": "Explore the Project SEKAI (PJSK) card \"{prefix}\" featuring {character}, including rarity, attribute, skill, stats, and card artwork.",
    "ja-JP": "{character}の プロセカ（Project SEKAI / PJSK）カード「{prefix}」について、レアリティ、属性、スキル、ステータス、カード画像を確認できます。",
    "ko-KR": "{character}의 프로젝트 세카이(프로세카 / PJSK) 카드 ‘{prefix}’에 대한 희귀도, 속성, 스킬, 능력치와 카드 이미지를 확인할 수 있습니다.",
  },
  character: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）角色「{name}」的个人资料、所属组合、相关卡牌、剧情与游戏数据。",
    "en-US": "View the Project SEKAI (PJSK) character profile for \"{name}\", including their unit, cards, stories, and related game data.",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）キャラクター「{name}」のプロフィール、所属ユニット、カード、ストーリー、関連ゲームデータを確認できます。",
    "ko-KR": "프로젝트 세카이(프로세카 / PJSK) 캐릭터 ‘{name}’의 프로필, 소속 유닛, 카드, 스토리와 관련 게임 데이터를 확인할 수 있습니다.",
  },
  costume: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）服装「{name}」的外观、适用角色、配色与获取相关信息。",
    "en-US": "View the Project SEKAI (PJSK) costume \"{name}\", including its appearance, supported characters, color variants, and acquisition details.",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）衣装「{name}」の外観、着用キャラクター、カラーバリエーション、入手情報を確認できます。",
    "ko-KR": "프로젝트 세카이(프로세카 / PJSK) 의상 ‘{name}’의 외형, 착용 캐릭터, 색상 변형과 획득 정보를 확인할 수 있습니다.",
  },
  event: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）活动「{name}」的举办时间、活动类型、奖励、加成角色与相关剧情数据。",
    "en-US": "View the Project SEKAI (PJSK) event \"{name}\", including its schedule, event type, rewards, bonus characters, and related story data.",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）イベント「{name}」の開催期間、形式、報酬、ボーナスキャラクター、関連ストーリーを確認できます。",
    "ko-KR": "프로젝트 세카이(프로세카 / PJSK) 이벤트 ‘{name}’의 개최 기간, 이벤트 형식, 보상, 보너스 캐릭터와 관련 스토리를 확인할 수 있습니다.",
  },
  exchange: {
    "zh-CN": "Project SEKAI（世界计划 / PJSK）兑换条目：{name}{shopSuffix}",
    "en-US": "Project SEKAI (PJSK) exchange entry: {name}{shopSuffix}",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）交換アイテム：{name}{shopSuffix}",
  },
  exchangeFallback: {
    "zh-CN": "Project SEKAI（世界计划 / PJSK）兑换条目详情",
    "en-US": "Project SEKAI (PJSK) exchange entry details",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）交換アイテム詳細",
  },
  gacha: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）扭蛋「{name}」的开放时间、招募类型、卡池内容、Pickup 卡牌与提供概率。",
    "en-US": "View the Project SEKAI (PJSK) gacha \"{name}\", including its availability, banner type, card pool, pickup cards, and rates.",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）ガチャ「{name}」の開催期間、ガチャ種別、収録カード、ピックアップ、提供割合を確認できます。",
    "ko-KR": "프로젝트 세카이(프로세카 / PJSK) 뽑기 ‘{name}’의 개최 기간, 유형, 카드 목록, 픽업 카드와 제공 확률을 확인할 수 있습니다.",
  },
  live: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）虚拟 Live「{name}」的演出时间、出演角色、曲目与参与奖励。",
    "en-US": "View the Project SEKAI (PJSK) virtual live \"{name}\", including its schedule, performers, setlist, and participation rewards.",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）バーチャルライブ「{name}」の開催時間、出演者、セットリスト、参加報酬を確認できます。",
    "ko-KR": "프로젝트 세카이(프로세카 / PJSK) 버추얼 라이브 ‘{name}’의 개최 시간, 출연 캐릭터, 세트리스트와 참가 보상을 확인할 수 있습니다.",
  },
  manga: {
    "zh-CN": "阅读 Project SEKAI（世界计划 / PJSK）官方四格漫画「{title}」，查看本话标题与完整漫画图片。",
    "en-US": "Read the Project SEKAI (PJSK) official four-panel comic \"{title}\" and view the complete comic image for this episode.",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）公式4コマ「{title}」のエピソード情報と漫画画像を閲覧できます。",
    "ko-KR": "프로젝트 세카이(프로세카 / PJSK) 공식 4컷 만화 ‘{title}’의 에피소드 정보와 전체 만화 이미지를 확인할 수 있습니다.",
  },
  music: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）歌曲「{title}」的难度与谱面数据、演唱版本和封面；作词：{lyricist}，作曲：{composer}。",
    "en-US": "View charts, difficulty data, vocal versions, and jacket artwork for the Project SEKAI (PJSK) song \"{title}\". Lyrics: {lyricist}; music: {composer}.",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）楽曲「{title}」の難易度・譜面データ、歌唱バージョン、ジャケットを確認できます。作詞：{lyricist}、作曲：{composer}。",
    "ko-KR": "프로젝트 세카이(프로세카 / PJSK) 수록곡 ‘{title}’의 난이도와 채보 데이터, 보컬 버전, 재킷 이미지를 확인할 수 있습니다. 작사: {lyricist}, 작곡: {composer}.",
  },
  lyrics: {
    "zh-CN": "阅读 Project SEKAI（世界计划 / PJSK）歌曲「{title}」的日文歌词，并对照已发布的简体中文与英文翻译。",
    "en-US": "Read the Japanese lyrics for the Project SEKAI (PJSK) song \"{title}\" alongside published Simplified Chinese and English translations.",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）楽曲「{title}」の日本語歌詞と、公開済みの簡体字中国語・英語翻訳を閲覧できます。",
    "ko-KR": "프로젝트 세카이(프로세카 / PJSK) 수록곡 ‘{title}’의 일본어 가사와 공개된 중국어 간체 및 영어 번역을 확인할 수 있습니다.",
  },
  mysekai: {
    "zh-CN": "查看 Project SEKAI（世界计划 / PJSK）MySekai 家具「{name}」的外观、制作素材与物品说明。{flavorSuffix}",
    "en-US": "View the appearance, crafting materials, and item description for the Project SEKAI (PJSK) MySEKAI furniture \"{name}\".{flavorSuffix}",
    "ja-JP": "プロセカ（Project SEKAI / PJSK）MySekai 家具「{name}」の外観、製作素材、アイテム説明を確認できます。{flavorSuffix}",
    "ko-KR": "프로젝트 세카이(프로세카 / PJSK) MySEKAI 가구 ‘{name}’의 외형, 제작 재료와 아이템 설명을 확인할 수 있습니다.{flavorSuffix}",
  },
} as const satisfies Record<string, LocalizedText>;

export function getDetailFallbackTitle(kind: DetailFallbackKind, locale: UiLocale = DEFAULT_UI_LOCALE): string {
  if (locale === "zh-TW") return ZH_TW_DETAIL_FALLBACK_TITLES[kind];
  return localizedText(DETAIL_FALLBACK_TITLES[kind], locale);
}

export function getDetailFallbackDescription(kind: DetailFallbackKind, locale: UiLocale = DEFAULT_UI_LOCALE): string {
  const description = locale === "zh-TW"
    ? ZH_TW_DETAIL_FALLBACK_DESCRIPTIONS[kind]
    : localizedText(DETAIL_FALLBACK_DESCRIPTIONS[kind], locale);
  return `${description}${getSeoLocaleConfig(locale).detailSuffix}`;
}

export function formatDetailSeoDescription(
  kind: DetailSeoKind,
  values: MessageInterpolationValues,
  locale: UiLocale = DEFAULT_UI_LOCALE,
): string {
  const template = locale === "zh-TW"
    ? ZH_TW_DETAIL_SEO_TEMPLATES[kind]
    : localizedText(DETAIL_SEO_TEMPLATES[kind], locale);
  return `${interpolateMessage(template, values)}${getSeoLocaleConfig(locale).detailSuffix}`;
}

export function formatExchangeShopSuffix(summaryName: string | undefined, locale: UiLocale = DEFAULT_UI_LOCALE): string {
  if (!summaryName) return "";
  if (locale === "zh-CN") return `，兑换所：${summaryName}`;
  if (locale === "zh-TW") return `，交換所：${summaryName}`;
  if (locale === "ja-JP") return `、交換所：${summaryName}`;
  return `, exchange shop: ${summaryName}`;
}

export function formatMysekaiFlavorSuffix(flavor: string | undefined, locale: UiLocale = DEFAULT_UI_LOCALE): string {
  if (!flavor) return "";
  const clipped = flavor.slice(0, 100);
  return locale === "zh-CN" || locale === "zh-TW" || locale === "ja-JP" ? ` — ${clipped}` : ` - ${clipped}`;
}

export function formatJpAdvancePrefix(locale: UiLocale = DEFAULT_UI_LOCALE): string {
  if (locale === "zh-CN" || locale === "zh-TW") return "[日服先行] ";
  if (locale === "en-US") return "[JP Advance] ";
  if (locale === "ko-KR") return "[일섭 선행] ";
  return "";
}

