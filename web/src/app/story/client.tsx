"use client";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { STORY_TYPES } from "@/lib/storyTypes";
import { Card, Icon, PageContainer, PageHeader } from "@/components/md3";
import { mdChevronRight } from "@/components/md3/icons";

export default function StoryIndexClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <PageContainer>
                <PageHeader
                    align="center"
                    eyebrow={t("page.story.badge")}
                    title={t("page.story.title")}
                    highlight={t("page.story.titleHighlight")}
                    description={t("page.story.description")}
                />

                <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {STORY_TYPES.map((storyType) => (
                        <Card key={storyType.href} href={storyType.href} variant="filled" radius="lg" className="group">
                            <div className="flex items-start gap-4 p-5">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md3-lg bg-primary-container text-on-primary-container">
                                    <Icon path={storyType.icon} size={28} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className="type-title-m text-on-surface transition-colors group-hover:text-primary">
                                        {t(storyType.nameKey)}
                                    </h2>
                                    <p className="mt-1 type-body-m text-on-surface-variant">{t(storyType.descKey)}</p>
                                </div>
                                <Icon path={mdChevronRight} className="shrink-0 self-center text-on-surface-variant" />
                            </div>
                        </Card>
                    ))}
                </div>
            </PageContainer>
        </MainLayout>
    );
}
