"use client";
import Image from "next/image";
import { getAttrIconUrl } from "@/lib/assets";
import { isAllBonusAttrs } from "@/lib/eventBonus";
import { ATTR_NAMES, type CardAttribute } from "@/types/types";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";

interface EventBonusAttrIconsProps {
    bonusAttrs?: readonly CardAttribute[];
    assetSource: AssetSourceType;
    iconSize?: number;
}

/**
 * Compact inline attribute icon(s) for event cards and event selectors.
 * - Single attribute: renders one 20×20 container with the attribute icon.
 * - Multiple / all 5 attributes (e.g. Compilation events): renders all icons inline
 *   with a localized "All Attributes" tooltip when all 5 are present.
 */
export default function EventBonusAttrIcons({
    bonusAttrs,
    assetSource,
    iconSize = 16,
}: EventBonusAttrIconsProps) {
    const { t } = useI18n();

    if (!bonusAttrs || bonusAttrs.length === 0) return null;

    const validAttrs = bonusAttrs.filter((attr) => attr in ATTR_NAMES);
    if (validAttrs.length === 0) return null;

    if (validAttrs.length === 1) {
        const attr = validAttrs[0];
        return (
            <div className="w-5 h-5 flex items-center justify-center" title={ATTR_NAMES[attr]}>
                <Image
                    src={getAttrIconUrl(attr, assetSource)}
                    alt={ATTR_NAMES[attr]}
                    width={iconSize}
                    height={iconSize}
                    className="object-contain"
                    unoptimized
                />
            </div>
        );
    }

    const title = isAllBonusAttrs(validAttrs)
        ? t("page.events.bonusAttrAll")
        : validAttrs.map((attr) => ATTR_NAMES[attr]).join(" / ");

    return (
        <div
            className="inline-flex items-center gap-0.5"
            title={title}
            aria-label={title}
        >
            {validAttrs.map((attr) => (
                <div key={attr} className="w-4 h-4 flex items-center justify-center">
                    <Image
                        src={getAttrIconUrl(attr, assetSource)}
                        alt={ATTR_NAMES[attr]}
                        width={iconSize}
                        height={iconSize}
                        className="object-contain"
                        unoptimized
                    />
                </div>
            ))}
        </div>
    );
}
