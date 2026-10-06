"use client";
import React, { useState, useEffect } from "react";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
    IGameChara,
    ICharaProfile,
    IUnitProfile,
    ICharaUnitInfo,
    ICardInfo,
    UNIT_FIELD_TO_ID,
    UNIT_ICON_FILES,
    isTrainableCard,
    getCardDefaultTrainedStatus
} from "@/types/types";
import {
    getCharacterTrimUrl,
    getCharacterLabelHUrl,
    getCharacterLabelVUrl,
} from "@/lib/assets";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { fetchMasterData } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import ColorPreview from "@/components/helpers/ColorPreview";
import ImagePreviewModal from "@/components/common/ImagePreviewModal";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import { formatCharacterDisplayName } from "@/lib/character-name";
import { Button, EmptyState, Icon, LoadingState, PageContainer, SectionCard, SegmentedButton, Surface } from "@/components/md3";
import { mdArrowBack, mdBadge, mdPerson, mdPlayingCards, mdZoomIn } from "@/components/md3/icons";

// Derive unit field → icon filename from centralized maps
const UNIT_FIELD_ICONS: Record<string, string> = Object.fromEntries(
    Object.entries(UNIT_FIELD_TO_ID).map(([field, id]) => [field, UNIT_ICON_FILES[id]])
);

export default function CharacterDetailClient() {
    const params = useParams();
    const { assetSource, useTrainedThumbnail } = useTheme();
    const { t } = useI18n();
    const { setDetailName } = useBreadcrumb();
    const id = parseInt(params.id as string, 10);

    // State
    const [character, setCharacter] = useState<IGameChara | null>(null);
    const [profile, setProfile] = useState<ICharaProfile | null>(null);
    const [unitInfo, setUnitInfo] = useState<ICharaUnitInfo | null>(null);
    const [unitProfile, setUnitProfile] = useState<IUnitProfile | null>(null);
    const [cards, setCards] = useState<ICardInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"trim" | "label_h" | "label_v">("trim");
    const [imageViewerOpen, setImageViewerOpen] = useState(false);

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);

                // Fetch all required data in parallel
                const [
                    charaData,
                    profileData,
                    unitInfoData,
                    unitProfileData,
                    cardsData
                ] = await Promise.all([
                    fetchMasterData<IGameChara[]>("gameCharacters.json"),
                    fetchMasterData<ICharaProfile[]>("characterProfiles.json"),
                    fetchMasterData<ICharaUnitInfo[]>("gameCharacterUnits.json"),
                    fetchMasterData<IUnitProfile[]>("unitProfiles.json"),
                    fetchMasterData<ICardInfo[]>("cards.json")
                ]);

                // Find character data
                const chara = charaData.find(c => c.id === id);
                if (!chara) throw new Error("Character not found");
                setCharacter(chara);

                // Set page title
                document.title = `Moesekai - ${formatCharacterDisplayName(chara)}`;

                // Find related data
                setProfile(profileData.find(p => p.characterId === id) || null);

                const uInfo = unitInfoData.find(u => u.gameCharacterId === id && u.unit === chara.unit);
                setUnitInfo(uInfo || null);

                setUnitProfile(unitProfileData.find(u => u.unit === chara.unit) || null);

                // Filter cards for this character
                setCards(cardsData.filter(c => c.characterId === id).sort((a, b) => b.releaseAt - a.releaseAt));

            } catch (err) {
                console.error("Error fetching character details:", err);
            } finally {
                setIsLoading(false);
            }
        }

        if (!isNaN(id)) {
            fetchData();
        }
    }, [id]);

    // Compute display name before any conditional returns (React hooks rule)
    const characterDisplayName = character
        ? formatCharacterDisplayName(character)
        : null;

    // Set breadcrumb detail name — must be called before conditional returns
    useEffect(() => {
        if (characterDisplayName) setDetailName(characterDisplayName);
    }, [characterDisplayName, setDetailName]);

    if (isLoading) {
        return <LoadingState className="min-h-[50vh]" label={t("page.character.loadingInfo")} />;
    }

    if (!character) {
        return (
            <PageContainer>
                <EmptyState
                    icon={mdPerson}
                    title={t("page.character.notFoundTitle")}
                    action={
                        <Button variant="tonal" icon={mdArrowBack} href="/character">
                            {t("page.character.backToList")}
                        </Button>
                    }
                />
            </PageContainer>
        );
    }

    // Determine unit icon
    const unitIconName = UNIT_FIELD_ICONS[character.unit] || "vs.webp";

    // Prepare images for display/viewer
    const charaTrimImg = getCharacterTrimUrl(id, assetSource);
    const charaLabelHImg = getCharacterLabelHUrl(id, assetSource);
    const charaLabelVImg = getCharacterLabelVUrl(id, assetSource);
    const activeImageUrl = activeTab === "trim" ? charaTrimImg : activeTab === "label_h" ? charaLabelHImg : charaLabelVImg;
    const activeImageLabel = t(`page.character.imageTabs.${activeTab}`);

    return (
        <PageContainer>
            <ImagePreviewModal
                isOpen={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                title={t("page.character.imageDetailTitle", { name: characterDisplayName ?? "", tab: activeImageLabel })}
                imageUrl={activeImageUrl}
                alt={t("page.character.imageDetailAlt", { name: characterDisplayName ?? "", tab: activeImageLabel })}
                fileName={`character_${id}_${activeTab}.png`}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Character Image */}
                <div className="lg:col-span-5 xl:col-span-4">
                    <Surface tone="card" className="sticky top-24 overflow-hidden">
                        <div className="p-3">
                            <SegmentedButton
                                density={-1}
                                value={activeTab}
                                onValueChange={setActiveTab}
                                options={[
                                    { value: "trim", label: t("page.character.imageTabs.trim") },
                                    { value: "label_h", label: t("page.character.imageTabs.label_h") },
                                    { value: "label_v", label: t("page.character.imageTabs.label_v") },
                                ]}
                            />
                        </div>

                        {/* Image Display */}
                        <div className="relative mx-3 flex min-h-[400px] cursor-zoom-in items-center justify-center rounded-md3-lg bg-surface-container p-4"
                            onClick={() => setImageViewerOpen(true)}>
                            {activeTab === "trim" && (
                                <div className="w-full h-auto relative aspect-[3/4]">
                                    <Image
                                        src={charaTrimImg}
                                        alt="Character Trim"
                                        fill
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            )}
                            {activeTab === "label_h" && (
                                <div className="w-full h-auto relative aspect-[2/1]">
                                    <Image
                                        src={charaLabelHImg}
                                        alt="Character Label Horizontal"
                                        fill
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            )}
                            {activeTab === "label_v" && (
                                <div className="w-full h-auto relative aspect-[1/3]">
                                    <Image
                                        src={charaLabelVImg}
                                        alt="Character Label Vertical"
                                        fill
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-center gap-1.5 p-3 type-label-m text-on-surface-variant">
                            <Icon path={mdZoomIn} size={16} />
                            {t("page.character.clickExpand")}
                        </div>
                    </Surface>
                </div>

                {/* Right Column: Info & Profile */}
                <div className="space-y-6 lg:col-span-7 xl:col-span-8">
                    {/* Basic Info */}
                    <SectionCard title={t("page.character.basicInfo")} icon={mdBadge}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                                <InfoRow label="ID" value={character.id} />
                                <InfoRow
                                    label={t("page.character.nameLabel")}
                                    value={
                                        <div className="flex flex-col items-end">
                                            <span className="type-title-m">{characterDisplayName}</span>
                                            <span className="type-body-s text-on-surface-variant">{character.firstNameRuby} {character.givenNameRuby}</span>
                                        </div>
                                    }
                                />
                                <InfoRow
                                    label={t("page.character.genderLabel")}
                                    value={character.gender === "female" ? t("page.character.genders.female") : character.gender === "male" ? t("page.character.genders.male") : character.gender}
                                />
                                <InfoRow
                                    label={t("page.character.unitLabel")}
                                    value={
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 relative">
                                                <Image
                                                    src={`/data/icon/${unitIconName}`}
                                                    alt={unitProfile?.unitName || character.unit}
                                                    fill
                                                    className="object-contain"
                                                    unoptimized
                                                />
                                            </div>
                                            <TranslatedText
                                                original={unitProfile?.unitName || character.unit}
                                                category="units"
                                                field="unitName"
                                            />
                                        </div>
                                    }
                                />
                                {unitInfo && (
                                    <>
                                        <InfoRow
                                            label={t("page.character.colorLabel")}
                                            value={
                                                <div className="flex items-center gap-2">
                                                    <span className="uppercase font-mono type-body-m">{unitInfo.colorCode}</span>
                                                    <ColorPreview colorCode={unitInfo.colorCode} size={20} />
                                                </div>
                                            }
                                        />
                                    </>
                                )}
                            </div>
                    </SectionCard>

                    {/* Profile */}
                    {profile && (
                        <SectionCard title={t("page.character.profileTitle")} icon={mdPerson}>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                                    <InfoRow label={t("page.character.heightLabel")} value={profile.height} />
                                    <InfoRow label={t("page.character.birthdayLabel")} value={profile.birthday} />
                                    <InfoRow label={t("page.character.schoolLabel")} value={profile.school} />
                                    <InfoRow label={t("page.character.schoolYearLabel")} value={profile.schoolYear} />
                                    <InfoRow
                                        label={t("page.character.hobbyLabel")}
                                        value={
                                            <TranslatedText
                                                original={profile.hobby || "-"}
                                                category="characters"
                                                field="hobby"
                                            />
                                        }
                                    />
                                    <InfoRow
                                        label={t("page.character.specialSkillLabel")}
                                        value={
                                            <TranslatedText
                                                original={profile.specialSkill || "-"}
                                                category="characters"
                                                field="specialSkill"
                                            />
                                        }
                                    />
                                    <InfoRow
                                        label={t("page.character.favoriteFoodLabel")}
                                        value={
                                            <TranslatedText
                                                original={profile.favoriteFood || "-"}
                                                category="characters"
                                                field="favoriteFood"
                                            />
                                        }
                                    />
                                    <InfoRow
                                        label={t("page.character.hatedFoodLabel")}
                                        value={
                                            <TranslatedText
                                                original={profile.hatedFood || "-"}
                                                category="characters"
                                                field="hatedFood"
                                            />
                                        }
                                    />
                                    <InfoRow
                                        label={t("page.character.weakLabel")}
                                        value={
                                            <TranslatedText
                                                original={profile.weak || "-"}
                                                category="characters"
                                                field="weak"
                                            />
                                        }
                                    />
                                </div>
                                <div className="border-t border-outline-variant pt-4">
                                    <p className="mb-2 type-title-s text-on-surface-variant">{t("page.character.introductionTitle")}</p>
                                    <div className="whitespace-pre-line rounded-md3-md bg-surface-container p-4 type-body-m text-on-surface">
                                        <TranslatedText
                                            original={profile.introduction}
                                            category="characters"
                                            field="introduction"
                                        />
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    )}

                    {/* Cards */}
                    <SectionCard
                        title={t("page.character.relatedCardsTitle")}
                        icon={mdPlayingCards}
                        actions={
                            <span className="rounded-md3-sm bg-secondary-container px-2 py-0.5 type-label-m text-on-secondary-container">
                                {t("page.character.relatedCardsCount", { count: cards.length })}
                            </span>
                        }
                    >
                            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                {cards.map((card) => {
                                    const showTrained = getCardDefaultTrainedStatus(card) || (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");
                                    return (
                                        <Link
                                            key={card.id}
                                            href={`/cards/${card.id}`}
                                            className="focus-ring block rounded-md3-sm"
                                            title={card.prefix}
                                        >
                                            <SekaiCardThumbnail card={card} trained={showTrained} className="w-full" />
                                        </Link>
                                    );
                                })}
                            </div>
                    </SectionCard>

                    <DetailPageAdCard />
                </div>
            </div>
        </PageContainer>
    );
}

// Helper component for info rows
function InfoRow({ label, value }: { label: string, value: React.ReactNode }) {
    if (!value) return null;
    return (
        <div className="flex items-center justify-between gap-4 py-1 type-body-m">
            <span className="type-label-l text-on-surface-variant">{label}</span>
            <span className="text-right text-on-surface">{value}</span>
        </div>
    );
}
