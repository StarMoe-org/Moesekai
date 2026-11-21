"use client";

import React, { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import {
    getCardAvatarImageUrls,
    useCommunityCards,
} from "@/lib/community-masterdata";
import { getCardDefaultTrainedStatus, isTrainableCard } from "@/types/types";
import { cn } from "@/components/md3";

export function getAvatarInitials(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "?";
    return Array.from(trimmed)[0]?.toUpperCase() ?? "?";
}

export function safeAvatarUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
        return trimmed;
    }
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
            return parsed.toString();
        }
    } catch {
        // Reject malformed or non-http(s) URLs
    }
    return null;
}

interface FallbackImgProps {
    primaryUrl: string;
    fallbackUrl: string | null;
    alt: string;
    onAllFailed: () => void;
}

function CardAvatarImg({ primaryUrl, fallbackUrl, alt, onAllFailed }: FallbackImgProps) {
    const [usedFallback, setUsedFallback] = useState(false);
    const src = usedFallback && fallbackUrl ? fallbackUrl : primaryUrl;

    return (
        <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => {
                if (!usedFallback && fallbackUrl && fallbackUrl !== primaryUrl) {
                    setUsedFallback(true);
                } else {
                    onAllFailed();
                }
            }}
        />
    );
}

interface DefaultAvatarImgProps {
    src: string;
    alt: string;
    onFailed: () => void;
}

function DefaultAvatarImg({ src, alt, onFailed }: DefaultAvatarImgProps) {
    return (
        <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={onFailed}
        />
    );
}

export interface CommunityAvatarProps {
    displayName: string;
    avatarUrl?: string | null;
    avatarCardId?: number | null;
    avatarCardTrained?: boolean;
    isDeleted?: boolean;
    sizeClassName?: string;
    textClassName?: string;
    className?: string;
}

/**
 * Renders a community member's avatar:
 * 1. If `avatarCardId` is set, resolves the PJSK card thumbnail (respecting `assetSource` /
 *    `serverSource` with automatic JP `onError` fallback for JP-advance cards).
 * 2. Otherwise falls back to `safeAvatarUrl(avatarUrl)` or the user's initial.
 */
export function CommunityAvatar({
    displayName,
    avatarUrl,
    avatarCardId,
    avatarCardTrained = false,
    isDeleted = false,
    sizeClassName = "h-9 w-9",
    textClassName = "type-label-m",
    className,
}: CommunityAvatarProps) {
    const { assetSource, serverSource } = useTheme();
    const hasCardAvatar = !isDeleted && typeof avatarCardId === "number" && avatarCardId > 0;
    const { cardsMap, localCardIds } = useCommunityCards(hasCardAvatar);

    const card = hasCardAvatar ? cardsMap?.get(avatarCardId) : undefined;
    const effectiveTrained = card
        ? getCardDefaultTrainedStatus(card) || (Boolean(avatarCardTrained) && isTrainableCard(card))
        : false;
    const cardUrls = card
        ? getCardAvatarImageUrls(
              card,
              effectiveTrained,
              assetSource,
              serverSource,
              localCardIds ? localCardIds.has(card.id) : undefined,
          )
        : null;

    const fallbackUrl = isDeleted ? null : safeAvatarUrl(avatarUrl);
    const cardKey = cardUrls ? `${cardUrls.primaryUrl}|${cardUrls.jpFallbackUrl}` : "";

    const [failedCardKey, setFailedCardKey] = useState<string | null>(null);
    const [failedFallbackUrl, setFailedFallbackUrl] = useState<string | null>(null);

    const showCard = Boolean(cardUrls && failedCardKey !== cardKey);
    const showDefault = !showCard && Boolean(fallbackUrl && failedFallbackUrl !== fallbackUrl);

    return (
        <span
            className={cn(
                "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-container text-on-primary-container select-none",
                sizeClassName,
                textClassName,
                className,
            )}
        >
            {showCard && cardUrls ? (
                <CardAvatarImg
                    key={cardKey}
                    primaryUrl={cardUrls.primaryUrl}
                    fallbackUrl={cardUrls.jpFallbackUrl}
                    alt={displayName}
                    onAllFailed={() => setFailedCardKey(cardKey)}
                />
            ) : showDefault && fallbackUrl ? (
                <DefaultAvatarImg
                    key={fallbackUrl}
                    src={fallbackUrl}
                    alt={displayName}
                    onFailed={() => setFailedFallbackUrl(fallbackUrl)}
                />
            ) : (
                <span>{getAvatarInitials(displayName)}</span>
            )}
        </span>
    );
}

export default CommunityAvatar;
