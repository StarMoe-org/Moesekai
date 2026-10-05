"use client";

interface RankChangeBadgeProps {
    rankDelta: number;
    isNewEntry?: boolean;
    /** When initial churn data already exists, show normal movement instead of NEW. */
    hasChurnData?: boolean;
}

export default function RankChangeBadge({ rankDelta, isNewEntry = false, hasChurnData = false }: RankChangeBadgeProps) {
    // Show NEW only on first load when churn data is unavailable.
    if (isNewEntry && !hasChurnData) {
        return (
            <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-sky-100 px-1 py-0.5 type-label-s text-sky-700">
                <span>✨</span>
                NEW
            </span>
        );
    }

    if (rankDelta > 0) {
        return (
            <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-emerald-100 px-1 py-0.5 type-label-s text-emerald-700">
                ↑{rankDelta}
            </span>
        );
    }

    if (rankDelta < 0) {
        return (
            <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-rose-100 px-1 py-0.5 type-label-s text-rose-700">
                ↓{Math.abs(rankDelta)}
            </span>
        );
    }

    return <span className="inline-flex rounded-md3-xs bg-surface-container px-1 py-0.5 text-[9px] font-medium text-on-surface-variant">—</span>;
}
