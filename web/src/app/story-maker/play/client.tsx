"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useShellImmersiveMode } from "@/components/AppShell";
import MainLayout from "@/components/MainLayout";
import {
    Banner, Button, Card, Dialog, EmptyState, Icon, LoadingState, PageContainer, PageHeader,
    SegmentedButton, Snackbar, cn,
} from "@/components/md3";
import {
    mdArrowBack, mdBookmarkAdd, mdCloseFullscreen, mdCode, mdDashboard, mdEdit,
    mdErrorFill, mdOpenInFull, mdPlayArrowFill, mdTheaters, mdUploadFile, mdWarning,
} from "@/components/md3/icons";
import { StoryImportDialog } from "@/components/story-maker/StoryImportDialog";
import { StoryPlayerView, type PlayerLayoutMode } from "@/components/story-maker/StoryPlayerView";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { compileStoryGraph } from "@/lib/storyMaker/compiler";
import { StoryDraftsUnavailableError, createDraft, getDraft } from "@/lib/storyMaker/drafts";
import { downloadStoryScript } from "@/lib/storyMaker/starter";
import type { StoryDocument } from "@/types/storyMaker";

type PlaySource =
    | { kind: "empty" }
    | { kind: "draft"; id: string; doc: StoryDocument }
    | { kind: "imported"; doc: StoryDocument; key: number };

function StoryMakerPlayContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const { assetSource } = useTheme();
    const line = assetSource.startsWith("backup") ? "backup" : "main";

    const draftId = searchParams.get("id");
    const startNodeParam = searchParams.get("node");
    const [layoutMode, setLayoutMode] = useState<PlayerLayoutMode>(() => (
        searchParams.get("layout") === "theater" ? "theater" : "workspace"
    ));
    const [immersive, setImmersive] = useState<boolean>(() => (
        searchParams.get("immersive") === "1"
    ));
    const [loading, setLoading] = useState(Boolean(draftId));

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
            if (next) url.searchParams.set("immersive", "1");
            else url.searchParams.delete("immersive");
            window.history.replaceState({}, "", url.toString());
        }
    }, []);

    const [loadError, setLoadError] = useState<"missing" | "unavailable" | "failed" | null>(null);
    const [source, setSource] = useState<PlaySource>({ kind: "empty" });
    const [importOpen, setImportOpen] = useState(false);
    const [issuesOpen, setIssuesOpen] = useState(false);
    const [snack, setSnack] = useState<string | null>(null);
    const [importCounter, setImportCounter] = useState(0);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoadError(null);
            if (!draftId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const draft = await getDraft(draftId);
                if (cancelled) return;
                if (!draft) {
                    setSource({ kind: "empty" });
                    setLoadError("missing");
                } else {
                    setSource({ kind: "draft", id: draft.id, doc: draft.doc });
                }
            } catch (error) {
                if (cancelled) return;
                setSource({ kind: "empty" });
                setLoadError(error instanceof StoryDraftsUnavailableError ? "unavailable" : "failed");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [draftId]);

    const activeDoc = source.kind === "empty" ? null : source.doc;
    const program = useMemo(() => (activeDoc ? compileStoryGraph(activeDoc) : null), [activeDoc]);
    const diagnostics = useMemo(() => program?.diagnostics ?? [], [program]);
    const warnings = useMemo(() => program?.warnings ?? [], [program]);
    const hasBlockingErrors = Boolean(program && program.errors.length > 0);

    const handleImportForPlay = (doc: StoryDocument) => {
        const nextKey = importCounter + 1;
        setImportCounter(nextKey);
        setLoadError(null);
        setSource({ kind: "imported", doc, key: nextKey });
        setImportOpen(false);
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("id");
            url.searchParams.delete("node");
            window.history.replaceState({}, "", url.toString());
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

    const headerButtonSize = isImmersiveActive ? "s" : undefined;
    const editHref = source.kind === "draft"
        ? `/story-maker/edit?id=${encodeURIComponent(source.id)}${immersive ? "&immersive=1" : ""}`
        : null;

    return (
        <PageContainer
            className={cn(
                "min-w-0 max-w-full overflow-x-clip",
                isWorkspaceActive && !isImmersiveActive && "xl:max-w-[1680px] xl:py-3",
                isImmersiveActive && "fixed inset-0 z-[150] flex h-dvh w-screen max-w-none flex-col overflow-x-hidden bg-surface p-2 sm:p-3",
                isImmersiveActive && (layoutMode === "workspace" ? "overflow-y-auto xl:overflow-hidden" : "overflow-y-auto"),
            )}
        >
            <PageHeader
                className={cn(
                    isImmersiveActive ? "mb-2 shrink-0" : isWorkspaceActive && "xl:mb-2.5",
                )}
                eyebrow={activeDoc && !isImmersiveActive ? (
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
                    isImmersiveActive ? (
                        <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                            <span className="min-w-0 break-words">
                                {activeDoc.meta.title || t("page.storyMaker.untitled")}
                            </span>
                            <span className="inline-flex shrink-0 items-center rounded-full bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                                {t("page.storyMaker.betaBadge")}
                            </span>
                        </span>
                    ) : (
                        activeDoc.meta.title || t("page.storyMaker.untitled")
                    )
                ) : (
                    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words">{t("page.storyMaker.player.pageTitle")}</span>
                        <span className="inline-flex shrink-0 items-center rounded-full bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                            {t("page.storyMaker.betaBadge")}
                        </span>
                    </span>
                )}
                description={isImmersiveActive
                    ? undefined
                    : activeDoc
                        ? (activeDoc.meta.summary
                            ? <span className={cn(isWorkspaceActive && "xl:line-clamp-1")}>{activeDoc.meta.summary}</span>
                            : undefined)
                        : t("page.storyMaker.player.pageDescription")}
                actions={(
                    <>
                        {activeDoc && (
                            <SegmentedButton<PlayerLayoutMode>
                                density={isImmersiveActive ? -2 : -1}
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
                                size={headerButtonSize}
                                variant={isImmersiveActive ? "filled" : "tonal"}
                                selected={isImmersiveActive}
                                icon={isImmersiveActive ? mdCloseFullscreen : mdOpenInFull}
                                onClick={() => handleImmersiveChange(!isImmersiveActive)}
                                className="max-w-full px-3 sm:px-3.5"
                            >
                                {t(isImmersiveActive ? "page.storyMaker.nle.exitImmersive" : "page.storyMaker.nle.enterImmersive")}
                            </Button>
                        )}
                        <Button size={headerButtonSize} variant="text" icon={mdArrowBack} href="/story-maker" className="max-w-full px-3 sm:px-4">
                            {t("page.storyMaker.action.backToDrafts")}
                        </Button>
                        {editHref && (
                            <Button size={headerButtonSize} variant="tonal" icon={mdEdit} href={editHref} className="max-w-full px-3 sm:px-4">
                                {t("page.storyMaker.action.edit")}
                            </Button>
                        )}
                        {source.kind === "imported" && (
                            <Button size={headerButtonSize} variant="tonal" icon={mdBookmarkAdd} onClick={() => void handleSaveImported()} className="max-w-full px-3 sm:px-4">
                                {t("page.storyMaker.player.saveAsDraft")}
                            </Button>
                        )}
                        {activeDoc && (
                            <Button
                                size={headerButtonSize}
                                variant="outlined"
                                icon={mdCode}
                                className="max-w-full px-3 sm:px-4"
                                onClick={() => {
                                    downloadStoryScript(activeDoc);
                                    setSnack(t("page.storyMaker.v2.script.downloadScript"));
                                }}
                            >
                                {t("page.storyMaker.v2.script.downloadScript")}
                            </Button>
                        )}
                        <Button size={headerButtonSize} variant={activeDoc ? "outlined" : "filled"} icon={mdUploadFile} onClick={() => setImportOpen(true)} className="max-w-full px-3 sm:px-4">
                            {t("page.storyMaker.player.openScript")}
                        </Button>
                    </>
                )}
            />

            {loading ? (
                <LoadingState />
            ) : loadError ? (
                <Card variant="filled" radius="xl">
                    <EmptyState
                        title={t(loadError === "unavailable" ? "page.storyMaker.storage.unavailableTitle" : "page.storyMaker.editor.notFoundTitle")}
                        description={t(loadError === "unavailable" ? "page.storyMaker.storage.unavailableDescription" : "page.storyMaker.editor.notFoundDescription")}
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
                <div className={cn("min-w-0", isImmersiveActive ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-3")}>
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
                        endAction={editHref ? (
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
