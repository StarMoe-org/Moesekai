"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Button, Dialog } from "@/components/md3";

export const ASSET_TOS_STORAGE_KEY = "asset-viewer-tos-agreed";

/**
 * Shared Terms-of-Service gate for asset-related pages (asset browser,
 * asset version changelog). Agreement is stored once under a common
 * localStorage key so users only have to accept it a single time.
 */
export default function AssetTosModal({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useI18n();
    const [tosCountdown, setTosCountdown] = useState(10);
    const [hasAgreed, setHasAgreed] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Load agreement status on mount; force the modal open for new users
    useEffect(() => {
        setMounted(true);
        if (typeof window === "undefined") return;
        const agreed = localStorage.getItem(ASSET_TOS_STORAGE_KEY);
        if (agreed === "true") {
            setHasAgreed(true);
        } else {
            onOpenChange(true);
        }
        // Only run once on mount: onOpenChange is expected to be a state setter
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Countdown timer while the modal is open and not yet agreed
    useEffect(() => {
        if (!open) return;
        if (hasAgreed) {
            setTosCountdown(0);
            return;
        }
        setTosCountdown(10);
        const timer = setInterval(() => {
            setTosCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [open, hasAgreed]);

    const handleAgree = useCallback(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem(ASSET_TOS_STORAGE_KEY, "true");
        }
        setHasAgreed(true);
        onOpenChange(false);
    }, [onOpenChange]);

    if (!mounted) return null;

    return (
        <Dialog
            isOpen={open}
            onClose={() => onOpenChange(false)}
            title={t("page.assetViewer.tos.title")}
            size="md"
            syncHistory={false}
            dismissible={hasAgreed}
            showClose={hasAgreed}
            className="select-none"
            actions={
                hasAgreed ? (
                    <Button variant="tonal" onClick={() => onOpenChange(false)}>
                        {t("common.action.close")}
                    </Button>
                ) : (
                    <Button variant="filled" disabled={tosCountdown > 0} onClick={handleAgree}>
                        {tosCountdown > 0
                            ? `${t("page.assetViewer.tos.agree")} (${tosCountdown}s)`
                            : t("page.assetViewer.tos.agree")}
                    </Button>
                )
            }
        >
            <div className="space-y-4 type-body-m text-on-surface-variant">
                <p className="type-title-s text-on-surface">{t("page.assetViewer.tos.welcome")}</p>
                {([1, 2, 3, 4, 5] as const).map((sec) => (
                    <section key={sec}>
                        <h3 className="flex items-center gap-1.5 type-title-s text-on-surface">
                            <span className="text-primary">{sec}.</span> {t(`page.assetViewer.tos.sec${sec}Title`)}
                        </h3>
                        <p className="mt-0.5 pl-4">{t(`page.assetViewer.tos.sec${sec}Content`)}</p>
                    </section>
                ))}
            </div>
        </Dialog>
    );
}
