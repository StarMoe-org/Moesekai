"use client";
import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { createStarterStoryDocument } from "@/lib/storyMaker/starter";
import type { StoryDocument, StoryRegion } from "@/types/storyMaker";

/** Builds a localized starter demo story document ready to edit or play. */
export function useStarterStory() {
    const { t } = useI18n();
    return useCallback((region: StoryRegion): StoryDocument => createStarterStoryDocument(region, {
        title: t("page.storyMaker.starter.title"),
        summary: t("page.storyMaker.starter.summary"),
        author: t("page.storyMaker.starter.author"),
        ichikaName: getCharacterName(t, 1),
        sakiName: getCharacterName(t, 2),
        telopOpening: t("page.storyMaker.starter.telopOpening"),
        lineIchikaGreeting: t("page.storyMaker.starter.lineIchikaGreeting"),
        lineSakiReply: t("page.storyMaker.starter.lineSakiReply"),
        choicePractice: t("page.storyMaker.starter.choicePractice"),
        choiceTea: t("page.storyMaker.starter.choiceTea"),
        labelPractice: t("page.storyMaker.starter.labelPractice"),
        linePractice: t("page.storyMaker.starter.linePractice"),
        labelTea: t("page.storyMaker.starter.labelTea"),
        lineTea: t("page.storyMaker.starter.lineTea"),
        labelEnding: t("page.storyMaker.starter.labelEnding"),
        narrationEnding: t("page.storyMaker.starter.narrationEnding"),
        telopEnding: t("page.storyMaker.starter.telopEnding"),
    }), [t]);
}
