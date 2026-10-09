"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MainNavbar from "./MainNavbar";
import Sidebar from "./Sidebar";
import MainFooter from "./MainFooter";
import ScrollToTop from "./ScrollToTop";
import FilterDrawer from "./FilterDrawer";
import FilterTabHandle from "./FilterTabHandle";
import SekaiLoader from "./SekaiLoader";
import KeyboardShortcutsHelp from "./KeyboardShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePageListShortcuts } from "@/hooks/usePageListShortcuts";
import { useTheme } from "@/contexts/ThemeContext";
import { useQuickFilterContext } from "@/contexts/QuickFilterContext";
import { localizePathForBrowser, stripRouteLocale } from "@/lib/localized-path";
import DetailSeoSummary from "@/components/seo/DetailSeoSummary";
import { useDetailSeoSummary } from "@/contexts/DetailSeoSummaryContext";

/**
 * How the content column follows the rails (navigation pane, docked filter pane) as they
 * open or collapse. The panes animate with the same duration and easing so their edges and
 * the content move as one. M3 "emphasized": the content stays on screen, so it eases in and
 * out rather than jumping most of the way on the first frame like the decelerate curve did.
 */
const RAIL_SHIFT_TRANSITION = "transition-[margin] duration-400 ease-md3-emphasized";

function ScreenshotParamsListener({ onChange }: { onChange: (isScreenshot: boolean) => void }) {
    const searchParams = useSearchParams();
    useEffect(() => {
        onChange(searchParams.get("mode") === "screenshot");
    }, [searchParams, onChange]);
    return null;
}

function getHistoryStateObject() {
    return typeof window.history.state === "object" && window.history.state !== null
        ? window.history.state as Record<string, unknown>
        : {};
}

function hasOverlayHistoryState() {
    return Boolean(getHistoryStateObject().moesekaiOverlay);
}

interface MainLayoutProps {
    children: React.ReactNode;
    showLoader?: boolean;
    immersiveMode?: boolean;
}

export default function MainLayout({
    children,
    showLoader = false,
    immersiveMode = false,
}: MainLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const routePath = stripRouteLocale(pathname);
    const isHomeRoute = routePath === "/";
    const isLegacyGameRoute = /^\/(?:guess-who|guess-jacket)\/multiplayer(?:\/|$)/.test(routePath);
    useEffect(() => {
        document.documentElement.dataset.legacyGame = String(isLegacyGameRoute);
        return () => { delete document.documentElement.dataset.legacyGame; };
    }, [isLegacyGameRoute]);
    const detailSeoSummary = useDetailSeoSummary();
    const { useTrainedThumbnail, setUseTrainedThumbnail } = useTheme();
    const pageContentRef = useRef<HTMLDivElement>(null);

    // Keep the initial value false to avoid hydration mismatch.
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [isScreenshotMode, setIsScreenshotMode] = useState(false);

    // Centralized UI states managed by MainLayout.
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

    // Filter drawer state lives in QuickFilterContext (pages register their own
    // filter panels into it); the layout only needs to know whether the drawer
    // is currently taking horizontal space, and how to dismiss it.
    const {
        hasFilters,
        isOpen: isFilterDrawerOpen,
        isDocked: isFilterDrawerDocked,
        close: closeFilterDrawer,
    } = useQuickFilterContext();

    // Track whether we pushed a history entry for an overlay, so the mobile
    // back button closes the overlay instead of navigating away.
    const overlayHistoryRef = useRef(false);
    const overlayHistoryArmedRef = useRef(false);
    const overlayHistoryArmRafRef = useRef<number | null>(null);
    const skipNextOverlayHistoryCleanupRef = useRef(false);

    const anyOverlayOpen = isSearchOpen || isSettingsOpen || isShortcutsHelpOpen;

    /**
     * Whether the drawer is currently docked beside the content rather than
     * floating over it. Only in that case does the page need to give up width —
     * a floating drawer is an overlay and must not reflow the grid underneath.
     */
    const isFilterDrawerDockedOpen = Boolean(hasFilters && isFilterDrawerOpen && isFilterDrawerDocked);
    /** Docked but collapsed: the sheet shrinks to a narrow rail in place (see FilterDrawer). */
    const isFilterRailCollapsed = Boolean(hasFilters && !isFilterDrawerOpen && isFilterDrawerDocked);

    /**
     * Whether the drawer is on screen as a modal sheet. The open preference
     * outlives the page that set it, so it only counts while the current page
     * has registered filters — otherwise nothing is showing.
     */
    const isFilterDrawerModal = Boolean(hasFilters && isFilterDrawerOpen && !isFilterDrawerDocked);

    // Mark overlays on <html> so CSS can pause heavy background animations and
    // tone down backdrop blur on mobile while an overlay is present. This is the
    // main lever for keeping the "open settings panel" interaction smooth on phones:
    // a live blurred backdrop (liquid-glass-modal, 28px blur) sitting on top of a
    // continuously animating background forces the compositor to re-run the blur
    // every frame. Freezing the background while an overlay is up removes that
    // per-frame cost entirely.
    useEffect(() => {
        if (typeof document === "undefined") return;
        document.documentElement.dataset.overlayOpen = anyOverlayOpen ? "true" : "false";
        return () => {
            // Only clear when we were the ones to set it.
            if (document.documentElement.dataset.overlayOpen === "true") {
                document.documentElement.dataset.overlayOpen = "false";
            }
        };
    }, [anyOverlayOpen]);

    const cancelOverlayHistoryArm = useCallback(() => {
        if (overlayHistoryArmRafRef.current !== null) {
            cancelAnimationFrame(overlayHistoryArmRafRef.current);
            overlayHistoryArmRafRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (anyOverlayOpen) {
            // Push a sentinel state so the back button can close the overlay.
            if (!overlayHistoryRef.current) {
                window.history.pushState(
                    { ...getHistoryStateObject(), moesekaiOverlay: true },
                    "",
                );
                overlayHistoryRef.current = true;
                overlayHistoryArmedRef.current = false;
                cancelOverlayHistoryArm();
                // Mobile browsers can emit a popstate around URL normalization
                // right after pushState. Arm the listener one frame later to
                // avoid immediately closing the just-opened topbar overlay.
                overlayHistoryArmRafRef.current = requestAnimationFrame(() => {
                    overlayHistoryArmedRef.current = true;
                    overlayHistoryArmRafRef.current = null;
                });
            }
            return;
        }

        if (!overlayHistoryRef.current) return;

        cancelOverlayHistoryArm();
        overlayHistoryArmedRef.current = false;

        const shouldSkipCleanup = skipNextOverlayHistoryCleanupRef.current;
        skipNextOverlayHistoryCleanupRef.current = false;
        overlayHistoryRef.current = false;

        // Search result navigation replaces the overlay sentinel entry with the
        // destination page, so there is no extra history entry to pop here.
        if (!shouldSkipCleanup && hasOverlayHistoryState()) {
            window.history.back();
        }
    }, [anyOverlayOpen, cancelOverlayHistoryArm]);

    useEffect(() => {
        const handlePopState = () => {
            // If an overlay is open and the user pressed back, close it.
            if (overlayHistoryRef.current && overlayHistoryArmedRef.current) {
                overlayHistoryRef.current = false;
                overlayHistoryArmedRef.current = false;
                cancelOverlayHistoryArm();
                skipNextOverlayHistoryCleanupRef.current = false;
                setIsSearchOpen(false);
                setIsSettingsOpen(false);
                setIsShortcutsHelpOpen(false);
                return;
            }

            // A floating filter drawer is modal, so Android's back gesture should
            // dismiss it rather than leave the page. A docked drawer is ordinary
            // page furniture and is left alone — closing it on back would be an
            // invisible change on a wide screen and would swallow the navigation.
            if (isFilterDrawerModal) {
                closeFilterDrawer();
            }
        };

        window.addEventListener("popstate", handlePopState);
        return () => {
            cancelOverlayHistoryArm();
            window.removeEventListener("popstate", handlePopState);
        };
    }, [cancelOverlayHistoryArm, isFilterDrawerModal, closeFilterDrawer]);

    useEffect(() => {
        if (!immersiveMode) return;

        const raf = requestAnimationFrame(() => {
            setIsSearchOpen(false);
            setIsSettingsOpen(false);
            setIsShortcutsHelpOpen(false);
        });

        return () => cancelAnimationFrame(raf);
    }, [immersiveMode]);

    // Restore sidebar state from sessionStorage after mount.
    // Use two RAF ticks: set position first, then enable transitions.
    useEffect(() => {
        const nextSidebarOpen = isScreenshotMode
            ? false
            : immersiveMode
            ? false
            : (() => {
                const saved = sessionStorage.getItem("sidebar_open");
                if (saved !== null) return saved === "true";
                // Check both window.innerWidth and screen.width to avoid old mobile browsers
                // reporting the layout viewport width through innerWidth.
                const isWideScreen = window.innerWidth >= 768 && screen.width >= 768;
                return isWideScreen;
            })();
        let raf1 = 0;
        let raf2 = 0;

        raf1 = requestAnimationFrame(() => {
            setIsSidebarOpen(nextSidebarOpen);
            raf2 = requestAnimationFrame(() => {
                setHasMounted(true);
            });
        });

        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
        };
    }, [immersiveMode, isScreenshotMode]);

    /**
     * Sidebar/drawer mutual exclusion, resolved at render rather than by writing
     * state back.
     *
     * Below `xlarge` (1600px) the filter drawer is a modal sheet, and stacking
     * it with the sidebar buries whichever lost. When the sheet is up, the
     * sidebar therefore yields — treated as visually closed
     * without touching `isSidebarOpen`, so the user's menu preference survives
     * and the menu reappears the moment the drawer is dismissed.
     *
     * From `xlarge` up (`isFilterDrawerDocked`) the two are designed to sit side
     * by side, so nothing yields.
     */
    const sidebarYieldsToDrawer = isFilterDrawerModal;
    const effectiveSidebarOpen = isScreenshotMode || immersiveMode || sidebarYieldsToDrawer
        ? false
        : isSidebarOpen;

    /**
     * How far the content column is pushed right.
     *
     * Two independent rails can claim space: the navigation sidebar (from `md`)
     * and a docked filter drawer (from `xlarge`, 1600px). The offsets are declared
     * per breakpoint rather than computed, because the drawer only docks at `xlarge` —
     * reserving `--dual-rail-w` any earlier would indent the page against a
     * drawer that is still floating, leaving a visibly empty gutter.
     *
     * Chrome is suppressed entirely in screenshot and immersive modes, so those
     * paths keep the content flush left.
     */
    const railOffsetClass = effectiveSidebarOpen
        ? (isFilterDrawerDockedOpen
            ? "md:ml-[var(--sidebar-w)] xlarge:ml-[var(--dual-rail-w)]"
            : isFilterRailCollapsed
              ? "md:ml-[var(--sidebar-w)] xlarge:ml-[calc(var(--sidebar-w)+var(--filter-rail-w))]"
              : "md:ml-[var(--sidebar-w)]")
        : (isFilterDrawerDockedOpen
            ? "md:ml-0 xlarge:ml-[var(--filter-drawer-w)]"
            : isFilterRailCollapsed
              ? "md:ml-0 xlarge:ml-[var(--filter-rail-w)]"
              : "md:ml-0");

    const handleMenuToggle = useCallback(() => {
        if (isScreenshotMode || immersiveMode) return;
        setIsSidebarOpen(prev => {
            const newState = !prev;
            sessionStorage.setItem('sidebar_open', String(newState));
            // Opening the menu on a narrow screen dismisses the filter drawer, so
            // the two overlays never stack. The reverse direction needs no action
            // here: `effectiveSidebarOpen` already treats the sidebar as closed
            // while a floating drawer is up.
            if (newState && isFilterDrawerModal) {
                closeFilterDrawer();
            }
            return newState;
        });
    }, [immersiveMode, isScreenshotMode, isFilterDrawerModal, closeFilterDrawer]);

    const handleSidebarClose = useCallback(() => {
        setIsSidebarOpen(false);
        if (!isScreenshotMode && !immersiveMode) {
            sessionStorage.setItem('sidebar_open', 'false');
        }
    }, [immersiveMode, isScreenshotMode]);

    const handleSearchClose = useCallback(() => {
        setIsSearchOpen(false);
    }, []);

    const handleSearchNavigate = useCallback((href: string) => {
        skipNextOverlayHistoryCleanupRef.current = true;
        setIsSearchOpen(false);
        router.replace(localizePathForBrowser(href));
    }, [router]);

    // Keyboard shortcut handlers.
    const shortcutHandlers = useMemo(() => ({
        onToggleSidebar: handleMenuToggle,
        onToggleSettings: () => setIsSettingsOpen(prev => !prev),
        onToggleSearch: () => setIsSearchOpen(prev => !prev),
        onToggleShortcutsHelp: () => setIsShortcutsHelpOpen(prev => !prev),
        onToggleTrainedThumbnail: () => setUseTrainedThumbnail(!useTrainedThumbnail),
        onNavigateBack: () => router.back(),
        onNavigateForward: () => window.history.forward(),
        onNavigateHome: () => router.push(localizePathForBrowser("/")),
        onNavigateCards: () => router.push(localizePathForBrowser("/cards")),
        onNavigateMusic: () => router.push(localizePathForBrowser("/music")),
        onNavigateEvents: () => router.push(localizePathForBrowser("/events")),
        onNavigateProfile: () => router.push(localizePathForBrowser("/profile")),
    }), [router, useTrainedThumbnail, setUseTrainedThumbnail, handleMenuToggle]);

    // The modal filter sheet traps focus like the other overlays, so page
    // shortcuts must not act on the content behind it.
    const isShortcutScopeLocked = isSearchOpen || isSettingsOpen || isShortcutsHelpOpen || immersiveMode || isFilterDrawerModal;

    useKeyboardShortcuts(shortcutHandlers, {
        disabled: isShortcutScopeLocked,
    });

    usePageListShortcuts({
        rootRef: pageContentRef,
        disabled: isShortcutScopeLocked,
    });

    return (
        <main className="relative flex min-h-screen flex-col text-on-surface selection:bg-primary-container selection:text-on-primary-container">
            <Suspense fallback={null}>
                <ScreenshotParamsListener onChange={setIsScreenshotMode} />
            </Suspense>

            {/* Loading Animation */}
            {showLoader && <SekaiLoader />}

            {/* Background: MD3 surface on <body> plus a faint seed-tinted wash (globals.css). */}
            <div aria-hidden="true" className="brand-wash" />

            {/* Navbar */}
            {!immersiveMode && (
                <MainNavbar
                    onMenuToggle={handleMenuToggle}
                    isSearchOpen={isSearchOpen}
                    onSearchToggle={() => setIsSearchOpen(prev => !prev)}
                    onSearchClose={handleSearchClose}
                    onSearchNavigate={handleSearchNavigate}
                    isSettingsOpen={isSettingsOpen}
                    onSettingsToggle={() => setIsSettingsOpen(prev => !prev)}
                    onSettingsClose={() => setIsSettingsOpen(false)}
                    onShortcutsHelpToggle={() => setIsShortcutsHelpOpen(prev => !prev)}
                />
            )}

            {/* Layout with Sidebar */}
            <div className={`relative flex flex-grow ${immersiveMode ? "" : isHomeRoute ? "pt-16" : "pt-[6.5rem] sm:pt-16"}`}>
                {/* Sidebar */}
                {!immersiveMode && (
                    <Sidebar
                        isOpen={effectiveSidebarOpen}
                        onClose={handleSidebarClose}
                        hasMounted={hasMounted}
                        disableKeyboardNavigation={isShortcutScopeLocked}
                    />
                )}

                {/* Main content area */}
                <div ref={pageContentRef} data-shortcut-page-root="true" className={`relative z-10 w-full min-w-0 flex-grow ${hasMounted ? RAIL_SHIFT_TRANSITION : ""} ${railOffsetClass}`}>
                    {children}
                    {detailSeoSummary && (
                        <DetailSeoSummary
                            title={detailSeoSummary.title}
                            description={detailSeoSummary.description}
                            locale={detailSeoSummary.locale}
                            semantic={detailSeoSummary.semantic}
                        />
                    )}
                </div>
            </div>

            {!immersiveMode && (
                <>
                    {/* Footer */}
                    <div className={`relative z-[5] ${hasMounted ? RAIL_SHIFT_TRANSITION : ""} ${railOffsetClass}`}>
                        <MainFooter />
                    </div>

                    {/* Scroll To Top */}
                    <ScrollToTop />

                    {/* Filter sheet (single mount point for every page's filters) and its FAB entry point. */}
                    <FilterDrawer isSidebarOpen={effectiveSidebarOpen} />
                    <FilterTabHandle isSidebarOpen={effectiveSidebarOpen} />

                    {/* Keyboard Shortcuts Help */}
                    <KeyboardShortcutsHelp isOpen={isShortcutsHelpOpen} onClose={() => setIsShortcutsHelpOpen(false)} />
                </>
            )}
        </main>
    );
}
