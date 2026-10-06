"use client";
import { Button, Card, EmptyState, Icon, LoadingState, PageContainer, SectionCard, cardClassName } from "@/components/md3";
import { mdArrowBack, mdChevronRight, mdEventBusy, mdInfo, mdOpenInNew, mdSummarize, mdViewList } from "@/components/md3/icons";
import { StoryBadge } from "@/components/story/StoryReaderChrome";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import { fetchMasterData, fetchBilibiliEventsData } from "@/lib/fetch";
import {
  IEventInfo,
  IBilibiliEventsResponse,
  IBilibiliEvent,
} from "@/types/events";
import { IEventStory } from "@/types/story";
import {
  getEventLogoUrl,
  getEventBannerUrl,
  getStoryEpisodeImageUrl,
} from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { IStoryAdminResponse, IStoryAdminChapter } from "@/types/storyAdmin";
import ExternalLink from "@/components/ExternalLink";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import {
  getStoryTranslation,
  loadEventStoryTranslation,
  selectEventStoryLocalizedText,
  type IEventStoryTranslation,
} from "@/lib/eventStoryTranslation";
import type { UiLocale } from "@/lib/i18n";
import { useSimpleScrollRestore } from "@/hooks/useSimpleScrollRestore";

const STORY_DETAIL_MIRROR_BASE_URL = "https://moe.exmeaning.com/story/detail";

interface IHubStoryDetailChapter {
  chapter_no: number;
  title_jp: string;
  title_cn: string;
  summary_cn: string;
  character_ids?: number[];
  image_url?: string;
}

interface IHubStoryDetailResponse {
  event_id: number;
  title_jp: string;
  title_cn: string;
  outline_jp?: string;
  outline_cn?: string;
  summary_cn?: string;
  chapters?: IHubStoryDetailChapter[];
}

function getStoryDetailMirrorUrl(eventId: number): string {
  return `${STORY_DETAIL_MIRROR_BASE_URL}/event_${String(eventId).padStart(3, "0")}.json`;
}

function normalizeMirrorStoryDetail(
  data: IHubStoryDetailResponse,
  eventId: number,
  assetbundleName: string,
  story?: IEventStory,
): IStoryAdminResponse {
  const episodeMap = new Map(
    (story?.eventStoryEpisodes ?? []).map((episode) => [
      episode.episodeNo,
      episode,
    ]),
  );
  const chapters = (data.chapters ?? []).map((chapter, index) => {
    const episode = episodeMap.get(chapter.chapter_no);
    return {
      id: index + 1,
      event_id: eventId,
      chapter_no: chapter.chapter_no,
      scenario_id: episode?.scenarioId ?? "",
      title_jp: chapter.title_jp || episode?.title || "",
      title_cn: chapter.title_cn || "",
      summary_cn: chapter.summary_cn || "",
      asset_bundle_name: assetbundleName,
      character_ids: JSON.stringify(chapter.character_ids ?? []),
      created_at: "",
      updated_at: "",
    } satisfies IStoryAdminChapter;
  });

  return {
    id: eventId,
    event_id: eventId,
    asset_bundle_name: assetbundleName,
    title_jp: data.title_jp || "",
    title_cn: data.title_cn || "",
    outline_jp: data.outline_jp || story?.outline || "",
    outline_cn: data.outline_cn || "",
    chapter_count: chapters.length,
    summary_status: chapters.length > 0 ? "completed" : "missing",
    summary_cn: data.summary_cn || "",
    cover_image_url: data.chapters?.[0]?.image_url,
    created_at: "",
    updated_at: "",
    chapters,
  };
}

async function fetchStorySummaryFromMirror(
  eventId: number,
  assetbundleName: string,
  story?: IEventStory,
): Promise<IStoryAdminResponse | null> {
  try {
    const response = await fetch(getStoryDetailMirrorUrl(eventId));
    if (!response.ok) {
      console.warn(
        `[StorySummaryMirror] Failed to fetch event ${eventId}: HTTP ${response.status}`,
      );
      return null;
    }
    const data = (await response.json()) as IHubStoryDetailResponse;
    return normalizeMirrorStoryDetail(data, eventId, assetbundleName, story);
  } catch (error) {
    console.warn(
      `[StorySummaryMirror] Failed to fetch event ${eventId}:`,
      error,
    );
    return null;
  }
}

async function fetchOptionalBilibiliEvent(
  eventId: number,
): Promise<IBilibiliEvent | null> {
  try {
    const bilibiliData =
      await fetchBilibiliEventsData<IBilibiliEventsResponse>();
    return (
      bilibiliData.events.find(
        (event) => event.event_id === eventId && event.bilibili_url,
      ) ?? null
    );
  } catch (error) {
    console.warn(`[BilibiliEvents] Failed to fetch event ${eventId}:`, error);
    return null;
  }
}

function ChapterItem({
  chapter,
  eventId,
  assetBundleName,
  showImage,
  locale,
  translatedTitle,
}: {
  chapter: IStoryAdminChapter;
  eventId: number;
  assetBundleName: string;
  showImage: boolean;
  locale: UiLocale;
  translatedTitle?: string;
}) {
  const { assetSource } = useTheme();
  const { t } = useI18n();
  const imageUrl = getStoryEpisodeImageUrl(
    assetBundleName,
    chapter.chapter_no,
    assetSource,
  );
  const displayTitle = selectEventStoryLocalizedText(
    locale,
    chapter.title_jp,
    chapter.title_cn,
    translatedTitle,
  );
  const displaySummary = selectEventStoryLocalizedText(
    locale,
    undefined,
    chapter.summary_cn,
  );

  return (
    <Card
      href={`/story/event/${eventId}/${chapter.chapter_no}`}
      variant="filled"
      radius="lg"
      className="group mb-4 p-4 last:mb-0"
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        {showImage && (
          <div className="relative aspect-video w-full shrink-0 self-center overflow-hidden rounded-md3-md bg-surface-container-high sm:aspect-[16/9] sm:w-64 sm:self-start">
            <Image
              src={imageUrl}
              alt={`Episode ${chapter.chapter_no}`}
              fill
              className="object-contain"
              unoptimized
            />
            <div className="absolute left-1.5 top-1.5 rounded-md3-xs bg-surface-container-highest/90 px-1.5 py-0.5 type-label-s text-on-surface">
              #{chapter.chapter_no}
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1 py-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="line-clamp-1 type-title-m text-on-surface transition-colors group-hover:text-primary">
              {displayTitle}
            </h3>
            <Icon path={mdChevronRight} size={20} className="text-on-surface-variant sm:hidden" />
          </div>
          {displaySummary ? (
            <p className="mt-2 type-body-m text-on-surface-variant">{displaySummary}</p>
          ) : (
            <p className="mt-1 type-body-m italic text-on-surface-variant">{t("page.story.event.noChapterSummary")}</p>
          )}
        </div>
        <Icon path={mdChevronRight} size={20} className="hidden self-center text-on-surface-variant sm:block" />
      </div>
    </Card>
  );
}

export default function StoryEventDetailClient() {
  const params = useParams();
  const { assetSource, serverSource, useLLMTranslation } = useTheme();
  const { locale, t } = useI18n();
  const { t: translateMasterText } = useTranslation();
  const eventId = Number(params.eventId);

  const [adminData, setAdminData] = useState<IStoryAdminResponse | null>(null);
  const [eventInfo, setEventInfo] = useState<IEventInfo | null>(null);
  const [eventStory, setEventStory] = useState<IEventStory | null>(null);
  const [translationState, setTranslationState] = useState<{
    locale: UiLocale;
    translation: IEventStoryTranslation | null;
  } | null>(null);
  const [bilibiliEvent, setBilibiliEvent] = useState<IBilibiliEvent | null>(
    null,
  );
  const [fallbackChapters, setFallbackChapters] = useState<
    { chapter_no: number; title: string; scenarioId: string }[]
  >([]);
  const [showEpImages, _setShowEpImages] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore scroll position when navigating back from an episode reader page
  useSimpleScrollRestore(`story_event_detail_${eventId}`, !isLoading);

  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;

    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);
        setAdminData(null);
        setEventInfo(null);
        setEventStory(null);
        setTranslationState(null);
        setBilibiliEvent(null);
        setFallbackChapters([]);

        const bilibiliPromise = fetchOptionalBilibiliEvent(eventId);

        const [eventsData, storiesData, bEvent, storyTranslation] = await Promise.all([
          fetchMasterData<IEventInfo[]>("events.json"),
          fetchMasterData<IEventStory[]>("eventStories.json"),
          bilibiliPromise,
          loadEventStoryTranslation(eventId, locale),
        ]);

        if (cancelled) return;

        const event = eventsData.find((e) => e.id === eventId);
        if (!event) throw new Error(t("page.story.event.eventNotFound"));

        const story = storiesData.find((s) => s.eventId === eventId);
        const nextFallbackChapters = story
          ? story.eventStoryEpisodes.map((ep) => ({
              chapter_no: ep.episodeNo,
              title: ep.title,
              scenarioId: ep.scenarioId,
            }))
          : [];

        // Fetch story summary from mirror
        const summaryData = await fetchStorySummaryFromMirror(
          eventId,
          event.assetbundleName,
          story,
        );

        if (cancelled) return;

        setEventInfo(event);
        setEventStory(story ?? null);
        setTranslationState({ locale, translation: storyTranslation });
        setFallbackChapters(nextFallbackChapters);
        if (summaryData) setAdminData(summaryData);
        if (bEvent) setBilibiliEvent(bEvent);
        document.title = t("page.story.event.documentTitle", { name: event.name });
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
        setIsLoading(false);
      }
    }

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [eventId, locale, serverSource, t]);

  if (isLoading) {
    return (
      <MainLayout>
        <LoadingState label={t("common.state.loading")} />
      </MainLayout>
    );
  }

  if (error || !eventInfo) {
    return (
      <MainLayout>
        <PageContainer>
          <EmptyState
            icon={mdEventBusy}
            title={t("page.events.notFoundTitle", { id: eventId })}
            description={error || t("page.events.notFoundDesc")}
            action={
              <Button variant="filled" icon={mdArrowBack} href="/story/event">
                {t("page.events.backToList")}
              </Button>
            }
          />
        </PageContainer>
      </MainLayout>
    );
  }

  const chapters = adminData?.chapters ?? [];
  const totalChapters = chapters.length || fallbackChapters.length;
  const storyTranslation = translationState?.locale === locale
    ? translationState.translation
    : null;
  const sourceTitle = adminData?.title_jp || eventInfo.name;
  const translatedEventTitle = translateMasterText("events", "name", eventInfo.name) ?? undefined;
  const displayTitle = selectEventStoryLocalizedText(
    locale,
    sourceTitle,
    adminData?.title_cn,
    translatedEventTitle,
  );
  const displaySummary = selectEventStoryLocalizedText(
    locale,
    undefined,
    adminData?.summary_cn,
  );
  const displayOutline = selectEventStoryLocalizedText(
    locale,
    adminData?.outline_jp || eventStory?.outline,
    adminData?.outline_cn,
  );
  const showSummaryCredit = locale === "zh-CN"
    && Boolean(adminData?.summary_cn || adminData?.outline_cn);

  return (
    <MainLayout>
      <PageContainer>
        {/* Banner */}
        <div className="relative mb-8 flex min-h-[200px] items-center overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70 sm:min-h-[250px]">
          <div className="absolute inset-0 z-0">
            <Image
              src={getEventBannerUrl(eventInfo.assetbundleName, assetSource)}
              alt={eventInfo.name}
              fill
              className="scale-105 object-cover opacity-40 blur-sm"
              unoptimized
            />
            <div className="absolute inset-0 bg-surface-container-low/70" />
          </div>
          <div className="relative z-10 flex w-full flex-col items-center gap-6 p-6 sm:flex-row sm:gap-10 sm:p-10">
            <div className="relative aspect-[2/1] w-48 shrink-0 sm:w-64">
              <Image
                src={getEventLogoUrl(eventInfo.assetbundleName, assetSource)}
                alt={eventInfo.name}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h1 className="mb-2 type-headline-m text-on-surface sm:type-headline-l">{displayTitle}</h1>
              {sourceTitle && sourceTitle !== displayTitle && (
                <p className="max-w-2xl type-body-m text-on-surface-variant">{sourceTitle}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left: Summary */}
          <div className="space-y-4 lg:col-span-1">
            <Card href={`/events/${eventId}`} variant="filled" radius="lg" className="group">
              <div className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md3-md bg-primary-container text-on-primary-container">
                  <Icon path={mdInfo} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="type-title-m text-on-surface transition-colors group-hover:text-primary">
                    {t("page.story.event.eventDetailTitle")}
                  </h3>
                  <p className="mt-0.5 truncate type-body-s text-on-surface-variant">
                    {t("page.story.event.eventDetailDescription")}
                  </p>
                </div>
                <Icon path={mdChevronRight} size={20} className="text-on-surface-variant" />
              </div>
            </Card>

            {bilibiliEvent && (
              <ExternalLink
                href={bilibiliEvent.bilibili_url!}
                className={cardClassName({ variant: "filled", radius: "lg", interactive: true }) + " group"}
              >
                <div className="flex items-center gap-4 p-5">
                  {/* Bilibili brand mark keeps its official color */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md3-md bg-[#fb7299]/10">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M4.977 3.561a1.31 1.31 0 111.818-1.884l2.828 2.728c.08.078.149.163.205.254h4.277a1.32 1.32 0 01.205-.254l2.828-2.728a1.31 1.31 0 011.818 1.884L17.82 4.66h.848A5.333 5.333 0 0124 9.992v7.34a5.333 5.333 0 01-5.333 5.334H5.333A5.333 5.333 0 010 17.333V9.992a5.333 5.333 0 015.333-5.333h.781L4.977 3.56zm.356 3.67a2.667 2.667 0 00-2.666 2.667v7.529a2.667 2.667 0 002.666 2.666h13.334a2.667 2.667 0 002.666-2.666v-7.53a2.667 2.667 0 00-2.666-2.666H5.333zm1.334 5.192a1.333 1.333 0 112.666 0v1.192a1.333 1.333 0 11-2.666 0v-1.192zM16 11.09c-.736 0-1.333.597-1.333 1.333v1.192a1.333 1.333 0 102.666 0v-1.192c0-.736-.597-1.333-1.333-1.333z"
                        fill="#FB7299"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="type-title-m text-on-surface transition-colors group-hover:text-primary">
                      {t("page.story.event.bilibiliTranslationTitle")}
                    </h3>
                    <p className="mt-0.5 truncate type-body-s text-on-surface-variant">
                      {t("page.story.event.bilibiliTranslationDescription")}
                    </p>
                  </div>
                  <Icon path={mdOpenInNew} size={20} className="text-on-surface-variant" />
                </div>
              </ExternalLink>
            )}

            <SectionCard title={t("page.story.event.summaryTitle")} icon={mdSummarize}>
              {displaySummary ? (
                <p className="type-body-m text-on-surface-variant">{displaySummary}</p>
              ) : (
                <p className="type-body-m italic text-on-surface-variant">{t("page.story.event.noEventSummary")}</p>
              )}
              {displayOutline && (
                <div className="mt-6 border-t border-outline-variant pt-6">
                  <h3 className="mb-2 type-title-s text-on-surface">{t("page.story.event.outlineTitle")}</h3>
                  <p className="type-body-m text-on-surface-variant">{displayOutline}</p>
                </div>
              )}
              {showSummaryCredit && (
                <div className="mt-6 border-t border-outline-variant pt-4">
                  <p className="text-right type-body-s italic text-on-surface-variant">{t("page.story.event.summaryCredit")}</p>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Right: Chapters */}
          <div className="lg:col-span-2">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 type-title-l text-on-surface">
                <Icon path={mdViewList} className="text-primary" />
                {t("page.story.event.chapterListTitle")}
              </h2>
              <StoryBadge tone="neutral">{t("page.story.event.chapterCount", { count: totalChapters })}</StoryBadge>
            </div>

            <div className="space-y-4">
              {chapters.length > 0 ? (
                chapters.map((chapter) => (
                  <ChapterItem
                    key={`admin-${chapter.chapter_no}`}
                    chapter={chapter}
                    eventId={eventId}
                    assetBundleName={eventInfo.assetbundleName}
                    showImage={showEpImages}
                    locale={locale}
                    translatedTitle={useLLMTranslation
                      ? getStoryTranslation(storyTranslation, chapter.chapter_no)?.title
                      : undefined}
                  />
                ))
              ) : fallbackChapters.length > 0 ? (
                fallbackChapters.map((chapter) => (
                  <ChapterItem
                    key={`fallback-${chapter.chapter_no}`}
                    chapter={{
                      id: 0,
                      event_id: eventId,
                      chapter_no: chapter.chapter_no,
                      scenario_id: chapter.scenarioId,
                      title_jp: chapter.title,
                      title_cn: "",
                      summary_cn: "",
                      asset_bundle_name: eventInfo.assetbundleName,
                      character_ids: "[]",
                      created_at: "",
                      updated_at: "",
                    }}
                    eventId={eventId}
                    assetBundleName={eventInfo.assetbundleName}
                    showImage={showEpImages}
                    locale={locale}
                    translatedTitle={useLLMTranslation
                      ? getStoryTranslation(storyTranslation, chapter.chapter_no)?.title
                      : undefined}
                  />
                ))
              ) : (
                <div className="rounded-md3-lg border border-dashed border-outline-variant bg-surface-container-low">
                  <EmptyState icon={mdViewList} title={t("page.story.event.noChapters")} className="py-12" />
                </div>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    </MainLayout>
  );
}
