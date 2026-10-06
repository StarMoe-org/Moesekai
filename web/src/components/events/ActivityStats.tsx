"use client";
import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { TierKLine } from '@/types/prediction';

interface ActivityStatsProps {
    tiers: TierKLine[];
}

interface StatBlockProps {
    title: string;
    data: TierKLine[];
    type: 'active' | 'slacking';
}

function StatBlock({ title, data, type }: StatBlockProps) {
    const { t, formatNumber } = useI18n();

    return (
        <div className="bg-surface-card border border-outline-variant/70 text-on-surface rounded-md3-xl p-3 sm:p-4 flex-1 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <h3 className="type-title-s text-on-surface">{title}</h3>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {data.map((tier) => {
                    const index = tier.CurrentIndex == null ? '—' : formatNumber(tier.CurrentIndex);
                    return (
                    <div key={tier.Rank} className={`p-2 sm:p-3 rounded-md3-md text-center border ${type === 'active' ? 'bg-error-container/40 border-error-container' : 'bg-surface-container border-outline-variant'}`}>
                        <div className="type-label-s text-on-surface-variant mb-1">{t("page.prediction.activityStats.rank", { rank: tier.Rank })}</div>
                        <div className="type-title-s sm:type-title-m text-on-surface tabular-nums leading-tight mb-1 truncate" title={index}>
                            {index}
                        </div>

                        <div className={`type-label-m ${tier.ChangePct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {tier.ChangePct > 0 ? '+' : ''}{tier.ChangePct.toFixed(1)}%
                        </div>
                        <div className="type-label-s text-on-surface-variant font-mono mt-0.5 truncate">
                            ({formatNumber(tier.Speed)}/h)
                        </div>
                    </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function ActivityStats({ tiers }: ActivityStatsProps) {
    const { t } = useI18n();
    // Sort by ChangePct descending for most active
    // Sort by ChangePct ascending for most slacking

    if (!tiers || tiers.length === 0) return null;

    const sorted = [...tiers].sort((a, b) => b.ChangePct - a.ChangePct);
    const mostActive = sorted.slice(0, 3);
    const mostSlacking = [...sorted].reverse().slice(0, 3);

    return (
        <div className="flex flex-col gap-4 h-full">
            <StatBlock
                title={t("page.prediction.activityStats.mostActive")}
                data={mostActive}
                type="active"
            />
            <StatBlock
                title={t("page.prediction.activityStats.mostSlacking")}
                data={mostSlacking}
                type="slacking"
            />
        </div>
    );
}
