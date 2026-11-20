"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ExternalLink from "@/components/ExternalLink";
import { useI18n } from "@/contexts/I18nContext";
import { getAccounts } from "@/lib/account";
import { stripRouteLocale } from "@/lib/localized-path";
import {
    MOESEKAI_AFDIAN_URL,
    MOESEKAI_BILIBILI_SPACE_URL,
    MOESEKAI_KOFI_URL,
    MOESEKAI_QQ_GROUP_ID,
    MOESEKAI_QQ_GROUP_URL,
    STARMOE_DISCORD_URL,
} from "@/lib/team-links";
import {
    applyPromptDismissal,
    isCountableRoute,
    markPromptShown,
    pickCommunityPrompt,
    readCommunityPromptState,
    recordPageView,
    writeCommunityPromptState,
    type CommunityPromptId,
} from "@/lib/community-prompts";
import { Button, Dialog, Icon, buttonClassName } from "@/components/md3";
import {
    mdCheck,
    mdContentCopy,
    mdOpenInNew,
} from "@/components/md3/icons";

const SETUP_COMPLETED_KEY = "moesekai_setup_completed";
const OAUTH_MIGRATION_PROMPT_KEY = "moesekai_oauth_migration_prompt_v1";
const PROMPT_SHOW_DELAY_MS = 700;

interface ActivePrompt {
    id: CommunityPromptId;
    totalViews: number;
    isMilestone: boolean;
}

function isSetupCompleted(): boolean {
    try {
        return localStorage.getItem(SETUP_COMPLETED_KEY) === "true";
    } catch {
        return true;
    }
}

function hasPendingOAuthMigration(): boolean {
    try {
        if (localStorage.getItem(OAUTH_MIGRATION_PROMPT_KEY) !== null) return false;
        return getAccounts().some((account) => account.authSource === "oauth2" && !account.starmoeSource);
    } catch {
        return false;
    }
}

export default function CommunityPromoPrompt({ blocked = false }: { blocked?: boolean }) {
    const pathname = usePathname();
    const routePath = stripRouteLocale(pathname || "/");
    const lastCountedRouteRef = useRef<string | null>(null);
    const [activePrompt, setActivePrompt] = useState<ActivePrompt | null>(null);

    // Count each navigation once (guarded against React StrictMode double-effects).
    useEffect(() => {
        if (!isCountableRoute(routePath)) return;
        if (lastCountedRouteRef.current === routePath) return;
        lastCountedRouteRef.current = routePath;

        const nextState = recordPageView(readCommunityPromptState());
        writeCommunityPromptState(nextState);
    }, [routePath]);

    // Schedule an eligible random or milestone prompt shortly after navigation settles.
    useEffect(() => {
        if (blocked || activePrompt) return;
        if (!isSetupCompleted() || hasPendingOAuthMigration()) return;

        const timer = window.setTimeout(() => {
            if (!isSetupCompleted() || hasPendingOAuthMigration()) return;
            const current = readCommunityPromptState();
            const now = Date.now();
            const selection = pickCommunityPrompt(current, { routePath, now });
            if (!selection) return;

            const updated = markPromptShown(current, selection.promptId, now);
            writeCommunityPromptState(updated);
            setActivePrompt({
                id: selection.promptId,
                totalViews: updated.totalViews,
                isMilestone: selection.milestone !== undefined,
            });
        }, PROMPT_SHOW_DELAY_MS);

        return () => window.clearTimeout(timer);
    }, [routePath, blocked, activePrompt]);

    const handleDismiss = useCallback((permanent: boolean) => {
        setActivePrompt((currentPrompt) => {
            if (!currentPrompt) return null;
            if (permanent && !currentPrompt.isMilestone) {
                const updated = applyPromptDismissal(readCommunityPromptState(), currentPrompt.id, {
                    permanent: true,
                });
                writeCommunityPromptState(updated);
            }
            return null;
        });
    }, []);

    if (!activePrompt) return null;

    return (
        <CommunityPromoDialog
            prompt={activePrompt}
            onDismiss={handleDismiss}
        />
    );
}

function CommunityPromoDialog({
    prompt,
    onDismiss,
}: {
    prompt: ActivePrompt;
    onDismiss: (permanent: boolean) => void;
}) {
    const { t } = useI18n();
    const [copiedQq, setCopiedQq] = useState(false);

    const close = () => onDismiss(false);
    const dismissForever = () => onDismiss(true);

    const handleCopyQq = async () => {
        try {
            await navigator.clipboard.writeText(MOESEKAI_QQ_GROUP_ID);
            setCopiedQq(true);
            window.setTimeout(() => setCopiedQq(false), 2000);
        } catch {
            // Clipboard unavailable; group ID remains visible in the card.
        }
    };

    const title = (() => {
        switch (prompt.id) {
            case "qq-feedback":
                return t("common.communityPrompts.qqFeedback.title");
            case "bilibili-promo":
                return t("common.communityPrompts.bilibiliPromo.title");
            case "discord-promo":
                return t("common.communityPrompts.discordPromo.title");
            case "sponsor-support":
                return t("common.communityPrompts.sponsorSupport.title", { count: prompt.totalViews });
        }
    })();

    const supportingText = (() => {
        switch (prompt.id) {
            case "qq-feedback":
                return t("common.communityPrompts.qqFeedback.body", {
                    qqGroup: MOESEKAI_QQ_GROUP_ID,
                });
            case "bilibili-promo":
                return t("common.communityPrompts.bilibiliPromo.body");
            case "discord-promo":
                return t("common.communityPrompts.discordPromo.body");
            case "sponsor-support":
                return t("common.communityPrompts.sponsorSupport.body");
        }
    })();

    const primaryAction = (() => {
        switch (prompt.id) {
            case "qq-feedback":
                return (
                    <ExternalLink
                        href={MOESEKAI_QQ_GROUP_URL}
                        onClick={close}
                        className={buttonClassName({ variant: "filled" })}
                    >
                        <span>{t("common.communityPrompts.qqFeedback.action")}</span>
                        <Icon path={mdOpenInNew} size={18} />
                    </ExternalLink>
                );
            case "bilibili-promo":
                return (
                    <ExternalLink
                        href={MOESEKAI_BILIBILI_SPACE_URL}
                        onClick={close}
                        className={buttonClassName({ variant: "filled" })}
                    >
                        <span>{t("common.communityPrompts.bilibiliPromo.action")}</span>
                        <Icon path={mdOpenInNew} size={18} />
                    </ExternalLink>
                );
            case "discord-promo":
                return (
                    <ExternalLink
                        href={STARMOE_DISCORD_URL}
                        onClick={close}
                        className={buttonClassName({ variant: "filled" })}
                    >
                        <span>{t("common.communityPrompts.discordPromo.action")}</span>
                        <Icon path={mdOpenInNew} size={18} />
                    </ExternalLink>
                );
            case "sponsor-support":
                return (
                    <Button variant="filled" href="/patreon" onClick={close}>
                        {t("common.communityPrompts.sponsorSupport.action")}
                    </Button>
                );
        }
    })();

    return (
        <Dialog
            isOpen
            onClose={close}
            showClose
            size="sm"
            title={title}
            supportingText={supportingText}
            actions={
                <>
                    {!prompt.isMilestone && (
                        <Button variant="text" onClick={dismissForever}>
                            {t("common.communityPrompts.dontShowAgain")}
                        </Button>
                    )}
                    <Button variant="text" onClick={close}>
                        {t("common.communityPrompts.later")}
                    </Button>
                    {primaryAction}
                </>
            }
        >
            <div className="space-y-4">
                {prompt.id === "qq-feedback" && (
                    <div className="flex items-center justify-between gap-2 rounded-md3-md bg-surface-container px-3.5 py-2.5">
                        <div className="min-w-0">
                            <span className="block type-label-s text-on-surface-variant">
                                {t("common.communityPrompts.qqFeedback.groupLabel")}
                            </span>
                            <span className="font-mono type-title-s text-on-surface">
                                {MOESEKAI_QQ_GROUP_ID}
                            </span>
                        </div>
                        <Button
                            variant="tonal"
                            size="xs"
                            icon={copiedQq ? mdCheck : mdContentCopy}
                            onClick={handleCopyQq}
                        >
                            {copiedQq
                                ? t("common.communityPrompts.qqFeedback.copied")
                                : t("common.communityPrompts.qqFeedback.copyGroup")}
                        </Button>
                    </div>
                )}

                {(prompt.id === "bilibili-promo" || prompt.id === "discord-promo" || prompt.id === "qq-feedback") && (
                    <div className="space-y-2 rounded-md3-md bg-surface-container p-3">
                        <p className="type-label-s text-on-surface-variant">
                            {t("common.communityPrompts.otherChannels")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {prompt.id !== "bilibili-promo" && (
                                <ExternalLink
                                    href={MOESEKAI_BILIBILI_SPACE_URL}
                                    onClick={close}
                                    className={buttonClassName({ variant: "tonal", size: "xs" })}
                                >
                                    <span>{t("common.communityPrompts.channels.bilibili")}</span>
                                    <Icon path={mdOpenInNew} size={16} />
                                </ExternalLink>
                            )}
                            {prompt.id !== "discord-promo" && (
                                <ExternalLink
                                    href={STARMOE_DISCORD_URL}
                                    onClick={close}
                                    className={buttonClassName({ variant: "tonal", size: "xs" })}
                                >
                                    <span>{t("common.communityPrompts.channels.discord")}</span>
                                    <Icon path={mdOpenInNew} size={16} />
                                </ExternalLink>
                            )}
                            {prompt.id !== "qq-feedback" && (
                                <ExternalLink
                                    href={MOESEKAI_QQ_GROUP_URL}
                                    onClick={close}
                                    className={buttonClassName({ variant: "tonal", size: "xs" })}
                                >
                                    <span>{t("common.communityPrompts.channels.qq", { qqGroup: MOESEKAI_QQ_GROUP_ID })}</span>
                                    <Icon path={mdOpenInNew} size={16} />
                                </ExternalLink>
                            )}
                        </div>
                    </div>
                )}

                {prompt.id === "sponsor-support" && (
                    <div className="space-y-2.5 rounded-md3-md bg-surface-container p-3.5">
                        <p className="type-body-s text-on-surface-variant">
                            {t("common.communityPrompts.sponsorSupport.freePromise")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <ExternalLink
                                href={MOESEKAI_AFDIAN_URL}
                                onClick={close}
                                className={buttonClassName({ variant: "tonal", size: "xs" })}
                            >
                                <span>{t("common.communityPrompts.sponsorSupport.afdian")}</span>
                                <Icon path={mdOpenInNew} size={16} />
                            </ExternalLink>
                            <ExternalLink
                                href={MOESEKAI_KOFI_URL}
                                onClick={close}
                                className={buttonClassName({ variant: "tonal", size: "xs" })}
                            >
                                <span>Ko-fi</span>
                                <Icon path={mdOpenInNew} size={16} />
                            </ExternalLink>
                        </div>
                    </div>
                )}
            </div>
        </Dialog>
    );
}
