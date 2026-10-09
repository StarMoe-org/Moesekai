"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, Button, CircularProgress, PageContainer, PageHeader, Surface } from "@/components/md3";
import { completeStarMoeCallback, type StarMoeAuthErrorCode } from "@/lib/starmoe-auth";

function errorMessage(error: StarMoeAuthErrorCode, t: (key: string) => string): string {
    switch (error) {
        case "access_denied":
            return t("common.starmoe.callback.errors.cancelled");
        case "pending_missing":
            return t("common.starmoe.callback.errors.expired");
        case "disabled":
            return t("common.starmoe.callback.errors.disabled");
        default:
            return t("common.starmoe.callback.errors.failed");
    }
}

export default function StarMoeCallbackClient() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const search = searchParams.toString();
    const signingOut = !searchParams.has("code") && !searchParams.has("error");
    const [failure, setFailure] = useState<{ error: StarMoeAuthErrorCode; returnTo: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        void completeStarMoeCallback(search).then((result) => {
            if (cancelled) return;
            if (result.ok) {
                window.location.replace(result.returnTo);
            } else {
                setFailure({ error: result.error, returnTo: result.returnTo });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [search]);

    return (
        <MainLayout>
            <PageContainer className="max-w-3xl">
                <Surface tone="card" className="p-6 sm:p-8">
                    <PageHeader title={t("common.starmoe.callback.title")} className="mb-4 sm:mb-4" />
                    {failure ? (
                        <Banner tone="error" title={t("common.starmoe.callback.failedTitle")}>
                            <p>{errorMessage(failure.error, t)}</p>
                            <Button variant="filled" color="error" className="mt-4" onClick={() => window.location.replace(failure.returnTo)}>
                                {t("common.starmoe.callback.back")}
                            </Button>
                        </Banner>
                    ) : (
                        <div role="status" className="flex items-center gap-3 type-body-m text-on-surface-variant">
                            <CircularProgress size={20} strokeWidth={2} />
                            <span>{signingOut ? t("common.starmoe.callback.returning") : t("common.starmoe.callback.signingIn")}</span>
                        </div>
                    )}
                </Surface>
            </PageContainer>
        </MainLayout>
    );
}
