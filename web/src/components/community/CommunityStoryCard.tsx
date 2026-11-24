"use client";

import React from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Button, Icon, cn } from "@/components/md3";
import {
    mdChatBubble,
    mdMovie,
    mdPlayArrowFill,
    mdRecordVoiceOver,
    mdTranslate,
} from "@/components/md3/icons";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { SUPPORTED_UI_LOCALES, UI_LOCALE_LABELS, type UiLocale } from "@/lib/i18n/locales";
import type { CommunityStorySummary, StoryVoiceStatus } from "@/types/community";

interface CommunityStoryCardProps {
    postId: number;
    summary: CommunityStorySummary;
    /** Show owner/moderator processing status badge when voice track isn't published yet. */
    showPendingVoiceStatus?: boolean;
    compact?: boolean;
    extraActions?: React.ReactNode;
    className?: string;
}

function formatLocaleChip(raw: string): string {
    if ((SUPPORTED_UI_LOCALES as readonly string[]).includes(raw)) {
        return UI_LOCALE_LABELS[raw as UiLocale];
    }
    return raw;
}

function voiceStatusKey(status: StoryVoiceStatus): string | null {
    switch (status) {
        case "uploading":
        case "queued":
        case "processing":
            return "page.community.storyCard.voiceStatus.queued";
        case "pending_review":
            return "page.community.storyCard.voiceStatus.pendingReview";
        case "rejected":
            return "page.community.storyCard.voiceStatus.rejected";
        case "published":
            return "page.community.storyCard.voiceBadge";
        default:
            return null;
    }
}

export function CommunityStoryCard({
    postId,
    summary,
    showPendingVoiceStatus = false,
    compact = false,
    extraActions,
    className,
}: CommunityStoryCardProps) {
    const { t } = useI18n();
    const regionKey = SERVER_LABEL_KEYS[summary.region as keyof typeof SERVER_LABEL_KEYS];
    const regionLabel = regionKey ? t(regionKey) : summary.region.toUpperCase();
    const locales = summary.available_locales.length > 0
        ? summary.available_locales
        : summary.source_locale
            ? [summary.source_locale]
            : [];
    const localeLabel = locales.map(formatLocaleChip).join(" / ");
    const pendingKey = showPendingVoiceStatus && summary.voice_status !== "published"
        ? voiceStatusKey(summary.voice_status)
        : null;

    return (
        <div
            className={cn(
                "flex flex-col justify-between gap-3 rounded-md3-lg border border-primary/25 bg-surface-container-high/60 sm:flex-row sm:items-center",
                compact ? "p-3" : "p-4",
                className,
            )}
        >
            <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md3-xs bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container">
                        <Icon path={mdMovie} size={13} />
                        <span>{t("page.community.storyCard.playableBadge")}</span>
                    </span>
                    <span className="rounded-md3-xs border border-outline-variant bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant">
                        {regionLabel}
                    </span>
                    {summary.has_voice_track && (
                        <span className="inline-flex items-center gap-1 rounded-md3-xs bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                            <Icon path={mdRecordVoiceOver} size={13} />
                            <span>{t("page.community.storyCard.voiceBadge")}</span>
                        </span>
                    )}
                    {pendingKey && (
                        <span
                            className={cn(
                                "inline-flex items-center gap-1 rounded-md3-xs px-2 py-0.5 type-label-s",
                                summary.voice_status === "rejected"
                                    ? "bg-error-container text-on-error-container"
                                    : "bg-warning-container text-on-warning-container",
                            )}
                        >
                            <Icon path={mdRecordVoiceOver} size={13} />
                            <span>{t(pendingKey)}</span>
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-s text-on-surface-variant">
                    <span className="inline-flex items-center gap-1">
                        <Icon path={mdChatBubble} size={14} className="shrink-0" />
                        <span>{t("page.community.storyCard.beatCount", { count: summary.beat_count })}</span>
                    </span>
                    {localeLabel && (
                        <span className="inline-flex items-center gap-1">
                            <Icon path={mdTranslate} size={14} className="shrink-0" />
                            <span className="truncate">{localeLabel}</span>
                        </span>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-center">
                <Button
                    variant="filled"
                    size={compact ? "s" : "m"}
                    icon={mdPlayArrowFill}
                    href={`/story-maker/play?postId=${postId}`}
                >
                    {t("page.community.storyCard.playNow")}
                </Button>
                {extraActions}
            </div>
        </div>
    );
}

export default CommunityStoryCard;
