"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { signIn } from "@/lib/moesekai-account";
import {
    createCommunityPost,
    fetchCommunityPost,
    getCommunityErrorMessage,
    isCommunityApiError,
    updateCommunityPost,
} from "@/lib/community-api";
import { getCommunitySession, useCommunitySession } from "@/lib/community-session";
import {
    STORY_LIMITS,
    clearPublishedStoryLink,
    setPublishedStoryLink,
    type StoryDocument,
} from "@moesekai/story-core";
import PolicyAgreementDialog from "@/components/community/PolicyAgreementDialog";
import TurnstileWidget from "@/components/community/TurnstileWidget";
import {
    Banner,
    Button,
    Chip,
    Dialog,
    Icon,
    IconButton,
    Surface,
    Switch,
    TextField,
} from "@/components/md3";
import {
    mdAdd,
    mdCheckCircle,
    mdForkRight,
    mdLogin,
    mdOpenInNew,
    mdPlayArrowFill,
    mdRecordVoiceOver,
    mdSend,
} from "@/components/md3/icons";
import {
    formatForkAttributionMarkdown,
    getForkAttribution,
    type StoryForkAttribution,
} from "@/lib/story-maker-fork";
import {
    SERVER_TAG_OPTIONS,
    isServerTag,
    type PostItem,
    type ServerTag,
} from "@/types/community";

const MAX_TAGS = 5;

export interface StoryPublishDialogProps {
    isOpen: boolean;
    onClose: () => void;
    doc: StoryDocument;
    draftId: string | null;
    publishedPostId: number | null;
    hasBlockingErrors: boolean;
    onPublished: (post: PostItem) => void;
    onClearPublishedLink?: () => void;
    onOpenVoiceUpload?: (postId: number) => void;
    onNotify?: (message: string) => void;
}

function defaultServerTag(region: string): ServerTag {
    return isServerTag(region) ? region : "all";
}

export function StoryPublishDialog({
    isOpen,
    onClose,
    doc,
    draftId,
    publishedPostId,
    hasBlockingErrors,
    onPublished,
    onClearPublishedLink,
    onOpenVoiceUpload,
    onNotify,
}: StoryPublishDialogProps) {
    const { t } = useI18n();
    const session = useCommunitySession();

    const [title, setTitle] = useState("");
    const [bodyMd, setBodyMd] = useState("");
    const [serverTag, setServerTag] = useState<ServerTag>("all");
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [isSpoiler, setIsSpoiler] = useState(false);
    const [createAsNew, setCreateAsNew] = useState(false);

    const [policyOpen, setPolicyOpen] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);

    const [submitting, setSubmitting] = useState(false);
    const [cooldownSec, setCooldownSec] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [resultPost, setResultPost] = useState<PostItem | null>(null);
    const [forkAttribution, setForkAttribution] = useState<StoryForkAttribution | null>(null);

    const tRef = useRef(t);
    const hydrateSeqRef = useRef(0);
    const wasOpenRef = useRef(false);
    const tagsDirtyRef = useRef(false);
    const spoilerDirtyRef = useRef(false);
    const serverTagDirtyRef = useRef(false);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const isUpdateMode = Boolean(publishedPostId && !createAsNew);
    const needsTurnstile = !isUpdateMode && Boolean(session.turnstileSiteKey) && session.turnstileRequired;

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            hydrateSeqRef.current += 1;
            return;
        }
        if (wasOpenRef.current) return;
        wasOpenRef.current = true;
        tagsDirtyRef.current = false;
        spoilerDirtyRef.current = false;
        serverTagDirtyRef.current = false;
        const attribution = draftId ? getForkAttribution(draftId) : null;
        setForkAttribution(attribution);
        setTitle(doc.meta.title.trim());
        const initialSummary = doc.meta.summary.trim();
        const prefilledBody = !initialSummary && !publishedPostId && attribution
            ? formatForkAttributionMarkdown(
                  attribution,
                  tRef.current("page.storyMaker.fork.attributionTemplate"),
              )
            : initialSummary;
        setBodyMd(prefilledBody);
        setServerTag(defaultServerTag(doc.region));
        setTags([]);
        setTagInput("");
        setIsSpoiler(false);
        setCreateAsNew(false);
        setError(null);
        setNotice(null);
        setResultPost(null);
        setTurnstileToken("");
        setTurnstileResetNonce((n) => n + 1);

        if (!publishedPostId) return;
        const seq = ++hydrateSeqRef.current;
        void fetchCommunityPost(publishedPostId)
            .then((post) => {
                if (seq !== hydrateSeqRef.current) return;
                if (!tagsDirtyRef.current) {
                    setTags(Array.isArray(post.tags) ? post.tags.slice(0, MAX_TAGS) : []);
                }
                if (!spoilerDirtyRef.current) {
                    setIsSpoiler(Boolean(post.is_spoiler));
                }
                if (!serverTagDirtyRef.current && isServerTag(post.server_tag)) {
                    setServerTag(post.server_tag);
                }
            })
            .catch((err) => {
                if (seq !== hydrateSeqRef.current) return;
                if (isCommunityApiError(err) && err.status === 404) {
                    if (draftId) {
                        clearPublishedStoryLink(draftId);
                    }
                    onClearPublishedLink?.();
                    setCreateAsNew(true);
                }
            });
        return () => {
            hydrateSeqRef.current += 1;
        };
    }, [doc.meta.summary, doc.meta.title, doc.region, draftId, isOpen, onClearPublishedLink, publishedPostId]);

    useEffect(() => {
        if (cooldownSec <= 0) return;
        const timer = window.setInterval(() => {
            setCooldownSec((prev) => (prev > 1 ? prev - 1 : 0));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [cooldownSec]);

    const handleAddTag = () => {
        const cleaned = tagInput.trim().replace(/^#+/, "");
        if (!cleaned || tags.length >= MAX_TAGS) return;
        if (!tags.includes(cleaned)) {
            tagsDirtyRef.current = true;
            setTags((prev) => [...prev, cleaned]);
        }
        setTagInput("");
    };

    const handleSubmit = useCallback(async (options?: { bypassPolicyCheck?: boolean }) => {
        if (hasBlockingErrors) {
            setError(t("page.storyMaker.publish.errors.hasBlockingErrors"));
            return;
        }
        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            setError(t("page.storyMaker.publish.errors.missingTitle"));
            return;
        }
        const latestSession = getCommunitySession();
        const effectiveCommunityMode = latestSession.communityMode ?? session.communityMode;
        const effectiveProfile = latestSession.profile ?? session.profile;
        if (effectiveCommunityMode === "read_only") {
            setError(t("common.comments.errors.readOnly"));
            return;
        }
        if (
            !options?.bypassPolicyCheck &&
            session.authenticated &&
            effectiveProfile &&
            !effectiveProfile.policy_accepted_at
        ) {
            setPolicyOpen(true);
            return;
        }
        if (needsTurnstile && !turnstileToken) {
            setError(t("common.comments.errors.turnstileFailed"));
            return;
        }

        setSubmitting(true);
        setError(null);
        setNotice(null);

        try {
            const payloadBody = bodyMd.trim() || doc.meta.summary.trim() || trimmedTitle;
            const syncedSummary = (bodyMd.trim() || doc.meta.summary.trim()).slice(0, STORY_LIMITS.summary);
            const docToPublish: StoryDocument = {
                ...doc,
                meta: {
                    ...doc.meta,
                    title: trimmedTitle.slice(0, STORY_LIMITS.title),
                    summary: syncedSummary,
                },
            };
            const res = isUpdateMode && publishedPostId
                ? await updateCommunityPost(publishedPostId, {
                      category: "community_story",
                      server_tag: serverTag,
                      title: trimmedTitle,
                      body_md: payloadBody,
                      tags,
                      is_spoiler: isSpoiler,
                      story_doc: docToPublish,
                  })
                : await createCommunityPost({
                      category: "community_story",
                      server_tag: serverTag,
                      title: trimmedTitle,
                      body_md: payloadBody,
                      tags,
                      is_spoiler: isSpoiler,
                      turnstile_token: needsTurnstile ? turnstileToken || undefined : undefined,
                      story_doc: docToPublish,
                  });

            setTurnstileToken("");
            setTurnstileResetNonce((n) => n + 1);
            if (draftId) {
                setPublishedStoryLink(draftId, res.post.id);
            }
            setResultPost(res.post);
            onPublished(res.post);

            if (res.moderation_notice === "pending_review") {
                setNotice(t("common.comments.notices.pendingReview"));
            } else if (res.auto_spoiler_applied || res.moderation_notice === "auto_spoiler") {
                setNotice(t("common.comments.notices.autoSpoiler"));
            } else {
                const msg = isUpdateMode
                    ? t("page.storyMaker.publish.updatedToast")
                    : t("page.storyMaker.publish.publishedToast");
                onNotify?.(msg);
            }
        } catch (err) {
            setTurnstileToken("");
            setTurnstileResetNonce((n) => n + 1);
            if (isCommunityApiError(err)) {
                if (err.code === "policy_not_accepted") {
                    setPolicyOpen(true);
                    return;
                }
                if (err.code === "rate_limited" && err.retryAfterSec) {
                    setCooldownSec(err.retryAfterSec);
                }
                if (isUpdateMode && err.status === 404) {
                    if (draftId) {
                        clearPublishedStoryLink(draftId);
                    }
                    onClearPublishedLink?.();
                    setCreateAsNew(true);
                }
            }
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setSubmitting(false);
        }
    }, [
        bodyMd,
        doc,
        draftId,
        hasBlockingErrors,
        isSpoiler,
        isUpdateMode,
        needsTurnstile,
        onClearPublishedLink,
        onNotify,
        onPublished,
        publishedPostId,
        serverTag,
        session.authenticated,
        session.communityMode,
        session.profile,
        t,
        tags,
        title,
        turnstileToken,
    ]);

    const activePostId = resultPost?.id ?? publishedPostId;

    return (
        <>
            <Dialog
                isOpen={isOpen}
                onClose={onClose}
                title={t(
                    isUpdateMode
                        ? "page.storyMaker.publish.updateTitle"
                        : "page.storyMaker.publish.dialogTitle",
                )}
                size="lg"
                fullscreenOnMobile
                actions={
                    resultPost ? (
                        <Button variant="filled" onClick={onClose}>
                            {t("common.action.close")}
                        </Button>
                    ) : (
                        <>
                            <Button variant="text" onClick={onClose} disabled={submitting}>
                                {t("common.action.cancel")}
                            </Button>
                            {session.authenticated && (
                                <Button
                                    variant="filled"
                                    icon={mdSend}
                                    disabled={
                                        submitting ||
                                        cooldownSec > 0 ||
                                        hasBlockingErrors ||
                                        session.communityMode === "read_only" ||
                                        !title.trim() ||
                                        (needsTurnstile && !turnstileToken)
                                    }
                                    onClick={() => void handleSubmit()}
                                >
                                    {submitting
                                        ? t("common.comments.submitting")
                                        : cooldownSec > 0
                                            ? t("common.comments.cooldownButton", { seconds: cooldownSec })
                                            : t(
                                                  isUpdateMode
                                                      ? "page.storyMaker.publish.updateButton"
                                                      : "page.storyMaker.publish.publishButton",
                                              )}
                                </Button>
                            )}
                        </>
                    )
                }
            >
                <div className="min-w-0 space-y-4">
                    {session.communityMode === "read_only" && (
                        <Banner tone="warning" title={t("common.comments.modeBanner.readOnlyTitle")}>
                            {t("common.comments.modeBanner.readOnlyDesc")}
                        </Banner>
                    )}

                    {hasBlockingErrors && (
                        <Banner tone="error">
                            {t("page.storyMaker.publish.errors.hasBlockingErrors")}
                        </Banner>
                    )}

                    {!session.authenticated ? (
                        <Surface tone="low" radius="lg" className="flex flex-col items-center gap-3 p-6 text-center">
                            <p className="type-title-m text-on-surface">
                                {t("common.comments.loginPromptTitle")}
                            </p>
                            <p className="max-w-md type-body-m text-on-surface-variant">
                                {t("page.storyMaker.publish.signInDesc")}
                            </p>
                            <Button variant="filled" icon={mdLogin} onClick={() => signIn()}>
                                {t("common.comments.signInButton")}
                            </Button>
                        </Surface>
                    ) : resultPost ? (
                        <Surface tone="low" radius="lg" className="space-y-4 border border-primary/30 p-4">
                            <div className="flex items-center gap-2 text-primary">
                                <Icon path={mdCheckCircle} size={22} className="shrink-0" />
                                <p className="type-title-m">
                                    {t(
                                        isUpdateMode
                                            ? "page.storyMaker.publish.updatedToast"
                                            : "page.storyMaker.publish.publishedToast",
                                    )}
                                </p>
                            </div>
                            {notice && <Banner tone="info">{notice}</Banner>}
                            <p className="type-body-s text-on-surface-variant">
                                {t("page.storyMaker.publish.nextStepVoiceHint")}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="filled"
                                    icon={mdPlayArrowFill}
                                    href={`/story-maker/play?postId=${resultPost.id}`}
                                >
                                    {t("page.community.storyCard.playNow")}
                                </Button>
                                <Button
                                    variant="tonal"
                                    icon={mdOpenInNew}
                                    href={`/community/post/${resultPost.id}`}
                                >
                                    {t("page.storyMaker.publish.viewPost")}
                                </Button>
                                {onOpenVoiceUpload && (
                                    <Button
                                        variant="outlined"
                                        icon={mdRecordVoiceOver}
                                        onClick={() => {
                                            onClose();
                                            onOpenVoiceUpload(resultPost.id);
                                        }}
                                    >
                                        {t("page.storyMaker.audioUpload.openAction")}
                                    </Button>
                                )}
                            </div>
                        </Surface>
                    ) : (
                        <>
                            {activePostId && (
                                <Surface
                                    tone="low"
                                    radius="md"
                                    className="flex flex-wrap items-center justify-between gap-2 border border-outline-variant/60 px-3.5 py-2.5"
                                >
                                    <div className="min-w-0 space-y-0.5">
                                        <p className="type-label-l text-on-surface">
                                            {t("page.storyMaker.publish.linkedPost", { id: activePostId })}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <Button
                                            size="xs"
                                            variant="tonal"
                                            icon={mdOpenInNew}
                                            href={`/community/post/${activePostId}`}
                                        >
                                            {t("page.storyMaker.publish.viewPost")}
                                        </Button>
                                        {onOpenVoiceUpload && (
                                            <Button
                                                size="xs"
                                                variant="outlined"
                                                icon={mdRecordVoiceOver}
                                                onClick={() => {
                                                    onClose();
                                                    onOpenVoiceUpload(activePostId);
                                                }}
                                            >
                                                {t("page.storyMaker.audioUpload.openAction")}
                                            </Button>
                                        )}
                                        <Button
                                            size="xs"
                                            variant="text"
                                            onClick={() => setCreateAsNew((prev) => !prev)}
                                        >
                                            {t(
                                                createAsNew
                                                    ? "page.storyMaker.publish.switchToUpdate"
                                                    : "page.storyMaker.publish.publishAsNew",
                                            )}
                                        </Button>
                                    </div>
                                </Surface>
                            )}

                            {forkAttribution && (
                                <Surface
                                    tone="low"
                                    radius="md"
                                    className="flex flex-wrap items-center justify-between gap-2 border border-primary/30 bg-primary-container/20 px-3.5 py-2.5"
                                >
                                    <div className="flex min-w-0 flex-1 items-start gap-2">
                                        <Icon path={mdForkRight} size={18} className="mt-0.5 shrink-0 text-primary" />
                                        <div className="min-w-0 space-y-0.5">
                                            <p className="type-label-l text-on-surface">
                                                {t("page.storyMaker.fork.publishBadgeTitle")}
                                            </p>
                                            <p className="truncate type-body-s text-on-surface-variant">
                                                {t("page.storyMaker.fork.publishNotice", {
                                                    title:
                                                        forkAttribution.sourceTitle
                                                        || `#${forkAttribution.sourcePostId}`,
                                                    author: forkAttribution.sourceAuthorName,
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        size="xs"
                                        variant="tonal"
                                        icon={mdOpenInNew}
                                        href={`/community/post/${forkAttribution.sourcePostId}`}
                                    >
                                        {t("page.storyMaker.fork.viewOriginalPost")}
                                    </Button>
                                </Surface>
                            )}

                            <p className="type-body-s text-on-surface-variant">
                                {t("page.storyMaker.publish.subtitle")}
                            </p>

                            <TextField
                                label={t("page.community.composer.titleLabel")}
                                value={title}
                                onValueChange={setTitle}
                                maxLength={120}
                                placeholder={t("page.community.composer.titlePlaceholder")}
                                required
                            />

                            <div>
                                <label
                                    htmlFor="story-publish-summary"
                                    className="mb-1.5 block type-label-l text-on-surface"
                                >
                                    {t("page.storyMaker.publish.summaryLabel")}
                                </label>
                                <textarea
                                    id="story-publish-summary"
                                    rows={4}
                                    maxLength={5000}
                                    value={bodyMd}
                                    onChange={(e) => setBodyMd(e.target.value)}
                                    placeholder={t("page.storyMaker.publish.summaryPlaceholder")}
                                    className="w-full resize-y rounded-md3-md border border-outline-variant bg-surface-container-lowest p-3 type-body-m text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                                />
                            </div>

                            <div>
                                <p className="mb-2 type-label-l text-on-surface">
                                    {t("page.community.filters.server")}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {SERVER_TAG_OPTIONS.map((opt) => (
                                        <Chip
                                            key={opt.id}
                                            variant="filter"
                                            selected={serverTag === opt.id}
                                            onClick={() => {
                                                serverTagDirtyRef.current = true;
                                                setServerTag(opt.id);
                                            }}
                                        >
                                            {t(opt.labelKey)}
                                        </Chip>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-2">
                                    <TextField
                                        label={t("page.community.composer.tagsLabel")}
                                        value={tagInput}
                                        onValueChange={setTagInput}
                                        maxLength={24}
                                        placeholder={t("page.community.composer.tagsPlaceholder")}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleAddTag();
                                            }
                                        }}
                                        disabled={tags.length >= MAX_TAGS}
                                        containerClassName="flex-1"
                                    />
                                    <IconButton
                                        icon={mdAdd}
                                        label={t("page.community.composer.addTag")}
                                        onClick={handleAddTag}
                                        disabled={!tagInput.trim() || tags.length >= MAX_TAGS}
                                    />
                                </div>
                                {tags.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {tags.map((tag) => (
                                            <Chip
                                                key={tag}
                                                variant="input"
                                                selected
                                                onRemove={() => {
                                                    tagsDirtyRef.current = true;
                                                    setTags((prev) => prev.filter((item) => item !== tag));
                                                }}
                                                removeLabel={t("common.action.close")}
                                            >
                                                #{tag}
                                            </Chip>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Switch
                                checked={isSpoiler}
                                onCheckedChange={(checked) => {
                                    spoilerDirtyRef.current = true;
                                    setIsSpoiler(checked);
                                }}
                                label={t("page.community.composer.spoilerLabel")}
                                description={t("page.community.composer.spoilerDesc")}
                            />

                            {needsTurnstile && (
                                <TurnstileWidget
                                    siteKey={session.turnstileSiteKey}
                                    onToken={setTurnstileToken}
                                    resetNonce={turnstileResetNonce}
                                />
                            )}

                            {error && <Banner tone="error">{error}</Banner>}
                            {notice && <Banner tone="info">{notice}</Banner>}
                        </>
                    )}
                </div>
            </Dialog>

            <PolicyAgreementDialog
                isOpen={policyOpen}
                onClose={() => setPolicyOpen(false)}
                onAccepted={() => {
                    void handleSubmit({ bypassPolicyCheck: true });
                }}
            />
        </>
    );
}

export default StoryPublishDialog;
