"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useShellImmersiveMode } from "@/components/AppShell";
import LocalizedLink from "@/components/LocalizedLink";
import MainLayout from "@/components/MainLayout";
import {
    Banner, Button, Card, Dialog, EmptyState, Icon, IconButton, LoadingState, Menu, PageContainer,
    PageHeader, SegmentedButton, Snackbar, cn, type MenuItemDef,
} from "@/components/md3";
import {
    mdArrowBack, mdBookmarkAdd, mdChatBubble, mdCloseFullscreen, mdCode, mdDashboard, mdEdit, mdErrorFill,
    mdHome, mdMoreVert, mdOpenInFull, mdPlayArrowFill, mdRecordVoiceOver, mdTheaters, mdTranslate,
    mdUploadFile, mdWarning,
} from "@/components/md3/icons";
import { StoryImportDialog } from "@/components/story-maker/StoryImportDialog";
import { StoryPlayerView, type PlayerLayoutMode } from "@/components/story-maker/StoryPlayerView";
import { StoryVoiceManifestDialog } from "@/components/story-maker/StoryVoiceManifestDialog";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { MOE_LOGO_URL } from "@/lib/assets";
import { fetchCommunityStoryPlay, getCommunityErrorMessage } from "@/lib/community-api";
import { SUPPORTED_UI_LOCALES, UI_LOCALE_LABELS, type UiLocale } from "@/lib/i18n/locales";
import { compileStoryGraph } from "@/lib/storyMaker/compiler";
import { upsertStoryLocalePack } from "@/lib/storyMaker/document";
import { StoryDraftsUnavailableError, createDraft, getDraft } from "@/lib/storyMaker/drafts";
import {
    isSafeVoiceManifestUrl,
    parseAndValidateLocalePack,
    parseStoryVoiceManifest,
} from "@/lib/storyMaker/i18nPack";
import { downloadStoryScript } from "@/lib/storyMaker/starter";
import { parseStoryDocumentDraft, validateStoryDocument } from "@/lib/storyMaker/validate";
import type { StoryDocument, StoryVoiceManifest } from "@/types/storyMaker";

type PlaySource =
    | { kind: "empty" }
    | { kind: "draft"; id: string; doc: StoryDocument }
    | { kind: "community"; postId: number; postTitle: string; authorName: string; doc: StoryDocument }
    | { kind: "imported"; doc: StoryDocument; key: number };

function StoryMakerPlayContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const { assetSource } = useTheme();
    const line = assetSource.startsWith("backup") ? "backup" : "main";

    const draftId = searchParams.get("id");
    const postIdRaw = searchParams.get("postId");
    const communityPostId = postIdRaw && /^\d+$/.test(postIdRaw) ? Number(postIdRaw) : null;
    const startNodeParam = searchParams.get("node");
    const localeParam = searchParams.get("locale");
    const initialLocaleParam: UiLocale | null = localeParam && (SUPPORTED_UI_LOCALES as readonly string[]).includes(localeParam)
        ? (localeParam as UiLocale)
        : null;
    const [layoutMode, setLayoutMode] = useState<PlayerLayoutMode>(() => (
        searchParams.get("layout") === "theater" ? "theater" : "workspace"
    ));
    // Auto-enter immersive mode when a story is loaded unless `?immersive=0` is explicitly set.
    const [immersive, setImmersive] = useState<boolean>(() => (
        searchParams.get("immersive") !== "0"
    ));
    const [loading, setLoading] = useState(Boolean(draftId || communityPostId));
    const [voiceManifest, setVoiceManifest] = useState<StoryVoiceManifest | null>(null);
    const [preferredLocale, setPreferredLocale] = useState<UiLocale | null>(initialLocaleParam);
    const localePackInputRef = useRef<HTMLInputElement | null>(null);
    const tRef = useRef(t);
    const loadSeqRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const handleLayoutModeChange = useCallback((next: PlayerLayoutMode) => {
        setLayoutMode(next);
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            if (next === "theater") url.searchParams.set("layout", "theater");
            else url.searchParams.delete("layout");
            window.history.replaceState({}, "", url.toString());
        }
    }, []);

    const handleImmersiveChange = useCallback((next: boolean) => {
        setImmersive(next);
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            if (next) url.searchParams.delete("immersive");
            else url.searchParams.set("immersive", "0");
            window.history.replaceState({}, "", url.toString());
        }
    }, []);

    const [loadError, setLoadError] = useState<"missing" | "unavailable" | "failed" | "communityFailed" | null>(null);
    const [communityErrorText, setCommunityErrorText] = useState<string | null>(null);
    const [source, setSource] = useState<PlaySource>({ kind: "empty" });
    const [importOpen, setImportOpen] = useState(false);
    const [voiceManifestOpen, setVoiceManifestOpen] = useState(false);
    const [issuesOpen, setIssuesOpen] = useState(false);
    const [snack, setSnack] = useState<string | null>(null);
    const [importCounter, setImportCounter] = useState(0);

    useEffect(() => {
        const seq = ++loadSeqRef.current;
        async function load() {
            setLoadError(null);
            setCommunityErrorText(null);
            setVoiceManifest(null);

            if (communityPostId !== null) {
                setLoading(true);
                try {
                    const res = await fetchCommunityStoryPlay(communityPostId);
                    if (seq !== loadSeqRef.current) return;
                    const validated = validateStoryDocument(res.story_doc);
                    const loadedDoc = validated.ok ? validated.doc : parseStoryDocumentDraft(res.story_doc);
                    if (!loadedDoc) {
                        setSource({ kind: "empty" });
                        setLoadError("communityFailed");
                        setCommunityErrorText(tRef.current("page.storyMaker.publish.errors.invalidStoryDoc"));
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
                            });
                            if (seq !== loadSeqRef.current) return;
                            if (manifestResp.ok) {
                                mountedManifest = parseStoryVoiceManifest(await manifestResp.json());
                            }
                        } catch {
                            // Playable story still mounts even if optional external manifest fails
                        }
                    }
                    if (seq !== loadSeqRef.current) return;
                    setVoiceManifest(mountedManifest);
                    setSource({
                        kind: "community",
                        postId: res.post_id,
                        postTitle: res.title,
                        authorName: res.author.display_name,
                        doc: loadedDoc,
                    });
                } catch (err) {
                    if (seq !== loadSeqRef.current) return;
                    setSource({ kind: "empty" });
                    setLoadError("communityFailed");
                    setCommunityErrorText(getCommunityErrorMessage(err, tRef.current));
                } finally {
                    if (seq === loadSeqRef.current) setLoading(false);
                }
                return;
            }

            if (!draftId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const draft = await getDraft(draftId);
                if (seq !== loadSeqRef.current) return;
                if (!draft) {
                    setSource({ kind: "empty" });
                    setLoadError("missing");
                } else {
                    setSource({ kind: "draft", id: draft.id, doc: draft.doc });
                }
            } catch (error) {
                if (seq !== loadSeqRef.current) return;
                setSource({ kind: "empty" });
                setLoadError(error instanceof StoryDraftsUnavailableError ? "unavailable" : "failed");
            } finally {
                if (seq === loadSeqRef.current) setLoading(false);
            }
        }
        void load();
        return () => {
            loadSeqRef.current += 1;
        };
    }, [communityPostId, draftId]);

    const activeDoc = source.kind === "empty" ? null : source.doc;
    const program = useMemo(() => (activeDoc ? compileStoryGraph(activeDoc) : null), [activeDoc]);
    const diagnostics = useMemo(() => program?.diagnostics ?? [], [program]);
    const warnings = useMemo(() => program?.warnings ?? [], [program]);
    const hasBlockingErrors = Boolean(program && program.errors.length > 0);

    const handleImportForPlay = (doc: StoryDocument) => {
        const nextKey = importCounter + 1;
        setImportCounter(nextKey);
        setLoadError(null);
        setVoiceManifest(null);
        setPreferredLocale(null);
        setSource({ kind: "imported", doc, key: nextKey });
        setImportOpen(false);
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("id");
            url.searchParams.delete("postId");
            url.searchParams.delete("node");
            window.history.replaceState({}, "", url.toString());
        }
    };

    const handleLocalePackFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !activeDoc) return;
        try {
            const rawText = await file.text();
            const parsed = JSON.parse(rawText) as { locale?: unknown };
            const fileLocale = typeof parsed?.locale === "string"
                && (SUPPORTED_UI_LOCALES as readonly string[]).includes(parsed.locale)
                ? (parsed.locale as UiLocale)
                : null;
            if (!fileLocale) {
                setSnack(t("page.storyMaker.i18n.invalidLocalePackToast"));
                return;
            }
            const result = parseAndValidateLocalePack(rawText, activeDoc, fileLocale, {
                importSource: "file_upload",
            });
            if (!result.ok || !result.pack) {
                setSnack(t("page.storyMaker.i18n.invalidLocalePackToast"));
                return;
            }
            const nextPack = result.pack;
            setSource((prev) => {
                if (prev.kind === "empty") return prev;
                return { ...prev, doc: upsertStoryLocalePack(prev.doc, nextPack) };
            });
            setPreferredLocale(nextPack.locale);
            setSnack(t("page.storyMaker.i18n.loadedLocalePackToast", {
                locale: UI_LOCALE_LABELS[nextPack.locale],
            }));
        } catch {
            setSnack(t("page.storyMaker.i18n.invalidLocalePackToast"));
        }
    };

    const handleSaveImported = async () => {
        if (source.kind !== "imported") return;
        try {
            const created = await createDraft(source.doc);
            setSource({ kind: "draft", id: created.id, doc: created.doc });
            if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.set("id", created.id);
                window.history.replaceState({}, "", url.toString());
            }
            setSnack(t("page.storyMaker.player.savedDraftToast"));
        } catch {
            setSnack(t("page.storyMaker.storage.failedTitle"));
        }
    };

    const playerKey = source.kind === "draft"
        ? `draft:${source.id}`
        : source.kind === "community"
            ? `community:${source.postId}`
            : source.kind === "imported"
                ? `imported:${source.key}`
                : "empty";

    const isWorkspaceActive = Boolean(activeDoc) && layoutMode === "workspace";
    const isImmersiveActive = Boolean(activeDoc) && immersive;

    // Suppress AppShell chrome in the same paint so the persistent wrapper owns 100vw x 100dvh
    // without ever unmounting <StoryPlayerView> / <StoryStageView>.
    useShellImmersiveMode(isImmersiveActive);

    useEffect(() => {
        if (!isImmersiveActive || typeof document === "undefined") return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [isImmersiveActive]);

    useEffect(() => {
        if (!isImmersiveActive) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            if (document.fullscreenElement) return;
            if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
            const target = event.target as HTMLElement | null;
            if (
                target
                && (
                    target.tagName === "INPUT"
                    || target.tagName === "TEXTAREA"
                    || target.tagName === "SELECT"
                    || target.isContentEditable
                )
            ) {
                return;
            }
            event.preventDefault();
            handleImmersiveChange(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleImmersiveChange, isImmersiveActive]);

    const editHref = source.kind === "draft"
        ? `/story-maker/edit?id=${encodeURIComponent(source.id)}${!immersive ? "&immersive=0" : ""}`
        : null;
    const communityPostHref = source.kind === "community"
        ? `/community/post/${source.postId}`
        : null;

    const immersiveMoreItems: MenuItemDef[] = activeDoc ? [
        ...(communityPostHref ? [{
            key: "community-post",
            label: t("page.storyMaker.player.viewCommunityPost"),
            icon: mdChatBubble,
            href: communityPostHref,
        }] : []),
        ...(source.kind === "imported" ? [{
            key: "save-draft",
            label: t("page.storyMaker.player.saveAsDraft"),
            icon: mdBookmarkAdd,
            onSelect: () => void handleSaveImported(),
        }] : []),
        {
            key: "load-voice-manifest",
            label: t("page.storyMaker.voiceTrack.action"),
            icon: mdRecordVoiceOver,
            dividerBefore: true,
            onSelect: () => setVoiceManifestOpen(true),
        },
        {
            key: "export-msk",
            label: t("page.storyMaker.v2.script.downloadScript"),
            icon: mdCode,
            dividerBefore: true,
            onSelect: () => {
                downloadStoryScript(activeDoc);
                setSnack(t("page.storyMaker.exportedToast"));
            },
        },
        {
            key: "exit-immersive",
            label: t("page.storyMaker.nle.exitImmersive"),
            icon: mdCloseFullscreen,
            dividerBefore: true,
            onSelect: () => handleImmersiveChange(false),
        },
        {
            key: "back-drafts",
            label: t("page.storyMaker.action.backToDrafts"),
            icon: mdArrowBack,
            href: "/story-maker",
        },
        {
            key: "back-home",
            label: t("page.storyMaker.v2.ide.backHome"),
            icon: mdHome,
            href: "/",
        },
    ] : [];

    return (
        <PageContainer
            className={cn(
                "min-w-0 max-w-full overflow-x-clip",
                isWorkspaceActive && !isImmersiveActive && "xl:max-w-[1680px] xl:py-3",
                isImmersiveActive && "fixed inset-0 z-[150] flex h-dvh w-screen max-w-none flex-col gap-1.5 overflow-x-hidden bg-surface p-1.5 sm:p-2",
                isImmersiveActive && (layoutMode === "workspace" ? "overflow-y-auto xl:overflow-hidden" : "overflow-y-auto"),
            )}
        >
            {isImmersiveActive && activeDoc ? (
                <header className="flex h-11 min-w-0 shrink-0 items-center justify-between gap-2 rounded-md3-lg border border-outline-variant/60 bg-surface-container-low px-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <LocalizedLink
                            href="/story-maker"
                            title={t("page.storyMaker.title")}
                            className="focus-ring flex shrink-0 items-center gap-1.5 rounded-md3-sm px-1.5 py-1"
                        >
                            <span
                                className="block h-5 w-[3.25rem] bg-primary"
                                style={{
                                    maskImage: `url(${MOE_LOGO_URL})`,
                                    maskSize: "contain",
                                    maskPosition: "center",
                                    maskRepeat: "no-repeat",
                                    WebkitMaskImage: `url(${MOE_LOGO_URL})`,
                                    WebkitMaskSize: "contain",
                                    WebkitMaskPosition: "center",
                                    WebkitMaskRepeat: "no-repeat",
                                }}
                            />
                            <span className="rounded-md3-xs bg-tertiary-container px-1 py-0.5 text-[10px] font-semibold leading-none text-on-tertiary-container">
                                {t("page.storyMaker.betaBadge")}
                            </span>
                        </LocalizedLink>
                        <span aria-hidden className="h-4 w-px shrink-0 bg-outline-variant/60" />
                        <span className="min-w-0 truncate type-label-l text-on-surface">
                            {activeDoc.meta.title || t("page.storyMaker.untitled")}
                        </span>
                        <span className="hidden shrink-0 rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 type-label-s text-on-surface-variant md:inline">
                            {t(SERVER_LABEL_KEYS[activeDoc.region])}
                        </span>
                        {source.kind === "imported" && (
                            <span className="hidden shrink-0 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 type-label-s text-on-secondary-container lg:inline">
                                {t("page.storyMaker.player.unsavedBadge")}
                            </span>
                        )}
                    </div>

                    <SegmentedButton<PlayerLayoutMode>
                        density={-2}
                        value={layoutMode}
                        onValueChange={handleLayoutModeChange}
                        aria-label={t("page.storyMaker.nle.layoutWorkspace")}
                        className="w-auto shrink-0"
                        options={[
                            { value: "workspace", label: t("page.storyMaker.nle.layoutWorkspace"), icon: mdDashboard },
                            { value: "theater", label: t("page.storyMaker.nle.layoutTheater"), icon: mdTheaters },
                        ]}
                    />

                    <div className="flex flex-1 shrink-0 items-center justify-end gap-1">
                        {communityPostHref && (
                            <Button size="xs" variant="tonal" icon={mdChatBubble} href={communityPostHref}>
                                {t("page.storyMaker.player.viewCommunityPost")}
                            </Button>
                        )}
                        {editHref && (
                            <Button size="xs" variant="tonal" icon={mdEdit} href={editHref}>
                                {t("page.storyMaker.action.edit")}
                            </Button>
                        )}
                        <IconButton
                            size="xs"
                            variant={voiceManifest ? "tonal" : "standard"}
                            icon={mdRecordVoiceOver}
                            label={t("page.storyMaker.voiceTrack.action")}
                            onClick={() => setVoiceManifestOpen(true)}
                        />
                        <IconButton
                            size="xs"
                            icon={mdTranslate}
                            label={t("page.storyMaker.i18n.loadLocalePackAction")}
                            onClick={() => localePackInputRef.current?.click()}
                        />
                        <IconButton
                            size="xs"
                            icon={mdUploadFile}
                            label={t("page.storyMaker.player.openScript")}
                            onClick={() => setImportOpen(true)}
                        />
                        <Menu
                            align="end"
                            items={immersiveMoreItems}
                            anchor={({ ref, onClick, ...aria }) => (
                                <IconButton
                                    ref={ref}
                                    size="xs"
                                    icon={mdMoreVert}
                                    label={t("page.storyMaker.v2.ide.moreActions")}
                                    onClick={onClick}
                                    {...aria}
                                />
                            )}
                        />
                    </div>
                </header>
            ) : (
                <PageHeader
                    className={cn(isWorkspaceActive && "xl:mb-2.5")}
                    eyebrow={activeDoc ? (
                        <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 break-words">
                            <span className="inline-flex shrink-0 items-center rounded-full bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                                {t("page.storyMaker.betaBadge")}
                            </span>
                            <span>{t(SERVER_LABEL_KEYS[activeDoc.region])}</span>
                            {activeDoc.meta.author && (
                                <>
                                    <span>·</span>
                                    <span className="min-w-0 break-words">
                                        {t("page.storyMaker.meta.authorBy", { author: activeDoc.meta.author })}
                                    </span>
                                </>
                            )}
                            {source.kind === "imported" && (
                                <>
                                    <span>·</span>
                                    <span>{t("page.storyMaker.player.unsavedBadge")}</span>
                                </>
                            )}
                        </span>
                    ) : undefined}
                    title={activeDoc ? (
                        activeDoc.meta.title || t("page.storyMaker.untitled")
                    ) : (
                        <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                            <span className="min-w-0 break-words">{t("page.storyMaker.player.pageTitle")}</span>
                            <span className="inline-flex shrink-0 items-center rounded-full bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                                {t("page.storyMaker.betaBadge")}
                            </span>
                        </span>
                    )}
                    description={activeDoc
                        ? (activeDoc.meta.summary
                            ? <span className={cn(isWorkspaceActive && "xl:line-clamp-1")}>{activeDoc.meta.summary}</span>
                            : undefined)
                        : t("page.storyMaker.player.pageDescription")}
                    actions={(
                        <>
                            {activeDoc && (
                                <SegmentedButton<PlayerLayoutMode>
                                    density={-1}
                                    value={layoutMode}
                                    onValueChange={handleLayoutModeChange}
                                    aria-label={t("page.storyMaker.nle.layoutWorkspace")}
                                    className="w-auto max-w-full"
                                    options={[
                                        { value: "workspace", label: t("page.storyMaker.nle.layoutWorkspace"), icon: mdDashboard },
                                        { value: "theater", label: t("page.storyMaker.nle.layoutTheater"), icon: mdTheaters },
                                    ]}
                                />
                            )}
                            {activeDoc && (
                                <Button
                                    variant="tonal"
                                    icon={mdOpenInFull}
                                    onClick={() => handleImmersiveChange(true)}
                                    className="max-w-full px-3 sm:px-3.5"
                                >
                                    {t("page.storyMaker.nle.enterImmersive")}
                                </Button>
                            )}
                            <Button variant="text" icon={mdArrowBack} href="/story-maker" className="max-w-full px-3 sm:px-4">
                                {t("page.storyMaker.action.backToDrafts")}
                            </Button>
                            {communityPostHref && (
                                <Button variant="tonal" icon={mdChatBubble} href={communityPostHref} className="max-w-full px-3 sm:px-4">
                                    {t("page.storyMaker.player.viewCommunityPost")}
                                </Button>
                            )}
                            {editHref && (
                                <Button variant="tonal" icon={mdEdit} href={editHref} className="max-w-full px-3 sm:px-4">
                                    {t("page.storyMaker.action.edit")}
                                </Button>
                            )}
                            {source.kind === "imported" && (
                                <Button variant="tonal" icon={mdBookmarkAdd} onClick={() => void handleSaveImported()} className="max-w-full px-3 sm:px-4">
                                    {t("page.storyMaker.player.saveAsDraft")}
                                </Button>
                            )}
                            {activeDoc && (
                                <>
                                    <Button
                                        variant="outlined"
                                        icon={mdTranslate}
                                        className="max-w-full px-3 sm:px-4"
                                        onClick={() => localePackInputRef.current?.click()}
                                    >
                                        {t("page.storyMaker.i18n.loadLocalePackAction")}
                                    </Button>
                                    <Button
                                        variant={voiceManifest ? "tonal" : "outlined"}
                                        icon={mdRecordVoiceOver}
                                        className="max-w-full px-3 sm:px-4"
                                        onClick={() => setVoiceManifestOpen(true)}
                                    >
                                        {t("page.storyMaker.voiceTrack.action")}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        icon={mdCode}
                                        className="max-w-full px-3 sm:px-4"
                                        onClick={() => {
                                            downloadStoryScript(activeDoc);
                                            setSnack(t("page.storyMaker.exportedToast"));
                                        }}
                                    >
                                        {t("page.storyMaker.v2.script.downloadScript")}
                                    </Button>
                                </>
                            )}
                            <Button variant={activeDoc ? "outlined" : "filled"} icon={mdUploadFile} onClick={() => setImportOpen(true)} className="max-w-full px-3 sm:px-4">
                                {t("page.storyMaker.player.openScript")}
                            </Button>
                        </>
                    )}
                />
            )}

            {loading ? (
                <LoadingState />
            ) : loadError ? (
                <Card variant="filled" radius="xl">
                    <EmptyState
                        title={t(
                            loadError === "unavailable"
                                ? "page.storyMaker.storage.unavailableTitle"
                                : loadError === "communityFailed"
                                    ? "common.state.loadingFailed"
                                    : "page.storyMaker.editor.notFoundTitle",
                        )}
                        description={
                            loadError === "communityFailed" && communityErrorText
                                ? communityErrorText
                                : t(
                                      loadError === "unavailable"
                                          ? "page.storyMaker.storage.unavailableDescription"
                                          : "page.storyMaker.editor.notFoundDescription",
                                  )
                        }
                        action={(
                            <div className="mt-2 flex flex-wrap justify-center gap-2">
                                {loadError === "communityFailed" ? (
                                    <Button variant="filled" icon={mdArrowBack} href="/community?category=community_story">
                                        {t("page.community.backToFeed")}
                                    </Button>
                                ) : (
                                    <Button variant="filled" icon={mdUploadFile} onClick={() => setImportOpen(true)}>
                                        {t("page.storyMaker.player.openScript")}
                                    </Button>
                                )}
                                <Button variant="tonal" icon={mdArrowBack} href="/story-maker">
                                    {t("page.storyMaker.action.backToDrafts")}
                                </Button>
                            </div>
                        )}
                    />
                </Card>
            ) : !activeDoc ? (
                <Card variant="filled" radius="xl">
                    <EmptyState
                        icon={mdPlayArrowFill}
                        title={t("page.storyMaker.player.noStoryTitle")}
                        description={t("page.storyMaker.player.noStoryDescription")}
                        action={(
                            <div className="mt-2 flex flex-wrap justify-center gap-2">
                                <Button variant="filled" icon={mdUploadFile} onClick={() => setImportOpen(true)}>
                                    {t("page.storyMaker.player.openScript")}
                                </Button>
                                <Button variant="tonal" icon={mdArrowBack} href="/story-maker">
                                    {t("page.storyMaker.action.backToDrafts")}
                                </Button>
                            </div>
                        )}
                    />
                </Card>
            ) : (
                <div className={cn("min-w-0", isImmersiveActive ? "flex min-h-0 flex-1 flex-col gap-1.5" : "space-y-3")}>
                    {!hasBlockingErrors && warnings.length > 0 && (
                        <Banner
                            tone="warning"
                            title={t("page.storyMaker.v2.compiler.statusWarnings", { count: warnings.length })}
                            action={(
                                <Button size="xs" variant="text" onClick={() => setIssuesOpen(true)}>
                                    {t("page.storyMaker.player.viewIssues")}
                                </Button>
                            )}
                        >
                            {t("page.storyMaker.v2.compiler.warningsTitle")}
                        </Banner>
                    )}

                    <StoryPlayerView
                        key={playerKey}
                        doc={activeDoc}
                        line={line}
                        assetSource={assetSource}
                        startNodeId={source.kind === "draft" ? startNodeParam : null}
                        layoutMode={layoutMode}
                        onLayoutModeChange={handleLayoutModeChange}
                        immersive={isImmersiveActive}
                        initialLocale={preferredLocale}
                        voiceManifest={voiceManifest}
                        onOpenVoiceManifest={() => setVoiceManifestOpen(true)}
                        endAction={communityPostHref ? (
                            <Button variant="tonal" icon={mdChatBubble} href={communityPostHref}>
                                {t("page.storyMaker.player.viewCommunityPost")}
                            </Button>
                        ) : editHref ? (
                            <Button variant="tonal" icon={mdEdit} href={editHref}>
                                {t("page.storyMaker.action.edit")}
                            </Button>
                        ) : (
                            <Button variant="tonal" icon={mdUploadFile} onClick={() => setImportOpen(true)}>
                                {t("page.storyMaker.player.openScript")}
                            </Button>
                        )}
                    />
                </div>
            )}

            <StoryImportDialog
                isOpen={importOpen}
                onClose={() => setImportOpen(false)}
                onImport={handleImportForPlay}
            />

            {activeDoc && (
                <StoryVoiceManifestDialog
                    isOpen={voiceManifestOpen}
                    onClose={() => setVoiceManifestOpen(false)}
                    doc={activeDoc}
                    currentManifest={voiceManifest}
                    onApplyManifest={setVoiceManifest}
                    onSwitchToStoryImport={handleImportForPlay}
                    onApplyLocalePack={(nextPack) => {
                        setSource((prev) => {
                            if (prev.kind === "empty") return prev;
                            return { ...prev, doc: upsertStoryLocalePack(prev.doc, nextPack) };
                        });
                        setPreferredLocale(nextPack.locale);
                    }}
                    onNotify={setSnack}
                />
            )}

            <Dialog
                isOpen={issuesOpen}
                onClose={() => setIssuesOpen(false)}
                title={t("page.storyMaker.editor.issuesDialogTitle", { count: diagnostics.length })}
                size="md"
            >
                {diagnostics.length === 0 ? (
                    <p className="type-body-m text-on-surface-variant">
                        {t("page.storyMaker.v2.compiler.noIssues")}
                    </p>
                ) : (
                    <ul className="max-h-96 min-w-0 space-y-1.5 overflow-y-auto">
                        {diagnostics.map((diag, index) => (
                            <li
                                key={`${diag.path}-${diag.code}-${index}`}
                                className="flex min-w-0 items-start gap-2 rounded-md3-md bg-surface-container px-2.5 py-2"
                            >
                                <Icon
                                    path={diag.severity === "error" ? mdErrorFill : mdWarning}
                                    size={18}
                                    className={cn("mt-0.5 shrink-0", diag.severity === "error" ? "text-error" : "text-tertiary")}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block break-words type-body-m text-on-surface">
                                        {t(`page.storyMaker.issue.${diag.code}`, diag.params ?? {})}
                                    </span>
                                    <span className="block break-all font-mono type-label-s text-on-surface-variant">
                                        {diag.path}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Dialog>

            <input
                ref={localePackInputRef}
                type="file"
                accept=".json,.i18n.json,application/json"
                className="sr-only"
                onChange={event => void handleLocalePackFile(event)}
            />

            <Snackbar open={snack !== null} message={snack ?? ""} onClose={() => setSnack(null)} />
        </PageContainer>
    );
}

export default function StoryMakerPlayClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <StoryMakerPlayContent />
            </Suspense>
        </MainLayout>
    );
}
