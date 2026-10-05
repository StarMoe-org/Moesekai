"use client";
import { Card, ErrorState, LoadingState, PageContainer } from "@/components/md3";
import { useState, useEffect } from "react";
import MainLayout from "@/components/MainLayout";
import { fetchMasterData } from "@/lib/fetch";
import { getCharacterIconUrl } from "@/lib/assets";
import { IGameChara, ICharaProfile, UNIT_FIELD_LABEL_KEYS } from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSimpleScrollRestore } from "@/hooks/useSimpleScrollRestore";
import { StoryPageHeader } from "@/components/story/StoryPageHeader";

const UNIT_ORDER = ["light_sound", "idol", "street", "theme_park", "school_refusal", "piapro"];

export default function StorySelfListClient() {
    const { serverSource } = useTheme();
    const { t } = useI18n();
    const [charas, setCharas] = useState<IGameChara[]>([]);
    const [profiles, setProfiles] = useState<ICharaProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    useSimpleScrollRestore("story_self", !isLoading);

    useEffect(() => {
        async function load() {
            try {
                const [charasData, profilesData] = await Promise.all([
                    fetchMasterData<IGameChara[]>("gameCharacters.json"),
                    fetchMasterData<ICharaProfile[]>("characterProfiles.json"),
                ]);
                setCharas(charasData);
                setProfiles(profilesData);
            } catch (err) {
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [serverSource, t]);

    const profileMap = new Map(profiles.map(p => [p.characterId, p]));

    // Group by unit
    const unitGroups = UNIT_ORDER.map(unit => ({
        unit,
        labelKey: UNIT_FIELD_LABEL_KEYS[unit],
        charas: charas.filter(c => c.unit === unit && profileMap.has(c.id)),
    })).filter(g => g.charas.length > 0);

    return (
        <MainLayout>
            <PageContainer>
                <StoryPageHeader storyKey="self" />

                {isLoading && <LoadingState label={t("common.state.loading")} />}
                {error && <ErrorState title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />}

                {!isLoading && !error && (
                    <div className="space-y-8">
                        {unitGroups.map(({ unit, labelKey, charas: unitCharas }) => (
                            <section key={unit}>
                                <h2 className="mb-3 text-center type-title-m text-on-surface-variant">{labelKey ? t(labelKey) : unit}</h2>
                                <div className="flex flex-wrap justify-center gap-3">
                                    {unitCharas.map(c => {
                                        const charaName = `${c.firstName ?? ""}${c.givenName}`;
                                        return (
                                            <Card
                                                key={c.id}
                                                href={`/story/self/${c.id}`}
                                                variant="filled"
                                                className="group flex w-[calc(50%-6px)] flex-col items-center gap-2 p-3 sm:w-28"
                                            >
                                                <img
                                                    src={getCharacterIconUrl(c.id)}
                                                    alt={charaName}
                                                    className="h-14 w-14 rounded-full bg-surface-container-high object-cover"
                                                />
                                                <span className="text-center type-label-l text-on-surface transition-colors group-hover:text-primary">
                                                    {charaName}
                                                </span>
                                            </Card>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
