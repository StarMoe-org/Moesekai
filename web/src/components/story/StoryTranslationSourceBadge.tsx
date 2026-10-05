"use client";
import { useI18n } from "@/contexts/I18nContext";
import { storyTranslationSourceLabelKey } from "@/lib/eventStoryTranslation";
import type { StoryTranslationSource } from "@/types/story";

/** MD3 tonal tag: official = tertiary, human = primary, machine = neutral. */
function badgeClassName(source: StoryTranslationSource): string {
    if (source === "official_cn" || source === "official_en") {
        return "bg-tertiary-container text-on-tertiary-container";
    }
    if (source === "human") {
        return "bg-primary-container text-on-primary-container";
    }
    return "bg-surface-container-highest text-on-surface-variant";
}

export function StoryTranslationSourceBadge({ source }: { source: StoryTranslationSource }) {
    const { t } = useI18n();
    return (
        <span className={`inline-flex h-6 items-center rounded-md3-sm px-2 type-label-s ${badgeClassName(source)}`}>
            {t(storyTranslationSourceLabelKey(source))}
        </span>
    );
}
