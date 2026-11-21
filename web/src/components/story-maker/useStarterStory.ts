"use client";
import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { createStarterStoryDocument } from "@/lib/storyMaker/starter";
import type { StoryDocument, StoryRegion } from "@/types/storyMaker";

/** Builds a localized `moesekai-story/2` starter demo graph ready to edit or play. */
export function useStarterStory() {
    const { t } = useI18n();
    return useCallback((region: StoryRegion): StoryDocument => {
        const labelPractice = t("page.storyMaker.starter.labelPractice");
        const labelTea = t("page.storyMaker.starter.labelTea");
        const labelEnding = t("page.storyMaker.starter.labelEnding");
        const narrationEnding = t("page.storyMaker.starter.narrationEnding");
        const telopEnding = t("page.storyMaker.starter.telopEnding");
        const endLabel = t("page.storyMaker.v2.nodeTypes.end");

        return createStarterStoryDocument(region, {
            title: t("page.storyMaker.starter.title"),
            summary: t("page.storyMaker.starter.summary"),
            author: t("page.storyMaker.starter.author"),
            ichikaName: getCharacterName(t, 1),
            sakiName: getCharacterName(t, 2),
            placeOpening: t("page.storyMaker.starter.placeOpening"),
            telopOpening: t("page.storyMaker.starter.telopOpening"),
            lineIchikaGreeting: t("page.storyMaker.starter.lineIchikaGreeting"),
            lineSakiReply: t("page.storyMaker.starter.lineSakiReply"),
            choicePractice: t("page.storyMaker.starter.choicePractice"),
            choiceTea: t("page.storyMaker.starter.choiceTea"),
            labelPractice,
            linePractice: t("page.storyMaker.starter.linePractice"),
            labelTea,
            lineTea: t("page.storyMaker.starter.lineTea"),
            labelEnding,
            narrationEnding,
            telopEnding,
            varAffectionName: t("page.storyMaker.v2.variables.typeNumber"),
            sceneOpeningTitle: t("page.storyMaker.starter.telopOpening"),
            choiceTitle: t("page.storyMaker.v2.nodeTypes.choice"),
            conditionTitle: t("page.storyMaker.v2.nodeTypes.condition"),
            ruleAffectionLabel: labelPractice,
            endingPracticeTitle: `${labelPractice} · ${endLabel}`,
            endingPracticeSubtitle: `${narrationEnding} ({{affection}})`,
            endingCafeTitle: `${labelTea} · ${endLabel}`,
            endingCafeSubtitle: `${telopEnding} ({{affection}})`,
        });
    }, [t]);
}
