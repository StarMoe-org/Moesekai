"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { useI18n } from "@/contexts/I18nContext";
import { localizePathForBrowser } from "@/lib/localized-path";
import { signIn } from "@/lib/moesekai-account";
import {
    blockUser,
    deleteCommunityPost,
    fetchCommunityPost,
    getCommunityErrorMessage,
    likeTarget,
    submitModAction,
    unblockUser,
    unlikeTarget,
    updateCommunityPost,
} from "@/lib/community-api";
import { updateBlockedSubLocal, useCommunitySession } from "@/lib/community-session";
import CommunityAuthorBadge from "@/components/community/CommunityAuthorBadge";
import CommunityMarkdown, { SpoilerCurtain } from "@/components/community/CommunityMarkdown";
import EntityCommentSection from "@/components/community/EntityCommentSection";
import ReportDialog, { AppealDialog } from "@/components/community/ReportDialog";
import {
    Banner,
    Button,
    Chip,
    Dialog,
    Divider,
    ErrorState,
    Icon,
    LoadingState,
    PageContainer,
    SectionCard,
    Switch,
    TextField,
} from "@/components/md3";
import {
    mdArrowBack,
    mdBlock,
    mdDelete,
    mdEdit,
    mdFavorite,
    mdFavoriteFill,
    mdFlag,
    mdKeep,
    mdLock,
    mdLockOpen,
    mdShare,
    mdShield,
    mdStar,
    mdSupportAgent,
    mdVisibilityOff,
} from "@/components/md3/icons";
import {
    CONTENT_LANG_LABEL_KEYS,
    POST_CATEGORY_LABEL_KEYS,
    POST_CATEGORY_OPTIONS,
    SERVER_TAG_LABEL_KEYS,
    SERVER_TAG_OPTIONS,
    isModeratorRole,
    type ModActionType,
    type PostCategory,
    type PostItem,
    type ServerTag,
} from "@/types/community";

export default function CommunityPostClient() {
    const { t } = useI18n();
    const params = useParams();
    const router = useRouter();
    const { setDetailName } = useBreadcrumb();
    const session = useCommunitySession();

    const postIdParam = Array.isArray(params?.id) ? params.id[0] : params?.id;
    const postId = Number(postIdParam);

    const [post, setPost] = useState<PostItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const [reportOpen, setReportOpen] = useState(false);
    const [appealOpen, setAppealOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);

    // Edit form state
    const [editTitle, setEditTitle] = useState("");
    const [editBody, setEditBody] = useState("");
    const [editCategory, setEditCategory] = useState<PostCategory>("general");
    const [editServer, setEditServer] = useState<ServerTag>("all");
    const [editSpoiler, setEditSpoiler] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [modBusy, setModBusy] = useState(false);

    const loadPost = useCallback(async () => {
        if (!Number.isFinite(postId) || postId <= 0) {
            setError(t("common.comments.errors.notFound"));
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const loaded = await fetchCommunityPost(postId);
            setPost(loaded);
            setDetailName(loaded.title);
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setLoading(false);
        }
    }, [postId, setDetailName, t]);

    useEffect(() => {
        void loadPost();
    }, [loadPost]);

    const openEditModal = () => {
        if (!post) return;
        setEditTitle(post.title);
        setEditBody(post.body_md);
        setEditCategory(post.category);
        setEditServer(post.server_tag);
        setEditSpoiler(post.is_spoiler);
        setActionError(null);
        setEditOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!post) return;
        setSavingEdit(true);
        setActionError(null);
        try {
            const res = await updateCommunityPost(post.id, {
                title: editTitle.trim(),
                body_md: editBody.trim(),
                category: editCategory,
                server_tag: editServer,
                is_spoiler: editSpoiler,
            });
            setPost(res.post);
            setDetailName(res.post.title);
            setEditOpen(false);
            if (res.moderation_notice === "pending_review") {
                setActionMessage(t("common.comments.notices.pendingReview"));
            } else if (res.auto_spoiler_applied || res.moderation_notice === "auto_spoiler") {
                setActionMessage(t("common.comments.notices.autoSpoiler"));
            } else {
                setActionMessage(t("page.community.post.updated"));
            }
        } catch (err) {
            setActionError(getCommunityErrorMessage(err, t));
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDelete = async () => {
        if (!post) return;
        setDeleting(true);
        setActionError(null);
        try {
            await deleteCommunityPost(post.id);
            router.push(localizePathForBrowser("/community"));
        } catch (err) {
            setActionError(getCommunityErrorMessage(err, t));
            setDeleting(false);
        }
    };

    const handleLikeToggle = async () => {
        if (!post) return;
        if (!session.authenticated) {
            signIn();
            return;
        }
        try {
            const res = post.liked_by_me
                ? await unlikeTarget("post", post.id)
                : await likeTarget("post", post.id);
            setPost((prev) =>
                prev ? { ...prev, liked_by_me: res.liked, like_count: res.like_count } : prev,
            );
        } catch (err) {
            setActionError(getCommunityErrorMessage(err, t));
        }
    };

    const handleShare = async () => {
        if (typeof window === "undefined") return;
        try {
            await navigator.clipboard.writeText(window.location.href);
            setActionMessage(t("page.community.post.linkCopied"));
        } catch {
            setActionError(t("common.comments.errors.generic"));
        }
    };

    const handleBlockToggle = async () => {
        if (!post || !session.authenticated) return;
        const blocked = session.blockedSubs.includes(post.author.sub);
        try {
            if (blocked) {
                await unblockUser(post.author.sub);
                updateBlockedSubLocal(post.author.sub, false);
            } else {
                await blockUser(post.author.sub);
                updateBlockedSubLocal(post.author.sub, true);
            }
            setActionMessage(
                blocked ? t("page.community.profile.unblocked") : t("page.community.profile.blocked"),
            );
        } catch (err) {
            setActionError(getCommunityErrorMessage(err, t));
        }
    };

    const runModAction = async (action: ModActionType, targetType: "post" | "thread" = "post") => {
        if (!post) return;
        setModBusy(true);
        setActionError(null);
        try {
            await submitModAction({
                action,
                target_type: targetType,
                target_id: String(post.id),
            });
            await loadPost();
            setActionMessage(t("page.community.mod.actionSuccess"));
        } catch (err) {
            setActionError(getCommunityErrorMessage(err, t));
        } finally {
            setModBusy(false);
        }
    };

    const isMod = isModeratorRole(session.profile?.role);
    const isOwn = Boolean(post && session.profile?.sub && post.author.sub === session.profile.sub);
    const isAuthorBlocked = Boolean(post && session.blockedSubs.includes(post.author.sub));
    const canAppeal =
        isOwn &&
        post &&
        (post.status === "pending_review" || post.status === "hidden" || post.status === "removed");

    return (
        <MainLayout>
            <PageContainer className="max-w-4xl">
                <div className="mb-4 flex items-center justify-between gap-2">
                    <Button variant="tonal" size="s" icon={mdArrowBack} href="/community">
                        {t("page.community.backToFeed")}
                    </Button>
                    {isMod && (
                        <Button variant="outlined" size="s" icon={mdShield} href="/community/mod">
                            {t("page.community.modConsole")}
                        </Button>
                    )}
                </div>

                {loading ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : error || !post ? (
                    <ErrorState
                        title={t("common.state.loadingFailed")}
                        message={error || t("common.comments.errors.notFound")}
                        onRetry={() => void loadPost()}
                    />
                ) : (
                    <div className="space-y-6">
                        {post.status !== "published" && (
                            <Banner
                                tone="warning"
                                title={t(`common.comments.statuses.${post.status}`)}
                                action={
                                    canAppeal ? (
                                        <Button
                                            variant="tonal"
                                            size="xs"
                                            icon={mdSupportAgent}
                                            onClick={() => setAppealOpen(true)}
                                        >
                                            {t("common.comments.appeal.action")}
                                        </Button>
                                    ) : undefined
                                }
                            >
                                {t("page.community.post.nonPublicNotice")}
                            </Banner>
                        )}

                        {actionMessage && <Banner tone="info">{actionMessage}</Banner>}
                        {actionError && <Banner tone="error">{actionError}</Banner>}

                        <SectionCard>
                            {/* Badges row */}
                            <div className="mb-3 flex flex-wrap items-center gap-1.5">
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
                                {post.thread_locked && (
                                    <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-error-container px-2 py-0.5 type-label-s text-on-error-container">
                                        <Icon path={mdLock} size={13} />
                                        <span>{t("page.community.badges.locked")}</span>
                                    </span>
                                )}
                            </div>

                            <h1 className="type-headline-s text-on-surface break-words sm:type-headline-m">
                                {post.title}
                            </h1>

                            <div className="mt-4">
                                <CommunityAuthorBadge author={post.author} timestamp={post.created_at} />
                            </div>

                            <Divider className="my-4" />

                            <SpoilerCurtain isSpoiler={post.is_spoiler}>
                                <CommunityMarkdown content={post.body_md} />
                            </SpoilerCurtain>

                            {post.tags.length > 0 && (
                                <div className="mt-5 flex flex-wrap gap-1.5">
                                    {post.tags.map((tag) => (
                                        <Link
                                            key={tag}
                                            href={`/community?tag=${encodeURIComponent(tag)}`}
                                            className="state-layer focus-ring rounded-full bg-surface-container-high px-3 py-1 type-label-m text-on-surface-variant hover:text-primary"
                                        >
                                            #{tag}
                                        </Link>
                                    ))}
                                </div>
                            )}

                            <Divider className="my-4" />

                            {/* Action bar */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant={post.liked_by_me ? "filled" : "tonal"}
                                        size="xs"
                                        icon={post.liked_by_me ? mdFavoriteFill : mdFavorite}
                                        onClick={handleLikeToggle}
                                    >
                                        {post.like_count}
                                    </Button>
                                    <Button variant="outlined" size="xs" icon={mdShare} onClick={handleShare}>
                                        {t("page.community.post.share")}
                                    </Button>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                    {post.can_edit && (
                                        <Button
                                            variant="text"
                                            size="xs"
                                            icon={mdEdit}
                                            onClick={openEditModal}
                                        >
                                            {t("page.community.post.edit")}
                                        </Button>
                                    )}
                                    {post.can_delete && (
                                        <Button
                                            variant="text"
                                            size="xs"
                                            color="error"
                                            icon={mdDelete}
                                            onClick={() => setDeleteConfirmOpen(true)}
                                        >
                                            {t("common.comments.delete")}
                                        </Button>
                                    )}
                                    {session.authenticated && !isOwn && !post.author.is_deleted && (
                                        <>
                                            <Button
                                                variant="text"
                                                size="xs"
                                                color="error"
                                                icon={mdFlag}
                                                onClick={() => setReportOpen(true)}
                                            >
                                                {t("common.comments.report.action")}
                                            </Button>
                                            <Button
                                                variant="text"
                                                size="xs"
                                                icon={mdBlock}
                                                onClick={handleBlockToggle}
                                            >
                                                {isAuthorBlocked
                                                    ? t("page.community.profile.unblock")
                                                    : t("common.comments.blockUser")}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Moderator action controls */}
                            {isMod && (
                                <div className="mt-4 rounded-md3-md border border-tertiary/30 bg-tertiary-container/25 p-3">
                                    <div className="mb-2 flex items-center gap-1.5 type-label-l text-on-surface">
                                        <Icon path={mdShield} size={18} className="text-tertiary" />
                                        <span>{t("page.community.mod.quickActions")}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Button
                                            variant="tonal"
                                            size="xs"
                                            icon={mdKeep}
                                            disabled={modBusy}
                                            onClick={() => void runModAction(post.is_pinned ? "unpin" : "pin")}
                                        >
                                            {post.is_pinned
                                                ? t("page.community.mod.actions.unpin")
                                                : t("page.community.mod.actions.pin")}
                                        </Button>
                                        <Button
                                            variant="tonal"
                                            size="xs"
                                            icon={mdStar}
                                            disabled={modBusy}
                                            onClick={() =>
                                                void runModAction(post.is_featured ? "unfeature" : "feature")
                                            }
                                        >
                                            {post.is_featured
                                                ? t("page.community.mod.actions.unfeature")
                                                : t("page.community.mod.actions.feature")}
                                        </Button>
                                        <Button
                                            variant="tonal"
                                            size="xs"
                                            icon={post.thread_locked ? mdLockOpen : mdLock}
                                            disabled={modBusy}
                                            onClick={() =>
                                                void runModAction(
                                                    post.thread_locked ? "unlock_thread" : "lock_thread",
                                                    "post",
                                                )
                                            }
                                        >
                                            {post.thread_locked
                                                ? t("page.community.mod.actions.unlockThread")
                                                : t("page.community.mod.actions.lockThread")}
                                        </Button>
                                        <Button
                                            variant="tonal"
                                            size="xs"
                                            icon={mdVisibilityOff}
                                            disabled={modBusy}
                                            onClick={() =>
                                                void runModAction(
                                                    post.is_spoiler ? "unspoiler" : "auto_spoiler",
                                                )
                                            }
                                        >
                                            {post.is_spoiler
                                                ? t("page.community.mod.actions.unspoiler")
                                                : t("page.community.mod.actions.markSpoiler")}
                                        </Button>
                                        {post.status !== "published" && (
                                            <Button
                                                variant="filled"
                                                size="xs"
                                                disabled={modBusy}
                                                onClick={() => void runModAction("approve")}
                                            >
                                                {t("page.community.mod.actions.approve")}
                                            </Button>
                                        )}
                                        <Button
                                            variant="outlined"
                                            size="xs"
                                            color="error"
                                            disabled={modBusy}
                                            onClick={() => void runModAction("hide")}
                                        >
                                            {t("page.community.mod.actions.hide")}
                                        </Button>
                                        <Button
                                            variant="filled"
                                            size="xs"
                                            color="error"
                                            disabled={modBusy}
                                            onClick={() => void runModAction("remove")}
                                        >
                                            {t("page.community.mod.actions.remove")}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </SectionCard>

                        {/* Unified comment section */}
                        <SectionCard>
                            <EntityCommentSection
                                targetType="post"
                                targetId={post.id}
                                onCommentCountChange={(count) =>
                                    setPost((prev) => (prev ? { ...prev, comment_count: count } : prev))
                                }
                            />
                        </SectionCard>

                        {/* Edit dialog */}
                        <Dialog
                            isOpen={editOpen}
                            onClose={() => setEditOpen(false)}
                            title={t("page.community.post.editTitle")}
                            size="lg"
                            actions={
                                <>
                                    <Button
                                        variant="text"
                                        onClick={() => setEditOpen(false)}
                                        disabled={savingEdit}
                                    >
                                        {t("common.action.cancel")}
                                    </Button>
                                    <Button
                                        variant="filled"
                                        onClick={() => void handleSaveEdit()}
                                        disabled={savingEdit || !editTitle.trim() || !editBody.trim()}
                                    >
                                        {savingEdit ? t("common.comments.submitting") : t("common.action.save")}
                                    </Button>
                                </>
                            }
                        >
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-1.5">
                                    {POST_CATEGORY_OPTIONS.map((opt) => (
                                        <Chip
                                            key={opt.id}
                                            variant="filter"
                                            selected={editCategory === opt.id}
                                            onClick={() => setEditCategory(opt.id)}
                                        >
                                            {t(opt.labelKey)}
                                        </Chip>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {SERVER_TAG_OPTIONS.map((opt) => (
                                        <Chip
                                            key={opt.id}
                                            variant="filter"
                                            selected={editServer === opt.id}
                                            onClick={() => setEditServer(opt.id)}
                                        >
                                            {t(opt.labelKey)}
                                        </Chip>
                                    ))}
                                </div>
                                <TextField
                                    label={t("page.community.composer.titleLabel")}
                                    value={editTitle}
                                    onValueChange={setEditTitle}
                                    maxLength={120}
                                />
                                <textarea
                                    value={editBody}
                                    onChange={(e) => setEditBody(e.target.value)}
                                    rows={8}
                                    maxLength={10000}
                                    className="w-full resize-y rounded-md3-md border border-outline-variant bg-surface-container-lowest p-3 type-body-m text-on-surface focus:border-primary focus:outline-none"
                                />
                                <Switch
                                    checked={editSpoiler}
                                    onCheckedChange={setEditSpoiler}
                                    label={t("page.community.composer.spoilerLabel")}
                                />
                            </div>
                        </Dialog>

                        {/* Delete confirm dialog */}
                        <Dialog
                            isOpen={deleteConfirmOpen}
                            onClose={() => setDeleteConfirmOpen(false)}
                            title={t("page.community.post.deleteConfirmTitle")}
                            supportingText={t("page.community.post.deleteConfirmDesc")}
                            size="sm"
                            actions={
                                <>
                                    <Button
                                        variant="text"
                                        onClick={() => setDeleteConfirmOpen(false)}
                                        disabled={deleting}
                                    >
                                        {t("common.action.cancel")}
                                    </Button>
                                    <Button
                                        variant="filled"
                                        color="error"
                                        onClick={() => void handleDelete()}
                                        disabled={deleting}
                                    >
                                        {t("common.comments.delete")}
                                    </Button>
                                </>
                            }
                        />

                        <ReportDialog
                            isOpen={reportOpen}
                            onClose={() => setReportOpen(false)}
                            targetType="post"
                            targetId={post.id}
                            onSubmitted={({ autoCollapsed }) => {
                                if (autoCollapsed) void loadPost();
                            }}
                        />

                        <AppealDialog
                            isOpen={appealOpen}
                            onClose={() => setAppealOpen(false)}
                            targetType="post"
                            targetId={post.id}
                        />
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
