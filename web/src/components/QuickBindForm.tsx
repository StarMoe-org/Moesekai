"use client";

import React, { useState, useCallback, useId } from "react";
import ExternalLink from "@/components/ExternalLink";
import {
    verifyHarukiApi,
    createAccount,
    getTopCharacterId,
    rememberAccount,
    type ServerType,
} from "@/lib/account";
import HarukiConnectButton from "@/components/HarukiConnectButton";
import { StarMoeApiError } from "@/lib/starmoe-accounts";
import { useStarMoeAccountSync } from "@/hooks/useStarMoeAccountSync";
import { ServerPicker } from "@/components/common/ServerPicker";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, Button, CircularProgress, Icon, Surface, TextField } from "@/components/md3";
import { mdPersonAdd } from "@/components/md3/icons";

interface QuickBindFormProps {
    onAccountAdded: () => void;
    /** Custom icon. */
    icon?: React.ReactNode;
    /** Custom description text. */
    description?: string;
    /** Unused since Haruki is connected on StarMoe Connect, which returns to the current page. */
    returnTo?: string;
}

const DefaultIcon = () => <Icon path={mdPersonAdd} size={32} />;

export default function QuickBindForm({
    onAccountAdded,
    icon,
    description,
}: QuickBindFormProps) {
    const { t } = useI18n();
    useStarMoeAccountSync();
    const resolvedDescription = description ?? t("common.account.quickBindDefaultDescription");
    const [gameId, setGameId] = useState("");
    const [server, setServer] = useState<ServerType>("jp");
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const serverLabelId = useId();

    const handleSubmit = useCallback(async () => {
        if (!gameId.trim()) return;
        setIsVerifying(true);
        setError(null);

        const result = await verifyHarukiApi(server, gameId.trim());
        if (!result.success) {
            setError(
                result.error === "API_NOT_PUBLIC"
                    ? t("common.harukiErrors.apiNotPublic")
                    : result.error === "NOT_FOUND"
                        ? t("common.harukiErrors.userNotFound")
                        : t("common.harukiErrors.networkError")
            );
            setIsVerifying(false);
            return;
        }

        const chars = result.userCharacters || [];
        const topCharId = getTopCharacterId(chars);
        const nickname = result.userGamedata?.name || "";
        createAccount(gameId.trim(), server, nickname, topCharId, chars, true);
        try {
            await rememberAccount(server, gameId.trim());
        } catch (err) {
            // Kept in this browser; the StarMoe account is full or could not be reached.
            setError(err instanceof StarMoeApiError && err.code === "too_many_accounts"
                ? t("common.account.starmoeAccountsFull")
                : t("common.account.starmoeSaveFailed"));
            setIsVerifying(false);
            onAccountAdded();
            return;
        }

        setGameId("");
        setIsVerifying(false);
        setError(null);
        onAccountAdded();
    }, [gameId, server, onAccountAdded, t]);

    return (
        <Surface tone="card" radius="xl" className="p-6 sm:p-8">
            <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                    {icon || <DefaultIcon />}
                </div>
                <h2 className="mb-1 type-headline-s text-on-surface">{t("common.account.quickBindTitle")}</h2>
                <p className="type-body-m text-on-surface-variant">{resolvedDescription}</p>
            </div>

            <div className="mx-auto max-w-sm space-y-4">
                <TextField
                    label={t("common.form.gameUid")}
                    required
                    value={gameId}
                    onValueChange={setGameId}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder={t("common.account.inputGameUid")}
                    disabled={isVerifying}
                />
                <div>
                    <div id={serverLabelId} className="mb-1.5 type-label-l text-on-surface-variant">{t("common.form.server")}</div>
                    <ServerPicker value={server} onValueChange={setServer} disabled={isVerifying} labelledBy={serverLabelId} />
                </div>

                {error && (
                    <Banner tone="error">
                        <p>{error}</p>
                        <ExternalLink href="https://haruki.seiunx.com" className="mt-1 inline-block underline">
                            {t("common.account.goHaruki")}
                        </ExternalLink>
                    </Banner>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Button
                        variant="filled"
                        fullWidth
                        onClick={handleSubmit}
                        disabled={!gameId.trim() || isVerifying}
                    >
                        {isVerifying ? (
                            <>
                                <CircularProgress size={18} strokeWidth={2} />
                                {t("common.account.verifyingWithDots")}
                            </>
                        ) : (
                            t("common.account.verifyAndBind")
                        )}
                    </Button>
                    <HarukiConnectButton variant="outlined" size="m" fullWidth />
                </div>

                <p className="text-center type-body-s text-on-surface-variant">
                    {t("common.account.manualBindHintStart")}{" "}
                    <ExternalLink href="https://haruki.seiunx.com" className="text-primary hover:underline">
                        {t("common.account.manualBindHintHaruki")}
                    </ExternalLink>
                    {" "}{t("common.account.manualBindHintEnd")}
                </p>
            </div>
        </Surface>
    );
}
