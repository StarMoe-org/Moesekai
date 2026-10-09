"use client";
import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { usePathname, useRouter } from "next/navigation";
import { localizePathForBrowser, stripRouteLocale } from "@/lib/localized-path";
import {
    ACCOUNTS_CHANGED_EVENT,
    getActiveAccount,
    getCharacterIconUrl,
    getTopCharacterId,
    getCachedAvatarUrl,
    type MoesekaiAccount,
} from "@/lib/account";
import { useCardThumbnail } from "@/hooks/useCardThumbnail";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import {
    NAV_ITEM_LABEL_KEYS,
} from "@/lib/navigation";
import { LYRICS_ENTRY_VISIBLE } from "@/lib/lyrics-visibility";
import {
    getShortcutById,
    isEditableEventTarget,
    isKeyboardEventComposing,
    matchesShortcutCombo,
    parseShortcutCombos,
} from "@/lib/shortcuts";
import { Icon, IconButton, NavigationDrawerItem, cn } from "@/components/md3";
import {
    mdStyle,
    mdStyleFill,
    mdLibraryMusic,
    mdLibraryMusicFill,
    mdLyrics,
    mdLyricsFill,
    mdQueryStats,
    mdQueryStatsFill,
    mdAlbum,
    mdAlbumFill,
    mdPerson,
    mdPersonFill,
    mdApparel,
    mdApparelFill,
    mdMilitaryTech,
    mdMilitaryTechFill,
    mdSentimentSatisfied,
    mdSentimentSatisfiedFill,
    mdPhotoLibrary,
    mdPhotoLibraryFill,
    mdMenuBook,
    mdMenuBookFill,
    mdCottage,
    mdCottageFill,
    mdInventory2,
    mdInventory2Fill,
    mdSwapHoriz,
    mdSwapHorizFill,
    mdCelebration,
    mdCelebrationFill,
    mdCampaign,
    mdCampaignFill,
    mdCasino,
    mdCasinoFill,
    mdLiveTv,
    mdLiveTvFill,
    mdTrendingUp,
    mdFlag,
    mdFlagFill,
    mdTrendingUpFill,
    mdLeaderboard,
    mdLeaderboardFill,
    mdViewInAr,
    mdViewInArFill,
    mdAutoStories,
    mdAutoStoriesFill,
    mdEvent,
    mdEventFill,
    mdCollectionsBookmark,
    mdCollectionsBookmarkFill,
    mdForum,
    mdForumFill,
    mdGroups,
    mdGroupsFill,
    mdRecordVoiceOver,
    mdRecordVoiceOverFill,
    mdStar,
    mdStarFill,
    mdSchool,
    mdSchoolFill,
    mdRedeem,
    mdRedeemFill,
    mdQuiz,
    mdQuizFill,
    mdMusicNote,
    mdMusicNoteFill,
    mdImageSearch,
    mdImageSearchFill,
    mdHistory,
    mdHistoryFill,
    mdTune,
    mdTuneFill,
    mdCompareArrows,
    mdCompareArrowsFill,
    mdScoreboard,
    mdScoreboardFill,
    mdAddPhotoAlternate,
    mdAddPhotoAlternateFill,
    mdPiano,
    mdPianoFill,
    mdLandscape,
    mdLandscapeFill,
    mdAccountCircle,
    mdAccountCircleFill,
    mdQueueMusic,
    mdQueueMusicFill,
    mdInventory,
    mdInventoryFill,
    mdFavorite,
    mdFavoriteFill,
    mdInfo,
    mdInfoFill,
    mdHome,
    mdHomeFill,
    mdKeyboardArrowDown,
    mdChevronRight,
    mdMenuOpen,
    mdGraphicEq,
} from "@/components/md3/icons";

interface NavItem {
    id: string;
    href: string;
    /** Material Symbols path (outlined). */
    icon: string;
    /** Material Symbols path (filled) for the active state. */
    activeIcon: string;
}

interface NavGroup {
    id: string;
    items: NavItem[];
}

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    hasMounted?: boolean;
    disableKeyboardNavigation?: boolean;
}

const SIDEBAR_FOCUS_NEXT_COMBOS = parseShortcutCombos(
    getShortcutById("sidebar-focus-next")?.combos ?? []
);
const SIDEBAR_FOCUS_PREV_COMBOS = parseShortcutCombos(
    getShortcutById("sidebar-focus-prev")?.combos ?? []
);
const SIDEBAR_OPEN_COMBO = parseShortcutCombos(
    getShortcutById("sidebar-open-focused")?.combos ?? []
)[0] ?? [];
const SIDEBAR_CLEAR_FOCUS_COMBO = parseShortcutCombos(
    getShortcutById("close-overlay")?.combos ?? []
)[0] ?? [];

const navigationGroups: NavGroup[] = [
    {
        id: "database",
        items: [
            { id: "cards", href: "/cards", icon: mdStyle, activeIcon: mdStyleFill },
            { id: "musicList", href: "/music", icon: mdLibraryMusic, activeIcon: mdLibraryMusicFill },
            ...(LYRICS_ENTRY_VISIBLE ? [{ id: "lyrics", href: "/lyrics", icon: mdLyrics, activeIcon: mdLyricsFill }] : []),
            { id: "musicMeta", href: "/music/meta", icon: mdQueryStats, activeIcon: mdQueryStatsFill },
            { id: "soundtrack", href: "/soundtrack", icon: mdAlbum, activeIcon: mdAlbumFill },
            { id: "character", href: "/character", icon: mdPerson, activeIcon: mdPersonFill },
            { id: "costumes", href: "/costumes", icon: mdApparel, activeIcon: mdApparelFill },
            { id: "honors", href: "/honors", icon: mdMilitaryTech, activeIcon: mdMilitaryTechFill },
            { id: "sticker", href: "/sticker", icon: mdSentimentSatisfied, activeIcon: mdSentimentSatisfiedFill },
            { id: "comic", href: "/comic", icon: mdPhotoLibrary, activeIcon: mdPhotoLibraryFill },
            { id: "manga", href: "/manga", icon: mdMenuBook, activeIcon: mdMenuBookFill },
            { id: "mysekai", href: "/mysekai", icon: mdCottage, activeIcon: mdCottageFill },
            { id: "materials", href: "/materials", icon: mdInventory2, activeIcon: mdInventory2Fill },
            { id: "exchanges", href: "/exchanges", icon: mdSwapHoriz, activeIcon: mdSwapHorizFill },
        ],
    },
    {
        id: "activity",
        items: [
            { id: "events", href: "/events", icon: mdCelebration, activeIcon: mdCelebrationFill },
            { id: "information", href: "/information", icon: mdCampaign, activeIcon: mdCampaignFill },
            { id: "gacha", href: "/gacha", icon: mdCasino, activeIcon: mdCasinoFill },
            { id: "live", href: "/live", icon: mdLiveTv, activeIcon: mdLiveTvFill },
            { id: "predictionNext", href: "/prediction-next", icon: mdTrendingUp, activeIcon: mdTrendingUpFill },
            { id: "predictionPlanner", href: "/prediction-next/planner", icon: mdFlag, activeIcon: mdFlagFill },
            { id: "realtimeRankingNext", href: "/realtime-ranking-next", icon: mdLeaderboard, activeIcon: mdLeaderboardFill },
            { id: "mysekaiPreview", href: "/mysekai-preview", icon: mdViewInAr, activeIcon: mdViewInArFill },
        ],
    },
    {
        id: "story",
        items: [
            { id: "mainStory", href: "/story/unit", icon: mdAutoStories, activeIcon: mdAutoStoriesFill },
            { id: "eventStory", href: "/story/event", icon: mdEvent, activeIcon: mdEventFill },
            { id: "cardStory", href: "/story/card", icon: mdCollectionsBookmark, activeIcon: mdCollectionsBookmarkFill },
            { id: "areaTalk", href: "/story/area", icon: mdForum, activeIcon: mdForumFill },
            { id: "mysekai-interactions", href: "/mysekai/interactions", icon: mdGroups, activeIcon: mdGroupsFill },
            { id: "selfIntro", href: "/story/self", icon: mdRecordVoiceOver, activeIcon: mdRecordVoiceOverFill },
            { id: "specialStory", href: "/story/special", icon: mdStar, activeIcon: mdStarFill },
        ],
    },
    {
        id: "community",
        items: [
            { id: "guides", href: "/guides", icon: mdSchool, activeIcon: mdSchoolFill },
        ],
    },
    {
        id: "games",
        items: [
            { id: "goodsGacha", href: "/goods-gacha", icon: mdRedeem, activeIcon: mdRedeemFill },
            { id: "guessWho", href: "/guess-who", icon: mdQuiz, activeIcon: mdQuizFill },
            { id: "guessJacket", href: "/guess-jacket", icon: mdMusicNote, activeIcon: mdMusicNoteFill },
            { id: "guessMusic", href: "/guess-music", icon: mdGraphicEq, activeIcon: mdGraphicEq },
        ],
    },
    {
        id: "tools",
        items: [
            { id: "assetViewer", href: "/asset-viewer", icon: mdImageSearch, activeIcon: mdImageSearchFill },
            { id: "assetVersions", href: "/asset-versions", icon: mdHistory, activeIcon: mdHistoryFill },
            { id: "deckRecommend", href: "/deck-recommend", icon: mdTune, activeIcon: mdTuneFill },
            { id: "deckComparator", href: "/deck-comparator", icon: mdCompareArrows, activeIcon: mdCompareArrowsFill },
            { id: "scoreControl", href: "/score-control", icon: mdScoreboard, activeIcon: mdScoreboardFill },
            { id: "stickerMaker", href: "/sticker-maker", icon: mdAddPhotoAlternate, activeIcon: mdAddPhotoAlternateFill },
            { id: "chartPreview", href: "/chart-preview", icon: mdPiano, activeIcon: mdPianoFill },
            { id: "mysekaiPreviewScene", href: "/mysekai-preview/scene", icon: mdLandscape, activeIcon: mdLandscapeFill },
        ],
    },
    {
        id: "personal",
        items: [
            { id: "profile", href: "/profile", icon: mdAccountCircle, activeIcon: mdAccountCircleFill },
            { id: "myCards", href: "/my-cards", icon: mdStyle, activeIcon: mdStyleFill },
            { id: "myMusics", href: "/my-musics", icon: mdQueueMusic, activeIcon: mdQueueMusicFill },
            { id: "myMaterials", href: "/my-materials", icon: mdInventory, activeIcon: mdInventoryFill },
            { id: "support", href: "/patreon", icon: mdFavorite, activeIcon: mdFavoriteFill },
            { id: "about", href: "/about", icon: mdInfo, activeIcon: mdInfoFill },
        ],
    },
];

const SIDEBAR_GROUP_LABEL_KEYS: Record<string, string> = {
    database: "layout.nav.groups.database",
    activity: "layout.nav.groups.activity",
    story: "layout.nav.groups.story",
    community: "layout.nav.groups.community",
    games: "layout.nav.groups.games",
    tools: "layout.nav.groups.tools",
    personal: "layout.nav.groups.personal",
};

/**
 * Navigation groups the user has explicitly opened or closed, remembered
 * across visits. Groups without an explicit choice follow the route: only the
 * current page's group (the first group on pages outside the nav) starts open,
 * so the drawer does not unroll ~50 links at once.
 */
const SIDEBAR_GROUPS_STORAGE_KEY = "sidebar_groups";
const SIDEBAR_GROUPS_EVENT = "moesekai_sidebar_groups_change";

type GroupPreferences = Readonly<Record<string, boolean>>;

const NO_GROUP_PREFERENCES: GroupPreferences = {};
// Parsed form of the last stored string, so the snapshot keeps its identity
// until the stored value actually changes (written here, in another tab, or
// while no Sidebar was mounted to hear the storage event).
let groupPreferencesCache: { raw: string | null; value: GroupPreferences } | null = null;
// Choices made while localStorage refuses writes; they last for this page only.
let unsavedGroupPreferences: GroupPreferences | null = null;

function parseGroupPreferences(raw: string | null): GroupPreferences {
    try {
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return Object.fromEntries(
                Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")
            );
        }
    } catch {
    }
    return NO_GROUP_PREFERENCES;
}

function readGroupPreferences(): GroupPreferences {
    if (unsavedGroupPreferences) return unsavedGroupPreferences;
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY);
    } catch {
    }
    if (groupPreferencesCache?.raw !== raw) {
        groupPreferencesCache = { raw, value: parseGroupPreferences(raw) };
    }
    return groupPreferencesCache.value;
}

function subscribeGroupPreferences(callback: () => void) {
    const handleStorage = (e: StorageEvent) => {
        if (e.key === SIDEBAR_GROUPS_STORAGE_KEY) callback();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SIDEBAR_GROUPS_EVENT, callback);
    return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(SIDEBAR_GROUPS_EVENT, callback);
    };
}

function writeGroupPreference(id: string, expanded: boolean) {
    const next = { ...readGroupPreferences(), [id]: expanded };
    const raw = JSON.stringify(next);
    try {
        localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, raw);
        groupPreferencesCache = { raw, value: next };
        unsavedGroupPreferences = null;
    } catch {
        unsavedGroupPreferences = next;
    }
    window.dispatchEvent(new Event(SIDEBAR_GROUPS_EVENT));
}

function subscribeNothing() {
    return () => {};
}

export default function Sidebar({
    isOpen,
    onClose,
    hasMounted = true,
    disableKeyboardNavigation = false,
}: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { assetSource } = useTheme();
    const { t } = useI18n();
    // On the home page, the mobile navbar stays single-row (~64px tall); on
    // other pages it grows by a breadcrumb row (~32px + border). The sidebar
    // needs a matching top offset so it never collides with the navbar.
    const isHome = stripRouteLocale(pathname) === "/";
    const activeHref = useMemo(() => {
        const unlocalizedPathname = stripRouteLocale(pathname);
        if (unlocalizedPathname === "/") return "/";

        let bestMatch = "";
        for (const group of navigationGroups) {
            for (const item of group.items) {
                if (item.href === "/music" && unlocalizedPathname.startsWith("/music/meta")) {
                    continue;
                }
                if (unlocalizedPathname === item.href || unlocalizedPathname.startsWith(item.href + "/")) {
                    if (item.href.length > bestMatch.length) {
                        bestMatch = item.href;
                    }
                }
            }
        }

        return bestMatch;
    }, [pathname]);

    const activeGroupId = useMemo(
        () => navigationGroups.find((group) => group.items.some((item) => item.href === activeHref))?.id ?? navigationGroups[0]?.id,
        [activeHref]
    );
    const groupPreferences = useSyncExternalStore(subscribeGroupPreferences, readGroupPreferences, () => NO_GROUP_PREFERENCES);
    // False while hydrating against the server snapshot. Hydration renders every
    // group from the route alone; the stored choices land in the re-render that
    // flips this, so layout-dependent work waits for it.
    const hasClientSnapshot = useSyncExternalStore(subscribeNothing, () => true, () => false);
    const expandedGroups = useMemo(
        () => navigationGroups.map((group) => group.id).filter((id) => groupPreferences[id] ?? id === activeGroupId),
        [groupPreferences, activeGroupId]
    );
    const [activeAccount, setActiveAccountState] = useState<MoesekaiAccount | null>(null);
    const activeAccountCardThumbnail = useCardThumbnail(activeAccount?.avatarCardId ?? null, assetSource);
    const navRef = useRef<HTMLElement>(null);

    // Keyboard navigation state: -1 means no focused item.
    const [focusedIndex, setFocusedIndex] = useState(-1);

    // Build the current visible navigation item list, respecting collapsed groups.
    const visibleItems = useMemo(() => {
        const items: { id: string; href: string }[] = [{ id: "home", href: "/" }];
        for (const group of navigationGroups) {
            if (expandedGroups.includes(group.id)) {
                for (const item of group.items) {
                    items.push({ id: item.id, href: item.href });
                }
            }
        }
        return items;
    }, [expandedGroups]);

    // Load and sync the active account.
    useEffect(() => {
        const syncActiveAccount = () => {
            const account = getActiveAccount();
            setActiveAccountState(account);
        };

        syncActiveAccount();
        window.addEventListener(ACCOUNTS_CHANGED_EVENT, syncActiveAccount);
        window.addEventListener("storage", syncActiveAccount);
        return () => {
            window.removeEventListener(ACCOUNTS_CHANGED_EVENT, syncActiveAccount);
            window.removeEventListener("storage", syncActiveAccount);
        };
    }, []);

    // Restore the sidebar scroll position once the groups have their final
    // layout. After a route change the saved offset was measured on the
    // previous page, whose group may have folded since, so the current page's
    // item is then brought into view; a reload keeps the offset as it was.
    const hasRestoredScrollRef = useRef(false);
    useEffect(() => {
        const nav = navRef.current;
        if (!hasClientSnapshot || hasRestoredScrollRef.current || !nav) return;
        hasRestoredScrollRef.current = true;
        const saved = sessionStorage.getItem('sidebar_scroll');
        if (saved) {
            nav.scrollTop = parseInt(saved, 10);
        }
        const savedOnPath = sessionStorage.getItem('sidebar_scroll_path');
        sessionStorage.setItem('sidebar_scroll_path', pathname);
        if (savedOnPath === pathname) return;
        const activeItem = nav.querySelector<HTMLElement>('[aria-current="page"]');
        if (!activeItem) return;
        const navRect = nav.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();
        if (itemRect.top < navRect.top) {
            nav.scrollTop -= navRect.top - itemRect.top;
        } else if (itemRect.bottom > navRect.bottom) {
            nav.scrollTop += itemRect.bottom - navRect.bottom;
        }
    }, [hasClientSnapshot, pathname]);

    // Save the sidebar scroll position.
    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;
        const handleScroll = () => {
            sessionStorage.setItem('sidebar_scroll', String(nav.scrollTop));
        };
        nav.addEventListener('scroll', handleScroll, { passive: true });
        return () => nav.removeEventListener('scroll', handleScroll);
    }, []);

    // Keyboard navigation: move with arrow keys, open with Enter, cancel with Escape.
    useEffect(() => {
        if (!isOpen || disableKeyboardNavigation || window.innerWidth < 768) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented || isKeyboardEventComposing(e)) return;

            // Ignore editable targets.
            if (isEditableEventTarget(e.target)) return;

            // Ignore system modifier shortcuts here.
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            if (SIDEBAR_FOCUS_NEXT_COMBOS.some((combo) => matchesShortcutCombo(e, combo))) {
                if (visibleItems.length === 0) return;
                e.preventDefault();
                setFocusedIndex(prev => {
                    const next = prev + 1;
                    return next >= visibleItems.length ? 0 : next;
                });
            } else if (SIDEBAR_FOCUS_PREV_COMBOS.some((combo) => matchesShortcutCombo(e, combo))) {
                if (visibleItems.length === 0) return;
                e.preventDefault();
                setFocusedIndex(prev => {
                    const next = prev - 1;
                    return next < 0 ? visibleItems.length - 1 : next;
                });
            } else if (focusedIndex >= 0 && matchesShortcutCombo(e, SIDEBAR_OPEN_COMBO)) {
                e.preventDefault();
                const item = visibleItems[focusedIndex];
                if (item) {
                    router.push(localizePathForBrowser(item.href));
                    setFocusedIndex(-1);
                }
            } else if (focusedIndex >= 0 && matchesShortcutCombo(e, SIDEBAR_CLEAR_FOCUS_COMBO)) {
                e.preventDefault();
                setFocusedIndex(-1);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, disableKeyboardNavigation, focusedIndex, visibleItems, router]);

    // Scroll focused item into view.
    useEffect(() => {
        if (focusedIndex < 0 || !navRef.current) return;
        const el = navRef.current.querySelector(`[data-nav-index="${focusedIndex}"]`);
        if (el) {
            el.scrollIntoView({ block: "nearest" });
        }
    }, [focusedIndex]);

    // Reset focus when the sidebar closes.
    useEffect(() => {
        if (!isOpen) setFocusedIndex(-1);
    }, [isOpen]);

    const toggleGroup = (id: string) => {
        writeGroupPreference(id, !expandedGroups.includes(id));
    };


    const isActive = (href: string) => href === activeHref;
    const getGroupLabel = (id: string) => t(SIDEBAR_GROUP_LABEL_KEYS[id] ?? id);
    const getItemLabel = (href: string, fallback: string) => t(NAV_ITEM_LABEL_KEYS[href] ?? fallback);

    // Close the sidebar after navigation only on mobile.
    const handleNavClick = () => {
        setFocusedIndex(-1);
        if (window.innerWidth < 768 || screen.width < 768) {
            onClose();
        }
    };

    // Flat index counter for visible items.
    let flatIdx = 0;

    return (
        <>
            {/* Scrim for the modal drawer (below md) */}
            <div
                className={cn(
                    "fixed inset-0 z-[105] bg-scrim/32 transition-opacity duration-300 ease-md3-standard md:hidden",
                    isOpen ? "opacity-100" : "pointer-events-none opacity-0",
                )}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* MD3 navigation drawer: modal below md, docked from md. Docked, it is a glass
                pane floating in its rail, inset like the filter pane beside it. */}
            <aside
                aria-label={t("layout.nav.menu")}
                className={cn(
                    "fixed bottom-0 left-0 top-0 z-[110] flex w-[var(--sidebar-w)] max-w-[calc(100vw-3.5rem)] flex-col overflow-hidden text-on-surface",
                    "glass-thick rounded-r-md3-xl",
                    "md:glass md:bottom-3 md:left-3 md:top-[calc(var(--app-bar-h)+0.75rem)] md:z-[60] md:w-[calc(var(--sidebar-w)-1.5rem)] md:rounded-md3-xl",
                    // Docked (md+), the pane moves with the content column's margin, so it shares its
                    // duration and easing (MainLayout); the compact modal drawer keeps the enter curve.
                    hasMounted && "transition-transform duration-300 ease-md3-emphasized-decelerate md:duration-400 md:ease-md3-emphasized",
                    // The floating pane (md+) sits 0.75rem in and casts a shadow: clear both.
                isOpen ? "translate-x-0" : "-translate-x-full md:-translate-x-[calc(100%+1.5rem)]",
                )}
            >
                {/* Modal drawer header (mobile only): mirrors the app bar logo */}
                <div className="flex h-16 shrink-0 items-center gap-1 px-2 md:hidden">
                    <IconButton icon={mdMenuOpen} label={t("common.md3.closeNavigation")} onClick={onClose} />
                    <span className="type-title-l text-on-surface-variant">{t("layout.nav.menu")}</span>
                </div>

                {/* Navigation groups - scrollable area */}
                <nav ref={navRef} className="flex-grow overflow-y-auto overscroll-contain px-2 pb-2 md:pt-1">
                    {/* Home */}
                    <NavigationDrawerItem
                        density="compact"
                        href="/"
                        label={t("layout.nav.home")}
                        icon={mdHome}
                        activeIcon={mdHomeFill}
                        active={isHome}
                        onClick={handleNavClick}
                        className={focusedIndex === 0 ? "ring-2 ring-primary" : undefined}
                        dataAttrs={{ "data-nav-index": (() => { const i = flatIdx; flatIdx++; return i; })() }}
                    />

                    {/* Navigation groups */}
                    {navigationGroups.map((group) => {
                        const isExpanded = expandedGroups.includes(group.id);
                        return (
                            <div key={group.id} className="mt-1 border-t border-outline-variant pt-1">
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(group.id)}
                                    aria-expanded={isExpanded}
                                    className="state-layer focus-ring flex h-12 w-full cursor-pointer items-center justify-between rounded-full px-3 type-title-s text-on-surface-variant lg:h-8 [@media(any-pointer:coarse)]:min-h-12"
                                >
                                    {getGroupLabel(group.id)}
                                    <Icon
                                        path={mdKeyboardArrowDown}
                                        size={20}
                                        className={cn(hasMounted && "transition-transform duration-300 ease-md3-spatial", isExpanded && "rotate-180")}
                                    />
                                </button>
                                <div
                                    className={cn(
                                        // No transition until the drawer is shown, so stored choices
                                        // applied right after hydration snap into place.
                                        "grid",
                                        hasMounted && "transition-[grid-template-rows,opacity] duration-300 ease-md3-emphasized-decelerate",
                                        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                                    )}
                                >
                                    <div className="min-h-0 overflow-hidden" inert={!isExpanded}>
                                        {group.items.map((item) => {
                                            const thisIdx = isExpanded ? flatIdx++ : -1;
                                            return (
                                                <NavigationDrawerItem
                                                    density="compact"
                                                    key={item.href}
                                                    href={item.href}
                                                    label={getItemLabel(item.href, item.id)}
                                                    icon={item.icon}
                                                    activeIcon={item.activeIcon}
                                                    active={isActive(item.href)}
                                                    onClick={handleNavClick}
                                                    className={isExpanded && focusedIndex === thisIdx ? "ring-2 ring-primary" : undefined}
                                                    dataAttrs={isExpanded ? { "data-nav-index": thisIdx } : undefined}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </nav>

                {/* Account */}
                <div className="shrink-0 border-t border-outline-variant p-3">
                    <Link
                        href="/profile"
                        prefetch={false}
                        onClick={handleNavClick}
                        className="state-layer focus-ring flex items-center gap-3 rounded-md3-lg p-2"
                    >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-container text-on-primary-container">
                            {activeAccount ? (
                                <Image
                                    src={
                                        activeAccountCardThumbnail ||
                                        getCachedAvatarUrl(activeAccount.id) ||
                                        getCharacterIconUrl(
                                            activeAccount.avatarCharacterId ||
                                            (activeAccount.userCharacters ? getTopCharacterId(activeAccount.userCharacters) : 21)
                                        )
                                    }
                                    alt={activeAccount.userGamedata?.name || activeAccount.nickname || activeAccount.gameId}
                                    width={40}
                                    height={40}
                                    className="h-full w-full object-cover"
                                    unoptimized
                                />
                            ) : (
                                <Icon path={mdPerson} size={24} />
                            )}
                        </span>
                        <span className="min-w-0 flex-grow">
                            <span className="block truncate type-label-l text-on-surface">
                                {activeAccount?.userGamedata?.name || activeAccount?.nickname || t("settings.sidebar.notLoggedIn")}
                            </span>
                            <span className="block truncate type-body-s text-on-surface-variant">
                                {activeAccount ? t("settings.sidebar.manageAccount") : t("settings.sidebar.bindAccount")}
                            </span>
                        </span>
                        <Icon path={mdChevronRight} size={24} className="shrink-0 text-on-surface-variant" />
                    </Link>
                </div>
            </aside>
        </>
    );
    }
