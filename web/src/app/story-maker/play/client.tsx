"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
    isSafeVoiceManifestUrl,
    parseStoryDocumentDraft,
    parseStoryVoiceManifest,
    validateStoryDocument,
    type StoryVoiceManifest,
} from "@moesekai/story-core";
import {
    StoryStudioPlayer,
    type PlayerLayoutMode,
    type StoryPlayerExternalError,
    type StoryPlayerExternalSource,
    type StoryPlayerSlotContext,
    type StoryStudioPlayerSlots,
} from "@moesekai/story-editor";
import { useShellImmersiveMode } from "@/components/AppShell";
import Link from "@/components/LocalizedLink";
import MainLayout from "@/components/MainLayout";
import CommunityAuthorBadge from "@/components/community/CommunityAuthorBadge";
import CommunityMarkdown, { SpoilerCurtain } from "@/components/community/CommunityMarkdown";
import EntityCommentSection from "@/components/community/EntityCommentSection";
import { Button, Icon, IconButton, LoadingState, Surface } from "@/components/md3";
import {
    mdArrowBack,
    mdChatBubble,
    mdCheck,
    mdDownload,
    mdFavorite,
    mdFavoriteFill,
    mdForkRight,
    mdKeyboardArrowDown,
    mdKeyboardArrowUp,
    mdOpenInNew,
    mdRecordVoiceOver,
    mdShare,
} from "@/components/md3/icons";
import {
    StoryForkActionSheet,
    useStoryForkAction,
    type ForkableStoryPayload,
} from "@/components/story-maker/StoryForkActionSheet";
import { StoryStudioWebProvider } from "@/components/story-maker/StoryStudioWebProvider";
import { useI18n } from "@/contexts/I18nContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import {
    fetchCommunityPost,
    fetchCommunityStoryPlay,
    getCommunityErrorMessage,
    likeTarget,
    unlikeTarget,
} from "@/lib/community-api";
import { useCommunitySession } from "@/lib/community-session";
import { SUPPORTED_UI_LOCALES, type UiLocale } from "@/lib/i18n/locales";
import { signIn } from "@/lib/moesekai-account";
import {
    buildStoryPlayerLayoutQueryValue,
    resolveStoryPlayerLayoutMode,
} from "@/lib/story-maker-fork";
import type {
    AuthorSummary,
    CommunityStorySummary,
    ContentStatus,
    PostItem,
} from "@/types/community";

const MAX_VOICE_MANIFEST_BYTES = 2 * 1024 * 1024;
const DESCRIPTION_COLLAPSE_THRESHOLD = 140;

interface CommunityStoryPlaybackMeta {
    postId: number;
    title: string;
    status: ContentStatus;
    author: AuthorSummary;
    storySummary: CommunityStorySummary;
    updatedAt: string;
}

function StoryMakerPlayContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const session = useCommunitySession({ eager: false });

    const draftId = searchParams.get("id");
    const postIdRaw = searchParams.get("postId");
    const communityPostId = postIdRaw && /^\d+$/.test(postIdRaw) ? Number(postIdRaw) : null;
    const isCommunityStory = communityPostId !== null;
    const startNodeParam = searchParams.get("node");
    const localeParam = searchParams.get("locale");
    const initialLocaleParam: UiLocale | null = localeParam
        && (SUPPORTED_UI_LOCALES as readonly string[]).includes(localeParam)
        ? (localeParam as UiLocale)
        : null;
    const layoutParam = searchParams.get("layout");
    const initialImmersive = searchParams.get("immersive") !== "0";

    const [layoutMode, setLayoutMode] = useState<PlayerLayoutMode>(() =>
        resolveStoryPlayerLayoutMode(layoutParam, isCommunityStory),
    );
    const [effectiveImmersive, setEffectiveImmersive] = useState(false);
    const [overrideDraftId, setOverrideDraftId] = useState<string | null>(null);
    const [communityLoading, setCommunityLoading] = useState(isCommunityStory);
    const [communitySource, setCommunitySource] = useState<StoryPlayerExternalSource | null>(null);
    const [communityMeta, setCommunityMeta] = useState<CommunityStoryPlaybackMeta | null>(null);
    const [communityPost, setCommunityPost] = useState<PostItem | null>(null);
    const [communityError, setCommunityError] = useState<StoryPlayerExternalError | null>(null);
    const [activeCommunityPostId, setActiveCommunityPostId] = useState<number | null>(null);
    const [likeBusy, setLikeBusy] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [descExpanded, setDescExpanded] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const tRef = useRef(t);
    const loadSeqRef = useRef(0);
    const postSeqRef = useRef(0);
    const postFetchErrorRef = useRef(false);
    const shareTimerRef = useRef<number | null>(null);
    const toastTimerRef = useRef<number | null>(null);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useEffect(() => {
        return () => {
            if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
            if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
        };
    }, []);

    useEffect(() => {
        setLayoutMode(resolveStoryPlayerLayoutMode(layoutParam, isCommunityStory));
    }, [isCommunityStory, layoutParam]);

    useShellImmersiveMode(effectiveImmersive);

    const showToast = useCallback((message: string) => {
        setToastMessage(message);
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
            setToastMessage(null);
            toastTimerRef.current = null;
        }, 3200);
    }, []);

    useEffect(() => {
        const seq = ++loadSeqRef.current;
        const manifestAbort = new AbortController();
        setOverrideDraftId(null);
        if (communityPostId === null) {
            setCommunityLoading(false);
            setCommunitySource(null);
            setCommunityMeta(null);
            setCommunityPost(null);
            setCommunityError(null);
            setActiveCommunityPostId(null);
            setDescExpanded(false);
            return;
        }

        async function loadCommunityStory(postId: number) {
            setCommunityLoading(true);
            setCommunityError(null);
            setCommunitySource(null);
            setCommunityMeta(null);
            setCommunityPost(null);
            setActiveCommunityPostId(null);
            setDescExpanded(false);
            try {
                const res = await fetchCommunityStoryPlay(postId);
                if (seq !== loadSeqRef.current) return;
                const validated = validateStoryDocument(res.story_doc);
                const loadedDoc = validated.ok ? validated.doc : parseStoryDocumentDraft(res.story_doc);
                if (!loadedDoc) {
                    setCommunityError({
                        title: tRef.current("common.state.loadingFailed"),
                        description: tRef.current("page.storyMaker.publish.errors.invalidStoryDoc"),
                        action: (
                            <Button variant="filled" icon={mdArrowBack} href="/community/stories">
                                {tRef.current("page.community.stories.backToStories")}
                            </Button>
                        ),
                    });
                    return;
                }

                let mountedManifest: StoryVoiceManifest | null = null;
                if (res.voice_manifest) {
                    mountedManifest = parseStoryVoiceManifest(res.voice_manifest);
                } else if (res.voice_manifest_url && isSafeVoiceManifestUrl(res.voice_manifest_url)) {
                    try {
                        const manifestResp = await fetch(res.voice_manifest_url, {
                            mode: "cors",
                            credentials: "omit",
                            signal: manifestAbort.signal,
                        });
                        if (seq !== loadSeqRef.current) return;
                        const contentLength = Number(manifestResp.headers.get("content-length") ?? "0");
                        if (
                            manifestResp.ok
                            && (!Number.isFinite(contentLength) || contentLength <= MAX_VOICE_MANIFEST_BYTES)
                        ) {
                            const rawText = await manifestResp.text();
                            if (seq !== loadSeqRef.current) return;
                            if (rawText.length <= MAX_VOICE_MANIFEST_BYTES) {
                                mountedManifest = parseStoryVoiceManifest(JSON.parse(rawText));
                            }
                        }
                    } catch {
                        // Playable story still mounts even if optional external manifest fails
                    }
                }
                if (seq !== loadSeqRef.current) return;

                setActiveCommunityPostId(res.post_id);
                setCommunityMeta({
                    postId: res.post_id,
                    title: res.title || loadedDoc.meta.title,
                    status: res.status,
                    author: res.author,
                    storySummary: res.story_summary,
                    updatedAt: res.updated_at,
                });
                setCommunitySource({
                    key: `community:${res.post_id}`,
                    doc: loadedDoc,
                    voiceManifest: mountedManifest,
                });
            } catch (err) {
                if (seq !== loadSeqRef.current) return;
                setCommunityError({
                    title: tRef.current("common.state.loadingFailed"),
                    description: getCommunityErrorMessage(err, tRef.current),
                    action: (
                        <Button variant="filled" icon={mdArrowBack} href="/community/stories">
                            {tRef.current("page.community.stories.backToStories")}
                        </Button>
                    ),
                });
            } finally {
                if (seq === loadSeqRef.current) setCommunityLoading(false);
            }
        }

        void loadCommunityStory(communityPostId);
        return () => {
            manifestAbort.abort();
            loadSeqRef.current += 1;
        };
    }, [communityPostId]);

    // Non-blocking community post fetch for like counts, tags, and author description.
    useEffect(() => {
        const seq = ++postSeqRef.current;
        postFetchErrorRef.current = false;
        if (activeCommunityPostId === null) {
            setCommunityPost(null);
            return;
        }
        const postId = activeCommunityPostId;

        async function loadPostDetails() {
            try {
                const loaded = await fetchCommunityPost(postId);
                if (seq !== postSeqRef.current) return;
                setCommunityPost(loaded);
            } catch {
                if (seq !== postSeqRef.current) return;
                postFetchErrorRef.current = true;
            }
        }

        void loadPostDetails();
        return () => {
            postSeqRef.current += 1;
        };
    }, [activeCommunityPostId]);

    // Keep browser tab title synced with the loaded community story title.
    useEffect(() => {
        if (typeof document === "undefined") return;
        const storyTitle = communityMeta?.title.trim();
        if (!storyTitle) return;
        const previousTitle = document.title;
        document.title = `${storyTitle} | Moesekai`;
        return () => {
            document.title = previousTitle;
        };
    }, [communityMeta?.title]);

    const handleLayoutModeChange = useCallback(
        (next: PlayerLayoutMode) => {
            setLayoutMode(next);
            if (typeof window === "undefined") return;
            const url = new URL(window.location.href);
            const nextParam = buildStoryPlayerLayoutQueryValue(next, isCommunityStory);
            if (nextParam) url.searchParams.set("layout", nextParam);
            else url.searchParams.delete("layout");
            window.history.replaceState({}, "", url.toString());
        },
        [isCommunityStory],
    );

    const handleImmersiveChange = useCallback(
        (next: boolean, meta: { effective: boolean; userTriggered: boolean }) => {
            if (!meta.userTriggered || typeof window === "undefined") return;
            const url = new URL(window.location.href);
            if (next) url.searchParams.delete("immersive");
            else url.searchParams.set("immersive", "0");
            window.history.replaceState({}, "", url.toString());
        },
        [],
    );

    const handleClearExternalSource = useCallback(() => {
        loadSeqRef.current += 1;
        postSeqRef.current += 1;
        setCommunityLoading(false);
        setCommunitySource(null);
        setCommunityMeta(null);
        setCommunityPost(null);
        setCommunityError(null);
        setActiveCommunityPostId(null);
        setDescExpanded(false);
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("id");
            url.searchParams.delete("postId");
            url.searchParams.delete("node");
            window.history.replaceState({}, "", url.toString());
        }
    }, []);

    const handleSavedDraft = useCallback((createdId: string) => {
        loadSeqRef.current += 1;
        postSeqRef.current += 1;
        setOverrideDraftId(createdId);
        setCommunityLoading(false);
        setCommunitySource(null);
        setCommunityMeta(null);
        setCommunityPost(null);
        setCommunityError(null);
        setActiveCommunityPostId(null);
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        url.searchParams.delete("postId");
        url.searchParams.set("id", createdId);
        window.history.replaceState({}, "", url.toString());
    }, []);

    const handleCommentCountChange = useCallback((count: number) => {
        setCommunityPost((prev) =>
            !prev || prev.comment_count === count ? prev : { ...prev, comment_count: count },
        );
    }, []);

    const handleLikeToggle = useCallback(async () => {
        if (!communityPost || likeBusy) return;
        if (!session.authenticated) {
            signIn();
            return;
        }
        setLikeBusy(true);
        try {
            const res = communityPost.liked_by_me
                ? await unlikeTarget("post", communityPost.id)
                : await likeTarget("post", communityPost.id);
            setCommunityPost((prev) =>
                prev ? { ...prev, liked_by_me: res.liked, like_count: res.like_count } : prev,
            );
        } catch (err) {
            showToast(getCommunityErrorMessage(err, tRef.current));
        } finally {
            setLikeBusy(false);
        }
    }, [communityPost, likeBusy, session.authenticated, showToast]);

    const handleShare = useCallback(async () => {
        if (typeof window === "undefined") return;
        try {
            await navigator.clipboard.writeText(window.location.href);
            setShareCopied(true);
            showToast(tRef.current("page.community.post.linkCopied"));
            if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
            shareTimerRef.current = window.setTimeout(() => {
                setShareCopied(false);
                shareTimerRef.current = null;
            }, 2200);
        } catch {
            showToast(tRef.current("common.comments.errors.generic"));
        }
    }, [showToast]);

    const forkPayload = useMemo<ForkableStoryPayload | null>(() => {
        if (!communitySource || !communityMeta) return null;
        return {
            doc: communitySource.doc,
            postId: communityMeta.postId,
            title: communityMeta.title || communitySource.doc.meta.title,
            authorName: communityMeta.author.display_name,
        };
    }, [communityMeta, communitySource]);

    const {
        sheetOpen: forkSheetOpen,
        forkingDirect,
        directError: forkDirectError,
        openSheet: openForkSheet,
        closeSheet: closeForkSheet,
        triggerFork,
    } = useStoryForkAction({
        story: forkPayload,
        onNotify: showToast,
    });

    const communityPostHref = activeCommunityPostId !== null
        ? `/community/post/${activeCommunityPostId}`
        : null;

    const slots = useMemo<StoryStudioPlayerSlots>(
        () => ({
            headerActions: (ctx: StoryPlayerSlotContext) => {
                if (ctx.sourceKind !== "external" || !forkPayload) return null;
                return (
                    <>
                        <IconButton
                            size="xs"
                            icon={mdForkRight}
                            label={t("page.storyMaker.fork.action")}
                            title={t("page.storyMaker.fork.action")}
                            disabled={forkingDirect}
                            onClick={() => void triggerFork()}
                            className="shrink-0 sm:hidden"
                        />
                        <Button
                            size={ctx.immersive ? "xs" : "s"}
                            variant="tonal"
                            icon={mdForkRight}
                            disabled={forkingDirect}
                            onClick={() => void triggerFork()}
                            className="hidden shrink-0 sm:inline-flex"
                        >
                            {forkingDirect
                                ? t("page.storyMaker.fork.forkingAction")
                                : t("page.storyMaker.fork.actionShort")}
                        </Button>
                    </>
                );
            },
            immersiveMoreItems: (ctx: StoryPlayerSlotContext) => {
                if (ctx.sourceKind !== "external" || !communityPostHref) return [];
                return [
                    {
                        key: "fork-story",
                        label: t("page.storyMaker.fork.action"),
                        icon: mdForkRight,
                        disabled: forkingDirect,
                        onSelect: () => {
                            void triggerFork();
                        },
                    },
                    {
                        key: "fork-options",
                        label: t("page.storyMaker.fork.creationOptionsAction"),
                        icon: mdDownload,
                        onSelect: openForkSheet,
                    },
                    {
                        key: "community-post",
                        label: t("page.storyMaker.communityPlayer.viewOriginalPost"),
                        icon: mdOpenInNew,
                        href: communityPostHref,
                    },
                ];
            },
            endAction: (ctx: StoryPlayerSlotContext) => {
                if (ctx.sourceKind !== "external" || !forkPayload) return undefined;
                return (
                    <Button
                        size="s"
                        variant="tonal"
                        icon={mdForkRight}
                        disabled={forkingDirect}
                        onClick={() => void triggerFork()}
                    >
                        {forkingDirect
                            ? t("page.storyMaker.fork.forkingAction")
                            : t("page.storyMaker.fork.action")}
                    </Button>
                );
            },
            belowStage: (ctx: StoryPlayerSlotContext) => {
                if (ctx.sourceKind !== "external" || !communityMeta || !communityPostHref) {
                    return null;
                }
                const summary = communityMeta.storySummary;
                const regionKey = SERVER_LABEL_KEYS[summary.region as keyof typeof SERVER_LABEL_KEYS];
                const regionLabel = regionKey ? t(regionKey) : summary.region.toUpperCase();
                const descriptionText = (
                    communityPost?.body_md?.trim()
                    || communitySource?.doc.meta.summary?.trim()
                    || ""
                );
                const tags = communityPost?.tags ?? [];
                const canCollapseDesc =
                    descriptionText.length > DESCRIPTION_COLLAPSE_THRESHOLD
                    || descriptionText.split(/\r?\n/).length > 3;

                return (
                    <Surface
                        tone="card"
                        radius="lg"
                        className="mt-3 space-y-3 border border-outline-variant/60 p-3.5 sm:p-4"
                    >
                        {/* Title + compact story badges */}
                        <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-md3-xs border border-outline-variant bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant">
                                    {regionLabel}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-md3-xs bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant">
                                    <Icon path={mdChatBubble} size={12} />
                                    <span>
                                        {t("page.community.storyCard.beatCount", {
                                            count: summary.beat_count,
                                        })}
                                    </span>
                                </span>
                                {summary.has_voice_track && (
                                    <span className="inline-flex items-center gap-1 rounded-md3-xs bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                                        <Icon path={mdRecordVoiceOver} size={12} />
                                        <span>{t("page.community.storyCard.voiceBadge")}</span>
                                    </span>
                                )}
                            </div>
                            <h1 className="break-words type-title-l text-on-surface sm:type-headline-s">
                                {communityMeta.title}
                            </h1>
                        </div>

                        {/* Author row + video-site action bar */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <CommunityAuthorBadge
                                author={communityMeta.author}
                                timestamp={communityMeta.updatedAt}
                                compact
                            />

                            <div className="flex flex-wrap items-center gap-1.5">
                                {communityPost && (
                                    <Button
                                        variant={communityPost.liked_by_me ? "filled" : "tonal"}
                                        size="xs"
                                        icon={communityPost.liked_by_me ? mdFavoriteFill : mdFavorite}
                                        disabled={likeBusy}
                                        onClick={() => void handleLikeToggle()}
                                    >
                                        {communityPost.like_count}
                                    </Button>
                                )}
                                <Button
                                    variant="filled"
                                    size="xs"
                                    icon={mdForkRight}
                                    disabled={forkingDirect}
                                    onClick={() => void triggerFork()}
                                >
                                    {forkingDirect
                                        ? t("page.storyMaker.fork.forkingAction")
                                        : t("page.storyMaker.fork.action")}
                                </Button>
                                <Button
                                    variant="tonal"
                                    size="xs"
                                    icon={mdDownload}
                                    onClick={openForkSheet}
                                >
                                    {t("page.storyMaker.fork.creationOptionsAction")}
                                </Button>
                                <Button
                                    variant="outlined"
                                    size="xs"
                                    icon={shareCopied ? mdCheck : mdShare}
                                    onClick={() => void handleShare()}
                                >
                                    {shareCopied
                                        ? t("page.storyMaker.communityPlayer.copied")
                                        : t("page.community.post.share")}
                                </Button>
                                <Button
                                    variant="text"
                                    size="xs"
                                    icon={mdOpenInNew}
                                    href={communityPostHref}
                                >
                                    {t("page.storyMaker.communityPlayer.viewOriginalPost")}
                                </Button>
                            </div>
                        </div>

                        {toastMessage && (
                            <p
                                role="status"
                                className="rounded-md3-sm bg-secondary-container/70 px-3 py-1.5 type-label-m text-on-secondary-container"
                            >
                                {toastMessage}
                            </p>
                        )}

                        {/* Collapsible author notes + tags */}
                        {(descriptionText || tags.length > 0) && (
                            <div className="space-y-2 rounded-md3-md bg-surface-container p-3">
                                {descriptionText && (
                                    <SpoilerCurtain isSpoiler={Boolean(communityPost?.is_spoiler)}>
                                        <CommunityMarkdown
                                            content={descriptionText}
                                            compact={!descExpanded && canCollapseDesc}
                                        />
                                    </SpoilerCurtain>
                                )}
                                {canCollapseDesc && (
                                    <button
                                        type="button"
                                        onClick={() => setDescExpanded((prev) => !prev)}
                                        className="state-layer focus-ring inline-flex items-center gap-1 rounded-full px-2 py-0.5 type-label-m text-primary"
                                    >
                                        <Icon
                                            path={descExpanded ? mdKeyboardArrowUp : mdKeyboardArrowDown}
                                            size={16}
                                        />
                                        <span>
                                            {t(
                                                descExpanded
                                                    ? "page.storyMaker.communityPlayer.collapseDesc"
                                                    : "page.storyMaker.communityPlayer.expandDesc",
                                            )}
                                        </span>
                                    </button>
                                )}
                                {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                        {tags.map((tag) => (
                                            <Link
                                                key={tag}
                                                href={`/community/stories?tag=${encodeURIComponent(tag)}`}
                                                className="state-layer focus-ring rounded-full bg-surface-container-high px-2.5 py-0.5 type-label-s text-on-surface-variant hover:text-primary"
                                            >
                                                #{tag}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </Surface>
                );
            },
            companionPanel: (ctx: StoryPlayerSlotContext) => {
                if (ctx.sourceKind !== "external" || activeCommunityPostId === null) {
                    return null;
                }
                return (
                    <div className="px-0.5 pt-2 pb-4 lg:py-1 lg:pl-0 lg:pr-1">
                        <EntityCommentSection
                            key={activeCommunityPostId}
                            targetType="post"
                            targetId={activeCommunityPostId}
                            compact
                            onCommentCountChange={handleCommentCountChange}
                        />
                    </div>
                );
            },
        }),
        [
            activeCommunityPostId,
            communityMeta,
            communityPost,
            communityPostHref,
            communitySource?.doc.meta.summary,
            descExpanded,
            forkPayload,
            forkingDirect,
            handleCommentCountChange,
            handleLikeToggle,
            handleShare,
            likeBusy,
            openForkSheet,
            shareCopied,
            t,
            toastMessage,
            triggerFork,
        ],
    );

    return (
        <>
            <StoryStudioPlayer
                draftId={overrideDraftId ?? (communityPostId === null ? draftId : null)}
                startNodeId={communityPostId === null ? startNodeParam : null}
                initialLocale={initialLocaleParam}
                layoutMode={layoutMode}
                initialLayoutMode={layoutMode}
                initialImmersive={initialImmersive}
                onLayoutModeChange={handleLayoutModeChange}
                onImmersiveChange={handleImmersiveChange}
                onEffectiveImmersiveChange={setEffectiveImmersive}
                externalSource={communitySource}
                externalLoading={communityLoading}
                externalError={communityError}
                onClearExternalSource={handleClearExternalSource}
                onSavedDraft={handleSavedDraft}
                backToDraftsHref="/story-maker"
                homeHref="/"
                getEditHref={(id, isImmersive) =>
                    `/story-maker/edit?id=${encodeURIComponent(id)}${!isImmersive ? "&immersive=0" : ""}`
                }
                slots={slots}
            />

            <StoryForkActionSheet
                isOpen={forkSheetOpen}
                onClose={closeForkSheet}
                story={forkPayload}
                previewTitle={communityMeta?.title}
                previewAuthorName={communityMeta?.author.display_name}
                previewPostId={activeCommunityPostId ?? undefined}
                initialError={forkDirectError}
                onNotify={showToast}
            />
        </>
    );
}

export default function StoryMakerPlayClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <StoryStudioWebProvider>
                    <StoryMakerPlayContent />
                </StoryStudioWebProvider>
            </Suspense>
        </MainLayout>
    );
}
