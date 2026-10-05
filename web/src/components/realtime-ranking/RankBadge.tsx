"use client";

import { useI18n } from "@/contexts/I18nContext";

// Ranks from here on are tier lines (T10000, T100000, ...), always round
// numbers, so the locale's compact label (e.g. "#100K") loses nothing and keeps
// the badge inside the narrow rank column. The exact rank stays in the tooltip.
const COMPACT_RANK_FROM = 10_000;

interface RankBadgeProps {
    rank: number;
    /** Border / background / text colour classes for the badge. */
    toneClassName: string;
}

export default function RankBadge({ rank, toneClassName }: RankBadgeProps) {
    const { locale } = useI18n();
    const isCompact = rank >= COMPACT_RANK_FROM;
    const label = isCompact
        ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(rank)
        : String(rank);
    const fullLabel = isCompact ? `#${new Intl.NumberFormat(locale).format(rank)}` : undefined;

    return (
        <span
            title={fullLabel}
            aria-label={fullLabel}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md3-xs border px-1 py-0.5 type-label-s leading-none tabular-nums sm:px-1.5 sm:type-label-m ${toneClassName}`}
        >
            #{label}
        </span>
    );
}
