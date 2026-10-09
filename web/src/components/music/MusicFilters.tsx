"use client";
import React from "react";
import Image from "next/image";
import BaseFilters, { FilterSection, FilterToggle, getFilterChipStateClasses, getFilterIconStateClasses } from "@/components/common/BaseFilters";
import {
    MusicTagType,
    MusicCategoryType,
    MUSIC_TAG_IDS,
    MUSIC_CATEGORY_IDS,
    MUSIC_TAG_LABEL_KEYS,
    MUSIC_CATEGORY_LABEL_KEYS,
    MUSIC_CATEGORY_COLORS,
    difficultyFillStyle,
} from "@/types/music";
import { useI18n } from "@/contexts/I18nContext";
import { RangeSlider } from "@/components/md3";

export type MusicLevelRange = [number, number];
export const MUSIC_DIFFICULTIES = ["easy", "normal", "hard", "expert", "master", "append"];

export function parseMusicLevelRange(value: unknown): MusicLevelRange | null {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [min, max] = value;
    return typeof min === "number" && typeof max === "number"
        && Number.isSafeInteger(min) && Number.isSafeInteger(max)
        && min >= 1 && max <= 100 && min <= max ? [min, max] : null;
}

export function parseMusicLevelParams(params: { get: (key: string) => string | null }): MusicLevelRange | null {
    const min = params.get("difficultyMin");
    const max = params.get("difficultyMax");
    if (min === null && max === null) return null;
    if ((min !== null && !/^\d+$/.test(min)) || (max !== null && !/^\d+$/.test(max))) return null;
    return parseMusicLevelRange([min === null ? 1 : Number(min), max === null ? 100 : Number(max)]);
}

export interface MusicLevelChart { musicId: number; musicDifficulty: string; playLevel: number }

export function parseMusicDifficulties(value: unknown): string[] {
    const items = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
    return MUSIC_DIFFICULTIES.filter((difficulty) => items.includes(difficulty));
}

export function useMusicLevelFilter(charts: MusicLevelChart[], initialDifficulties: string[] = [], initialRange: MusicLevelRange | null = null) {
    const [difficulties, setDifficulties] = React.useState(initialDifficulties);
    const [range, setRange] = React.useState<MusicLevelRange | null>(initialRange);
    const levels = React.useMemo(() => charts.filter((chart) =>
        (!difficulties.length || difficulties.includes(chart.musicDifficulty))
        && MUSIC_DIFFICULTIES.includes(chart.musicDifficulty)
        && Number.isSafeInteger(chart.playLevel) && chart.playLevel > 0), [charts, difficulties]);
    const bounds = React.useMemo<MusicLevelRange>(() => {
        const values = levels.map((chart) => chart.playLevel);
        const min = values.length ? Math.min(...values) : 1;
        const max = values.length ? Math.max(...values) : 40;
        return range ? [Math.min(min, range[0]), Math.max(max, range[1])] : [min, max];
    }, [levels, range]);
    const matchingIds = React.useMemo(() => new Set(levels.filter((chart) =>
        !range || (chart.playLevel >= range[0] && chart.playLevel <= range[1])).map((chart) => chart.musicId)), [levels, range]);
    const matches = React.useCallback((id: number) =>
        (!range && !difficulties.length) || matchingIds.has(id), [range, difficulties.length, matchingIds]);
    return { difficulties, range, bounds, matches, setRange, setDifficulties,
        changeDifficulties: (value: string[]) => { setDifficulties(value); },
        reset: () => { setDifficulties([]); setRange(null); } };
}

interface MusicFiltersProps {
    // Context labels
    title?: string;
    countUnit?: string;
    searchPlaceholder?: string;
    // Tag filter
    selectedTag: MusicTagType;
    onTagChange: (tag: MusicTagType) => void;
    // Category filter
    selectedCategories: MusicCategoryType[];
    onCategoryChange: (categories: MusicCategoryType[]) => void;
    // Event filter
    hasEventOnly: boolean;
    onHasEventOnlyChange: (checked: boolean) => void;
    // Search
    searchQuery: string;
    onSearchChange: (query: string) => void;
    // Difficulty filter
    selectedDifficulty?: string;
    onDifficultyChange?: (difficulty: string) => void;
    selectedDifficulties?: string[];
    onDifficultiesChange?: (difficulties: string[]) => void;
    difficultyRange?: [number, number] | null;
    difficultyBounds?: [number, number];
    onDifficultyRangeChange?: (range: [number, number]) => void;
    // Show difficulty toggle
    showDifficulty?: boolean;
    onShowDifficultyChange?: (checked: boolean) => void;
    // Show BPM toggle
    showBpm?: boolean;
    onShowBpmChange?: (checked: boolean) => void;
    // Sort
    sortBy: "publishedAt" | "id" | "level" | "constant" | "bpm";
    sortOrder: "asc" | "desc";
    onSortChange: (sortBy: "publishedAt" | "id" | "level" | "constant" | "bpm", sortOrder: "asc" | "desc") => void;
    /** Override default sort options (e.g. to hide level/constant in contexts without difficulty) */
    customSortOptions?: { id: string; label: string }[];
    /** Advanced-search syntax help panel (rendered via the "?" button) */
    searchHelp?: React.ReactNode;
    // Reset
    onReset: () => void;
    // Stats
    totalMusics: number;
    filteredMusics: number;
}

// Unit icon mapping for tags (local icons to match card filters)
const TAG_ICONS: Partial<Record<MusicTagType, string>> = {
    vocaloid: "/data/icon/vs.webp",
    theme_park: "/data/icon/wxs.webp",
    street: "/data/icon/vbs.webp",
    idol: "/data/icon/mmj.webp",
    school_refusal: "/data/icon/n25.webp",
    light_music_club: "/data/icon/ln.webp",
};

const SORT_OPTIONS_BASE = [
    { id: "publishedAt", labelKey: "common.filter.sortByPublishedAt" },
    { id: "id", labelKey: "common.filter.sortById" },
    { id: "level", labelKey: "common.filter.sortByLevel" },
    { id: "constant", labelKey: "common.filter.sortByConstant" },
    { id: "bpm", labelKey: "common.filter.sortByBpm" },
];

const DIFFICULTY_OPTIONS = [
    { id: "easy", label: "EASY" },
    { id: "normal", label: "NORMAL" },
    { id: "hard", label: "HARD" },
    { id: "expert", label: "EXPERT" },
    { id: "master", label: "MASTER" },
    { id: "append", label: "APPEND" },
];

export default function MusicFilters({
    title,
    countUnit,
    searchPlaceholder,
    selectedTag,
    onTagChange,
    selectedCategories,
    onCategoryChange,
    hasEventOnly,
    onHasEventOnlyChange,
    searchQuery,
    onSearchChange,
    selectedDifficulty,
    onDifficultyChange,
    selectedDifficulties,
    onDifficultiesChange,
    difficultyRange: selectedRange,
    difficultyBounds,
    onDifficultyRangeChange,
    showDifficulty,
    onShowDifficultyChange,
    showBpm,
    onShowBpmChange,
    sortBy,
    sortOrder,
    onSortChange,
    customSortOptions,
    searchHelp,
    onReset,
    totalMusics,
    filteredMusics,
}: MusicFiltersProps) {
    const { t } = useI18n();
    const difficultyRange = selectedRange ?? difficultyBounds;

    const SORT_OPTIONS = SORT_OPTIONS_BASE.map(opt => ({
        id: opt.id,
        label: t(opt.labelKey),
    }));

    const toggleCategory = (cat: MusicCategoryType) => {
        if (selectedCategories.includes(cat)) {
            onCategoryChange(selectedCategories.filter((c) => c !== cat));
        } else {
            onCategoryChange([...selectedCategories, cat]);
        }
    };

    const hasActiveFilters =
        selectedTag !== "all" ||
        selectedCategories.length > 0 ||
        hasEventOnly ||
        searchQuery.trim() !== "" ||
        !!selectedRange || !!selectedDifficulties?.length;

    return (
        <BaseFilters
            title={title}
            filteredCount={filteredMusics}
            totalCount={totalMusics}
            countUnit={countUnit ?? t("page.music.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder ?? t("page.music.searchPlaceholder")}
            searchHelp={searchHelp}
            sortOptions={customSortOptions || SORT_OPTIONS}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(id, order) => onSortChange(id as "publishedAt" | "id" | "level" | "constant" | "bpm", order)}
            hasActiveFilters={hasActiveFilters}
            onReset={onReset}
        >
            {/* Tag Filter */}
            <FilterSection label={t("common.filter.musicTag")}>
                <div className="flex flex-wrap items-center gap-2">
                    {MUSIC_TAG_IDS.map((tag) => {
                        const isSelected = selectedTag === tag;
                        const icon = TAG_ICONS[tag];
                        const label = t(MUSIC_TAG_LABEL_KEYS[tag]);

                        // Unit tags: icon-only button (like card filters), no redundant text
                        if (icon) {
                            return (
                                <button
                                    key={tag}
                                    onClick={() => onTagChange(tag)}
                                    className={`!p-1.5 ${getFilterIconStateClasses(isSelected)}`}
                                    title={label}
                                    aria-label={label}
                                    aria-pressed={isSelected}
                                >
                                    <div className="w-7 h-7 relative">
                                        <Image
                                            src={icon}
                                            alt={label}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                </button>
                            );
                        }

                        // Text-only tags (all, other, ...)
                        return (
                            <button
                                key={tag}
                                onClick={() => onTagChange(tag)}
                                className={getFilterChipStateClasses(isSelected)}
                                title={label}
                                aria-pressed={isSelected}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </FilterSection>

            {/* Category Filter */}
            <FilterSection label={t("common.filter.mvType")}>
                <div className="flex flex-wrap gap-2">
                    {MUSIC_CATEGORY_IDS.map((cat) => {
                        const isSelected = selectedCategories.includes(cat);
                        const label = t(MUSIC_CATEGORY_LABEL_KEYS[cat]);
                        return (
                            <button
                                key={cat}
                                onClick={() => toggleCategory(cat)}
                                className={isSelected
                                    ? `${getFilterChipStateClasses(true)} !text-white`
                                    : getFilterChipStateClasses(false)
                                    }
                                style={
                                    isSelected
                                        ? { backgroundColor: MUSIC_CATEGORY_COLORS[cat] }
                                        : {}
                                }
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </FilterSection>

            {/* Difficulty Filter - Only show when sorting by level */}
            {((selectedDifficulties && onDifficultiesChange) || (selectedDifficulty && onDifficultyChange)) && (
                <FilterSection label={t("common.filter.difficulty")}>
                    <div className="grid grid-cols-2 gap-2">
                        {DIFFICULTY_OPTIONS.map((diff) => {
                            const isSelected = selectedDifficulties ? selectedDifficulties.includes(diff.id) : selectedDifficulty === diff.id;
                            return (
                                <button
                                    key={diff.id}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => {
                                        if (selectedDifficulties && onDifficultiesChange) {
                                            const next = isSelected ? selectedDifficulties.filter((item) => item !== diff.id) : [...selectedDifficulties, diff.id];
                                            onDifficultiesChange(next);
                                        } else onDifficultyChange?.(diff.id);
                                    }}
                                    className={getFilterChipStateClasses(isSelected)}
                                    style={isSelected ? difficultyFillStyle(diff.id) : undefined}
                                >
                                    {diff.label}
                                </button>
                            );
                        })}
                    </div>
                    {selectedDifficulties && <p className="mt-2 type-body-s text-on-surface-variant">{t("common.filter.difficultiesHint")}</p>}
                    {difficultyRange && difficultyBounds && onDifficultyRangeChange && (
                        <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between gap-2 type-label-m text-on-surface-variant">
                                <span>{t("common.filter.difficultyRange")}</span>
                                <span className="tabular-nums text-on-surface">{difficultyRange[0]}–{difficultyRange[1]}</span>
                            </div>
                            <RangeSlider
                                value={difficultyRange}
                                min={difficultyBounds[0]}
                                max={difficultyBounds[1]}
                                onValueChange={onDifficultyRangeChange}
                                lowerLabel={t("common.filter.minimum")}
                                upperLabel={t("common.filter.maximum")}
                            />
                        </div>
                    )}
                </FilterSection>
            )}

            {selectedDifficulties && selectedDifficulty && onDifficultyChange && (
                <FilterSection label={t("common.filter.sortDifficulty")}>
                    <div className="flex flex-wrap gap-2">
                        {DIFFICULTY_OPTIONS.map((diff) => (
                            <button key={diff.id} type="button" aria-pressed={selectedDifficulty === diff.id}
                                className={getFilterChipStateClasses(selectedDifficulty === diff.id)}
                                style={selectedDifficulty === diff.id ? difficultyFillStyle(diff.id) : undefined}
                                onClick={() => onDifficultyChange(diff.id)}>{diff.label}</button>
                        ))}
                    </div>
                </FilterSection>
            )}
            {/* Other Filters */}
            <FilterSection label={t("common.filter.otherFilters")}>
                <div>
                    <FilterToggle
                        selected={hasEventOnly}
                        onClick={() => onHasEventOnlyChange(!hasEventOnly)}
                        label={t("common.filter.eventSongsOnly")}
                    />
                    {onShowDifficultyChange && (
                        <FilterToggle
                            selected={!!showDifficulty}
                            onClick={() => onShowDifficultyChange(!showDifficulty)}
                            label={t("common.filter.showDifficulty")}
                        />
                    )}
                    {onShowBpmChange && (
                        <FilterToggle
                            selected={!!showBpm}
                            onClick={() => onShowBpmChange(!showBpm)}
                            label={t("common.filter.showBpm")}
                        />
                    )}
                </div>
            </FilterSection>
        </BaseFilters>
    );
}
