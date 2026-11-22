"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, IconButton, cn } from "@/components/md3";
import {
    mdCheck, mdCheckCircle, mdCode, mdContentCopy, mdContentPaste, mdDownload,
    mdErrorFill, mdPlayArrowFill, mdRestartAlt, mdUploadFile, mdWarning,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { CompiledStoryProgram } from "@/lib/storyMaker/compiler";
import type { StoryScriptDiagnostic } from "@/lib/storyMaker/script";
import { downloadStoryScript } from "@/lib/storyMaker/starter";
import type { StoryCompileDiagnostic, StoryDocument } from "@/types/storyMaker";
import { StoryIssueList } from "./StoryIssueList";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type StoryCodeEvaluation =
    | { ok: true; doc: StoryDocument; program: CompiledStoryProgram }
    | { ok: false; scriptErrors?: StoryScriptDiagnostic[]; diagnostics?: StoryCompileDiagnostic[] };

export interface StoryCodeWorkspaceProps {
    doc: StoryDocument;
    codeText: string;
    isDirty: boolean;
    evaluation: StoryCodeEvaluation;
    onChangeCode: (nextText: string) => void;
    onApply: (nextDoc: StoryDocument) => void;
    onApplyAndPlaytest: (nextDoc: StoryDocument) => void;
    onReset: () => void;
    onSelectDiagnostic?: (nodeId: string, beatId?: string) => void;
    onNotify?: (message: string) => void;
    className?: string;
}

function downloadRawScript(text: string, fallbackTitle: string): void {
    const safeName = (fallbackTitle.trim() || "story").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.msk`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Full-height `.msk` code preview, paste & editing workbench designed to sit alongside the
 * persistently mounted Live2D stage in Code Mode. Supports 1-click paste/copy for external AI
 * agent output, synchronized line numbers, click-to-jump syntax errors, and instant compilation.
 */
export function StoryCodeWorkspace({
    doc,
    codeText,
    isDirty,
    evaluation,
    onChangeCode,
    onApply,
    onApplyAndPlaytest,
    onReset,
    onSelectDiagnostic,
    onNotify,
    className,
}: StoryCodeWorkspaceProps): React.JSX.Element {
    const { t } = useI18n();
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const gutterRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const copyTimerRef = useRef<number | null>(null);
    const [copied, setCopied] = useState(false);
    const [showWarnings, setShowWarnings] = useState(false);

    useEffect(() => () => {
        if (copyTimerRef.current !== null) {
            window.clearTimeout(copyTimerRef.current);
        }
    }, []);

    const lineCount = useMemo(() => Math.max(1, codeText.split("\n").length), [codeText]);

    const errorLineSet = useMemo(() => {
        const set = new Set<number>();
        if (!evaluation.ok && evaluation.scriptErrors) {
            for (const err of evaluation.scriptErrors) {
                set.add(err.line);
            }
        }
        return set;
    }, [evaluation]);

    const handleScroll = () => {
        if (gutterRef.current && textareaRef.current) {
            gutterRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(codeText);
            setCopied(true);
            if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
            copyTimerRef.current = window.setTimeout(() => {
                setCopied(false);
                copyTimerRef.current = null;
            }, 2000);
        } catch {
            // Clipboard write denied.
        }
    };

    const handlePasteFromClipboard = async () => {
        try {
            if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
                throw new Error("clipboard-unavailable");
            }
            const text = await navigator.clipboard.readText();
            if (!text.trim()) return;
            onChangeCode(text);
            onNotify?.(t("page.storyMaker.v2.script.pastedToast"));
            textareaRef.current?.focus();
        } catch {
            const area = textareaRef.current;
            if (area) {
                area.focus();
                area.select();
            }
            onNotify?.(t("page.storyMaker.v2.script.pasteFallbackHint"));
        }
    };

    const handleImportFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_IMPORT_BYTES) {
            onNotify?.(t("page.storyMaker.import.fileTooLarge"));
            return;
        }
        try {
            const content = await file.text();
            onChangeCode(content);
            onNotify?.(t("page.storyMaker.v2.script.pastedToast"));
        } catch {
            onNotify?.(t("page.storyMaker.import.readFailed"));
        }
    };

    const handleDownload = () => {
        if (evaluation.ok) {
            downloadStoryScript(evaluation.doc);
        } else {
            downloadRawScript(codeText, doc.meta.title);
        }
        onNotify?.(t("page.storyMaker.exportedToast"));
    };

    const jumpToLine = (line: number, col: number) => {
        const area = textareaRef.current;
        if (!area) return;
        const lines = codeText.split("\n");
        const safeLine = Math.max(1, Math.min(lines.length, line));
        let offset = 0;
        for (let i = 0; i < safeLine - 1; i += 1) {
            offset += lines[i].length + 1;
        }
        const colOffset = Math.max(0, Math.min(lines[safeLine - 1]?.length ?? 0, col - 1));
        const pos = offset + colOffset;
        area.focus();
        area.setSelectionRange(pos, pos);
        const lineHeightPx = 20;
        area.scrollTop = Math.max(0, (safeLine - 4) * lineHeightPx);
        handleScroll();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            if (evaluation.ok && isDirty) {
                event.preventDefault();
                onApply(evaluation.doc);
            }
            return;
        }
        if (event.key === "Tab") {
            event.preventDefault();
            const area = event.currentTarget;
            const start = area.selectionStart;
            const end = area.selectionEnd;
            const next = `${codeText.slice(0, start)}  ${codeText.slice(end)}`;
            onChangeCode(next);
            window.requestAnimationFrame(() => {
                area.setSelectionRange(start + 2, start + 2);
            });
        }
    };

    const warningsCount = evaluation.ok ? evaluation.program.warnings.length : 0;

    return (
        <div className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden", className)}>
            {/* Compact Code Workbench Header */}
            <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-outline-variant/50 bg-surface-container/40 px-2.5 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                    <Icon path={mdCode} size={16} className="shrink-0 text-primary" />
                    <span className="truncate font-mono type-label-m text-on-surface">
                        .msk
                    </span>
                    <span className="shrink-0 font-mono type-label-s tabular-nums text-on-surface-variant">
                        {t("page.storyMaker.v2.script.lineCount", { count: lineCount })}
                    </span>
                    <span
                        className={cn(
                            "shrink-0 rounded-md3-full px-2 py-0.5 type-label-s",
                            isDirty
                                ? "bg-tertiary-container text-on-tertiary-container"
                                : "bg-surface-container-high text-on-surface-variant",
                        )}
                    >
                        {t(isDirty ? "page.storyMaker.v2.script.unsyncedBadge" : "page.storyMaker.v2.script.syncedBadge")}
                    </span>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".msk,text/plain"
                        className="hidden"
                        onChange={(event) => {
                            void handleImportFile(event.target.files?.[0]);
                            event.target.value = "";
                        }}
                    />
                    <Button
                        size="xs"
                        variant="tonal"
                        icon={mdContentPaste}
                        onClick={() => void handlePasteFromClipboard()}
                    >
                        {t("page.storyMaker.v2.script.pasteCode")}
                    </Button>
                    <Button
                        size="xs"
                        variant="outlined"
                        icon={copied ? mdCheckCircle : mdContentCopy}
                        onClick={() => void handleCopy()}
                    >
                        {t(copied ? "page.storyMaker.v2.script.copied" : "page.storyMaker.v2.script.copyCode")}
                    </Button>
                    <IconButton
                        size="xs"
                        icon={mdUploadFile}
                        label={t("page.storyMaker.v2.script.importFile")}
                        onClick={() => fileInputRef.current?.click()}
                    />
                    <IconButton
                        size="xs"
                        icon={mdDownload}
                        label={t("page.storyMaker.v2.script.downloadScript")}
                        onClick={handleDownload}
                    />
                    <IconButton
                        size="xs"
                        icon={mdRestartAlt}
                        label={t("page.storyMaker.v2.script.resetCode")}
                        disabled={!isDirty}
                        onClick={onReset}
                    />
                    <Button
                        size="xs"
                        variant="filled"
                        icon={mdCheck}
                        disabled={!evaluation.ok || !isDirty}
                        onClick={() => {
                            if (evaluation.ok) onApply(evaluation.doc);
                        }}
                    >
                        {t("page.storyMaker.v2.script.applyToCanvas")}
                    </Button>
                </div>
            </div>

            {/* Monospace Code Area with Synchronized Line Number Gutter */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden bg-surface-container-lowest">
                <div
                    ref={gutterRef}
                    aria-hidden
                    className="w-11 shrink-0 select-none overflow-hidden border-r border-outline-variant/40 bg-surface-container/50 py-2.5 pr-2 text-right font-mono text-[12px] leading-5 tabular-nums text-on-surface-variant/70"
                >
                    {Array.from({ length: lineCount }, (_, idx) => {
                        const num = idx + 1;
                        const hasErr = errorLineSet.has(num);
                        return (
                            <div
                                key={num}
                                className={cn("h-5", hasErr && "bg-error-container/60 pr-0.5 font-semibold text-error")}
                            >
                                {num}
                            </div>
                        );
                    })}
                </div>
                <textarea
                    ref={textareaRef}
                    aria-label={t("page.storyMaker.v2.script.tabScript")}
                    spellCheck={false}
                    wrap="off"
                    value={codeText}
                    placeholder={t("page.storyMaker.v2.script.placeholder")}
                    onChange={event => onChangeCode(event.target.value)}
                    onScroll={handleScroll}
                    onKeyDown={handleKeyDown}
                    className="min-h-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-2.5 font-mono text-[12px] leading-5 text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none"
                />
            </div>

            {/* Compact Live Compilation & Diagnostics Footer */}
            <div className="shrink-0 border-t border-outline-variant/50 bg-surface-container/40 px-2.5 py-1.5">
                {evaluation.ok ? (
                    <div className="space-y-1.5">
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="inline-flex min-w-0 items-center gap-1.5 type-label-m text-primary">
                                    <Icon path={mdCheckCircle} size={16} className="shrink-0" />
                                    <span className="truncate">
                                        {t("page.storyMaker.v2.script.compileSuccess", {
                                            nodes: Object.keys(evaluation.doc.nodes).length,
                                            instructions: evaluation.program.instructions.length,
                                        })}
                                    </span>
                                </span>
                                {warningsCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowWarnings(prev => !prev)}
                                        className="state-layer focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md3-full bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container"
                                    >
                                        <Icon path={mdWarning} size={13} />
                                        <span>
                                            {t("page.storyMaker.v2.compiler.statusWarnings", { count: warningsCount })}
                                        </span>
                                    </button>
                                )}
                            </div>
                            <Button
                                size="xs"
                                variant="tonal"
                                icon={mdPlayArrowFill}
                                onClick={() => onApplyAndPlaytest(evaluation.doc)}
                            >
                                {t("page.storyMaker.v2.script.applyAndPlaytest")}
                            </Button>
                        </div>

                        {showWarnings && warningsCount > 0 && (
                            <StoryIssueList
                                diagnostics={evaluation.program.warnings}
                                onSelectDiagnostic={onSelectDiagnostic}
                                compact
                                className="max-h-28 overflow-y-auto"
                            />
                        )}
                    </div>
                ) : (
                    <div className="min-w-0 space-y-1">
                        {evaluation.scriptErrors && evaluation.scriptErrors.length > 0 ? (
                            <>
                                <div className="flex items-center justify-between gap-2 type-label-s text-error">
                                    <span className="inline-flex items-center gap-1 font-medium">
                                        <Icon path={mdErrorFill} size={14} className="shrink-0" />
                                        <span>
                                            {t("page.storyMaker.v2.compiler.statusErrors", {
                                                count: evaluation.scriptErrors.length,
                                            })}
                                        </span>
                                    </span>
                                    <span className="text-on-surface-variant">
                                        {t("page.storyMaker.v2.script.jumpToLineHint")}
                                    </span>
                                </div>
                                <ul className="max-h-28 space-y-0.5 overflow-y-auto font-mono text-[12px]">
                                    {evaluation.scriptErrors.map((err, idx) => (
                                        <li key={`${err.line}-${err.col}-${idx}`}>
                                            <button
                                                type="button"
                                                onClick={() => jumpToLine(err.line, err.col)}
                                                className="state-layer focus-ring flex w-full cursor-pointer items-start gap-1.5 rounded-md3-xs px-1.5 py-0.5 text-left text-error hover:bg-error-container/35"
                                            >
                                                <Icon path={mdErrorFill} size={14} className="mt-0.5 shrink-0" />
                                                <span className="break-words text-on-surface">
                                                    {t("page.storyMaker.v2.script.parseError", {
                                                        line: err.line,
                                                        col: err.col,
                                                        message: err.message,
                                                    })}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : evaluation.diagnostics && evaluation.diagnostics.length > 0 ? (
                            <StoryIssueList
                                diagnostics={evaluation.diagnostics}
                                onSelectDiagnostic={onSelectDiagnostic}
                                compact
                                className="max-h-28 overflow-y-auto"
                            />
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
