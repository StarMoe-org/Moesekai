"use client";
import { useI18n } from "@/contexts/I18nContext";
import { getStoryType, StoryTypeKey } from "@/lib/storyTypes";
import { Button, PageHeader } from "@/components/md3";
import { mdArrowBack } from "@/components/md3/icons";

interface StoryPageHeaderProps {
    storyKey: StoryTypeKey;
}

export function StoryPageHeader({ storyKey }: StoryPageHeaderProps) {
    const { t } = useI18n();
    const storyType = getStoryType(storyKey);

    return (
        <>
            <Button variant="text" icon={mdArrowBack} href="/story" className="-ml-3 mb-4">
                {t("page.story.backToStory")}
            </Button>
            <PageHeader
                align="center"
                eyebrow={t("page.story.badge")}
                title={t(storyType.nameKey)}
                description={t(storyType.descKey)}
            />
        </>
    );
}
