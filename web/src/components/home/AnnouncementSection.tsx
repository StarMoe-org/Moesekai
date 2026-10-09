"use client";
import React, { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import {
    type InformationItem,
    type InformationServer,
    fetchInformationList,
    getInformationBannerUrl,
    getInformationStatus,
    getInformationStatusTone,
    getInformationTagTone,
    resolveInformationPath,
    normalizeInformationServer,
} from "@/lib/information";
import { TranslatedText } from "@/components/common/TranslatedText";
import Modal from "@/components/common/Modal";
import { Chip, EmptyState, ErrorState, Icon, LoadingIndicator } from "@/components/md3";
import { mdArticle, mdSchedule } from "@/components/md3/icons";

const SERVERS: { id: InformationServer; labelKey: string }[] = [
    { id: "jp", labelKey: "page.information.servers.jp" },
    { id: "cn", labelKey: "page.information.servers.cn" },
];

const cache: Record<InformationServer, { items: InformationItem[]; timestamp: number }> = {
    jp: { items: [], timestamp: 0 },
    cn: { items: [], timestamp: 0 },
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

function getMessageFallback(t: (key: string) => string, key: string, fallback: string) {
    const value = t(key);
    return value === key ? fallback : value;
}

// The tag chip already names the category, so the placeholder is just a quiet icon.
function BannerPlaceholder() {
    return (
        <div className="flex h-full w-full items-center justify-center bg-surface-container-high text-outline">
            <Icon path={mdArticle} size={32} />
        </div>
    );
}

function AnnouncementModal({
    item,
    server,
    onClose,
}: {
    item: InformationItem | null;
    server: InformationServer;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const { t: translateGameData } = useTranslation();
    const [loadedFrameUrl, setLoadedFrameUrl] = useState<string | null>(null);
    const frameUrl = item ? resolveInformationPath(server, item) : "";
    const isFrameLoaded = frameUrl !== "" && loadedFrameUrl === frameUrl;
    const translatedTitle = item ? translateGameData("information", "title", item.title) : null;
    const modalTitle = item
        ? translatedTitle ? `${item.title} / ${translatedTitle}` : item.title
        : t("page.information.latestAnnouncements");

    return (
        <Modal
            isOpen={!!item}
            onClose={onClose}
            title={modalTitle}
            size="xl"
        >
            {frameUrl ? (
                <div className="relative h-[72vh] min-h-[28rem] overflow-hidden rounded-md3-lg border border-outline-variant bg-surface-container-lowest">
                    {!isFrameLoaded && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-container-lowest type-body-m text-on-surface-variant">
                            <LoadingIndicator size={40} />
                            <span>{t("page.information.loadingAnnouncement")}</span>
                        </div>
                    )}
                    <iframe
                        key={frameUrl}
                        src={frameUrl}
                        title={modalTitle}
                        className="h-full w-full bg-white"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onLoad={() => setLoadedFrameUrl(frameUrl)}
                    />
                </div>
            ) : (
                <div className="rounded-md3-lg border border-dashed border-outline-variant bg-surface-container p-8 text-center type-body-m text-on-surface-variant">
                    {t("page.information.emptyAnnouncementUrl")}
                </div>
            )}
        </Modal>
    );
}

export default function AnnouncementSection() {
    const { t, formatDate } = useI18n();
    const { serverSource } = useTheme();
    const [activeServer, setActiveServer] = useState<InformationServer>(normalizeInformationServer(serverSource));
    const [announcements, setAnnouncements] = useState<InformationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<InformationItem | null>(null);
    const [imageFailures, setImageFailures] = useState<Record<number, boolean>>({});

    // Sync activeServer with serverSource on mount or when serverSource changes
    useEffect(() => {
        setActiveServer(normalizeInformationServer(serverSource));
    }, [serverSource]);

    useEffect(() => {
        let isMounted = true;
        async function fetchAnnouncements() {
            try {
                // Check Cache
                if (cache[activeServer] && Date.now() - cache[activeServer].timestamp < CACHE_DURATION) {
                    if (isMounted) {
                        setAnnouncements(cache[activeServer].items);
                        setIsLoading(false);
                    }
                    return;
                }

                if (isMounted) {
                    setIsLoading(true);
                    setError(null);
                }

                const list = await fetchInformationList(activeServer);
                // Sort by displayOrder desc, startAt desc
                const sortedList = [...list].sort((a, b) => {
                    if (b.displayOrder !== a.displayOrder) {
                        return b.displayOrder - a.displayOrder;
                    }
                    return b.startAt - a.startAt;
                });

                // Take top 3
                const top3 = sortedList.slice(0, 3);

                cache[activeServer] = {
                    items: top3,
                    timestamp: Date.now()
                };

                if (isMounted) {
                    setAnnouncements(top3);
                }
            } catch (err) {
                console.error("Failed to fetch announcements:", err);
                if (isMounted) {
                    setError(err instanceof Error ? err.message : t("page.home.announcements.loadFailedTitle"));
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        fetchAnnouncements();
        return () => {
            isMounted = false;
        };
    }, [activeServer, t]);

    const formatInfoDate = (timestamp?: number | null) => {
        if (!timestamp) return t("page.information.noEndAt");
        return formatDate(timestamp, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const handleImageError = (id: number) => {
        setImageFailures((prev) => ({ ...prev, [id]: true }));
    };

    const now = Date.now();

    return (
        <div>
            {/* Server Switcher */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {SERVERS.map((server) => (
                    <Chip
                        key={server.id}
                        selected={activeServer === server.id}
                        onClick={() => setActiveServer(server.id)}
                    >
                        <ServerRegionLabel server={server.id} label={t(server.labelKey)} />
                    </Chip>
                ))}
            </div>

            {/* Content Grid */}
            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="overflow-hidden rounded-md3-lg bg-surface-card border border-outline-variant/70">
                            <div className="aspect-[16/7] animate-pulse bg-surface-container-high" />
                            <div className="space-y-3 p-4">
                                <div className="h-4 w-20 animate-pulse rounded-full bg-surface-container-highest" />
                                <div className="h-4 w-5/6 animate-pulse rounded-full bg-surface-container-highest" />
                                <div className="h-3 w-2/3 animate-pulse rounded-full bg-surface-container-high" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : error ? (
                <ErrorState
                    title={t("page.home.announcements.loadFailedTitle")}
                    message={error}
                    retryLabel={t("common.action.retry")}
                    onRetry={() => setActiveServer(activeServer)}
                />
            ) : announcements.length === 0 ? (
                <EmptyState
                    icon={mdArticle}
                    title={t("page.home.announcements.noData")}
                    className="rounded-md3-xl bg-surface-card border border-outline-variant/70 py-10"
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {announcements.map((item) => {
                        const status = getInformationStatus(item, now);
                        const bannerUrl = getInformationBannerUrl(activeServer, item.bannerAssetbundleName);
                        const tagLabel = getMessageFallback(t, `page.information.tags.${item.informationTag}`, item.informationTag);
                        const statusLabel = t(`page.information.status.${status}`);
                        const platformLabel = item.platform === "all" ? t("page.information.platformAll") : item.platform;
                        const hasBanner = bannerUrl && !imageFailures[item.id];
                        // Dark pills hold up on any banner; on the light placeholder they would read as stains.
                        const overlayPill = hasBanner ? "bg-scrim/50 text-white" : "bg-surface-card text-on-surface-variant shadow-elev-1";

                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedItem(item)}
                                className="group state-layer focus-ring block h-full w-full cursor-pointer rounded-md3-lg text-left"
                            >
                                <article className="flex h-full flex-col overflow-hidden rounded-md3-lg bg-surface-card text-on-surface shadow-elev-1 transition-shadow duration-200 ease-md3-standard group-hover:shadow-elev-2">
                                    <div className="relative aspect-[16/7] overflow-hidden bg-surface-container-high">
                                        {hasBanner ? (
                                            <img
                                                src={bannerUrl}
                                                alt={item.title}
                                                loading="lazy"
                                                className="h-full w-full object-cover"
                                                onError={() => handleImageError(item.id)}
                                            />
                                        ) : (
                                            <BannerPlaceholder />
                                        )}
                                        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
                                            <span className={`rounded-md3-sm px-2 py-0.5 type-label-s shadow-elev-1 ${getInformationTagTone(item.informationTag)}`}>
                                                {tagLabel}
                                            </span>
                                            <span className={`rounded-md3-sm px-2 py-0.5 type-label-s ${overlayPill}`}>
                                                {platformLabel}
                                            </span>
                                        </div>
                                        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                                            <span className={`rounded-md3-sm px-2 py-0.5 type-label-s font-mono ${overlayPill}`}>
                                                #{item.id}
                                            </span>
                                            <span className={`rounded-md3-sm px-2 py-0.5 type-label-s ring-1 ${getInformationStatusTone(status)}`}>
                                                {statusLabel}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-1 flex-col p-4">
                                        <h3 className="min-h-[2.75rem] type-title-m text-on-surface transition-colors group-hover:text-primary">
                                            <TranslatedText
                                                original={item.title}
                                                category="information"
                                                field="title"
                                                originalClassName="line-clamp-2"
                                                translationClassName="line-clamp-1 type-body-s text-on-surface-variant mt-0.5"
                                            />
                                        </h3>

                                        <div className="mt-3 space-y-1.5 type-label-m text-on-surface-variant">
                                            <div className="flex items-center gap-2">
                                                <Icon path={mdSchedule} size={16} className="text-primary" />
                                                <span className="truncate">{formatInfoDate(item.startAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Details Modal */}
            <AnnouncementModal
                item={selectedItem}
                server={activeServer}
                onClose={() => setSelectedItem(null)}
            />
        </div>
    );
}
