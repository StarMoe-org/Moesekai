"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterButton, FilterSection } from "@/components/common/BaseFilters";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { getStampUrl, getCharacterIconUrl } from "@/lib/assets";
import { fetchMasterData } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import ImagePreviewModal from "@/components/common/ImagePreviewModal";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { Card, ErrorState, LoadMore, LoadingState, PageContainer, PageHeader } from "@/components/md3";
import { useGridReflowAnimation } from "@/hooks/useGridReflowAnimation";

interface IStampInfo {
    id: number;
    stampType: string;
    seq: number;
    name: string;
    assetbundleName: string;
    characterId1: number;
    characterId2?: number | null;
    archivePublishedAt?: number;
    description?: string;
}

/** Stamps with no known character (missing or out-of-range ids) are picked together as "Other". */
const OTHER_CHARACTER = 0;
const isKnownCharacter = (id: number | null | undefined): id is number => typeof id === "number" && id >= 1 && id <= 26;
const matchesCharacter = (s: IStampInfo, selected: number) =>
    selected === OTHER_CHARACTER
        ? !isKnownCharacter(s.characterId1) && !isKnownCharacter(s.characterId2)
        : s.characterId1 === selected || s.characterId2 === selected;

function StickerContent() {
    const { isShowSpoiler, assetSource } = useTheme();
    const { t } = useI18n();
    const gridRef = useGridReflowAnimation<HTMLDivElement>();

    const [stamps, setStamps] = useState<IStampInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [selectedChar1, setSelectedChar1] = useState<number | null>(null);
    const [selectedChar2, setSelectedChar2] = useState<number | null>(null);
    const [stampType, setStampType] = useState<string>("");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [selectedStamp, setSelectedStamp] = useState<IStampInfo | null>(null);

    // Pagination with scroll restore
    const { displayCount, loadMore } = useScrollRestore({
        storageKey: "sticker",
        defaultDisplayCount: 48,
        increment: 48,
        isReady: !isLoading,
    });

    // Fetch stamps data
    useEffect(() => {
        async function fetchStamps() {
            try {
                setIsLoading(true);
                const data = await fetchMasterData<IStampInfo[]>("stamps.json");
                setStamps(data);
                setError(null);
            } catch (err) {
                console.error("Error fetching stamps:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchStamps();
    }, []);

    // Filter and sort stamps
    const filteredStamps = useMemo(() => {
        let result = [...stamps];

        // Character filter
        if (selectedChar1 !== null || selectedChar2 !== null) {
            result = result.filter(s => {
                // If both selected, must match both (in either order for stamps with 2 chars)
                if (selectedChar1 !== null && selectedChar2 !== null) {
                    return matchesCharacter(s, selectedChar1) && matchesCharacter(s, selectedChar2);
                }
                if (selectedChar1 !== null) return matchesCharacter(s, selectedChar1);
                if (selectedChar2 !== null) return matchesCharacter(s, selectedChar2);

                return true;
            });
        }

        // Stamp type filter
        if (stampType) {
            if (stampType === "text") {
                result = result.filter(s => s.stampType === "text" || s.stampType === "cheerful_carnival_message");
            } else {
                result = result.filter(s => s.stampType === stampType);
            }
        }

        // Spoiler filter
        if (!isShowSpoiler) {
            const now = Date.now();
            result = result.filter(s => !s.archivePublishedAt || s.archivePublishedAt <= now);
        }

        // Sort
        result.sort((a, b) => sortOrder === "asc" ? a.id - b.id : b.id - a.id);

        return result;
    }, [stamps, selectedChar1, selectedChar2, stampType, sortOrder, isShowSpoiler]);

    // Displayed stamps
    const displayedStamps = useMemo(() => {
        return filteredStamps.slice(0, displayCount);
    }, [filteredStamps, displayCount]);



    // Unique characters from stamps
    const characters = useMemo(() => {
        const charIds = new Set<number>();
        stamps.forEach(s => {
            if (isKnownCharacter(s.characterId1)) charIds.add(s.characterId1);
            if (isKnownCharacter(s.characterId2)) charIds.add(s.characterId2);
        });
        return Array.from(charIds).sort((a, b) => a - b);
    }, [stamps]);
    const hasOtherCharacters = useMemo(
        () => stamps.some(s => !isKnownCharacter(s.characterId1) && !isKnownCharacter(s.characterId2)),
        [stamps],
    );

    // Stamp types
    const stampTypes = useMemo(() => {
        const types = new Set<string>();
        stamps.forEach(s => types.add(s.stampType));
        return Array.from(types);
    }, [stamps]);

    const quickFilterContent = (
        <BaseFilters
            filteredCount={filteredStamps.length}
            totalCount={stamps.length}
            countUnit={t("page.sticker.countUnit")}
            showSearch={false}
            sortOptions={[{ id: "id", label: "ID" }]}
            sortBy="id"
            sortOrder={sortOrder}
            onSortChange={(_: string, order: "asc" | "desc") => setSortOrder(order)}
        >
            <FilterSection label={t("page.sticker.sectionLabel.character1")}>
                <div className="grid grid-cols-5 gap-2">
                    <button
                        key="all1"
                        onClick={() => setSelectedChar1(null)}
                        className={`state-layer focus-ring flex aspect-square items-center justify-center rounded-full type-label-m transition-colors duration-150 ease-md3-standard ${selectedChar1 === null
                            ? "bg-primary-container text-on-primary-container"
                            : "border border-outline-variant text-on-surface-variant"
                            }`}
                        title={t("page.sticker.anyCharacter")}
                    >
                        ALL
                    </button>
                    {characters.map(id => {
                        const characterName = getCharacterName(t, id);
                        return (
                            <button
                                key={`char1-${id}`}
                                onClick={() => setSelectedChar1(selectedChar1 === id ? null : id)}
                                className={`focus-ring relative flex aspect-square items-center justify-center overflow-hidden rounded-full transition-shadow duration-150 ease-md3-standard ${selectedChar1 === id
                                    ? "ring-[3px] ring-primary"
                                    : "ring-1 ring-outline-variant hover:ring-primary"
                                    }`}
                                title={characterName}
                            >
                                <Image
                                    src={getCharacterIconUrl(id)}
                                    alt={characterName}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            </button>
                        );
                    })}
                    {hasOtherCharacters && (
                        <button
                            key="other1"
                            onClick={() => setSelectedChar1(selectedChar1 === OTHER_CHARACTER ? null : OTHER_CHARACTER)}
                            aria-pressed={selectedChar1 === OTHER_CHARACTER}
                            className={`state-layer focus-ring flex aspect-square items-center justify-center rounded-full type-label-m transition-colors duration-150 ease-md3-standard ${selectedChar1 === OTHER_CHARACTER
                                ? "bg-primary-container text-on-primary-container"
                                : "border border-outline-variant text-on-surface-variant"
                                }`}
                            title={t("page.sticker.otherCharacter")}
                        >
                            {t("page.sticker.otherCharacter")}
                        </button>
                    )}
                </div>
            </FilterSection>

            <FilterSection label={t("page.sticker.sectionLabel.character2")}>
                <div className="grid grid-cols-5 gap-2">
                    <button
                        key="all2"
                        onClick={() => setSelectedChar2(null)}
                        className={`state-layer focus-ring flex aspect-square items-center justify-center rounded-full type-label-m transition-colors duration-150 ease-md3-standard ${selectedChar2 === null
                            ? "bg-primary-container text-on-primary-container"
                            : "border border-outline-variant text-on-surface-variant"
                            }`}
                        title={t("page.sticker.anyCharacter")}
                    >
                        ALL
                    </button>
                    {characters.map(id => {
                        const characterName = getCharacterName(t, id);
                        return (
                            <button
                                key={`char2-${id}`}
                                onClick={() => setSelectedChar2(selectedChar2 === id ? null : id)}
                                className={`focus-ring relative flex aspect-square items-center justify-center overflow-hidden rounded-full transition-shadow duration-150 ease-md3-standard ${selectedChar2 === id
                                    ? "ring-[3px] ring-primary"
                                    : "ring-1 ring-outline-variant hover:ring-primary"
                                    }`}
                                title={characterName}
                            >
                                <Image
                                    src={getCharacterIconUrl(id)}
                                    alt={characterName}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            </button>
                        );
                    })}
                    {hasOtherCharacters && (
                        <button
                            key="other2"
                            onClick={() => setSelectedChar2(selectedChar2 === OTHER_CHARACTER ? null : OTHER_CHARACTER)}
                            aria-pressed={selectedChar2 === OTHER_CHARACTER}
                            className={`state-layer focus-ring flex aspect-square items-center justify-center rounded-full type-label-m transition-colors duration-150 ease-md3-standard ${selectedChar2 === OTHER_CHARACTER
                                ? "bg-primary-container text-on-primary-container"
                                : "border border-outline-variant text-on-surface-variant"
                                }`}
                            title={t("page.sticker.otherCharacter")}
                        >
                            {t("page.sticker.otherCharacter")}
                        </button>
                    )}
                </div>
            </FilterSection>

            <FilterSection label={t("page.sticker.sectionLabel.stampType")}>
                <div className="flex flex-wrap gap-2">
                    <FilterButton
                        key="type-all"
                        selected={stampType === ""}
                        onClick={() => setStampType("")}
                    >
                        {t("page.sticker.allTypes")}
                    </FilterButton>
                    {stampTypes.map(type => (
                        <FilterButton
                            key={`type-${type}`}
                            selected={stampType === type}
                            onClick={() => setStampType(stampType === type ? "" : type)}
                        >
                            {type === "text" ? t("page.sticker.stampTypes.text") : type === "illustration" ? t("page.sticker.stampTypes.illustration") : type}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>
        </BaseFilters>
    );

    useQuickFilter(t("page.sticker.filterTitle"), quickFilterContent, [
        selectedChar1,
        selectedChar2,
        stampType,
        sortOrder,
        filteredStamps.length,
        stamps.length,
        characters,
        stampTypes,
        t,
    ]);

    return (
        <PageContainer>
            <ImagePreviewModal
                isOpen={!!selectedStamp}
                onClose={() => setSelectedStamp(null)}
                title={selectedStamp ? t("page.sticker.previewTitle", { name: selectedStamp.name }) : t("page.sticker.previewTitleFallback")}
                imageUrl={selectedStamp ? getStampUrl(selectedStamp.assetbundleName, assetSource) : ""}
                alt={selectedStamp?.name || t("page.sticker.previewAltFallback")}
                fileName={selectedStamp ? `sticker_${selectedStamp.id}.png` : "sticker.png"}
            />

            <PageHeader
                eyebrow={t("page.sticker.badge")}
                title={t("page.sticker.title")}
                highlight={t("page.sticker.titleHighlight")}
                description={t("page.sticker.description")}
            />

            {/* Error State */}
            {error && (
                <ErrorState className="mb-6" title={t("page.sticker.loadFailed")} message={error} retryLabel={t("common.action.retry")} />
            )}

            {/* Grid. Filters live in the global FilterDrawer (registered
                above via useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading ? (
                    <LoadingState />
                ) : (
                    <>
                        <div ref={gridRef} className="relative grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-3">
                            {displayedStamps.map(stamp => (
                                <Card
                                    variant="elevated"
                                    key={stamp.id}
                                    onClick={() => setSelectedStamp(stamp)}
                                    data-shortcut-item="true"
                                    className="cursor-zoom-in p-2"
                                >
                                    <div className="relative aspect-square">
                                        <Image
                                            src={getStampUrl(stamp.assetbundleName, assetSource)}
                                            alt={stamp.name}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                    <div className="mt-1 text-center type-label-s text-on-surface-variant">
                                        <TranslatedText
                                            original={stamp.name}
                                            category="sticker"
                                            field="name"
                                            originalClassName="truncate block"
                                            translationClassName="block truncate type-label-s text-outline"
                                        />
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {/* Load More */}
                        <LoadMore
                            label={t("page.sticker.loadMore")}
                            shown={displayedStamps.length}
                            total={filteredStamps.length}
                            onLoadMore={loadMore}
                            allLoadedLabel={t("page.sticker.allLoaded", { count: filteredStamps.length })}
                        />
                    </>
                )}
            </div>
        </PageContainer>
    );
}

export default function StickerClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <Suspense fallback={<LoadingState className="min-h-[50vh]" label={t("page.sticker.loadingFallback")} />}>
                <StickerContent />
            </Suspense>
        </MainLayout>
    );
}
