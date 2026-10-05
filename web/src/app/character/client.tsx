"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "@/components/LocalizedLink";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import { IGameChara, IUnitProfile, UNIT_FIELD_TO_ID, UNIT_ICON_FILES } from "@/types/types";
import { getCharacterSelectUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useI18n } from "@/contexts/I18nContext";
import { formatCharacterDisplayName } from "@/lib/character-name";
import { ErrorState, LoadingState, PageContainer, PageHeader, Surface } from "@/components/md3";

// Derive unit field → icon filename from centralized maps
const UNIT_FIELD_ICONS: Record<string, string> = Object.fromEntries(
    Object.entries(UNIT_FIELD_TO_ID).map(([field, id]) => [field, UNIT_ICON_FILES[id]])
);

function CharacterListContent() {
    const { assetSource } = useTheme();
    const { t } = useI18n();
    const [characters, setCharacters] = useState<IGameChara[]>([]);
    const [unitProfiles, setUnitProfiles] = useState<IUnitProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch data
    useEffect(() => {
        // document.title is handled by metadata.
        async function fetchData() {
            try {
                setIsLoading(true);
                const [charaData, unitData] = await Promise.all([
                    fetchMasterData<IGameChara[]>("gameCharacters.json"),
                    fetchMasterData<IUnitProfile[]>("unitProfiles.json"),
                ]);
                setCharacters(charaData);
                setUnitProfiles(unitData);
                setError(null);
            } catch (err) {
                console.error("Error fetching character data:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, []);

    // Group characters by unit
    const charactersByUnit = useMemo(() => {
        if (!characters.length || !unitProfiles.length) return {};

        // Sort units by seq
        const sortedUnits = unitProfiles.sort((a, b) => a.seq - b.seq);

        const grouped: Record<string, { unit: IUnitProfile; characters: IGameChara[] }> = {};

        sortedUnits.forEach(unit => {
            const unitCharas = characters.filter(c => c.unit === unit.unit);
            if (unitCharas.length > 0) {
                grouped[unit.unit] = {
                    unit,
                    characters: unitCharas,
                };
            }
        });

        return grouped;
    }, [characters, unitProfiles]);

    return (
        <PageContainer>
            <PageHeader
                align="center"
                eyebrow={t("page.character.badge")}
                title={t("page.character.title")}
                highlight={t("page.character.titleHighlight")}
                description={t("page.character.description")}
            />
            {isLoading ? (
                <LoadingState label={t("page.character.loadingData")} />
            ) : error ? (
                <ErrorState title={t("page.character.loadFailed")} message={error} retryLabel={t("common.action.retry")} />
            ) : (
                <div className="space-y-6">
                    {Object.entries(charactersByUnit).map(([unitId, { unit, characters: unitCharacters }]) => {
                        const iconName = UNIT_FIELD_ICONS[unitId] || "vs.webp";

                        return (
                            <Surface as="section" tone="low" key={unitId} className="overflow-hidden">
                                {/* Unit Header */}
                                <div className="flex items-center gap-4 border-b border-outline-variant px-5 py-4">
                                    <div className="relative h-12 w-12 shrink-0">
                                        <Image
                                            src={`/data/icon/${iconName}`}
                                            alt={unit.unitName}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="type-title-l text-on-surface">
                                            <TranslatedText
                                                original={unit.unitName}
                                                category="units"
                                                field="unitName"
                                                inline
                                                translationClassName="ml-2 type-body-m text-on-surface-variant"
                                            />
                                        </h2>
                                        <div className="line-clamp-1 type-body-s text-on-surface-variant">
                                            <TranslatedText
                                                original={unit.profileSentence}
                                                category="units"
                                                field="profileSentence"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Characters Grid */}
                                <div className="p-4 sm:p-6">
                                    <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
                                        {unitCharacters.map((chara) => {
                                            const characterName = formatCharacterDisplayName(chara);

                                            return (
                                                <div
                                                    key={chara.id}
                                                    className={`${unitId === "piapro"
                                                        ? "w-[calc(16.666%-10px)] sm:w-[calc(16.666%-14px)]"
                                                        : "w-[calc(25%-9px)] sm:w-[calc(25%-12px)]"
                                                        }`}
                                                >
                                                    <Link
                                                        key={chara.id}
                                                        href={`/character/${chara.id}`}
                                                        className="group state-layer focus-ring relative flex h-[160px] items-center justify-center overflow-hidden rounded-md3-md bg-surface-container p-1 transition-shadow duration-200 ease-md3-standard hover:shadow-elev-1 sm:h-[220px] sm:p-2 md:h-[280px] lg:h-[320px]"
                                                    >
                                                        <div className="relative h-full w-full">
                                                            <Image
                                                                src={getCharacterSelectUrl(chara.id, assetSource)}
                                                                alt={characterName}
                                                                fill
                                                                className="object-contain"
                                                                unoptimized
                                                            />
                                                        </div>
                                                        {/* Character name overlay on hover */}
                                                        <div className="absolute inset-x-0 bottom-0 bg-inverse-surface/85 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                                                            <p className="truncate text-center type-label-m text-inverse-on-surface">
                                                                {characterName}
                                                            </p>
                                                        </div>
                                                    </Link>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </Surface>
                        );
                    })}
                </div>
            )}
        </PageContainer>
    );
}

export default function CharacterClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <Suspense fallback={<LoadingState label={t("page.character.loadingFallback")} />}>
                <CharacterListContent />
            </Suspense>
        </MainLayout>
    );
}
