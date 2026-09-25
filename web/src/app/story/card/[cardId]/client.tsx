"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "@/components/LocalizedLink";
import MainLayout from "@/components/MainLayout";
import { StoryReader } from "@/components/story/StoryReader";

import { fetchMasterData } from "@/lib/fetch";
import { getCardThumbnailUrl } from "@/lib/assets";
import { ICardInfo, IGameChara } from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchStoryAssetFromMirror, StoryAssetMissingError } from "@/lib/storyAsset";
import { processScenarioForDisplay } from "@/lib/storyLoader";
import { IProcessedScenarioData } from "@/types/story";
import { useI18n } from "@/contexts/I18nContext";

interface ICardEpisode {
    id: number; cardId: number;
    cardEpisodePartType: string;
    title: string; scenarioId: string;
}

export default function StoryCardReaderClient() {
    const params = useParams();
    const { assetSource, serverSource } = useTheme();
    const { t } = useI18n();
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

    useEffect(() => {
        if (!cardId) return;
        async function load() {
            setIsLoading(true);
            try {
                const [cardsData, episodesData, charasData] = await Promise.all([
                    fetchMasterData<ICardInfo[]>("cards.json"),
                    fetchMasterData<ICardEpisode[]>("cardEpisodes.json"),
                    fetchMasterData<IGameChara[]>("gameCharacters.json"),
                ]);
                const c = cardsData.find(x => x.id === cardId);
                if (!c) return;
                setCard(c);
                setChara(charasData.find(x => x.id === c.characterId) ?? null);

                const eps = episodesData.filter(e => e.cardId === cardId);
                const e1 = eps.find(e => e.cardEpisodePartType === "episode_1") ?? eps[0];
                const e2 = eps.find(e => e.cardEpisodePartType === "episode_2") ?? eps[1];
                if (!e1 || !e2) return;
                setEp1({ title: e1.title, scenarioId: e1.scenarioId });
                setEp2({ title: e2.title, scenarioId: e2.scenarioId });

                document.title = t("page.story.card.documentTitle", { name: c.prefix });

                // Load both parts
                const loadPart = async (scenarioId: string, setData: typeof setPart1, setMissing: typeof setMissing1, setErr: typeof setError1) => {
                    try {
                        const raw = await fetchStoryAssetFromMirror("card", assetSource, { assetbundleName: c.assetbundleName, scenarioId });
                        setData(await processScenarioForDisplay(raw, "card", assetSource, serverSource));
                    } catch (err) {
                        if (err instanceof StoryAssetMissingError) setMissing(err.missingPaths);
                        else setErr(err instanceof Error ? err.message : t("common.state.loadingFailed"));
                    }
                };

                await Promise.all([
                    loadPart(e1.scenarioId, setPart1, setMissing1, setError1),
                    loadPart(e2.scenarioId, setPart2, setMissing2, setError2),
                ]);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [cardId, lang, assetSource, serverSource, t]);

    const charaName = chara ? `${chara.firstName ?? ""}${chara.givenName}` : "";

    return (
        <MainLayout>
            <div className="container mx-auto px-4 sm:px-6 py-8">
                {card && (
                    <Link href={`/cards/${card.id}`} className="flex items-center gap-4 mb-8 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-miku/50 hover:shadow-sm transition-all group">
                        <img src={getCardThumbnailUrl(card.characterId, card.assetbundleName, false, assetSource)} alt={card.prefix} className="w-24 h-12 object-cover rounded-lg shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-500">{charaName}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-miku transition-colors">{card.prefix}</h1>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                    serverSource === "cn"
                                        ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/50"
                                        : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50"
                                }`}>{t(`page.story.serverSource.${serverSource}`)}</span>
                            </div>
                            {card.gachaPhrase && card.gachaPhrase !== "-" && (
                                <p className="text-xs text-slate-400 mt-1 italic">「{card.gachaPhrase}」</p>
                            )}
                        </div>
                        <svg className="w-5 h-5 text-slate-300 group-hover:text-miku transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </Link>
                )}

                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="w-12 h-12 border-4 border-miku/30 border-t-miku rounded-full animate-spin mb-4" />
                        <p className="text-slate-500">{t("page.story.reader.loading")}</p>
                    </div>
                )}

                {!isLoading && (
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-6 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-slate-500 mr-2">{t("page.story.card.tableOfContents")}</span>
                                <button
                                    onClick={() => document.getElementById("part-episode-1")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                                    className="px-3 py-1.5 text-sm font-medium text-miku hover:bg-miku/10 rounded-lg transition-colors"
                                >
                                    {t("page.story.card.part1")}
                                </button>
                                <span className="text-slate-300 dark:text-slate-600">|</span>
                                <button
                                    onClick={() => document.getElementById("part-episode-2")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                                    className="px-3 py-1.5 text-sm font-medium text-miku hover:bg-miku/10 rounded-lg transition-colors"
                                >
                                    {t("page.story.card.part2")}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-10">
                            {[
                                { id: "episode-1", label: t("page.story.card.part1"), title: ep1?.title, data: part1, missing: missing1, err: error1 },
                                { id: "episode-2", label: t("page.story.card.part2"), title: ep2?.title, data: part2, missing: missing2, err: error2 },
                            ].map(({ id, label, title, data, missing, err }) => (
                                <div key={id} id={`part-${id}`} className="scroll-mt-32">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className="px-3 py-1 bg-miku/10 text-miku text-sm font-bold rounded-full border border-miku/20">{label}</span>
                                        {title && <h2 className="font-bold text-slate-800 dark:text-slate-200">{title}</h2>}
                                    </div>
                                    <StoryReader
                                        scenarioData={data}
                                        isLoading={false}
                                        error={err}
                                        missingPaths={missing ?? undefined}
                                        endLabel={label}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
