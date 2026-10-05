"use client";
import React from "react";
import Image from "next/image";
import BaseFilters, { FilterSection, getFilterChipStateClasses, getFilterIconStateClasses } from "@/components/common/BaseFilters";
import {
    MusicTagType,
    MusicCategoryType,
    MUSIC_TAG_IDS,
    MUSIC_CATEGORY_IDS,
    MUSIC_CATEGORY_COLORS,
} from "@/types/music";
import { useI18n } from "@/contexts/I18nContext";

interface MyMusicFiltersProps {
    // Tag filter
    selectedTag: MusicTagType;
    onTagChange: (tag: MusicTagType) => void;
    // Category filter
    selectedCategories: MusicCategoryType[];
    onCategoryChange: (categories: MusicCategoryType[]) => void;
    // Difficulty filter
    selectedDifficulty: string;
    onDifficultyChange: (difficulty: string) => void;
    // Completion filter
    completionFilter: "all" | "no_fc" | "no_ap";
    onCompletionFilterChange: (filter: "all" | "no_fc" | "no_ap") => void;
    // Search
    searchQuery: string;
    onSearchChange: (query: string) => void;
    // Sort
    sortBy: "publishedAt" | "id" | "level" | "completion" | "constant";
    sortOrder: "asc" | "desc";
    onSortChange: (sortBy: "publishedAt" | "id" | "level" | "completion" | "constant", sortOrder: "asc" | "desc") => void;
    // Reset
    onReset: () => void;
    // Stats
    totalMusics: number;
    filteredMusics: number;
    // User data availability
    hasUserData: boolean;
}

// Unit icon mapping for tags
const TAG_ICONS: Partial<Record<MusicTagType, string>> = {
    vocaloid: "/data/icon/vs.webp",
    theme_park: "/data/icon/wxs.webp",
    street: "/data/icon/vbs.webp",
    idol: "/data/icon/mmj.webp",
    school_refusal: "/data/icon/n25.webp",
    light_music_club: "/data/icon/ln.webp",
};

const DIFFICULTY_OPTIONS = [
    { value: "easy", label: "EASY" },
    { value: "normal", label: "NORMAL" },
    { value: "hard", label: "HARD" },
    { value: "expert", label: "EXPERT" },
    { value: "master", label: "MASTER" },
    { value: "append", label: "APPEND" },
];

const SORT_OPTIONS_BASE = [
    { id: "completion", labelKey: "common.filter.sortByCompletion" },
    { id: "publishedAt", labelKey: "common.filter.sortByPublishedAt" },
    { id: "id", labelKey: "common.filter.sortById" },
    { id: "level", labelKey: "common.filter.sortByLevel" },
    { id: "constant", labelKey: "common.filter.sortByConstant" },
];

export default function MyMusicFilters({
    selectedTag,
    onTagChange,
    selectedCategories,
    onCategoryChange,
    selectedDifficulty,
    onDifficultyChange,
    completionFilter,
    onCompletionFilterChange,
    searchQuery,
    onSearchChange,
    sortBy,
    sortOrder,
    onSortChange,
    onReset,
    totalMusics,
    filteredMusics,
    hasUserData,
}: MyMusicFiltersProps) {
    const { t } = useI18n();
    const SORT_OPTIONS = SORT_OPTIONS_BASE.map((option) => ({
        id: option.id,
        label: t(option.labelKey),
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
        completionFilter !== "all" ||
        searchQuery.trim() !== "";

    return (
        <BaseFilters
            filteredCount={filteredMusics}
            totalCount={totalMusics}
            countUnit={t("page.music.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchPlaceholder={t("page.music.searchPlaceholder")}
            sortOptions={SORT_OPTIONS}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(id, order) => onSortChange(id as "publishedAt" | "id" | "level" | "completion" | "constant", order)}
            hasActiveFilters={hasActiveFilters}
            onReset={onReset}
        >
            {/* Difficulty Selection */}
            <FilterSection label={t("common.filter.difficulty")}>
                <div className="grid grid-cols-3 gap-2">
                    {DIFFICULTY_OPTIONS.map((diff) => {
                        const isSelected = selectedDifficulty === diff.value;
                        return (
                            <button
                                key={diff.value}
                                onClick={() => onDifficultyChange(diff.value)}
                                className={getFilterChipStateClasses(isSelected)}
                            >
                                {diff.label}
                            </button>
                        );
                    })}
                </div>
            </FilterSection>

            {/* Tag Filter */}
            <FilterSection label={t("common.filter.musicTag")}>
                <div className="flex flex-wrap items-center gap-2">
                    {MUSIC_TAG_IDS.map((tag) => {
                        const isSelected = selectedTag === tag;
                        const icon = TAG_ICONS[tag];
                        const label = t(`common.musicTags.${tag}`);

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
                                {t(`common.musicCategories.${cat}`)}
                            </button>
                        );
                    })}
                </div>
            </FilterSection>

            {/* Completion Filter */}
            {hasUserData && (
                <FilterSection label={t("common.filter.completionFilter")}>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => onCompletionFilterChange("all")}
                            className={getFilterChipStateClasses(completionFilter === "all")}
                        >
                            {t("common.progress.all")}
                        </button>
                        <button
                            onClick={() => onCompletionFilterChange("no_fc")}
                            className={getFilterChipStateClasses(completionFilter === "no_fc")}
                        >
                            {t("common.progress.noFc")}
                        </button>
                        <button
                            onClick={() => onCompletionFilterChange("no_ap")}
                            className={getFilterChipStateClasses(completionFilter === "no_ap")}
                        >
                            {t("common.progress.noAp")}
                        </button>
                    </div>
                </FilterSection>
            )}
        </BaseFilters>
    );
}
