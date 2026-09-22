"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import Link from "@/components/LocalizedLink";
import ResourceCachePanel from "@/components/mysekai-interactions/ResourceCachePanel";
import { useI18n } from "@/contexts/I18nContext";
import { interactionHref, supportedRegion } from "@/lib/moly/catalog";
import "../interactions.css";

function ResourcesContent() {
    const { t } = useI18n();
    const params = useSearchParams();
    const region = supportedRegion(params.get("region"));
    const snapshot = params.get("snapshot");
    const snapshotId = snapshot && /^[a-z0-9][a-z0-9._-]{0,95}$/.test(snapshot) ? snapshot : undefined;
    const href = region ? interactionHref({ region, snapshot: snapshotId }) : "/mysekai/interactions/";
    return <main className="mysekai-interactions">
        <header className="interaction-page-heading"><h1>{t("page.mysekaiInteractions.r4b.manageResources")}</h1>
            <nav><Link href={href}>{t("page.mysekaiInteractions.r4b.backToInteractions")}</Link></nav></header>
        <ResourceCachePanel playerOpen={false} reloadHref={href} region={region} snapshot={snapshotId} />
    </main>;
}

export default function ResourcesClient() {
    return <MainLayout><Suspense><ResourcesContent /></Suspense></MainLayout>;
}
