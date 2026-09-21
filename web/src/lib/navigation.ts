// Breadcrumb navigation data

import { stripRouteLocale } from "@/lib/localized-path";
import { LYRICS_ENTRY_VISIBLE } from "@/lib/lyrics-visibility";

export interface NavItemData {
    href: string;
}

export interface NavGroupData {
    href: string;
    items: NavItemData[];
}

const allNavigationGroups: NavGroupData[] = [
    {
        href: "/breadcrumb-database",
        items: [
            { href: "/cards" },
            { href: "/music" },
            { href: "/lyrics" },
            { href: "/music/meta" },
            { href: "/soundtrack" },
            { href: "/character" },
            { href: "/costumes" },
            { href: "/honors" },
            { href: "/sticker" },
            { href: "/comic" },
            { href: "/manga" },
            { href: "/mysekai" },
            { href: "/materials" },
            { href: "/exchanges" },
        ],
    },
    {
        href: "/breadcrumb-activity",
        items: [
            { href: "/events" },
            { href: "/information" },
            { href: "/gacha" },
            { href: "/live" },
            { href: "/prediction-next" },
            { href: "/realtime-ranking-next" },
            { href: "/mysekai-preview" },
        ],
    },
    {
        href: "/breadcrumb-story",
        items: [
            { href: "/story/unit" },
            { href: "/story/event" },
            { href: "/story/card" },
            { href: "/story/area" },
            { href: "/mysekai/interactions" },
            { href: "/story/self" },
            { href: "/story/special" },
        ],
    },
    {
        href: "/breadcrumb-community",
        items: [
            { href: "/guides" },
        ],
    },
    {
        href: "/breadcrumb-games",
        items: [
            { href: "/goods-gacha" },
            { href: "/guess-who" },
            { href: "/guess-jacket" },
        ],
    },
    {
        href: "/breadcrumb-tools",
        items: [
            { href: "/asset-viewer" },
            { href: "/asset-versions" },
            { href: "/deck-recommend" },
            { href: "/deck-comparator" },
            { href: "/score-control" },
            { href: "/sticker-maker" },
            { href: "/chart-preview" },
            { href: "/mysekai-preview/scene" },
        ],
    },
    {
        href: "/breadcrumb-personal",
        items: [
            { href: "/profile" },
            { href: "/my-cards" },
            { href: "/my-musics" },
            { href: "/my-materials" },
            { href: "/patreon" },
            { href: "/about" },
        ],
    },
];

export const navigationGroups: NavGroupData[] = allNavigationGroups.map((group) => ({
    ...group,
    items: LYRICS_ENTRY_VISIBLE
        ? group.items
        : group.items.filter((item) => item.href !== "/lyrics"),
}));

/**
 * Finds the best matching navigation item and its group for a pathname.
 */
export function findNavMatch(pathname: string): { group: NavGroupData; item: NavItemData } | null {
    const routePathname = stripRouteLocale(pathname);
    const normalized = routePathname.endsWith("/") && routePathname !== "/"
        ? routePathname.slice(0, -1)
        : routePathname;
    let bestMatch: { group: NavGroupData; item: NavItemData } | null = null;
    for (const group of allNavigationGroups) {
        for (const item of group.items) {
            // Keep the longest prefix match so nested routes choose the most specific item.
            if (normalized === item.href || normalized.startsWith(item.href + "/")) {
                // Prevent /music/meta from matching /music first.
                if (item.href === "/music" && normalized.startsWith("/music/meta")) {
                    continue;
                }
                if (!bestMatch || item.href.length > bestMatch.item.href.length) {
                    bestMatch = { group, item };
                }
            }
        }
    }
    if (!bestMatch) return null;

    // Hidden routes retain their own breadcrumb when opened directly, but never
    // appear in breadcrumb dropdowns while the entry-point flag is disabled.
    return {
        item: bestMatch.item,
        group: {
            ...bestMatch.group,
            items: bestMatch.group.items.filter((item) =>
                LYRICS_ENTRY_VISIBLE || item.href !== "/lyrics" || item.href === bestMatch.item.href
            ),
        },
    };
}

/**
 * Finds a matching summary group page for a pathname.
 */
export function findGroupMatch(pathname: string): NavGroupData | null {
    const routePathname = stripRouteLocale(pathname);
    const normalized = routePathname.endsWith("/") && routePathname !== "/"
        ? routePathname.slice(0, -1)
        : routePathname;
    for (const group of navigationGroups) {
        if (normalized === group.href) {
            return group;
        }
    }
    return null;
}

export type SearchableNavGroup = "navigation" | "database" | "activity" | "story" | "games" | "tools" | "personal";

export interface SearchableNavItem {
    href: string;
    group: SearchableNavGroup;
    keywords: string[];
}

const allSearchableNavItems: SearchableNavItem[] = [
    { href: "/", group: "navigation", keywords: ["home", "index"] },

    { href: "/cards", group: "database", keywords: ["cards", "card"] },
    { href: "/music", group: "database", keywords: ["music", "song", "songs"] },
    { href: "/lyrics", group: "database", keywords: ["lyrics", "song lyrics", "translation"] },
    { href: "/music/meta", group: "database", keywords: ["music meta", "song meta", "difficulty"] },
    { href: "/soundtrack", group: "database", keywords: ["soundtrack", "ost", "bgm", "music"] },
    { href: "/character", group: "database", keywords: ["character", "characters"] },
    { href: "/costumes", group: "database", keywords: ["costumes", "costume", "outfit"] },
    { href: "/honors", group: "database", keywords: ["honors", "honor", "title"] },
    { href: "/sticker", group: "database", keywords: ["sticker", "stickers", "stamp"] },
    { href: "/comic", group: "database", keywords: ["comic", "comics", "manga"] },
    { href: "/manga", group: "database", keywords: ["four koma", "4koma", "official manga"] },
    { href: "/mysekai", group: "database", keywords: ["furniture", "mysekai", "home", "database"] },
    { href: "/materials", group: "database", keywords: ["materials", "items", "holding", "holdings", "material"] },
    { href: "/exchanges", group: "database", keywords: ["exchange", "exchanges", "material exchange", "shop"] },

    { href: "/events", group: "activity", keywords: ["events", "event"] },
    { href: "/information", group: "activity", keywords: ["information", "announcement", "announcements", "news", "notice"] },
    { href: "/gacha", group: "activity", keywords: ["gacha", "banner", "pull"] },
    { href: "/live", group: "activity", keywords: ["live", "concert", "virtual live"] },
    { href: "/story/event", group: "activity", keywords: ["event story", "story", "scenario"] },
    { href: "/prediction-next", group: "activity", keywords: ["prediction next", "prediction", "ranking", "forecast", "akiyome", "goal planner"] },
    { href: "/realtime-ranking-next", group: "activity", keywords: ["realtime ranking", "realtime ranking next", "live ranking", "live ranking next", "player detail", "rank", "ranking"] },
    { href: "/mysekai-preview", group: "activity", keywords: ["baijing", "housing competition", "mysekai", "top"] },

    { href: "/mysekai/interactions", group: "story", keywords: ["mysekai story", "mysekai stories", "conversation", "interaction", "furniture story", "character activity", "scene", "moly", "weather"] },

    { href: "/goods-gacha", group: "games", keywords: ["goods gacha", "goods", "blind box"] },
    { href: "/guess-who", group: "games", keywords: ["guess who", "quiz", "game"] },
    { href: "/guess-jacket", group: "games", keywords: ["guess jacket", "guess music", "music quiz"] },

    { href: "/asset-viewer", group: "tools", keywords: ["asset browser", "assets", "explorer", "files", "static"] },
    { href: "/asset-versions", group: "tools", keywords: ["asset versions", "changelog", "update history", "diff", "version"] },
    { href: "/deck-recommend", group: "tools", keywords: ["deck recommend", "deck", "team"] },
    { href: "/deck-comparator", group: "tools", keywords: ["deck compare", "comparator"] },
    { href: "/score-control", group: "tools", keywords: ["score control", "score", "calculator"] },
    { href: "/chart-preview", group: "tools", keywords: ["chart preview", "chart", "mmw", "preview", "sus"] },
    { href: "/mysekai-preview/scene", group: "tools", keywords: ["mysekai preview", "scene preview", "mysekai", "3d", "obj", "scene"] },
    { href: "/sticker-maker", group: "tools", keywords: ["sticker maker", "meme"] },

    { href: "/profile", group: "personal", keywords: ["profile", "user", "account"] },
    { href: "/my-cards", group: "personal", keywords: ["my cards", "card progress"] },
    { href: "/my-musics", group: "personal", keywords: ["my musics", "music progress", "song progress"] },
    { href: "/my-materials", group: "personal", keywords: ["my materials", "materials", "resources", "mysekai materials"] },
    { href: "/about", group: "personal", keywords: ["about", "info"] },
];

export const searchableNavItems: SearchableNavItem[] = LYRICS_ENTRY_VISIBLE
    ? allSearchableNavItems
    : allSearchableNavItems.filter((item) => item.href !== "/lyrics");

export const SEARCH_GROUP_ROUTES: Record<string, string> = {
    events: "/events",
    music: "/music",
    cards: "/cards",
    gacha: "/gacha",
    mysekai: "/mysekai",
    costumes: "/costumes",
    live: "/live",
};

export const SEARCH_GROUP_LABEL_KEYS: Record<string, string> = {
    events: "search.commandPalette.dynamicGroups.events",
    music: "search.commandPalette.dynamicGroups.music",
    cards: "search.commandPalette.dynamicGroups.cards",
    gacha: "search.commandPalette.dynamicGroups.gacha",
    mysekai: "search.commandPalette.dynamicGroups.mysekai",
    costumes: "search.commandPalette.dynamicGroups.costumes",
    live: "search.commandPalette.dynamicGroups.live",
};

export const SEARCH_STATIC_GROUP_LABEL_KEYS: Record<SearchableNavGroup, string> = {
    navigation: "layout.nav.groups.navigation",
    database: "layout.nav.groups.database",
    activity: "layout.nav.groups.activity",
    story: "layout.nav.groups.story",
    games: "layout.nav.groups.games",
    tools: "layout.nav.groups.tools",
    personal: "layout.nav.groups.personal",
};

export const NAV_GROUP_LABEL_KEYS: Record<string, string> = {
    "/breadcrumb-database": "layout.nav.groups.database",
    "/breadcrumb-activity": "layout.nav.groups.activity",
    "/breadcrumb-story": "layout.nav.groups.story",
    "/breadcrumb-community": "layout.nav.groups.community",
    "/breadcrumb-games": "layout.nav.groups.games",
    "/breadcrumb-tools": "layout.nav.groups.tools",
    "/breadcrumb-personal": "layout.nav.groups.personal",
};

export const NAV_ITEM_LABEL_KEYS: Record<string, string> = {
    "/": "layout.nav.home",
    "/cards": "layout.nav.items.cards",
    "/music": "layout.nav.items.musicList",
    "/lyrics": "layout.nav.items.lyrics",
    "/music/meta": "layout.nav.items.musicMeta",
    "/soundtrack": "layout.nav.items.soundtrack",
    "/character": "layout.nav.items.character",
    "/costumes": "layout.nav.items.costumes",
    "/honors": "layout.nav.items.honors",
    "/sticker": "layout.nav.items.sticker",
    "/comic": "layout.nav.items.comic",
    "/manga": "layout.nav.items.manga",
    "/mysekai": "layout.nav.items.mysekai",
    "/mysekai/interactions": "page.mysekaiInteractions.navTitle",
    "/materials": "layout.nav.items.materials",
    "/exchanges": "layout.nav.items.exchanges",
    "/events": "layout.nav.items.events",
    "/information": "layout.nav.items.information",
    "/gacha": "layout.nav.items.gacha",
    "/live": "layout.nav.items.live",
    "/prediction": "layout.nav.items.prediction",
    "/prediction-next": "layout.nav.items.predictionNext",
    "/realtime-ranking": "layout.nav.items.realtimeRanking",
    "/realtime-ranking-next": "layout.nav.items.realtimeRankingNext",
    "/mysekai-preview": "layout.nav.items.mysekaiPreview",
    "/story/unit": "layout.nav.items.mainStory",
    "/story/event": "layout.nav.items.eventStory",
    "/story/card": "layout.nav.items.cardStory",
    "/story/area": "layout.nav.items.areaTalk",
    "/story/self": "layout.nav.items.selfIntro",
    "/story/special": "layout.nav.items.specialStory",
    "/guides": "layout.nav.items.guides",
    "/deck-recommend": "layout.nav.items.deckRecommend",
    "/deck-comparator": "layout.nav.items.deckComparator",
    "/score-control": "layout.nav.items.scoreControl",
    "/sticker-maker": "layout.nav.items.stickerMaker",
    "/goods-gacha": "layout.nav.items.goodsGacha",
    "/guess-who": "layout.nav.items.guessWho",
    "/guess-jacket": "layout.nav.items.guessJacket",
    "/chart-preview": "layout.nav.items.chartPreview",
    "/mysekai-preview/scene": "layout.nav.items.mysekaiPreviewScene",
    "/asset-viewer": "layout.nav.items.assetViewer",
    "/asset-versions": "layout.nav.items.assetVersions",
    "/profile": "layout.nav.items.profile",
    "/my-cards": "layout.nav.items.myCards",
    "/my-musics": "layout.nav.items.myMusics",
    "/my-materials": "layout.nav.items.myMaterials",
    "/patreon": "layout.nav.items.support",
    "/about": "layout.nav.items.about",
};

export const NAV_ITEM_DESCRIPTION_KEYS: Record<string, string> = {
    "/cards": "layout.groupPages.cards",
    "/music": "layout.groupPages.music",
    "/lyrics": "layout.groupPages.lyrics",
    "/music/meta": "layout.groupPages.musicMeta",
    "/soundtrack": "layout.groupPages.soundtrack",
    "/character": "layout.groupPages.character",
    "/costumes": "layout.groupPages.costumes",
    "/honors": "layout.groupPages.honors",
    "/sticker": "layout.groupPages.sticker",
    "/comic": "layout.groupPages.comic",
    "/manga": "layout.groupPages.manga",
    "/mysekai": "layout.groupPages.mysekai",
    "/mysekai/interactions": "page.mysekaiInteractions.subtitle",
    "/materials": "layout.groupPages.materials",
    "/exchanges": "layout.groupPages.exchanges",
    "/events": "layout.groupPages.events",
    "/information": "layout.groupPages.information",
    "/gacha": "layout.groupPages.gacha",
    "/live": "layout.groupPages.live",
    "/story/event": "layout.groupPages.storyEvent",
    "/story/unit": "layout.groupPages.storyUnit",
    "/story/card": "layout.groupPages.storyCard",
    "/story/area": "layout.groupPages.storyArea",
    "/story/self": "layout.groupPages.storySelf",
    "/story/special": "layout.groupPages.storySpecial",
    "/prediction": "layout.groupPages.prediction",
    "/guides": "layout.groupPages.guides",
    "/deck-recommend": "layout.groupPages.deckRecommend",
    "/deck-comparator": "layout.groupPages.deckComparator",
    "/score-control": "layout.groupPages.scoreControl",
    "/sticker-maker": "layout.groupPages.stickerMaker",
    "/goods-gacha": "layout.groupPages.goodsGacha",
    "/guess-who": "layout.groupPages.guessWho",
    "/guess-jacket": "layout.groupPages.guessJacket",
    "/chart-preview": "layout.groupPages.chartPreview",
    "/mysekai-preview": "layout.groupPages.mysekaiPreview",
    "/mysekai-preview/scene": "layout.groupPages.mysekaiPreviewScene",
    "/asset-viewer": "layout.groupPages.assetViewer",
    "/asset-versions": "layout.groupPages.assetVersions",
    "/profile": "layout.groupPages.profile",
    "/my-cards": "layout.groupPages.myCards",
    "/my-musics": "layout.groupPages.myMusics",
    "/my-materials": "layout.groupPages.myMaterials",
    "/patreon": "layout.groupPages.patreon",
    "/about": "layout.groupPages.about",
};
