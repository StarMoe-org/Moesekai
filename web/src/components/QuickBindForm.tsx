"use client";

import React, { useState, useCallback } from "react";
import ExternalLink from "@/components/ExternalLink";
import {
    verifyHarukiApi,
    createAccount,
    getTopCharacterId,
    SERVER_OPTIONS,
    type ServerType,
} from "@/lib/account";
import { startOAuthConnect } from "@/lib/oauth";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, Button, Chip, CircularProgress, Icon, Surface, TextField } from "@/components/md3";
import { mdPersonAdd } from "@/components/md3/icons";

interface QuickBindFormProps {
    onAccountAdded: () => void;
    /** Custom icon. */
    icon?: React.ReactNode;
    /** Custom description text. */
    description?: string;
    /** Return path after OAuth succeeds. */
    returnTo?: string;
}

const DefaultIcon = () => <Icon path={mdPersonAdd} size={32} />;

export default function QuickBindForm({
    onAccountAdded,
    icon,
    description,
    returnTo = "/profile",
}: QuickBindFormProps) {
    const { t } = useI18n();
    const resolvedDescription = description ?? t("common.account.quickBindDefaultDescription");
    const [gameId, setGameId] = useState("");
    const [oauthError, setOauthError] = useState<string | null>(null);
    const [server, setServer] = useState<ServerType>("jp");
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = useCallback(async () => {
        if (!gameId.trim()) return;
        setIsVerifying(true);
        setError(null);
        setOauthError(null);

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

        setGameId("");
        setIsVerifying(false);
        setError(null);
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
                    <div className="mb-1.5 type-label-l text-on-surface-variant">{t("common.form.server")}</div>
                    <div className="flex flex-wrap gap-2">
                        {SERVER_OPTIONS.map((s) => (
                            <Chip
                                key={s.value}
                                selected={server === s.value}
                                showCheckmark={false}
                                onClick={() => setServer(s.value)}
                                disabled={isVerifying}
                                className="justify-center"
                            >
                                <ServerRegionLabel server={s.value} size={18} />
                            </Chip>
                        ))}
                    </div>
                </div>

                {(error || oauthError) && (
                    <Banner tone="error">
                        <p>{error || oauthError}</p>
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
                    <Button
                        variant="outlined"
                        fullWidth
                        onClick={() => void handleOAuthBind()}
                        disabled={isVerifying}
                    >
                        {t("common.account.oauthAuthorizeBind")}
                    </Button>
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
