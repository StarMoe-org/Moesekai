"use client";
import { PageContainer } from "@/components/md3";
import { ServerSourceBadge, StoryBackButton, StoryBadge, StoryEpisodeNav, StoryReaderHeader } from "@/components/story/StoryReaderChrome";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { StoryReader } from "@/components/story/StoryReader";
import { useStoryAsset } from "@/hooks/useStoryAsset";
import { fetchMasterData } from "@/lib/fetch";
import { getEventLogoUrl } from "@/lib/assets";
import { IEventStory } from "@/types/story";
import { IEventInfo } from "@/types/events";
import { useTheme } from "@/contexts/ThemeContext";
import { loadEventStoryTranslation, IEventStoryTranslation } from "@/lib/eventStoryTranslation";
import { loadTranslations } from "@/lib/translations";
import { mergeStoryTitle } from "@/lib/storyLoader";
import { useI18n } from "@/contexts/I18nContext";
import type { UiLocale } from "@/lib/i18n";

export default function StoryEventReaderClient() {
    const params = useParams();
    const { assetSource, serverSource, useLLMTranslation } = useTheme();
    const { locale, t } = useI18n();
    const eventId = parseInt(params.eventId as string);
    const episodeNo = parseInt(params.episodeNo as string);

    const [eventStory, setEventStory] = useState<IEventStory | null>(null);
    const [eventInfo, setEventInfo] = useState<IEventInfo | null>(null);
    const [translationState, setTranslationState] = useState<{
        eventId: number;
        episodeNo: number;
        locale: UiLocale;
        translation: IEventStoryTranslation | null;
        translatedTitle: string | null;
    } | null>(null);
    const [masterLoading, setMasterLoading] = useState(true);

    const activeTranslation = translationState?.eventId === eventId
        && translationState.episodeNo === episodeNo
        && translationState.locale === locale
        ? translationState
        : null;
    const translation = activeTranslation?.translation ?? null;
    const translatedTitle = activeTranslation?.translatedTitle ?? null;

    // Load master data + translation
    useEffect(() => {
        if (!eventId || !episodeNo) return;
        let cancelled = false;
        async function load() {
            setMasterLoading(true);
            try {
                const [storiesData, eventsData, translationsData, trans] = await Promise.all([
                    fetchMasterData<IEventStory[]>("eventStories.json"),
                    fetchMasterData<IEventInfo[]>("events.json"),
                    loadTranslations(locale),
                    serverSource !== "cn" ? loadEventStoryTranslation(eventId, locale) : Promise.resolve(null),
                ]);
                if (cancelled) return;
                const story = storiesData.find(s => s.eventId === eventId) ?? null;
                setEventStory(story);
                const event = eventsData.find(e => e.id === eventId) ?? null;
                setEventInfo(event);

                let nextTranslatedTitle: string | null = null;
                if (story) {
                    const ep = story.eventStoryEpisodes.find(e => e.episodeNo === episodeNo);
                    if (ep) {
                        const title = mergeStoryTitle(ep.title, trans, episodeNo);
                        nextTranslatedTitle = title;
                        const eventName = translationsData?.events?.name?.[event?.name ?? ""] ?? event?.name ?? t("page.story.event.fallbackEventName", { id: eventId });
                        document.title = `${title} - ${eventName} - Moesekai`;
                    }
                }
                setTranslationState({ eventId, episodeNo, locale, translation: trans, translatedTitle: nextTranslatedTitle });
            } finally {
                if (!cancelled) setMasterLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [eventId, episodeNo, locale, serverSource, t]);

    const episode = eventStory?.eventStoryEpisodes.find(ep => ep.episodeNo === episodeNo);
    const prevEpisode = eventStory?.eventStoryEpisodes.find(ep => ep.episodeNo === episodeNo - 1);
    const nextEpisode = eventStory?.eventStoryEpisodes.find(ep => ep.episodeNo === episodeNo + 1);

    const { scenarioData, isLoading, error, missingPaths, translationSource } = useStoryAsset({
        type: "event",
        params: episode && eventStory ? {
            assetbundleName: eventStory.assetbundleName,
            scenarioId: episode.scenarioId,
        } : null,
        translation: useLLMTranslation ? translation : null,
        episodeNo,
        translationLocale: locale,
        fallbackErrorMessage: t("common.state.loadingFailed"),
    });

    const displayTitle = useLLMTranslation && translatedTitle ? translatedTitle : episode?.title;

    return (
        <MainLayout>
            <PageContainer>
                <StoryBackButton href={`/story/event/${eventId}`}>{t("page.story.unit.backToChapters")}</StoryBackButton>

                <StoryReaderHeader
                    media={
                        eventStory && (
                            <img
                                src={getEventLogoUrl(eventStory.assetbundleName, assetSource)}
                                alt=""
                                className="h-16 w-16 rounded-md3-md bg-surface-container-high object-contain p-1"
                            />
                        )
                    }
                    eyebrow={eventInfo?.name ?? t("page.story.event.fallbackEventName", { id: eventId })}
                    title={
                        <>
                            <span className="text-primary">{t("page.story.event.episodeLabel", { episode: episodeNo })}</span>
                            {displayTitle && ` — ${displayTitle}`}
                        </>
                    }
                    badges={
                        <>
                            {useLLMTranslation && translationSource && (
                                <StoryBadge tone={translationSource === "official_cn" ? "tertiary" : translationSource === "human" ? "primary" : "neutral"}>
                                    {translationSource === "official_cn"
                                        ? t("page.story.reader.translationSources.officialCn")
                                        : translationSource === "human"
                                          ? eventId <= 198
                                              ? t("page.story.reader.translationSources.aiPolishedShort")
                                              : t("page.story.reader.translationSources.human")
                                          : t("page.story.reader.translationSources.ai")}
                                </StoryBadge>
                            )}
                            <ServerSourceBadge serverSource={serverSource} />
                        </>
                    }
                />

                <StoryReader
                    scenarioData={scenarioData}
                    isLoading={isLoading || masterLoading}
                    error={error}
                    missingPaths={missingPaths ?? undefined}
                    endLabel={t("page.story.event.episodeLabel", { episode: episodeNo })}
                    translationSource={translationSource}
                    storyType="event"
                    storyId={eventId}
                />

                {!isLoading && !masterLoading && (
                    <StoryEpisodeNav
                        prev={prevEpisode ? { href: `/story/event/${eventId}/${prevEpisode.episodeNo}`, title: prevEpisode.title } : null}
                        next={nextEpisode ? { href: `/story/event/${eventId}/${nextEpisode.episodeNo}`, title: nextEpisode.title } : null}
                    />
                )}
            </PageContainer>
        </MainLayout>
    );
}
