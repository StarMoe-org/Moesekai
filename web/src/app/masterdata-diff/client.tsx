"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { LoadingState } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";

/**
 * Legacy /masterdata-diff route: redirects seamlessly to the merged
 * /asset-versions page while preserving server, sha, tab, and file query params.
 */
export default function MasterdataDiffClient() {
    const router = useRouter();
    const { t } = useI18n();

    useEffect(() => {
        const search = typeof window !== "undefined" ? window.location.search : "";
        router.replace(`/asset-versions${search}`);
    }, [router]);

    return (
        <MainLayout>
            <LoadingState label={t("common.state.loading")} />
        </MainLayout>
    );
}
