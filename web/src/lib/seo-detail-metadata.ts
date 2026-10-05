import {
    getCardThumbnailUrl,
    getCharacterIconUrl,
    getEventBannerUrl,
    getGachaLogoUrl,
    getMusicJacketUrl,
    getMysekaiFixtureThumbnailUrl,
    getVirtualLiveBannerUrl,
} from "@/lib/assets";
import {
    getCardMeta,
    getCharacterMeta,
    getCostumeMeta,
    getEventMeta,
    getExchangeMeta,
    getFixtureMeta,
    getGachaMeta,
    getMangaMeta,
    getMusicMeta,
    getVirtualLiveMeta,
} from "@/lib/metadata";
import { createElement, Suspense, type ComponentType, type ReactNode } from "react";

import {
    defineSeoDetailPage,
    type CreateDynamicDetailMetadataOptions,
} from "@/lib/seo-metadata";
import { formatExchangeShopSuffix, formatJpAdvancePrefix, formatMysekaiFlavorSuffix } from "@/lib/seo-keywords";
import { getSeoAssetSource } from "@/lib/seo-metadata";
import { CHARACTER_NAMES } from "@/types/types";
import { LoadingIndicator } from "@/components/md3/Progress";

type DetailPreset<T> = Omit<CreateDynamicDetailMetadataOptions<T>, "params">;

type DetailPageRender<T = unknown> = (props: { params?: Promise<{ id: string }>; initialData?: T | null }) => ReactNode;

const DETAIL_LOADING_FALLBACK = createElement(
    "div",
    { className: "min-h-screen flex items-center justify-center" },
    createElement(LoadingIndicator),
);

function defineDetailPreset<T>(preset: DetailPreset<T>) {
    return preset;
}

function detailPageFactory<T>(preset: DetailPreset<T>) {
    return (render: DetailPageRender<T>) => defineSeoDetailPage({ ...preset, render });
}

interface DetailClientPageOptions {
    fallback?: ReactNode;
    wrap?: (children: ReactNode) => ReactNode;
}

function renderClientWithSuspense<T = unknown>(Client: ComponentType<{ initialData?: T | null; id?: number }>, options: DetailClientPageOptions = {}) {
    function DetailClientSuspensePage({ initialData, id }: { params?: Promise<{ id: string }>; initialData?: T | null; id?: number }) {
        const clientElement = createElement(Client, { initialData, id });
        const content = initialData
            ? clientElement
            : createElement(Suspense, { fallback: options.fallback ?? DETAIL_LOADING_FALLBACK }, clientElement);
        return options.wrap ? options.wrap(content) : content;
    }

    DetailClientSuspensePage.displayName = `SeoDetailClientPage(${Client.displayName || Client.name || "Client"})`;
    return DetailClientSuspensePage;
}

function detailClientPageFactory<T>(preset: DetailPreset<T>) {
    return (Client: ComponentType<{ initialData?: T | null; id?: number }>, options?: DetailClientPageOptions) => defineSeoDetailPage<T>({
        ...preset,
        render: renderClientWithSuspense<T>(Client, options),
    });
}

const cardDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getCardMeta>>>({
    kind: "card",
    routePrefix: "cards",
    getData: getCardMeta,
    structuredData: { parentPageKey: "cards", entity: { type: "CreativeWork" } },
    build: (card, { locale }) => {
        const characterName = CHARACTER_NAMES[card.characterId] || "";
        const tag = card.isJpFallback ? formatJpAdvancePrefix(locale) : "";
        const title = `${tag}${characterName} - ${card.prefix}`;

        return {
            title,
            descriptionKind: "card",
            descriptionValues: { prefix: card.prefix, character: characterName },
            images: [getCardThumbnailUrl(card.characterId, card.asset, false, getSeoAssetSource(locale))],
        };
    },
});

export const defineCardDetailPage = detailPageFactory(cardDetailPreset);
export const defineCardDetailClientPage = detailClientPageFactory(cardDetailPreset);

const characterDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getCharacterMeta>>>({
    kind: "character",
    routePrefix: "character",
    getData: getCharacterMeta,
    structuredData: { parentPageKey: "character" },
    build: (character, { numericId }) => ({
        title: character.name,
        descriptionKind: "character",
        descriptionValues: { name: character.name },
        images: [getCharacterIconUrl(numericId)],
        twitterCard: "summary",
    }),
});

export const defineCharacterDetailPage = detailPageFactory(characterDetailPreset);
export const defineCharacterDetailClientPage = detailClientPageFactory(characterDetailPreset);

const costumeDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getCostumeMeta>>>({
    kind: "costume",
    routePrefix: "costumes",
    getData: getCostumeMeta,
    structuredData: { parentPageKey: "costumes", entity: { type: "Thing" } },
    fallbackTwitterCard: "summary",
    build: (costume, { locale }) => {
        const tag = costume.isJpFallback ? formatJpAdvancePrefix(locale) : "";
        return {
            title: `${tag}${costume.name}`,
            descriptionKind: "costume",
            descriptionValues: { name: costume.name },
            twitterCard: "summary",
        };
    },
});

export const defineCostumeDetailPage = detailPageFactory(costumeDetailPreset);
export const defineCostumeDetailClientPage = detailClientPageFactory(costumeDetailPreset);

const eventDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getEventMeta>>>({
    kind: "event",
    routePrefix: "events",
    getData: getEventMeta,
    structuredData: {
        parentPageKey: "events",
        entity: {
            type: "Event",
            getStartDate: (event) => event.startAt,
            getEndDate: (event) => event.endAt,
        },
    },
    build: (event, { locale }) => {
        const tag = event.isJpFallback ? formatJpAdvancePrefix(locale) : "";
        return {
            title: `${tag}${event.name}`,
            descriptionKind: "event",
            descriptionValues: { name: event.name },
            images: [getEventBannerUrl(event.asset, getSeoAssetSource(locale))],
        };
    },
});

export const defineEventDetailPage = detailPageFactory(eventDetailPreset);
export const defineEventDetailClientPage = detailClientPageFactory(eventDetailPreset);

const exchangeDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getExchangeMeta>>>({
    kind: "exchange",
    routePrefix: "exchanges",
    getData: getExchangeMeta,
    structuredData: { parentPageKey: "exchanges" },
    fallbackTwitterCard: "summary",
    build: (exchange, { locale }) => ({
        title: exchange.summaryName && exchange.summaryName !== exchange.name
            ? `${exchange.name} - ${exchange.summaryName}`
            : exchange.name,
        descriptionKind: "exchange",
        descriptionValues: {
            name: exchange.name,
            shopSuffix: formatExchangeShopSuffix(exchange.summaryName, locale),
        },
        twitterCard: "summary",
        robots: {
            index: false,
            follow: true,
            googleBot: { index: false, follow: true },
        },
    }),
});

export const defineExchangeDetailPage = detailPageFactory(exchangeDetailPreset);
export const defineExchangeDetailClientPage = detailClientPageFactory(exchangeDetailPreset);

const gachaDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getGachaMeta>>>({
    kind: "gacha",
    routePrefix: "gacha",
    getData: getGachaMeta,
    structuredData: { parentPageKey: "gacha", entity: { type: "CreativeWork" } },
    build: (gacha, { locale }) => {
        const tag = gacha.isJpFallback ? formatJpAdvancePrefix(locale) : "";
        return {
            title: `${tag}${gacha.name}`,
            descriptionKind: "gacha",
            descriptionValues: { name: gacha.name },
            images: [getGachaLogoUrl(gacha.asset, getSeoAssetSource(locale))],
            twitterCard: "summary",
        };
    },
});

export const defineGachaDetailPage = detailPageFactory(gachaDetailPreset);
export const defineGachaDetailClientPage = detailClientPageFactory(gachaDetailPreset);

const liveDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getVirtualLiveMeta>>>({
    kind: "live",
    routePrefix: "live",
    getData: getVirtualLiveMeta,
    structuredData: {
        parentPageKey: "live",
        entity: {
            type: "Event",
            getStartDate: (live) => live.startAt,
            getEndDate: (live) => live.endAt,
        },
    },
    build: (live, { locale }) => {
        const tag = live.isJpFallback ? formatJpAdvancePrefix(locale) : "";
        return {
            title: `${tag}${live.name}`,
            descriptionKind: "live",
            descriptionValues: { name: live.name },
            images: [getVirtualLiveBannerUrl(live.asset, getSeoAssetSource(locale))],
        };
    },
});

export const defineLiveDetailPage = detailPageFactory(liveDetailPreset);
export const defineLiveDetailClientPage = detailClientPageFactory(liveDetailPreset);

const mangaDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getMangaMeta>>>({
    kind: "manga",
    routePrefix: "manga",
    getData: getMangaMeta,
    structuredData: { parentPageKey: "manga", entity: { type: "CreativeWork" } },
    build: (manga, { id }) => ({
        title: manga.title,
        descriptionKind: "manga",
        descriptionValues: { title: manga.title },
        images: [`https://moe.exmeaning.com/mangas/${id}.png`],
    }),
});

export const defineMangaDetailPage = detailPageFactory(mangaDetailPreset);
export const defineMangaDetailClientPage = detailClientPageFactory(mangaDetailPreset);

const musicDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getMusicMeta>>>({
    kind: "music",
    routePrefix: "music",
    getData: getMusicMeta,
    structuredData: { parentPageKey: "music", entity: { type: "MusicRecording" } },
    build: (music, { locale }) => {
        const tag = music.isJpFallback ? formatJpAdvancePrefix(locale) : "";
        return {
            title: `${tag}${music.title}`,
            descriptionKind: "music",
            descriptionValues: { title: music.title, lyricist: music.lyricist, composer: music.composer },
            images: [getMusicJacketUrl(music.asset, getSeoAssetSource(locale))],
            twitterCard: "summary",
        };
    },
});

export const defineMusicDetailPage = detailPageFactory(musicDetailPreset);
export const defineMusicDetailClientPage = detailClientPageFactory(musicDetailPreset);

const lyricsDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getMusicMeta>>>({
    kind: "lyrics",
    routePrefix: "lyrics",
    getData: getMusicMeta,
    structuredData: { parentPageKey: "lyrics", entity: { type: "MusicRecording" } },
    build: (music, { locale }) => {
        const tag = music.isJpFallback ? formatJpAdvancePrefix(locale) : "";
        return {
            title: `${tag}${music.title}`,
            descriptionKind: "lyrics",
            descriptionValues: { title: music.title },
            images: [getMusicJacketUrl(music.asset, getSeoAssetSource(locale))],
            twitterCard: "summary",
        };
    },
});

export const defineLyricsDetailPage = detailPageFactory(lyricsDetailPreset);
export const defineLyricsDetailClientPage = detailClientPageFactory(lyricsDetailPreset);

const mysekaiFixtureDetailPreset = defineDetailPreset<NonNullable<ReturnType<typeof getFixtureMeta>>>({
    kind: "mysekai",
    routePrefix: "mysekai",
    getData: getFixtureMeta,
    structuredData: { parentPageKey: "mysekai", entity: { type: "Thing" } },
    build: (fixture, { locale }) => {
        const hasFlavor = Boolean(fixture.flavor && fixture.flavor.trim() !== "" && fixture.flavor.trim() !== fixture.name.trim());
        return {
            title: fixture.name,
            descriptionKind: "mysekai",
            descriptionValues: {
                name: fixture.name,
                flavorSuffix: formatMysekaiFlavorSuffix(hasFlavor ? fixture.flavor : undefined, locale),
            },
            images: [getMysekaiFixtureThumbnailUrl(fixture.asset, getSeoAssetSource(locale))],
            twitterCard: "summary",
        };
    },
});

export const defineMysekaiFixtureDetailPage = detailPageFactory(mysekaiFixtureDetailPreset);
export const defineMysekaiFixtureDetailClientPage = detailClientPageFactory(mysekaiFixtureDetailPreset);
