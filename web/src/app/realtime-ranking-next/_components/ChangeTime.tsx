"use client";

import { useI18n } from "@/contexts/I18nContext";
import { useSharedNow } from "../_lib/useSharedNow";

interface ChangeTimeProps {
    /** Epoch ms of the change being labelled; null/undefined renders nothing. */
    changedAt: number | null | undefined;
    className?: string;
}

/**
 * Live relative-time label for the most recent score change, e.g. "刚刚" / "5秒前".
 * Leaf component on the shared 1s clock so re-renders stay isolated and cheap.
 */
export default function ChangeTime({ changedAt, className }: ChangeTimeProps) {
    const { t } = useI18n();
    const now = useSharedNow();

    if (!changedAt) return null;

    const sec = Math.max(0, Math.floor((now - changedAt) / 1000));
    const rel = sec < 5
        ? t("page.realtimeRankingNext.detail.feed.justNow")
        : sec < 60
            ? t("page.realtimeRankingNext.detail.feed.secondsAgo", { seconds: sec })
            : sec < 3600
                ? t("page.realtimeRankingNext.detail.feed.minutesAgo", { minutes: Math.floor(sec / 60) })
                : t("page.realtimeRankingNext.detail.feed.hoursAgo", { hours: Math.floor(sec / 3600) });

    return (
        <span className={className ?? "text-[9px] font-medium text-on-surface-variant tabular-nums"}>
            {rel}
        </span>
    );
}
