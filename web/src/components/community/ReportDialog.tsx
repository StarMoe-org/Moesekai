"use client";

import React, { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, Button, Chip, Dialog } from "@/components/md3";
import { mdFlag, mdSupportAgent } from "@/components/md3/icons";
import { createAppeal, createReport, getCommunityErrorMessage } from "@/lib/community-api";
import { useCommunitySession } from "@/lib/community-session";
import TurnstileWidget from "./TurnstileWidget";
import { REPORT_REASON_OPTIONS, type ReportReason } from "@/types/community";

interface ReportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    targetType: "post" | "comment";
    targetId: number;
    onSubmitted?: (result: { autoCollapsed: boolean }) => void;
}

export function ReportDialog({
    isOpen,
    onClose,
    targetType,
    targetId,
    onSubmitted,
}: ReportDialogProps) {
    const { t } = useI18n();
    const session = useCommunitySession({ eager: false });
    const [reason, setReason] = useState<ReportReason>("harassment");
    const [detail, setDetail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);

    const needsTurnstile = Boolean(session.turnstileSiteKey);

    const handleClose = () => {
        setError(null);
        setSubmittedNotice(null);
        setDetail("");
        setTurnstileToken("");
        onClose();
    };

    const handleSubmit = async () => {
        if (needsTurnstile && !turnstileToken) {
            setError(t("common.comments.errors.turnstileFailed"));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await createReport({
                target_type: targetType,
                target_id: targetId,
                reason,
                detail: detail.trim() || undefined,
                turnstile_token: turnstileToken || undefined,
            });
            setTurnstileToken("");
            setTurnstileResetNonce((n) => n + 1);
            setSubmittedNotice(
                res.auto_collapsed
                    ? t("common.comments.report.submittedCollapsed")
                    : t("common.comments.report.submitted"),
            );
            onSubmitted?.({ autoCollapsed: res.auto_collapsed });
        } catch (err) {
            setTurnstileToken("");
            setTurnstileResetNonce((n) => n + 1);
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleClose}
            icon={mdFlag}
            title={t("common.comments.report.title")}
            supportingText={t("common.comments.report.subtitle")}
            size="md"
            actions={
                submittedNotice ? (
                    <Button variant="filled" onClick={handleClose}>
                        {t("common.action.close")}
                    </Button>
                ) : (
                    <>
                        <Button variant="text" onClick={handleClose} disabled={submitting}>
                            {t("common.action.cancel")}
                        </Button>
                        <Button
                            variant="filled"
                            color="error"
                            onClick={handleSubmit}
                            disabled={submitting || (needsTurnstile && !turnstileToken)}
                        >
                            {submitting
                                ? t("common.comments.report.submitting")
                                : t("common.comments.report.submit")}
                        </Button>
                    </>
                )
            }
        >
            <div className="space-y-4">
                {submittedNotice ? (
                    <Banner tone="info">{submittedNotice}</Banner>
                ) : (
                    <>
                        <div>
                            <p className="mb-2 type-label-l text-on-surface">
                                {t("common.comments.report.reasonLabel")}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {REPORT_REASON_OPTIONS.map((option) => (
                                    <Chip
                                        key={option.id}
                                        variant="filter"
                                        selected={reason === option.id}
                                        onClick={() => setReason(option.id)}
                                    >
                                        {t(option.labelKey)}
                                    </Chip>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label
                                htmlFor="community-report-detail"
                                className="mb-1.5 block type-label-l text-on-surface"
                            >
                                {t("common.comments.report.detailLabel")}
                            </label>
                            <textarea
                                id="community-report-detail"
                                value={detail}
                                onChange={(e) => setDetail(e.target.value)}
                                maxLength={500}
                                rows={3}
                                placeholder={t("common.comments.report.detailPlaceholder")}
                                className="w-full rounded-md3-md border border-outline-variant bg-surface-container-lowest p-3 type-body-m text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                            />
                        </div>

                        {needsTurnstile && (
                            <TurnstileWidget
                                siteKey={session.turnstileSiteKey}
                                onToken={setTurnstileToken}
                                resetNonce={turnstileResetNonce}
                            />
                        )}

                        {error && <Banner tone="error">{error}</Banner>}
                    </>
                )}
            </div>
        </Dialog>
    );
}

interface AppealDialogProps {
    isOpen: boolean;
    onClose: () => void;
    targetType: "post" | "comment";
    targetId: number;
    moderationEventId?: number;
}

export function AppealDialog({
    isOpen,
    onClose,
    targetType,
    targetId,
    moderationEventId,
}: AppealDialogProps) {
    const { t } = useI18n();
    const session = useCommunitySession({ eager: false });
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);

    const needsTurnstile = Boolean(session.turnstileSiteKey);

    const handleClose = () => {
        setError(null);
        setDone(false);
        setReason("");
        setTurnstileToken("");
        onClose();
    };

    const handleSubmit = async () => {
        const trimmed = reason.trim();
        if (!trimmed) {
            setError(t("common.comments.errors.emptyContent"));
            return;
        }
        if (needsTurnstile && !turnstileToken) {
            setError(t("common.comments.errors.turnstileFailed"));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await createAppeal({
                target_type: targetType,
                target_id: targetId,
                reason: trimmed,
                moderation_event_id: moderationEventId,
                turnstile_token: turnstileToken || undefined,
            });
            setTurnstileToken("");
            setTurnstileResetNonce((n) => n + 1);
            setDone(true);
        } catch (err) {
            setTurnstileToken("");
            setTurnstileResetNonce((n) => n + 1);
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleClose}
            icon={mdSupportAgent}
            title={t("common.comments.appeal.title")}
            supportingText={t("common.comments.appeal.subtitle")}
            size="md"
            actions={
                done ? (
                    <Button variant="filled" onClick={handleClose}>
                        {t("common.action.close")}
                    </Button>
                ) : (
                    <>
                        <Button variant="text" onClick={handleClose} disabled={submitting}>
                            {t("common.action.cancel")}
                        </Button>
                        <Button
                            variant="filled"
                            onClick={handleSubmit}
                            disabled={submitting || (needsTurnstile && !turnstileToken)}
                        >
                            {submitting
                                ? t("common.comments.appeal.submitting")
                                : t("common.comments.appeal.submit")}
                        </Button>
                    </>
                )
            }
        >
            <div className="space-y-3">
                {done ? (
                    <Banner tone="info">{t("common.comments.appeal.submitted")}</Banner>
                ) : (
                    <>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={800}
                            rows={4}
                            placeholder={t("common.comments.appeal.placeholder")}
                            className="w-full rounded-md3-md border border-outline-variant bg-surface-container-lowest p-3 type-body-m text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                        />
                        {needsTurnstile && (
                            <TurnstileWidget
                                siteKey={session.turnstileSiteKey}
                                onToken={setTurnstileToken}
                                resetNonce={turnstileResetNonce}
                            />
                        )}
                        {error && <Banner tone="error">{error}</Banner>}
                    </>
                )}
            </div>
        </Dialog>
    );
}

export default ReportDialog;
