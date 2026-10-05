"use client";

import { ReactNode } from "react";
import DegreeImage from "@/components/honor/DegreeImage";
import BondsDegreeImage from "@/components/honor/BondsDegreeImage";
import { useI18n } from "@/contexts/I18nContext";
import { AssetSourceType } from "@/contexts/ThemeContext";
import { RealtimeRankingMasterData, NormalizedPlayerHonor } from "@/types/realtime-ranking";

interface PlayerHonorPreviewProps {
    honors: NormalizedPlayerHonor[];
    masterData: RealtimeRankingMasterData;
    assetSource: AssetSourceType;
    compact?: boolean;
}

function renderHonorItem(
    item: NormalizedPlayerHonor,
    index: number,
    sizeClass: string,
    masterData: RealtimeRankingMasterData,
    assetSource: AssetSourceType,
): ReactNode {
    if (item.kind === "bonds" && item.bondsHonorId) {
        const bondsHonor = masterData.bondsHonors.find((entry) => entry.id === item.bondsHonorId);
        if (!bondsHonor) return null;

        const resolvedWordAssetbundleName = item.bondsHonorWordAssetbundleName?.startsWith("__WORD_ID__:")
            ? (() => {
                const wordId = Number(item.bondsHonorWordAssetbundleName.replace("__WORD_ID__:", ""));
                return masterData.bondsHonorWords.find((entry) => entry.id === wordId)?.assetbundleName;
            })()
            : item.bondsHonorWordAssetbundleName;

        return (
            <div key={`bonds-${item.bondsHonorId}-${index}`} className={sizeClass}>
                <BondsDegreeImage
                    bondsHonor={bondsHonor}
                    gameCharaUnits={masterData.gameCharaUnits}
                    bondsHonorWordAssetbundleName={resolvedWordAssetbundleName}
                    honorLevel={item.bondsHonorLevel}
                    source={assetSource}
                    sub
                    className="w-full"
                />
            </div>
        );
    }

    if (item.kind === "normal" && item.honorId) {
        const honor = masterData.honors.find((entry) => entry.id === item.honorId);
        if (!honor) return null;
        const honorGroup = masterData.honorGroups.find((group) => group.id === honor.groupId);
        return (
            <div key={`normal-${item.honorId}-${index}`} className={sizeClass}>
                <DegreeImage
                    honor={honor}
                    honorGroup={honorGroup}
                    honorLevel={item.honorLevel}
                    source={assetSource}
                    sub
                    className="w-full"
                />
            </div>
        );
    }

    return null;
}

export default function PlayerHonorPreview({ honors, masterData, assetSource, compact = false }: PlayerHonorPreviewProps) {
    const { t } = useI18n();

    if (honors.length === 0) {
        return <div className={compact ? "text-[10px] text-on-surface-variant" : "text-xs text-on-surface-variant"}>{t("page.realtimeRanking.list.noHonors")}</div>;
    }

    const sizeClass = compact ? "w-[60px] shrink-0 sm:w-[68px]" : "w-[148px] max-w-full sm:w-[156px]";

    // Compact mode uses a horizontal scroll container with a right-side fade hint for mobile swiping.
    if (compact) {
        return (
            <div className="relative max-w-full">
                <div
                    className="flex items-center gap-px overflow-x-auto [&::-webkit-scrollbar]:hidden"
                    style={{
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                        WebkitOverflowScrolling: "touch",
                    }}
                >
                    {honors.slice(0, 3).map((item, index) => renderHonorItem(item, index, sizeClass, masterData, assetSource))}
                </div>
                {/* Right-side fade hint for scrolling */}
                <div
                    className="pointer-events-none absolute right-0 top-0 h-full w-4"
                    style={{
                        background: "linear-gradient(to left, var(--md-sys-color-surface-container-low), transparent)",
                    }}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-wrap gap-1.5">
            {honors.slice(0, 3).map((item, index) => renderHonorItem(item, index, sizeClass, masterData, assetSource))}
        </div>
    );
}
