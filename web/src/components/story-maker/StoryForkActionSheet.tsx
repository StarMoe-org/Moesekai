"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    StoryDraftsUnavailableError,
    type StoryDocument,
} from "@moesekai/story-core";
import ExternalLink from "@/components/ExternalLink";
import {
    Banner,
    BottomSheet,
    Button,
    Icon,
    LoadingState,
    Surface,
    cn,
} from "@/components/md3";
import {
    mdBookmarkAdd,
    mdCheckCircle,
    mdDesktopWindows,
    mdDownload,
    mdEdit,
    mdForkRight,
    mdOpenInNew,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { getCommunityErrorMessage } from "@/lib/community-api";
import { localizePath } from "@/lib/localized-path";
import {
    STORY_STUDIO_DESKTOP_NAME,
    STORY_STUDIO_DESKTOP_URL,
    cloneCommunityStoryToDraft,
    downloadStoryAsMsk,
} from "@/lib/story-maker-fork";

export const STORY_EDITOR_DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

export class StoryForkLoadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StoryForkLoadError";
    }
}

function resolveForkErrorMessage(
    err: unknown,
    t: (key: string) => string,
): string {
    if (err instanceof StoryDraftsUnavailableError) {
        return t("page.storyMaker.fork.errors.draftsUnavailable");
    }
    if (err instanceof StoryForkLoadError) {
        return err.message;
    }
    return getCommunityErrorMessage(err, t);
}

export interface ForkableStoryPayload {
    doc: StoryDocument;
    postId: number;
    title: string;
    authorName: string;
}

export interface UseStoryForkActionOptions {
    story?: ForkableStoryPayload | null;
    loadStory?: () => Promise<ForkableStoryPayload>;
    onNotify?: (message: string) => void;
}

export interface UseStoryForkActionResult {
    isDesktopViewport: boolean;
    sheetOpen: boolean;
    forkingDirect: boolean;
    directError: string | null;
    resolvedStory: ForkableStoryPayload | null;
    openSheet: () => void;
    closeSheet: () => void;
    clearDirectError: () => void;
    triggerFork: () => Promise<void>;
}

/**
 * Shared desktop-vs-mobile trigger for community story forking:
 * - Desktop (>= 1024px): clones straight into IndexedDB drafts and opens `/story-maker/edit?id=...`.
 * - Mobile (< 1024px): opens the creation options BottomSheet (Save to Drafts / Download .msk / Desktop Studio).
 */
export function useStoryForkAction({
    story = null,
    loadStory,
    onNotify,
}: UseStoryForkActionOptions): UseStoryForkActionResult {
    const { t, routeLocale } = useI18n();
    const router = useRouter();
    const isDesktopViewport = useMediaQuery(STORY_EDITOR_DESKTOP_MEDIA_QUERY, false);

    const [sheetOpen, setSheetOpen] = useState(false);
    const [forkingDirect, setForkingDirect] = useState(false);
    const [directError, setDirectError] = useState<string | null>(null);
    const [cachedStory, setCachedStory] = useState<ForkableStoryPayload | null>(null);

    const tRef = useRef(t);
    const loadStoryRef = useRef(loadStory);
    const onNotifyRef = useRef(onNotify);
    const reqSeqRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useEffect(() => {
        loadStoryRef.current = loadStory;
        setCachedStory(null);
    }, [loadStory]);

    useEffect(() => {
        onNotifyRef.current = onNotify;
    }, [onNotify]);

    useEffect(() => {
        return () => {
            reqSeqRef.current += 1;
        };
    }, []);

    const effectiveStory = story ?? cachedStory;

    const openSheet = useCallback(() => {
        setDirectError(null);
        setSheetOpen(true);
    }, []);

    const closeSheet = useCallback(() => {
        setSheetOpen(false);
    }, []);

    const clearDirectError = useCallback(() => {
        setDirectError(null);
    }, []);

    const triggerFork = useCallback(async () => {
        if (!isDesktopViewport) {
            setDirectError(null);
            setSheetOpen(true);
            return;
        }
        if (forkingDirect) return;

        const seq = ++reqSeqRef.current;
        setForkingDirect(true);
        setDirectError(null);
        try {
            let payload = effectiveStory;
            if (!payload) {
                if (!loadStoryRef.current) {
                    setSheetOpen(true);
                    return;
                }
                payload = await loadStoryRef.current();
                if (seq !== reqSeqRef.current) return;
                setCachedStory(payload);
            }

            const draft = await cloneCommunityStoryToDraft({
                doc: payload.doc,
                sourcePostId: payload.postId,
                sourceTitle: payload.title,
                sourceAuthorName: payload.authorName,
                titleSuffix: tRef.current("page.storyMaker.fork.titleSuffix"),
            });
            if (seq !== reqSeqRef.current) return;
            onNotifyRef.current?.(tRef.current("page.storyMaker.fork.savedDraftToast"));
            router.push(localizePath(`/story-maker/edit?id=${encodeURIComponent(draft.id)}`, routeLocale));
        } catch (err) {
            if (seq !== reqSeqRef.current) return;
            const message = resolveForkErrorMessage(err, tRef.current);
            setDirectError(message);
            // Fall back to the creation options sheet so users can still download `.msk` or use Desktop Studio.
            setSheetOpen(true);
        } finally {
            if (seq === reqSeqRef.current) {
                setForkingDirect(false);
            }
        }
    }, [effectiveStory, forkingDirect, isDesktopViewport, routeLocale, router]);

    return {
        isDesktopViewport,
        sheetOpen,
        forkingDirect,
        directError,
        resolvedStory: effectiveStory,
        openSheet,
        closeSheet,
        clearDirectError,
        triggerFork,
    };
}

export interface StoryForkActionSheetProps {
    isOpen: boolean;
    onClose: () => void;
    story?: ForkableStoryPayload | null;
    loadStory?: () => Promise<ForkableStoryPayload>;
    previewTitle?: string;
    previewAuthorName?: string;
    previewPostId?: number;
    initialError?: string | null;
    onNotify?: (message: string) => void;
}

export function StoryForkActionSheet({
    isOpen,
    onClose,
    story = null,
    loadStory,
    previewTitle,
    previewAuthorName,
    previewPostId,
    initialError = null,
    onNotify,
}: StoryForkActionSheetProps) {
    const { t, routeLocale } = useI18n();
    const router = useRouter();
    const isDesktopViewport = useMediaQuery(STORY_EDITOR_DESKTOP_MEDIA_QUERY, false);

    const [loadedStory, setLoadedStory] = useState<ForkableStoryPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyAction, setBusyAction] = useState<"edit" | "draft" | "download" | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
    const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);

    const tRef = useRef(t);
    const loadStoryRef = useRef(loadStory);
    const onNotifyRef = useRef(onNotify);
    const loadedStoryRef = useRef<ForkableStoryPayload | null>(null);
    const wasOpenRef = useRef(false);
    const loadSeqRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useEffect(() => {
        loadStoryRef.current = loadStory;
    }, [loadStory]);

    useEffect(() => {
        onNotifyRef.current = onNotify;
    }, [onNotify]);

    useEffect(() => {
        loadedStoryRef.current = loadedStory;
    }, [loadedStory]);

    const resolvedStory = story ?? loadedStory;
    const displayTitle = resolvedStory?.title || previewTitle || "";
    const displayAuthor = resolvedStory?.authorName || previewAuthorName || "";
    const displayPostId = resolvedStory?.postId ?? previewPostId ?? null;

    const runLazyLoad = useCallback(async () => {
        if (!loadStoryRef.current) return;
        const seq = ++loadSeqRef.current;
        setLoading(true);
        setLoadError(null);
        try {
            const payload = await loadStoryRef.current();
            if (seq !== loadSeqRef.current) return;
            setLoadedStory(payload);
        } catch (err) {
            if (seq !== loadSeqRef.current) return;
            setLoadError(resolveForkErrorMessage(err, tRef.current));
        } finally {
            if (seq === loadSeqRef.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            loadSeqRef.current += 1;
            setLoading(false);
            return;
        }
        if (wasOpenRef.current) return;
        wasOpenRef.current = true;

        setSavedDraftId(null);
        setDownloadedFilename(null);
        setBusyAction(null);

        const cachedMatches =
            loadedStoryRef.current !== null
            && (previewPostId === undefined || loadedStoryRef.current.postId === previewPostId);

        if (story) {
            setLoadedStory(story);
            setLoadError(null);
            setActionError(initialError);
            return;
        }
        if (cachedMatches) {
            setLoadError(null);
            setActionError(initialError);
            return;
        }
        if (initialError) {
            setActionError(null);
            setLoadError(initialError);
            return;
        }
        setActionError(null);
        setLoadError(null);
        if (loadStoryRef.current) {
            void runLazyLoad();
        }
    }, [initialError, isOpen, previewPostId, runLazyLoad, story]);

    useEffect(() => {
        return () => {
            loadSeqRef.current += 1;
        };
    }, []);

    // Clear stale lazy-loaded payload if the preview post changes.
    useEffect(() => {
        if (previewPostId !== undefined && loadedStory && loadedStory.postId !== previewPostId) {
            setLoadedStory(null);
        }
    }, [loadedStory, previewPostId]);

    const handleForkAndEdit = async () => {
        if (!resolvedStory || busyAction) return;
        setBusyAction("edit");
        setActionError(null);
        try {
            const draft = await cloneCommunityStoryToDraft({
                doc: resolvedStory.doc,
                sourcePostId: resolvedStory.postId,
                sourceTitle: resolvedStory.title,
                sourceAuthorName: resolvedStory.authorName,
                titleSuffix: t("page.storyMaker.fork.titleSuffix"),
            });
            onNotifyRef.current?.(t("page.storyMaker.fork.savedDraftToast"));
            onClose();
            router.push(localizePath(`/story-maker/edit?id=${encodeURIComponent(draft.id)}`, routeLocale));
        } catch (err) {
            setActionError(
                err instanceof StoryDraftsUnavailableError
                    ? t("page.storyMaker.fork.errors.draftsUnavailable")
                    : t("page.storyMaker.fork.errors.cloneFailed"),
            );
        } finally {
            setBusyAction(null);
        }
    };

    const handleSaveCopyToDrafts = async () => {
        if (!resolvedStory || busyAction) return;
        setBusyAction("draft");
        setActionError(null);
        try {
            const draft = await cloneCommunityStoryToDraft({
                doc: resolvedStory.doc,
                sourcePostId: resolvedStory.postId,
                sourceTitle: resolvedStory.title,
                sourceAuthorName: resolvedStory.authorName,
                titleSuffix: t("page.storyMaker.fork.titleSuffix"),
            });
            setSavedDraftId(draft.id);
            onNotifyRef.current?.(t("page.storyMaker.fork.savedDraftToast"));
        } catch (err) {
            setActionError(
                err instanceof StoryDraftsUnavailableError
                    ? t("page.storyMaker.fork.errors.draftsUnavailable")
                    : t("page.storyMaker.fork.errors.cloneFailed"),
            );
        } finally {
            setBusyAction(null);
        }
    };

    const handleDownloadMsk = () => {
        if (!resolvedStory || busyAction) return;
        setBusyAction("download");
        setActionError(null);
        try {
            const result = downloadStoryAsMsk(resolvedStory.doc, resolvedStory.title);
            if (!result.ok) {
                setActionError(t("page.storyMaker.fork.errors.downloadFailed"));
            } else {
                setDownloadedFilename(result.filename);
                onNotifyRef.current?.(
                    t("page.storyMaker.fork.downloadedToast", { filename: result.filename }),
                );
            }
        } finally {
            setBusyAction(null);
        }
    };

    const optionCardClass =
        "state-layer focus-ring flex w-full items-start gap-3.5 rounded-md3-lg border border-outline-variant/70 bg-surface-container p-3.5 text-left text-on-surface transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-55";

    return (
        <BottomSheet
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.storyMaker.fork.sheetTitle")}
            syncHistory={false}
        >
            <div className="space-y-4">
                {/* Original story source summary */}
                <Surface
                    tone="card"
                    radius="lg"
                    className="flex items-start gap-3 border border-outline-variant/60 p-3.5"
                >
                    <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-md3-md bg-primary-container text-on-primary-container"
                        aria-hidden="true"
                    >
                        <Icon path={mdForkRight} size={20} />
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate type-title-s text-on-surface">
                            {displayTitle || t("page.storyMaker.fork.untitledFallback")}
                        </p>
                        <p className="truncate type-body-s text-on-surface-variant">
                            {displayAuthor
                                ? t("page.storyMaker.fork.sourceByline", {
                                      author: displayAuthor,
                                      postId: displayPostId ?? "",
                                  })
                                : displayPostId !== null
                                    ? `#${displayPostId}`
                                    : ""}
                        </p>
                        <p className="type-label-s text-on-surface-variant">
                            {t("page.storyMaker.fork.attributionHint")}
                        </p>
                    </div>
                </Surface>

                {!isDesktopViewport && (
                    <p className="type-body-s text-on-surface-variant">
                        {t("page.storyMaker.fork.mobileEditorHint")}
                    </p>
                )}

                {actionError && <Banner tone="error">{actionError}</Banner>}

                {savedDraftId && (
                    <Surface
                        tone="low"
                        radius="lg"
                        className="space-y-2.5 border border-primary/35 p-3.5"
                    >
                        <div className="flex items-center gap-2 text-primary">
                            <Icon path={mdCheckCircle} size={18} className="shrink-0" />
                            <p className="type-title-s">
                                {t("page.storyMaker.fork.savedDraftTitle")}
                            </p>
                        </div>
                        <p className="type-body-s text-on-surface-variant">
                            {t("page.storyMaker.fork.savedDraftDesc")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {isDesktopViewport && (
                                <Button
                                    variant="filled"
                                    size="xs"
                                    icon={mdEdit}
                                    href={`/story-maker/edit?id=${encodeURIComponent(savedDraftId)}`}
                                    onClick={onClose}
                                >
                                    {t("page.storyMaker.fork.openInEditor")}
                                </Button>
                            )}
                            <Button
                                variant="tonal"
                                size="xs"
                                icon={mdBookmarkAdd}
                                href="/story-maker"
                                onClick={onClose}
                            >
                                {t("page.storyMaker.fork.openDraftsHub")}
                            </Button>
                        </div>
                    </Surface>
                )}

                {downloadedFilename && (
                    <Banner tone="info">
                        {t("page.storyMaker.fork.downloadedToast", { filename: downloadedFilename })}
                    </Banner>
                )}

                {loading ? (
                    <LoadingState label={t("page.storyMaker.fork.loadingStory")} />
                ) : loadError ? (
                    <Banner
                        tone="error"
                        action={
                            <Button variant="tonal" size="xs" onClick={() => void runLazyLoad()}>
                                {t("common.action.retry")}
                            </Button>
                        }
                    >
                        {loadError}
                    </Banner>
                ) : (
                    <div className="space-y-2.5">
                        {isDesktopViewport && (
                            <button
                                type="button"
                                disabled={!resolvedStory || busyAction !== null}
                                onClick={() => void handleForkAndEdit()}
                                className={cn(optionCardClass, "border-primary/40 bg-primary-container/25")}
                            >
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-md3-md bg-primary text-on-primary">
                                    <Icon path={mdEdit} size={20} />
                                </span>
                                <span className="min-w-0 flex-1 space-y-0.5">
                                    <span className="block type-title-s text-on-surface">
                                        {busyAction === "edit"
                                            ? t("page.storyMaker.fork.forkingAction")
                                            : t("page.storyMaker.fork.optionEditTitle")}
                                    </span>
                                    <span className="block type-body-s text-on-surface-variant">
                                        {t("page.storyMaker.fork.optionEditDesc")}
                                    </span>
                                </span>
                            </button>
                        )}

                        <button
                            type="button"
                            disabled={!resolvedStory || busyAction !== null}
                            onClick={() => void handleSaveCopyToDrafts()}
                            className={optionCardClass}
                        >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-md3-md bg-secondary-container text-on-secondary-container">
                                <Icon path={mdBookmarkAdd} size={20} />
                            </span>
                            <span className="min-w-0 flex-1 space-y-0.5">
                                <span className="block type-title-s text-on-surface">
                                    {busyAction === "draft"
                                        ? t("page.storyMaker.fork.forkingAction")
                                        : t("page.storyMaker.fork.optionSaveDraftTitle")}
                                </span>
                                <span className="block type-body-s text-on-surface-variant">
                                    {t("page.storyMaker.fork.optionSaveDraftDesc")}
                                </span>
                            </span>
                        </button>

                        <button
                            type="button"
                            disabled={!resolvedStory || busyAction !== null}
                            onClick={handleDownloadMsk}
                            className={optionCardClass}
                        >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-md3-md bg-surface-container-high text-on-surface">
                                <Icon path={mdDownload} size={20} />
                            </span>
                            <span className="min-w-0 flex-1 space-y-0.5">
                                <span className="block type-title-s text-on-surface">
                                    {t("page.storyMaker.fork.optionDownloadMskTitle")}
                                </span>
                                <span className="block type-body-s text-on-surface-variant">
                                    {t("page.storyMaker.fork.optionDownloadMskDesc")}
                                </span>
                            </span>
                        </button>

                        <ExternalLink
                            href={STORY_STUDIO_DESKTOP_URL}
                            className={optionCardClass}
                        >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-md3-md bg-tertiary-container text-on-tertiary-container">
                                <Icon path={mdDesktopWindows} size={20} />
                            </span>
                            <span className="min-w-0 flex-1 space-y-0.5">
                                <span className="flex items-center gap-1.5 type-title-s text-on-surface">
                                    <span className="truncate">
                                        {t("page.storyMaker.fork.optionDesktopTitle", {
                                            name: STORY_STUDIO_DESKTOP_NAME,
                                        })}
                                    </span>
                                    <Icon path={mdOpenInNew} size={15} className="shrink-0 text-on-surface-variant" />
                                </span>
                                <span className="block type-body-s text-on-surface-variant">
                                    {t("page.storyMaker.fork.optionDesktopDesc")}
                                </span>
                            </span>
                        </ExternalLink>
                    </div>
                )}
            </div>
        </BottomSheet>
    );
}

export default StoryForkActionSheet;
