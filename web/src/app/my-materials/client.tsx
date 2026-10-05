"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import BaseFilters, { FilterSection, FilterToggle } from "@/components/common/BaseFilters";
import {
    getAccounts,
    getActiveAccount,
    setActiveAccount,
    fetchAccountGameData,
    normalizeAccountDataError,
    type AccountDataErrorCode,
    type MoesekaiAccount,
    type ServerType,
} from "@/lib/account";

import { fetchMasterDataForServer } from "@/lib/fetch";
import { getMaterialThumbnailUrl, getMysekaiMaterialThumbnailUrl } from "@/lib/assets";
import { replaceAssetSourceRegion, useTheme } from "@/contexts/ThemeContext";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import type { IMysekaiMaterial } from "@/types/mysekai";
import AccountSelectorBar from "@/components/AccountSelectorBar";
import QuickBindForm from "@/components/QuickBindForm";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, EmptyState, ErrorState, Icon, LoadMore, LoadingState, PageContainer, PageHeader, SegmentedButton } from "@/components/md3";
import { mdInventory2 } from "@/components/md3/icons";

// ==================== Types ====================

interface MaterialMaster {
    id: number;
    seq: number;
    name: string;
    materialType: string;
}

interface UserMaterialRaw {
    materialId: number;
    quantity: number;
}

interface UserMysekaiMaterialRaw {
    mysekaiMaterialId: number;
    quantity: number;
}

interface DisplayMaterial {
    id: number;
    name: string;
    quantity: number;
    seq: number;
    thumbnailUrl: string;
}

type TabType = "materials" | "mysekaiMaterials";

// ==================== Helpers ====================

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

function getAssetSourceForServer(server: ServerType, assetSource: AssetSourceType): AssetSourceType {
    return replaceAssetSourceRegion(assetSource, server);
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

function MyMaterialsContent() {
    const { t, formatDate, formatNumber } = useI18n();
    const { assetSource } = useTheme();

    // Account state
    const [accounts, setAccountsList] = useState<MoesekaiAccount[]>([]);
    const [activeAccount, setActiveAcc] = useState<MoesekaiAccount | null>(null);

    // Data state
    const [materialsMaster, setMaterialsMaster] = useState<Map<number, MaterialMaster>>(new Map());
    const [mysekaiMaterialsMaster, setMysekaiMaterialsMaster] = useState<Map<number, IMysekaiMaterial>>(new Map());
    const [userMaterials, setUserMaterials] = useState<UserMaterialRaw[]>([]);
    const [userMysekaiMaterials, setUserMysekaiMaterials] = useState<UserMysekaiMaterialRaw[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingUser, setIsFetchingUser] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userError, setUserError] = useState<AccountDataErrorCode | null>(null);
    const [uploadTime, setUploadTime] = useState<string | number | null>(null);

    // UI state
    const [activeTab, setActiveTab] = useState<TabType>("materials");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<string>("seq");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [hideZero, setHideZero] = useState(true);

    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "my-materials",
        defaultDisplayCount: 60,
        increment: 60,
        isReady: !isLoading && !isFetchingUser,
    });

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

                const [materialsData, mysekaiMaterialsData] = await Promise.all([
                    fetchMasterDataForServer<MaterialMaster[]>(server, "materials.json").catch(() => []),
                    fetchMasterDataForServer<IMysekaiMaterial[]>(server, "mysekaiMaterials.json").catch(() => []),
                ]);

                if (cancelled) return;

                const matMap = new Map<number, MaterialMaster>();
                materialsData.forEach((m) => matMap.set(m.id, m));
                setMaterialsMaster(matMap);

                const msMatMap = new Map<number, IMysekaiMaterial>();
                mysekaiMaterialsData.forEach((m) => msMatMap.set(m.id, m));
                setMysekaiMaterialsMaster(msMatMap);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : t("page.myMaterials.loadDataFailed"));
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadMasterData();
        return () => { cancelled = true; };
    }, [activeAccount, t]);

    // Fetch user materials from suite API
    useEffect(() => {
        if (!activeAccount) {
            setUserMaterials([]);
            setUserMysekaiMaterials([]);
            return;
        }

        let cancelled = false;

        async function fetchUserMaterials() {
            setIsFetchingUser(true);
            setUserError(null);

            try {
                const data = await fetchAccountGameData(activeAccount!, ["userMaterials", "userMysekaiMaterials", "upload_time"]);

                if (!cancelled) {
                    setUserMaterials(Array.isArray(data.userMaterials) ? data.userMaterials as UserMaterialRaw[] : []);
                    setUserMysekaiMaterials(Array.isArray(data.userMysekaiMaterials) ? data.userMysekaiMaterials as UserMysekaiMaterialRaw[] : []);
                    setUploadTime(typeof data.upload_time === "number" || typeof data.upload_time === "string" ? data.upload_time : null);
                }
            } catch (error) {
                if (!cancelled) setUserError(normalizeAccountDataError(error));
            } finally {
                if (!cancelled) setIsFetchingUser(false);
            }
        }

        fetchUserMaterials();
        return () => { cancelled = true; };
    }, [activeAccount]);

    // Total items (before filter) for current tab
    const allItemsForTab = useMemo(() => {
        return activeTab === "materials" ? userMaterials.length : userMysekaiMaterials.length;
    }, [activeTab, userMaterials, userMysekaiMaterials]);

    // Build display items for regular materials
    const displayMaterials = useMemo((): DisplayMaterial[] => {
        const finalSource = activeAccount
            ? getAssetSourceForServer(activeAccount.server, assetSource)
            : assetSource;

        const items: DisplayMaterial[] = userMaterials.map((um) => {
            const master = materialsMaster.get(um.materialId);
            return {
                id: um.materialId,
                name: master?.name || t("page.myMaterials.fallbackMaterialName", { id: um.materialId }),
                quantity: um.quantity,
                seq: master?.seq ?? 999999,
                thumbnailUrl: getMaterialThumbnailUrl(um.materialId, finalSource),
            };
        });

        return filterAndSort(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userMaterials, materialsMaster, searchQuery, sortBy, sortOrder, hideZero, assetSource, activeAccount, t]);

    // Build display items for mysekai materials
    const displayMysekaiMaterials = useMemo((): DisplayMaterial[] => {
        const finalSource = activeAccount
            ? getAssetSourceForServer(activeAccount.server, assetSource)
            : assetSource;

        const items: DisplayMaterial[] = userMysekaiMaterials.map((um) => {
            const master = mysekaiMaterialsMaster.get(um.mysekaiMaterialId);
            return {
                id: um.mysekaiMaterialId,
                name: master?.name || t("page.myMaterials.fallbackMysekaiMaterialName", { id: um.mysekaiMaterialId }),
                quantity: um.quantity,
                seq: master?.seq ?? 999999,
                thumbnailUrl: master
                    ? getMysekaiMaterialThumbnailUrl(master.iconAssetbundleName, finalSource)
                    : "",
            };
        });

        return filterAndSort(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userMysekaiMaterials, mysekaiMaterialsMaster, searchQuery, sortBy, sortOrder, hideZero, assetSource, activeAccount, t]);

    // Shared filter/sort logic
    function filterAndSort(items: DisplayMaterial[]): DisplayMaterial[] {
        let result = [...items];

        if (hideZero) {
            result = result.filter((m) => m.quantity > 0);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter((m) => m.name.toLowerCase().includes(q) || String(m.id).includes(q));
        }

        result.sort((a, b) => {
            let cmp = 0;
            if (sortBy === "quantity") {
                cmp = a.quantity - b.quantity;
            } else {
                cmp = a.seq - b.seq;
            }
            if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;
            return a.id - b.id;
        });

        return result;
    }

    const currentItems = activeTab === "materials" ? displayMaterials : displayMysekaiMaterials;
    const displayedItems = useMemo(() => currentItems.slice(0, displayCount), [currentItems, displayCount]);

    const handleAccountSelect = useCallback((acc: MoesekaiAccount) => {
        setActiveAccount(acc.id);
        setActiveAcc(acc);
    }, []);

    const handleTabChange = useCallback((tab: TabType) => {
        setActiveTab(tab);
        resetDisplayCount();
    }, [resetDisplayCount]);

    const handleSortChange = useCallback((newSortBy: string, newSortOrder: "asc" | "desc") => {
        setSortBy(newSortBy);
        setSortOrder(newSortOrder);
        resetDisplayCount();
    }, [resetDisplayCount]);

    const hasActiveFilters = searchQuery !== "" || sortBy !== "seq" || !hideZero;

    const resetFilters = useCallback(() => {
        setSearchQuery("");
        setSortBy("seq");
        setSortOrder("desc");
        setHideZero(true);
        resetDisplayCount();
    }, [resetDisplayCount]);

    // Stats
    const totalQuantity = currentItems.reduce((sum, m) => sum + m.quantity, 0);

    const sortOptions = useMemo(() => [
        { id: "seq", label: t("common.filter.sortByDefault") },
        { id: "quantity", label: t("common.filter.sortByQuantity") },
    ], [t]);

    // Quick filter content (BaseFilters panel)
    const quickFilterContent = (
        <BaseFilters
            title={t("page.myMaterials.filterTitle")}
            filteredCount={currentItems.length}
            totalCount={allItemsForTab}
            countUnit={t("page.myMaterials.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={(q) => { setSearchQuery(q); resetDisplayCount(); }}
            searchPlaceholder={t("page.myMaterials.searchPlaceholder")}
            sortOptions={sortOptions}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            hasActiveFilters={hasActiveFilters}
            onReset={resetFilters}
        >
            <FilterSection label={t("common.filter.display")}>
                <FilterToggle
                    selected={hideZero}
                    onClick={() => { setHideZero(!hideZero); resetDisplayCount(); }}
                    label={t("common.filter.hideZeroMaterials")}
                />
            </FilterSection>
        </BaseFilters>
    );

    useQuickFilter(t("page.myMaterials.filterTitle"), quickFilterContent, [
        searchQuery,
        sortBy,
        sortOrder,
        hideZero,
        currentItems.length,
        allItemsForTab,
    ]);

    // No account state
    if (accounts.length === 0) {
        return (
            <PageContainer className="max-w-3xl">
                <MyMaterialsHeader />
                <QuickBindForm
                    onAccountAdded={() => {
                        setAccountsList(getAccounts());
                        const active = getActiveAccount();
                        setActiveAcc(active);
                    }}
                    description={t("page.myMaterials.quickBindDescription")}
                    returnTo="/my-materials"
                />

            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <MyMaterialsHeader />

            <AccountSelectorBar
                accounts={accounts}
                activeAccount={activeAccount}
                onSelect={handleAccountSelect}
                onAccountAdded={() => {
                    setAccountsList(getAccounts());
                    const active = getActiveAccount();
                    setActiveAcc(active);
                }}
                returnTo="/my-materials"
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

            {/* Tab Bar */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <SegmentedButton<TabType>
                    className="w-auto"
                    value={activeTab}
                    onValueChange={handleTabChange}
                    options={[
                        { value: "materials", label: t("page.myMaterials.tabs.materials") },
                        { value: "mysekaiMaterials", label: t("page.myMaterials.tabs.mysekaiMaterials") },
                    ]}
                />
                {/* Upload time badge */}
                {uploadTime && !isLoading && !isFetchingUser && (
                    <span className="ml-auto type-label-s text-on-surface-variant" title={t("common.data.uploadTimeTitle")}>
                        {t("common.data.dataTime", { time: formatDate(parseUploadTimeToDate(uploadTime) ?? uploadTime, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) })}
                    </span>
                )}
            </div>

            {/* Stats summary */}
            {!isLoading && !isFetchingUser && currentItems.length > 0 && (
                <div className="mb-4 type-body-s text-on-surface-variant">
                    {t("common.progress.totalMaterialsSummary", { count: currentItems.length, total: formatNumber(totalQuantity) })}
                </div>
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
                    <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
                ) : currentItems.length === 0 ? (
                    <EmptyState
                        icon={mdInventory2}
                        title={searchQuery ? t("page.myMaterials.noResult") : t("page.myMaterials.noData")}
                        description={!searchQuery ? t("common.data.suiteUploadHint") : undefined}
                    />
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {displayedItems.map((item) => (
                            <MaterialCard key={item.id} item={item} />
                        ))}
                    </div>
                )}

                {/* Load More / All loaded */}
                {!isLoading && !isFetchingUser && (
                    <LoadMore
                        label={t("page.myMaterials.loadMore")}
                        shown={displayedItems.length}
                        total={currentItems.length}
                        onLoadMore={loadMore}
                        allLoadedLabel={t("page.myMaterials.allLoaded", { count: currentItems.length })}
                    />
                )}
            </div>
        </PageContainer>
    );
}

// ==================== Sub Components ====================

function MyMaterialsHeader() {
    const { t } = useI18n();
    return (
        <PageHeader
            align="center"
            eyebrow={t("page.myMaterials.badge")}
            title={t("page.myMaterials.title")}
            highlight={t("page.myMaterials.titleHighlight")}
            description={t("page.myMaterials.description")}
        />
    );
}

function MaterialCard({ item }: { item: DisplayMaterial }) {
    const [imgError, setImgError] = useState(false);

    return (
        <div className="relative overflow-hidden rounded-md3-md bg-surface-container-low">
            <div className="flex aspect-square items-center justify-center bg-surface-container p-3">
                {item.thumbnailUrl && !imgError ? (
                    <img
                        src={item.thumbnailUrl}
                        alt={item.name}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <Icon path={mdInventory2} size={40} className="text-on-surface-variant opacity-60" />
                )}
            </div>
            <div className="border-t border-outline-variant px-2 py-1.5">
                <p className="text-[10px] font-bold leading-tight text-on-surface" title={item.name}>
                    {item.name}
                </p>
                <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[9px] text-on-surface-variant">#{item.id}</span>
                    <span className="rounded-md3-xs bg-primary-container px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-on-primary-container">
                        ×{item.quantity.toLocaleString()}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ==================== Export ====================

function MyMaterialsLoadingFallback() {
    const { t } = useI18n();
    return <LoadingState label={t("common.state.loading")} className="min-h-[50vh]" />;
}

export default function MyMaterialsClient() {
    return (
        <MainLayout>
            <Suspense fallback={<MyMaterialsLoadingFallback />}>
                <MyMaterialsContent />
            </Suspense>
        </MainLayout>
    );
}
