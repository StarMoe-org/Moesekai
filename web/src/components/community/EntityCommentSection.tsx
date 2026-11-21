"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { signIn } from "@/lib/moesekai-account";
import {
    blockUser,
    createThreadComment,
    deleteComment,
    fetchCommentReplies,
    fetchThreadComments,
    getCommunityErrorMessage,
    isCommunityApiError,
    likeTarget,
    submitModAction,
    unblockUser,
    unlikeTarget,
} from "@/lib/community-api";
import { updateBlockedSubLocal, useCommunitySession } from "@/lib/community-session";
import {
    Banner,
    Button,
    Chip,
    EmptyState,
    ErrorState,
    Icon,
    IconButton,
    LoadingState,
    SegmentedButton,
    Surface,
    Switch,
    cn,
} from "@/components/md3";
import {
    mdAddLink,
    mdBlock,
    mdChatBubble,
    mdDelete,
    mdFavorite,
    mdFavoriteFill,
    mdFlag,
    mdLock,
    mdLogin,
    mdReply,
    mdSend,
    mdSentimentSatisfied,
    mdShield,
    mdSupportAgent,
    mdVisibility,
    mdVisibilityOff,
} from "@/components/md3/icons";
import CommunityAuthorBadge from "./CommunityAuthorBadge";
import CommunityMarkdown, { SpoilerCurtain } from "./CommunityMarkdown";
import StickerPicker from "./StickerPicker";
import EntityInserter from "./EntityInserter";
import PolicyAgreementDialog from "./PolicyAgreementDialog";
import ReportDialog, { AppealDialog } from "./ReportDialog";
import TurnstileWidget from "./TurnstileWidget";
import {
    COMMENT_SORT_OPTIONS,
    isModeratorRole,
    type CommentItem,
    type CommentSort,
    type CommentThread,
    type CommunityMode,
    type TargetType,
} from "@/types/community";

interface EntityCommentSectionProps {
    targetType: TargetType;
    targetId: string | number;
    className?: string;
    onCommentCountChange?: (count: number) => void;
}

export function EntityCommentSection({
    targetType,
    targetId,
    className,
    onCommentCountChange,
}: EntityCommentSectionProps) {
    const { t } = useI18n();
    const session = useCommunitySession();
    const normalizedTargetId = String(targetId);

    const [sort, setSort] = useState<CommentSort>("hot");
    const [ownedOnly, setOwnedOnly] = useState(false);
    const [thread, setThread] = useState<CommentThread | null>(null);
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [communityMode, setCommunityMode] = useState<CommunityMode>(session.communityMode);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Composer state
    const [draft, setDraft] = useState("");
    const [isSpoiler, setIsSpoiler] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [replyTarget, setReplyTarget] = useState<CommentItem | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitNotice, setSubmitNotice] = useState<string | null>(null);
    const [cooldownSec, setCooldownSec] = useState(0);
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);

    // Pickers & dialogs
    const [stickerOpen, setStickerOpen] = useState(false);
    const [entityOpen, setEntityOpen] = useState(false);
    const [policyOpen, setPolicyOpen] = useState(false);
    const [reportTargetId, setReportTargetId] = useState<number | null>(null);
    const [appealTargetId, setAppealTargetId] = useState<number | null>(null);
    const pendingSubmitRef = useRef<(() => Promise<void>) | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Expanded replies map keyed by root comment ID
    const [repliesByRoot, setRepliesByRoot] = useState<
        Record<number, { items: CommentItem[]; nextCursor: string | null; loading: boolean }>
    >({});

    const effectiveMode: CommunityMode =
        session.communityMode === "read_only" || communityMode === "read_only"
            ? "read_only"
            : session.communityMode === "strict_review" || communityMode === "strict_review"
              ? "strict_review"
              : "normal";

    const isMod = isModeratorRole(session.profile?.role);
    const blockedSet = new Set(session.blockedSubs);

    // Countdown timer for 429 rate-limit cooldown
    useEffect(() => {
        if (cooldownSec <= 0) return;
        const timer = window.setInterval(() => {
            setCooldownSec((prev) => (prev > 1 ? prev - 1 : 0));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [cooldownSec]);

    const loadComments = useCallback(
        async (cursor?: string) => {
            if (cursor) {
                setLoadingMore(true);
            } else {
                setLoading(true);
                setLoadError(null);
            }
            try {
                const res = await fetchThreadComments(targetType, normalizedTargetId, {
                    sort,
                    owned_only: targetType === "card" ? ownedOnly : false,
                    cursor,
                    limit: 20,
                });
                setThread(res.thread);
                setCommunityMode(res.community_mode);
                setNextCursor(res.next_cursor);
                onCommentCountChange?.(res.thread.comment_count);
                if (cursor) {
                    setComments((prev) => [...prev, ...res.items]);
                } else {
                    setComments(res.items);
                    setRepliesByRoot({});
                }
            } catch (err) {
                if (!cursor) {
                    setLoadError(getCommunityErrorMessage(err, t));
                }
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [normalizedTargetId, onCommentCountChange, ownedOnly, sort, t, targetType],
    );

    useEffect(() => {
        void loadComments();
    }, [loadComments]);

    const insertAtCursor = useCallback((token: string) => {
        const el = textareaRef.current;
        if (!el) {
            setDraft((prev) => (prev ? `${prev} ${token}` : token));
            return;
        }
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        setDraft((prev) => `${prev.slice(0, start)}${token}${prev.slice(end)}`);
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + token.length;
            el.setSelectionRange(pos, pos);
        });
    }, []);

    const performSubmit = useCallback(
        async (overrideBody?: string) => {
            const body = (overrideBody ?? draft).trim();
            if (!body) {
                setSubmitError(t("common.comments.errors.emptyContent"));
                return;
            }
            if (effectiveMode === "read_only") {
                setSubmitError(t("common.comments.errors.readOnly"));
                return;
            }
            if (session.authenticated && session.profile && !session.profile.policy_accepted_at) {
                pendingSubmitRef.current = () => performSubmit(overrideBody);
                setPolicyOpen(true);
                return;
            }
            if (session.turnstileSiteKey && !turnstileToken) {
                if (overrideBody) {
                    insertAtCursor(overrideBody);
                }
                setSubmitError(t("common.comments.errors.turnstileFailed"));
                return;
            }
            setSubmitting(true);
            setSubmitError(null);
            setSubmitNotice(null);

            try {
                const res = await createThreadComment(targetType, normalizedTargetId, {
                    body_md: body,
                    reply_to_id: replyTarget?.id,
                    is_spoiler: overrideBody ? false : isSpoiler,
                    turnstile_token: turnstileToken || undefined,
                });

                if (!overrideBody) {
                    setDraft("");
                    setIsSpoiler(false);
                    setShowPreview(false);
                }
                setTurnstileToken("");
                setTurnstileResetNonce((n) => n + 1);

                const created = res.comment;
                if (created.root_id) {
                    const rootId = created.root_id;
                    setComments((prev) =>
                        prev.map((item) =>
                            item.id === rootId
                                ? {
                                      ...item,
                                      reply_count: item.reply_count + 1,
                                      preview_replies: [...item.preview_replies, created],
                                  }
                                : item,
                        ),
                    );
                    setRepliesByRoot((prev) => {
                        const existing = prev[rootId];
                        if (!existing) return prev;
                        return {
                            ...prev,
                            [rootId]: {
                                ...existing,
                                items: [...existing.items, created],
                            },
                        };
                    });
                } else {
                    setComments((prev) => [created, ...prev]);
                }

                setReplyTarget(null);
                setThread((prev) => {
                    if (!prev) return prev;
                    const nextCount = prev.comment_count + 1;
                    onCommentCountChange?.(nextCount);
                    return { ...prev, comment_count: nextCount };
                });

                if (res.moderation_notice === "pending_review") {
                    setSubmitNotice(t("common.comments.notices.pendingReview"));
                } else if (res.auto_spoiler_applied || res.moderation_notice === "auto_spoiler") {
                    setSubmitNotice(t("common.comments.notices.autoSpoiler"));
                } else {
                    setSubmitNotice(t("common.comments.notices.posted"));
                }
            } catch (err) {
                setTurnstileToken("");
                setTurnstileResetNonce((n) => n + 1);
                if (isCommunityApiError(err)) {
                    if (err.code === "policy_not_accepted") {
                        pendingSubmitRef.current = () => performSubmit(overrideBody);
                        setPolicyOpen(true);
                        return;
                    }
                    if (err.code === "rate_limited" && err.retryAfterSec) {
                        setCooldownSec(err.retryAfterSec);
                    }
                }
                setSubmitError(getCommunityErrorMessage(err, t));
            } finally {
                setSubmitting(false);
            }
        },
        [
            draft,
            effectiveMode,
            insertAtCursor,
            isSpoiler,
            normalizedTargetId,
            onCommentCountChange,
            replyTarget,
            session.authenticated,
            session.profile,
            session.turnstileSiteKey,
            t,
            targetType,
            turnstileToken,
        ],
    );

    const handleLikeToggle = async (comment: CommentItem) => {
        if (!session.authenticated) {
            signIn();
            return;
        }
        try {
            const res = comment.liked_by_me
                ? await unlikeTarget("comment", comment.id)
                : await likeTarget("comment", comment.id);
            const patchComment = (item: CommentItem): CommentItem =>
                item.id === comment.id
                    ? { ...item, liked_by_me: res.liked, like_count: res.like_count }
                    : {
                          ...item,
                          preview_replies: item.preview_replies.map((reply) =>
                              reply.id === comment.id
                                  ? { ...reply, liked_by_me: res.liked, like_count: res.like_count }
                                  : reply,
                          ),
                      };
            setComments((prev) => prev.map(patchComment));
            if (comment.root_id) {
                const rootId = comment.root_id;
                setRepliesByRoot((prev) => {
                    const entry = prev[rootId];
                    if (!entry) return prev;
                    return {
                        ...prev,
                        [rootId]: {
                            ...entry,
                            items: entry.items.map((reply) =>
                                reply.id === comment.id
                                    ? { ...reply, liked_by_me: res.liked, like_count: res.like_count }
                                    : reply,
                            ),
                        },
                    };
                });
            }
        } catch (err) {
            setSubmitError(getCommunityErrorMessage(err, t));
        }
    };

    const handleDeleteComment = async (comment: CommentItem) => {
        try {
            await deleteComment(comment.id);
            if (comment.root_id) {
                const rootId = comment.root_id;
                setComments((prev) =>
                    prev.map((item) =>
                        item.id === rootId
                            ? {
                                  ...item,
                                  reply_count: Math.max(0, item.reply_count - 1),
                                  preview_replies: item.preview_replies.filter((r) => r.id !== comment.id),
                              }
                            : item,
                    ),
                );
                setRepliesByRoot((prev) => {
                    const entry = prev[rootId];
                    if (!entry) return prev;
                    return {
                        ...prev,
                        [rootId]: {
                            ...entry,
                            items: entry.items.filter((r) => r.id !== comment.id),
                        },
                    };
                });
            } else {
                setComments((prev) => prev.filter((item) => item.id !== comment.id));
            }
            setThread((prev) => {
                if (!prev) return prev;
                const nextCount = Math.max(0, prev.comment_count - 1);
                onCommentCountChange?.(nextCount);
                return { ...prev, comment_count: nextCount };
            });
        } catch (err) {
            setSubmitError(getCommunityErrorMessage(err, t));
        }
    };

    const handleBlockToggle = async (authorSub: string) => {
        if (!session.authenticated || !authorSub || authorSub === session.profile?.sub) return;
        const currentlyBlocked = blockedSet.has(authorSub);
        try {
            if (currentlyBlocked) {
                await unblockUser(authorSub);
                updateBlockedSubLocal(authorSub, false);
            } else {
                await blockUser(authorSub);
                updateBlockedSubLocal(authorSub, true);
            }
        } catch (err) {
            setSubmitError(getCommunityErrorMessage(err, t));
        }
    };

    const handleModRemove = async (comment: CommentItem) => {
        try {
            await submitModAction({
                action: "remove",
                target_type: "comment",
                target_id: String(comment.id),
            });
            void loadComments();
        } catch (err) {
            setSubmitError(getCommunityErrorMessage(err, t));
        }
    };

    const handleLoadReplies = async (rootComment: CommentItem) => {
        const existing = repliesByRoot[rootComment.id];
        const cursor = existing?.nextCursor ?? undefined;
        setRepliesByRoot((prev) => ({
            ...prev,
            [rootComment.id]: {
                items: prev[rootComment.id]?.items ?? rootComment.preview_replies,
                nextCursor: prev[rootComment.id]?.nextCursor ?? null,
                loading: true,
            },
        }));
        try {
            const res = await fetchCommentReplies(rootComment.id, { cursor, limit: 20 });
            setRepliesByRoot((prev) => {
                const priorItems = cursor ? prev[rootComment.id]?.items ?? [] : [];
                const seen = new Set(priorItems.map((i) => i.id));
                const merged = [...priorItems, ...res.items.filter((i) => !seen.has(i.id))];
                return {
                    ...prev,
                    [rootComment.id]: {
                        items: merged,
                        nextCursor: res.next_cursor,
                        loading: false,
                    },
                };
            });
        } catch {
            setRepliesByRoot((prev) => ({
                ...prev,
                [rootComment.id]: {
                    items: prev[rootComment.id]?.items ?? rootComment.preview_replies,
                    nextCursor: prev[rootComment.id]?.nextCursor ?? null,
                    loading: false,
                },
            }));
        }
    };

    const renderCommentItem = (comment: CommentItem, isReply = false) => {
        if (blockedSet.has(comment.author.sub) && comment.author.sub !== session.profile?.sub) {
            return null;
        }
        const isOwn = Boolean(session.profile?.sub && session.profile.sub === comment.author.sub);
        const canAppeal =
            isOwn &&
            (comment.status === "pending_review" ||
                comment.status === "hidden" ||
                comment.status === "removed");

        return (
            <div
                key={comment.id}
                className={cn(
                    "rounded-md3-md border border-outline-variant/60 bg-surface-container-lowest p-3.5",
                    isReply && "bg-surface-container/50 p-3",
                )}
            >
                <div className="flex items-start justify-between gap-2">
                    <CommunityAuthorBadge
                        author={comment.author}
                        cardBadge={comment.author_card_badge}
                        timestamp={comment.created_at}
                        compact={isReply}
                    />
                    {comment.status !== "published" && (
                        <span className="shrink-0 rounded-md3-xs bg-warning-container px-2 py-0.5 type-label-s text-on-warning-container">
                            {t(`common.comments.statuses.${comment.status}`)}
                        </span>
                    )}
                </div>

                {isReply && comment.reply_to_author && (
                    <div className="mt-1.5 type-label-s text-on-surface-variant">
                        {t("common.comments.replyingTo", {
                            name: comment.reply_to_author.is_deleted
                                ? t("common.comments.deletedUser")
                                : comment.reply_to_author.display_name,
                        })}
                    </div>
                )}

                <div className="mt-2">
                    <SpoilerCurtain isSpoiler={comment.is_spoiler}>
                        <CommunityMarkdown content={comment.body_md} />
                    </SpoilerCurtain>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1 text-on-surface-variant">
                    <button
                        type="button"
                        onClick={() => handleLikeToggle(comment)}
                        className={cn(
                            "state-layer focus-ring inline-flex h-8 items-center gap-1 rounded-full px-2.5 type-label-m transition-colors",
                            comment.liked_by_me ? "text-primary" : "text-on-surface-variant hover:text-on-surface",
                        )}
                        aria-pressed={comment.liked_by_me}
                    >
                        <Icon path={comment.liked_by_me ? mdFavoriteFill : mdFavorite} size={17} />
                        <span>{comment.like_count}</span>
                    </button>

                    {!thread?.locked && effectiveMode !== "read_only" && (
                        <button
                            type="button"
                            onClick={() => {
                                if (!session.authenticated) {
                                    signIn();
                                    return;
                                }
                                setReplyTarget(comment);
                                textareaRef.current?.focus();
                            }}
                            className="state-layer focus-ring inline-flex h-8 items-center gap-1 rounded-full px-2.5 type-label-m text-on-surface-variant hover:text-on-surface"
                        >
                            <Icon path={mdReply} size={17} />
                            <span>{t("common.comments.reply")}</span>
                        </button>
                    )}

                    {comment.can_delete && (
                        <button
                            type="button"
                            onClick={() => handleDeleteComment(comment)}
                            className="state-layer focus-ring inline-flex h-8 items-center gap-1 rounded-full px-2.5 type-label-m text-error hover:bg-error-container/30"
                        >
                            <Icon path={mdDelete} size={17} />
                            <span>{t("common.comments.delete")}</span>
                        </button>
                    )}

                    {canAppeal && (
                        <button
                            type="button"
                            onClick={() => setAppealTargetId(comment.id)}
                            className="state-layer focus-ring inline-flex h-8 items-center gap-1 rounded-full px-2.5 type-label-m text-primary"
                        >
                            <Icon path={mdSupportAgent} size={17} />
                            <span>{t("common.comments.appeal.action")}</span>
                        </button>
                    )}

                    {session.authenticated && !isOwn && !comment.author.is_deleted && (
                        <>
                            <button
                                type="button"
                                onClick={() => setReportTargetId(comment.id)}
                                className="state-layer focus-ring inline-flex h-8 items-center gap-1 rounded-full px-2.5 type-label-m text-on-surface-variant hover:text-error"
                            >
                                <Icon path={mdFlag} size={16} />
                                <span>{t("common.comments.report.action")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleBlockToggle(comment.author.sub)}
                                className="state-layer focus-ring inline-flex h-8 items-center gap-1 rounded-full px-2.5 type-label-m text-on-surface-variant hover:text-on-surface"
                            >
                                <Icon path={mdBlock} size={16} />
                                <span>{t("common.comments.blockUser")}</span>
                            </button>
                        </>
                    )}

                    {isMod && !isOwn && (
                        <button
                            type="button"
                            onClick={() => handleModRemove(comment)}
                            className="state-layer focus-ring inline-flex h-8 items-center gap-1 rounded-full px-2.5 type-label-m text-error"
                        >
                            <Icon path={mdShield} size={16} />
                            <span>{t("common.comments.modRemove")}</span>
                        </button>
                    )}
                </div>

                {/* Flat 2nd-level replies */}
                {!isReply && (comment.reply_count > 0 || comment.preview_replies.length > 0) && (
                    <div className="mt-3 space-y-2 border-l-2 border-outline-variant/80 pl-3">
                        {(repliesByRoot[comment.id]?.items ?? comment.preview_replies).map((reply) =>
                            renderCommentItem(reply, true),
                        )}
                        {(() => {
                            const expanded = repliesByRoot[comment.id];
                            const loadedCount = expanded
                                ? expanded.items.length
                                : comment.preview_replies.length;
                            const hasMoreReplies = expanded
                                ? Boolean(expanded.nextCursor)
                                : comment.reply_count > loadedCount;
                            if (!hasMoreReplies) return null;
                            return (
                                <Button
                                    variant="text"
                                    size="xs"
                                    disabled={expanded?.loading}
                                    onClick={() => handleLoadReplies(comment)}
                                >
                                    {expanded?.loading
                                        ? t("common.state.loading")
                                        : t("common.comments.loadMoreReplies", {
                                              count: Math.max(1, comment.reply_count - loadedCount),
                                          })}
                                </Button>
                            );
                        })()}
                    </div>
                )}
            </div>
        );
    };

    const sortOptions = COMMENT_SORT_OPTIONS.map((opt) => ({
        value: opt.id,
        label: t(opt.labelKey),
    }));

    return (
        <section className={cn("space-y-4", className)}>
            {/* Header & filters */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Icon path={mdChatBubble} size={22} className="text-primary" />
                    <h3 className="type-title-l text-on-surface">
                        {t("common.comments.heading")}
                    </h3>
                    {thread && (
                        <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 type-label-m text-on-surface-variant">
                            {thread.comment_count}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {targetType === "card" && (
                        <Chip
                            variant="filter"
                            selected={ownedOnly}
                            onClick={() => setOwnedOnly((prev) => !prev)}
                        >
                            {t("common.comments.ownedOnly")}
                        </Chip>
                    )}
                    <SegmentedButton
                        options={sortOptions}
                        value={sort}
                        onValueChange={setSort}
                        density={-1}
                        className="w-44"
                        aria-label={t("common.comments.sortLabel")}
                    />
                </div>
            </div>

            {/* Global mode / thread lock notices */}
            {effectiveMode === "read_only" && (
                <Banner tone="warning" title={t("common.comments.modeBanner.readOnlyTitle")}>
                    {t("common.comments.modeBanner.readOnlyDesc")}
                </Banner>
            )}
            {effectiveMode === "strict_review" && (
                <Banner tone="info" title={t("common.comments.modeBanner.strictReviewTitle")}>
                    {t("common.comments.modeBanner.strictReviewDesc")}
                </Banner>
            )}
            {thread?.locked && (
                <Banner tone="warning" title={t("common.comments.threadLockedBanner")}>
                    <span className="inline-flex items-center gap-1">
                        <Icon path={mdLock} size={16} />
                        {t("common.comments.errors.threadLocked")}
                    </span>
                </Banner>
            )}

            {/* Composer or login prompt */}
            {effectiveMode !== "read_only" && !thread?.locked && (
                <Surface tone="card" radius="lg" className="p-4">
                    {!session.authenticated ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="type-title-s text-on-surface">
                                    {t("common.comments.loginPromptTitle")}
                                </p>
                                <p className="type-body-s text-on-surface-variant">
                                    {t("common.comments.loginPromptDesc")}
                                </p>
                            </div>
                            <Button variant="filled" icon={mdLogin} onClick={() => signIn()}>
                                {t("common.comments.signInButton")}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {replyTarget && (
                                <div className="flex items-center justify-between gap-2 rounded-md3-sm bg-secondary-container/60 px-3 py-1.5 type-label-m text-on-secondary-container">
                                    <span className="truncate">
                                        {t("common.comments.replyingTo", {
                                            name: replyTarget.author.display_name,
                                        })}
                                    </span>
                                    <Button
                                        variant="text"
                                        size="xs"
                                        onClick={() => setReplyTarget(null)}
                                    >
                                        {t("common.action.cancel")}
                                    </Button>
                                </div>
                            )}

                            {showPreview ? (
                                <div className="min-h-[96px] rounded-md3-md border border-outline-variant bg-surface-container-lowest p-3">
                                    {draft.trim() ? (
                                        <CommunityMarkdown content={draft} />
                                    ) : (
                                        <p className="type-body-s text-on-surface-variant">
                                            {t("common.comments.previewEmpty")}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <textarea
                                    ref={textareaRef}
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    rows={3}
                                    maxLength={2000}
                                    placeholder={t("common.comments.composerPlaceholder")}
                                    className="w-full resize-y rounded-md3-md border border-outline-variant bg-surface-container-lowest p-3 type-body-m text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                                />
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <IconButton
                                        icon={mdSentimentSatisfied}
                                        label={t("common.comments.stickerPicker.open")}
                                        title={t("common.comments.stickerPicker.open")}
                                        onClick={() => setStickerOpen(true)}
                                    />
                                    <IconButton
                                        icon={mdAddLink}
                                        label={t("common.comments.entityInserter.open")}
                                        title={t("common.comments.entityInserter.open")}
                                        onClick={() => setEntityOpen(true)}
                                    />
                                    <IconButton
                                        icon={showPreview ? mdVisibilityOff : mdVisibility}
                                        label={
                                            showPreview
                                                ? t("common.comments.editMode")
                                                : t("common.comments.previewMode")
                                        }
                                        title={
                                            showPreview
                                                ? t("common.comments.editMode")
                                                : t("common.comments.previewMode")
                                        }
                                        selected={showPreview}
                                        onClick={() => setShowPreview((prev) => !prev)}
                                    />
                                    <Switch
                                        checked={isSpoiler}
                                        onCheckedChange={setIsSpoiler}
                                        label={t("common.comments.spoiler.toggle")}
                                        className="ml-1"
                                    />
                                </div>

                                <Button
                                    variant="filled"
                                    size="s"
                                    icon={mdSend}
                                    disabled={
                                        submitting ||
                                        cooldownSec > 0 ||
                                        !draft.trim() ||
                                        (Boolean(session.turnstileSiteKey) && !turnstileToken)
                                    }
                                    onClick={() => void performSubmit()}
                                >
                                    {cooldownSec > 0
                                        ? t("common.comments.cooldownButton", { seconds: cooldownSec })
                                        : submitting
                                          ? t("common.comments.submitting")
                                          : t("common.comments.submit")}
                                </Button>
                            </div>

                            {session.turnstileSiteKey && (
                                <TurnstileWidget
                                    siteKey={session.turnstileSiteKey}
                                    onToken={setTurnstileToken}
                                    resetNonce={turnstileResetNonce}
                                />
                            )}

                            {submitError && <Banner tone="error">{submitError}</Banner>}
                            {submitNotice && <Banner tone="info">{submitNotice}</Banner>}
                        </div>
                    )}
                </Surface>
            )}

            {/* Comment list */}
            {loading ? (
                <LoadingState label={t("common.state.loading")} />
            ) : loadError ? (
                <ErrorState
                    title={t("common.state.loadingFailed")}
                    message={loadError}
                    onRetry={() => void loadComments()}
                />
            ) : comments.length === 0 ? (
                <EmptyState
                    title={t("common.comments.emptyTitle")}
                    description={t("common.comments.emptyDescription")}
                />
            ) : (
                <div className="space-y-3">
                    {comments.map((comment) => renderCommentItem(comment, false))}
                    {nextCursor && (
                        <div className="pt-2 text-center">
                            <Button
                                variant="tonal"
                                disabled={loadingMore}
                                onClick={() => void loadComments(nextCursor)}
                            >
                                {loadingMore ? t("common.state.loading") : t("common.comments.loadMore")}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            <StickerPicker
                isOpen={stickerOpen}
                onClose={() => setStickerOpen(false)}
                onSelect={(stampId) => insertAtCursor(`[stamp:${stampId}]`)}
                onQuickSend={(stampId) => void performSubmit(`[stamp:${stampId}]`)}
            />
            <EntityInserter
                isOpen={entityOpen}
                onClose={() => setEntityOpen(false)}
                onInsert={(token) => insertAtCursor(token)}
            />
            <PolicyAgreementDialog
                isOpen={policyOpen}
                onClose={() => setPolicyOpen(false)}
                onAccepted={() => {
                    const retry = pendingSubmitRef.current;
                    pendingSubmitRef.current = null;
                    if (retry) void retry();
                }}
            />
            {reportTargetId !== null && (
                <ReportDialog
                    isOpen
                    onClose={() => setReportTargetId(null)}
                    targetType="comment"
                    targetId={reportTargetId}
                    onSubmitted={({ autoCollapsed }) => {
                        if (autoCollapsed) void loadComments();
                    }}
                />
            )}
            {appealTargetId !== null && (
                <AppealDialog
                    isOpen
                    onClose={() => setAppealTargetId(null)}
                    targetType="comment"
                    targetId={appealTargetId}
                />
            )}
        </section>
    );
}

export default EntityCommentSection;
