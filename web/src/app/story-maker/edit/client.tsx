"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { getPublishedStoryLink } from "@moesekai/story-core";
import {
    StoryStudioEditor,
    type EditorSlotContext,
    type StoryEditorWorkspaceMode,
    type StoryStudioEditorHandle,
    type StoryStudioEditorSlots,
} from "@moesekai/story-editor";
import { useShellImmersiveMode } from "@/components/AppShell";
import MainLayout from "@/components/MainLayout";
import { Icon, LoadingState, cn } from "@/components/md3";
import { mdPublish, mdWandShine, mdWandStars } from "@/components/md3/icons";
import {
    StoryAudioUploadPanel,
    reconcileMountedPreviewBlobUrls,
} from "@/components/story-maker/StoryAudioUploadPanel";
import {
    StoryDesktopGuideDialog,
    useStoryDesktopGuide,
} from "@/components/story-maker/StoryDesktopGuideDialog";
import { StoryPublishDialog } from "@/components/story-maker/StoryPublishDialog";
import { StoryStudioWebProvider } from "@/components/story-maker/StoryStudioWebProvider";
import { useI18n } from "@/contexts/I18nContext";
import { localizePath } from "@/lib/localized-path";

// The agent and its model client load only when one of its surfaces is shown.
const loadAgentPanes = () => import("@/components/story-maker/StoryAgentPanes");
const DockedStoryAgent = dynamic(() => loadAgentPanes().then(m => m.DockedStoryAgent), { ssr: false });
const PhoneStoryAgent = dynamic(() => loadAgentPanes().then(m => m.PhoneStoryAgent), {
    ssr: false,
    loading: () => <LoadingState />,
});

function parseInitialMode(value: string | null): StoryEditorWorkspaceMode | null {
    if (value === "edit" || value === "playtest" || value === "code") return value;
    return null;
}

const subscribeNoop = () => () => {};
const getClientTrue = () => true;
const getServerFalse = () => false;

function StoryMakerEditContent() {
    const { t, routeLocale } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();

    const draftId = searchParams.get("id");
    const initialMode = parseInitialMode(searchParams.get("mode"));
    const initialNodeId = searchParams.get("node");
    const initialImmersive = searchParams.get("immersive") !== "0";

    const [effectiveImmersive, setEffectiveImmersive] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [agentOpen, setAgentOpen] = useState(false);
    const editorRef = useRef<StoryStudioEditorHandle>(null);
    const {
        isOpen: desktopGuideOpen,
        openGuide: openDesktopGuide,
        closeGuide: closeDesktopGuide,
    } = useStoryDesktopGuide();
    const isClient = useSyncExternalStore(subscribeNoop, getClientTrue, getServerFalse);
    const [publishedOverride, setPublishedOverride] = useState<{ draftId: string | null; postId: number | null } | null>(null);
    const publishedPostId =
        publishedOverride && publishedOverride.draftId === draftId
            ? publishedOverride.postId
            : isClient
                ? (getPublishedStoryLink(draftId)?.postId ?? null)
                : null;

    useShellImmersiveMode(effectiveImmersive);

    useEffect(() => {
        if (typeof window === "undefined" || !draftId) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get("id") !== draftId) {
            url.searchParams.set("id", draftId);
            window.history.replaceState({}, "", url.toString());
        }
    }, [draftId]);

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

    const handleModeChange = useCallback((nextMode: StoryEditorWorkspaceMode) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (nextMode === "edit") url.searchParams.delete("mode");
        else url.searchParams.set("mode", nextMode);
        window.history.replaceState({}, "", url.toString());
    }, []);

    const handleCreatedDraft = useCallback(
        (createdId: string) => {
            router.push(localizePath(`/story-maker/edit?id=${encodeURIComponent(createdId)}`, routeLocale));
        },
        [routeLocale, router],
    );

    const slots = useMemo<StoryStudioEditorSlots>(
        () => ({
            hasExternalDialogOpen: publishOpen || desktopGuideOpen,
            fileMenuItems: (ctx: EditorSlotContext) => [
                {
                    key: "publish-community",
                    label: t(
                        publishedPostId
                            ? "page.storyMaker.publish.updateAction"
                            : "page.storyMaker.publish.openAction",
                    ),
                    icon: mdPublish,
                    disabled: ctx.workspaceMode === "playtest",
                    dividerBefore: true,
                    onSelect: () => setPublishOpen(true),
                },
                {
                    key: "desktop-studio-guide",
                    label: t("page.storyMaker.desktopGuide.menuAction"),
                    icon: mdWandStars,
                    onSelect: openDesktopGuide,
                },
            ],
            toolbarActions: (ctx: EditorSlotContext) => {
                const isPlaytest = ctx.workspaceMode === "playtest";
                const actionLabel = t(
                    publishedPostId
                        ? "page.storyMaker.publish.updateAction"
                        : "page.storyMaker.publish.openAction",
                );
                const desktopLabel = t("page.storyMaker.desktopGuide.triggerAction");
                const desktopTooltip = t("page.storyMaker.desktopGuide.menuAction");
                const agentLabel = t("page.storyMaker.agent.title");
                return (
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            aria-pressed={agentOpen}
                            onClick={() => setAgentOpen(open => !open)}
                            title={agentLabel}
                            className={cn(
                                "state-layer focus-ring inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md3-full px-2.5 type-label-s transition-colors",
                                agentOpen ? "bg-tertiary text-on-tertiary" : "bg-tertiary-container text-on-tertiary-container",
                            )}
                        >
                            <Icon path={mdWandShine} size={14} className="shrink-0" />
                            <span className="hidden xl:inline">{agentLabel}</span>
                        </button>
                        <button
                            type="button"
                            onClick={openDesktopGuide}
                            title={desktopTooltip}
                            className="state-layer focus-ring inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md3-full bg-secondary-container px-2.5 type-label-s text-on-secondary-container transition-colors"
                        >
                            <Icon path={mdWandStars} size={14} className="shrink-0" />
                            <span className="hidden 2xl:inline">{desktopLabel}</span>
                        </button>
                        <button
                            type="button"
                            disabled={isPlaytest}
                            onClick={() => setPublishOpen(true)}
                            title={actionLabel}
                            className={cn(
                                "state-layer focus-ring inline-flex h-7 shrink-0 items-center gap-1 rounded-md3-full px-2.5 type-label-s transition-colors",
                                isPlaytest
                                    ? "cursor-default bg-surface-container text-on-surface-variant opacity-50"
                                    : "cursor-pointer bg-primary text-on-primary",
                            )}
                        >
                            <Icon path={mdPublish} size={14} className="shrink-0" />
                            <span className="hidden xl:inline">{actionLabel}</span>
                        </button>
                    </div>
                );
            },
            sidePanel: () =>
                agentOpen && draftId ? (
                    <DockedStoryAgent editorRef={editorRef} draftId={draftId} onClose={() => setAgentOpen(false)} />
                ) : null,
            voiceManifestUploadTab: (ctx: EditorSlotContext) => ({
                label: t("page.storyMaker.audioUpload.tabUpload"),
                render: (tabCtx) => (
                    <StoryAudioUploadPanel
                        doc={ctx.doc}
                        publishedPostId={publishedPostId}
                        currentManifest={tabCtx.currentManifest}
                        onApplyLocalManifest={tabCtx.applyManifest}
                        onRequestPublish={() => {
                            tabCtx.closeDialog();
                            setPublishOpen(true);
                        }}
                        onVoiceManifestReady={(manifestUrl) => {
                            void tabCtx.applyManifestUrl(manifestUrl);
                        }}
                        onNotify={tabCtx.notify}
                    />
                ),
            }),
            renderDialogs: (ctx: EditorSlotContext) => (
                <>
                    <StoryPublishDialog
                        isOpen={publishOpen}
                        onClose={() => setPublishOpen(false)}
                        doc={ctx.effectiveDoc}
                        draftId={ctx.draftId}
                        publishedPostId={publishedPostId}
                        hasBlockingErrors={ctx.hasBlockingErrors}
                        onPublished={(post) => setPublishedOverride({ draftId: ctx.draftId ?? draftId, postId: post.id })}
                        onClearPublishedLink={() => setPublishedOverride({ draftId: ctx.draftId ?? draftId, postId: null })}
                        onOpenVoiceUpload={(postId) => {
                            setPublishedOverride({ draftId: ctx.draftId ?? draftId, postId });
                            ctx.openVoiceManifestDialog("upload");
                        }}
                        onNotify={ctx.notify}
                    />
                    <StoryDesktopGuideDialog
                        isOpen={desktopGuideOpen}
                        onClose={closeDesktopGuide}
                    />
                </>
            ),
        }),
        [
            agentOpen,
            closeDesktopGuide,
            desktopGuideOpen,
            draftId,
            openDesktopGuide,
            publishOpen,
            publishedPostId,
            setAgentOpen,
            setPublishOpen,
            setPublishedOverride,
            t,
        ],
    );

    useEffect(() => {
        return () => {
            reconcileMountedPreviewBlobUrls(null);
        };
    }, []);

    return (
        <StoryStudioEditor
            ref={editorRef}
            draftId={draftId}
            initialMode={initialMode}
            initialNodeId={initialNodeId}
            initialImmersive={initialImmersive}
            enforceDesktopViewport
            narrowViewport={draftId ? <PhoneStoryAgent draftId={draftId} /> : undefined}
            onImmersiveChange={handleImmersiveChange}
            onEffectiveImmersiveChange={setEffectiveImmersive}
            onModeChange={handleModeChange}
            onCreatedDraft={handleCreatedDraft}
            onVoiceManifestChange={reconcileMountedPreviewBlobUrls}
            backToDraftsHref="/story-maker"
            homeHref="/"
            getDraftPlayHref={(id) => `/story-maker/play?id=${encodeURIComponent(id)}`}
            slots={slots}
        />
    );
}

export default function StoryMakerEditClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <StoryStudioWebProvider>
                    <StoryMakerEditContent />
                </StoryStudioWebProvider>
            </Suspense>
        </MainLayout>
    );
}
