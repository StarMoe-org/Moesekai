"use client";
import { useState, useEffect, useMemo } from "react";
import { Button, Icon, LoadingState, PageContainer, Surface } from "@/components/md3";
import { mdFormatListBulleted, mdOpenInNew } from "@/components/md3/icons";
import { ServerSourceBadge, StoryBadge, StoryReaderHeader } from "@/components/story/StoryReaderChrome";
import { useParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { StoryReader } from "@/components/story/StoryReader";
import { StoryTranslationSourceBadge } from "@/components/story/StoryTranslationSourceBadge";

import { fetchMasterData } from "@/lib/fetch";
import { getCardThumbnailUrl } from "@/lib/assets";
import { ICardInfo, IGameChara } from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchStoryAssetFromMirror, StoryAssetMissingError } from "@/lib/storyAsset";
import { mergeStoryTitle, mergeTranslations, processScenarioForDisplay } from "@/lib/storyLoader";
import {
    IEventStoryTranslation,
    loadStoryTranslation,
    sideStoryTranslationEnabled,
    storyEpisodeTranslationSource,
} from "@/lib/eventStoryTranslation";
import { IProcessedScenarioData } from "@/types/story";
import { useI18n } from "@/contexts/I18nContext";
import type { UiLocale } from "@/lib/i18n";
import { ICardStoryEpisode, selectCardStoryParts } from "../cardStoryParts";

export default function StoryCardReaderClient() {
    const params = useParams();
    const { assetSource, serverSource, useLLMTranslation } = useTheme();
    const { locale, t } = useI18n();
    const cardId = Number(params.cardId);
    const lang: "jp" | "cn" = serverSource === "cn" ? "cn" : "jp";

    const [card, setCard] = useState<ICardInfo | null>(null);
    const [chara, setChara] = useState<IGameChara | null>(null);
    const [ep1, setEp1] = useState<{ title: string; scenarioId: string } | null>(null);
    const [ep2, setEp2] = useState<{ title: string; scenarioId: string } | null>(null);
    const [part1, setPart1] = useState<IProcessedScenarioData | null>(null);
    const [part2, setPart2] = useState<IProcessedScenarioData | null>(null);
    const [missing1, setMissing1] = useState<string[] | null>(null);
    const [missing2, setMissing2] = useState<string[] | null>(null);
    const [error1, setError1] = useState<string | null>(null);
    const [error2, setError2] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [translationState, setTranslationState] = useState<{
        cardId: number;
        locale: UiLocale;
        translation: IEventStoryTranslation | null;
    } | null>(null);

    useEffect(() => {
        if (!cardId) return;
        // serverSource/assetSource hydrate from localStorage one frame after mount; drop the stale run.
        let cancelled = false;
        async function load() {
            setIsLoading(true);
            try {
                const [cardsData, episodesData, charasData] = await Promise.all([
                    fetchMasterData<ICardInfo[]>("cards.json"),
                    fetchMasterData<ICardStoryEpisode[]>("cardEpisodes.json"),
                    fetchMasterData<IGameChara[]>("gameCharacters.json"),
                ]);
                if (cancelled) return;
                const c = cardsData.find(x => x.id === cardId);
                if (!c) return;
                setCard(c);
                setChara(charasData.find(x => x.id === c.characterId) ?? null);

                const parts = selectCardStoryParts(episodesData.filter(e => e.cardId === cardId));
                if (!parts) return;
                const [e1, e2] = parts;
                setEp1({ title: e1.title, scenarioId: e1.scenarioId });
                setEp2({ title: e2.title, scenarioId: e2.scenarioId });

                document.title = t("page.story.card.documentTitle", { name: c.prefix });

                // Load both parts
                const loadPart = async (scenarioId: string, setData: typeof setPart1, setMissing: typeof setMissing1, setErr: typeof setError1) => {
                    try {
                        const raw = await fetchStoryAssetFromMirror("card", assetSource, { assetbundleName: c.assetbundleName, scenarioId });
                        if (cancelled) return;
                        const processed = await processScenarioForDisplay(raw, "card", assetSource, serverSource);
                        if (!cancelled) setData(processed);
                    } catch (err) {
                        if (cancelled) return;
                        if (err instanceof StoryAssetMissingError) setMissing(err.missingPaths);
                        else setErr(err instanceof Error ? err.message : t("common.state.loadingFailed"));
                    }
                };

                await Promise.all([
                    loadPart(e1.scenarioId, setPart1, setMissing1, setError1),
                    loadPart(e2.scenarioId, setPart2, setMissing2, setError2),
                ]);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [cardId, lang, assetSource, serverSource, t]);

    const translationEnabled = sideStoryTranslationEnabled(serverSource, locale, useLLMTranslation);
    useEffect(() => {
        if (!cardId || !translationEnabled) return;
        let cancelled = false;
        loadStoryTranslation("card", cardId, locale).then((translation) => {
            if (!cancelled) setTranslationState({ cardId, locale, translation });
        });
        return () => { cancelled = true; };
    }, [cardId, locale, translationEnabled]);

    const activeTranslation = translationState?.cardId === cardId && translationState.locale === locale
        ? translationState
        : null;
    // The original script shows as soon as it loads; a translation merges in when its file arrives.
    const translation = translationEnabled ? activeTranslation?.translation ?? null : null;

    const parts = useMemo(() => [
        { key: "1", episode: ep1, data: part1, missing: missing1, err: error1 },
        { key: "2", episode: ep2, data: part2, missing: missing2, err: error2 },
    ].map(({ key, episode, data, missing, err }) => {
        const source = storyEpisodeTranslationSource(translation, key);
        return {
            key,
            missing,
            err,
            source,
            title: episode ? mergeStoryTitle(episode.title, translation, key) : undefined,
            data: data && source ? { ...data, actions: mergeTranslations(data.actions, translation, key, locale) } : data,
        };
    }), [ep1, ep2, part1, part2, missing1, missing2, error1, error2, translation, locale]);

    const charaName = chara ? `${chara.firstName ?? ""}${chara.givenName}` : "";

    return (
        <MainLayout>
            <PageContainer>
                {card && (
                    <StoryReaderHeader
                        href={`/cards/${card.id}`}
                        className="mb-8"
                        media={
                            <img
                                src={getCardThumbnailUrl(card.characterId, card.assetbundleName, false, assetSource)}
                                alt={card.prefix}
                                className="h-12 w-24 rounded-md3-sm object-cover"
                            />
                        }
                        eyebrow={charaName}
                        title={<span className="transition-colors group-hover:text-primary">{card.prefix}</span>}
                        badges={<ServerSourceBadge serverSource={serverSource} />}
                        footer={
                            card.gachaPhrase && card.gachaPhrase !== "-" ? (
                                <p className="mt-1 type-body-s italic text-on-surface-variant">「{card.gachaPhrase}」</p>
                            ) : undefined
                        }
                        trailing={<Icon path={mdOpenInNew} size={20} className="text-on-surface-variant" />}
                    />
                )}

                {isLoading && <LoadingState label={t("page.story.reader.loading")} />}

                {!isLoading && (
                    <div className="mx-auto max-w-4xl">
                        <Surface tone="card" radius="lg" className="mb-6 flex flex-wrap items-center gap-2 p-3">
                            <span className="mr-2 flex items-center gap-1.5 type-label-l text-on-surface-variant">
                                <Icon path={mdFormatListBulleted} size={20} />
                                {t("page.story.card.tableOfContents")}
                            </span>
                            <Button
                                variant="tonal"
                                size="xs"
                                onClick={() => document.getElementById("part-episode-1")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                            >
                                {t("page.story.card.part1")}
                            </Button>
                            <Button
                                variant="tonal"
                                size="xs"
                                onClick={() => document.getElementById("part-episode-2")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                            >
                                {t("page.story.card.part2")}
                            </Button>
                        </Surface>

                        <div className="space-y-10">
                            {parts.map(({ key, title, data, missing, err, source }) => {
                                const label = key === "1" ? t("page.story.card.part1") : t("page.story.card.part2");
                                return (
                                    <div key={key} id={`part-episode-${key}`} className="scroll-mt-32">
                                        <div className="mb-4 flex items-center gap-3">
                                            <StoryBadge tone="primary">{label}</StoryBadge>
                                            {title && <h2 className="type-title-l text-on-surface">{title}</h2>}
                                            {source && <StoryTranslationSourceBadge source={source} />}
                                        </div>
                                        <StoryReader
                                            scenarioData={data}
                                            isLoading={false}
                                            error={err}
                                            missingPaths={missing ?? undefined}
                                            endLabel={label}
                                            translationSource={source}
                                            storyType="card"
                                            live2dSelector={`card:${cardId}/${key === "1" ? "first" : "second"}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
