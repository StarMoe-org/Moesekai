"use client";
import { useRef, useState } from "react";
import { Banner, Button, Dialog, Icon, Surface } from "@/components/md3";
import { mdCheckCircle, mdUploadFile } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { parseStoryJson } from "@/lib/storyMaker/validate";
import type { StoryDocument, StoryIssue } from "@/types/storyMaker";
import { StoryIssueList } from "./StoryIssueList";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

interface StoryImportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    confirmLabel?: string;
    onImport: (doc: StoryDocument) => void;
}

/**
 * Importing a `moesekai-story/1` JSON file or pasted text: runs strict validation before the
 * caller accepts the document, displaying structured issues on any problem.
 */
export function StoryImportDialog({ isOpen, onClose, title, confirmLabel, onImport }: StoryImportDialogProps) {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");
    const [fileError, setFileError] = useState<string | null>(null);
    const [parsed, setParsed] = useState<{ ok: true; doc: StoryDocument } | { ok: false; issues: StoryIssue[] } | null>(null);

    const evaluate = (raw: string) => {
        setText(raw);
        setFileError(null);
        if (!raw.trim()) {
            setParsed(null);
            return;
        }
        setParsed(parseStoryJson(raw));
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
            <div className="space-y-4">
                <input
                    ref={inputRef}
                    type="file"
                    accept=".json,application/json"
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
                </button>

                <div className="space-y-1">
                    <label htmlFor="story-import-json" className="block type-label-l text-on-surface-variant">
                        {t("page.storyMaker.import.pasteLabel")}
                    </label>
                    <textarea
                        id="story-import-json"
                        rows={5}
                        value={text}
                        placeholder={t("page.storyMaker.import.pastePlaceholder")}
                        onChange={event => evaluate(event.target.value)}
                        className="w-full rounded-md3-xs border border-outline bg-transparent px-3.5 py-2.5 font-mono type-body-s text-on-surface placeholder:text-on-surface-variant focus:border-2 focus:border-primary focus:outline-none"
                    />
                </div>

                {fileError && <Banner tone="error">{fileError}</Banner>}

                {parsed && !parsed.ok && (
                    <Banner tone="error" title={t("page.storyMaker.import.invalidTitle", { count: parsed.issues.length })}>
                        <StoryIssueList issues={parsed.issues} className="mt-2 max-h-48 overflow-y-auto" />
                    </Banner>
                )}

                {parsed?.ok && (
                    <Surface tone="default" radius="md" className="space-y-2 p-4">
                        <div className="flex items-center gap-2 text-primary">
                            <Icon path={mdCheckCircle} size={20} />
                            <span className="type-title-s">{t("page.storyMaker.import.validTitle")}</span>
                        </div>
                        <p className="type-title-m text-on-surface">{parsed.doc.title || t("page.storyMaker.untitled")}</p>
                        {parsed.doc.summary && (
                            <p className="type-body-s text-on-surface-variant">{parsed.doc.summary}</p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 type-label-m text-on-surface-variant">
                            <span>{t(SERVER_LABEL_KEYS[parsed.doc.region])}</span>
                            {parsed.doc.author && <span>{t("page.storyMaker.meta.authorBy", { author: parsed.doc.author })}</span>}
                            <span>{t("page.storyMaker.stats.cast", { count: parsed.doc.cast.length })}</span>
                            <span>{t("page.storyMaker.stats.steps", { count: parsed.doc.steps.length })}</span>
                        </div>
                    </Surface>
                )}
            </div>
        </Dialog>
    );
}
