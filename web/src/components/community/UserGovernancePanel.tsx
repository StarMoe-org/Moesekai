"use client";

import React, { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import {
    fetchCommunityUser,
    getCommunityErrorMessage,
    submitModAction,
} from "@/lib/community-api";
import { Banner, Button, Chip, Surface, TextField } from "@/components/md3";
import { mdBlock, mdLockOpen, mdShield, mdStar } from "@/components/md3/icons";
import {
    TRUST_LEVEL_OPTIONS,
    type CommunityProfile,
    type MemberTrustLevel,
    type ModActionRequest,
} from "@/types/community";

const MUTE_DURATION_OPTIONS: readonly { hours: number; labelKey: string }[] = [
    { hours: 1, labelKey: "page.community.mod.userGov.muteHours1" },
    { hours: 24, labelKey: "page.community.mod.userGov.muteHours24" },
    { hours: 72, labelKey: "page.community.mod.userGov.muteHours72" },
    { hours: 168, labelKey: "page.community.mod.userGov.muteHours168" },
];

function normalizeMemberTrustLevel(level: number): MemberTrustLevel {
    if (level === 4) return 4;
    if (level === 3) return 3;
    if (level === 2) return 2;
    return 1;
}

interface UserGovernancePanelProps {
    target: CommunityProfile;
    canManageMods: boolean;
    viewerSub?: string | null;
    onUpdated: (updated: CommunityProfile | null, message: string) => void;
    onError: (message: string) => void;
}

export function UserGovernancePanel({
    target,
    canManageMods,
    viewerSub,
    onUpdated,
    onError,
}: UserGovernancePanelProps) {
    const { t, formatDate } = useI18n();
    const [reason, setReason] = useState("");
    const [muteHours, setMuteHours] = useState<number>(24);
    const [selectedLevel, setSelectedLevel] = useState<MemberTrustLevel>(() =>
        normalizeMemberTrustLevel(target.trust_level),
    );
    const [busyAction, setBusyAction] = useState<string | null>(null);

    useEffect(() => {
        setSelectedLevel(normalizeMemberTrustLevel(target.trust_level));
    }, [target.sub, target.trust_level]);

    const isSelfTarget = Boolean(viewerSub && target.sub === viewerSub);
    const isTargetAdmin = target.role === "admin";
    const isTargetMod = target.role === "mod";

    const canMuteTarget =
        !isSelfTarget && !isTargetAdmin && (target.role === "user" || canManageMods);
    const canChangeRole = canManageMods && !isSelfTarget && !isTargetAdmin;
    const canManageTrustLevel = canManageMods && !isTargetAdmin;

    const isCurrentlyMuted = Boolean(
        target.muted_until && new Date(target.muted_until).getTime() > Date.now(),
    );

    const executeAction = async (actionKey: string, payload: ModActionRequest) => {
        setBusyAction(actionKey);
        try {
            await submitModAction({
                ...payload,
                reason: reason.trim() || undefined,
            });
            let refreshed: CommunityProfile | null = null;
            try {
                refreshed = await fetchCommunityUser(target.sub);
            } catch {
                // Keep caller state if refresh fails transiently
            }
            setReason("");
            onUpdated(refreshed, t("page.community.mod.actionSuccess"));
        } catch (err) {
            onError(getCommunityErrorMessage(err, t));
        } finally {
            setBusyAction(null);
        }
    };

    const isBusy = busyAction !== null;

    if (isTargetAdmin) {
        return <Banner tone="info">{t("page.community.mod.userGov.protectedAccount")}</Banner>;
    }

    if (isSelfTarget) {
        return <Banner tone="info">{t("page.community.mod.userGov.selfNotice")}</Banner>;
    }

    if (!canMuteTarget && !canChangeRole && !canManageTrustLevel) {
        return (
            <Banner tone="info">
                {isTargetMod
                    ? t("page.community.mod.userGov.modTargetHint")
                    : t("page.community.mod.userGov.protectedAccount")}
            </Banner>
        );
    }

    return (
        <div className="space-y-4">
            {isCurrentlyMuted && target.muted_until && (
                <Banner tone="warning">
                    {t("page.community.mod.userGov.mutedStatus", {
                        until: formatDate(target.muted_until, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                        }),
                    })}
                </Banner>
            )}

            <TextField
                label={t("page.community.mod.userGov.reasonLabel")}
                value={reason}
                onValueChange={setReason}
                placeholder={t("page.community.mod.userGov.reasonPlaceholder")}
                maxLength={200}
            />

            {/* Mute / Unmute */}
            {canMuteTarget && (
                <Surface tone="default" radius="md" className="space-y-3 p-3.5">
                    <p className="type-title-s text-on-surface">
                        {t("page.community.mod.userGov.muteSectionTitle")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {MUTE_DURATION_OPTIONS.map((opt) => (
                            <Chip
                                key={opt.hours}
                                variant="filter"
                                selected={muteHours === opt.hours}
                                disabled={isBusy}
                                onClick={() => setMuteHours(opt.hours)}
                            >
                                {t(opt.labelKey)}
                            </Chip>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="filled"
                            size="s"
                            color="error"
                            icon={mdBlock}
                            disabled={isBusy}
                            onClick={() =>
                                void executeAction("mute", {
                                    action: "mute_user",
                                    target_type: "user",
                                    target_id: target.sub,
                                    mute_hours: muteHours,
                                })
                            }
                        >
                            {t("page.community.mod.userGov.muteButton")}
                        </Button>
                        <Button
                            variant={isCurrentlyMuted ? "tonal" : "outlined"}
                            size="s"
                            icon={mdLockOpen}
                            disabled={isBusy}
                            onClick={() =>
                                void executeAction("unmute", {
                                    action: "unmute_user",
                                    target_type: "user",
                                    target_id: target.sub,
                                })
                            }
                        >
                            {t("page.community.mod.userGov.unmuteButton")}
                        </Button>
                    </div>
                </Surface>
            )}

            {/* Chief-mod-only: Moderator Role Assignment */}
            {canChangeRole && (
                <Surface tone="default" radius="md" className="space-y-3 p-3.5">
                    <p className="type-title-s text-on-surface">
                        {t("page.community.mod.userGov.roleSectionTitle")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {target.role === "user" ? (
                            <Button
                                variant="tonal"
                                size="s"
                                icon={mdShield}
                                disabled={isBusy}
                                onClick={() =>
                                    void executeAction("appoint-mod", {
                                        action: "set_role",
                                        target_type: "user",
                                        target_id: target.sub,
                                        role: "mod",
                                    })
                                }
                            >
                                {t("page.community.mod.userGov.appointMod")}
                            </Button>
                        ) : (
                            <Button
                                variant="outlined"
                                size="s"
                                color="error"
                                icon={mdShield}
                                disabled={isBusy}
                                onClick={() =>
                                    void executeAction("revoke-mod", {
                                        action: "set_role",
                                        target_type: "user",
                                        target_id: target.sub,
                                        role: "user",
                                    })
                                }
                            >
                                {t("page.community.mod.userGov.revokeMod")}
                            </Button>
                        )}
                    </div>
                </Surface>
            )}

            {/* Chief-mod-only: Member Level & Verified Creator */}
            {canManageTrustLevel && (
                <Surface tone="default" radius="md" className="space-y-3 p-3.5">
                    <p className="type-title-s text-on-surface">
                        {t("page.community.mod.userGov.levelSectionTitle")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {target.trust_level !== 4 ? (
                            <Button
                                variant="tonal"
                                size="s"
                                icon={mdStar}
                                disabled={isBusy}
                                onClick={() =>
                                    void executeAction("grant-creator", {
                                        action: "set_trust_level",
                                        target_type: "user",
                                        target_id: target.sub,
                                        trust_level: 4,
                                    })
                                }
                            >
                                {t("page.community.mod.userGov.grantCreator")}
                            </Button>
                        ) : (
                            <Button
                                variant="outlined"
                                size="s"
                                color="error"
                                icon={mdStar}
                                disabled={isBusy}
                                onClick={() =>
                                    void executeAction("revoke-creator", {
                                        action: "set_trust_level",
                                        target_type: "user",
                                        target_id: target.sub,
                                        trust_level: 3,
                                    })
                                }
                            >
                                {t("page.community.mod.userGov.revokeCreator")}
                            </Button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        {TRUST_LEVEL_OPTIONS.map((opt) => (
                            <Chip
                                key={opt.id}
                                variant="filter"
                                selected={selectedLevel === opt.id}
                                disabled={isBusy}
                                onClick={() => setSelectedLevel(opt.id)}
                            >
                                {t(opt.labelKey)}
                            </Chip>
                        ))}
                    </div>

                    <div>
                        <Button
                            variant="filled"
                            size="s"
                            disabled={
                                isBusy ||
                                selectedLevel === normalizeMemberTrustLevel(target.trust_level)
                            }
                            onClick={() =>
                                void executeAction("set-level", {
                                    action: "set_trust_level",
                                    target_type: "user",
                                    target_id: target.sub,
                                    trust_level: selectedLevel,
                                })
                            }
                        >
                            {t("page.community.mod.userGov.applyLevel")}
                        </Button>
                    </div>
                </Surface>
            )}
        </div>
    );
}

export default UserGovernancePanel;
