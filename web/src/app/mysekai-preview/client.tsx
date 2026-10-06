"use client";

import Link from "@/components/LocalizedLink";
import { useCallback, useEffect, useState } from "react";

import MainLayout from "@/components/MainLayout";
import { Banner, Button, Chip, EmptyState, ErrorState, Icon, PageContainer, PageHeader, Surface } from "@/components/md3";
import { mdArrowForward, mdHome, mdImage, mdRefresh } from "@/components/md3/icons";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme, type ServerSourceType } from "@/contexts/ThemeContext";
import {
    type BaijingActiveRankingsResponse,
    type BaijingRankingEntry,
    type BaijingRankingSnapshot,
    type BaijingServer,
    getActiveRankingsUrl,
    getEntryThumbnailUrl,
    getRankTone,
    getTabTypeLabel,
} from "@/lib/mysekai-preview/baijing";

function RankingSkeleton() {
    return (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70 p-3">
                    <div className="aspect-[4/3] animate-pulse rounded-md3-lg bg-surface-container-high" />
                    <div className="mt-4 space-y-2 px-1 pb-2">
                        <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-container-high" />
                        <div className="h-3 w-full animate-pulse rounded-full bg-surface-container-high" />
                        <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-container-high" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function PreviewEmptyState({ server }: { server: BaijingServer }) {
    const { t } = useI18n();

    return (
        <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70">
            <EmptyState
                icon={mdHome}
                title={t("page.mysekaiPreview.top.emptyTitle", { server: t(SERVER_LABEL_KEYS[server]) })}
                description={t("page.mysekaiPreview.top.emptyDescription")}
            />
        </div>
    );
}

function PreviewErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
    const { t } = useI18n();

    return (
        <ErrorState
            title={t("page.mysekaiPreview.top.loadFailedTitle")}
            message={message}
            retryLabel={t("page.mysekaiPreview.top.reload")}
            onRetry={onRetry}
        />
    );
}

function HeartIcon({ className = "" }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M11.995 20.545a1.1 1.1 0 0 1-.672-.23C8.924 18.46 6.94 16.79 5.367 15.19 3.549 13.34 2.5 11.54 2.5 9.53 2.5 6.63 4.85 4.4 7.69 4.4c1.61 0 3.13.75 4.305 2.01C13.17 5.15 14.69 4.4 16.3 4.4c2.84 0 5.2 2.23 5.2 5.13 0 2.01-1.05 3.81-2.867 5.66-1.573 1.6-3.557 3.27-5.956 5.125a1.1 1.1 0 0 1-.682.23Z" />
        </svg>
    );
}

function RankingCard({
    server,
    competitionId,
    entry,
}: {
    server: BaijingServer;
    competitionId: number;
    entry: BaijingRankingEntry;
}) {
    const { t, formatNumber } = useI18n();
    const [imageFailed, setImageFailed] = useState(false);
    const thumbnailUrl = getEntryThumbnailUrl(server, entry);
    const href = `/mysekai-preview/ranking?server=${server}&competitionId=${competitionId}&rank=${entry.rank}`;

    return (
        <Link
            href={href}
            data-shortcut-item="true"
            className="state-layer focus-ring group block h-full overflow-hidden rounded-md3-xl bg-surface-card p-3 text-left shadow-elev-1 transition-shadow duration-200 ease-md3-standard hover:shadow-elev-2"
        >
            <div className="aspect-[4/3] overflow-hidden rounded-md3-lg bg-surface-container">
                {thumbnailUrl && !imageFailed ? (
                    <img
                        src={thumbnailUrl}
                        alt={entry.title || `Rank ${entry.rank}`}
                        className="h-full w-full object-cover transition duration-500"
                        loading="lazy"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-outline">
                        <Icon path={mdImage} size={48} />
                    </div>
                )}
            </div>

            <div className="px-1 pb-1 pt-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md3-sm px-3 py-1.5 type-label-l ${getRankTone(entry.rank)}`}>
                        #{entry.rank}
                    </span>
                    <span className="rounded-md3-sm bg-secondary-container px-3 py-1.5 type-label-m text-on-secondary-container">
                        {getTabTypeLabel(entry.tabType, t)}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-md3-sm bg-surface-container-high px-3 py-1.5 type-label-m text-rose-500">
                        <HeartIcon className="h-3.5 w-3.5" />
                        <span className="text-on-surface-variant">{t("page.mysekaiPreview.common.likes")}</span>
                        <span>{formatNumber(Number(entry.reviewCount || 0))}</span>
                    </span>
                </div>

                <h3 className="line-clamp-2 min-h-[2.5rem] type-title-m text-on-surface">
                    {entry.title || t("page.mysekaiPreview.common.unnamedLayout")}
                </h3>
                <div className="mt-2 min-w-0">
                    <div className="truncate type-title-s text-on-surface">{entry.ownerUserName || t("page.mysekaiPreview.common.unknownPlayer")}</div>
                    <div className="mt-0.5 truncate type-label-m text-on-surface-variant">UID {entry.ownerUserId || "-"}</div>
                </div>
                <p className="mt-3 line-clamp-2 min-h-[2.5rem] type-body-s text-on-surface-variant">
                    {entry.comment || t("page.mysekaiPreview.common.noComment")}
                </p>
                <div className="mt-4 flex items-center justify-between rounded-md3-md bg-surface-container px-3 py-2 type-label-l text-on-surface-variant transition-colors group-hover:bg-primary-container group-hover:text-on-primary-container">
                    <span>{t("page.mysekaiPreview.top.enterPreview")}</span>
                    <Icon path={mdArrowForward} size={18} />
                </div>
            </div>
        </Link>
    );
}

export default function MysekaiPreviewClient() {
    const { t, formatNumber, formatDate } = useI18n();
    const { serverSource, setServerSource } = useTheme();
    const [server, setServer] = useState<BaijingServer>(serverSource === "cn" ? "cn" : "jp");
    const [rankings, setRankings] = useState<BaijingRankingSnapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadRankings = useCallback(async (targetServer: BaijingServer) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${getActiveRankingsUrl(targetServer)}?_ts=${Date.now()}`, { cache: "no-store" });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const data = await response.json() as BaijingActiveRankingsResponse;
            const nextRankings = (data.rankings || []).map((snapshot) => ({
                ...snapshot,
                server: (snapshot.server || targetServer) as BaijingServer,
                top100: Array.isArray(snapshot.top100) ? snapshot.top100 : [],
            }));
            setRankings(nextRankings);
        } catch (loadError) {
            setRankings([]);
            setError(loadError instanceof Error ? loadError.message : String(loadError));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setServer(serverSource === "cn" ? "cn" : "jp");
    }, [serverSource]);

    useEffect(() => {
        void loadRankings(server);
    }, [loadRankings, server]);

    const handleServerChange = (nextServer: BaijingServer) => {
        setServer(nextServer);
        setServerSource(nextServer as ServerSourceType);
    };

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

    return (
        <MainLayout>
            <PageContainer wide>
                <PageHeader
                    align="center"
                    eyebrow={t("page.mysekaiPreview.badges.top")}
                    title={t("page.mysekaiPreview.top.title")}
                    highlight={t("page.mysekaiPreview.top.titleHighlight")}
                    description={t("page.mysekaiPreview.top.description")}
                />

                <Banner tone="info" className="mb-6">{t("page.mysekaiPreview.top.disclaimer")}</Banner>

                <Surface tone="card" className="mb-6 p-3 sm:p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md3-md bg-primary px-4 py-2 type-label-l text-on-primary">
                                {t("page.mysekaiPreview.common.topRanking")}
                            </span>
                            <span className="rounded-md3-md bg-surface-container-high px-4 py-2 type-label-l text-on-surface-variant">
                                {loading ? t("page.mysekaiPreview.common.loading") : t("page.mysekaiPreview.common.activityCount", { count: formatNumber(rankings.length) })}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 type-label-l text-on-surface-variant">{t("common.form.server")}</span>
                            {(["jp", "cn"] as BaijingServer[]).map((item) => (
                                <Chip key={item} selected={server === item} onClick={() => handleServerChange(item)}>
                                    <ServerRegionLabel server={item} />
                                </Chip>
                            ))}
                            <Button variant="tonal" size="xs" icon={mdRefresh} onClick={() => void loadRankings(server)}>
                                {t("page.mysekaiPreview.top.refresh")}
                            </Button>
                        </div>
                    </div>
                </Surface>

                <section className="space-y-6">
                    {loading ? (
                        <RankingSkeleton />
                    ) : error ? (
                        <PreviewErrorState message={error} onRetry={() => void loadRankings(server)} />
                    ) : rankings.length === 0 ? (
                        <PreviewEmptyState server={server} />
                    ) : (
                        rankings.map((snapshot) => {
                            const entries = snapshot.top100 || [];
                            return (
                                <Surface key={snapshot.competition.id} tone="card" className="p-4 sm:p-5">
                                    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="type-headline-s text-on-surface">{snapshot.competition.name || t("page.mysekaiPreview.common.activityWithId", { id: snapshot.competition.id })}</h2>
                                                <span className="rounded-md3-sm bg-primary-container px-3 py-1 type-label-l text-on-primary-container">
                                                    #{snapshot.competition.id}
                                                </span>
                                            </div>
                                            <p className="mt-2 max-w-3xl type-body-m text-on-surface-variant">
                                                {snapshot.competition.description || t("page.mysekaiPreview.common.noCompetitionDescription")}
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2 type-label-m text-on-surface-variant">
                                                <span className="rounded-md3-sm bg-surface-container-high px-3 py-1">{t("page.mysekaiPreview.common.submission")} {formatBaijingDate(snapshot.competition.submitStartAt)} - {formatBaijingDate(snapshot.competition.submitEndAt)}</span>
                                                <span className="rounded-md3-sm bg-surface-container-high px-3 py-1">{t("page.mysekaiPreview.common.aggregate")} {formatBaijingDate(snapshot.competition.aggregateAt)}</span>
                                                <span className="rounded-md3-sm bg-surface-container-high px-3 py-1">{t("page.mysekaiPreview.common.snapshot")} {formatBaijingDate(snapshot.snapshotGeneratedAt)}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 text-center">
                                            <div className="rounded-md3-lg bg-surface-container px-4 py-3">
                                                <div className="type-label-s text-on-surface-variant">{t("page.mysekaiPreview.common.totalEntries")}</div>
                                                <div className="type-title-l text-on-surface">{formatNumber(Number(snapshot.totalUniqueEntries || 0))}</div>
                                            </div>
                                            <div className="rounded-md3-lg bg-surface-container px-4 py-3">
                                                <div className="type-label-s text-on-surface-variant">{t("page.mysekaiPreview.common.topCount")}</div>
                                                <div className="type-title-l text-on-surface">{formatNumber(entries.length)}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {entries.length === 0 ? (
                                        <PreviewEmptyState server={server} />
                                    ) : (
                                        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                            {entries.map((entry) => (
                                                <RankingCard
                                                    key={`${snapshot.competition.id}-${entry.rank}-${entry.key || entry.ownerUserId || "entry"}`}
                                                    server={server}
                                                    competitionId={Number(snapshot.competition.id)}
                                                    entry={entry}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </Surface>
                            );
                        })
                    )}
                </section>
            </PageContainer>
        </MainLayout>
    );
}
