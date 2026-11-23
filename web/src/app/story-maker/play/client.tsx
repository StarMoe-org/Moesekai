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
import MainLayout from "@/components/MainLayout";
import { Button, LoadingState } from "@/components/md3";
import { mdArrowBack, mdChatBubble } from "@/components/md3/icons";
import { StoryStudioWebProvider } from "@/components/story-maker/StoryStudioWebProvider";
import { useI18n } from "@/contexts/I18nContext";
import { fetchCommunityStoryPlay, getCommunityErrorMessage } from "@/lib/community-api";
import { SUPPORTED_UI_LOCALES, type UiLocale } from "@/lib/i18n/locales";

const MAX_VOICE_MANIFEST_BYTES = 2 * 1024 * 1024;

function StoryMakerPlayContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();

    const draftId = searchParams.get("id");
    const postIdRaw = searchParams.get("postId");
    const communityPostId = postIdRaw && /^\d+$/.test(postIdRaw) ? Number(postIdRaw) : null;
    const startNodeParam = searchParams.get("node");
    const localeParam = searchParams.get("locale");
    const initialLocaleParam: UiLocale | null = localeParam
        && (SUPPORTED_UI_LOCALES as readonly string[]).includes(localeParam)
        ? (localeParam as UiLocale)
        : null;
    const initialLayoutMode: PlayerLayoutMode = searchParams.get("layout") === "theater"
        ? "theater"
        : "workspace";
    const initialImmersive = searchParams.get("immersive") !== "0";

    const [effectiveImmersive, setEffectiveImmersive] = useState(false);
    const [communityLoading, setCommunityLoading] = useState(communityPostId !== null);
    const [communitySource, setCommunitySource] = useState<StoryPlayerExternalSource | null>(null);
    const [communityError, setCommunityError] = useState<StoryPlayerExternalError | null>(null);
    const [activeCommunityPostId, setActiveCommunityPostId] = useState<number | null>(null);

    const tRef = useRef(t);
    const loadSeqRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useShellImmersiveMode(effectiveImmersive);

    useEffect(() => {
        const seq = ++loadSeqRef.current;
        const manifestAbort = new AbortController();
        if (communityPostId === null) {
            setCommunityLoading(false);
            setCommunitySource(null);
            setCommunityError(null);
            setActiveCommunityPostId(null);
            return;
        }

        async function loadCommunityStory(postId: number) {
            setCommunityLoading(true);
            setCommunityError(null);
            setCommunitySource(null);
            setActiveCommunityPostId(null);
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

    const handleLayoutModeChange = useCallback((next: PlayerLayoutMode) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (next === "theater") url.searchParams.set("layout", "theater");
        else url.searchParams.delete("layout");
        window.history.replaceState({}, "", url.toString());
    }, []);

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
        setCommunityLoading(false);
        setCommunitySource(null);
        setCommunityError(null);
        setActiveCommunityPostId(null);
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("id");
            url.searchParams.delete("postId");
            url.searchParams.delete("node");
            window.history.replaceState({}, "", url.toString());
        }
    }, []);

    const handleSavedDraft = useCallback((createdId: string) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        url.searchParams.set("id", createdId);
        window.history.replaceState({}, "", url.toString());
    }, []);

    const communityPostHref = activeCommunityPostId !== null
        ? `/community/post/${activeCommunityPostId}`
        : null;

    const slots = useMemo<StoryStudioPlayerSlots>(
        () => ({
            headerActions: (ctx: StoryPlayerSlotContext) => {
                if (ctx.sourceKind !== "external" || !communityPostHref) return null;
                return (
                    <Button
                        size={ctx.immersive ? "xs" : undefined}
                        variant="tonal"
                        icon={mdChatBubble}
                        href={communityPostHref}
                        className={ctx.immersive ? undefined : "max-w-full px-3 sm:px-4"}
                    >
                        {t("page.storyMaker.player.viewCommunityPost")}
                    </Button>
                );
            },
            immersiveMoreItems: (ctx: StoryPlayerSlotContext) => {
                if (ctx.sourceKind !== "external" || !communityPostHref) return [];
                return [
                    {
                        key: "community-post",
                        label: t("page.storyMaker.player.viewCommunityPost"),
                        icon: mdChatBubble,
                        href: communityPostHref,
                    },
                ];
            },
            endAction: (ctx: StoryPlayerSlotContext) => {
                if (ctx.sourceKind !== "external" || !communityPostHref) return undefined;
                return (
                    <Button variant="tonal" icon={mdChatBubble} href={communityPostHref}>
                        {t("page.storyMaker.player.viewCommunityPost")}
                    </Button>
                );
            },
        }),
        [communityPostHref, t],
    );

    return (
        <StoryStudioPlayer
            draftId={communityPostId === null ? draftId : null}
            startNodeId={communityPostId === null ? startNodeParam : null}
            initialLocale={initialLocaleParam}
            initialLayoutMode={initialLayoutMode}
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
