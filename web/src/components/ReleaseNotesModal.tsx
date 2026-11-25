"use client";

import React, { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { MOE_LOGO_URL } from "@/lib/assets";
import { STORY_STUDIO_DESKTOP_URL } from "@/lib/story-maker-fork";
import ExternalLink from "@/components/ExternalLink";
import { Button, Dialog, Icon, buttonClassName, cn } from "@/components/md3";
import {
    mdArrowForward,
    mdBolt,
    mdChatBubble,
    mdCheck,
    mdCheckCircle,
    mdDownload,
    mdForum,
    mdMovieEdit,
    mdOpenInNew,
    mdRefresh,
    mdSettings,
    mdTheaters,
    mdWandStars,
} from "@/components/md3/icons";

export const RELEASE_NOTES_VERSION = "2.2";
export const RELEASE_NOTES_STORAGE_KEY = "moesekai_release_notes_seen_v2_2";

export function hasSeenReleaseNotes(): boolean {
    try {
        return localStorage.getItem(RELEASE_NOTES_STORAGE_KEY) === "1";
    } catch {
        return true;
    }
}

export function markReleaseNotesSeen(): void {
    try {
        localStorage.setItem(RELEASE_NOTES_STORAGE_KEY, "1");
    } catch {
        // Storage unavailable; ignore persistence errors.
    }
}

interface FeatureAction {
    labelKey: string;
    href: string;
    variant: "tonal" | "outlined";
    icon?: string;
    external?: boolean;
}

interface FlagshipFeature {
    id: string;
    icon: string;
    tagKey: string;
    titleKey: string;
    descriptionKey: string;
    bulletKeys: readonly string[];
    screenshotSrc: string;
    screenshotAspectClass: string;
    screenshotPositionClass: string;
    imageAltKey: string;
    primaryHref: string;
    actions: readonly FeatureAction[];
}

const FLAGSHIP_FEATURES: readonly FlagshipFeature[] = [
    {
        id: "story-maker",
        icon: mdMovieEdit,
        tagKey: "common.releaseNotes.v2_2.storyMaker.tag",
        titleKey: "common.releaseNotes.v2_2.storyMaker.title",
        descriptionKey: "common.releaseNotes.v2_2.storyMaker.description",
        bulletKeys: [
            "common.releaseNotes.v2_2.storyMaker.bulletAi",
            "common.releaseNotes.v2_2.storyMaker.bulletStudio",
            "common.releaseNotes.v2_2.storyMaker.bulletPublish",
        ],
        screenshotSrc: "/images/releases/v2.2/shot-story-maker.png",
        screenshotAspectClass: "aspect-[16/10]",
        screenshotPositionClass: "object-top",
        imageAltKey: "common.releaseNotes.v2_2.storyMaker.imageAlt",
        primaryHref: "/story-maker",
        actions: [
            {
                labelKey: "common.releaseNotes.v2_2.storyMaker.actionWeb",
                href: "/story-maker",
                variant: "tonal",
            },
            {
                labelKey: "common.releaseNotes.v2_2.storyMaker.actionDesktop",
                href: STORY_STUDIO_DESKTOP_URL,
                variant: "outlined",
                icon: mdDownload,
                external: true,
            },
        ],
    },
    {
        id: "community",
        icon: mdForum,
        tagKey: "common.releaseNotes.v2_2.community.tag",
        titleKey: "common.releaseNotes.v2_2.community.title",
        descriptionKey: "common.releaseNotes.v2_2.community.description",
        bulletKeys: [
            "common.releaseNotes.v2_2.community.bulletSquare",
            "common.releaseNotes.v2_2.community.bulletRich",
            "common.releaseNotes.v2_2.community.bulletStories",
        ],
        screenshotSrc: "/images/releases/v2.2/shot-community.png",
        screenshotAspectClass: "aspect-[16/10]",
        screenshotPositionClass: "object-top",
        imageAltKey: "common.releaseNotes.v2_2.community.imageAlt",
        primaryHref: "/community",
        actions: [
            {
                labelKey: "common.releaseNotes.v2_2.community.actionSquare",
                href: "/community",
                variant: "tonal",
            },
            {
                labelKey: "common.releaseNotes.v2_2.community.actionStories",
                href: "/community/stories",
                variant: "outlined",
                icon: mdTheaters,
            },
        ],
    },
    {
        id: "comments",
        icon: mdChatBubble,
        tagKey: "common.releaseNotes.v2_2.comments.tag",
        titleKey: "common.releaseNotes.v2_2.comments.title",
        descriptionKey: "common.releaseNotes.v2_2.comments.description",
        bulletKeys: [
            "common.releaseNotes.v2_2.comments.bulletCoverage",
            "common.releaseNotes.v2_2.comments.bulletInteract",
            "common.releaseNotes.v2_2.comments.bulletNotify",
        ],
        screenshotSrc: "/images/releases/v2.2/shot-comments.png",
        screenshotAspectClass: "aspect-[16/10]",
        screenshotPositionClass: "object-top",
        imageAltKey: "common.releaseNotes.v2_2.comments.imageAlt",
        primaryHref: "/cards",
        actions: [
            {
                labelKey: "common.releaseNotes.v2_2.comments.actionCards",
                href: "/cards",
                variant: "tonal",
            },
            {
                labelKey: "common.releaseNotes.v2_2.comments.actionMusic",
                href: "/music",
                variant: "outlined",
            },
        ],
    },
];

const MISC_UPDATES = [
    {
        id: "passport",
        titleKey: "common.releaseNotes.v2_2.misc.passportTitle",
        descKey: "common.releaseNotes.v2_2.misc.passportDesc",
        featured: true,
    },
    {
        id: "masterdata-diff",
        titleKey: "common.releaseNotes.v2_2.misc.masterdataDiffTitle",
        descKey: "common.releaseNotes.v2_2.misc.masterdataDiffDesc",
        featured: false,
    },
    {
        id: "live2d-honors",
        titleKey: "common.releaseNotes.v2_2.misc.live2dHonorsTitle",
        descKey: "common.releaseNotes.v2_2.misc.live2dHonorsDesc",
        featured: false,
    },
    {
        id: "polish",
        titleKey: "common.releaseNotes.v2_2.misc.polishTitle",
        descKey: "common.releaseNotes.v2_2.misc.polishDesc",
        featured: false,
    },
] as const;

export interface ReleaseNotesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (href: string) => void;
    onOpenAssetLineSettings: () => void;
}

function ScreenshotPreview({
    src,
    alt,
    aspectClass,
    positionClass,
    onClick,
}: {
    src: string;
    alt: string;
    aspectClass: string;
    positionClass: string;
    onClick: () => void;
}) {
    const [failed, setFailed] = useState(false);

    if (failed) return null;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={alt}
            className={cn(
                "focus-ring group relative block w-full cursor-pointer overflow-hidden border-b border-outline-variant/60 bg-surface-container-low text-left",
                aspectClass,
            )}
        >
            <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                onError={() => setFailed(true)}
                className={cn(
                    "h-full w-full object-cover transition-transform duration-300 ease-md3-standard group-hover:scale-[1.015]",
                    positionClass,
                )}
            />
        </button>
    );
}

export default function ReleaseNotesModal({
    isOpen,
    onClose,
    onNavigate,
    onOpenAssetLineSettings,
}: ReleaseNotesModalProps) {
    const { t } = useI18n();
    const { assetSource, setAssetSource } = useTheme();
    const isUsingBackupLine = assetSource.startsWith("backup");
    const currentLineLabel = t(isUsingBackupLine ? "settings.assetSource.backup" : "settings.assetSource.main");

    const handleSwitchToBackupLine = () => {
        markReleaseNotesSeen();
        setAssetSource("backup");
        onClose();
        window.setTimeout(() => {
            const url = new URL(window.location.href);
            url.searchParams.set("_refresh", Date.now().toString());
            window.location.href = url.toString();
        }, 120);
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("common.releaseNotes.v2_2.dialogTitle")}
            size="lg"
            fullscreenOnMobile
            showClose
            syncHistory={false}
            className="max-w-[780px]"
            bodyClassName="space-y-5 pt-3 pb-4"
            actions={
                <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-outline-variant/60 pt-4">
                    <Button
                        variant="text"
                        size="s"
                        onClick={() => onNavigate("/changelog")}
                    >
                        {t("common.releaseNotes.v2_2.fullChangelog")}
                    </Button>
                    <Button
                        variant="filled"
                        size="s"
                        trailingIcon={mdArrowForward}
                        onClick={onClose}
                    >
                        {t("common.releaseNotes.v2_2.startExploring")}
                    </Button>
                </div>
            }
        >
            {/* Hero banner */}
            <section className="rounded-md3-lg border border-outline-variant/60 bg-primary-container/55 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span
                            className="block h-7 w-[4.75rem] shrink-0 bg-primary"
                            style={{
                                maskImage: `url(${MOE_LOGO_URL})`,
                                maskSize: "contain",
                                maskPosition: "left center",
                                maskRepeat: "no-repeat",
                                WebkitMaskImage: `url(${MOE_LOGO_URL})`,
                                WebkitMaskSize: "contain",
                                WebkitMaskPosition: "left center",
                                WebkitMaskRepeat: "no-repeat",
                            }}
                            role="img"
                            aria-label="MoeSekai"
                        />
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 type-label-m text-on-primary">
                            <Icon path={mdWandStars} size={15} />
                            {t("common.releaseNotes.v2_2.badge")}
                        </span>
                    </div>
                </div>
                <h3 className="mt-3 type-headline-s text-on-surface">
                    {t("common.releaseNotes.v2_2.heroTitle")}
                </h3>
                <p className="mt-1.5 type-body-m text-on-surface-variant">
                    {t("common.releaseNotes.v2_2.heroSubtitle")}
                </p>
            </section>

            {/* Flagship features (1-3) */}
            <div className="space-y-4">
                {FLAGSHIP_FEATURES.map((feature) => (
                    <article
                        key={feature.id}
                        className="overflow-hidden rounded-md3-lg border border-outline-variant/70 bg-surface-container"
                    >
                        <ScreenshotPreview
                            src={feature.screenshotSrc}
                            alt={t(feature.imageAltKey)}
                            aspectClass={feature.screenshotAspectClass}
                            positionClass={feature.screenshotPositionClass}
                            onClick={() => onNavigate(feature.primaryHref)}
                        />
                        <div className="space-y-3 p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md3-md bg-secondary-container text-on-secondary-container">
                                        <Icon path={feature.icon} size={20} />
                                    </span>
                                    <h3 className="type-title-m text-on-surface">
                                        {t(feature.titleKey)}
                                    </h3>
                                </div>
                                <span className="inline-flex shrink-0 items-center rounded-full bg-tertiary-container px-2.5 py-0.5 type-label-s text-on-tertiary-container">
                                    {t(feature.tagKey)}
                                </span>
                            </div>

                            <p className="type-body-m text-on-surface-variant">
                                {t(feature.descriptionKey)}
                            </p>

                            <ul className="space-y-1.5">
                                {feature.bulletKeys.map((bulletKey) => (
                                    <li key={bulletKey} className="flex items-start gap-2 type-body-s text-on-surface">
                                        <Icon path={mdCheck} size={16} className="mt-0.5 shrink-0 text-primary" />
                                        <span>{t(bulletKey)}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                {feature.actions.map((action) => (
                                    action.external ? (
                                        <ExternalLink
                                            key={action.href}
                                            href={action.href}
                                            onClick={onClose}
                                            className={buttonClassName({ variant: action.variant, size: "xs" })}
                                        >
                                            {action.icon && <Icon path={action.icon} size={18} />}
                                            <span>{t(action.labelKey)}</span>
                                            <Icon path={mdOpenInNew} size={16} />
                                        </ExternalLink>
                                    ) : (
                                        <Button
                                            key={action.href}
                                            variant={action.variant}
                                            size="xs"
                                            icon={action.icon}
                                            trailingIcon={mdArrowForward}
                                            onClick={() => onNavigate(action.href)}
                                        >
                                            {t(action.labelKey)}
                                        </Button>
                                    )
                                ))}
                            </div>
                        </div>
                    </article>
                ))}
            </div>

            {/* Misc & QoL improvements (4) */}
            <section className="space-y-3 rounded-md3-lg border border-outline-variant/70 bg-surface-container p-4 sm:p-5">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md3-md bg-primary-container text-on-primary-container">
                        <Icon path={mdBolt} size={20} />
                    </span>
                    <h3 className="type-title-m text-on-surface">
                        {t("common.releaseNotes.v2_2.misc.title")}
                    </h3>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {MISC_UPDATES.map((item) => (
                        <div
                            key={item.id}
                            className={cn(
                                "rounded-md3-md border p-3.5",
                                item.featured
                                    ? "border-primary/40 bg-primary-container/35"
                                    : "border-outline-variant/60 bg-surface-container-low",
                            )}
                        >
                            <div className="type-title-s text-on-surface">
                                {t(item.titleKey)}
                            </div>
                            <p className="mt-1 type-body-s text-on-surface-variant">
                                {t(item.descKey)}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Friendly resource line tip (5) */}
            <section className="space-y-3 rounded-md3-lg border border-outline-variant/70 bg-secondary-container/45 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md3-md bg-secondary text-on-secondary">
                            <Icon path={mdSettings} size={20} />
                        </span>
                        <h3 className="type-title-m text-on-surface">
                            {t("common.releaseNotes.v2_2.networkTip.title")}
                        </h3>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-0.5 type-label-s text-on-surface-variant">
                        {t("common.releaseNotes.v2_2.networkTip.currentLineLabel", { line: currentLineLabel })}
                    </span>
                </div>

                <p className="type-body-m text-on-surface-variant">
                    {t("common.releaseNotes.v2_2.networkTip.description")}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {isUsingBackupLine ? (
                        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary-container px-3 type-label-m text-on-primary-container">
                            <Icon path={mdCheckCircle} size={16} />
                            {t("common.releaseNotes.v2_2.networkTip.alreadyBackup")}
                        </span>
                    ) : (
                        <Button
                            variant="filled"
                            size="xs"
                            icon={mdRefresh}
                            onClick={handleSwitchToBackupLine}
                        >
                            {t("common.releaseNotes.v2_2.networkTip.switchToBackup")}
                        </Button>
                    )}
                    <Button
                        variant="outlined"
                        size="xs"
                        icon={mdSettings}
                        onClick={onOpenAssetLineSettings}
                    >
                        {t("common.releaseNotes.v2_2.networkTip.openSettings")}
                    </Button>
                </div>
            </section>
        </Dialog>
    );
}
