"use client";
import { Button, Icon, LoadingState, PageContainer, Surface } from "@/components/md3";
import { mdFormatListBulleted } from "@/components/md3/icons";
import { ServerSourceBadge, StoryBackButton, StoryBadge, StoryReaderHeader } from "@/components/story/StoryReaderChrome";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { StoryReader } from "@/components/story/StoryReader";
import { fetchMasterData } from "@/lib/fetch";
import { getCharacterIconUrl } from "@/lib/assets";
import { IGameChara, ICharaProfile } from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { fetchStoryAssetFromMirror, StoryAssetMissingError } from "@/lib/storyAsset";
import { processScenarioForDisplay } from "@/lib/storyLoader";
import { IProcessedScenarioData } from "@/types/story";

export default function StorySelfReaderClient() {
    const params = useParams();
    const { serverSource, assetSource } = useTheme();
    const { t } = useI18n();
    const charaId = Number(params.charaId);
    const lang: "jp" | "cn" = serverSource === "cn" ? "cn" : "jp";

    const [chara, setChara] = useState<IGameChara | null>(null);
    const [year1, setYear1] = useState<IProcessedScenarioData | null>(null);
    const [year2, setYear2] = useState<IProcessedScenarioData | null>(null);
    const [missing1, setMissing1] = useState<string[] | null>(null);
    const [missing2, setMissing2] = useState<string[] | null>(null);
    const [error1, setError1] = useState<string | null>(null);
    const [error2, setError2] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!charaId) return;
        async function load() {
            setIsLoading(true);
            try {
                const [charasData, profilesData] = await Promise.all([
                    fetchMasterData<IGameChara[]>("gameCharacters.json"),
                    fetchMasterData<ICharaProfile[]>("characterProfiles.json"),
                ]);
                const c = charasData.find(x => x.id === charaId);
                if (!c) return;
                setChara(c);

                const profile = profilesData.find(p => p.characterId === charaId);
                if (!profile?.scenarioId) return;

                const scenarioId2 = profile.scenarioId;
                const scenarioId1 = scenarioId2.substring(0, scenarioId2.lastIndexOf("_"));

                const loadPart = async (scenarioId: string, setData: typeof setYear1, setMissing: typeof setMissing1, setErr: typeof setError1) => {
                    try {
                        const raw = await fetchStoryAssetFromMirror("self", assetSource, { scenarioId });
                        setData(await processScenarioForDisplay(raw, "scenario", assetSource, serverSource));
                    } catch (err) {
                        if (err instanceof StoryAssetMissingError) setMissing(err.missingPaths);
                        else setErr(err instanceof Error ? err.message : t("common.state.loadingFailed"));
                    }
                };

                const charaName = `${c.firstName ?? ""}${c.givenName}`;
                document.title = t("page.story.self.documentTitle", { name: charaName });

                await Promise.all([
                    loadPart(scenarioId1, setYear1, setMissing1, setError1),
                    loadPart(scenarioId2, setYear2, setMissing2, setError2),
                ]);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [charaId, lang, t]);

    const charaName = chara ? `${chara.firstName ?? ""}${chara.givenName}` : t("page.story.self.fallbackCharacterName", { id: charaId });

    return (
        <MainLayout>
            <PageContainer>
                <StoryBackButton href="/story/self">{t("page.story.self.backToCharacters")}</StoryBackButton>

                <StoryReaderHeader
                    className="mb-8"
                    media={chara && <img src={getCharacterIconUrl(chara.id)} alt={charaName} className="h-16 w-16 rounded-full bg-surface-container-high object-cover" />}
                    title={charaName}
                    badges={<ServerSourceBadge serverSource={serverSource} />}
                    footer={<p className="type-body-m text-on-surface-variant">{t("page.story.self.subtitle")}</p>}
                />

                {isLoading && <LoadingState label={t("page.story.self.loading")} />}

                {!isLoading && (
                    <div className="mx-auto max-w-4xl">
                        <Surface tone="card" radius="lg" className="mb-6 flex flex-wrap items-center gap-2 p-3">
                            <span className="mr-2 flex items-center gap-1.5 type-label-l text-on-surface-variant">
                                <Icon path={mdFormatListBulleted} size={20} />
                                {t("page.story.self.tableOfContents")}
                            </span>
                            <Button
                                variant="tonal"
                                size="xs"
                                onClick={() => document.getElementById("part-year2")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                            >
                                {t("page.story.self.year2")}
                            </Button>
                            <Button
                                variant="tonal"
                                size="xs"
                                onClick={() => document.getElementById("part-year1")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                            >
                                {t("page.story.self.year1")}
                            </Button>
                        </Surface>

                        <div className="space-y-10">
                            {[
                                { key: "year2", label: t("page.story.self.year2"), data: year2, missing: missing2, err: error2 },
                                { key: "year1", label: t("page.story.self.year1"), data: year1, missing: missing1, err: error1 },
                            ].map(({ key, label, data, missing, err }) => (
                                <div key={key} id={`part-${key}`} className="scroll-mt-32">
                                    <div className="mb-4 flex items-center gap-3">
                                        <StoryBadge tone="primary">{label}</StoryBadge>
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
            </PageContainer>
        </MainLayout>
    );
}
