"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import { isKeyboardEventComposing } from "@/lib/shortcuts";

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
            className="w-full ios-glass-input material-thin px-3.5 py-2.5 pr-10 rounded-xl text-sm type-body text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />
    );
}

export function getFilterChipStateClasses(
    selected: boolean,
    selectedClassName?: string,
    unselectedClassName?: string
) {
    const selectedState = selectedClassName ?? "island-chip island-chip-active";
    const unselectedState = unselectedClassName ?? "island-chip island-chip-hover hover:text-miku";

    return selected ? selectedState : unselectedState;
}

export function getFilterIconStateClasses(
    selected: boolean,
    selectedClassName?: string,
    unselectedClassName?: string
) {
    const selectedState = selectedClassName ?? "island-chip island-chip-active ring-2 ring-miku/30 scale-[1.03]";
    const unselectedState = unselectedClassName ?? "island-chip island-chip-hover";

    return selected ? selectedState : unselectedState;
}

export function getFilterToggleStateClasses(selected: boolean) {
    return selected
        ? "island-pill-active"
        : "island-pill-hover text-slate-600 dark:text-slate-400 hover:text-miku";
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
    const filterControls = (
        <div className={compact ? "space-y-3 workspace-compact-filters" : "space-y-4"}>
            {/* Filter item count summary if provided */}
            {totalCount > 0 && (
                <div className="flex items-center justify-between text-xs type-caption text-slate-500 dark:text-slate-400 px-0.5">
                    <span>
                        {filteredCount === totalCount
                            ? `${totalCount}${countUnit ? ` ${countUnit}` : ""}`
                            : `${filteredCount} / ${totalCount}${countUnit ? ` ${countUnit}` : ""}`}
                    </span>
                    {hasActiveFilters && onReset && (
                        <button
                            type="button"
                            onClick={onReset}
                            className="pressable text-xs font-semibold text-miku hover:underline cursor-pointer"
                        >
                            {t("common.filter.reset")}
                        </button>
                    )}
                </div>
            )}

            {/* Search */}
            {showSearch && onSearchChange && (
                <div>
                    <label className={compact ? "sr-only" : "block text-xs font-bold type-caption text-slate-600 dark:text-slate-350 uppercase tracking-wider mb-1.5"}>
                        {t("common.filter.search")}
                    </label>
                    <div className="relative">
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
                                className={`pressable absolute right-9 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center border transition-colors ${
                                    showSearchHelp
                                        ? "bg-miku text-white border-miku"
                                        : "text-slate-400 border-slate-200 hover:text-miku hover:border-miku/40 dark:border-slate-600"
                                }`}
                            >
                                ?
                            </button>
                        )}
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
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
                    <label className="block text-xs font-bold type-caption text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                        {t("common.filter.sort")}
                    </label>
                    <div className={`grid gap-2 ${sortOptions.length <= 2 ? "grid-cols-2" : sortOptions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                        {sortOptions.map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => handleSortClick(opt.id)}
                                className={`pressable px-2 py-2 flex items-center justify-center gap-1 ${getFilterChipStateClasses(sortBy === opt.id)}`}
                            >
                                {opt.label}
                                {sortBy === opt.id && (
                                    <svg className={`w-3 h-3 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] ${sortOrder === "asc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                )}
                            </button>
                        ))}
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
                    className="pressable w-full py-2.5 border border-slate-200 dark:border-slate-700 rounded-full text-sm text-slate-600 dark:text-slate-300 font-medium material-thin hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
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
        <div data-shortcut-filters="true" className="ios-glass-card material-regular rounded-3xl overflow-hidden">
            {/* Header — clickable on mobile to toggle collapse */}
            <div
                className="px-5 py-4 border-b border-dashed border-slate-200/60 dark:border-slate-700/40 bg-gradient-to-r from-miku/10 to-transparent dark:from-miku/15 dark:to-slate-900/10 flex items-center justify-between lg:cursor-default cursor-pointer select-none"
                onClick={toggleCollapsed}
            >
                <h2 className="type-title font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    {resolvedTitle}
                    {hasActiveFilters && mobileCollapsed && (
                        <span className="lg:hidden w-2 h-2 rounded-full bg-miku animate-pulse" />
                    )}
                </h2>
                <div className="flex items-center gap-2">
                    <span className="text-xs type-caption text-slate-500 dark:text-slate-400">
                        {filteredCount === totalCount
                            ? `${totalCount}${countUnit ? ` ${countUnit}` : ""}`
                            : `${filteredCount} / ${totalCount}`}
                    </span>
                    <svg
                        className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] lg:hidden ${mobileCollapsed ? "" : "rotate-180"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            {/* Collapsible section */}
            <div data-filter-collapsible="true" className={`${mobileCollapsed ? "hidden" : "block"} lg:!block`}>
                <div className="p-5">
                    {filterControls}
                </div>
            </div>

            {/* "Tap to expand" hint bar — mobile only, shown when collapsed */}
            {mobileCollapsed && (
                <div
                    data-filter-collapse-pad="true"
                    className="lg:hidden flex items-center justify-center gap-1 py-2.5 mt-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 cursor-pointer select-none text-xs text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors"
                    onClick={toggleCollapsed}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    {t("common.filter.expand")}
                </div>
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
            <label className="block text-xs font-bold type-caption text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
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
            onClick={onClick}
            className={`pressable ${getFilterChipStateClasses(selected)} ${className}`}
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

export function FilterToggle({ selected, onClick, label }: FilterToggleProps) {
    return (
        <button
            onClick={onClick}
            className={`pressable w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-transparent ${getFilterToggleStateClasses(selected)}`}
        >
            <span className={`text-sm font-bold type-on-glass ${selected ? "text-[var(--accent-deep)]" : "text-slate-600 dark:text-slate-300"}`}>
                {label}
            </span>
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors duration-[var(--duration-fast)] ${selected ? "bg-miku border-miku shadow-sm shadow-miku/20" : "border-slate-200/60 bg-white/20 dark:border-slate-700 dark:bg-slate-800/40"}`}>
                {selected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                )}
            </div>
        </button>
    );
}
