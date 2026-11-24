"use client";

import React, { useCallback, useEffect, useState } from "react";
import ExternalLink from "@/components/ExternalLink";
import { Button, Dialog, Icon, Surface, buttonClassName } from "@/components/md3";
import {
    mdCheckCircle,
    mdDesktopWindows,
    mdDownload,
    mdHistory,
    mdOpenInNew,
    mdWandShine,
    mdWandStars,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import {
    dismissDesktopGuide,
    shouldAutoOpenDesktopGuide,
} from "@/lib/story-desktop-guide";
import {
    STORY_STUDIO_DESKTOP_NAME,
    STORY_STUDIO_DESKTOP_URL,
} from "@/lib/story-maker-fork";

const AUTO_OPEN_DELAY_MS = 220;

interface DesktopFeatureItem {
    id: string;
    icon: string;
    iconContainerClass: string;
    titleKey: string;
    descKey: string;
}

const DESKTOP_FEATURES: readonly DesktopFeatureItem[] = [
    {
        id: "agent",
        icon: mdWandShine,
        iconContainerClass: "bg-primary-container text-on-primary-container",
        titleKey: "page.storyMaker.desktopGuide.features.agentTitle",
        descKey: "page.storyMaker.desktopGuide.features.agentDesc",
    },
    {
        id: "snapshot",
        icon: mdHistory,
        iconContainerClass: "bg-secondary-container text-on-secondary-container",
        titleKey: "page.storyMaker.desktopGuide.features.snapshotTitle",
        descKey: "page.storyMaker.desktopGuide.features.snapshotDesc",
    },
    {
        id: "desktop",
        icon: mdDesktopWindows,
        iconContainerClass: "bg-tertiary-container text-on-tertiary-container",
        titleKey: "page.storyMaker.desktopGuide.features.desktopTitle",
        descKey: "page.storyMaker.desktopGuide.features.desktopDesc",
    },
];

export interface UseStoryDesktopGuideResult {
    isOpen: boolean;
    openGuide: () => void;
    closeGuide: (permanent?: boolean) => void;
}

/**
 * Manages auto-opening the Desktop Studio & MoeSekai Agent guide on entering
 * Web Story Maker routes, while respecting session and permanent dismissals.
 */
export function useStoryDesktopGuide(): UseStoryDesktopGuideResult {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!shouldAutoOpenDesktopGuide()) return;
        const timer = window.setTimeout(() => {
            if (shouldAutoOpenDesktopGuide()) {
                setIsOpen(true);
            }
        }, AUTO_OPEN_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, []);

    const openGuide = useCallback(() => {
        setIsOpen(true);
    }, []);

    const closeGuide = useCallback((permanent = false) => {
        dismissDesktopGuide(permanent);
        setIsOpen(false);
    }, []);

    return {
        isOpen,
        openGuide,
        closeGuide,
    };
}

export interface StoryDesktopGuideDialogProps {
    isOpen: boolean;
    onClose: (permanent?: boolean) => void;
}

export function StoryDesktopGuideDialog({
    isOpen,
    onClose,
}: StoryDesktopGuideDialogProps) {
    const { t } = useI18n();

    const handleCloseSession = () => onClose(false);
    const handleDismissForever = () => onClose(true);

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleCloseSession}
            title={t("page.storyMaker.desktopGuide.dialogTitle")}
            size="md"
            showClose
            syncHistory={false}
            className="max-w-[560px]"
            bodyClassName="space-y-4 pt-3 pb-4"
            actions={
                <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-outline-variant/60 pt-4">
                    <Button
                        variant="text"
                        size="s"
                        onClick={handleDismissForever}
                    >
                        {t("page.storyMaker.desktopGuide.dontShowAgain")}
                    </Button>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                            variant="outlined"
                            size="s"
                            onClick={handleCloseSession}
                        >
                            {t("page.storyMaker.desktopGuide.continueWeb")}
                        </Button>
                        <ExternalLink
                            href={STORY_STUDIO_DESKTOP_URL}
                            onClick={handleCloseSession}
                            className={buttonClassName({ variant: "filled", size: "s" })}
                        >
                            <Icon path={mdDownload} size={18} />
                            <span>{t("page.storyMaker.desktopGuide.downloadDesktop")}</span>
                            <Icon path={mdOpenInNew} size={16} />
                        </ExternalLink>
                    </div>
                </div>
            }
        >
            {/* Hero highlight card */}
            <section className="rounded-md3-lg border border-primary/25 bg-primary-container/50 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 type-label-m text-on-primary">
                        <Icon path={mdWandStars} size={15} />
                        <span>{t("page.storyMaker.desktopGuide.badge")}</span>
                    </span>
                    <span className="inline-flex items-center rounded-full bg-surface-container-high px-2.5 py-0.5 type-label-s text-on-surface-variant">
                        {t("page.storyMaker.desktopGuide.platformsBadge")}
                    </span>
                </div>
                <h3 className="mt-3 type-title-l text-on-surface">
                    {t("page.storyMaker.desktopGuide.heroTitle")}
                </h3>
                <p className="mt-1.5 type-body-m text-on-surface-variant">
                    {t("page.storyMaker.desktopGuide.heroDesc", {
                        name: STORY_STUDIO_DESKTOP_NAME,
                    })}
                </p>
            </section>

            {/* Key desktop + Agent capabilities */}
            <div className="space-y-2.5">
                {DESKTOP_FEATURES.map((feature) => (
                    <Surface
                        key={feature.id}
                        tone="low"
                        radius="lg"
                        className="flex items-start gap-3.5 border border-outline-variant/65 p-3.5"
                    >
                        <span
                            className={`flex size-10 shrink-0 items-center justify-center rounded-md3-md ${feature.iconContainerClass}`}
                            aria-hidden="true"
                        >
                            <Icon path={feature.icon} size={20} />
                        </span>
                        <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="type-title-s text-on-surface">
                                {t(feature.titleKey)}
                            </p>
                            <p className="type-body-s text-on-surface-variant">
                                {t(feature.descKey)}
                            </p>
                        </div>
                    </Surface>
                ))}
            </div>

            {/* Free / open-source & web interoperability note */}
            <div className="flex items-start gap-2 rounded-md3-md bg-surface-container px-3.5 py-2.5 type-body-s text-on-surface-variant">
                <Icon path={mdCheckCircle} size={16} className="mt-0.5 shrink-0 text-primary" />
                <span>{t("page.storyMaker.desktopGuide.freeNote")}</span>
            </div>
        </Dialog>
    );
}

export default StoryDesktopGuideDialog;
