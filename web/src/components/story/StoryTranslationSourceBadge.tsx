"use client";
import { useI18n } from "@/contexts/I18nContext";
import { storyTranslationSourceLabelKey } from "@/lib/eventStoryTranslation";
import type { StoryTranslationSource } from "@/types/story";

function badgeClassName(source: StoryTranslationSource): string {
    if (source === "official_cn" || source === "official_en") {
        return "bg-amber-100/50 text-amber-800 border-amber-200/20 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700/30";
    }
    if (source === "human") {
        return "bg-emerald-100/50 text-emerald-800 border-emerald-200/20 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700/30";
    }
    return "bg-slate-100/50 text-slate-600 border-slate-200/20 dark:bg-slate-800/20 dark:text-slate-400 dark:border-slate-700/30";
}

export function StoryTranslationSourceBadge({ source }: { source: StoryTranslationSource }) {
    const { t } = useI18n();
    return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badgeClassName(source)}`}>
            {t(storyTranslationSourceLabelKey(source))}
        </span>
    );
}
