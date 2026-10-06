"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import { isKeyboardEventComposing } from "@/lib/shortcuts";
import { Icon } from "@/components/md3/Icon";
import { cn } from "@/components/md3/cn";
import { mdCheck, mdFilterList, mdKeyboardArrowDown, mdRestartAlt, mdSearch, mdArrowDownward } from "@/components/md3/icons";

// ============================================================================
// Types
// ============================================================================

export interface SortOption {
    id: string;
    label: string;
}

export interface BaseFiltersProps {
    /** Visual style variant: "card" (standalone panel with own header/card) or "plain" (flat content for drawer/modal, default: "plain") */
    variant?: "card" | "plain";
    /** Title shown in the header (default: t("common.filter.title")) */
    title?: string;
    /** Count display format: "filtered / total" or just "total" */
    filteredCount: number;
    totalCount: number;
    /** Unit name for count display (e.g., cards, songs, items) */
    countUnit?: string;

    /** Compact inline layout: one reset action and visually hidden search label. */
    compact?: boolean;

    // Search
    /** Search query value */
    searchQuery?: string;
    /** Search change handler */
    onSearchChange?: (query: string) => void;
    /** Placeholder text for search input */
    searchPlaceholder?: string;
    /** Whether to show search box (default: true if onSearchChange provided) */
    showSearch?: boolean;
    /** Optional advanced-search syntax help panel (shown via the "?" button next to the input) */
    searchHelp?: React.ReactNode;

    // Sort
    /** Available sort options */
    sortOptions?: SortOption[];
    /** Current sort field */
    sortBy?: string;
    /** Current sort order */
    sortOrder?: "asc" | "desc";
    /** Sort change handler */
    onSortChange?: (sortBy: string, sortOrder: "asc" | "desc") => void;

    // Reset
    /** Whether to show reset button */
    hasActiveFilters?: boolean;
    /** Reset handler */
    onReset?: () => void;

    // Children (custom filter sections)
    children?: React.ReactNode;
}

// ============================================================================
// Shared filter styles
// ============================================================================

interface FilterSearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

function FilterSearchInput({ value, onChange, placeholder }: FilterSearchInputProps) {
    const [localValue, setLocalValue] = useState(value);
    const [prevValue, setPrevValue] = useState(value);
    const isComposingRef = useRef(false);

    if (value !== prevValue) {
        setPrevValue(value);
        setLocalValue(value);
    }

    const handleCompositionStart = useCallback(() => {
        isComposingRef.current = true;
    }, []);

    const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
        isComposingRef.current = false;
        const nextValue = e.currentTarget.value;
        setLocalValue(nextValue);
        onChange(nextValue);
    }, [onChange]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = e.target.value;
        setLocalValue(nextValue);
        if (!isComposingRef.current) {
            onChange(nextValue);
        }
    }, [onChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (
            isComposingRef.current ||
            isKeyboardEventComposing(e.nativeEvent) ||
            e.nativeEvent.isComposing ||
            e.key === "Process" ||
            (e as unknown as { keyCode?: number }).keyCode === 229
        ) {
            e.stopPropagation();
            return;
        }
        if (e.key === "Escape") {
            if (localValue) {
                e.preventDefault();
                e.stopPropagation();
                setLocalValue("");
                onChange("");
            }
        }
    }, [localValue, onChange]);

    return (
        <input
            data-shortcut-search="true"
            type="text"
            placeholder={placeholder}
            value={localValue}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={handleKeyDown}
            className="h-12 w-full rounded-full bg-surface-container-highest pl-12 pr-12 type-body-l text-on-surface placeholder:text-on-surface-variant caret-primary outline-none transition-shadow duration-150 focus:shadow-[inset_0_0_0_2px_var(--md-sys-color-primary)]"
        />
    );
}

/** MD3 filter chip state classes (shared by filter panels across pages). */
const MD3_CHIP_BASE =
    "state-layer focus-ring relative inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md3-sm border px-3 py-1.5 type-label-l cursor-pointer transition-colors duration-150 ease-md3-standard";
const MD3_CHIP_SELECTED = `${MD3_CHIP_BASE} border-transparent bg-secondary-container text-on-secondary-container`;
const MD3_CHIP_UNSELECTED = `${MD3_CHIP_BASE} border-outline-variant bg-transparent text-on-surface-variant`;

export function getFilterChipStateClasses(
    selected: boolean,
    selectedClassName?: string,
    unselectedClassName?: string
) {
    const selectedState = selectedClassName ?? MD3_CHIP_SELECTED;
    const unselectedState = unselectedClassName ?? MD3_CHIP_UNSELECTED;

    return selected ? selectedState : unselectedState;
}

export function getFilterIconStateClasses(
    selected: boolean,
    selectedClassName?: string,
    unselectedClassName?: string
) {
    const selectedState = selectedClassName ?? cn(MD3_CHIP_SELECTED, "ring-2 ring-primary ring-offset-1 ring-offset-surface");
    const unselectedState = unselectedClassName ?? MD3_CHIP_UNSELECTED;

    return selected ? selectedState : unselectedState;
}

export function getFilterToggleStateClasses(selected: boolean) {
    return selected
        ? "bg-secondary-container text-on-secondary-container"
        : "text-on-surface-variant";
}

export const FilterDrawerContext = React.createContext<boolean>(false);

// ============================================================================
// Component
// ============================================================================

export default function BaseFilters({
    variant,
    compact = false,
    title,
    filteredCount,
    totalCount,
    countUnit = "",
    searchQuery = "",
    onSearchChange,
    searchPlaceholder,
    showSearch = true,
    searchHelp,
    sortOptions,
    sortBy,
    sortOrder,
    onSortChange,
    hasActiveFilters = false,
    onReset,
    children,
}: BaseFiltersProps) {
    const isInsideDrawer = React.useContext(FilterDrawerContext);
    const resolvedVariant = variant ?? (isInsideDrawer ? "plain" : "card");
    const { t } = useI18n();
    const resolvedTitle = title ?? t("common.filter.title");
    const resolvedSearchPlaceholder = searchPlaceholder ?? t("common.filter.search") + "...";
    const pathname = usePathname();
    const STORAGE_KEY = `filters_collapsed:${pathname}`;
    const [mobileCollapsed, setMobileCollapsed] = useState(true);
    const [showSearchHelp, setShowSearchHelp] = useState(false);

    useEffect(() => {
        if (resolvedVariant !== "card") return;
        const frameId = window.requestAnimationFrame(() => {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                setMobileCollapsed(saved === null ? true : saved === "true");
            } catch {
                setMobileCollapsed(true);
            }
        });

        return () => window.cancelAnimationFrame(frameId);
    }, [STORAGE_KEY, resolvedVariant]);

    const toggleCollapsed = () => {
        setMobileCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
            return next;
        });
    };

    const handleSortClick = (optionId: string) => {
        if (!onSortChange) return;
        const newOrder = sortBy === optionId && sortOrder === "desc" ? "asc" : "desc";
        onSortChange(optionId, newOrder);
    };

    // Shared filter inner content (Search, Sort, Custom sections, Reset)
    const countText = filteredCount === totalCount
        ? `${totalCount}${countUnit ? ` ${countUnit}` : ""}`
        : `${filteredCount} / ${totalCount}${countUnit ? ` ${countUnit}` : ""}`;

    const filterControls = (
        <div className={compact ? "space-y-3 workspace-compact-filters" : "space-y-5"}>
            {/* Filter item count summary if provided */}
            {totalCount > 0 && (
                <div className="flex min-h-8 items-center justify-between px-0.5 type-label-l text-on-surface-variant">
                    <span>{countText}</span>
                    {hasActiveFilters && onReset && (
                        <button
                            type="button"
                            onClick={onReset}
                            className="state-layer focus-ring -mr-2 h-8 cursor-pointer rounded-full px-3 type-label-l text-primary"
                        >
                            {t("common.filter.reset")}
                        </button>
                    )}
                </div>
            )}

            {/* Search */}
            {showSearch && onSearchChange && (
                <div>
                    <label className={compact ? "sr-only" : "mb-2 block px-1 type-title-s text-on-surface"}>
                        {t("common.filter.search")}
                    </label>
                    <div className="relative">
                        <Icon path={mdSearch} size={24} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                        <FilterSearchInput
                            placeholder={resolvedSearchPlaceholder}
                            value={searchQuery ?? ""}
                            onChange={onSearchChange}
                        />
                        {searchHelp && (
                            <button
                                type="button"
                                onClick={() => setShowSearchHelp(v => !v)}
                                aria-label={t("search.syntax.title")}
                                aria-expanded={showSearchHelp}
                                className={cn(
                                    "state-layer focus-ring absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full type-label-l",
                                    showSearchHelp ? "bg-primary text-on-primary" : "text-on-surface-variant",
                                )}
                            >
                                ?
                            </button>
                        )}
                    </div>
                    {showSearchHelp && searchHelp && (
                        <div data-search-help="true" className="mt-2">
                            {searchHelp}
                        </div>
                    )}
                </div>
            )}

            {/* Sort Options */}
            {sortOptions && sortOptions.length > 0 && onSortChange && (
                <div>
                    <label className="mb-2 block px-1 type-title-s text-on-surface">
                        {t("common.filter.sort")}
                    </label>
                    <div className={`grid gap-2 ${sortOptions.length <= 2 ? "grid-cols-2" : sortOptions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                        {sortOptions.map((opt) => {
                            const active = sortBy === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => handleSortClick(opt.id)}
                                    className={getFilterChipStateClasses(active)}
                                >
                                    {active && (
                                        <Icon
                                            path={mdArrowDownward}
                                            size={18}
                                            className={cn("transition-transform duration-200 ease-md3-spatial-fast", sortOrder === "asc" && "rotate-180")}
                                        />
                                    )}
                                    <span className="truncate">{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Custom Filter Sections */}
            {children}

            {/* Reset Button */}
            {!compact && hasActiveFilters && onReset && (
                <button
                    type="button"
                    onClick={onReset}
                    className="state-layer focus-ring flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-outline-variant type-label-l text-on-surface-variant"
                >
                    <Icon path={mdRestartAlt} size={18} />
                    {t("common.filter.reset")}
                </button>
            )}
        </div>
    );

    // 1. Plain flat variant (Used seamlessly inside FilterDrawer without nested card container)
    if (resolvedVariant === "plain") {
        return (
            <div data-shortcut-filters="true" className="w-full">
                {filterControls}
            </div>
        );
    }

    // 2. Standalone Card variant (For in-page static layouts like Information page)
    return (
        <div data-shortcut-filters="true" className="overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70 text-on-surface">
            {/* Header — clickable on mobile to toggle collapse */}
            <div
                className="flex cursor-pointer select-none items-center justify-between gap-2 px-5 py-4 lg:cursor-default"
                onClick={toggleCollapsed}
            >
                <h2 className="flex items-center gap-2 type-title-m text-on-surface">
                    <Icon path={mdFilterList} size={24} className="text-primary" />
                    {resolvedTitle}
                    {hasActiveFilters && mobileCollapsed && (
                        <span className="h-2 w-2 rounded-full bg-primary lg:hidden" />
                    )}
                </h2>
                <div className="flex items-center gap-2">
                    <span className="type-label-m text-on-surface-variant">
                        {filteredCount === totalCount
                            ? `${totalCount}${countUnit ? ` ${countUnit}` : ""}`
                            : `${filteredCount} / ${totalCount}`}
                    </span>
                    <Icon
                        path={mdKeyboardArrowDown}
                        size={24}
                        className={cn("text-on-surface-variant transition-transform duration-200 ease-md3-spatial-fast lg:hidden", !mobileCollapsed && "rotate-180")}
                    />
                </div>
            </div>

            {/* Collapsible section */}
            <div data-filter-collapsible="true" className={`${mobileCollapsed ? "hidden" : "block"} lg:!block`}>
                <div className="px-5 pb-5">
                    {filterControls}
                </div>
            </div>

            {/* "Tap to expand" hint bar — mobile only, shown when collapsed */}
            {mobileCollapsed && (
                <button
                    type="button"
                    data-filter-collapse-pad="true"
                    className="state-layer flex w-full cursor-pointer select-none items-center justify-center gap-1 border-t border-outline-variant py-2.5 type-label-l text-on-surface-variant lg:hidden"
                    onClick={toggleCollapsed}
                >
                    <Icon path={mdKeyboardArrowDown} size={18} />
                    {t("common.filter.expand")}
                </button>
            )}
        </div>
    );
    }

    // ============================================================================
    // Helper Components for custom filter sections
    // ============================================================================

    interface FilterSectionProps {
    label: string;
    children: React.ReactNode;
    }

    export function FilterSection({ label, children }: FilterSectionProps) {
    return (
        <div>
            <label className="mb-2 block px-1 type-title-s text-on-surface">
                {label}
            </label>
            {children}
        </div>
    );
    }

    interface FilterButtonProps {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    }

    export function FilterButton({ selected, onClick, children, className = "", style }: FilterButtonProps) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            className={cn(getFilterChipStateClasses(selected), className)}
            style={style}
        >
            {children}
        </button>
    );
    }

    interface FilterToggleProps {
    selected: boolean;
    onClick: () => void;
    label: string;
    }

    /** MD3 list-item style toggle with a trailing switch. */
    export function FilterToggle({ selected, onClick, label }: FilterToggleProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={selected}
            onClick={onClick}
            className={cn(
                "state-layer focus-ring flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 rounded-md3-lg px-4 py-2 text-left transition-colors duration-150",
                getFilterToggleStateClasses(selected),
            )}
        >
            <span className="type-body-l">{label}</span>
            <span
                aria-hidden
                className={cn(
                    "relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border-2 transition-colors duration-200",
                    selected ? "border-primary bg-primary" : "border-outline bg-surface-container-highest",
                )}
            >
                <span
                    className={cn(
                        "absolute flex items-center justify-center rounded-full transition-all duration-300 ease-md3-spatial-fast",
                        selected ? "left-[22px] h-6 w-6 bg-on-primary text-on-primary-container" : "left-[6px] h-4 w-4 bg-outline",
                    )}
                >
                    {selected && <Icon path={mdCheck} size={16} />}
                </span>
            </span>
        </button>
    );
    }
