"use client";
import { useRef, useState } from "react";
import { Banner, Button, Dialog, Icon, Surface } from "@/components/md3";
import { mdCheckCircle, mdCode, mdUploadFile } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { compileStoryGraph, type CompiledStoryProgram } from "@/lib/storyMaker/compiler";
import { totalBeatCount } from "@/lib/storyMaker/document";
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

type ImportEvaluation =
    | { ok: true; format: "json" | "msk"; doc: StoryDocument; program: CompiledStoryProgram }
    | { ok: false; format: "json"; issues: StoryIssue[]; diagnostics?: StoryCompileDiagnostic[] }
    | { ok: false; format: "msk"; scriptErrors?: StoryScriptDiagnostic[]; diagnostics?: StoryCompileDiagnostic[] };

function detectInputFormat(raw: string, fileName?: string): "json" | "msk" {
    const trimmed = raw.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
    if (fileName && /\.json$/i.test(fileName) && !trimmed.startsWith("@story") && !trimmed.startsWith("#")) {
        return "json";
    }
    return "msk";
}

function evaluateImportText(raw: string, fileName?: string): ImportEvaluation {
    const format = detectInputFormat(raw, fileName);
    if (format === "json") {
        const res = parseStoryJson(raw);
        if (res.ok) {
            return { ok: true, format: "json", doc: res.doc, program: res.program };
        }
        return {
            ok: false,
            format: "json",
            issues: res.issues,
            ...(res.diagnostics ? { diagnostics: res.diagnostics } : {}),
        };
    }

    const parsed = parseStoryScript(raw);
    if (!parsed.ok) {
        return { ok: false, format: "msk", scriptErrors: parsed.diagnostics };
    }
    const program = compileStoryGraph(parsed.doc);
    if (!program.ok) {
        return { ok: false, format: "msk", diagnostics: program.errors };
    }
    return { ok: true, format: "msk", doc: parsed.doc, program };
}

/**
 * Imports either a MoeSekai Script (`.msk`) or a `moesekai-story/2` JSON file / pasted source.
 * Auto-detects format, runs strict structural validation and graph compilation, and displays
 * syntax or compiler diagnostics before accepting the document.
 */
export function StoryImportDialog({ isOpen, onClose, title, confirmLabel, onImport }: StoryImportDialogProps) {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");
    const [fileError, setFileError] = useState<string | null>(null);
    const [parsed, setParsed] = useState<ImportEvaluation | null>(null);

    const evaluate = (raw: string, fileName?: string) => {
        setText(raw);
        setFileError(null);
        if (!raw.trim()) {
            setParsed(null);
            return;
        }
        setParsed(evaluateImportText(raw, fileName));
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
            evaluate(content, file.name);
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
        ? (parsed.format === "json"
            ? (parsed.diagnostics ? parsed.diagnostics.filter(d => d.severity === "error").length : parsed.issues.length)
            : (parsed.scriptErrors?.length ?? parsed.diagnostics?.length ?? 0))
        : 0;

    return (
        <Dialog
            isOpen={isOpen}
            onClose={resetAndClose}
            title={title ?? t("page.storyMaker.import.title")}
            supportingText={t("page.storyMaker.import.description")}
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
                    accept=".msk,.json,application/json,text/plain"
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
                    <span className="mt-1 inline-flex flex-wrap items-center justify-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md3-full bg-secondary-container px-2.5 py-0.5 type-label-s text-on-secondary-container">
                            <Icon path={mdCode} size={14} />
                            <span>{t("page.storyMaker.v2.script.tabScript")}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md3-full bg-surface-container-high px-2.5 py-0.5 type-label-s text-on-surface-variant">
                            <span>{t("page.storyMaker.v2.script.tabJson")}</span>
                        </span>
                    </span>
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

                {parsed && !parsed.ok && (
                    <Banner tone="error" title={t("page.storyMaker.import.invalidTitle", { count: errorCount })}>
                        {parsed.format === "msk" && parsed.scriptErrors && parsed.scriptErrors.length > 0 ? (
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
                        ) : parsed.format === "json" ? (
                            <StoryIssueList
                                issues={parsed.issues}
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
                                {t(parsed.format === "msk" ? "page.storyMaker.v2.script.tabScript" : "page.storyMaker.v2.script.tabJson")}
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
