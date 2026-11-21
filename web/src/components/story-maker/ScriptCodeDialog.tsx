"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Dialog, Icon } from "@/components/md3";
import {
    mdCheckCircle, mdCode, mdContentCopy, mdDownload, mdErrorFill, mdWarning,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { compileStoryGraph, type CompiledStoryProgram } from "@/lib/storyMaker/compiler";
import { parseStoryScript, serializeStoryScript, type StoryScriptDiagnostic } from "@/lib/storyMaker/script";
import { downloadStoryScript } from "@/lib/storyMaker/starter";
import type { StoryCompileDiagnostic, StoryDocument } from "@/types/storyMaker";
import { StoryIssueList } from "./StoryIssueList";

export interface ScriptCodeDialogProps {
    isOpen: boolean;
    onClose: () => void;
    doc: StoryDocument;
    onApply: (nextDoc: StoryDocument) => void;
}

type CodeEval =
    | { ok: true; doc: StoryDocument; program: CompiledStoryProgram }
    | { ok: false; scriptErrors?: StoryScriptDiagnostic[]; diagnostics?: StoryCompileDiagnostic[] };

/**
 * Bidirectional MoeSekai Script (`.msk`) source editor dialog.
 * Serializes the live canvas graph on open, validates & compiles edits in real time with
 * exact `line:col` syntax feedback, and syncs valid edits back onto the canvas undo stack.
 */
export function ScriptCodeDialog({ isOpen, onClose, doc, onApply }: ScriptCodeDialogProps) {
    const { t } = useI18n();
    const [scriptText, setScriptText] = useState(() => serializeStoryScript(doc));
    const [copied, setCopied] = useState(false);
    const [prevOpen, setPrevOpen] = useState(isOpen);
    const copyTimerRef = useRef<number | null>(null);

    // Re-sync code buffer fresh from the live document whenever the dialog opens.
    if (isOpen !== prevOpen) {
        setPrevOpen(isOpen);
        if (isOpen) {
            setScriptText(serializeStoryScript(doc));
            setCopied(false);
        }
    }

    useEffect(() => () => {
        if (copyTimerRef.current !== null) {
            window.clearTimeout(copyTimerRef.current);
        }
    }, []);

    const evaluation = useMemo<CodeEval>(() => {
        const parsed = parseStoryScript(scriptText);
        if (!parsed.ok) {
            return { ok: false, scriptErrors: parsed.diagnostics };
        }
        const program = compileStoryGraph(parsed.doc);
        if (!program.ok) {
            return { ok: false, diagnostics: program.errors };
        }
        return { ok: true, doc: parsed.doc, program };
    }, [scriptText]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(scriptText);
            setCopied(true);
            if (copyTimerRef.current !== null) {
                window.clearTimeout(copyTimerRef.current);
            }
            copyTimerRef.current = window.setTimeout(() => {
                setCopied(false);
                copyTimerRef.current = null;
            }, 2000);
        } catch {
            // Clipboard permission denied or unavailable.
        }
    };

    const handleDownloadScript = () => {
        downloadStoryScript(evaluation.ok ? evaluation.doc : doc);
    };

    const handleApply = () => {
        if (!evaluation.ok) return;
        onApply(evaluation.doc);
        onClose();
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.storyMaker.v2.script.dialogTitle")}
            size="lg"
            fullscreenOnMobile
            showClose
            actions={(
                <>
                    <Button variant="text" onClick={onClose}>
                        {t("common.action.cancel")}
                    </Button>
                    <Button
                        variant="filled"
                        icon={mdCode}
                        disabled={!evaluation.ok}
                        onClick={handleApply}
                    >
                        {t("page.storyMaker.v2.script.applyToCanvas")}
                    </Button>
                </>
            )}
        >
            <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md3-full bg-secondary-container px-2.5 py-1 type-label-m text-on-secondary-container">
                        <Icon path={mdCode} size={16} />
                        <span>{t("page.storyMaker.v2.script.tabScript")}</span>
                    </span>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Button
                            size="xs"
                            variant="tonal"
                            icon={copied ? mdCheckCircle : mdContentCopy}
                            onClick={() => void handleCopy()}
                        >
                            {t(copied ? "page.storyMaker.v2.script.copied" : "page.storyMaker.v2.script.copyCode")}
                        </Button>
                        <Button
                            size="xs"
                            variant="outlined"
                            icon={mdDownload}
                            onClick={handleDownloadScript}
                        >
                            {t("page.storyMaker.v2.script.downloadScript")}
                        </Button>
                    </div>
                </div>

                <textarea
                    aria-label={t("page.storyMaker.v2.script.tabScript")}
                    spellCheck={false}
                    rows={16}
                    value={scriptText}
                    onChange={event => setScriptText(event.target.value)}
                    className="min-h-[18rem] w-full resize-y rounded-md3-md border border-outline bg-surface-container-lowest px-3.5 py-3 font-mono type-body-s leading-relaxed text-on-surface focus:border-2 focus:border-primary focus:outline-none"
                />

                {evaluation.ok ? (
                    <div className="space-y-2">
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md3-md bg-primary-container/50 px-3 py-2 text-on-surface">
                            <span className="inline-flex min-w-0 items-center gap-2 type-label-l text-primary">
                                <Icon path={mdCheckCircle} size={18} className="shrink-0" />
                                <span className="break-words">
                                    {t("page.storyMaker.v2.script.compileSuccess", {
                                        nodes: Object.keys(evaluation.doc.nodes).length,
                                        instructions: evaluation.program.instructions.length,
                                    })}
                                </span>
                            </span>
                            {evaluation.program.warnings.length > 0 && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md3-full bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                                    <Icon path={mdWarning} size={14} />
                                    <span>
                                        {t("page.storyMaker.v2.compiler.statusWarnings", {
                                            count: evaluation.program.warnings.length,
                                        })}
                                    </span>
                                </span>
                            )}
                        </div>
                        {evaluation.program.warnings.length > 0 && (
                            <StoryIssueList
                                diagnostics={evaluation.program.warnings}
                                compact
                                className="max-h-32 overflow-y-auto"
                            />
                        )}
                    </div>
                ) : (
                    <Banner tone="error">
                        <div className="min-w-0 space-y-1.5">
                            {evaluation.scriptErrors && evaluation.scriptErrors.length > 0 ? (
                                <ul className="max-h-36 space-y-1 overflow-y-auto font-mono type-body-s text-on-surface">
                                    {evaluation.scriptErrors.map((err, idx) => (
                                        <li key={`${err.line}-${err.col}-${idx}`} className="flex items-start gap-1.5">
                                            <Icon path={mdErrorFill} size={16} className="mt-0.5 shrink-0 text-error" />
                                            <span className="break-words">
                                                {t("page.storyMaker.v2.script.parseError", {
                                                    line: err.line,
                                                    col: err.col,
                                                    message: err.message,
                                                })}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : evaluation.diagnostics && evaluation.diagnostics.length > 0 ? (
                                <StoryIssueList
                                    diagnostics={evaluation.diagnostics}
                                    compact
                                    className="max-h-36 overflow-y-auto"
                                />
                            ) : null}
                        </div>
                    </Banner>
                )}
            </div>
        </Dialog>
    );
}
