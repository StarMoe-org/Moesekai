"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
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
    // Expand all groups by default.
    const [expandedGroups, setExpandedGroups] = useState<string[]>(
        navigationGroups.map(group => group.id)
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

    // Restore the sidebar scroll position.
    useEffect(() => {
        const saved = sessionStorage.getItem('sidebar_scroll');
        if (saved && navRef.current) {
            navRef.current.scrollTop = parseInt(saved, 10);
        }
    }, []);

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
        setExpandedGroups((prev) =>
            prev.includes(id) ? prev.filter((groupId) => groupId !== id) : [...prev, id]
        );
    };

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

            {/* MD3 navigation drawer: standard (docked) from md, modal below md */}
            <aside
                aria-label={t("layout.nav.menu")}
                className={cn(
                    "fixed bottom-0 left-0 top-0 z-[110] flex w-[var(--sidebar-w)] md:z-[60] max-w-[calc(100vw-3.5rem)] flex-col bg-surface-container-low text-on-surface",
                    "rounded-r-md3-lg md:top-16 md:rounded-none md:bg-surface",
                    hasMounted && "transition-transform duration-300 ease-md3-emphasized-decelerate",
                    isOpen ? "translate-x-0 shadow-elev-1 md:shadow-none" : "-translate-x-full",
                )}
            >
                {/* Modal drawer header (mobile only): mirrors the app bar logo */}
                <div className="flex h-16 shrink-0 items-center gap-1 px-2 md:hidden">
                    <IconButton icon={mdMenuOpen} label={t("common.md3.closeNavigation")} onClick={onClose} />
                    <span className="type-title-l text-on-surface-variant">{t("layout.nav.menu")}</span>
                </div>

                {/* Navigation groups - scrollable area */}
                <nav ref={navRef} className="flex-grow overflow-y-auto overscroll-contain px-3 pb-3 md:pt-2">
                    {/* Home */}
                    <NavigationDrawerItem
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
                            <div key={group.id} className="mt-2 border-t border-outline-variant pt-2">
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(group.id)}
                                    aria-expanded={isExpanded}
                                    className="state-layer focus-ring flex h-12 w-full cursor-pointer items-center justify-between rounded-full px-4 type-title-s text-on-surface-variant"
                                >
                                    {getGroupLabel(group.id)}
                                    <Icon
                                        path={mdKeyboardArrowDown}
                                        size={20}
                                        className={cn("transition-transform duration-200 ease-md3-spatial-fast", isExpanded && "rotate-180")}
                                    />
                                </button>
                                <div
                                    className={cn(
                                        "grid transition-[grid-template-rows,opacity] duration-300 ease-md3-emphasized-decelerate",
                                        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                                    )}
                                >
                                    <div className="min-h-0 overflow-hidden">
                                        {group.items.map((item) => {
                                            const thisIdx = flatIdx;
                                            flatIdx++;
                                            return (
                                                <NavigationDrawerItem
                                                    key={item.href}
                                                    href={item.href}
                                                    label={getItemLabel(item.href, item.id)}
                                                    icon={item.icon}
                                                    activeIcon={item.activeIcon}
                                                    active={isActive(item.href)}
                                                    onClick={handleNavClick}
                                                    className={focusedIndex === thisIdx ? "ring-2 ring-primary" : undefined}
                                                    dataAttrs={{ "data-nav-index": thisIdx }}
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
