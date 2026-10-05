"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import {
    getAccounts,
    setActiveAccount,
    getCharacterIconUrl,
    getTopCharacterId,
    getCachedAvatarUrl,
    type MoesekaiAccount,
    type ServerType,
} from "@/lib/account";
import { useI18n } from "@/contexts/I18nContext";
import { cn } from "@/components/md3";

interface AccountSelectorProps {
    /** Called after an account is selected, with gameId and server. */
    onSelect: (gameId: string, server: ServerType) => void;
    /** Current userId in the input, used for highlighting matches. */
    currentUserId?: string;
    currentServer?: ServerType;
    /** Optionally only show accounts from specified servers. */
    allowedServers?: ServerType[];
}

export default function AccountSelector({ onSelect, currentUserId, currentServer, allowedServers }: AccountSelectorProps) {
    const { t } = useI18n();
    const [accounts, setAccounts] = useState<MoesekaiAccount[]>([]);

    useEffect(() => {
        const syncAccounts = () => {
            const allAccounts = getAccounts();
            setAccounts(allowedServers?.length
                ? allAccounts.filter((account) => allowedServers.includes(account.server))
                : allAccounts);
        };
        syncAccounts();
        window.addEventListener("storage", syncAccounts);
        return () => window.removeEventListener("storage", syncAccounts);
    }, [allowedServers]);

    if (accounts.length === 0) return null;

    return (
        <div className="mb-3 max-w-full">
            <div className="flex items-center gap-2 mb-1.5">
                <span className="type-label-l text-on-surface-variant">{t("common.account.savedAccounts")}</span>
                <span className="type-label-s text-outline">{t("common.account.quickFill")}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
                {accounts.map((acc) => {
                    const isActive = currentUserId === acc.gameId && currentServer === acc.server;
                    const charId = acc.avatarCharacterId || (acc.userCharacters ? getTopCharacterId(acc.userCharacters) : 21);
                    const cachedAvatar = getCachedAvatarUrl(acc.id);
                    const avatarUrl = cachedAvatar || getCharacterIconUrl(charId);
                    const displayName = acc.userGamedata?.name || acc.nickname;
                    return (
                        <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                                setActiveAccount(acc.id);
                                onSelect(acc.gameId, acc.server);
                            }}
                            className={cn(
                                "state-layer focus-ring flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md3-sm border pl-1.5 pr-2 type-label-l sm:gap-2",
                                isActive
                                    ? "border-transparent bg-secondary-container text-on-secondary-container"
                                    : "border-outline-variant text-on-surface-variant",
                            )}
                            aria-pressed={isActive}
                        >
                            <div className="w-5 h-5 rounded-full overflow-hidden bg-surface-container-highest flex-shrink-0">
                                <Image
                                    src={avatarUrl}
                                    alt=""
                                    width={20}
                                    height={20}
                                    className="object-cover"
                                    unoptimized
                                />
                            </div>
                            {displayName && (
                                <span className="type-emphasized truncate max-w-[65px] sm:max-w-[85px] flex-shrink-0">{displayName}</span>
                            )}
                            <span className="font-mono truncate min-w-0 flex-1">{acc.gameId}</span>
                            <span className={cn("shrink-0 whitespace-nowrap rounded-md3-xs px-1.5 type-label-s", isActive ? "bg-on-secondary-container/12" : "bg-surface-container-highest")}>
                                {t(`common.server.${acc.server}`)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
