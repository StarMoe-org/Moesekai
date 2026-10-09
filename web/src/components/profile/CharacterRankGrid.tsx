"use client";

import { useI18n } from "@/contexts/I18nContext";
import { SectionCard } from "@/components/md3";
import { mdGroups } from "@/components/md3/icons";
import CharacterStatGrid from "./CharacterStatGrid";

interface Props {
    characterRanks: Map<number, number>;
}

export default function CharacterRankGrid({ characterRanks }: Props) {
    const { t, formatNumber } = useI18n();
    const total = [...characterRanks.values()].reduce((sum, rank) => sum + rank, 0);

    return (
        <div id="profile-character-related" className="h-full scroll-mt-20">
            <SectionCard
                className="h-full"
                icon={mdGroups}
                title={t("page.profile.stats.characterRank")}
                actions={total > 0 && (
                    <span className="type-label-l tabular-nums text-on-surface-variant">
                        {t("page.profile.stats.rankTotal", { value: formatNumber(total) })}
                    </span>
                )}
            >
                <CharacterStatGrid values={characterRanks} showBar />
            </SectionCard>
        </div>
    );
}
