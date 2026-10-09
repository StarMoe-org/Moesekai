"use client";
import { Banner, Card, EmptyState, ErrorState, Icon, LoadMore, LoadingState, PageContainer, PageHeader, cardClassName } from "@/components/md3";
import { mdChevronRight, mdHandyman, mdMenuBook, mdOpenInNew } from "@/components/md3/icons";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterSection, FilterButton } from "@/components/common/BaseFilters";
import ExternalLink from "@/components/ExternalLink";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { fetchGuidesIndex, type GuideEntry, type GuidesIndex } from "@/lib/guides";

// Category tag tone mapping (MD3 tonal containers)
const categoryTones: Record<string, string> = {
    gacha: "bg-tertiary-container text-on-tertiary-container",
    event: "bg-primary-container text-on-primary-container",
    team: "bg-secondary-container text-on-secondary-container",
    beginner: "bg-primary text-on-primary",
    system: "bg-surface-container-highest text-on-surface-variant",
};

function GuidesContent() {
    const searchParams = useSearchParams();
    const { t } = useI18n();

    const [indexData, setIndexData] = useState<GuidesIndex | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Scroll restore
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "guides",
        defaultDisplayCount: 20,
        increment: 20,
        isReady: !isLoading,
    });

    // Restore URL params on mount
    useEffect(() => {
        const search = searchParams.get("search");
        const category = searchParams.get("category");
        const sort = searchParams.get("sortOrder");
        if (search) setSearchQuery(search);
        if (category) setSelectedCategory(category);
        if (sort === "asc" || sort === "desc") setSortOrder(sort);
    }, [searchParams]);

    // Update URL when filters change
    const updateURL = useCallback((params: Record<string, string>) => {
        const url = new URL(window.location.href);
        Object.entries(params).forEach(([k, v]) =>
            v && v !== "all" && v !== "desc" ? url.searchParams.set(k, v) : url.searchParams.delete(k)
        );
        window.history.replaceState({}, "", url.toString());
    }, []);

    // Fetch index
    useEffect(() => {
        async function load() {
            try {
                setIsLoading(true);
                const data = await fetchGuidesIndex();
                setIndexData(data);
                setError(null);
            } catch (err) {
                console.error("Error fetching guides index:", err);
                setError(err instanceof Error ? err.message : t("page.guides.loadFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [t]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const guides = indexData?.guides ?? [];
    const categories = indexData?.categories ?? {};

    // Filter and sort
    const filteredGuides = useMemo(() => {
        let result = [...guides];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                (g) =>
                    g.title.toLowerCase().includes(q) ||
                    g.tags.some((t) => t.toLowerCase().includes(q))
            );
        }

        if (selectedCategory !== "all") {
            result = result.filter((g) => g.category === selectedCategory);
        }

        result.sort((a, b) =>
            sortOrder === "asc"
                ? a.date.localeCompare(b.date)
                : b.date.localeCompare(a.date)
        );

        return result;
    }, [guides, searchQuery, selectedCategory, sortOrder]);

    const displayedGuides = useMemo(
        () => filteredGuides.slice(0, displayCount),
        [filteredGuides, displayCount]
    );

    // Reset display count on filter change
    useEffect(() => {
        resetDisplayCount();
        updateURL({ search: searchQuery, category: selectedCategory, sortOrder });
    }, [searchQuery, selectedCategory, sortOrder, resetDisplayCount, updateURL]);

    const hasActiveFilters = searchQuery !== "" || selectedCategory !== "all" || sortOrder !== "desc";

    const resetFilters = () => {
        setSearchQuery("");
        setSelectedCategory("all");
        setSortOrder("desc");
    };

    const quickFilterContent = (
        <BaseFilters
            title={t("page.guides.filterTitle")}
            filteredCount={filteredGuides.length}
            totalCount={guides.length}
            countUnit={t("page.guides.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("page.guides.searchPlaceholder")}
            sortOptions={[{ id: "date", label: t("common.filter.sortByDate") }]}
            sortBy="date"
            sortOrder={sortOrder}
            onSortChange={(_: string, order: "asc" | "desc") => setSortOrder(order)}
            hasActiveFilters={hasActiveFilters}
            onReset={resetFilters}
        >
            <FilterSection label={t("common.filter.category")}>
                <div className="flex flex-wrap gap-2">
                    <FilterButton
                        selected={selectedCategory === "all"}
                        onClick={() => setSelectedCategory("all")}
                    >
                        {t("common.filter.all")}
                    </FilterButton>
                    {Object.entries(categories).map(([key, label]) => (
                        <FilterButton
                            key={key}
                            selected={selectedCategory === key}
                            onClick={() => setSelectedCategory(key)}
                        >
                            {label}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>
        </BaseFilters>
    );

    useQuickFilter(t("page.guides.filterTitle"), quickFilterContent, [
        searchQuery,
        selectedCategory,
        sortOrder,
        filteredGuides.length,
        guides.length,
        t,
    ]);

    return (
        <PageContainer>
            <PageHeader
                eyebrow={t("page.guides.badge")}
                title={t("page.guides.title")}
                highlight={t("page.guides.titleHighlight")}
                description={t("page.guides.description")}
            />

            <Banner tone="warning" className="mb-6">
                {t("page.guides.machineTranslationNotice")}
            </Banner>

            {/* Tool Site Card */}
            <div className="mb-8">
                <ExternalLink
                    href="https://sekaitools.exmeaning.com/"
                    className={`${cardClassName({ variant: "filled", radius: "lg", interactive: true })} group p-4`}
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md3-md bg-primary text-on-primary">
                            <Icon path={mdHandyman} size={22} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="type-title-s text-on-surface transition-colors group-hover:text-primary">{t("page.guides.toolSiteTitle")}</div>
                            <div className="type-body-s text-on-surface-variant">{t("page.guides.toolSiteDescription")}</div>
                        </div>
                        <Icon path={mdOpenInNew} size={20} className="text-on-surface-variant" />
                    </div>
                </ExternalLink>
            </div>

            {/* Error State */}
            {error && <ErrorState className="mb-6" title={t("page.guides.loadFailed")} message={error} retryLabel={t("common.action.retry")} />}

            {/* Filters live in the global FilterDrawer (registered above via
                useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : (
                    <>
                        <div className="space-y-3">
                            {displayedGuides.map((guide) => (
                                <GuideCard
                                    key={guide.id}
                                    guide={guide}
                                    categoryLabel={categories[guide.category] ?? guide.category}
                                />
                            ))}
                        </div>

                        {/* Empty State */}
                        {filteredGuides.length === 0 && !isLoading && <EmptyState icon={mdMenuBook} title={t("page.guides.noResult")} />}

                        <LoadMore
                            label={t("page.guides.loadMore")}
                            shown={displayedGuides.length}
                            total={filteredGuides.length}
                            onLoadMore={loadMore}
                            allLoadedLabel={t("page.guides.allLoaded", { count: filteredGuides.length })}
                        />
                    </>
                )}
            </div>
        </PageContainer>
    );
}

function GuideCard({ guide, categoryLabel }: { guide: GuideEntry; categoryLabel: string }) {
    const toneClass = categoryTones[guide.category] ?? categoryTones.system;

    return (
        <Card href={`/guides/${guide.id}/`} data-shortcut-item="true" variant="filled" className="group p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    {/* Category + Date */}
                    <div className="mb-2 flex items-center gap-2">
                        <span className={`inline-flex h-6 items-center rounded-md3-sm px-2 type-label-m ${toneClass}`}>{categoryLabel}</span>
                        <span className="type-body-s text-on-surface-variant">{guide.date}</span>
                    </div>

                    {/* Title */}
                    <h3 className="line-clamp-2 type-title-m text-on-surface transition-colors group-hover:text-primary">{guide.title}</h3>

                    {/* Tags + Author */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {guide.tags.slice(0, 4).map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex h-5 items-center rounded-md3-xs border border-outline-variant px-1.5 type-label-s text-on-surface-variant"
                            >
                                {tag}
                            </span>
                        ))}
                        <span className="ml-auto shrink-0 type-label-m text-on-surface-variant">{guide.author.group}</span>
                    </div>
                </div>

                <Icon path={mdChevronRight} size={20} className="mt-1 text-on-surface-variant" />
            </div>
        </Card>
    );
}

function GuidesLoadingFallback() {
    const { t } = useI18n();

    return <LoadingState label={t("page.guides.loadingFallback")} />;
}

export default function GuidesClient() {
    return (
        <MainLayout>
            <Suspense fallback={<GuidesLoadingFallback />}>
                <GuidesContent />
            </Suspense>
        </MainLayout>
    );
}
