"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import {
    Banner, Button, Dialog, EmptyState, IconButton, LoadingState, PageContainer, Snackbar, Surface, Tabs,
} from "@/components/md3";
import {
    mdAdd, mdArrowBack, mdChat, mdChevronLeft, mdChevronRight, mdDownload, mdErrorFill,
    mdPlayArrowFill, mdRedo, mdSettings, mdStar, mdUndo,
} from "@/components/md3/icons";
import { CastPanel } from "@/components/story-maker/CastPanel";
import { StepInspector } from "@/components/story-maker/StepInspector";
import { StepList } from "@/components/story-maker/StepList";
import { StoryIssueList, issueStepIndex } from "@/components/story-maker/StoryIssueList";
import { StoryMetaDialog, type StoryMetaValues } from "@/components/story-maker/StoryMetaDialog";
import { StoryStageView } from "@/components/story-maker/StoryStageView";
import { useStarterStory } from "@/components/story-maker/useStarterStory";
import { useStoryModels } from "@/components/story-maker/useStoryModels";
import { useStoryStage } from "@/components/story-maker/useStoryStage";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { live2dSources } from "@/lib/live2dViewer/config";
import { localizePath } from "@/lib/localized-path";
import {
    addCastMember, createStep, duplicateStep, insertStep, moveStep, removeCastMember, removeStep, replaceStep,
    updateCastMember,
} from "@/lib/storyMaker/document";
import { StoryDraftsUnavailableError, createDraft, getDraft, saveDraft } from "@/lib/storyMaker/drafts";
import { downloadStoryJson } from "@/lib/storyMaker/starter";
import { stageStateAt } from "@/lib/storyMaker/state";
import { validateStoryDocument } from "@/lib/storyMaker/validate";
import type { StoryCastMember, StoryDocument, StoryEffectColor, StoryOpName, StoryStep, StoryStepOf } from "@/types/storyMaker";

const MAX_UNDO = 50;
const AUTOSAVE_MS = 600;

type SaveStatus = "saved" | "dirty" | "saving" | "error";
type LeftTab = "steps" | "cast";
type MobileTab = "steps" | "inspector" | "cast";

function StoryMakerEditContent() {
    const { t, routeLocale } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { assetSource } = useTheme();
    const buildStarter = useStarterStory();
    const line = assetSource.startsWith("backup") ? "backup" : "main";

    const draftId = searchParams.get("id");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<"missing" | "unavailable" | "failed" | null>(null);
    const [doc, setDoc] = useState<StoryDocument | null>(null);
    const [past, setPast] = useState<StoryDocument[]>([]);
    const [future, setFuture] = useState<StoryDocument[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

    const [leftTab, setLeftTab] = useState<LeftTab>("steps");
    const [mobileTab, setMobileTab] = useState<MobileTab>("steps");
    const [metaOpen, setMetaOpen] = useState(false);
    const [issuesOpen, setIssuesOpen] = useState(false);
    const [snack, setSnack] = useState<string | null>(null);
    const [flash, setFlash] = useState<{ key: number; color: StoryEffectColor; seconds: number } | null>(null);
    const flashKeyRef = useRef(0);
    const dirtyDocRef = useRef<StoryDocument | null>(null);

    useEffect(() => {
        if (typeof window === "undefined" || !draftId) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get("id") !== draftId) {
            url.searchParams.set("id", draftId);
            window.history.replaceState({}, "", url.toString());
        }
    }, [draftId]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setLoadError(null);
            setPast([]);
            setFuture([]);
            setSaveStatus("saved");
            if (!draftId) {
                setDoc(null);
                setLoadError("missing");
                setLoading(false);
                return;
            }
            try {
                const draft = await getDraft(draftId);
                if (cancelled) return;
                if (!draft) {
                    setDoc(null);
                    setLoadError("missing");
                } else {
                    setDoc(draft.doc);
                    setSelectedIndex(draft.doc.steps.length > 0 ? 0 : -1);
                }
            } catch (error) {
                if (cancelled) return;
                setDoc(null);
                setLoadError(error instanceof StoryDraftsUnavailableError ? "unavailable" : "failed");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [draftId]);

    const flushSave = useCallback(async (id: string, target: StoryDocument) => {
        setSaveStatus("saving");
        try {
            await saveDraft(id, target);
            if (dirtyDocRef.current === target) {
                dirtyDocRef.current = null;
                setSaveStatus("saved");
            }
        } catch {
            setSaveStatus("error");
        }
    }, []);

    useEffect(() => {
        if (!draftId || !doc || saveStatus !== "dirty") return;
        dirtyDocRef.current = doc;
        const timer = window.setTimeout(() => {
            void flushSave(draftId, doc);
        }, AUTOSAVE_MS);
        return () => window.clearTimeout(timer);
    }, [doc, draftId, flushSave, saveStatus]);

    useEffect(() => {
        if (saveStatus !== "dirty" && saveStatus !== "saving") return;
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [saveStatus]);

    const commit = useCallback((updater: (current: StoryDocument) => StoryDocument) => {
        setDoc((current) => {
            if (!current) return current;
            const next = updater(current);
            if (next === current) return current;
            setPast(history => [...history.slice(-(MAX_UNDO - 1)), current]);
            setFuture([]);
            setSaveStatus("dirty");
            return next;
        });
    }, []);

    const undo = useCallback(() => {
        setPast((history) => {
            if (history.length === 0 || !doc) return history;
            const previous = history[history.length - 1];
            setFuture(redo => [doc, ...redo.slice(0, MAX_UNDO - 1)]);
            setDoc(previous);
            setSaveStatus("dirty");
            return history.slice(0, -1);
        });
    }, [doc]);

    const redo = useCallback(() => {
        setFuture((redoStack) => {
            if (redoStack.length === 0 || !doc) return redoStack;
            const next = redoStack[0];
            setPast(history => [...history.slice(-(MAX_UNDO - 1)), doc]);
            setDoc(next);
            setSaveStatus("dirty");
            return redoStack.slice(1);
        });
    }, [doc]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                if (event.shiftKey) redo();
                else undo();
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
                event.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [undo, redo]);

    const clampedSelected = doc && doc.steps.length > 0
        ? Math.max(0, Math.min(selectedIndex, doc.steps.length - 1))
        : -1;
    const selectedStep = doc && clampedSelected >= 0 ? doc.steps[clampedSelected] ?? null : null;

    const validation = useMemo(() => (doc ? validateStoryDocument(doc) : null), [doc]);
    const issues = useMemo(() => (validation && !validation.ok ? validation.issues : []), [validation]);
    const flaggedSteps = useMemo(() => {
        const flagged = new Set<number>();
        for (const issue of issues) {
            const idx = issueStepIndex(issue);
            if (idx !== null) flagged.add(idx);
        }
        return flagged;
    }, [issues]);
    const selectedStepIssues = useMemo(
        () => (clampedSelected >= 0 ? issues.filter(issue => issueStepIndex(issue) === clampedSelected) : []),
        [issues, clampedSelected],
    );

    const { list: modelList, models, retry: retryModels } = useStoryModels(doc?.region ?? null);
    const library = useMemo(() => (doc ? live2dSources(doc.region).library : null), [doc]);
    const {
        hostRef: stageHostRef,
        phase: stagePhase,
        modelInfo,
        problems: stageProblems,
        loadingActors,
        apply: applyStage,
        shake: shakeStage,
        retry: retryStage,
    } = useStoryStage({ library, cast: doc?.cast ?? [], models });

    const stageState = useMemo(
        () => (doc ? stageStateAt(doc, clampedSelected) : stageStateAt({ format: "moesekai-story/1", region: "jp", title: "", summary: "", author: "", cast: [], steps: [] }, -1)),
        [doc, clampedSelected],
    );

    useEffect(() => {
        if (!doc || stagePhase.kind !== "ready" || !models) return;
        void applyStage(stageState, { instant: true });
    }, [doc, applyStage, stagePhase.kind, models, stageState]);

    const handleAddStep = (op: StoryOpName) => {
        if (!doc) return;
        const hint = selectedStep && "cast" in selectedStep ? selectedStep.cast : undefined;
        const step = createStep(op, doc, hint);
        const insertAt = clampedSelected >= 0 ? clampedSelected : doc.steps.length - 1;
        const nextIndex = Math.max(0, Math.min(insertAt + 1, doc.steps.length));
        commit(current => insertStep(current, insertAt, step));
        setSelectedIndex(nextIndex);
        setMobileTab("inspector");
    };

    const handleMoveStep = (from: number, to: number) => {
        commit(current => moveStep(current, from, to));
        setSelectedIndex(to);
    };

    const handleDuplicateStep = (index: number) => {
        commit(current => duplicateStep(current, index));
        setSelectedIndex(index + 1);
    };

    const handleRemoveStep = (index: number) => {
        if (!doc) return;
        const remaining = doc.steps.length - 1;
        commit(current => removeStep(current, index));
        setSelectedIndex(remaining <= 0 ? -1 : Math.min(index, remaining - 1));
    };

    const handleChangeStep = (next: StoryStep) => {
        commit(current => replaceStep(current, next.id, next));
    };

    const handleAddCast = (member: Omit<StoryCastMember, "key">) => {
        commit(current => addCastMember(current, member));
    };

    const handleUpdateCast = (key: string, patch: Partial<Omit<StoryCastMember, "key">>) => {
        commit(current => updateCastMember(current, key, patch));
    };

    const handleRemoveCast = (key: string) => {
        commit(current => removeCastMember(current, key));
    };

    const handleUpdateMeta = (values: StoryMetaValues) => {
        commit(current => ({ ...current, ...values }));
        setMetaOpen(false);
    };

    const handlePreviewEffect = (step: StoryStepOf<"effect">) => {
        if (step.effect === "flash") {
            flashKeyRef.current += 1;
            setFlash({ key: flashKeyRef.current, color: step.color ?? "white", seconds: step.duration });
        } else if (step.effect === "shake") {
            void shakeStage(step.duration);
        }
    };

    const handleExport = () => {
        if (!doc) return;
        downloadStoryJson(doc);
        setSnack(t(issues.length > 0 ? "page.storyMaker.editor.exportedWithIssuesToast" : "page.storyMaker.exportedToast"));
    };

    const handleOpenPlayer = async () => {
        if (!draftId || !doc) return;
        if (saveStatus === "dirty") {
            await flushSave(draftId, doc);
        }
        router.push(localizePath(`/story-maker/play?id=${encodeURIComponent(draftId)}`, routeLocale));
    };

    const handleCreateStarterHere = async () => {
        const created = await createDraft(buildStarter("jp"));
        router.push(localizePath(`/story-maker/edit?id=${encodeURIComponent(created.id)}`, routeLocale));
    };

    if (loading) {
        return <PageContainer wide><LoadingState /></PageContainer>;
    }

    if (loadError || !doc || !draftId) {
        return (
            <PageContainer>
                <EmptyState
                    title={t(loadError === "unavailable" ? "page.storyMaker.storage.unavailableTitle" : "page.storyMaker.editor.notFoundTitle")}
                    description={t(loadError === "unavailable" ? "page.storyMaker.storage.unavailableDescription" : "page.storyMaker.editor.notFoundDescription")}
                    action={(
                        <div className="mt-2 flex flex-wrap justify-center gap-2">
                            <Button variant="filled" icon={mdArrowBack} href="/story-maker">
                                {t("page.storyMaker.action.backToDrafts")}
                            </Button>
                            {loadError !== "unavailable" && (
                                <Button variant="tonal" icon={mdStar} onClick={() => void handleCreateStarterHere()}>
                                    {t("page.storyMaker.landing.tryStarter")}
                                </Button>
                            )}
                        </div>
                    )}
                />
            </PageContainer>
        );
    }

    const saveStatusLabel = t(`page.storyMaker.editor.saveStatus.${saveStatus}`);

    return (
        <PageContainer wide className="space-y-3 py-4 sm:py-5">
            <Surface tone="low" radius="lg" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <IconButton
                        size="s"
                        icon={mdArrowBack}
                        label={t("page.storyMaker.action.backToDrafts")}
                        href="/story-maker"
                    />
                    <button
                        type="button"
                        onClick={() => setMetaOpen(true)}
                        className="state-layer focus-ring min-w-0 rounded-md3-md px-2 py-1 text-left"
                    >
                        <span className="block truncate type-title-m text-on-surface">
                            {doc.title || t("page.storyMaker.untitled")}
                        </span>
                        <span className="flex items-center gap-2 type-label-s text-on-surface-variant">
                            <span>{t(SERVER_LABEL_KEYS[doc.region])}</span>
                            <span>·</span>
                            <span className={saveStatus === "error" ? "text-error" : undefined}>{saveStatusLabel}</span>
                        </span>
                    </button>
                    {saveStatus === "error" && (
                        <Button size="xs" variant="text" color="error" onClick={() => void flushSave(draftId, doc)}>
                            {t("common.action.retry")}
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                    <IconButton
                        size="s"
                        icon={mdUndo}
                        label={t("page.storyMaker.editor.undo")}
                        disabled={past.length === 0}
                        onClick={undo}
                    />
                    <IconButton
                        size="s"
                        icon={mdRedo}
                        label={t("page.storyMaker.editor.redo")}
                        disabled={future.length === 0}
                        onClick={redo}
                    />
                    <IconButton
                        size="s"
                        icon={mdSettings}
                        label={t("page.storyMaker.editor.storySettings")}
                        onClick={() => setMetaOpen(true)}
                    />
                    {issues.length > 0 && (
                        <Button
                            size="s"
                            variant="tonal"
                            color="error"
                            icon={mdErrorFill}
                            onClick={() => setIssuesOpen(true)}
                        >
                            {t("page.storyMaker.editor.issuesCount", { count: issues.length })}
                        </Button>
                    )}
                    <Button size="s" variant="tonal" icon={mdDownload} onClick={handleExport}>
                        {t("page.storyMaker.action.exportJson")}
                    </Button>
                    <Button size="s" variant="filled" icon={mdPlayArrowFill} onClick={() => void handleOpenPlayer()}>
                        {t("page.storyMaker.action.previewPlay")}
                    </Button>
                </div>
            </Surface>

            {stagePhase.kind === "unavailable" && (
                <Banner tone="info" title={t("page.storyMaker.engine.unavailable")}>
                    {t("page.storyMaker.engine.unavailableBanner")}
                </Banner>
            )}
            {stagePhase.kind === "unsupported" && (
                <Banner tone="warning" title={t("page.storyMaker.engine.unsupported")}>
                    {t("page.storyMaker.engine.unsupportedBanner")}
                </Banner>
            )}

            <div className="grid grid-cols-1 gap-3 xl:h-[clamp(36rem,calc(100svh-12rem),62rem)] xl:grid-cols-[19rem_minmax(0,1fr)_23rem]">
                {/* Desktop left pane: Steps + Cast */}
                <Surface tone="low" radius="xl" className="hidden flex-col overflow-hidden xl:flex xl:min-h-0">
                    <Tabs
                        value={leftTab}
                        onValueChange={setLeftTab}
                        aria-label={t("page.storyMaker.editor.leftPanel")}
                        className="shrink-0"
                        items={[
                            { value: "steps", label: t("page.storyMaker.editor.steps") },
                            { value: "cast", label: t("page.storyMaker.cast.title") },
                        ]}
                    />
                    {leftTab === "steps" ? (
                        <StepList
                            doc={doc}
                            selected={clampedSelected}
                            onSelect={setSelectedIndex}
                            onAdd={handleAddStep}
                            onMove={handleMoveStep}
                            onDuplicate={handleDuplicateStep}
                            onRemove={handleRemoveStep}
                            flagged={flaggedSteps}
                            className="min-h-0 flex-1"
                        />
                    ) : (
                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                            <CastPanel
                                doc={doc}
                                list={modelList}
                                onRetryList={retryModels}
                                onAdd={handleAddCast}
                                onUpdate={handleUpdateCast}
                                onRemove={handleRemoveCast}
                            />
                        </div>
                    )}
                </Surface>

                {/* Center pane: 16:9 Stage + Quick Step Navigation */}
                <div className="flex min-w-0 flex-col gap-3">
                    <StoryStageView
                        doc={doc}
                        state={stageState}
                        line={line}
                        hostRef={stageHostRef}
                        phase={stagePhase}
                        problems={stageProblems}
                        loadingActors={loadingActors}
                        onRetry={retryStage}
                        flash={flash}
                    />
                    <Surface tone="low" radius="lg" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <div className="flex items-center gap-1">
                            <IconButton
                                size="s"
                                icon={mdChevronLeft}
                                label={t("page.storyMaker.editor.prevStep")}
                                disabled={clampedSelected <= 0}
                                onClick={() => setSelectedIndex(idx => Math.max(0, idx - 1))}
                            />
                            <span className="min-w-16 text-center font-mono type-label-l text-on-surface">
                                {doc.steps.length > 0 ? `${clampedSelected + 1} / ${doc.steps.length}` : "0 / 0"}
                            </span>
                            <IconButton
                                size="s"
                                icon={mdChevronRight}
                                label={t("page.storyMaker.editor.nextStep")}
                                disabled={clampedSelected < 0 || clampedSelected >= doc.steps.length - 1}
                                onClick={() => setSelectedIndex(idx => Math.min(doc.steps.length - 1, idx + 1))}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                                size="xs"
                                variant="tonal"
                                icon={mdChat}
                                onClick={() => handleAddStep("talk")}
                            >
                                {t("page.storyMaker.editor.quickAddTalk")}
                            </Button>
                            <Button
                                size="xs"
                                variant="text"
                                icon={mdAdd}
                                onClick={() => handleAddStep("appear")}
                            >
                                {t("page.storyMaker.op.appear")}
                            </Button>
                        </div>
                    </Surface>
                </div>

                {/* Desktop right pane: Step Inspector */}
                <Surface tone="low" radius="xl" className="hidden flex-col overflow-hidden xl:flex xl:min-h-0">
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        <StepInspector
                            doc={doc}
                            step={selectedStep}
                            stepIndex={clampedSelected}
                            line={line}
                            modelInfo={modelInfo}
                            issues={selectedStepIssues}
                            onChange={handleChangeStep}
                            onPreviewEffect={handlePreviewEffect}
                        />
                    </div>
                </Surface>

                {/* Mobile & tablet tabbed workspace */}
                <Surface tone="low" radius="xl" className="flex flex-col overflow-hidden xl:hidden">
                    <Tabs
                        value={mobileTab}
                        onValueChange={setMobileTab}
                        aria-label={t("page.storyMaker.editor.workspaceTabs")}
                        items={[
                            { value: "steps", label: t("page.storyMaker.editor.steps") },
                            { value: "inspector", label: t("page.storyMaker.editor.inspectorTab") },
                            { value: "cast", label: t("page.storyMaker.cast.title") },
                        ]}
                    />
                    {mobileTab === "steps" && (
                        <StepList
                            doc={doc}
                            selected={clampedSelected}
                            onSelect={(index) => {
                                setSelectedIndex(index);
                                setMobileTab("inspector");
                            }}
                            onAdd={handleAddStep}
                            onMove={handleMoveStep}
                            onDuplicate={handleDuplicateStep}
                            onRemove={handleRemoveStep}
                            flagged={flaggedSteps}
                            className="max-h-[55vh]"
                        />
                    )}
                    {mobileTab === "inspector" && (
                        <div className="p-4">
                            <StepInspector
                                doc={doc}
                                step={selectedStep}
                                stepIndex={clampedSelected}
                                line={line}
                                modelInfo={modelInfo}
                                issues={selectedStepIssues}
                                onChange={handleChangeStep}
                                onPreviewEffect={handlePreviewEffect}
                            />
                        </div>
                    )}
                    {mobileTab === "cast" && (
                        <div className="p-4">
                            <CastPanel
                                doc={doc}
                                list={modelList}
                                onRetryList={retryModels}
                                onAdd={handleAddCast}
                                onUpdate={handleUpdateCast}
                                onRemove={handleRemoveCast}
                            />
                        </div>
                    )}
                </Surface>
            </div>

            {metaOpen && (
                <StoryMetaDialog
                    isOpen
                    onClose={() => setMetaOpen(false)}
                    title={t("page.storyMaker.editor.storySettings")}
                    confirmLabel={t("common.action.confirm")}
                    initial={{
                        title: doc.title,
                        author: doc.author,
                        summary: doc.summary,
                        region: doc.region,
                    }}
                    showRegionHint
                    onSubmit={handleUpdateMeta}
                />
            )}

            <Dialog
                isOpen={issuesOpen}
                onClose={() => setIssuesOpen(false)}
                title={t("page.storyMaker.editor.issuesDialogTitle", { count: issues.length })}
                size="md"
            >
                <StoryIssueList
                    issues={issues}
                    onSelectStep={(index) => {
                        setSelectedIndex(index);
                        setIssuesOpen(false);
                        setLeftTab("steps");
                        setMobileTab("inspector");
                    }}
                />
            </Dialog>

            <Snackbar open={snack !== null} message={snack ?? ""} onClose={() => setSnack(null)} />
        </PageContainer>
    );
}

export default function StoryMakerEditClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <StoryMakerEditContent />
            </Suspense>
        </MainLayout>
    );
}
