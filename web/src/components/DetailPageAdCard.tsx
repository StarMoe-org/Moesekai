"use client";

import AdUnit from "@/components/AdUnit";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { DETAIL_FEED_AD } from "@/lib/ads";
import { Icon } from "@/components/md3";
import { mdCampaign } from "@/components/md3/icons";

interface DetailPageAdCardProps {
    hidden?: boolean;
}

export default function DetailPageAdCard({ hidden = false }: DetailPageAdCardProps) {
    const { showAds } = useTheme();
    const { t } = useI18n();

    if (hidden || !showAds) return null;

    return (
        <div className="moesekai-ad-slot overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70">
            <div className="flex items-center gap-2 px-5 pb-2 pt-4">
                <Icon path={mdCampaign} size={20} className="text-tertiary" />
                <h2 className="type-title-m text-on-surface">{t("settings.ads.title")}</h2>
            </div>
            <div className="max-h-[400px] overflow-hidden">
                <AdUnit
                    adClient={DETAIL_FEED_AD.client}
                    adSlot={DETAIL_FEED_AD.slot}
                    adLayoutKey={DETAIL_FEED_AD.layoutKey}
                />
            </div>
        </div>
    );
}
