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
} from "@/types/music";
import { useI18n } from "@/contexts/I18nContext";

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
    { id: "easy", label: "EASY", color: "from-green-400 to-green-500" },
    { id: "normal", label: "NORMAL", color: "from-blue-400 to-blue-500" },
    { id: "hard", label: "HARD", color: "from-yellow-400 to-yellow-500" },
    { id: "expert", label: "EXPERT", color: "from-red-400 to-red-500" },
    { id: "master", label: "MASTER", color: "from-purple-500 to-purple-600" },
    { id: "append", label: "APPEND", color: "from-pink-500 to-pink-600" },
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
        searchQuery.trim() !== "";

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
            {(sortBy === "level" || sortBy === "constant") && selectedDifficulty && onDifficultyChange && (
                <FilterSection label={t("common.filter.difficulty")}>
                    <div className="grid grid-cols-2 gap-2">
                        {DIFFICULTY_OPTIONS.map((diff) => {
                            const isSelected = selectedDifficulty === diff.id;
                            return (
                                <button
                                    key={diff.id}
                                    onClick={() => onDifficultyChange(diff.id)}
                                    className={isSelected
                                        ? `${getFilterChipStateClasses(true)} !border-transparent bg-gradient-to-r ${diff.color} !text-white`
                                        : getFilterChipStateClasses(false)
                                        }
                                >
                                    {diff.label}
                                </button>
                            );
                        })}
                    </div>
                </FilterSection>
            )}

            {/* Other Filters */}
            <FilterSection label={t("common.filter.otherFilters")}>
                <div className="space-y-2">
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
