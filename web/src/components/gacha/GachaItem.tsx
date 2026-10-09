"use client";
import React, { useState } from "react";
import { Card, Icon } from "@/components/md3";
import { mdCasino } from "@/components/md3/icons";
import Image from "next/image";
import { IGachaInfo } from "@/types/types";
import { getGachaLogoUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useI18n } from "@/contexts/I18nContext";

interface GachaItemProps {
    gacha: IGachaInfo;
}

export default function GachaItem({ gacha }: GachaItemProps) {
    const { isShowSpoiler, assetSource } = useTheme();
    const { t, formatDate: formatLocaleDate } = useI18n();
    const [now] = useState(() => Date.now());
    const isUnreleased = gacha.startAt > now;
    const isOngoing = gacha.startAt <= now && gacha.endAt >= now;
    const logoUrl = getGachaLogoUrl(gacha.assetbundleName, assetSource);
    const [failedLogo, setFailedLogo] = useState<string | null>(null);

    const formatDate = (timestamp: number) => formatLocaleDate(timestamp, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });

    return (
        <Card href={`/gacha/${gacha.id}`} variant="elevated" className="group h-full" data-shortcut-item="true">
            <div className="relative">
                {/* Logo Image */}
                <div className="relative aspect-[16/9] bg-surface-container-high">
                    {failedLogo === logoUrl ? (
                        <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant">
                            <Icon path={mdCasino} size={40} />
                        </div>
                    ) : (
                        <Image
                            src={logoUrl}
                            alt={gacha.name}
                            fill
                            className="object-contain p-2"
                            unoptimized
                            onError={() => setFailedLogo(logoUrl)}
                        />
                    )}

                    {/* Status Badges */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                        {isUnreleased && isShowSpoiler && (
                            <span className="px-2 py-0.5 type-label-s bg-tertiary text-on-tertiary rounded-full shadow-elev-1">
                                {t("common.badge.spoiler")}
                            </span>
                        )}
                        {isOngoing && (
                            <span className="px-2 py-0.5 type-label-s bg-primary text-on-primary rounded-full shadow-elev-1">
                                {t("common.badge.ongoing")}
                            </span>
                        )}
                    </div>

                    {/* ID Badge */}
                    <div className="absolute bottom-2 left-2">
                        <span className="px-2 py-0.5 type-label-s font-mono bg-inverse-surface/80 text-inverse-on-surface rounded-full">
                            #{gacha.id}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-3">
                    <h3 className="type-title-s text-on-surface group-hover:text-primary transition-colors">
                        <TranslatedText
                            original={gacha.name}
                            category="gacha"
                            field="name"
                            originalClassName="block"
                            translationClassName="type-body-s text-on-surface-variant block"
                        />
                    </h3>
                    <div className="mt-1 type-label-m text-on-surface-variant space-y-0.5">
                        <p>{formatDate(gacha.startAt)} ~ {formatDate(gacha.endAt)}</p>
                    </div>
                </div>
            </div>
        </Card>
    );
}
