"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "@/components/LocalizedLink";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import CardFilters from "@/components/cards/CardFilters";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { TranslatedText } from "@/components/common/TranslatedText";
import {
    ICardInfo,
    CardRarityType,
    CardAttribute,
    SupportUnit,
    ISkillInfo,
    getRarityNumber,
    isTrainableCard,
    getCardDefaultTrainedStatus,
} from "@/types/types";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { getCardSkillTypes } from "@/lib/skill";
import { loadTranslations, TranslationData } from "@/lib/translations";
import {
    getAccounts,
    getActiveAccount,
    setActiveAccount,
    fetchAccountGameData,
    normalizeAccountDataError,
    type AccountDataErrorCode,
    type MoesekaiAccount,
} from "@/lib/account";


import AccountSelectorBar from "@/components/AccountSelectorBar";
import QuickBindForm from "@/components/QuickBindForm";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { Banner, Chip, EmptyState, ErrorState, LinearProgress, LoadMore, LoadingState, PageContainer, PageHeader, Surface, cn } from "@/components/md3";

// ==================== Types ====================

interface UserCard {
    cardId: number;
    skillLevel: number;
    masterRank: number;
    level: number;
    specialTrainingStatus: string;
    duplicateCount: number;
    defaultImage: string;
    totalExp: number;
    episodes: {
        cardEpisodeId: number;
        scenarioStatus: string;
        isNotSkipped: boolean;
    }[];
}

interface CardSupply {
    id: number;
    cardSupplyType: string;
}

function parseUploadTimeToDate(uploadTime: string | number): Date | null {
    if (typeof uploadTime === "number") {
        if (!Number.isFinite(uploadTime)) return null;
        const normalized = uploadTime < 1_000_000_000_000 ? uploadTime * 1000 : uploadTime;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = String(uploadTime).trim();
    if (!text) return null;

    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
        const normalized = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getUserErrorMessageKey(code: AccountDataErrorCode): string {
    switch (code) {
        case "API_NOT_PUBLIC":
            return "common.accountDataErrors.apiNotPublic";
        case "NOT_FOUND":
            return "common.accountDataErrors.notFound";
        case "OAUTH_REAUTH_REQUIRED":
            return "common.accountDataErrors.oauthReauthRequired";
        case "OAUTH_ACCESS_FAILED":
            return "common.accountDataErrors.oauthAccessFailed";
        case "NETWORK_ERROR":
        default:
            return "common.accountDataErrors.networkError";
    }
}

// ==================== Main Component ====================

function MyCardsContent() {
    const { t, formatDate } = useI18n();
    const searchParams = useSearchParams();

    // Account state
    const [accounts, setAccountsList] = useState<MoesekaiAccount[]>([]);
    const [activeAccount, setActiveAcc] = useState<MoesekaiAccount | null>(null);

    // Data state
    const [allCards, setAllCards] = useState<ICardInfo[]>([]);
    const [skills, setSkills] = useState<ISkillInfo[]>([]);
    const [userCards, setUserCards] = useState<Map<number, UserCard>>(new Map());
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingUser, setIsFetchingUser] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userError, setUserError] = useState<AccountDataErrorCode | null>(null);
    const [uploadTime, setUploadTime] = useState<string | number | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    // Filter states (same as /cards)
    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [selectedAttrs, setSelectedAttrs] = useState<CardAttribute[]>([]);
    const [selectedRarities, setSelectedRarities] = useState<CardRarityType[]>([]);
    const [selectedSupplyTypes, setSelectedSupplyTypes] = useState<string[]>([]);
    const [selectedSupportUnits, setSelectedSupportUnits] = useState<SupportUnit[]>([]);
    const [selectedSkillTypes, setSelectedSkillTypes] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<string>("rarity");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Ownership filter
    const [ownershipFilter, setOwnershipFilter] = useState<"all" | "owned" | "missing">("all");

    // Pagination with scroll restoration
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "my-cards",
        defaultDisplayCount: 30,
        increment: 30,
        isReady: !isLoading && !isFetchingUser,
    });

    // Storage key
    const STORAGE_KEY = "my_cards_filters";

    // Initialize from URL params first, then fallback to sessionStorage
    useEffect(() => {
        const chars = searchParams.get("characters");
        const units = searchParams.get("units");
        const attrs = searchParams.get("attrs");
        const rarities = searchParams.get("rarities");
        const supplyTypes = searchParams.get("supplyTypes");
        const supportUnits = searchParams.get("supportUnits");
        const skillTypes = searchParams.get("skillTypes");
        const search = searchParams.get("search");
        const sort = searchParams.get("sortBy");
        const order = searchParams.get("sortOrder");
        const ownership = searchParams.get("ownership");

        const hasUrlParams = chars || units || attrs || rarities || supplyTypes || supportUnits || skillTypes || search || sort || order || ownership;

        if (hasUrlParams) {
            if (chars) setSelectedCharacters(chars.split(",").map(Number));
            if (units) setSelectedUnitIds(units.split(","));
            if (attrs) setSelectedAttrs(attrs.split(",") as CardAttribute[]);
            if (rarities) setSelectedRarities(rarities.split(",") as CardRarityType[]);
            if (supplyTypes) setSelectedSupplyTypes(supplyTypes.split(","));
            if (supportUnits) setSelectedSupportUnits(supportUnits.split(",") as SupportUnit[]);
            if (skillTypes) setSelectedSkillTypes(skillTypes.split(","));
            if (search) setSearchQuery(search);
            if (sort) setSortBy(sort);
            if (order) setSortOrder(order as "asc" | "desc");
            if (ownership) setOwnershipFilter(ownership as "all" | "owned" | "missing");
        } else {
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const filters = JSON.parse(saved);
                    if (filters.characters?.length) setSelectedCharacters(filters.characters);
                    if (filters.units?.length) setSelectedUnitIds(filters.units);
                    if (filters.attrs?.length) setSelectedAttrs(filters.attrs);
                    if (filters.rarities?.length) setSelectedRarities(filters.rarities);
                    if (filters.supplyTypes?.length) setSelectedSupplyTypes(filters.supplyTypes);
                    if (filters.supportUnits?.length) setSelectedSupportUnits(filters.supportUnits);
                    if (filters.skillTypes?.length) setSelectedSkillTypes(filters.skillTypes);
                    if (filters.search) setSearchQuery(filters.search);
                    if (filters.sortBy) setSortBy(filters.sortBy);
                    if (filters.sortOrder) setSortOrder(filters.sortOrder);
                    if (filters.ownershipFilter) setOwnershipFilter(filters.ownershipFilter);
                }
            } catch (_e) {
                console.log("Could not restore filters from sessionStorage");
            }
        }
        setFiltersInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Save to sessionStorage and update URL when filters change
    useEffect(() => {
        if (!filtersInitialized) return;

        const filters = {
            characters: selectedCharacters,
            units: selectedUnitIds,
            attrs: selectedAttrs,
            rarities: selectedRarities,
            supplyTypes: selectedSupplyTypes,
            supportUnits: selectedSupportUnits,
            skillTypes: selectedSkillTypes,
            search: searchQuery,
            sortBy,
            sortOrder,
            ownershipFilter,
        };
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        } catch (_e) {
            console.log("Could not save filters to sessionStorage");
        }

        // Update URL
        const params = new URLSearchParams();
        if (selectedCharacters.length > 0) params.set("characters", selectedCharacters.join(","));
        if (selectedUnitIds.length > 0) params.set("units", selectedUnitIds.join(","));
        if (selectedAttrs.length > 0) params.set("attrs", selectedAttrs.join(","));
        if (selectedRarities.length > 0) params.set("rarities", selectedRarities.join(","));
        if (selectedSupplyTypes.length > 0) params.set("supplyTypes", selectedSupplyTypes.join(","));
        if (selectedSupportUnits.length > 0) params.set("supportUnits", selectedSupportUnits.join(","));
        if (selectedSkillTypes.length > 0) params.set("skillTypes", selectedSkillTypes.join(","));
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "rarity") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        if (ownershipFilter !== "all") params.set("ownership", ownershipFilter);
        replaceCurrentUrlSearchParams(params);
    }, [selectedCharacters, selectedUnitIds, selectedAttrs, selectedRarities, selectedSupplyTypes, selectedSupportUnits, selectedSkillTypes, searchQuery, sortBy, sortOrder, ownershipFilter, filtersInitialized]);

    // Load accounts
    useEffect(() => {
        const accs = getAccounts();
        setAccountsList(accs);
        const active = getActiveAccount();
        setActiveAcc(active);
    }, []);

    // Fetch masterdata when account changes
    useEffect(() => {
        if (!activeAccount) {
            setIsLoading(false);
            return;
        }

        let cancelled = false;

        async function loadMasterData() {
            setIsLoading(true);
            setError(null);

            try {
                const server = activeAccount!.server;

                // Fetch cards and supplies for the account's server
                const [cardsData, suppliesData, skillsData, translationsData] = await Promise.all([
                    fetchMasterDataForServer<ICardInfo[]>(server, "cards.json"),
                    fetchMasterDataForServer<CardSupply[]>(server, "cardSupplies.json").catch(() => []),
                    fetchMasterDataForServer<ISkillInfo[]>(server, "skills.json").catch(() => [] as ISkillInfo[]),
                    loadTranslations(),
                ]);

                if (cancelled) return;

                // Build supply type map
                const supplyTypeMap = new Map<number, string>();
                suppliesData.forEach((s) => supplyTypeMap.set(s.id, s.cardSupplyType));

                const enhanced = cardsData.map((card) => ({
                    ...card,
                    cardSupplyType: supplyTypeMap.get(card.cardSupplyId) || "normal",
                }));

                setAllCards(enhanced);
                setSkills(skillsData);
                setTranslations(translationsData);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : t("page.myCards.loadDataFailed"));
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadMasterData();
        return () => { cancelled = true; };
    }, [activeAccount, t]);

    // Fetch user cards from suite API
    useEffect(() => {
        if (!activeAccount) {
            setUserCards(new Map());
            return;
        }

        let cancelled = false;

        async function fetchUserCards() {
            setIsFetchingUser(true);
            setUserError(null);

            try {
                const data = await fetchAccountGameData(activeAccount!, ["userCards", "upload_time"]);
                // API may return { userCards: [...] } or just [...] directly
                let cards: UserCard[];
                if (Array.isArray(data)) {
                    cards = data;
                } else if (data.userCards && Array.isArray(data.userCards)) {
                    cards = data.userCards;
                } else {
                    // Try to find any array property in the response
                    const arrayProp = Object.values(data).find(v => Array.isArray(v));
                    cards = (arrayProp as UserCard[]) || [];
                }
                // Extract upload_time
                if (typeof data.upload_time === "number" || typeof data.upload_time === "string") {
                    setUploadTime(data.upload_time);
                } else {
                    setUploadTime(null);
                }
                console.log(`[MyCards] Loaded ${cards.length} user cards from API`);
                const map = new Map<number, UserCard>();
                cards.forEach((c) => map.set(c.cardId, c));

                if (!cancelled) setUserCards(map);
            } catch (error) {
                if (!cancelled) setUserError(normalizeAccountDataError(error));
            } finally {
                if (!cancelled) setIsFetchingUser(false);
            }
        }

        fetchUserCards();
        return () => { cancelled = true; };
    }, [activeAccount]);

    // Filter and sort
    const filteredCards = useMemo(() => {
        let result = [...allCards];

        if (selectedCharacters.length > 0) {
            result = result.filter((c) => selectedCharacters.includes(c.characterId));
        }
        if (selectedAttrs.length > 0) {
            result = result.filter((c) => selectedAttrs.includes(c.attr));
        }
        if (selectedRarities.length > 0) {
            result = result.filter((c) => selectedRarities.includes(c.cardRarityType));
        }
        if (selectedSupplyTypes.length > 0) {
            result = result.filter((c) => selectedSupplyTypes.includes(c.cardSupplyType));
        }
        if (selectedSupportUnits.length > 0) {
            result = result.filter((c) => {
                if (c.characterId < 21) return true;
                return selectedSupportUnits.includes(c.supportUnit);
            });
        }
        if (selectedSkillTypes.length > 0) {
            result = result.filter((c) => {
                const normalSkill = skills.find((s) => s.id === c.skillId);
                const trainedSkill = c.specialTrainingSkillId
                    ? skills.find((s) => s.id === c.specialTrainingSkillId)
                    : undefined;

                const cardSkillTypes = new Set<string>([
                    ...getCardSkillTypes(normalSkill),
                    ...getCardSkillTypes(trainedSkill),
                ]);

                return selectedSkillTypes.some((type) => cardSkillTypes.has(type));
            });
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const qNum = parseInt(q, 10);
            result = result.filter((c) => {
                if (c.id === qNum) return true;
                if (c.prefix.toLowerCase().includes(q)) return true;
                const cn = translations?.cards?.prefix?.[c.prefix];
                if (cn && cn.toLowerCase().includes(q)) return true;
                return false;
            });
        }

        // Filter released only (no spoiler on progress page)
        // Use a stable timestamp to avoid hydration mismatch
        result = result.filter((c) => (c.releaseAt || c.archivePublishedAt || 0) <= Date.now());

        // Ownership filter
        if (ownershipFilter === "owned") {
            result = result.filter((c) => userCards.has(c.id));
        } else if (ownershipFilter === "missing") {
            result = result.filter((c) => !userCards.has(c.id));
        }

        // Sort: owned cards first, then by selected criteria
        result.sort((a, b) => {
            // Primary: owned cards first
            const aOwned = userCards.has(a.id) ? 1 : 0;
            const bOwned = userCards.has(b.id) ? 1 : 0;
            if (aOwned !== bOwned) return bOwned - aOwned;

            // Secondary: selected sort criteria
            let cmp = 0;
            const ucA = userCards.get(a.id);
            const ucB = userCards.get(b.id);
            switch (sortBy) {
                case "id": cmp = a.id - b.id; break;
                case "releaseAt": cmp = (a.releaseAt || 0) - (b.releaseAt || 0); break;
                case "rarity": cmp = getRarityNumber(a.cardRarityType) - getRarityNumber(b.cardRarityType); break;
                case "skillLevel": cmp = (ucA?.skillLevel || 0) - (ucB?.skillLevel || 0); break;
                case "masterRank": cmp = (ucA?.masterRank || 0) - (ucB?.masterRank || 0); break;
                case "level": cmp = (ucA?.level || 0) - (ucB?.level || 0); break;
            }
            if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;

            // For user-data sorts, add rarity desc as secondary tiebreaker
            if (sortBy === "skillLevel" || sortBy === "masterRank" || sortBy === "level") {
                const rarityCmp = getRarityNumber(b.cardRarityType) - getRarityNumber(a.cardRarityType);
                if (rarityCmp !== 0) return rarityCmp;
            }

            // Final tiebreaker: ID desc
            return b.id - a.id;
        });

        return result;
    }, [allCards, selectedCharacters, selectedAttrs, selectedRarities, selectedSupplyTypes, selectedSupportUnits, selectedSkillTypes, skills, searchQuery, sortBy, sortOrder, ownershipFilter, userCards, translations]);

    // Progress stats
    const progressStats = useMemo(() => {
        const total = filteredCards.length;
        const owned = filteredCards.filter((c) => userCards.has(c.id)).length;
        const pct = total > 0 ? Math.round((owned / total) * 1000) / 10 : 0;
        return { total, owned, pct };
    }, [filteredCards, userCards]);

    // Displayed cards (with pagination)
    const displayedCards = useMemo(() => {
        return filteredCards.slice(0, displayCount);
    }, [filteredCards, displayCount]);

    // Reset
    const resetFilters = useCallback(() => {
        setSelectedCharacters([]);
        setSelectedUnitIds([]);
        setSelectedAttrs([]);
        setSelectedRarities([]);
        setSelectedSupplyTypes([]);
        setSelectedSupportUnits([]);
        setSelectedSkillTypes([]);
        setSearchQuery("");
        setSortBy("rarity");
        setSortOrder("desc");
        setOwnershipFilter("all");
        resetDisplayCount();
    }, [resetDisplayCount]);

    const handleSortChange = useCallback((newSortBy: string, newSortOrder: "asc" | "desc") => {
        setSortBy(newSortBy);
        setSortOrder(newSortOrder);
        resetDisplayCount();
    }, [resetDisplayCount]);

    // Extra sort options for my-cards (user card data based)
    const extraSortOptions = useMemo(() => [
        { id: "skillLevel", label: t("common.filter.sortBySkillLevel") },
        { id: "masterRank", label: t("common.filter.sortByMasterRank") },
        { id: "level", label: t("common.filter.sortByLevel") },
    ], [t]);

    const quickFilterContent = (
        <CardFilters
            selectedCharacters={selectedCharacters}
            onCharacterChange={setSelectedCharacters}
            selectedUnitIds={selectedUnitIds}
            onUnitIdsChange={setSelectedUnitIds}
            selectedAttrs={selectedAttrs}
            onAttrChange={setSelectedAttrs}
            selectedRarities={selectedRarities}
            onRarityChange={setSelectedRarities}
            selectedSupplyTypes={selectedSupplyTypes}
            onSupplyTypeChange={setSelectedSupplyTypes}
            selectedSupportUnits={selectedSupportUnits}
            onSupportUnitChange={setSelectedSupportUnits}
            selectedSkillTypes={selectedSkillTypes}
            onSkillTypeChange={setSelectedSkillTypes}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            extraSortOptions={extraSortOptions}
            onReset={resetFilters}
            totalCards={allCards.filter((c) => (c.releaseAt || c.archivePublishedAt || 0) <= Date.now()).length}
            filteredCards={filteredCards.length}
        />
    );

    useQuickFilter(t("page.myCards.filterTitle"), quickFilterContent, [
        selectedCharacters,
        selectedUnitIds,
        selectedAttrs,
        selectedRarities,
        selectedSupplyTypes,
        selectedSupportUnits,
        selectedSkillTypes,
        searchQuery,
        sortBy,
        sortOrder,
        ownershipFilter,
        allCards.length,
        filteredCards.length,
        userCards.size,
    ]);

    const handleAccountSelect = useCallback((acc: MoesekaiAccount) => {
        setActiveAccount(acc.id);
        setActiveAcc(acc);
    }, []);

    // No account state — show inline quick bind form
    if (accounts.length === 0) {
        return (
            <PageContainer className="max-w-3xl">
                <MyCardsHeader />
                <QuickBindForm
                    onAccountAdded={() => {
                        setAccountsList(getAccounts());
                        const active = getActiveAccount();
                        setActiveAcc(active);
                    }}
                    description={t("page.myCards.quickBindDescription")}
                    returnTo="/my-cards"
                />

            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <MyCardsHeader />

            {/* Account Selector with Quick Add */}
            <AccountSelectorBar
                accounts={accounts}
                activeAccount={activeAccount}
                onSelect={handleAccountSelect}
                onAccountAdded={() => {
                    setAccountsList(getAccounts());
                    const active = getActiveAccount();
                    setActiveAcc(active);
                }}
                returnTo="/my-cards"
            />


            {/* User Error */}
            {userError && (
                <Banner tone="error" title={t(getUserErrorMessageKey(userError))} className="mb-4">
                    <ExternalLink
                        href="https://haruki.seiunx.com"
                        className="mt-1 inline-block rounded-md3-xs underline focus-ring"
                    >
                        {t("common.account.goHaruki")}
                    </ExternalLink>
                </Banner>
            )}

            {/* Progress Bar */}
            {!isLoading && !isFetchingUser && userCards.size > 0 && (
                <Surface tone="low" radius="lg" className="mb-6 p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="type-title-s text-on-surface">{t("common.progress.collectionProgress")}</span>
                            {uploadTime && (
                                <span className="type-label-s text-on-surface-variant" title={t("common.data.uploadTimeTitle")}>
                                    {t("common.data.dataTime", { time: formatDate(parseUploadTimeToDate(uploadTime) ?? uploadTime, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) })}
                                </span>
                            )}
                        </div>
                        <span className="font-mono type-label-l text-primary">
                            {progressStats.owned} / {progressStats.total}
                            <span className="ml-2 type-label-s text-on-surface-variant">({progressStats.pct}%)</span>
                        </span>
                    </div>
                    <LinearProgress value={progressStats.pct / 100} aria-label={t("common.progress.collectionProgress")} />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {(["all", "owned", "missing"] as const).map((f) => (
                            <Chip
                                key={f}
                                selected={ownershipFilter === f}
                                onClick={() => setOwnershipFilter(f)}
                            >
                                {t(`common.progress.${f}`)}
                            </Chip>
                        ))}
                    </div>
                </Surface>
            )}

            {/* Error */}
            {error && (
                <ErrorState
                    title={t("common.state.loadingFailed")}
                    message={error}
                    retryLabel={t("common.action.retry")}
                    className="mb-6"
                />
            )}

            {/* Filters live in the global FilterDrawer (registered above via
                useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading || isFetchingUser ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="animate-pulse overflow-hidden rounded-md3-md bg-surface-container-low">
                                <div className="aspect-square bg-surface-container-high" />
                                <div className="space-y-1.5 p-2">
                                    <div className="h-3 w-3/4 rounded-md3-xs bg-surface-container-highest" />
                                    <div className="h-2.5 w-1/2 rounded-md3-xs bg-surface-container-high" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredCards.length === 0 ? (
                    <EmptyState title={t("page.myCards.noResult")} />
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                        {displayedCards.map((card) => {
                            const uc = userCards.get(card.id);
                            return (
                                <MyCardItem
                                    key={card.id}
                                    card={card}
                                    userCard={uc || null}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Load More / All loaded */}
                {!isLoading && (
                    <LoadMore
                        label={t("page.myCards.loadMore")}
                        shown={displayedCards.length}
                        total={filteredCards.length}
                        onLoadMore={loadMore}
                        allLoadedLabel={t("page.myCards.allLoaded", { count: filteredCards.length })}
                    />
                )}
            </div>
        </PageContainer>
    );
}

// ==================== Sub Components ====================

function MyCardsHeader() {
    const { t } = useI18n();
    return (
        <PageHeader
            align="center"
            eyebrow={t("page.myCards.badge")}
            title={t("page.myCards.title")}
            highlight={t("page.myCards.titleHighlight")}
            description={t("page.myCards.description")}
        />
    );
}

interface MyCardItemProps {
    card: ICardInfo;
    userCard: UserCard | null;
}

function MyCardItem({ card, userCard }: MyCardItemProps) {
    const { t } = useI18n();
    const isOwned = !!userCard;
    const isTrained = userCard?.specialTrainingStatus === "done";
    const showTrained = getCardDefaultTrainedStatus(card) ||
        (isTrained && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");

    return (
        <Link
            href={`/cards/${card.id}`}
            className="group state-layer focus-ring block rounded-md3-md"
            data-shortcut-item="true"
        >
            <div className={cn(
                "relative cursor-pointer overflow-hidden rounded-md3-md bg-surface-container-low transition-[box-shadow,opacity,filter] duration-200 ease-md3-standard",
                isOwned
                    ? "shadow-elev-1 hover:shadow-elev-2"
                    : "opacity-50 grayscale hover:opacity-70 hover:grayscale-0",
            )}>
                {/* Card Thumbnail */}
                <div className="relative w-full">
                    <SekaiCardThumbnail
                        card={card}
                        trained={showTrained}
                        mastery={userCard?.masterRank || 0}
                        className="w-full"
                    />

                    {/* Skill Level Badge */}
                    {isOwned && userCard && (
                        <div className="absolute right-0 top-0 m-0.5">
                            <span className="inline-block rounded-md3-xs bg-tertiary px-1 py-0.5 text-[8px] font-bold leading-none text-on-tertiary">
                                Sk.{userCard.skillLevel}
                            </span>
                        </div>
                    )}

                    {/* Not Owned Overlay */}
                    {!isOwned && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="rounded-md3-sm bg-inverse-surface/80 px-2 py-1 type-label-s text-inverse-on-surface">
                                {t("common.progress.notOwned")}
                            </span>
                        </div>
                    )}
                </div>

                {/* Card Info Footer */}
                <div className="border-t border-outline-variant px-2 py-1.5">
                    <div className="mb-0.5">
                        <TranslatedText
                            original={card.prefix}
                            category="cards"
                            field="prefix"
                            originalClassName="block truncate text-[10px] font-bold leading-tight text-on-surface transition-colors group-hover:text-primary"
                            translationClassName="block truncate text-[9px] leading-tight text-on-surface-variant"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-1">
                        <p className="flex-1 truncate text-[9px] leading-tight text-on-surface-variant">
                            {getCharacterName(t, card.characterId)}
                        </p>
                        {isOwned && userCard && (
                            <span className="flex-shrink-0 rounded-md3-xs bg-primary-container px-1 py-0.5 font-mono text-[8px] leading-none text-on-primary-container">
                                Lv.{userCard.level}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}


// ==================== Export ====================

function MyCardsLoadingFallback() {
    const { t } = useI18n();
    return <LoadingState label={t("common.state.loading")} className="min-h-[50vh]" />;
}

export default function MyCardsClient() {
    return (
        <MainLayout>
            <Suspense fallback={<MyCardsLoadingFallback />}>
                <MyCardsContent />
            </Suspense>
        </MainLayout>
    );
}
