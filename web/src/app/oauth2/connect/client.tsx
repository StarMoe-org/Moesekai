"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, CircularProgress, PageContainer, PageHeader, Surface } from "@/components/md3";
import { formatOAuthErrorMessage, sanitizeOAuthReturnTo, startOAuthConnect } from "@/lib/oauth";

export default function ConnectClient() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    const returnTo = useMemo(() => {
        const value = searchParams.get("returnTo");
        return sanitizeOAuthReturnTo(value);
    }, [searchParams]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                await startOAuthConnect(returnTo);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "OAUTH_INIT_FAILED");
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [returnTo]);

    const errorMessage = error ? formatOAuthErrorMessage(error, t) : null;

    return (
        <MainLayout>
            <PageContainer className="max-w-3xl">
                <Surface tone="low" className="p-6 text-center sm:p-8">
                    <PageHeader align="center" eyebrow={t("page.oauth2.connect.badge")} title={t("page.oauth2.connect.title")} description={t("page.oauth2.connect.description")} className="mb-0 sm:mb-0" />
                    {errorMessage ? (
                        <Banner tone="error" title={t("page.oauth2.connect.errorTitle")} className="mt-6 text-left">
                            <span className="break-all">{errorMessage}</span>
                        </Banner>
                    ) : (
                        <div className="mt-6 flex items-center justify-center gap-3 type-body-m text-on-surface-variant">
                            <CircularProgress size={20} strokeWidth={2} />
                            {t("page.oauth2.connect.loading")}
                        </div>
                    )}
                </Surface>
            </PageContainer>
        </MainLayout>
    );
}
