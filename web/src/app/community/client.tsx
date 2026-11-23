"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterButton, FilterSection } from "@/components/common/BaseFilters";
import { useI18n } from "@/contexts/I18nContext";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { signIn } from "@/lib/moesekai-account";
import {
    fetchCommunityPosts,
    getCommunityErrorMessage,
    likeTarget,
    uiLocaleToContentLang,
    unlikeTarget,
} from "@/lib/community-api";
import { useCommunitySession } from "@/lib/community-session";
import PostCard from "@/components/community/PostCard";
import {
    Banner,
    Button,
    Chip,
    EmptyState,
    ErrorState,
    LoadingState,
    PageContainer,
    PageHeader,
    SegmentedButton,
} from "@/components/md3";
import {
    mdAccountCircle,
    mdClose,
    mdEdit,
    mdShield,
} from "@/components/md3/icons";
import {
    CONTENT_LANG_OPTIONS,
    POST_CATEGORY_OPTIONS,
    POST_SORT_OPTIONS,
    SERVER_TAG_OPTIONS,
    isContentLang,
    isModeratorRole,
    isPostCategory,
    isPostSort,
    isServerTag,
    type CommunityMode,
    type ContentLang,
    type PostCategory,
    type PostItem,
    type PostSort,
    type ServerTag,
} from "@/types/community";

export default function CommunityFeedClient() {
    const { t, locale } = useI18n();
    const searchParams = useSearchParams();
    const session = useCommunitySession();

    const [category, setCategory] = useState<PostCategory | "">("");
    const [langFilter, setLangFilter] = useState<ContentLang | "" | "all">("");
    const [serverTag, setServerTag] = useState<ServerTag>("all");
    const [tagFilter, setTagFilter] = useState("");
    const [sort, setSort] = useState<PostSort>("hot");
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [filtersReady, setFiltersReady] = useState(false);

    const [posts, setPosts] = useState<PostItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [communityMode, setCommunityMode] = useState<CommunityMode>(session.communityMode);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { displayCount, loadMore: expandDisplayCount, resetDisplayCount } = useScrollRestore({
        storageKey: "community",
        defaultDisplayCount: 20,
        increment: 20,
        isReady: !loading,
    });

    // Restore filter state from URL query parameters on initial mount / searchParams change
    useEffect(() => {
        const paramCategory = searchParams.get("category");
        const paramLang = searchParams.get("lang");
        const paramServer = searchParams.get("server");
        const paramTag = searchParams.get("tag");
        const paramSort = searchParams.get("sort");
        const paramSearch = searchParams.get("search");

        setCategory(isPostCategory(paramCategory) ? paramCategory : "");
        if (paramLang === "all") {
            setLangFilter("all");
        } else if (isContentLang(paramLang)) {
            setLangFilter(paramLang);
        } else {
            setLangFilter("");
        }
        setServerTag(isServerTag(paramServer) ? paramServer : "all");
        setTagFilter(paramTag?.trim() ?? "");
        setSort(isPostSort(paramSort) ? paramSort : "hot");
        const initialSearch = paramSearch?.trim() ?? "";
        setSearchQuery(initialSearch);
        setDebouncedSearch(initialSearch);
        setFiltersReady(true);
    }, [searchParams]);

    // Debounce search text
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(searchQuery.trim());
        }, 280);
        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    // Sync filter state back to URL query params without triggering Next.js navigation
    const updateURL = useCallback((params: Record<string, string>) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        Object.entries(params).forEach(([k, v]) => {
            if (v) url.searchParams.set(k, v);
            else url.searchParams.delete(k);
        });
        window.history.replaceState({}, "", url.toString());
    }, []);

    useEffect(() => {
        if (!filtersReady) return;
        updateURL({
            category,
            lang: langFilter,
            server: serverTag === "all" ? "" : serverTag,
            tag: tagFilter,
            sort: sort === "hot" ? "" : sort,
            search: debouncedSearch,
        });
    }, [category, debouncedSearch, filtersReady, langFilter, serverTag, sort, tagFilter, updateURL]);

    const preferredLang = useMemo(() => uiLocaleToContentLang(locale), [locale]);
    const tRef = useRef(t);
    const requestSeqRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const fetchFeed = useCallback(
        async (cursor?: string) => {
            const seq = ++requestSeqRef.current;
            if (cursor) {
                setLoadingMore(true);
            } else {
                setLoading(true);
                setError(null);
            }
            try {
                const res = await fetchCommunityPosts({
                    category: category || undefined,
                    lang: langFilter && langFilter !== "all" ? langFilter : undefined,
                    prefer_lang: langFilter === "" ? preferredLang : undefined,
                    server: serverTag !== "all" ? serverTag : undefined,
                    tag: tagFilter || undefined,
                    search: debouncedSearch || undefined,
                    sort,
                    cursor,
                    limit: 20,
                });
                if (seq !== requestSeqRef.current) return;
                if (res.community_mode) setCommunityMode(res.community_mode);
                setNextCursor(res.next_cursor);
                if (cursor) {
                    setPosts((prev) => {
                        const existingIds = new Set(prev.map((item) => item.id));
                        return [...prev, ...res.items.filter((item) => !existingIds.has(item.id))];
                    });
                } else {
                    setPosts(res.items);
                }
            } catch (err) {
                if (seq !== requestSeqRef.current) return;
                if (!cursor) {
                    setError(getCommunityErrorMessage(err, tRef.current));
                }
            } finally {
                if (seq === requestSeqRef.current) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [category, debouncedSearch, langFilter, preferredLang, serverTag, sort, tagFilter],
    );

    useEffect(() => {
        if (!filtersReady) return;
        void fetchFeed();
        return () => {
            requestSeqRef.current += 1;
        };
    }, [fetchFeed, filtersReady]);

    const handleResetFilters = useCallback(() => {
        setCategory("");
        setLangFilter("");
        setServerTag("all");
        setTagFilter("");
        setSort("hot");
        setSearchQuery("");
        setDebouncedSearch("");
        resetDisplayCount();
    }, [resetDisplayCount]);

    const hasActiveFilters = Boolean(
        category || langFilter || serverTag !== "all" || tagFilter || debouncedSearch || sort !== "hot",
    );

    const effectiveMode: CommunityMode =
        session.communityMode === "read_only" || communityMode === "read_only"
            ? "read_only"
            : session.communityMode === "strict_review" || communityMode === "strict_review"
              ? "strict_review"
              : "normal";

    const isMod = isModeratorRole(session.profile?.role);
    const blockedSet = useMemo(() => new Set(session.blockedSubs), [session.blockedSubs]);

    const visiblePosts = useMemo(
        () =>
            posts
                .filter((post) => !blockedSet.has(post.author.sub) || post.author.sub === session.profile?.sub)
                .slice(0, Math.max(displayCount, posts.length)),
        [blockedSet, displayCount, posts, session.profile?.sub],
    );

    const handleLikeToggle = async (post: PostItem) => {
        if (!session.authenticated) {
            signIn();
            return;
        }
        try {
            const res = post.liked_by_me
                ? await unlikeTarget("post", post.id)
                : await likeTarget("post", post.id);
            setPosts((prev) =>
                prev.map((item) =>
                    item.id === post.id
                        ? { ...item, liked_by_me: res.liked, like_count: res.like_count }
                        : item,
                ),
            );
        } catch {
            // Keep existing state on error
        }
    };

    const handleLoadMore = () => {
        expandDisplayCount();
        if (nextCursor && !loadingMore) {
            void fetchFeed(nextCursor);
        }
    };

    const filterContent = (
        <BaseFilters
            filteredCount={visiblePosts.length}
            totalCount={visiblePosts.length}
            countUnit={t("page.community.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={(q) => {
                setSearchQuery(q);
                resetDisplayCount();
            }}
            searchPlaceholder={t("page.community.searchPlaceholder")}
            sortOptions={POST_SORT_OPTIONS.map((opt) => ({
                id: opt.id,
                label: t(opt.labelKey),
            }))}
            sortBy={sort}
            sortOrder="desc"
            onSortChange={(nextSort) => {
                if (isPostSort(nextSort)) {
                    setSort(nextSort);
                    resetDisplayCount();
                }
            }}
            hasActiveFilters={hasActiveFilters}
            onReset={handleResetFilters}
        >
            <FilterSection label={t("page.community.filters.category")}>
                <div className="flex flex-wrap gap-1.5">
                    <FilterButton
                        selected={category === ""}
                        onClick={() => {
                            setCategory("");
                            resetDisplayCount();
                        }}
                    >
                        {t("page.community.filters.allCategories")}
                    </FilterButton>
                    {POST_CATEGORY_OPTIONS.map((opt) => (
                        <FilterButton
                            key={opt.id}
                            selected={category === opt.id}
                            onClick={() => {
                                setCategory(category === opt.id ? "" : opt.id);
                                resetDisplayCount();
                            }}
                        >
                            {t(opt.labelKey)}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>

            <FilterSection label={t("page.community.filters.language")}>
                <div className="flex flex-wrap gap-1.5">
                    <FilterButton
                        selected={langFilter === ""}
                        onClick={() => {
                            setLangFilter("");
                            resetDisplayCount();
                        }}
                    >
                        {t("page.community.filters.preferCurrentLang")}
                    </FilterButton>
                    <FilterButton
                        selected={langFilter === "all"}
                        onClick={() => {
                            setLangFilter("all");
                            resetDisplayCount();
                        }}
                    >
                        {t("page.community.filters.allLanguages")}
                    </FilterButton>
                    {CONTENT_LANG_OPTIONS.map((opt) => (
                        <FilterButton
                            key={opt.id}
                            selected={langFilter === opt.id}
                            onClick={() => {
                                setLangFilter(langFilter === opt.id ? "" : opt.id);
                                resetDisplayCount();
                            }}
                        >
                            {t(opt.labelKey)}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>

            <FilterSection label={t("page.community.filters.server")}>
                <div className="flex flex-wrap gap-1.5">
                    {SERVER_TAG_OPTIONS.map((opt) => (
                        <FilterButton
                            key={opt.id}
                            selected={serverTag === opt.id}
                            onClick={() => {
                                setServerTag(opt.id);
                                resetDisplayCount();
                            }}
                        >
                            {t(opt.labelKey)}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>
        </BaseFilters>
    );

    useQuickFilter(t("page.community.filterTitle"), filterContent, [
        category,
        langFilter,
        serverTag,
        sort,
        searchQuery,
        visiblePosts.length,
        hasActiveFilters,
        t,
    ]);

    return (
        <MainLayout>
            <PageContainer className="max-w-4xl">
                <PageHeader
                    title={t("page.community.title")}
                    highlight={t("page.community.highlight")}
                    description={t("page.community.description")}
                    actions={
                        <>
                            {isMod && (
                                <Button variant="tonal" size="s" icon={mdShield} href="/community/mod">
                                    {t("page.community.modConsole")}
                                </Button>
                            )}
                            {session.authenticated && session.profile && (
                                <Button
                                    variant="outlined"
                                    size="s"
                                    icon={mdAccountCircle}
                                    href={`/community/u/${encodeURIComponent(session.profile.sub)}`}
                                >
                                    {t("page.community.myProfile")}
                                </Button>
                            )}
                            {effectiveMode !== "read_only" && (
                                <Button variant="filled" size="s" icon={mdEdit} href="/community/new">
                                    {t("page.community.newPost")}
                                </Button>
                            )}
                        </>
                    }
                />

                {effectiveMode === "read_only" && (
                    <Banner
                        tone="warning"
                        title={t("common.comments.modeBanner.readOnlyTitle")}
                        className="mb-4"
                    >
                        {t("common.comments.modeBanner.readOnlyDesc")}
                    </Banner>
                )}

                {effectiveMode === "strict_review" && (
                    <Banner
                        tone="info"
                        title={t("common.comments.modeBanner.strictReviewTitle")}
                        className="mb-4"
                    >
                        {t("common.comments.modeBanner.strictReviewDesc")}
                    </Banner>
                )}

                {/* Quick inline category + sort bar */}
                <div className="mb-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Chip
                                variant="filter"
                                selected={category === ""}
                                onClick={() => {
                                    setCategory("");
                                    resetDisplayCount();
                                }}
                            >
                                {t("page.community.filters.allCategories")}
                            </Chip>
                            {POST_CATEGORY_OPTIONS.map((opt) => (
                                <Chip
                                    key={opt.id}
                                    variant="filter"
                                    selected={category === opt.id}
                                    onClick={() => {
                                        setCategory(category === opt.id ? "" : opt.id);
                                        resetDisplayCount();
                                    }}
                                >
                                    {t(opt.labelKey)}
                                </Chip>
                            ))}
                        </div>

                        <SegmentedButton
                            options={POST_SORT_OPTIONS.map((opt) => ({
                                value: opt.id,
                                label: t(opt.labelKey),
                            }))}
                            value={sort}
                            onValueChange={(next) => {
                                setSort(next);
                                resetDisplayCount();
                            }}
                            density={-1}
                            className="w-full sm:w-64"
                            aria-label={t("page.community.sortLabel")}
                        />
                    </div>

                    {tagFilter && (
                        <div className="flex items-center gap-2">
                            <Chip
                                variant="input"
                                selected
                                trailingIcon={mdClose}
                                onRemove={() => {
                                    setTagFilter("");
                                    resetDisplayCount();
                                }}
                                removeLabel={t("common.action.close")}
                            >
                                #{tagFilter}
                            </Chip>
                        </div>
                    )}
                </div>

                {/* Feed */}
                {loading ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : error ? (
                    <ErrorState
                        title={t("common.state.loadingFailed")}
                        message={error}
                        onRetry={() => void fetchFeed()}
                    />
                ) : visiblePosts.length === 0 ? (
                    <EmptyState
                        title={t("page.community.emptyTitle")}
                        description={t("page.community.emptyDescription")}
                        action={
                            hasActiveFilters ? (
                                <Button variant="tonal" onClick={handleResetFilters}>
                                    {t("page.community.resetFilters")}
                                </Button>
                            ) : effectiveMode !== "read_only" ? (
                                <Button variant="filled" icon={mdEdit} href="/community/new">
                                    {t("page.community.newPost")}
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className="space-y-3">
                        {visiblePosts.map((post) => (
                            <PostCard
                                key={post.id}
                                post={post}
                                onLikeToggle={handleLikeToggle}
                                onTagClick={(tag) => {
                                    setTagFilter(tag);
                                    resetDisplayCount();
                                }}
                            />
                        ))}

                        {nextCursor && (
                            <div className="pt-4 text-center">
                                <Button
                                    variant="tonal"
                                    disabled={loadingMore}
                                    onClick={handleLoadMore}
                                >
                                    {loadingMore ? t("common.state.loading") : t("common.comments.loadMore")}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
