"use client";

import React from "react";
import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import { Icon, Surface, cn } from "@/components/md3";
import {
    mdChatBubble,
    mdFavorite,
    mdFavoriteFill,
    mdKeep,
    mdStar,
    mdVisibilityOff,
} from "@/components/md3/icons";
import CommunityAuthorBadge from "./CommunityAuthorBadge";
import CommunityMarkdown from "./CommunityMarkdown";
import CommunityStoryCard from "./CommunityStoryCard";
import {
    CONTENT_LANG_LABEL_KEYS,
    POST_CATEGORY_LABEL_KEYS,
    SERVER_TAG_LABEL_KEYS,
    type PostItem,
} from "@/types/community";

interface PostCardProps {
    post: PostItem;
    onLikeToggle?: (post: PostItem) => void;
    onTagClick?: (tag: string) => void;
    className?: string;
}

export function PostCard({ post, onLikeToggle, onTagClick, className }: PostCardProps) {
    const { t } = useI18n();
    const postHref = `/community/post/${post.id}`;

    return (
        <Surface
            as="article"
            tone="card"
            radius="lg"
            className={cn(
                "p-4 transition-shadow duration-200 ease-md3-standard hover:shadow-elev-1 sm:p-5",
                className,
            )}
        >
            {/* Meta badges */}
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <CommunityAuthorBadge author={post.author} timestamp={post.created_at} compact />

                <div className="flex flex-wrap items-center gap-1.5">
                    {post.is_pinned && (
                        <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container">
                            <Icon path={mdKeep} size={13} />
                            <span>{t("page.community.badges.pinned")}</span>
                        </span>
                    )}
                    {post.is_featured && (
                        <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                            <Icon path={mdStar} size={13} />
                            <span>{t("page.community.badges.featured")}</span>
                        </span>
                    )}
                    <span className="rounded-md3-xs bg-secondary-container px-2 py-0.5 type-label-s text-on-secondary-container">
                        {t(POST_CATEGORY_LABEL_KEYS[post.category])}
                    </span>
                    {post.server_tag !== "all" && (
                        <span className="rounded-md3-xs border border-outline-variant px-2 py-0.5 type-label-s text-on-surface-variant">
                            {t(SERVER_TAG_LABEL_KEYS[post.server_tag])}
                        </span>
                    )}
                    <span className="rounded-md3-xs bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant">
                        {t(CONTENT_LANG_LABEL_KEYS[post.lang])}
                    </span>
                    {post.status !== "published" && (
                        <span className="rounded-md3-xs bg-warning-container px-2 py-0.5 type-label-s text-on-warning-container">
                            {t(`common.comments.statuses.${post.status}`)}
                        </span>
                    )}
                </div>
            </div>

            {/* Title */}
            <Link
                href={postHref}
                className="focus-ring block rounded-md3-sm text-on-surface hover:text-primary"
            >
                <h2 className="type-title-l break-words">{post.title}</h2>
            </Link>

            {/* Body preview or spoiler pill */}
            <div className="mt-2 space-y-2.5">
                {post.is_spoiler ? (
                    <Link
                        href={postHref}
                        className="state-layer focus-ring inline-flex items-center gap-2 rounded-md3-md border border-warning/40 bg-warning-container/35 px-3 py-2 type-body-s text-on-surface"
                    >
                        <Icon path={mdVisibilityOff} size={18} className="text-warning" />
                        <span>{t("page.community.spoilerHiddenPreview")}</span>
                    </Link>
                ) : (
                    <>
                        {post.category === "community_story" && post.story_summary && (
                            <CommunityStoryCard postId={post.id} summary={post.story_summary} compact />
                        )}
                        {post.body_md.trim() && <CommunityMarkdown content={post.body_md} compact />}
                    </>
                )}
            </div>

            {/* Tags */}
            {post.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {post.tags.map((tag) =>
                        onTagClick ? (
                            <button
                                key={tag}
                                type="button"
                                onClick={() => onTagClick(tag)}
                                className="state-layer focus-ring rounded-full bg-surface-container-high px-2.5 py-0.5 type-label-s text-on-surface-variant hover:text-primary"
                            >
                                #{tag}
                            </button>
                        ) : (
                            <Link
                                key={tag}
                                href={`/community?tag=${encodeURIComponent(tag)}`}
                                className="state-layer focus-ring rounded-full bg-surface-container-high px-2.5 py-0.5 type-label-s text-on-surface-variant hover:text-primary"
                            >
                                #{tag}
                            </Link>
                        ),
                    )}
                </div>
            )}

            {/* Footer stats */}
            <div className="mt-3.5 flex items-center gap-3 border-t border-outline-variant/60 pt-2.5 text-on-surface-variant">
                <button
                    type="button"
                    onClick={() => onLikeToggle?.(post)}
                    aria-pressed={post.liked_by_me}
                    className={cn(
                        "state-layer focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 type-label-m transition-colors",
                        post.liked_by_me ? "text-primary" : "text-on-surface-variant hover:text-on-surface",
                    )}
                >
                    <Icon path={post.liked_by_me ? mdFavoriteFill : mdFavorite} size={18} />
                    <span>{post.like_count}</span>
                </button>

                <Link
                    href={postHref}
                    className="state-layer focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 type-label-m text-on-surface-variant hover:text-on-surface"
                >
                    <Icon path={mdChatBubble} size={18} />
                    <span>{post.comment_count}</span>
                </Link>
            </div>
        </Surface>
    );
}

export default PostCard;
