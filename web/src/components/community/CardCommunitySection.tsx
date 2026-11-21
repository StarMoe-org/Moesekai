"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { signIn } from "@/lib/moesekai-account";
import {
    fetchCommunityPosts,
    getCommunityErrorMessage,
    likeTarget,
    unlikeTarget,
} from "@/lib/community-api";
import { useCommunitySession } from "@/lib/community-session";
import {
    Button,
    EmptyState,
    ErrorState,
    LoadingState,
    SectionCard,
    Tabs,
} from "@/components/md3";
import { mdChatBubble, mdEdit, mdForum } from "@/components/md3/icons";
import EntityCommentSection from "./EntityCommentSection";
import PostCard from "./PostCard";
import type { PostItem } from "@/types/community";

interface CardCommunitySectionProps {
    cardId: number;
}

export function CardCommunitySection({ cardId }: CardCommunitySectionProps) {
    const { t } = useI18n();
    const session = useCommunitySession({ eager: false });
    const containerRef = useRef<HTMLDivElement>(null);

    const [visible, setVisible] = useState(false);
    const [activeTab, setActiveTab] = useState<"comments" | "posts">("comments");
    const [commentCount, setCommentCount] = useState<number | null>(null);
    const [posts, setPosts] = useState<PostItem[]>([]);
    const [postsLoaded, setPostsLoaded] = useState(false);
    const [postsLoading, setPostsLoading] = useState(false);
    const [postsError, setPostsError] = useState<string | null>(null);

    // Defer network work until the user approaches the bottom of the card detail page.
    useEffect(() => {
        const el = containerRef.current;
        if (!el || visible) return;
        if (typeof IntersectionObserver === "undefined") {
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "320px 0px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [visible]);

    const loadRelatedPosts = useCallback(async () => {
        setPostsLoading(true);
        setPostsError(null);
        try {
            const res = await fetchCommunityPosts({
                entity_type: "card",
                entity_id: String(cardId),
                sort: "hot",
                limit: 10,
            });
            setPosts(res.items);
            setPostsLoaded(true);
        } catch (err) {
            setPostsError(getCommunityErrorMessage(err, t));
        } finally {
            setPostsLoading(false);
        }
    }, [cardId, t]);

    useEffect(() => {
        if (visible && activeTab === "posts" && !postsLoaded && !postsLoading) {
            void loadRelatedPosts();
        }
    }, [visible, activeTab, postsLoaded, postsLoading, loadRelatedPosts]);

    const handlePostLike = async (post: PostItem) => {
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
            // Keep state unchanged
        }
    };

    const tabItems = [
        {
            value: "comments" as const,
            label:
                commentCount !== null
                    ? `${t("common.comments.heading")} (${commentCount})`
                    : t("common.comments.heading"),
            icon: mdChatBubble,
        },
        {
            value: "posts" as const,
            label:
                postsLoaded && posts.length > 0
                    ? `${t("page.community.relatedPosts.tab")} (${posts.length})`
                    : t("page.community.relatedPosts.tab"),
            icon: mdForum,
        },
    ];

    return (
        <div ref={containerRef} className="mt-8">
            <SectionCard
                title={t("page.community.cardDiscussionTitle")}
                icon={mdForum}
                actions={
                    <Button
                        variant="tonal"
                        size="xs"
                        icon={mdEdit}
                        href={`/community/new?entityType=card&entityId=${cardId}`}
                    >
                        {t("page.community.relatedPosts.writeAboutCard")}
                    </Button>
                }
            >
                <Tabs
                    items={tabItems}
                    value={activeTab}
                    onValueChange={setActiveTab}
                    variant="secondary"
                    className="mb-4"
                />

                {!visible ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : activeTab === "comments" ? (
                    <EntityCommentSection
                        targetType="card"
                        targetId={cardId}
                        onCommentCountChange={setCommentCount}
                    />
                ) : postsLoading ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : postsError ? (
                    <ErrorState
                        title={t("common.state.loadingFailed")}
                        message={postsError}
                        onRetry={() => void loadRelatedPosts()}
                    />
                ) : posts.length === 0 ? (
                    <EmptyState
                        title={t("page.community.relatedPosts.emptyTitle")}
                        description={t("page.community.relatedPosts.emptyDesc")}
                        action={
                            <Button
                                variant="filled"
                                size="s"
                                icon={mdEdit}
                                href={`/community/new?entityType=card&entityId=${cardId}`}
                            >
                                {t("page.community.relatedPosts.writeAboutCard")}
                            </Button>
                        }
                    />
                ) : (
                    <div className="space-y-3">
                        {posts.map((post) => (
                            <PostCard key={post.id} post={post} onLikeToggle={handlePostLike} />
                        ))}
                    </div>
                )}
            </SectionCard>
        </div>
    );
}

export default CardCommunitySection;
