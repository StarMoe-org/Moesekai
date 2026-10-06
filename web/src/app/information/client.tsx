"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Modal from "@/components/common/Modal";

import BaseFilters, { FilterButton, FilterSection } from "@/components/common/BaseFilters";
import { TranslatedText } from "@/components/common/TranslatedText";
import MainLayout from "@/components/MainLayout";
import { EmptyState as Md3EmptyState, ErrorState as Md3ErrorState, Icon, LoadingIndicator, PageContainer, PageHeader, cn } from "@/components/md3";
import { mdArticle, mdCalendarMonth, mdDescription, mdSchedule } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "@/contexts/TranslationContext";
import {
    type InformationItem,
    type InformationServer,
    type InformationStatus,
    fetchInformationList,
    getInformationBannerUrl,
    getInformationStatus,
    resolveInformationPath,
    normalizeInformationServer,
} from "@/lib/information";

const ALL_FILTER = "all";
type SortKey = "displayOrder" | "startAt" | "endAt" | "id";

type SortOrder = "asc" | "desc";

const TAG_ORDER = ["information", "event", "gacha", "music", "campaign", "bug", "update"];
const TYPE_ORDER = ["normal", "content", "bug"];
const STATUS_ORDER: InformationStatus[] = ["ongoing", "permanent", "upcoming", "ended"];

function getMessageFallback(t: (key: string) => string, key: string, fallback: string) {
    const value = t(key);
    return value === key ? fallback : value;
}

/** Announcement tag colors (content category data colors; neutral/info tags use MD3 roles). */
function getTagToneClass(tag?: string) {
    switch (tag) {
        case "event":
            return "bg-pink-600 text-white";
        case "gacha":
            return "bg-purple-600 text-white";
        case "music":
            return "bg-sky-600 text-white";
        case "campaign":
            return "bg-amber-600 text-white";
        case "bug":
            return "bg-error text-on-error";
        case "update":
            return "bg-emerald-600 text-white";
        case "information":
            return "bg-primary text-on-primary";
        default:
            return "bg-inverse-surface text-inverse-on-surface";
    }
}

function getStatusToneClass(status: InformationStatus) {
    switch (status) {
        case "upcoming":
            return "bg-tertiary-container text-on-tertiary-container";
        case "ongoing":
            return "bg-primary-container text-on-primary-container";
        case "ended":
            return "bg-surface-container-highest text-on-surface-variant";
        case "permanent":
        default:
            return "bg-secondary-container text-on-secondary-container";
    }
}

function EmptyState() {
    const { t } = useI18n();

    return (
        <Md3EmptyState
            icon={mdDescription}
            title={t("page.information.emptyTitle")}
            description={t("page.information.emptyDescription")}
            className="rounded-md3-xl bg-surface-container-low"
        />
    );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
    const { t } = useI18n();

    return (
        <Md3ErrorState
            title={t("page.information.loadFailedTitle")}
            message={message}
            retryLabel={t("common.action.retry")}
            onRetry={onRetry}
        />
    );
}

function InformationSkeleton() {
    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-md3-md bg-surface-container-low">
                    <div className="aspect-[16/7] animate-pulse bg-surface-container-highest" />
                    <div className="space-y-3 p-4">
                        <div className="h-4 w-20 animate-pulse rounded-full bg-surface-container-highest" />
                        <div className="h-4 w-5/6 animate-pulse rounded-full bg-surface-container-highest" />
                        <div className="h-3 w-2/3 animate-pulse rounded-full bg-surface-container-highest" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function BannerPlaceholder({ tagLabel }: { tagLabel: string }) {
    return (
        <div className="flex h-full w-full items-center justify-center bg-primary-container text-on-primary-container">
            <div className="flex flex-col items-center gap-2 opacity-80">
                <Icon path={mdArticle} size={40} />
                <span className="type-label-l">{tagLabel}</span>
            </div>
        </div>
    );
}

function InformationCard({
    item,
    server,
    now,
    onOpen,
}: {
    item: InformationItem;
    server: InformationServer;
    now: number;
    onOpen: (item: InformationItem) => void;
}) {
    const { t, formatDate } = useI18n();
    const [imageFailed, setImageFailed] = useState(false);
    const status = getInformationStatus(item, now);
    const bannerUrl = getInformationBannerUrl(server, item.bannerAssetbundleName);
    const tagLabel = getMessageFallback(t, `page.information.tags.${item.informationTag}`, item.informationTag);
    const typeLabel = getMessageFallback(t, `page.information.types.${item.informationType}`, item.informationType);
    const browseLabel = getMessageFallback(t, `page.information.browseTypes.${item.browseType}`, item.browseType);
    const statusLabel = t(`page.information.status.${status}`);
    const platformLabel = item.platform === "all" ? t("page.information.platformAll") : item.platform;

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

    return (
        <button
            type="button"
            onClick={() => onOpen(item)}
            data-shortcut-item="true"
            className="group block h-full w-full cursor-pointer rounded-md3-md text-left focus-ring"
        >
            <article className="state-layer relative flex h-full flex-col overflow-hidden rounded-md3-md bg-surface-card text-on-surface shadow-elev-1 transition-shadow duration-200 ease-md3-standard group-hover:shadow-elev-2">
                <div className="relative aspect-[16/7] overflow-hidden bg-surface-container-high">
                    {bannerUrl && !imageFailed ? (
                        <img
                            src={bannerUrl}
                            alt={item.title}
                            loading="lazy"
                            className="h-full w-full object-cover"
                            onError={() => setImageFailed(true)}
                        />
                    ) : (
                        <BannerPlaceholder tagLabel={tagLabel} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-scrim/45 via-transparent to-scrim/10 opacity-80" />
                    <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
                        <span className={cn("rounded-full px-2.5 py-1 type-label-s shadow-elev-1", getTagToneClass(item.informationTag))}>
                            {tagLabel}
                        </span>
                        <span className="rounded-full bg-inverse-surface/80 px-2.5 py-1 type-label-s text-inverse-on-surface shadow-elev-1">
                            {platformLabel}
                        </span>
                    </div>
                    <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                        <span className="rounded-full bg-inverse-surface/80 px-2.5 py-1 type-label-s font-mono text-inverse-on-surface">
                            #{item.id}
                        </span>
                        <span className={cn("rounded-full px-2.5 py-1 type-label-s", getStatusToneClass(status))}>
                            {statusLabel}
                        </span>
                    </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 type-label-s text-on-surface-variant">
                        <span className="rounded-md3-xs bg-surface-container-high px-2 py-0.5">{typeLabel}</span>
                        <span className="rounded-md3-xs bg-surface-container-high px-2 py-0.5">{browseLabel}</span>
                        {item.channels && (
                            <span className="line-clamp-1 rounded-md3-xs bg-secondary-container px-2 py-0.5 text-on-secondary-container">{item.channels}</span>
                        )}
                    </div>

                    <h3 className="min-h-[3.5rem] type-title-s text-on-surface transition-colors group-hover:text-primary sm:type-title-m">
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
                            <Icon path={mdSchedule} size={14} className="text-primary" />
                            <span className="truncate">{formatInfoDate(item.startAt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Icon path={mdCalendarMonth} size={14} />
                            <span className="truncate">{formatInfoDate(item.endAt)}</span>
                        </div>
                    </div>
                </div>
            </article>
        </button>
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
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-container-lowest/90 type-body-m text-on-surface-variant">
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

export default function InformationClient() {
    const { t } = useI18n();
    const { serverSource } = useTheme();
    const { translations } = useTranslation();
    const server: InformationServer = normalizeInformationServer(serverSource);
    const [items, setItems] = useState<InformationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [tagFilter, setTagFilter] = useState(ALL_FILTER);
    const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
    const [statusFilter, setStatusFilter] = useState<typeof ALL_FILTER | InformationStatus>(ALL_FILTER);
    const [sortBy, setSortBy] = useState<SortKey>("displayOrder");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
    const [now, setNow] = useState(() => Date.now());
    const [selectedItem, setSelectedItem] = useState<InformationItem | null>(null);

    const loadInformation = useCallback(async (targetServer: InformationServer) => {
        setLoading(true);
        setError(null);
        try {
            const list = await fetchInformationList(targetServer);
            setItems(list);
        } catch (loadError) {
            setItems([]);
            setError(loadError instanceof Error ? loadError.message : String(loadError));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setTagFilter(ALL_FILTER);
        setTypeFilter(ALL_FILTER);
        setStatusFilter(ALL_FILTER);
        void loadInformation(server);
    }, [loadInformation, server]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const tagOptions = useMemo(() => {
        const tags = [...new Set(items.map((item) => item.informationTag).filter(Boolean))];
        return tags.sort((a, b) => {
            const aIndex = TAG_ORDER.indexOf(a);
            const bIndex = TAG_ORDER.indexOf(b);
            if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
            return a.localeCompare(b);
        });
    }, [items]);

    const typeOptions = useMemo(() => {
        const types = [...new Set(items.map((item) => item.informationType).filter(Boolean))];
        return types.sort((a, b) => {
            const aIndex = TYPE_ORDER.indexOf(a);
            const bIndex = TYPE_ORDER.indexOf(b);
            if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
            return a.localeCompare(b);
        });
    }, [items]);

    const filteredItems = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const normalizedSortOrder = sortOrder === "asc" ? 1 : -1;
        const titleTranslations = translations?.information?.title;

        return items
            .filter((item) => {
                const status = getInformationStatus(item, now);
                if (tagFilter !== ALL_FILTER && item.informationTag !== tagFilter) return false;
                if (typeFilter !== ALL_FILTER && item.informationType !== typeFilter) return false;
                if (statusFilter !== ALL_FILTER && status !== statusFilter) return false;
                if (!query) return true;

                const haystack = [
                    item.id,
                    item.title,
                    titleTranslations?.[item.title],
                    item.informationTag,
                    item.informationType,
                    item.platform,
                    item.channels,
                ].filter(Boolean).join(" ").toLowerCase();
                return haystack.includes(query);
            })
            .sort((a, b) => {
                const valueOf = (item: InformationItem) => {
                    if (sortBy === "endAt") return item.endAt || Number.MAX_SAFE_INTEGER;
                    return Number(item[sortBy] || 0);
                };
                const primary = (valueOf(a) - valueOf(b)) * normalizedSortOrder;
                if (primary !== 0) return primary;
                return (Number(a.startAt || 0) - Number(b.startAt || 0)) * -1;
            });
    }, [items, now, searchQuery, sortBy, sortOrder, statusFilter, tagFilter, translations, typeFilter]);

    const hasActiveFilters = searchQuery.trim() !== "" || tagFilter !== ALL_FILTER || typeFilter !== ALL_FILTER || statusFilter !== ALL_FILTER || sortBy !== "displayOrder" || sortOrder !== "desc";

    const resetFilters = () => {
        setSearchQuery("");
        setTagFilter(ALL_FILTER);
        setTypeFilter(ALL_FILTER);
        setStatusFilter(ALL_FILTER);
        setSortBy("displayOrder");
        setSortOrder("desc");
    };

    const sortOptions = [
        { id: "displayOrder", label: t("page.information.sort.displayOrder") },
        { id: "startAt", label: t("common.filter.sortByStartAt") },
        { id: "endAt", label: t("common.filter.sortByEndAt") },
        { id: "id", label: t("common.filter.sortById") },
    ];

    return (
        <MainLayout>
            <PageContainer wide>
                <PageHeader
                    align="center"
                    eyebrow={t("page.information.badge")}
                    title={t("page.information.title")}
                    highlight={t("page.information.titleHighlight")}
                    description={t("page.information.description")}
                />

                <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
                    <aside className="lg:sticky lg:top-24 lg:self-start">
                        <BaseFilters
                            variant="card"
                            title={t("page.information.filterTitle")}
                            filteredCount={filteredItems.length}
                            totalCount={items.length}
                            countUnit={t("page.information.countUnit")}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            searchPlaceholder={t("page.information.searchPlaceholder")}
                            sortOptions={sortOptions}
                            sortBy={sortBy}
                            sortOrder={sortOrder}
                            onSortChange={(nextSortBy, nextSortOrder) => {
                                setSortBy(nextSortBy as SortKey);
                                setSortOrder(nextSortOrder);
                            }}
                            hasActiveFilters={hasActiveFilters}
                            onReset={resetFilters}
                        >
                            <FilterSection label={t("page.information.statusFilter")}> 
                                <div className="flex flex-wrap gap-2">
                                    <FilterButton selected={statusFilter === ALL_FILTER} onClick={() => setStatusFilter(ALL_FILTER)}>
                                        {t("common.filter.all")}
                                    </FilterButton>
                                    {STATUS_ORDER.map((status) => (
                                        <FilterButton key={status} selected={statusFilter === status} onClick={() => setStatusFilter(status)}>
                                            {t(`page.information.status.${status}`)}
                                        </FilterButton>
                                    ))}
                                </div>
                            </FilterSection>

                            <FilterSection label={t("page.information.tagFilter")}> 
                                <div className="flex flex-wrap gap-2">
                                    <FilterButton selected={tagFilter === ALL_FILTER} onClick={() => setTagFilter(ALL_FILTER)}>
                                        {t("common.filter.all")}
                                    </FilterButton>
                                    {tagOptions.map((tag) => (
                                        <FilterButton key={tag} selected={tagFilter === tag} onClick={() => setTagFilter(tag)}>
                                            {getMessageFallback(t, `page.information.tags.${tag}`, tag)}
                                        </FilterButton>
                                    ))}
                                </div>
                            </FilterSection>

                            <FilterSection label={t("page.information.typeFilter")}> 
                                <div className="flex flex-wrap gap-2">
                                    <FilterButton selected={typeFilter === ALL_FILTER} onClick={() => setTypeFilter(ALL_FILTER)}>
                                        {t("common.filter.all")}
                                    </FilterButton>
                                    {typeOptions.map((type) => (
                                        <FilterButton key={type} selected={typeFilter === type} onClick={() => setTypeFilter(type)}>
                                            {getMessageFallback(t, `page.information.types.${type}`, type)}
                                        </FilterButton>
                                    ))}
                                </div>
                            </FilterSection>
                        </BaseFilters>
                    </aside>

                    <section className="min-w-0">
                        {loading ? (
                            <InformationSkeleton />
                        ) : error ? (
                            <ErrorState message={error} onRetry={() => void loadInformation(server)} />
                        ) : filteredItems.length === 0 ? (
                            <EmptyState />
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {filteredItems.map((item) => (
                                    <InformationCard
                                        key={`${server}-${item.id}`}
                                        item={item}
                                        server={server}
                                        now={now}
                                        onOpen={setSelectedItem}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </PageContainer>
            <AnnouncementModal
                item={selectedItem}
                server={server}
                onClose={() => setSelectedItem(null)}
            />
        </MainLayout>
    );
}
