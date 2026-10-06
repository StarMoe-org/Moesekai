"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import MainLayout from "@/components/MainLayout";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCostumeThumbnailUrl, getCharacterIconUrl } from "@/lib/assets";
import { ICardInfo, isTrainableCard, getCardDefaultTrainedStatus } from "@/types/types";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { TranslatedText } from "@/components/common/TranslatedText";
import {
    ICostumeInfo,
    IMoeCostumeData,
    PART_TYPE_LABEL_KEYS,
    SOURCE_LABEL_KEYS,
    RARITY_LABEL_KEYS,
} from "@/types/costume";
import { fetchMasterData } from "@/lib/fetch";
import { getCharacterName } from "@/lib/i18n";
import { Button, EmptyState, LoadingState, PageContainer, SectionCard, Surface } from "@/components/md3";
import { mdArrowBack, mdCheckroom, mdGroup, mdInfo, mdLayers, mdPlayingCards } from "@/components/md3/icons";

// Helper to extract base name (remove _XX color suffix)
function getVariantBaseName(assetName: string): string {
    return assetName.replace(/_\d+$/, "");
}

// Part sort score
function getPartScore(partType: string): number {
    if (partType === "body") return 1;
    if (partType === "hair") return 2;
    if (partType === "head") return 3;
    return 4;
}

interface DisplayItem {
    id: string;
    partType: string;
    baseAssetName: string;
    // If set, display this exact asset (no color switching)
    strictAsset?: string;
    // For extraParts items: associated character ID
    characterId?: number;
}

export default function CostumeDetailClient() {
    const params = useParams();
    const router = useRouter();
    const costumeNumber = Number(params.id);
    const costumeIdLabel = Number.isFinite(costumeNumber) ? String(costumeNumber) : String(params.id ?? "");
    const { assetSource, useTrainedThumbnail } = useTheme();
    const { t } = useTranslation();
    const { t: tI18n, formatDate } = useI18n();
    const { setDetailName } = useBreadcrumb();
    const translateWithFallback = useCallback((key: string | undefined, fallback: string) => {
        if (!key) return fallback;
        const label = tI18n(key);
        return label === key ? fallback : label;
    }, [tI18n]);

    const [costumeGroup, setCostumeGroup] = useState<ICostumeInfo | null>(null);
    const [relatedCards, setRelatedCards] = useState<ICardInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    // Unified color selection for standard parts
    const [selectedColorId, setSelectedColorId] = useState<number>(1);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const data = await fetchMasterData<IMoeCostumeData>("moe_costume.json");
                const allCostumes = data.costumes || [];
                const group = allCostumes.find(c => c.costumeNumber === costumeNumber);

                if (!group) {
                    throw new Error(`Costume ${costumeNumber} not found`);
                }
                setCostumeGroup(group);

                // Set page title
                const translatedName = t("costumes", "name", group.name);
                document.title = `Moesekai - ${translatedName || group.name}`;

                // Fetch Related Cards if any
                if (group.cardIds && group.cardIds.length > 0) {
                    try {
                        const allCards = await fetchMasterData<ICardInfo[]>("cards.json");
                        const cards = allCards.filter(c => group.cardIds?.includes(c.id));
                        setRelatedCards(cards);
                    } catch (e) {
                        console.error("Error fetching related cards", e);
                    }
                }

                setError(null);
            } catch (err) {
                console.error("Error fetching costume:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        if (Number.isFinite(costumeNumber)) {
            fetchData();
        } else {
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [costumeNumber]);

    // Build display items from shared parts + extraParts
    const displayItems = useMemo(() => {
        if (!costumeGroup) return [];
        const items: DisplayItem[] = [];

        // 1. Shared parts — support color switching
        Object.entries(costumeGroup.parts).forEach(([partType, partList]) => {
            // Group by base name to merge color variants
            const groups = new Map<string, typeof partList>();
            partList.forEach(part => {
                const base = getVariantBaseName(part.assetbundleName);
                const key = `${partType}-${base}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(part);
            });

            groups.forEach((groupItems, key) => {
                // Check for colorId collision
                const colorIds = new Set<number>();
                let hasCollision = false;
                for (const item of groupItems) {
                    if (colorIds.has(item.colorId)) { hasCollision = true; break; }
                    colorIds.add(item.colorId);
                }

                if (hasCollision) {
                    // Collision: show each variant individually
                    groupItems.forEach(item => {
                        items.push({
                            id: item.assetbundleName,
                            partType,
                            baseAssetName: item.assetbundleName,
                            strictAsset: item.assetbundleName,
                        });
                    });
                } else {
                    // Merge color variants
                    const base = getVariantBaseName(groupItems[0].assetbundleName);
                    items.push({
                        id: key,
                        partType,
                        baseAssetName: base,
                    });
                }
            });
        });

        // 2. Extra parts — character-specific, show individually
        if (costumeGroup.extraParts) {
            costumeGroup.extraParts.forEach(ep => {
                ep.variants.forEach(variant => {
                    items.push({
                        id: `extra-${ep.characterId}-${variant.assetbundleName}`,
                        partType: ep.partType,
                        baseAssetName: variant.assetbundleName,
                        strictAsset: variant.assetbundleName,
                        characterId: ep.characterId,
                    });
                });
            });
        }

        // Sort: body → hair → head → others, extraParts after shared
        return items.sort((a, b) => {
            const scoreA = getPartScore(a.partType) + (a.characterId ? 10 : 0);
            const scoreB = getPartScore(b.partType) + (b.characterId ? 10 : 0);
            return scoreA - scoreB;
        });
    }, [costumeGroup]);

    // Deduplicated list of included part types
    const includedPartTypes = useMemo(() => {
        const types = new Set<string>();
        displayItems.forEach(item => {
            const label = translateWithFallback(PART_TYPE_LABEL_KEYS[item.partType], item.partType);
            if (item.characterId) {
                types.add(tI18n("page.costumes.extraPartTag", { label }));
            } else {
                types.add(label);
            }
        });
        return Array.from(types).sort();
    }, [displayItems, tI18n, translateWithFallback]);

    // Available color variants (from shared parts only)
    const availableColors = useMemo(() => {
        if (!costumeGroup) return [];
        const uniqueColors = new Map<number, { colorId: number; colorName: string; assetbundleName: string }>();

        Object.values(costumeGroup.parts).forEach(partList => {
            partList.forEach(part => {
                if (!uniqueColors.has(part.colorId)) {
                    uniqueColors.set(part.colorId, part);
                }
            });
        });

        return Array.from(uniqueColors.values()).sort((a, b) => a.colorId - b.colorId);
    }, [costumeGroup]);

    const representative = costumeGroup;

    // Set breadcrumb detail name
    useEffect(() => {
        if (representative) setDetailName(representative.name);
    }, [representative, setDetailName]);

    const displayGender = useMemo(() => {
        if (!representative) return "";
        return tI18n(`common.costume.genders.${representative.gender}`);
    }, [representative, tI18n]);

    if (isLoading) {
        return (
            <MainLayout>
                <LoadingState className="min-h-[50vh]" label={tI18n("page.costumes.detailLoadingFallback")} />
            </MainLayout>
        );
    }

    if (error || !representative) {
        return (
            <MainLayout>
                <PageContainer>
                    <EmptyState
                        icon={mdCheckroom}
                        title={tI18n("page.costumes.notFoundTitle", { id: costumeIdLabel })}
                        description={tI18n("page.costumes.notFoundDesc")}
                        action={
                            <Button variant="filled" icon={mdArrowBack} href="/costumes">
                                {tI18n("page.costumes.backToList")}
                            </Button>
                        }
                    />
                </PageContainer>
            </MainLayout>
        );
    }

    const sourceChipClass =
        representative.source === "card"
            ? "bg-primary-container text-on-primary-container"
            : representative.source === "shop"
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-tertiary-container text-on-tertiary-container";
    const rarityChipClass =
        representative.costume3dRarity === "rare"
            ? "bg-tertiary-container text-on-tertiary-container"
            : "bg-surface-container-highest text-on-surface-variant";

    return (
        <MainLayout>
            <PageContainer>
                {/* Header Section */}
                <header className="mb-8">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-md3-sm bg-surface-container-high px-3 py-1 font-mono type-label-m text-on-surface-variant">
                            No. {costumeNumber}
                        </span>
                        <span className={`rounded-md3-sm px-3 py-1 type-label-m ${rarityChipClass}`}>
                            {translateWithFallback(RARITY_LABEL_KEYS[representative.costume3dRarity], representative.costume3dRarity)}
                        </span>
                        <span className="rounded-md3-sm bg-secondary-container px-3 py-1 type-label-m text-on-secondary-container">
                            {translateWithFallback(SOURCE_LABEL_KEYS[representative.source], representative.source)}
                        </span>
                    </div>
                    <h1 className="type-headline-m text-on-surface sm:type-headline-l">
                        <TranslatedText
                            original={representative.name}
                            category="costumes"
                            field="name"
                            originalClassName=""
                            translationClassName="mt-1 block type-title-m text-on-surface-variant"
                        />
                    </h1>
                </header>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
                    {/* LEFT Column: Visuals */}
                    <div>
                        <Surface tone="card" className="overflow-hidden lg:sticky lg:top-24">
                            {/* Grid of Parts */}
                            <div className="grid grid-cols-4 gap-0.5 bg-outline-variant">
                                {displayItems.map((item) => {
                                    let assetName = item.id;
                                    const characterName = item.characterId ? getCharacterName(tI18n, item.characterId) : "";

                                    if (item.strictAsset) {
                                        assetName = item.strictAsset;
                                    } else {
                                        // Combined mode: find the variant matching selectedColorId
                                        const partList = costumeGroup.parts[item.partType] || [];
                                        const preciseMatch = partList.find(p =>
                                            p.colorId === selectedColorId &&
                                            getVariantBaseName(p.assetbundleName) === item.baseAssetName
                                        );
                                        if (preciseMatch) {
                                            assetName = preciseMatch.assetbundleName;
                                        } else {
                                            const anyMatch = partList.find(p => getVariantBaseName(p.assetbundleName) === item.baseAssetName);
                                            if (anyMatch) assetName = anyMatch.assetbundleName;
                                        }
                                    }

                                    return (
                                        <div key={item.id} className="group relative flex aspect-square items-center justify-center bg-surface-container p-2">
                                            <div className="relative h-full w-full">
                                                <Image
                                                    src={getCostumeThumbnailUrl(assetName, assetSource)}
                                                    alt={item.id}
                                                    fill
                                                    className="object-contain"
                                                    unoptimized
                                                />
                                            </div>

                                            {/* Labels overlay */}
                                            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-1">
                                                <span className="self-start rounded-md3-xs bg-surface-container-highest/90 px-1.5 py-0.5 type-label-s text-on-surface-variant">
                                                    {translateWithFallback(PART_TYPE_LABEL_KEYS[item.partType], item.partType)}
                                                </span>
                                            </div>

                                            {/* Character icon for extraParts items */}
                                            {item.characterId && (
                                                <div className="absolute right-1 top-1 z-10 h-6 w-6 overflow-hidden rounded-full bg-surface-container-lowest ring-1 ring-outline-variant" title={characterName}>
                                                    <Image
                                                        src={getCharacterIconUrl(item.characterId)}
                                                        alt={characterName}
                                                        width={24}
                                                        height={24}
                                                        className="h-full w-full object-cover"
                                                        unoptimized
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {displayItems.length === 0 && (
                                    <div className="col-span-4 flex aspect-[4/1] items-center justify-center bg-surface-container type-body-m text-on-surface-variant">
                                        {tI18n("page.costumes.noPartsData")}
                                    </div>
                                )}
                            </div>

                            {/* Color Selector */}
                            {availableColors.length > 1 && (
                                <div className="border-t border-outline-variant p-4">
                                    <p className="mb-2 type-title-s text-on-surface-variant">{tI18n("page.costumes.colorSchemesLabel")}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {availableColors.map(variant => {
                                            const isSelected = selectedColorId === variant.colorId;
                                            return (
                                                <button
                                                    key={variant.colorId}
                                                    type="button"
                                                    aria-pressed={isSelected}
                                                    onClick={() => setSelectedColorId(variant.colorId)}
                                                    className={`state-layer focus-ring flex items-center gap-2 whitespace-nowrap rounded-md3-sm py-1 pl-1 pr-3 type-label-l transition-colors duration-150 ease-md3-standard ${isSelected
                                                        ? "bg-secondary-container text-on-secondary-container ring-2 ring-primary"
                                                        : "border border-outline-variant text-on-surface-variant"
                                                        }`}
                                                >
                                                    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md3-xs bg-surface-container-high">
                                                        <Image
                                                            src={getCostumeThumbnailUrl(variant.assetbundleName, assetSource)}
                                                            alt={variant.colorName}
                                                            fill
                                                            className="object-contain"
                                                            unoptimized
                                                        />
                                                    </div>
                                                    {t("costumes", "colorName", variant.colorName) || variant.colorName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </Surface>
                    </div>

                    {/* RIGHT Column: Info Cards */}
                    <div className="space-y-6">
                        {/* Basic Info Card */}
                        <SectionCard title={tI18n("page.costumes.basicInfo")} icon={mdInfo}>
                            <div className="divide-y divide-outline-variant">
                                <InfoRow label={tI18n("page.costumes.fields.id")} value={`#${costumeNumber}`} />
                                <InfoRow
                                    label={tI18n("page.costumes.fields.name")}
                                    value={
                                        <TranslatedText
                                            original={representative.name}
                                            category="costumes"
                                            field="name"
                                            originalClassName=""
                                            translationClassName="mt-0.5 block type-body-s text-on-surface-variant"
                                        />
                                    }
                                />
                                <InfoRow label={tI18n("page.costumes.fields.type")} value={representative.costume3dType} />
                                <InfoRow label={tI18n("page.costumes.fields.source")} value={
                                    <span className={`rounded-md3-xs px-2 py-0.5 type-label-m ${sourceChipClass}`}>
                                        {translateWithFallback(SOURCE_LABEL_KEYS[representative.source], representative.source)}
                                    </span>
                                } />
                                <InfoRow label={tI18n("page.costumes.fields.rarity")} value={
                                    <span className={`rounded-md3-xs px-2 py-0.5 type-label-m ${rarityChipClass}`}>
                                        {translateWithFallback(RARITY_LABEL_KEYS[representative.costume3dRarity], representative.costume3dRarity)}
                                    </span>
                                } />
                                <InfoRow label={tI18n("page.costumes.fields.gender")} value={displayGender} />
                                {representative.designer && representative.designer !== "-" && (
                                    <InfoRow label={tI18n("page.costumes.fields.designer")} value={t("costumes", "designer", representative.designer) || representative.designer} />
                                )}
                                <InfoRow label={tI18n("page.costumes.fields.publishedAt")} value={
                                    mounted && representative.publishedAt
                                        ? formatDate(representative.publishedAt, { dateStyle: "long" })
                                        : representative.publishedAt ? "..." : tI18n("page.costumes.unknownPublishedAt")
                                } />
                            </div>
                        </SectionCard>

                        {/* Parts List Summary */}
                        <SectionCard title={tI18n("page.costumes.partsListTitle")} icon={mdLayers}>
                            <div className="flex flex-wrap gap-2">
                                {includedPartTypes.map(tag => (
                                    <span key={tag} className="inline-flex h-8 items-center rounded-md3-sm border border-outline-variant px-3 type-label-l text-on-surface-variant">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </SectionCard>

                        {/* Available Characters Card */}
                        {representative.characterIds && representative.characterIds.length > 0 && (
                            <SectionCard
                                title={tI18n("page.costumes.charactersTitle")}
                                icon={mdGroup}
                                actions={
                                    <span className="type-label-m text-on-surface-variant">
                                        {tI18n("page.costumes.charactersCount", { count: representative.characterIds.length })}
                                    </span>
                                }
                            >
                                <div className="flex flex-wrap gap-2">
                                    {representative.characterIds
                                        .filter(charId => charId <= 26)
                                        .map(charId => {
                                            const characterName = getCharacterName(tI18n, charId);
                                            return (
                                                <div
                                                    key={charId}
                                                    className="flex items-center gap-2 rounded-full bg-surface-container py-1 pl-1 pr-3"
                                                    title={characterName}
                                                >
                                                    <div className="h-8 w-8 overflow-hidden rounded-full bg-surface-container-lowest">
                                                        <Image
                                                            src={getCharacterIconUrl(charId)}
                                                            alt={characterName}
                                                            width={32}
                                                            height={32}
                                                            className="h-full w-full object-cover"
                                                            unoptimized
                                                        />
                                                    </div>
                                                    <span className="type-label-l text-on-surface">
                                                        {characterName}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                </div>
                            </SectionCard>
                        )}

                        {/* Related Cards */}
                        {relatedCards.length > 0 && (
                            <SectionCard title={tI18n("page.costumes.relatedCardsTitle")} icon={mdPlayingCards}>
                                <div className="flex flex-wrap gap-3">
                                    {relatedCards.map(card => (
                                        <Link
                                            key={card.id}
                                            href={`/cards/${card.id}`}
                                            className="focus-ring block rounded-md3-sm"
                                            title={`Card #${card.id} - ${card.prefix}`}
                                        >
                                            <SekaiCardThumbnail card={card} trained={getCardDefaultTrainedStatus(card) || (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday")} width={64} />
                                        </Link>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        <DetailPageAdCard />
                    </div>
                </div>

                {/* Back Button */}
                <div className="mt-12 flex justify-center">
                    <Button variant="tonal" icon={mdArrowBack} onClick={() => router.back()}>
                        {tI18n("page.costumes.backToList")}
                    </Button>
                </div>
            </PageContainer>
        </MainLayout>
    );
}

// Info Row Component
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3 type-body-m">
            <span className="text-on-surface-variant">{label}</span>
            <span className="max-w-[60%] text-right type-title-s text-on-surface">{value}</span>
        </div>
    );
}
