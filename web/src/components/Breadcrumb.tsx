"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "@/components/LocalizedLink";
import { usePathname } from "next/navigation";
import { findNavMatch, findGroupMatch, navigationGroups, NAV_GROUP_LABEL_KEYS, NAV_ITEM_LABEL_KEYS } from "@/lib/navigation";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { useI18n } from "@/contexts/I18nContext";
import { stripRouteLocale } from "@/lib/localized-path";
import { Icon, cn } from "@/components/md3";
import { mdKeyboardArrowDown } from "@/components/md3/icons";

// Expand arrow button.
function ExpandButton({ open, onClick, ariaLabel }: { open: boolean; onClick: () => void; ariaLabel: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="state-layer focus-ring flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-on-surface-variant"
            aria-label={ariaLabel}
            aria-expanded={open}
        >
            <Icon path={mdKeyboardArrowDown} size={18} className={cn("transition-transform duration-200 ease-md3-spatial-fast", open && "rotate-180")} />
        </button>
    );
}

// Dropdown panel (MD3 menu surface).
function DropdownPanel({ children }: { children: React.ReactNode }) {
    return (
        <div role="menu" className="md3-menu-enter absolute left-0 top-full z-[200] mt-1 max-h-[60vh] min-w-[12rem] overflow-y-auto rounded-md3-lg bg-surface-container py-2 text-on-surface shadow-elev-2">
            {children}
        </div>
    );
}

// Dropdown item.
function DropdownItem({ href, isCurrent, children }: { href: string; isCurrent: boolean; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            role="menuitem"
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
                "state-layer flex h-12 items-center whitespace-nowrap px-4 type-label-l",
                isCurrent ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
            )}
        >
            {children}
        </Link>
    );
}

/**
 * Inline breadcrumb shown next to the top-bar logo.
 * Returns null on home or unmatched routes.
 * Text navigates directly; arrows open sibling navigation dropdowns.
 */
export default function Breadcrumb() {
    const pathname = usePathname();
    const { detailName, detailNode } = useBreadcrumb();
    const { t } = useI18n();
    const [openDropdown, setOpenDropdown] = useState<"group" | "item" | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdowns after route changes.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOpenDropdown(null);
    }, [pathname]);

    // Close on outside click or Escape.
    useEffect(() => {
        if (!openDropdown) return;

        const handleMouseDown = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpenDropdown(null);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpenDropdown(null);
        };

        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [openDropdown]);

    const toggleDropdown = useCallback((type: "group" | "item") => {
        setOpenDropdown((prev) => (prev === type ? null : type));
    }, []);

    const getGroupLabel = useCallback((href: string) => {
        return t(NAV_GROUP_LABEL_KEYS[href] ?? href);
    }, [t]);

    const getItemLabel = useCallback((href: string) => {
        return t(NAV_ITEM_LABEL_KEYS[href] ?? href);
    }, [t]);

    const routePathname = stripRouteLocale(pathname);
    if (routePathname === "/") return null;

    // Normalize pathname for comparisons.
    const norm = routePathname.endsWith("/") && routePathname !== "/"
        ? routePathname.slice(0, -1)
        : routePathname;

    // Summary group page.
    const groupMatch = findGroupMatch(pathname);
    if (groupMatch) {
        return (
            <div ref={dropdownRef} className="flex items-center gap-1.5 min-w-0">
                <span className="shrink-0 text-outline">/</span>
                <div className="relative flex items-center gap-0.5">
                    <span className="shrink-0 type-label-l text-on-surface">
                        {getGroupLabel(groupMatch.href)}
                    </span>
                    <ExpandButton
                        open={openDropdown === "group"}
                        onClick={() => toggleDropdown("group")}
                        ariaLabel={t("layout.breadcrumb.expandGroup")}
                    />
                    {openDropdown === "group" && (
                        <DropdownPanel>
                            {navigationGroups.map((g) => (
                                <DropdownItem key={g.href} href={g.href} isCurrent={g.href === groupMatch.href}>
                                    {getGroupLabel(g.href)}
                                </DropdownItem>
                            ))}
                        </DropdownPanel>
                    )}
                </div>

                {/* Secondary navigation shortcut */}
                <span className="shrink-0 text-outline">/</span>
                <div className="relative flex items-center gap-0.5">
                    <span className="shrink-0 type-label-l text-on-surface-variant">…</span>
                    <ExpandButton
                        open={openDropdown === "item"}
                        onClick={() => toggleDropdown("item")}
                        ariaLabel={t("layout.breadcrumb.expandItems")}
                    />
                    {openDropdown === "item" && (
                        <DropdownPanel>
                            {groupMatch.items.map((navItem) => (
                                <DropdownItem key={navItem.href} href={navItem.href} isCurrent={false}>
                                    {getItemLabel(navItem.href)}
                                </DropdownItem>
                            ))}
                        </DropdownPanel>
                    )}
                </div>
            </div>
        );
    }

    // Concrete navigation item page.
    const match = findNavMatch(pathname);
    if (!match) return null;

    const { group, item } = match;
    const isDetailPage = norm !== item.href;
    const detail = detailNode || detailName;

    return (
        <div ref={dropdownRef} className="flex items-center gap-1.5 min-w-0">
            {/* First level: group label with dropdown. */}
            <span className="shrink-0 text-outline">/</span>
            <div className="relative flex items-center gap-0.5">
                    <Link
                        href={group.href}
                        className="shrink-0 rounded-full px-1 type-label-l text-on-surface-variant transition-colors hover:text-primary"
                    >
                        {getGroupLabel(group.href)}
                    </Link>
                    <ExpandButton
                        open={openDropdown === "group"}
                        onClick={() => toggleDropdown("group")}
                        ariaLabel={t("layout.breadcrumb.expandGroup")}
                    />

                {openDropdown === "group" && (
                    <DropdownPanel>
                            {navigationGroups.map((g) => (
                            <DropdownItem key={g.href} href={g.href} isCurrent={g.href === group.href}>
                                {getGroupLabel(g.href)}
                            </DropdownItem>
                        ))}

                    </DropdownPanel>
                )}
            </div>

            {/* Second level: item label with dropdown. */}
            <span className="shrink-0 text-outline">/</span>
            <div className="relative flex items-center gap-0.5">
                {isDetailPage ? (
                    <Link
                        href={item.href}
                        className="shrink-0 rounded-full px-1 type-label-l text-on-surface-variant transition-colors hover:text-primary"
                    >
                        {getItemLabel(item.href)}
                    </Link>
                ) : (
                    <span className="shrink-0 type-label-l text-on-surface">
                        {getItemLabel(item.href)}
                    </span>
                )}
                <ExpandButton
                    open={openDropdown === "item"}
                    onClick={() => toggleDropdown("item")}
                    ariaLabel={t("layout.breadcrumb.expandItems")}
                />
                {openDropdown === "item" && (
                    <DropdownPanel>
                        {group.items.map((navItem) => (
                            <DropdownItem key={navItem.href} href={navItem.href} isCurrent={navItem.href === item.href}>
                                {getItemLabel(navItem.href)}
                            </DropdownItem>
                        ))}
                    </DropdownPanel>
                )}
            </div>

            {/* Third level: detail label without dropdown. */}
            {isDetailPage && detail && (
                <>
                    <span className="shrink-0 text-outline">/</span>
                    <span className="inline-block max-w-[120px] truncate align-middle type-label-l text-on-surface sm:max-w-[200px]">
                        {detail}
                    </span>
                </>
            )}
        </div>
    );
}
