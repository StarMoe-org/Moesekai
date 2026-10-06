"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import MainLayout from "@/components/MainLayout";
import { Banner, Button, EmptyState, LoadingState, PageContainer } from "@/components/md3";
import { mdArrowBack } from "@/components/md3/icons";
import MysekaiScenePreview from "@/components/mysekai-preview/MysekaiScenePreview";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { replaceAssetSourceRegion, type AssetSourceType, useTheme } from "@/contexts/ThemeContext";
import {
    type BaijingRankingEntry,
    type BaijingRoomResponse,
    getEntryThumbnailUrl,
    getRankTone,
    getRoomUrl,
    getTabTypeLabel,
    normalizeBaijingServer,
} from "@/lib/mysekai-preview/baijing";

function HeartIcon({ className = "" }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M11.995 20.545a1.1 1.1 0 0 1-.672-.23C8.924 18.46 6.94 16.79 5.367 15.19 3.549 13.34 2.5 11.54 2.5 9.53 2.5 6.63 4.85 4.4 7.69 4.4c1.61 0 3.13.75 4.305 2.01C13.17 5.15 14.69 4.4 16.3 4.4c2.84 0 5.2 2.23 5.2 5.13 0 2.01-1.05 3.81-2.867 5.66-1.573 1.6-3.557 3.27-5.956 5.125a1.1 1.1 0 0 1-.682.23Z" />
        </svg>
    );
}

function DetailStat({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
    return (
        <div className={`rounded-md3-lg bg-surface-container px-4 py-3 ${accent ? "text-rose-500" : "text-on-surface"}`}>
            <div className="type-label-m text-on-surface-variant">{label}</div>
            <div className="mt-1 flex items-center gap-1.5 type-title-s">
                {accent && <HeartIcon className="h-4 w-4" />}
                <span>{value}</span>
            </div>
        </div>
    );
}

function MissingParamsState() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <PageContainer className="max-w-4xl">
                <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70">
                    <EmptyState
                        title={t("page.mysekaiPreview.ranking.missingParamsTitle")}
                        description={t("page.mysekaiPreview.ranking.missingParamsDescription")}
                        action={
                            <Button variant="filled" icon={mdArrowBack} href="/mysekai-preview">
                                {t("page.mysekaiPreview.ranking.backToRanking")}
                            </Button>
                        }
                    />
                </div>
            </PageContainer>
        </MainLayout>
    );
}

function RankingPreviewInner() {
    const searchParams = useSearchParams();
    const { t, formatDate, formatNumber } = useI18n();
    const { assetSource } = useTheme();
    const server = normalizeBaijingServer(searchParams.get("server"));
    const competitionId = Number(searchParams.get("competitionId"));
    const rank = Number(searchParams.get("rank"));
    const [metaState, setMetaState] = useState<{
        roomUrl: string;
        entry: BaijingRankingEntry | null;
        error: string | null;
        resolved: boolean;
    }>({ roomUrl: "", entry: null, error: null, resolved: false });

    const hasRequiredParams = Number.isFinite(competitionId) && competitionId > 0 && Number.isFinite(rank) && rank > 0;
    const roomUrl = hasRequiredParams ? getRoomUrl(server, competitionId, rank) : "";
    const previewAssetSource = useMemo<AssetSourceType>(() => replaceAssetSourceRegion(assetSource, server), [assetSource, server]);
    const activeMetaState = metaState.roomUrl === roomUrl ? metaState : null;
    const entry = activeMetaState?.entry ?? null;
    const metaError = activeMetaState?.error ?? null;
    const metaLoading = hasRequiredParams && !activeMetaState?.resolved;
    const thumbnailUrl = entry ? getEntryThumbnailUrl(server, entry) : "";
    const formatBaijingDate = (timestamp?: number) => {
        if (!timestamp) return t("page.mysekaiPreview.common.notProvided");
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return t("page.mysekaiPreview.common.notProvided");
        return formatDate(date, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    useEffect(() => {
        if (!hasRequiredParams) return;
        let cancelled = false;

        fetch(`${roomUrl}?_ts=${Date.now()}`, { cache: "no-store" })
            .then((response) => {
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                return response.json() as Promise<BaijingRoomResponse>;
            })
            .then((data) => {
                if (cancelled) return;
                setMetaState({
                    roomUrl,
                    entry: data.meta?.entry ? { ...data.meta.entry, rank: data.meta.entry.rank || rank } : null,
                    error: null,
                    resolved: true,
                });
            })
            .catch((error) => {
                if (cancelled) return;
                setMetaState({
                    roomUrl,
                    entry: null,
                    error: error instanceof Error ? error.message : String(error),
                    resolved: true,
                });
            });

        return () => {
            cancelled = true;
        };
    }, [hasRequiredParams, roomUrl, rank]);

    if (!hasRequiredParams) return <MissingParamsState />;

    return (
        <MainLayout>
            <PageContainer wide>
                <div className="mb-6">
                    <Button variant="tonal" icon={mdArrowBack} href={`/mysekai-preview?server=${server}`}>
                        {t("page.mysekaiPreview.ranking.backToRanking")}
                    </Button>
                </div>

                <section className="mb-6 overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70 p-5 sm:p-6 lg:p-7">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
                        <div className="min-w-0">
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                <span className={`rounded-md3-sm px-3 py-1.5 type-label-l ${getRankTone(rank)}`}>#{rank}</span>
                                <span className="rounded-md3-sm bg-secondary-container px-3 py-1.5 type-label-m text-on-secondary-container">
                                    {entry ? getTabTypeLabel(entry.tabType, t) : t("page.mysekaiPreview.common.baijingTop")}
                                </span>
                                <span className="rounded-md3-sm bg-surface-container-high px-3 py-1.5 type-label-m text-on-surface-variant">
                                    <ServerRegionLabel server={server} /> · {t("page.mysekaiPreview.ranking.activityStat")} #{competitionId}
                                </span>
                            </div>
                            <h1 className="line-clamp-2 type-headline-m text-on-surface sm:type-headline-l">
                                {entry?.title || (metaLoading ? t("page.mysekaiPreview.ranking.loadingEntry") : t("page.mysekaiPreview.ranking.layoutPreviewTitle"))}
                            </h1>
                            <p className="mt-3 type-title-s text-on-surface-variant">
                                {entry ? `${entry.ownerUserName || t("page.mysekaiPreview.common.unknownPlayer")} · UID ${entry.ownerUserId || "-"}` : t("page.mysekaiPreview.ranking.entryInfoPending")}
                            </p>
                            <p className="mt-3 max-w-3xl type-body-m text-on-surface-variant">
                                {entry?.comment || t("page.mysekaiPreview.ranking.defaultComment")}
                            </p>
                            {metaError && (
                                <Banner tone="warning" className="mt-4">
                                    {t("page.mysekaiPreview.ranking.metaLoadFailed", { message: metaError })}
                                </Banner>
                            )}
                            <div className="mt-5 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
                                <DetailStat label={t("page.mysekaiPreview.ranking.serverStat")} value={<ServerRegionLabel server={server} />} />
                                <DetailStat label={t("page.mysekaiPreview.ranking.activityStat")} value={`#${competitionId}`} />
                                <DetailStat label={t("page.mysekaiPreview.ranking.rankStat")} value={`#${rank}`} />
                                <DetailStat label={t("page.mysekaiPreview.common.likes")} value={entry ? formatNumber(Number(entry.reviewCount || 0)) : "-"} accent />
                            </div>
                            {entry?.submittedAt && (
                                <div className="mt-3 type-label-m text-on-surface-variant">
                                    {t("page.mysekaiPreview.common.submittedAt", { time: formatBaijingDate(entry.submittedAt) })}
                                </div>
                            )}
                        </div>

                        <div className="order-first lg:order-none">
                            <div className="aspect-[4/3] overflow-hidden rounded-md3-xl bg-surface-container">
                                {thumbnailUrl ? (
                                    <img src={thumbnailUrl} alt={entry?.title || t("page.mysekaiPreview.ranking.thumbnailAlt")} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center type-body-m text-outline">
                                        {metaLoading ? t("page.mysekaiPreview.ranking.loadingThumbnail") : t("page.mysekaiPreview.common.noImage")}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70 p-4 sm:p-5">
                    <MysekaiScenePreview
                        key={`${server}-${competitionId}-${rank}`}
                        defaultLayoutUrl={roomUrl}
                        assetSourceOverride={previewAssetSource}
                        persistOptionsEnabled={false}
                        showLayoutUrlInput={false}
                        headerTitle={`#${rank} ${entry?.title || t("page.mysekaiPreview.ranking.layoutFallback")}`}
                        headerBadge={t("page.mysekaiPreview.common.baijingTop")}
                        headerNote=""
                        heightClassName="h-[min(76vh,760px)] min-h-[560px]"
                        compact
                    />
                </section>
            </PageContainer>
        </MainLayout>
    );
}

function RankingPreviewFallback() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <LoadingState label={t("page.mysekaiPreview.ranking.suspenseLoading")} />
        </MainLayout>
    );
}

export default function MysekaiRankingPreviewClient() {
    return (
        <Suspense fallback={<RankingPreviewFallback />}>
            <RankingPreviewInner />
        </Suspense>
    );
}
