"use client";

import React, { useState, useCallback } from "react";
import AccountAvatar from "@/components/AccountAvatar";
import ExternalLink from "@/components/ExternalLink";
import {
    verifyHarukiApi,
    createAccount,
    getTopCharacterId,
    SERVER_OPTIONS,
    type MoesekaiAccount,
    type ServerType,
} from "@/lib/account";
import { startOAuthConnect } from "@/lib/oauth";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { Button, Chip, CircularProgress, Icon, Surface, TextField, cn } from "@/components/md3";
import { mdAdd, mdCheck, mdError } from "@/components/md3/icons";

interface AccountSelectorBarProps {
    accounts: MoesekaiAccount[];
    activeAccount: MoesekaiAccount | null;
    onSelect: (acc: MoesekaiAccount) => void;
    onAccountAdded: () => void;
    returnTo?: string;
}

export default function AccountSelectorBar({
    accounts,
    activeAccount,
    onSelect,
    onAccountAdded,
    returnTo = "/profile",
}: AccountSelectorBarProps) {
    const { t } = useI18n();
    const [showAddForm, setShowAddForm] = useState(false);
    const [gameId, setGameId] = useState("");
    const [server, setServer] = useState<ServerType>("jp");
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [oauthError, setOauthError] = useState<string | null>(null);

    const handleAdd = useCallback(async () => {
        if (!gameId.trim()) return;
        setIsVerifying(true);
        setError(null);
        setOauthError(null);

        const result = await verifyHarukiApi(server, gameId.trim());
        if (!result.success) {
            setError(
                result.error === "API_NOT_PUBLIC"
                    ? t("common.harukiErrors.apiNotPublicShort")
                    : result.error === "NOT_FOUND"
                        ? t("common.harukiErrors.userNotFoundShort")
                        : t("common.harukiErrors.networkErrorShort")
            );
            setIsVerifying(false);
            return;
        }

        const chars = result.userCharacters || [];
        const topCharId = getTopCharacterId(chars);
        const nickname = result.userGamedata?.name || "";
        createAccount(gameId.trim(), server, nickname, topCharId, chars, true);

        setGameId("");
        setIsVerifying(false);
        setError(null);
        setShowAddForm(false);
        onAccountAdded();
    }, [gameId, server, onAccountAdded, t]);

    const handleOAuthBind = useCallback(async () => {
        try {
            setOauthError(null);
            await startOAuthConnect(returnTo);
        } catch (err) {
            setOauthError(err instanceof Error ? err.message : t("common.harukiErrors.oauthInitFailed"));
        }
    }, [returnTo, t]);

    return (
        <div className="mb-6">
            <Surface tone="low" radius="lg" className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="type-title-s text-on-surface">{t("common.account.selectAccount")}</span>
                    <div className="flex items-center gap-1">
                        <Button variant="text" size="xs" onClick={() => void handleOAuthBind()}>
                            {t("common.account.oauthBind")}
                        </Button>
                        <Button
                            variant="text"
                            size="xs"
                            icon={mdAdd}
                            onClick={() => { setShowAddForm(!showAddForm); setError(null); setOauthError(null); }}
                        >
                            {t("common.account.addAccount")}
                        </Button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {accounts.map((acc) => {
                        const isActive = activeAccount?.id === acc.id;
                        const displayName = acc.userGamedata?.name || acc.nickname;
                        return (
                            <button
                                key={acc.id}
                                type="button"
                                onClick={() => onSelect(acc)}
                                aria-pressed={isActive}
                                className={cn(
                                    "state-layer focus-ring flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md3-sm border pl-1.5 pr-2 type-label-l sm:gap-2",
                                    isActive
                                        ? "border-transparent bg-secondary-container text-on-secondary-container"
                                        : "border-outline-variant text-on-surface-variant",
                                )}
                            >
                                <AccountAvatar account={acc} size="sm" />
                                {displayName && (
                                    <span className="max-w-[65px] shrink-0 truncate type-emphasized sm:max-w-[85px]">{displayName}</span>
                                )}
                                <span className="min-w-0 flex-1 truncate font-mono">{acc.gameId}</span>
                                <span className={cn("shrink-0 whitespace-nowrap rounded-md3-xs px-1.5 type-label-s", isActive ? "bg-on-secondary-container/12" : "bg-surface-container-highest")}>
                                    <ServerRegionLabel server={acc.server} size={16} />
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Inline add form */}
                {showAddForm && (
                    <div className="mt-4 border-t border-outline-variant pt-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <TextField
                                dense
                                label={t("common.form.uid")}
                                value={gameId}
                                onValueChange={setGameId}
                                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                                placeholder={t("common.account.inputGameUid")}
                                disabled={isVerifying}
                                containerClassName="min-w-[160px] flex-1"
                            />
                            <div>
                                <div className="mb-1 type-label-m text-on-surface-variant">{t("common.form.server")}</div>
                                <div className="flex flex-wrap gap-1">
                                    {SERVER_OPTIONS.map((s) => (
                                        <Chip
                                            key={s.value}
                                            selected={server === s.value}
                                            showCheckmark={false}
                                            onClick={() => setServer(s.value)}
                                            disabled={isVerifying}
                                        >
                                            <ServerRegionLabel server={s.value} size={18} />
                                        </Chip>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="filled"
                                    onClick={handleAdd}
                                    disabled={!gameId.trim() || isVerifying}
                                    icon={isVerifying ? undefined : mdCheck}
                                >
                                    {isVerifying && <CircularProgress size={18} strokeWidth={2} />}
                                    {isVerifying ? t("common.account.verifying") : t("common.account.add")}
                                </Button>
                                <Button
                                    variant="text"
                                    onClick={() => { setShowAddForm(false); setError(null); }}
                                    disabled={isVerifying}
                                >
                                    {t("common.action.cancel")}
                                </Button>
                            </div>
                        </div>
                        {(error || oauthError) && (
                            <p className="mt-3 flex flex-wrap items-center gap-1 type-body-s text-error">
                                <Icon path={mdError} size={16} className="shrink-0" />
                                {error || oauthError}
                                <ExternalLink href="https://haruki.seiunx.com" className="ml-1 text-primary hover:underline">
                                    {t("common.account.goHaruki")}
                                </ExternalLink>
                            </p>
                        )}
                    </div>
                )}
            </Surface>
        </div>
    );
}
