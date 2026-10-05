"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { IconButton } from "@/components/md3/Button";
import { mdCheck, mdContentCopy, mdDownload, mdRefresh } from "@/components/md3/icons";
import { copyImageFromUrl, saveImageFromUrl } from "@/lib/imageActions";

interface UseImageUrlActionsOptions {
    isOpen: boolean;
    imageUrl: string;
    fileName: string;
}

/**
 * Hook for copy / download actions on a URL-based image.
 * Returns `headerActions` (React element) that can be passed straight to
 * `<Modal headerActions={…} />`, exactly like `useSvgPreviewActions` does
 * for SVG-based previews.
 */
export function useImageUrlActions({
    isOpen,
    imageUrl,
    fileName,
}: UseImageUrlActionsOptions) {
    const { t } = useI18n();
    const [isCopying, setIsCopying] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [saveClickCount, setSaveClickCount] = useState(0);
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
            setSaveClickCount(0);
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

    const handleCopy = useCallback(async () => {
        if (!imageUrl) {
            setErrorMessage(t("common.imageActions.imageUnavailable"));
            return;
        }

        setIsCopying(true);
        setErrorMessage(null);
        setCopySuccess(false);

        try {
            await copyImageFromUrl(imageUrl);
            setCopySuccess(true);
            if (copyResetTimerRef.current) {
                window.clearTimeout(copyResetTimerRef.current);
            }
            copyResetTimerRef.current = window.setTimeout(() => {
                setCopySuccess(false);
            }, 1800);
        } catch {
            setErrorMessage(t("common.imageActions.copyFailedUseDownload"));
        } finally {
            setIsCopying(false);
        }
    }, [imageUrl, t]);

    const handleSave = useCallback(async () => {
        if (!imageUrl) {
            setErrorMessage(t("common.imageActions.imageUnavailable"));
            return;
        }

        setIsSaving(true);
        setErrorMessage(null);
        setSaveSuccess(false);
        setSaveClickCount((prev) => prev + 1);

        try {
            await saveImageFromUrl(imageUrl, fileName);
            setSaveSuccess(true);
            if (saveResetTimerRef.current) {
                window.clearTimeout(saveResetTimerRef.current);
            }
            saveResetTimerRef.current = window.setTimeout(() => {
                setSaveSuccess(false);
            }, 1800);
        } catch {
            setErrorMessage(t("common.imageActions.downloadFailed"));
        } finally {
            setIsSaving(false);
        }
    }, [fileName, imageUrl, t]);

    const copyLabel = isCopying ? t("common.imageActions.copying") : copySuccess ? t("common.imageActions.copySuccess") : t("common.imageActions.copyImage");
    const saveLabel = isSaving ? t("common.imageActions.downloading") : saveSuccess ? t("common.imageActions.downloadSuccess") : t("common.imageActions.downloadImage");
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

    return { headerActions, errorMessage, saveClickCount };
}
