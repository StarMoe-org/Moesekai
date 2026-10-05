"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@/components/common/Modal";
import { useI18n } from "@/contexts/I18nContext";
import { copyImageFromUrl, saveImageFromUrl } from "@/lib/imageActions";
import { Banner, CircularProgress, IconButton } from "@/components/md3";
import { mdCheck, mdContentCopy, mdDownload } from "@/components/md3/icons";

interface ImagePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    imageUrl: string;
    alt: string;
    fileName: string;
    size?: "sm" | "md" | "lg" | "xl";
}

export default function ImagePreviewModal({
    isOpen,
    onClose,
    title,
    imageUrl,
    alt,
    fileName,
    size = "xl",
}: ImagePreviewModalProps) {
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
            setErrorMessage(t("common.imageActions.copyFailedUseSave"));
        } finally {
            setIsCopying(false);
        }
    }, [imageUrl, t]);

    const handleSave = useCallback(async () => {
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
            setErrorMessage(t("common.imageActions.saveFailed"));
        } finally {
            setIsSaving(false);
        }
    }, [fileName, imageUrl, t]);

    const copyIcon = copySuccess && !isCopying ? mdCheck : mdContentCopy;
    const saveIcon = saveSuccess && !isSaving ? mdCheck : mdDownload;

    const headerActions = (
        <>
            {isCopying ? (
                <span className="inline-flex h-10 w-10 items-center justify-center" aria-label={t("common.imageActions.copying")}>
                    <CircularProgress size={20} strokeWidth={2} />
                </span>
            ) : (
                <IconButton
                    icon={copyIcon}
                    onClick={handleCopy}
                    disabled={isSaving}
                    label={t("common.imageActions.copyImage")}
                    title={copySuccess ? t("common.imageActions.copySuccess") : t("common.imageActions.copyImage")}
                    className={copySuccess ? "text-primary" : undefined}
                />
            )}
            {isSaving ? (
                <span className="inline-flex h-10 w-10 items-center justify-center" aria-label={t("common.imageActions.saving")}>
                    <CircularProgress size={20} strokeWidth={2} />
                </span>
            ) : (
                <IconButton
                    icon={saveIcon}
                    onClick={handleSave}
                    disabled={isCopying}
                    label={t("common.imageActions.saveImage")}
                    title={saveSuccess ? t("common.imageActions.saveSuccess") : t("common.imageActions.saveImage")}
                    className={saveSuccess ? "text-primary" : undefined}
                />
            )}
        </>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size={size}
            headerActions={headerActions}
        >
            <div className="space-y-3">
                {saveClickCount >= 2 && (
                    <Banner tone="info">
                        {t("common.imageActions.downloadHintPrefix")}<strong className="type-emphasized">{t("common.imageActions.downloadHintAction")}</strong>{t("common.imageActions.downloadHintSuffix")}
                        <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer" className="ml-1 underline">Chrome</a>
                        <span className="mx-0.5">/</span>
                        <a href="https://www.firefox.com/" target="_blank" rel="noopener noreferrer" className="underline">Firefox</a>
                    </Banner>
                )}

                {errorMessage && <Banner tone="error">{errorMessage}</Banner>}

                <div className="rounded-md3-lg bg-surface-container p-3 sm:p-4">
                    <div className="flex max-h-[65vh] items-center justify-center overflow-auto">
                        <img
                            src={imageUrl}
                            alt={alt}
                            className="max-h-[60vh] max-w-full object-contain"
                        />
                    </div>
                </div>
            </div>
        </Modal>
    );
}
