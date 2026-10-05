"use client";
import React, { useEffect, useState } from "react";
import Link from "@/components/LocalizedLink";
import { usePathname } from "next/navigation";
import SettingsPanel from "./SettingsPanel";
import CommandPalette from "./CommandPalette";
import { getPrimaryShortcutLabel } from "@/lib/shortcuts";
import { MOE_LOGO_URL } from "@/lib/assets";
import Breadcrumb from "./Breadcrumb";
import { useI18n } from "@/contexts/I18nContext";
import { stripRouteLocale } from "@/lib/localized-path";
import { Icon, IconButton, cn } from "@/components/md3";
import { mdKeyboard, mdMenu, mdSearch, mdSettings } from "@/components/md3/icons";

interface MainNavbarProps {
    onMenuToggle: () => void;
    isSearchOpen: boolean;
    onSearchToggle: () => void;
    onSearchClose: () => void;
    onSearchNavigate: (href: string) => void;
    isSettingsOpen: boolean;
    onSettingsToggle: () => void;
    onSettingsClose: () => void;
    onShortcutsHelpToggle: () => void;
}

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <kbd className={cn("inline-flex h-6 items-center rounded-md3-xs border border-outline-variant px-1.5 font-sans type-label-s text-on-surface-variant", className)}>
            {children}
        </kbd>
    );
}

/**
 * MD3 small top app bar.
 * Flat `surface` at rest; switches to `surface-container` once content scrolls under it.
 * Below `sm`, non-home pages get a second row carrying the breadcrumb.
 */
export default function MainNavbar({
    onMenuToggle,
    isSearchOpen,
    onSearchToggle,
    onSearchClose,
    onSearchNavigate,
    isSettingsOpen,
    onSettingsToggle,
    onSettingsClose,
    onShortcutsHelpToggle,
}: MainNavbarProps) {
    const pathname = usePathname();
    const isHome = stripRouteLocale(pathname) === "/";
    const { t } = useI18n();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 4);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const sidebarShortcut = getPrimaryShortcutLabel("toggle-sidebar");
    const searchShortcut = getPrimaryShortcutLabel("toggle-search");
    const settingsShortcut = getPrimaryShortcutLabel("toggle-settings");
    const helpShortcut = getPrimaryShortcutLabel("toggle-shortcuts-help");

    return (
        <header
            className={cn(
                "fixed inset-x-0 top-0 z-[100] text-on-surface transition-colors duration-200 ease-md3-standard",
                scrolled ? "bg-surface-container" : "bg-surface",
            )}
        >
            <div className="flex h-16 items-center gap-1 px-2 sm:px-3">
                <IconButton icon={mdMenu} label={t("layout.nav.menu")} title={`${t("layout.nav.menu")} (${sidebarShortcut})`} onClick={onMenuToggle} />

                <Link href="/" className="focus-ring ml-1 flex shrink-0 items-center rounded-full px-1 py-2" title="Moesekai">
                    <span
                        className="block h-7 w-[4.5rem] bg-primary sm:h-8 sm:w-[5.5rem]"
                        style={{
                            maskImage: `url(${MOE_LOGO_URL})`,
                            maskSize: "contain",
                            maskPosition: "center",
                            maskRepeat: "no-repeat",
                            WebkitMaskImage: `url(${MOE_LOGO_URL})`,
                            WebkitMaskSize: "contain",
                            WebkitMaskPosition: "center",
                            WebkitMaskRepeat: "no-repeat",
                        }}
                    />
                </Link>

                <div className="ml-2 hidden min-w-0 items-center gap-1.5 overflow-visible sm:flex">
                    <Breadcrumb />
                </div>

                <div className="min-w-0 flex-1" />

                {/* Search: full search bar on wide screens, icon button on narrow ones */}
                <button
                    type="button"
                    onClick={onSearchToggle}
                    title={`${t("layout.nav.search")} (${searchShortcut})`}
                    className="state-layer focus-ring hidden h-12 w-72 shrink cursor-pointer items-center gap-3 rounded-full bg-surface-container-high pl-4 pr-3 text-left text-on-surface-variant lg:flex"
                >
                    <Icon path={mdSearch} size={24} />
                    <span className="min-w-0 flex-1 truncate type-body-l">{t("layout.nav.search")}</span>
                    <Kbd>{searchShortcut}</Kbd>
                </button>
                <IconButton
                    icon={mdSearch}
                    label={t("layout.nav.search")}
                    title={`${t("layout.nav.search")} (${searchShortcut})`}
                    onClick={onSearchToggle}
                    className="lg:hidden"
                />

                <IconButton
                    icon={mdKeyboard}
                    label={t("layout.nav.shortcutsHelp")}
                    title={`${t("layout.nav.shortcutsHelp")} (${helpShortcut})`}
                    onClick={onShortcutsHelpToggle}
                    className="hidden sm:inline-flex"
                />

                <div className="relative">
                    <IconButton
                        id="settings-button"
                        icon={mdSettings}
                        label={t("layout.nav.settings")}
                        title={`${t("layout.nav.settings")} (${settingsShortcut})`}
                        onClick={onSettingsToggle}
                        selected={isSettingsOpen ? true : undefined}
                    />
                    <SettingsPanel isOpen={isSettingsOpen} onClose={onSettingsClose} />
                </div>

                <CommandPalette isOpen={isSearchOpen} onClose={onSearchClose} onNavigate={onSearchNavigate} />
            </div>

            {/* Row 2: breadcrumb on compact windows (non-home only) */}
            {!isHome && (
                <div className="flex h-10 items-center gap-1.5 overflow-visible border-t border-outline-variant px-4 sm:hidden">
                    <Breadcrumb />
                </div>
            )}
        </header>
    );
}
