"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import {
    Banner, Button, Card, Dialog, EmptyState, LoadingState, PageContainer, PageHeader, Snackbar,
} from "@/components/md3";
import {
    mdArrowBack, mdBookmarkAdd, mdDownload, mdEdit, mdPlayArrowFill, mdUploadFile,
} from "@/components/md3/icons";
import { StoryImportDialog } from "@/components/story-maker/StoryImportDialog";
import { StoryIssueList } from "@/components/story-maker/StoryIssueList";
import { StoryPlayerView } from "@/components/story-maker/StoryPlayerView";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { StoryDraftsUnavailableError, createDraft, getDraft } from "@/lib/storyMaker/drafts";
import { downloadStoryJson } from "@/lib/storyMaker/starter";
import { validateStoryDocument } from "@/lib/storyMaker/validate";
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
    const [loading, setLoading] = useState(Boolean(draftId));
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
    const validation = useMemo(() => (activeDoc ? validateStoryDocument(activeDoc) : null), [activeDoc]);
    const issues = useMemo(() => (validation && !validation.ok ? validation.issues : []), [validation]);

    const handleImportForPlay = (doc: StoryDocument) => {
        const nextKey = importCounter + 1;
        setImportCounter(nextKey);
        setLoadError(null);
        setSource({ kind: "imported", doc, key: nextKey });
        setImportOpen(false);
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("id");
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

    return (
        <PageContainer className="min-w-0">
            <PageHeader
                eyebrow={activeDoc ? (
                    <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 break-words">
                        <span>{t(SERVER_LABEL_KEYS[activeDoc.region])}</span>
                        {activeDoc.author && (
                            <>
                                <span>·</span>
                                <span className="min-w-0 break-words">{t("page.storyMaker.meta.authorBy", { author: activeDoc.author })}</span>
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
                title={activeDoc ? (activeDoc.title || t("page.storyMaker.untitled")) : t("page.storyMaker.player.pageTitle")}
                description={activeDoc ? (activeDoc.summary || undefined) : t("page.storyMaker.player.pageDescription")}
                actions={(
                    <>
                        <Button variant="text" icon={mdArrowBack} href="/story-maker" className="px-3 sm:px-4">
                            {t("page.storyMaker.action.backToDrafts")}
                        </Button>
                        {source.kind === "draft" && (
                            <Button variant="tonal" icon={mdEdit} href={`/story-maker/edit?id=${encodeURIComponent(source.id)}`} className="px-3 sm:px-4">
                                {t("page.storyMaker.action.edit")}
                            </Button>
                        )}
                        {source.kind === "imported" && (
                            <Button variant="tonal" icon={mdBookmarkAdd} onClick={() => void handleSaveImported()} className="px-3 sm:px-4">
                                {t("page.storyMaker.player.saveAsDraft")}
                            </Button>
                        )}
                        {activeDoc && (
                            <Button
                                variant="outlined"
                                icon={mdDownload}
                                className="px-3 sm:px-4"
                                onClick={() => {
                                    downloadStoryJson(activeDoc);
                                    setSnack(t("page.storyMaker.exportedToast"));
                                }}
                            >
                                {t("page.storyMaker.action.exportJson")}
                            </Button>
                        )}
                        <Button variant={activeDoc ? "outlined" : "filled"} icon={mdUploadFile} onClick={() => setImportOpen(true)} className="px-3 sm:px-4">
                            {t("page.storyMaker.player.openJson")}
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
                                    {t("page.storyMaker.player.openJson")}
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
                                    {t("page.storyMaker.player.openJson")}
                                </Button>
                                <Button variant="tonal" icon={mdArrowBack} href="/story-maker">
                                    {t("page.storyMaker.action.backToDrafts")}
                                </Button>
                            </div>
                        )}
                    />
                </Card>
            ) : (
                <div className="min-w-0 space-y-3">
                    {issues.length > 0 && (
                        <Banner
                            tone="warning"
                            title={t("page.storyMaker.player.draftHasIssuesTitle", { count: issues.length })}
                            action={(
                                <Button size="xs" variant="text" onClick={() => setIssuesOpen(true)}>
                                    {t("page.storyMaker.player.viewIssues")}
                                </Button>
                            )}
                        >
                            {t("page.storyMaker.player.draftHasIssuesDescription")}
                        </Banner>
                    )}

                    <StoryPlayerView
                        key={playerKey}
                        doc={activeDoc}
                        line={line}
                        endAction={source.kind === "draft" ? (
                            <Button variant="tonal" icon={mdEdit} href={`/story-maker/edit?id=${encodeURIComponent(source.id)}`}>
                                {t("page.storyMaker.action.edit")}
                            </Button>
                        ) : (
                            <Button variant="tonal" icon={mdUploadFile} onClick={() => setImportOpen(true)}>
                                {t("page.storyMaker.player.openJson")}
                            </Button>
                        )}
                    />
                </div>
            )}

            <StoryImportDialog
                isOpen={importOpen}
                onClose={() => setImportOpen(false)}
                title={t("page.storyMaker.player.openJson")}
                confirmLabel={t("page.storyMaker.action.play")}
                onImport={handleImportForPlay}
            />

            <Dialog
                isOpen={issuesOpen}
                onClose={() => setIssuesOpen(false)}
                title={t("page.storyMaker.editor.issuesDialogTitle", { count: issues.length })}
                size="md"
            >
                <StoryIssueList issues={issues} />
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
