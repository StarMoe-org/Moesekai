"use client";
import React, { useCallback } from "react";
import Link from "@/components/LocalizedLink";
import { usePathname } from "next/navigation";
import { findNavMatch, findGroupMatch, navigationGroups, NAV_GROUP_LABEL_KEYS, NAV_ITEM_LABEL_KEYS } from "@/lib/navigation";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { useI18n } from "@/contexts/I18nContext";
import { stripRouteLocale } from "@/lib/localized-path";
import { Icon, Menu, cn } from "@/components/md3";
import { mdKeyboardArrowDown } from "@/components/md3/icons";

function ExpandButton({
    ref,
    onClick,
    "aria-haspopup": ariaHaspopup,
    "aria-expanded": ariaExpanded,
    "aria-controls": ariaControls,
    ariaLabel,
}: {
    ref?: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
    ariaLabel: string;
}) {
    return (
        <button
            ref={ref}
            type="button"
            onClick={onClick}
            className="state-layer focus-ring flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-on-surface-variant"
            aria-label={ariaLabel}
            aria-haspopup={ariaHaspopup}
            aria-expanded={ariaExpanded}
            aria-controls={ariaControls}
        >
            <Icon path={mdKeyboardArrowDown} size={18} className={cn("transition-transform duration-300 ease-md3-spatial", ariaExpanded && "rotate-180")} />
        </button>
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
            <div className="flex items-center gap-1.5 min-w-0">
                <span className="shrink-0 text-outline">/</span>
                <div className="relative flex items-center gap-0.5">
                    <span className="shrink-0 type-label-l text-on-surface">
                        {getGroupLabel(groupMatch.href)}
                    </span>
                    <Menu
                        items={navigationGroups.map((g) => ({
                            key: g.href,
                            label: getGroupLabel(g.href),
                            href: g.href,
                            ariaCurrent: g.href === groupMatch.href ? "page" : undefined,
                            selected: g.href === groupMatch.href,
                        }))}
                        anchor={(props) => <ExpandButton {...props} ariaLabel={t("layout.breadcrumb.expandGroup")} />}
                    />
                </div>

                {/* Secondary navigation shortcut */}
                <span className="shrink-0 text-outline">/</span>
                <div className="relative flex items-center gap-0.5">
                    <span className="shrink-0 type-label-l text-on-surface-variant">…</span>
                    <Menu
                        items={groupMatch.items.map((navItem) => ({
                            key: navItem.href,
                            label: getItemLabel(navItem.href),
                            href: navItem.href,
                        }))}
                        anchor={(props) => <ExpandButton {...props} ariaLabel={t("layout.breadcrumb.expandItems")} />}
                    />
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
        <div className="flex items-center gap-1.5 min-w-0">
            {/* First level: group label with dropdown. */}
            <span className="shrink-0 text-outline">/</span>
            <div className="relative flex items-center gap-0.5">
                    <Link
                        href={group.href}
                        className="shrink-0 rounded-full px-1 type-label-l text-on-surface-variant transition-colors hover:text-primary"
                    >
                        {getGroupLabel(group.href)}
                    </Link>
                    <Menu
                        items={navigationGroups.map((g) => ({
                            key: g.href,
                            label: getGroupLabel(g.href),
                            href: g.href,
                            ariaCurrent: g.href === group.href ? "page" : undefined,
                            selected: g.href === group.href,
                        }))}
                        anchor={(props) => <ExpandButton {...props} ariaLabel={t("layout.breadcrumb.expandGroup")} />}
                    />
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
                <Menu
                    items={group.items.map((navItem) => ({
                        key: navItem.href,
                        label: getItemLabel(navItem.href),
                        href: navItem.href,
                        ariaCurrent: navItem.href === item.href ? "page" : undefined,
                        selected: navItem.href === item.href,
                    }))}
                    anchor={(props) => <ExpandButton {...props} ariaLabel={t("layout.breadcrumb.expandItems")} />}
                />
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
