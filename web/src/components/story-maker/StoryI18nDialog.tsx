"use client";
import { useMemo, useRef, useState } from "react";
import {
    Banner, Button, Chip, Dialog, Divider, EmptyState, Icon, SegmentedButton, Select, Surface,
    Switch, Tabs, TextField, cn,
} from "@/components/md3";
import {
    mdWandStars, mdCheck, mdCheckCircle, mdContentCopy, mdContentPaste, mdDelete, mdDownload,
    mdEdit, mdErrorFill, mdTranslate, mdUploadFile, mdVerified, mdWarning,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import { SUPPORTED_UI_LOCALES, UI_LOCALE_LABELS, type UiLocale } from "@/lib/i18n/locales";
import {
    removeStoryLocalePack, setStorySourceLocale, upsertStoryLocalePack,
} from "@/lib/storyMaker/document";
import {
    buildAiTranslationPrompt,
    buildTranslationChunks,
    createEmptyLocalePack,
    detectOutdatedBeats,
    extractTranslatableSource,
    inferStorySourceLocale,
    parseAndValidateLocalePack,
    placeholdersMatch,
    upgradePackToProofread,
    type LocalePackImportSource,
    type LocalePackIssue,
} from "@/lib/storyMaker/i18nPack";
import { STORY_LIMITS } from "@/lib/storyMaker/limits";
import { downloadStoryLocalePack } from "@/lib/storyMaker/starter";
import type {
    StoryDocument,
    StoryImportableTranslationOrigin,
    StoryLocaleBeatEntry,
    StoryLocalePack,
    StoryTranslationOrigin,
} from "@/types/storyMaker";

const MAX_PACK_BYTES = 2 * 1024 * 1024;

type DialogTab = "ai" | "proofread";
type ProofreadFilter = "all" | "outdated" | "missing" | "warnings";

const TEXTAREA_CLS =
    "w-full rounded-md3-xs border border-outline bg-transparent px-3 py-2 type-body-s text-on-surface " +
    "placeholder:text-on-surface-variant focus:border-2 focus:border-primary focus:outline-none";

export function originBadgeTone(origin: StoryTranslationOrigin): string {
    switch (origin) {
        case "original":
            return "bg-primary-container text-on-primary-container";
        case "human":
            return "bg-secondary-container text-on-secondary-container";
        case "ai_assisted":
            return "bg-tertiary-container text-on-tertiary-container";
        case "ai_raw":
            return "bg-surface-container-highest text-on-surface-variant";
    }
}

export interface StoryI18nDialogProps {
    isOpen: boolean;
    onClose: () => void;
    doc: StoryDocument;
    onDocChange: (updater: (prev: StoryDocument) => StoryDocument) => void;
    onNotify?: (message: string) => void;
}

/**
 * Story Maker native multi-language (`StoryLocalePack`), AI Translation Assistant,
 * transparent provenance declaration, and side-by-side proofreading dialog.
 */
export function StoryI18nDialog({
    isOpen,
    onClose,
    doc,
    onDocChange,
    onNotify,
}: StoryI18nDialogProps) {
    const { t } = useI18n();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const sourceLocale = useMemo(() => inferStorySourceLocale(doc), [doc]);
    const targetOptions = useMemo<UiLocale[]>(() => (
        SUPPORTED_UI_LOCALES.filter(loc => loc !== sourceLocale)
    ), [sourceLocale]);

    const [selectedTarget, setSelectedTarget] = useState<UiLocale>(() => targetOptions[0] ?? "ja-JP");
    const targetLocale: UiLocale = targetOptions.includes(selectedTarget)
        ? selectedTarget
        : (targetOptions[0] ?? "ja-JP");

    const [tab, setTab] = useState<DialogTab>("ai");
    const [chunkIndex, setChunkIndex] = useState(0);
    const [onlyOutdated, setOnlyOutdated] = useState(false);

    // Import form state
    const [importText, setImportText] = useState("");
    const [importSource, setImportSource] = useState<LocalePackImportSource>("ai_paste");
    const [originChoice, setOriginChoice] = useState<StoryImportableTranslationOrigin | null>("ai_raw");
    const [modelHint, setModelHint] = useState("");
    const [note, setNote] = useState("");
    const [fileError, setFileError] = useState<string | null>(null);
    const [proofreadFilter, setProofreadFilter] = useState<ProofreadFilter>("all");
    const [confirmDelete, setConfirmDelete] = useState(false);

    const sourceData = useMemo(() => extractTranslatableSource(doc), [doc]);
    const currentPack = doc.locales?.[targetLocale] ?? null;
    const outdatedReport = useMemo(() => detectOutdatedBeats(doc, currentPack), [doc, currentPack]);
    const staleOrMissingIds = useMemo(
        () => [...outdatedReport.outdatedBeatIds, ...outdatedReport.missingBeatIds],
        [outdatedReport.missingBeatIds, outdatedReport.outdatedBeatIds],
    );

    const useIncrementalPrompt = onlyOutdated && Boolean(currentPack) && staleOrMissingIds.length > 0;
    const chunks = useMemo(
        () => buildTranslationChunks(doc, targetLocale, {
            onlyBeatIds: useIncrementalPrompt ? staleOrMissingIds : undefined,
        }),
        [doc, targetLocale, useIncrementalPrompt, staleOrMissingIds],
    );
    const safeChunkIndex = Math.max(0, Math.min(chunks.length - 1, chunkIndex));

    const promptBundle = useMemo(
        () => buildAiTranslationPrompt(doc, targetLocale, safeChunkIndex, {
            onlyBeatIds: useIncrementalPrompt ? staleOrMissingIds : undefined,
        }),
        [doc, targetLocale, safeChunkIndex, useIncrementalPrompt, staleOrMissingIds],
    );

    const effectiveOriginChoice: StoryImportableTranslationOrigin | null =
        importSource === "ai_paste"
            ? (originChoice === "ai_assisted" ? "ai_assisted" : "ai_raw")
            : originChoice;

    // Live validation for pasted/uploaded text.
    const validation = useMemo(() => {
        if (!importText.trim()) return null;
        return parseAndValidateLocalePack(importText, doc, targetLocale, {
            importSource,
            originOverride: effectiveOriginChoice ?? undefined,
            modelHint: modelHint.trim() || undefined,
            note: note.trim() || undefined,
            chunkIndex: !useIncrementalPrompt && chunks.length > 1 ? safeChunkIndex : undefined,
            existingPack: currentPack,
        });
    }, [
        importText, doc, targetLocale, importSource, effectiveOriginChoice, modelHint, note,
        useIncrementalPrompt, chunks.length, safeChunkIndex, currentPack,
    ]);

    const declarationRequiredMissing = importSource === "file_upload" && effectiveOriginChoice === null;

    const handleSelectTarget = (next: UiLocale) => {
        setSelectedTarget(next);
        setChunkIndex(0);
        setOnlyOutdated(false);
        setImportText("");
        setImportSource("ai_paste");
        setOriginChoice("ai_raw");
        setFileError(null);
        setConfirmDelete(false);
        setProofreadFilter("all");
    };

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(promptBundle.prompt);
            onNotify?.(t("page.storyMaker.i18n.copiedPromptToast"));
        } catch {
            // Clipboard write denied.
        }
    };

    const handleCopyJsonOnly = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(promptBundle.chunk.payload, null, 2));
            onNotify?.(t("page.storyMaker.i18n.copiedJsonToast"));
        } catch {
            // Clipboard write denied.
        }
    };

    const handlePasteClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            setImportSource("ai_paste");
            setOriginChoice("ai_raw");
            setFileError(null);
            setImportText(text);
        } catch {
            onNotify?.(t("page.storyMaker.v2.script.pasteFallbackHint"));
        }
    };

    const handleUploadPackFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_PACK_BYTES) {
            setFileError(t("page.storyMaker.i18n.fileTooLarge"));
            return;
        }
        try {
            const content = await file.text();
            setFileError(null);
            setImportSource("file_upload");
            // Uploading `.i18n.json` always requires explicitly picking a transparent declaration.
            setOriginChoice(null);
            setImportText(content);
            try {
                const raw = JSON.parse(content) as { translationMeta?: { modelHint?: unknown; note?: unknown } };
                if (typeof raw?.translationMeta?.modelHint === "string") {
                    setModelHint(raw.translationMeta.modelHint.slice(0, STORY_LIMITS.translationModelHint));
                }
                if (typeof raw?.translationMeta?.note === "string") {
                    setNote(raw.translationMeta.note.slice(0, STORY_LIMITS.translationNote));
                }
            } catch {
                // Invalid JSON will be surfaced by the live validator.
            }
        } catch {
            setFileError(t("page.storyMaker.i18n.readFailed"));
        }
    };

    const handleApplyImport = () => {
        if (!validation?.ok || !validation.pack || declarationRequiredMissing) return;
        const nextPack = validation.pack;
        onDocChange(prev => upsertStoryLocalePack(prev, nextPack));
        onNotify?.(t("page.storyMaker.i18n.importedPackToast", {
            locale: UI_LOCALE_LABELS[targetLocale],
            count: validation.stats.importedBeats,
        }));
        setImportText("");
        setFileError(null);
        if (!useIncrementalPrompt && safeChunkIndex + 1 < chunks.length) {
            setChunkIndex(safeChunkIndex + 1);
        } else {
            setTab("proofread");
        }
    };

    const updateCurrentPack = (updater: (pack: StoryLocalePack) => StoryLocalePack) => {
        const base = currentPack ?? createEmptyLocalePack(doc, targetLocale, "human");
        const next = updater(base);
        onDocChange(prev => upsertStoryLocalePack(prev, {
            ...next,
            translationMeta: {
                ...next.translationMeta,
                updatedAt: new Date().toISOString(),
            },
        }));
    };

    const updateBeatEntry = (
        beatId: string,
        srcHash: string,
        patch: Partial<StoryLocaleBeatEntry>,
    ) => {
        updateCurrentPack((pack) => {
            const existing = pack.beats[beatId];
            const nextEntry: StoryLocaleBeatEntry = {
                srcHash,
                body: existing?.body ?? "",
                ...(existing?.speaker !== undefined ? { speaker: existing.speaker } : {}),
                ...patch,
            };
            if (!nextEntry.speaker) delete nextEntry.speaker;
            return {
                ...pack,
                beats: {
                    ...pack.beats,
                    [beatId]: nextEntry,
                },
            };
        });
    };

    const handleCreateManualPack = () => {
        const blank = createEmptyLocalePack(doc, targetLocale, "human");
        onDocChange(prev => upsertStoryLocalePack(prev, blank));
    };

    const handleUpgradeToProofread = () => {
        if (!currentPack) return;
        const upgraded = upgradePackToProofread(currentPack);
        onDocChange(prev => upsertStoryLocalePack(prev, upgraded));
        onNotify?.(t("page.storyMaker.i18n.upgradedProofreadToast"));
    };

    const handleDeletePack = () => {
        onDocChange(prev => removeStoryLocalePack(prev, targetLocale));
        setConfirmDelete(false);
        onNotify?.(t("page.storyMaker.i18n.deletedPackToast", {
            locale: UI_LOCALE_LABELS[targetLocale],
        }));
    };

    const renderIssueText = (issue: LocalePackIssue) => (
        t(`page.storyMaker.i18n.issue.${issue.code}`, {
            ...(issue.params ?? {}),
            ...(issue.beatId ? { beatId: issue.beatId } : {}),
        })
    );

    // Filter beats for the Side-by-Side Proofreading tab.
    const proofreadRows = useMemo(() => {
        return sourceData.beats.map((srcBeat) => {
            const entry = currentPack?.beats[srcBeat.beatId];
            const translatedBody = entry?.body ?? "";
            const isMissing = !entry || translatedBody.trim() === "";
            const isOutdated = !isMissing && entry.srcHash !== srcBeat.srcHash;
            const placeholderInvalid = !isMissing && !placeholdersMatch(srcBeat.body, translatedBody);
            return {
                srcBeat,
                entry,
                isMissing,
                isOutdated,
                placeholderInvalid,
                hasWarning: placeholderInvalid,
            };
        });
    }, [sourceData.beats, currentPack]);

    const warningRowCount = useMemo(
        () => proofreadRows.filter(r => r.hasWarning).length,
        [proofreadRows],
    );

    const filteredProofreadRows = useMemo(() => {
        switch (proofreadFilter) {
            case "outdated":
                return proofreadRows.filter(r => r.isOutdated);
            case "missing":
                return proofreadRows.filter(r => r.isMissing);
            case "warnings":
                return proofreadRows.filter(r => r.hasWarning);
            default:
                return proofreadRows;
        }
    }, [proofreadRows, proofreadFilter]);

    const declarationOptions = importSource === "ai_paste"
        ? [
            { value: "ai_raw" as const, label: t("page.storyMaker.i18n.origin.ai_raw") },
            { value: "ai_assisted" as const, label: t("page.storyMaker.i18n.origin.ai_assisted") },
        ]
        : [
            { value: "human" as const, label: t("page.storyMaker.i18n.origin.human") },
            { value: "ai_assisted" as const, label: t("page.storyMaker.i18n.origin.ai_assisted") },
            { value: "ai_raw" as const, label: t("page.storyMaker.i18n.origin.ai_raw") },
        ];

    const proofreadOriginOptions = currentPack?.translationMeta.origin === "human"
        ? [
            { value: "human" as const, label: t("page.storyMaker.i18n.origin.human") },
            { value: "ai_assisted" as const, label: t("page.storyMaker.i18n.origin.ai_assisted") },
            { value: "ai_raw" as const, label: t("page.storyMaker.i18n.origin.ai_raw") },
        ]
        : [
            { value: "ai_assisted" as const, label: t("page.storyMaker.i18n.origin.ai_assisted") },
            { value: "ai_raw" as const, label: t("page.storyMaker.i18n.origin.ai_raw") },
        ];

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.storyMaker.i18n.dialogTitle")}
            supportingText={t("page.storyMaker.i18n.dialogSubtitle")}
            showClose
            size="xl"
            fullscreenOnMobile
            actions={(
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {currentPack && (
                            <Button
                                size="s"
                                variant="outlined"
                                icon={mdDownload}
                                onClick={() => {
                                    downloadStoryLocalePack(doc, currentPack);
                                    onNotify?.(t("page.storyMaker.i18n.exportedPackToast"));
                                }}
                            >
                                {t("page.storyMaker.i18n.exportPackButton")}
                            </Button>
                        )}
                    </div>
                    <Button variant="filled" onClick={onClose}>
                        {t("page.storyMaker.v2.picker.applyAndClose")}
                    </Button>
                </div>
            )}
        >
            <div className="min-w-0 space-y-4">
                {/* Source & Target Locale Selector Bar */}
                <Surface tone="default" radius="lg" className="min-w-0 space-y-3 border border-outline-variant/60 p-3">
                    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
                        <div className="w-full min-w-0 sm:w-56">
                            <Select<UiLocale>
                                label={t("page.storyMaker.i18n.sourceLocaleLabel")}
                                value={sourceLocale}
                                onValueChange={next => onDocChange(prev => setStorySourceLocale(prev, next))}
                                options={SUPPORTED_UI_LOCALES.map(loc => ({
                                    value: loc,
                                    label: UI_LOCALE_LABELS[loc],
                                }))}
                            />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1.5">
                            <span className="block type-label-m text-on-surface-variant">
                                {t("page.storyMaker.i18n.targetLocaleLabel")}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {targetOptions.map((loc) => {
                                    const pack = doc.locales?.[loc] ?? null;
                                    const report = detectOutdatedBeats(doc, pack);
                                    const active = loc === targetLocale;
                                    return (
                                        <button
                                            key={loc}
                                            type="button"
                                            onClick={() => handleSelectTarget(loc)}
                                            className={cn(
                                                "state-layer focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-md3-full border px-3 py-1.5 type-label-m transition-colors",
                                                active
                                                    ? "border-primary bg-primary-container text-on-primary-container"
                                                    : "border-outline-variant/70 bg-surface-container-low text-on-surface hover:bg-surface-container-high",
                                            )}
                                        >
                                            <span>{UI_LOCALE_LABELS[loc]}</span>
                                            {pack && (
                                                <span className="font-mono type-label-s tabular-nums opacity-85">
                                                    {report.translatedCount}/{report.totalCount}
                                                </span>
                                            )}
                                            {report.outdatedBeatIds.length > 0 && (
                                                <span className="inline-block size-2 rounded-full bg-error" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </Surface>

                <Tabs<DialogTab>
                    variant="secondary"
                    value={tab}
                    onValueChange={setTab}
                    aria-label={t("page.storyMaker.i18n.dialogTitle")}
                    items={[
                        { value: "ai", label: t("page.storyMaker.i18n.tabAiAssistant"), icon: mdWandStars },
                        {
                            value: "proofread",
                            label: t("page.storyMaker.i18n.tabProofread", {
                                translated: outdatedReport.translatedCount,
                                total: outdatedReport.totalCount,
                            }),
                            icon: mdEdit,
                        },
                    ]}
                />

                {/* ==================== TAB 1: AI TRANSLATION ASSISTANT ==================== */}
                {tab === "ai" && (
                    <div className="min-w-0 space-y-4">
                        {/* Step 1: Copy Prompt + Chunked JSON */}
                        <Surface tone="low" radius="lg" className="min-w-0 space-y-3 border border-outline-variant/60 p-4">
                            <div className="space-y-1">
                                <h3 className="flex items-center gap-2 type-title-s text-on-surface">
                                    <Icon path={mdTranslate} size={18} className="shrink-0 text-primary" />
                                    <span>{t("page.storyMaker.i18n.step1Title")}</span>
                                </h3>
                                <p className="type-body-s text-on-surface-variant">
                                    {t("page.storyMaker.i18n.step1Desc")}
                                </p>
                            </div>

                            {/* Incremental & Multi-Chunk Controls */}
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {chunks.length === 1 ? (
                                        <span className="rounded-md3-full bg-secondary-container px-2.5 py-1 type-label-s text-on-secondary-container">
                                            {t("page.storyMaker.i18n.chunkAllSingle", { beats: chunks[0]?.beatCount ?? 0 })}
                                        </span>
                                    ) : (
                                        chunks.map((chunk) => {
                                            const allDone = currentPack
                                                ? chunk.beatIds.every(id => Boolean(currentPack.beats[id]?.body.trim()))
                                                : false;
                                            return (
                                                <Chip
                                                    key={chunk.index}
                                                    selected={chunk.index === safeChunkIndex}
                                                    icon={allDone ? mdCheck : undefined}
                                                    onClick={() => setChunkIndex(chunk.index)}
                                                >
                                                    {t("page.storyMaker.i18n.chunkLabel", {
                                                        current: chunk.index + 1,
                                                        total: chunk.total,
                                                        beats: chunk.beatCount,
                                                    })}
                                                </Chip>
                                            );
                                        })
                                    )}
                                </div>

                                {currentPack && staleOrMissingIds.length > 0 && (
                                    <Switch
                                        checked={onlyOutdated}
                                        onCheckedChange={(checked) => {
                                            setOnlyOutdated(checked);
                                            setChunkIndex(0);
                                        }}
                                        label={t("page.storyMaker.i18n.onlyOutdatedToggle", {
                                            count: staleOrMissingIds.length,
                                        })}
                                    />
                                )}
                            </div>

                            {/* Prompt Preview & Copy Actions */}
                            <pre className="max-h-48 overflow-auto rounded-md3-md border border-outline-variant/60 bg-surface-container p-3 font-mono type-body-s text-on-surface">
                                {promptBundle.prompt}
                            </pre>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="filled" icon={mdContentCopy} onClick={() => void handleCopyPrompt()}>
                                    {t("page.storyMaker.i18n.copyPromptButton")}
                                </Button>
                                <Button variant="tonal" icon={mdContentCopy} onClick={() => void handleCopyJsonOnly()}>
                                    {t("page.storyMaker.i18n.copyJsonOnlyButton")}
                                </Button>
                            </div>
                        </Surface>

                        {/* Step 2: Paste AI Output OR Upload .i18n.json + Mandatory Transparent Declaration */}
                        <Surface tone="low" radius="lg" className="min-w-0 space-y-3 border border-outline-variant/60 p-4">
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                <h3 className="type-title-s text-on-surface">
                                    {t("page.storyMaker.i18n.step2Title")}
                                </h3>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".json,.i18n.json,application/json,text/plain"
                                        className="hidden"
                                        onChange={(event) => {
                                            void handleUploadPackFile(event.target.files?.[0]);
                                            event.target.value = "";
                                        }}
                                    />
                                    <Button
                                        size="s"
                                        variant="tonal"
                                        icon={mdContentPaste}
                                        onClick={() => void handlePasteClipboard()}
                                    >
                                        {t("page.storyMaker.i18n.pasteButton")}
                                    </Button>
                                    <Button
                                        size="s"
                                        variant="outlined"
                                        icon={mdUploadFile}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        {t("page.storyMaker.i18n.uploadPackButton")}
                                    </Button>
                                </div>
                            </div>

                            <textarea
                                rows={6}
                                value={importText}
                                placeholder={t("page.storyMaker.i18n.pastePlaceholder")}
                                onPaste={() => {
                                    setFileError(null);
                                    setImportSource("ai_paste");
                                    setOriginChoice("ai_raw");
                                }}
                                onChange={(event) => {
                                    setFileError(null);
                                    if (!event.target.value.trim()) {
                                        setImportSource("ai_paste");
                                        setOriginChoice("ai_raw");
                                    }
                                    setImportText(event.target.value);
                                }}
                                className={cn(TEXTAREA_CLS, "font-mono")}
                            />

                            {fileError && <Banner tone="error">{fileError}</Banner>}

                            {/* Mandatory Transparent AI Translation Declaration */}
                            <div className="space-y-2.5 rounded-md3-md border border-outline-variant/60 bg-surface-container p-3">
                                <div className="space-y-0.5">
                                    <p className="type-label-l text-on-surface">
                                        {t("page.storyMaker.i18n.declarationTitle")}
                                    </p>
                                    <p className="type-body-s text-on-surface-variant">
                                        {t(importSource === "ai_paste"
                                            ? "page.storyMaker.i18n.declarationAiNote"
                                            : "page.storyMaker.i18n.declarationFileNote")}
                                    </p>
                                </div>
                                {importSource === "ai_paste" ? (
                                    <SegmentedButton<StoryImportableTranslationOrigin>
                                        density={-1}
                                        value={effectiveOriginChoice ?? "ai_raw"}
                                        onValueChange={setOriginChoice}
                                        options={declarationOptions}
                                        aria-label={t("page.storyMaker.i18n.declarationTitle")}
                                    />
                                ) : (
                                    <div className="space-y-1.5">
                                        <div className="flex flex-wrap gap-1.5">
                                            {declarationOptions.map(opt => (
                                                <Chip
                                                    key={opt.value}
                                                    selected={effectiveOriginChoice === opt.value}
                                                    onClick={() => setOriginChoice(opt.value)}
                                                >
                                                    {opt.label}
                                                </Chip>
                                            ))}
                                        </div>
                                        {declarationRequiredMissing && (
                                            <p role="alert" className="type-label-s text-error">
                                                {t("page.storyMaker.i18n.issue.originMissing")}
                                            </p>
                                        )}
                                    </div>
                                )}
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    <TextField
                                        label={t("page.storyMaker.i18n.modelHintLabel")}
                                        placeholder={t("page.storyMaker.i18n.modelHintPlaceholder")}
                                        value={modelHint}
                                        maxLength={STORY_LIMITS.translationModelHint}
                                        onChange={event => setModelHint(event.target.value)}
                                    />
                                    <TextField
                                        label={t("page.storyMaker.i18n.noteLabel")}
                                        placeholder={t("page.storyMaker.i18n.notePlaceholder")}
                                        value={note}
                                        maxLength={STORY_LIMITS.translationNote}
                                        onChange={event => setNote(event.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Live Auto-Validation Report */}
                            {validation && (
                                <div className="space-y-2">
                                    {validation.errors.length > 0 && (
                                        <Banner
                                            tone="error"
                                            title={t("page.storyMaker.i18n.validationErrorsTitle", {
                                                count: validation.errors.length,
                                            })}
                                        >
                                            <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto type-body-s">
                                                {validation.errors.map((err, idx) => (
                                                    <li key={`${err.path}-${err.code}-${idx}`} className="flex items-start gap-1.5">
                                                        <Icon path={mdErrorFill} size={15} className="mt-0.5 shrink-0 text-error" />
                                                        <span className="min-w-0 break-words">
                                                            {renderIssueText(err)}
                                                            <span className="ml-1.5 font-mono type-label-s opacity-75">
                                                                ({err.path})
                                                            </span>
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </Banner>
                                    )}

                                    {validation.warnings.length > 0 && (
                                        <Banner
                                            tone="warning"
                                            title={t("page.storyMaker.i18n.validationWarningsTitle", {
                                                count: validation.warnings.length,
                                            })}
                                        >
                                            <ul className="mt-1.5 max-h-36 space-y-1 overflow-y-auto type-body-s">
                                                {validation.warnings.slice(0, 20).map((warn, idx) => (
                                                    <li key={`${warn.path}-${warn.code}-${idx}`} className="flex items-start gap-1.5">
                                                        <Icon path={mdWarning} size={15} className="mt-0.5 shrink-0 text-tertiary" />
                                                        <span className="min-w-0 break-words">{renderIssueText(warn)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </Banner>
                                    )}

                                    {validation.ok && (
                                        <Surface tone="default" radius="md" className="flex flex-wrap items-center justify-between gap-3 border border-primary/40 bg-primary-container/25 p-3">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <Icon path={mdCheckCircle} size={20} className="shrink-0 text-primary" />
                                                <span className="type-title-s text-on-surface">
                                                    {t("page.storyMaker.i18n.validationReadyTitle", {
                                                        imported: validation.stats.importedBeats,
                                                        total: validation.stats.totalExpectedBeats,
                                                    })}
                                                </span>
                                            </div>
                                            <Button
                                                variant="filled"
                                                icon={mdCheck}
                                                disabled={declarationRequiredMissing}
                                                onClick={handleApplyImport}
                                            >
                                                {t("page.storyMaker.i18n.importMergeButton")}
                                            </Button>
                                        </Surface>
                                    )}
                                </div>
                            )}
                        </Surface>
                    </div>
                )}

                {/* ==================== TAB 2: SIDE-BY-SIDE PROOFREADING ==================== */}
                {tab === "proofread" && (
                    !currentPack ? (
                        <Surface tone="low" radius="lg" className="border border-outline-variant/60 p-4">
                            <EmptyState
                                icon={mdTranslate}
                                title={t("page.storyMaker.i18n.emptyPackTitle", {
                                    locale: UI_LOCALE_LABELS[targetLocale],
                                })}
                                description={t("page.storyMaker.i18n.emptyPackDesc")}
                                action={(
                                    <div className="mt-2 flex flex-wrap justify-center gap-2">
                                        <Button variant="filled" icon={mdWandStars} onClick={() => setTab("ai")}>
                                            {t("page.storyMaker.i18n.tabAiAssistant")}
                                        </Button>
                                        <Button variant="tonal" icon={mdEdit} onClick={handleCreateManualPack}>
                                            {t("page.storyMaker.i18n.createManualPackButton")}
                                        </Button>
                                    </div>
                                )}
                            />
                        </Surface>
                    ) : (
                        <div className="min-w-0 space-y-4">
                            {/* Upgrade ai_raw -> ai_assisted prompt */}
                            {currentPack.translationMeta.origin === "ai_raw" && (
                                <Banner
                                    tone="info"
                                    action={(
                                        <Button
                                            size="xs"
                                            variant="filled"
                                            icon={mdVerified}
                                            onClick={handleUpgradeToProofread}
                                        >
                                            {t("page.storyMaker.i18n.upgradeProofreadButton")}
                                        </Button>
                                    )}
                                >
                                    {t("page.storyMaker.i18n.upgradeProofreadBanner")}
                                </Banner>
                            )}

                            {/* Provenance Metadata Editor & Pack Actions */}
                            <Surface tone="low" radius="lg" className="min-w-0 space-y-3 border border-outline-variant/60 p-3.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={cn(
                                            "inline-flex items-center rounded-md3-full px-2.5 py-0.5 type-label-m",
                                            originBadgeTone(currentPack.translationMeta.origin),
                                        )}>
                                            {t(`page.storyMaker.i18n.origin.${currentPack.translationMeta.origin}`)}
                                        </span>
                                        <SegmentedButton<StoryImportableTranslationOrigin>
                                            density={-2}
                                            value={currentPack.translationMeta.origin === "original" ? "ai_raw" : currentPack.translationMeta.origin}
                                            onValueChange={nextOrigin => updateCurrentPack((pack) => {
                                                // Prevent laundering AI-origin packs into "human".
                                                if (pack.translationMeta.origin !== "human" && nextOrigin === "human") {
                                                    return pack;
                                                }
                                                return {
                                                    ...pack,
                                                    translationMeta: { ...pack.translationMeta, origin: nextOrigin },
                                                };
                                            })}
                                            options={proofreadOriginOptions}
                                            aria-label={t("page.storyMaker.i18n.declarationTitle")}
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {confirmDelete ? (
                                            <>
                                                <Button size="xs" variant="text" onClick={() => setConfirmDelete(false)}>
                                                    {t("common.action.cancel")}
                                                </Button>
                                                <Button size="xs" variant="filled" color="error" icon={mdDelete} onClick={handleDeletePack}>
                                                    {t("page.storyMaker.i18n.deletePackButton")}
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                size="xs"
                                                variant="text"
                                                color="error"
                                                icon={mdDelete}
                                                onClick={() => setConfirmDelete(true)}
                                            >
                                                {t("page.storyMaker.i18n.deletePackButton")}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    <TextField
                                        label={t("page.storyMaker.i18n.modelHintLabel")}
                                        placeholder={t("page.storyMaker.i18n.modelHintPlaceholder")}
                                        value={currentPack.translationMeta.modelHint ?? ""}
                                        maxLength={STORY_LIMITS.translationModelHint}
                                        onChange={event => updateCurrentPack(pack => ({
                                            ...pack,
                                            translationMeta: {
                                                ...pack.translationMeta,
                                                modelHint: event.target.value || undefined,
                                            },
                                        }))}
                                    />
                                    <TextField
                                        label={t("page.storyMaker.i18n.noteLabel")}
                                        placeholder={t("page.storyMaker.i18n.notePlaceholder")}
                                        value={currentPack.translationMeta.note ?? ""}
                                        maxLength={STORY_LIMITS.translationNote}
                                        onChange={event => updateCurrentPack(pack => ({
                                            ...pack,
                                            translationMeta: {
                                                ...pack.translationMeta,
                                                note: event.target.value || undefined,
                                            },
                                        }))}
                                    />
                                </div>
                            </Surface>

                            {/* Metadata & Cast & Places Compact Side-by-Side */}
                            <Surface tone="low" radius="lg" className="min-w-0 space-y-3 border border-outline-variant/60 p-3.5">
                                <p className="type-title-s text-on-surface">{t("page.storyMaker.i18n.sectionMeta")}</p>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div className="rounded-md3-sm bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                                        {doc.meta.title || t("page.storyMaker.untitled")}
                                    </div>
                                    <TextField
                                        label={t("page.storyMaker.meta.title")}
                                        value={currentPack.meta?.title ?? ""}
                                        maxLength={STORY_LIMITS.title}
                                        onChange={event => updateCurrentPack(pack => ({
                                            ...pack,
                                            meta: { ...(pack.meta ?? {}), title: event.target.value },
                                        }))}
                                    />
                                </div>
                                {doc.meta.summary && (
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <div className="rounded-md3-sm bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                                            {doc.meta.summary}
                                        </div>
                                        <TextField
                                            label={t("page.storyMaker.meta.summary")}
                                            value={currentPack.meta?.summary ?? ""}
                                            maxLength={STORY_LIMITS.summary}
                                            onChange={event => updateCurrentPack(pack => ({
                                                ...pack,
                                                meta: { ...(pack.meta ?? {}), summary: event.target.value },
                                            }))}
                                        />
                                    </div>
                                )}

                                {doc.cast.length > 0 && (
                                    <>
                                        <Divider />
                                        <p className="type-title-s text-on-surface">{t("page.storyMaker.i18n.sectionCast")}</p>
                                        <div className="space-y-2">
                                            {doc.cast.map((member) => (
                                                <div key={member.key} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                                                    <div className="flex items-center gap-2 rounded-md3-sm bg-surface-container px-2.5 py-1.5">
                                                        {member.characterId ? (
                                                            <img src={getCharacterIconUrl(member.characterId)} alt="" className="size-6 rounded-full object-cover" />
                                                        ) : (
                                                            <span className="flex size-6 items-center justify-center rounded-full bg-secondary-container type-label-s text-on-secondary-container">
                                                                {(member.name || member.key).slice(0, 1)}
                                                            </span>
                                                        )}
                                                        <span className="truncate type-body-s text-on-surface">{member.name}</span>
                                                        <span className="ml-auto font-mono type-label-s text-on-surface-variant">{member.key}</span>
                                                    </div>
                                                    <TextField
                                                        value={currentPack.cast?.[member.key] ?? ""}
                                                        maxLength={STORY_LIMITS.castName}
                                                        placeholder={member.name}
                                                        aria-label={member.key}
                                                        onChange={event => updateCurrentPack(pack => ({
                                                            ...pack,
                                                            cast: { ...(pack.cast ?? {}), [member.key]: event.target.value },
                                                        }))}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {Object.keys(sourceData.places).length > 0 && (
                                    <>
                                        <Divider />
                                        <p className="type-title-s text-on-surface">{t("page.storyMaker.i18n.sectionPlaces")}</p>
                                        <div className="space-y-2">
                                            {Object.entries(sourceData.places).map(([sceneId, placeText]) => (
                                                <div key={sceneId} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                                                    <div className="rounded-md3-sm bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                                                        <span className="mr-1.5 font-mono type-label-s opacity-75">{sceneId}</span>
                                                        <span>{placeText}</span>
                                                    </div>
                                                    <TextField
                                                        value={currentPack.places?.[sceneId] ?? ""}
                                                        maxLength={STORY_LIMITS.place}
                                                        placeholder={placeText}
                                                        aria-label={sceneId}
                                                        onChange={event => updateCurrentPack(pack => ({
                                                            ...pack,
                                                            places: { ...(pack.places ?? {}), [sceneId]: event.target.value },
                                                        }))}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </Surface>

                            {/* Beats Side-by-Side Filter & Proofreading Table */}
                            <div className="space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="type-title-s text-on-surface">
                                        {t("page.storyMaker.i18n.sectionBeats")}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Chip selected={proofreadFilter === "all"} onClick={() => setProofreadFilter("all")}>
                                            {t("page.storyMaker.i18n.filterAll", { count: proofreadRows.length })}
                                        </Chip>
                                        <Chip selected={proofreadFilter === "outdated"} onClick={() => setProofreadFilter("outdated")}>
                                            {t("page.storyMaker.i18n.filterOutdated", { count: outdatedReport.outdatedBeatIds.length })}
                                        </Chip>
                                        <Chip selected={proofreadFilter === "missing"} onClick={() => setProofreadFilter("missing")}>
                                            {t("page.storyMaker.i18n.filterMissing", { count: outdatedReport.missingBeatIds.length })}
                                        </Chip>
                                        <Chip selected={proofreadFilter === "warnings"} onClick={() => setProofreadFilter("warnings")}>
                                            {t("page.storyMaker.i18n.filterWarnings", { count: warningRowCount })}
                                        </Chip>
                                    </div>
                                </div>

                                <div className="space-y-2.5">
                                    {filteredProofreadRows.map(({
                                        srcBeat, entry, isMissing, isOutdated, placeholderInvalid,
                                    }) => {
                                        const castMember = srcBeat.speakerKey
                                            ? doc.cast.find(c => c.key === srcBeat.speakerKey)
                                            : undefined;
                                        const maxBodyLen = srcBeat.kind === "telop" ? STORY_LIMITS.telop : STORY_LIMITS.body;
                                        const hasVar = srcBeat.placeholders.length > 0;

                                        return (
                                            <Surface
                                                key={srcBeat.beatId}
                                                tone="low"
                                                radius="md"
                                                className={cn(
                                                    "min-w-0 space-y-2.5 border p-3",
                                                    placeholderInvalid
                                                        ? "border-error/70 bg-error-container/10"
                                                        : isOutdated
                                                            ? "border-tertiary/70 bg-tertiary-container/10"
                                                            : "border-outline-variant/60",
                                                )}
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        {castMember?.characterId && (
                                                            <img
                                                                src={getCharacterIconUrl(castMember.characterId)}
                                                                alt=""
                                                                className="size-6 shrink-0 rounded-full object-cover"
                                                            />
                                                        )}
                                                        <span className="truncate type-label-l text-on-surface">
                                                            {srcBeat.kind === "talk"
                                                                ? (srcBeat.speakerDisplay || t("page.storyMaker.v2.beats.speakerNone"))
                                                                : t(`page.storyMaker.v2.beats.${srcBeat.kind}`)}
                                                        </span>
                                                        <span className="font-mono type-label-s text-on-surface-variant">
                                                            {srcBeat.beatId}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {isOutdated && (
                                                            <>
                                                                <span className="rounded-md3-full bg-error-container px-2 py-0.5 type-label-s text-on-error-container">
                                                                    {t("page.storyMaker.i18n.outdatedBadge")}
                                                                </span>
                                                                <Button
                                                                    size="xs"
                                                                    variant="tonal"
                                                                    icon={mdCheck}
                                                                    onClick={() => updateBeatEntry(srcBeat.beatId, srcBeat.srcHash, {
                                                                        body: entry?.body ?? "",
                                                                    })}
                                                                >
                                                                    {t("page.storyMaker.i18n.markSyncedButton")}
                                                                </Button>
                                                            </>
                                                        )}
                                                        {isMissing && (
                                                            <span className="rounded-md3-full bg-surface-container-highest px-2 py-0.5 type-label-s text-on-surface-variant">
                                                                {t("page.storyMaker.i18n.missingBadge")}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                                    {/* Left: Original Source */}
                                                    <div className="min-w-0 space-y-1.5 rounded-md3-sm bg-surface-container p-2.5">
                                                        <span className="block type-label-s text-on-surface-variant">
                                                            {t("page.storyMaker.i18n.sourceColumn", {
                                                                locale: UI_LOCALE_LABELS[sourceLocale],
                                                            })}
                                                        </span>
                                                        <p className="whitespace-pre-wrap break-words type-body-m text-on-surface">
                                                            {srcBeat.body}
                                                        </p>
                                                        {hasVar && (
                                                            <div className="flex flex-wrap gap-1 pt-0.5">
                                                                {srcBeat.placeholders.map((v, i) => (
                                                                    <span
                                                                        key={`${v}-${i}`}
                                                                        className="rounded-md3-xs bg-secondary-container px-1.5 py-0.5 font-mono type-label-s text-on-secondary-container"
                                                                    >
                                                                        {`{{${v}}}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Right: Editable Translation */}
                                                    <div className="min-w-0 space-y-2">
                                                        <span className="block type-label-s text-on-surface-variant">
                                                            {t("page.storyMaker.i18n.targetColumn", {
                                                                locale: UI_LOCALE_LABELS[targetLocale],
                                                            })}
                                                        </span>
                                                        <textarea
                                                            rows={2}
                                                            maxLength={maxBodyLen}
                                                            value={entry?.body ?? ""}
                                                            onChange={event => updateBeatEntry(srcBeat.beatId, srcBeat.srcHash, {
                                                                body: event.target.value,
                                                            })}
                                                            className={TEXTAREA_CLS}
                                                        />

                                                        {placeholderInvalid && (
                                                            <p role="alert" className="type-label-s text-error">
                                                                {t("page.storyMaker.i18n.placeholderErrorInline", {
                                                                    vars: srcBeat.placeholders.map(v => `{{${v}}}`).join(", "),
                                                                })}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </Surface>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Choices & Endings Side-by-Side */}
                            {Object.keys(sourceData.choices).length > 0 && (
                                <Surface tone="low" radius="lg" className="min-w-0 space-y-2.5 border border-outline-variant/60 p-3.5">
                                    <p className="type-title-s text-on-surface">{t("page.storyMaker.i18n.sectionChoices")}</p>
                                    {Object.entries(sourceData.choices).map(([nodeId, opts]) => (
                                        <div key={nodeId} className="space-y-2">
                                            {Object.entries(opts).map(([optId, optText]) => (
                                                <div key={`${nodeId}-${optId}`} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                                                    <div className="rounded-md3-sm bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                                                        <span className="mr-1.5 font-mono type-label-s opacity-75">{nodeId}.{optId}</span>
                                                        <span>{optText}</span>
                                                    </div>
                                                    <TextField
                                                        value={currentPack.choices?.[nodeId]?.[optId] ?? ""}
                                                        maxLength={STORY_LIMITS.choiceText}
                                                        placeholder={optText}
                                                        aria-label={`${nodeId}.${optId}`}
                                                        onChange={event => updateCurrentPack(pack => ({
                                                            ...pack,
                                                            choices: {
                                                                ...(pack.choices ?? {}),
                                                                [nodeId]: {
                                                                    ...(pack.choices?.[nodeId] ?? {}),
                                                                    [optId]: event.target.value,
                                                                },
                                                            },
                                                        }))}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </Surface>
                            )}

                            {Object.keys(sourceData.ends).length > 0 && (
                                <Surface tone="low" radius="lg" className="min-w-0 space-y-2.5 border border-outline-variant/60 p-3.5">
                                    <p className="type-title-s text-on-surface">{t("page.storyMaker.i18n.sectionEnds")}</p>
                                    {Object.entries(sourceData.ends).map(([nodeId, endInfo]) => (
                                        <div key={nodeId} className="space-y-2 rounded-md3-sm bg-surface-container/60 p-2.5">
                                            <span className="block font-mono type-label-s text-on-surface-variant">{nodeId}</span>
                                            {endInfo.title && (
                                                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                                                    <div className="rounded-md3-sm bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                                                        {endInfo.title}
                                                    </div>
                                                    <TextField
                                                        value={currentPack.ends?.[nodeId]?.title ?? ""}
                                                        maxLength={STORY_LIMITS.nodeTitle}
                                                        placeholder={endInfo.title}
                                                        aria-label={`${nodeId}.title`}
                                                        onChange={event => updateCurrentPack(pack => ({
                                                            ...pack,
                                                            ends: {
                                                                ...(pack.ends ?? {}),
                                                                [nodeId]: { ...(pack.ends?.[nodeId] ?? {}), title: event.target.value },
                                                            },
                                                        }))}
                                                    />
                                                </div>
                                            )}
                                            {endInfo.subtitle && (
                                                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                                                    <div className="rounded-md3-sm bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                                                        {endInfo.subtitle}
                                                    </div>
                                                    <TextField
                                                        value={currentPack.ends?.[nodeId]?.subtitle ?? ""}
                                                        maxLength={STORY_LIMITS.endSubtitle}
                                                        placeholder={endInfo.subtitle}
                                                        aria-label={`${nodeId}.subtitle`}
                                                        onChange={event => updateCurrentPack(pack => ({
                                                            ...pack,
                                                            ends: {
                                                                ...(pack.ends ?? {}),
                                                                [nodeId]: { ...(pack.ends?.[nodeId] ?? {}), subtitle: event.target.value },
                                                            },
                                                        }))}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </Surface>
                            )}
                        </div>
                    )
                )}
            </div>
        </Dialog>
    );
}
