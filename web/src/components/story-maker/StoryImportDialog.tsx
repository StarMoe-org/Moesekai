"use client";
import { useRef, useState } from "react";
import { Banner, Button, Dialog, Icon, Surface } from "@/components/md3";
import { mdCheckCircle, mdCode, mdTranslate, mdUploadFile } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { UI_LOCALE_LABELS } from "@/lib/i18n/locales";
import { compileStoryGraph, type CompiledStoryProgram } from "@/lib/storyMaker/compiler";
import { totalBeatCount } from "@/lib/storyMaker/document";
import { detectJsonArtifactKind, getAvailableStoryLocales } from "@/lib/storyMaker/i18nPack";
import { parseStoryScript, type StoryScriptDiagnostic } from "@/lib/storyMaker/script";
import { parseStoryJson } from "@/lib/storyMaker/validate";
import type { StoryCompileDiagnostic, StoryDocument, StoryIssue } from "@/types/storyMaker";
import { StoryIssueList } from "./StoryIssueList";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export interface StoryImportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    confirmLabel?: string;
    onImport: (doc: StoryDocument) => void;
}

type ImportFormat = "msk" | "json";
type WrongJsonArtifact = "voiceManifest" | "localePack";

type ImportEvaluation =
    | { ok: true; format: ImportFormat; doc: StoryDocument; program: CompiledStoryProgram }
    | {
        ok: false;
        wrongFormat?: WrongJsonArtifact;
        scriptErrors?: StoryScriptDiagnostic[];
        jsonIssues?: StoryIssue[];
        diagnostics?: StoryCompileDiagnostic[];
    };

function evaluateImportText(raw: string): ImportEvaluation {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
        try {
            const parsedRaw: unknown = JSON.parse(trimmed);
            const kind = detectJsonArtifactKind(parsedRaw);
            if (kind === "voiceManifest" || kind === "localePack") {
                return { ok: false, wrongFormat: kind };
            }
        } catch {
            // Fall through to parseStoryJson for a structured invalidJson diagnostic.
        }
        const validated = parseStoryJson(trimmed);
        if (!validated.ok) {
            return {
                ok: false,
                jsonIssues: validated.issues,
                diagnostics: validated.diagnostics,
            };
        }
        return { ok: true, format: "json", doc: validated.doc, program: validated.program };
    }

    const parsed = parseStoryScript(raw);
    if (!parsed.ok) {
        return { ok: false, scriptErrors: parsed.diagnostics };
    }
    const program = compileStoryGraph(parsed.doc);
    if (!program.ok) {
        return { ok: false, diagnostics: program.errors };
    }
    return { ok: true, format: "msk", doc: parsed.doc, program };
}

/**
 * Imports a MoeSekai Script (`.msk`) or full Story Document (`.story.json`, `moesekai-story/2`)
 * file or pasted source, running strict syntax/schema validation and graph compilation before
 * accepting the document.
 */
export function StoryImportDialog({ isOpen, onClose, title, confirmLabel, onImport }: StoryImportDialogProps) {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");
    const [fileError, setFileError] = useState<string | null>(null);
    const [parsed, setParsed] = useState<ImportEvaluation | null>(null);

    const evaluate = (raw: string) => {
        setText(raw);
        setFileError(null);
        if (!raw.trim()) {
            setParsed(null);
            return;
        }
        setParsed(evaluateImportText(raw));
    };

    const loadFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_IMPORT_BYTES) {
            setFileError(t("page.storyMaker.import.fileTooLarge"));
            setParsed(null);
            return;
        }
        try {
            const content = await file.text();
            evaluate(content);
        } catch {
            setFileError(t("page.storyMaker.import.readFailed"));
            setParsed(null);
        }
    };

    const resetAndClose = () => {
        setText("");
        setFileError(null);
        setParsed(null);
        onClose();
    };

    const submit = () => {
        if (!parsed?.ok) return;
        const doc = parsed.doc;
        setText("");
        setFileError(null);
        setParsed(null);
        onImport(doc);
    };

    const errorCount = parsed && !parsed.ok
        ? (parsed.scriptErrors?.length ?? parsed.diagnostics?.length ?? parsed.jsonIssues?.length ?? 0)
        : 0;

    const previewLocales = parsed?.ok ? getAvailableStoryLocales(parsed.doc) : [];

    return (
        <Dialog
            isOpen={isOpen}
            onClose={resetAndClose}
            title={title ?? t("page.storyMaker.import.title")}
            size="lg"
            fullscreenOnMobile
            actions={(
                <>
                    <Button variant="text" onClick={resetAndClose}>{t("common.action.cancel")}</Button>
                    <Button variant="filled" disabled={!parsed?.ok} onClick={submit}>
                        {confirmLabel ?? t("page.storyMaker.import.confirm")}
                    </Button>
                </>
            )}
        >
            <div className="min-w-0 space-y-4">
                <input
                    ref={inputRef}
                    type="file"
                    accept=".msk,.json,text/plain,application/json"
                    className="hidden"
                    onChange={event => {
                        void loadFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={event => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault();
                        void loadFile(event.dataTransfer.files?.[0]);
                    }}
                    className="state-layer focus-ring flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md3-lg border-2 border-dashed border-outline-variant bg-surface-container px-4 py-6 text-center"
                >
                    <Icon path={mdUploadFile} size={28} className="text-primary" />
                    <span className="type-title-s text-on-surface">{t("page.storyMaker.import.dropLabel")}</span>
                    <span className="type-body-s text-on-surface-variant">{t("page.storyMaker.import.dropHint")}</span>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md3-full bg-secondary-container px-2.5 py-0.5 type-label-s text-on-secondary-container">
                            <Icon path={mdCode} size={14} />
                            <span>{t("page.storyMaker.v2.script.tabScript")}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md3-full bg-tertiary-container px-2.5 py-0.5 type-label-s text-on-tertiary-container">
                            <Icon path={mdTranslate} size={14} />
                            <span>{t("page.storyMaker.import.formatStoryJson")}</span>
                        </span>
                    </div>
                </button>

                <div className="space-y-1">
                    <label htmlFor="story-import-source" className="block type-label-l text-on-surface-variant">
                        {t("page.storyMaker.import.pasteLabel")}
                    </label>
                    <textarea
                        id="story-import-source"
                        rows={6}
                        value={text}
                        placeholder={t("page.storyMaker.import.pastePlaceholder")}
                        onChange={event => evaluate(event.target.value)}
                        className="w-full rounded-md3-xs border border-outline bg-transparent px-3.5 py-2.5 font-mono type-body-s text-on-surface placeholder:text-on-surface-variant focus:border-2 focus:border-primary focus:outline-none"
                    />
                </div>

                {fileError && <Banner tone="error">{fileError}</Banner>}

                {parsed && !parsed.ok && parsed.wrongFormat && (
                    <Banner tone="warning">
                        {t(parsed.wrongFormat === "voiceManifest"
                            ? "page.storyMaker.import.wrongFormatVoiceManifest"
                            : "page.storyMaker.import.wrongFormatLocalePack")}
                    </Banner>
                )}

                {parsed && !parsed.ok && !parsed.wrongFormat && (
                    <Banner tone="error" title={t("page.storyMaker.import.invalidTitle", { count: errorCount })}>
                        {parsed.scriptErrors && parsed.scriptErrors.length > 0 ? (
                            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono type-body-s text-on-surface">
                                {parsed.scriptErrors.map((err, idx) => (
                                    <li key={`${err.line}-${err.col}-${idx}`} className="break-words">
                                        {t("page.storyMaker.v2.script.parseError", {
                                            line: err.line,
                                            col: err.col,
                                            message: err.message,
                                        })}
                                    </li>
                                ))}
                            </ul>
                        ) : parsed.diagnostics && parsed.diagnostics.length > 0 ? (
                            <StoryIssueList
                                diagnostics={parsed.diagnostics}
                                compact
                                className="mt-2 max-h-48 overflow-y-auto"
                            />
                        ) : parsed.jsonIssues && parsed.jsonIssues.length > 0 ? (
                            <StoryIssueList
                                issues={parsed.jsonIssues}
                                compact
                                className="mt-2 max-h-48 overflow-y-auto"
                            />
                        ) : null}
                    </Banner>
                )}

                {parsed?.ok && (
                    <Surface tone="default" radius="md" className="space-y-2.5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-primary">
                                <Icon path={mdCheckCircle} size={20} />
                                <span className="type-title-s">{t("page.storyMaker.import.validTitle")}</span>
                            </div>
                            <span className="rounded-md3-full bg-secondary-container px-2.5 py-0.5 type-label-s text-on-secondary-container">
                                {t(parsed.format === "json"
                                    ? "page.storyMaker.import.formatStoryJson"
                                    : "page.storyMaker.v2.script.tabScript")}
                            </span>
                        </div>
                        <p className="type-title-m text-on-surface">
                            {parsed.doc.meta.title || t("page.storyMaker.untitled")}
                        </p>
                        {parsed.doc.meta.summary && (
                            <p className="break-words type-body-s text-on-surface-variant">{parsed.doc.meta.summary}</p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 type-label-m text-on-surface-variant">
                            <span>{t(SERVER_LABEL_KEYS[parsed.doc.region])}</span>
                            {parsed.doc.meta.author && (
                                <span>{t("page.storyMaker.meta.authorBy", { author: parsed.doc.meta.author })}</span>
                            )}
                            <span>{t("page.storyMaker.stats.cast", { count: parsed.doc.cast.length })}</span>
                            <span>{t("page.storyMaker.stats.steps", { count: totalBeatCount(parsed.doc) })}</span>
                        </div>
                        {previewLocales.length > 1 && (
                            <div className="inline-flex flex-wrap items-center gap-1.5 rounded-md3-full bg-tertiary-container px-2.5 py-0.5 type-label-s text-on-tertiary-container">
                                <Icon path={mdTranslate} size={13} className="shrink-0" />
                                <span>
                                    {t("page.storyMaker.import.attachedLocales", {
                                        locales: previewLocales.map(item => UI_LOCALE_LABELS[item.locale]).join(" · "),
                                    })}
                                </span>
                            </div>
                        )}
                        <p className="font-mono type-label-s text-primary">
                            {t("page.storyMaker.v2.script.compileSuccess", {
                                nodes: Object.keys(parsed.doc.nodes).length,
                                instructions: parsed.program.instructions.length,
                            })}
                        </p>
                        {parsed.program.warnings.length > 0 && (
                            <StoryIssueList
                                diagnostics={parsed.program.warnings}
                                compact
                                className="max-h-36 overflow-y-auto pt-1"
                            />
                        )}
                    </Surface>
                )}
            </div>
        </Dialog>
    );
}
