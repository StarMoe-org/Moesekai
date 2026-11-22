"use client";

import React, { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, Button, Dialog } from "@/components/md3";
import { mdGavel } from "@/components/md3/icons";
import { acceptCommunityPolicy } from "@/lib/community-session";
import { getCommunityErrorMessage } from "@/lib/community-api";

interface PolicyAgreementDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onAccepted?: () => void;
}

export function PolicyAgreementDialog({
    isOpen,
    onClose,
    onAccepted,
}: PolicyAgreementDialogProps) {
    const { t } = useI18n();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAccept = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await acceptCommunityPolicy();
            onClose();
            onAccepted?.();
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            icon={mdGavel}
            title={t("common.comments.policy.title")}
            supportingText={t("common.comments.policy.subtitle")}
            size="md"
            actions={
                <>
                    <Button variant="text" onClick={onClose} disabled={submitting}>
                        {t("common.action.cancel")}
                    </Button>
                    <Button variant="filled" onClick={handleAccept} disabled={submitting}>
                        {submitting
                            ? t("common.comments.policy.accepting")
                            : t("common.comments.policy.acceptButton")}
                    </Button>
                </>
            }
        >
            <div className="space-y-3 type-body-m text-on-surface">
                <ul className="list-disc space-y-2 pl-5 text-on-surface-variant">
                    <li>{t("common.comments.policy.rules.pjskOnly")}</li>
                    <li>{t("common.comments.policy.rules.noPolitics")}</li>
                    <li>{t("common.comments.policy.rules.noHarassment")}</li>
                    <li>{t("common.comments.policy.rules.noSpamOrDoxxing")}</li>
                    <li>{t("common.comments.policy.rules.markSpoilers")}</li>
                </ul>

                <p className="rounded-md3-md bg-surface-container p-3 type-body-s text-on-surface-variant">
                    {t("common.comments.policy.moderationNote")}
                </p>

                {error && <Banner tone="error">{error}</Banner>}
            </div>
        </Dialog>
    );
}

export default PolicyAgreementDialog;
