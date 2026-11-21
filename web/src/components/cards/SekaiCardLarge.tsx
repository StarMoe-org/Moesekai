"use client";
import React, { memo, useState } from "react";
import {
    ICardInfo,
    getRarityNumber,
    isTrainableCard,
    getCardDefaultTrainedStatus,
} from "@/types/types";
import { getCardFullUrl, getCardSmallUrl } from "@/lib/assets";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import styles from "./SekaiCardLarge.module.css";

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
    /** Card artwork resolution tier. Grid lists use "small" (member_small) for fast decode & compositing. */
    imageSize?: "small" | "full";
    className?: string;
    assetSource?: AssetSourceType;
}

function SekaiCardLarge({
    card,
    trained,
    split,
    imageSize = "small",
    className = "",
    assetSource: customAssetSource,
}: SekaiCardLargeProps) {
    const { assetSource: themeAssetSource } = useTheme();
    const assetSource = customAssetSource ?? themeAssetSource;
    const [failedUrls, setFailedUrls] = useState<Record<string, true>>({});

    const rarityNumber = getRarityNumber(card.cardRarityType);
    const isBirthday = card.cardRarityType === "rarity_birthday";
    const defaultTrainedOnly = getCardDefaultTrainedStatus(card);
    const hasBothArts = isTrainableCard(card) && !isBirthday && !defaultTrainedOnly;

    const isSplit = (split ?? (trained === undefined && hasBothArts)) && hasBothArts;
    const singleTrained = trained ?? defaultTrainedOnly;

    const raritySuffix = isBirthday ? "birthday" : rarityNumber.toString();
    const frameUrl = `${ASSET_BASE}/cardFrame_L_rarity_${raritySuffix}.png`;
    const attrUrl = `${ASSET_BASE}/icon_attribute_${card.attr}_88.png`;
    const normalStarUrl = isBirthday
        ? `${ASSET_BASE}/rare_birthday.png`
        : `${ASSET_BASE}/rare_star_normal.png`;
    const trainedStarUrl = isBirthday
        ? `${ASSET_BASE}/rare_birthday.png`
        : `${ASSET_BASE}/rare_star_after_training.png`;
    const starCount = isBirthday ? 1 : rarityNumber;

    const getPrimaryUrl = (isTrainedArt: boolean) =>
        imageSize === "small"
            ? getCardSmallUrl(card.characterId, card.assetbundleName, isTrainedArt, assetSource)
            : getCardFullUrl(card.characterId, card.assetbundleName, isTrainedArt, assetSource);

    const resolveArtworkUrl = (isTrainedArt: boolean): string | null => {
        const primary = getPrimaryUrl(isTrainedArt);
        if (!failedUrls[primary]) return primary;
        if (imageSize === "small") {
            const fallback = getCardFullUrl(card.characterId, card.assetbundleName, isTrainedArt, assetSource);
            if (!failedUrls[fallback]) return fallback;
        }
        return null;
    };

    const markFailed = (url: string) => {
        setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
    };

    const normalUrl = resolveArtworkUrl(false);
    const trainedUrl = resolveArtworkUrl(true);
    const singleUrl = singleTrained ? trainedUrl : normalUrl;

    const renderStars = (starUrl: string) =>
        Array.from({ length: starCount }).map((_, index) => (
            <img
                key={index}
                src={starUrl}
                alt=""
                aria-hidden="true"
                decoding="async"
                className="pointer-events-none absolute"
                style={{
                    left: STAR_X_PCT,
                    bottom: `${((STAR_BOTTOM_PX + index * STAR_STEP_PX) / FRAME_HEIGHT) * 100}%`,
                    width: STAR_W_PCT,
                    height: STAR_H_PCT,
                    zIndex: starCount - index,
                }}
            />
        ));

    return (
        <div
            className={`${styles.cardFrame} relative aspect-[940/530] w-full overflow-hidden select-none bg-surface-container-high ${className}`}
        >
            {/* Pure CSS hover hit-zones (must precede .splitRoot and .starLayer siblings) */}
            {isSplit && (
                <>
                    <div className={`${styles.hoverZone} ${styles.hoverZoneLeft}`} aria-hidden="true" />
                    <div className={`${styles.hoverZone} ${styles.hoverZoneRight}`} aria-hidden="true" />
                </>
            )}

            {/* Card Artwork Layer */}
            {isSplit ? (
                <div className={styles.splitRoot}>
                    <div className="absolute inset-0 bg-surface-container-high">
                        {trainedUrl && (
                            <div className={`${styles.splitArtwork} ${styles.trainedArtwork}`}>
                                <img
                                    src={trainedUrl}
                                    alt={card.prefix}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover object-center"
                                    onError={() => markFailed(trainedUrl)}
                                />
                            </div>
                        )}
                    </div>
                    <div className={`${styles.normalLayer} bg-surface-container-high`}>
                        {normalUrl && (
                            <div className={`${styles.splitArtwork} ${styles.normalArtwork}`}>
                                <img
                                    src={normalUrl}
                                    alt={card.prefix}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover object-center"
                                    onError={() => markFailed(normalUrl)}
                                />
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                singleUrl && (
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
                decoding="async"
                className="pointer-events-none absolute inset-0 z-[3] h-full w-full object-fill"
            />

            {/* Attribute Badge (over the top-right frame tab, flush with top edge) */}
            <img
                src={attrUrl}
                alt={card.attr}
                aria-hidden="true"
                decoding="async"
                className="pointer-events-none absolute z-[3]"
                style={ATTR_STYLE}
            />

            {/* Vertical Rarity Stars (bottom-left, lower star overlaps upper star) */}
            {isSplit ? (
                <>
                    <div className={`pointer-events-none absolute inset-0 z-[3] ${styles.starLayer} ${styles.starTrained}`}>
                        {renderStars(trainedStarUrl)}
                    </div>
                    <div className={`pointer-events-none absolute inset-0 z-[3] ${styles.starLayer} ${styles.starNormal}`}>
                        {renderStars(normalStarUrl)}
                    </div>
                </>
            ) : (
                <div className="pointer-events-none absolute inset-0 z-[3]">
                    {renderStars(singleTrained ? trainedStarUrl : normalStarUrl)}
                </div>
            )}
        </div>
    );
}

export default memo(SekaiCardLarge);
