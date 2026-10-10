"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { IconButton } from "@/components/md3/Button";
import { mdCheck, mdContentCopy, mdDownload, mdRefresh } from "@/components/md3/icons";
import { copyImageBlob, createSvgPreviewBlob, saveImageBlob } from "@/lib/imageActions";

interface UseSvgPreviewActionsOptions {
    isOpen: boolean;
    previewRef: RefObject<HTMLElement | null>;
    fileName: string;
}

export function useSvgPreviewActions({
    isOpen,
    previewRef,
    fileName,
}: UseSvgPreviewActionsOptions) {
    const { t } = useI18n();
    const [isCopying, setIsCopying] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const copyResetTimerRef = useRef<number | null>(null);
    const saveResetTimerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (copyResetTimerRef.current) {
                window.clearTimeout(copyResetTimerRef.current);
            }
            if (saveResetTimerRef.current) {
                window.clearTimeout(saveResetTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isOpen) {
            setErrorMessage(null);
            setIsCopying(false);
            setIsSaving(false);
            setCopySuccess(false);
            setSaveSuccess(false);
            if (copyResetTimerRef.current) {
                window.clearTimeout(copyResetTimerRef.current);
                copyResetTimerRef.current = null;
            }
            if (saveResetTimerRef.current) {
                window.clearTimeout(saveResetTimerRef.current);
                saveResetTimerRef.current = null;
            }
        }
    }, [isOpen]);

    const getPreviewSvg = useCallback(() => {
        return previewRef.current?.querySelector("svg") ?? null;
    }, [previewRef]);

    const handleCopy = useCallback(async () => {
        const previewSvg = getPreviewSvg();
        if (!previewSvg) {
            setErrorMessage(t("common.imageActions.previewNotReady"));
            return;
        }

        setIsCopying(true);
        setErrorMessage(null);
        setCopySuccess(false);

        try {
            await copyImageBlob(createSvgPreviewBlob(previewSvg));
            setCopySuccess(true);
            if (copyResetTimerRef.current) {
                window.clearTimeout(copyResetTimerRef.current);
            }
            copyResetTimerRef.current = window.setTimeout(() => {
                setCopySuccess(false);
            }, 1800);
        } catch {
            setErrorMessage(t("common.imageActions.copyFailedUseSave"));
        } finally {
            setIsCopying(false);
        }
    }, [getPreviewSvg, t]);

    const handleSave = useCallback(async () => {
        const previewSvg = getPreviewSvg();
        if (!previewSvg) {
            setErrorMessage(t("common.imageActions.previewNotReady"));
            return;
        }

        setIsSaving(true);
        setErrorMessage(null);
        setSaveSuccess(false);

        try {
            const blob = await createSvgPreviewBlob(previewSvg);
            await saveImageBlob(blob, fileName);
            setSaveSuccess(true);
            if (saveResetTimerRef.current) {
                window.clearTimeout(saveResetTimerRef.current);
            }
            saveResetTimerRef.current = window.setTimeout(() => {
                setSaveSuccess(false);
            }, 1800);
        } catch {
            setErrorMessage(t("common.imageActions.saveFailed"));
        } finally {
            setIsSaving(false);
        }
    }, [fileName, getPreviewSvg, t]);

    const copyLabel = isCopying ? t("common.imageActions.copying") : copySuccess ? t("common.imageActions.copySuccess") : t("common.imageActions.copyImage");
    const saveLabel = isSaving ? t("common.imageActions.saving") : saveSuccess ? t("common.imageActions.saveSuccess") : t("common.imageActions.saveImage");
    const headerActions = (
        <>
            <IconButton
                onClick={handleCopy}
                disabled={isCopying || isSaving}
                icon={isCopying ? mdRefresh : copySuccess ? mdCheck : mdContentCopy}
                label={copyLabel}
                aria-busy={isCopying}
                className={`min-h-12 min-w-12 motion-reduce:transition-none ${copySuccess ? "text-primary" : ""} ${isCopying ? "motion-safe:[&_svg]:animate-spin" : ""}`}
            />
            <IconButton
                onClick={handleSave}
                disabled={isSaving || isCopying}
                icon={isSaving ? mdRefresh : saveSuccess ? mdCheck : mdDownload}
                label={saveLabel}
                aria-busy={isSaving}
                className={`min-h-12 min-w-12 motion-reduce:transition-none ${saveSuccess ? "text-primary" : ""} ${isSaving ? "motion-safe:[&_svg]:animate-spin" : ""}`}
            />
            <span className="sr-only" role="status" aria-live="polite">
                {isCopying || copySuccess ? copyLabel : isSaving || saveSuccess ? saveLabel : ""}
            </span>
        </>
    );

    return { headerActions, errorMessage };
}
