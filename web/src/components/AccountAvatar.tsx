"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { useTheme } from "@/contexts/ThemeContext";
import { useCardThumbnail } from "@/hooks/useCardThumbnail";
import {
    getCharacterIconUrl,
    getTopCharacterId,
    setCachedAvatarUrl,
    type MoesekaiAccount,
} from "@/lib/account";

interface AccountAvatarProps {
    account: MoesekaiAccount;
    /** Size: sm=20px, md=32px, lg=48px */
    size?: "sm" | "md" | "lg";
    className?: string;
}

const SIZE_MAP = {
    sm: { px: 20, cls: "w-5 h-5" },
    md: { px: 32, cls: "w-8 h-8" },
    lg: { px: 12, cls: "w-12 h-12" },
} as const;

export default function AccountAvatar({ account, size = "md", className }: AccountAvatarProps) {
    const { assetSource } = useTheme();
    const cardThumbnail = useCardThumbnail(account.avatarCardId, assetSource);

    const avatarUrl = cardThumbnail || getCharacterIconUrl(
        account.avatarCharacterId ||
        (account.userCharacters ? getTopCharacterId(account.userCharacters) : 21)
    );

    // Cache the avatar URL for components such as the sidebar.
    useEffect(() => {
        if (avatarUrl) {
            setCachedAvatarUrl(account.id, avatarUrl);
        }
    }, [account.id, avatarUrl]);

    const s = SIZE_MAP[size];

    if (size === "lg") {
        // Use fill mode for large avatars, such as the profile page.
        return (
            <div className={`relative ${s.cls} rounded-md3-sm overflow-hidden bg-surface-container-highest flex-shrink-0 ${className || ""}`}>
                <Image
                    src={avatarUrl}
                    alt=""
                    fill
                    className="object-cover"
                    unoptimized
                />
            </div>
        );
    }

    return (
        <div className={`${s.cls} rounded-full overflow-hidden bg-surface-container-highest flex-shrink-0 ${className || ""}`}>
            <Image
                src={avatarUrl}
                alt=""
                width={s.px}
                height={s.px}
                className="object-cover"
                unoptimized
            />
        </div>
    );
}
