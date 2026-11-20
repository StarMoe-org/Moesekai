"use client";
import React, { useState } from "react";
import {
    ICardInfo,
    getRarityNumber,
    isTrainableCard,
    getCardDefaultTrainedStatus,
} from "@/types/types";
import { getCardFullUrl } from "@/lib/assets";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";

const ASSET_BASE = "/data/sekai_cards_assets";

// Native layout coordinates inside the 940x530 large card frame
const FRAME_WIDTH = 940;
const FRAME_HEIGHT = 530;

// Attribute badge (88x92) aligned flush at the top-right tab over the frame
const ATTR_STYLE: React.CSSProperties = {
    left: `${(814 / FRAME_WIDTH) * 100}%`,
    top: "0%",
    width: `${(88 / FRAME_WIDTH) * 100}%`,
    height: `${(92 / FRAME_HEIGHT) * 100}%`,
};

// Stars (native 72x70) stacked vertically on the bottom-left over the frame
const STAR_X_PCT = `${(26 / FRAME_WIDTH) * 100}%`;
const STAR_W_PCT = `${(56 / FRAME_WIDTH) * 100}%`;
const STAR_H_PCT = `${((56 * 70) / 72 / FRAME_HEIGHT) * 100}%`;
const STAR_BOTTOM_PX = 28;
const STAR_STEP_PX = 48;

interface SekaiCardLargeProps {
    card: ICardInfo;
    /** Force single normal/trained view. When omitted, trainable cards render split normal + trained. */
    trained?: boolean;
    /** Override split behavior for trainable cards. */
    split?: boolean;
    className?: string;
    assetSource?: AssetSourceType;
}

export default function SekaiCardLarge({
    card,
    trained,
    split,
    className = "",
    assetSource: customAssetSource,
}: SekaiCardLargeProps) {
    const { assetSource: themeAssetSource } = useTheme();
    const assetSource = customAssetSource ?? themeAssetSource;
    const [failedUrls, setFailedUrls] = useState<Record<string, true>>({});
    const [focusedSide, setFocusedSide] = useState<"normal" | "trained" | null>(null);

    const rarityNumber = getRarityNumber(card.cardRarityType);
    const isBirthday = card.cardRarityType === "rarity_birthday";
    const defaultTrainedOnly = getCardDefaultTrainedStatus(card);
    const hasBothArts = isTrainableCard(card) && !isBirthday && !defaultTrainedOnly;

    const isSplit = (split ?? (trained === undefined && hasBothArts)) && hasBothArts;
    const singleTrained = trained ?? defaultTrainedOnly;
    const showTrainedStar = isSplit ? focusedSide !== "normal" : singleTrained;

    const raritySuffix = isBirthday ? "birthday" : rarityNumber.toString();
    const frameUrl = `${ASSET_BASE}/cardFrame_L_rarity_${raritySuffix}.png`;
    const attrUrl = `${ASSET_BASE}/icon_attribute_${card.attr}_88.png`;
    const starUrl = isBirthday
        ? `${ASSET_BASE}/rare_birthday.png`
        : showTrainedStar
            ? `${ASSET_BASE}/rare_star_after_training.png`
            : `${ASSET_BASE}/rare_star_normal.png`;
    const starCount = isBirthday ? 1 : rarityNumber;

    const normalUrl = getCardFullUrl(card.characterId, card.assetbundleName, false, assetSource);
    const trainedUrl = getCardFullUrl(card.characterId, card.assetbundleName, true, assetSource);
    const singleUrl = singleTrained ? trainedUrl : normalUrl;

    const markFailed = (url: string) => {
        setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isSplit || e.pointerType !== "mouse") return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        const side = e.clientX - rect.left < rect.width / 2 ? "normal" : "trained";
        if (side !== focusedSide) setFocusedSide(side);
    };

    const handlePointerLeave = () => {
        if (focusedSide !== null) setFocusedSide(null);
    };

    const normalWidth =
        focusedSide === "normal" ? "100%" : focusedSide === "trained" ? "0%" : "50%";
    const trainedWidth =
        focusedSide === "trained" ? "100%" : focusedSide === "normal" ? "0%" : "50%";

    return (
        <div
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className={`relative aspect-[940/530] w-full overflow-hidden select-none bg-surface-container-high ${className}`}
        >
            {/* Card Artwork Layer */}
            {isSplit ? (
                <div className="absolute inset-0 flex">
                    <div
                        className="relative h-full overflow-hidden bg-surface-container-high transition-[width] duration-300 ease-md3-standard"
                        style={{ width: normalWidth }}
                    >
                        {!failedUrls[normalUrl] && (
                            <img
                                src={normalUrl}
                                alt={card.prefix}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover object-center"
                                onError={() => markFailed(normalUrl)}
                            />
                        )}
                    </div>
                    <div
                        className="relative h-full overflow-hidden bg-surface-container-high transition-[width] duration-300 ease-md3-standard"
                        style={{ width: trainedWidth }}
                    >
                        {!failedUrls[trainedUrl] && (
                            <img
                                src={trainedUrl}
                                alt={card.prefix}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover object-center"
                                onError={() => markFailed(trainedUrl)}
                            />
                        )}
                    </div>
                </div>
            ) : (
                !failedUrls[singleUrl] && (
                    <img
                        src={singleUrl}
                        alt={card.prefix}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover object-center"
                        onError={() => markFailed(singleUrl)}
                    />
                )
            )}

            {/* Large Card Frame */}
            <img
                src={frameUrl}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full object-fill"
            />

            {/* Attribute Badge (over the top-right frame tab, flush with top edge) */}
            <img
                src={attrUrl}
                alt={card.attr}
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={ATTR_STYLE}
            />

            {/* Vertical Rarity Stars (bottom-left, lower star overlaps upper star) */}
            {Array.from({ length: starCount }).map((_, index) => (
                <img
                    key={index}
                    src={starUrl}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute"
                    style={{
                        left: STAR_X_PCT,
                        bottom: `${((STAR_BOTTOM_PX + index * STAR_STEP_PX) / FRAME_HEIGHT) * 100}%`,
                        width: STAR_W_PCT,
                        height: STAR_H_PCT,
                        zIndex: starCount - index,
                    }}
                />
            ))}
        </div>
    );
}
