"use client";
import React from "react";
import SekaiLoader from "./SekaiLoader";
import { useShellImmersiveMode } from "./AppShell";
import DetailSeoSummary from "@/components/seo/DetailSeoSummary";
import { useDetailSeoSummary } from "@/contexts/DetailSeoSummaryContext";

interface MainLayoutProps {
    children: React.ReactNode;
    showLoader?: boolean;
    immersiveMode?: boolean;
}

/**
 * A page's content inside the app chrome. The chrome itself (AppShell) is mounted once by the
 * root layout and survives navigations, so this renders only what belongs to the page. Leaving
 * MainLayout out does not drop the chrome: a full-screen page goes in AppShell's BARE_ROUTE.
 */
export default function MainLayout({
    children,
    showLoader = false,
    immersiveMode = false,
}: MainLayoutProps) {
    const detailSeoSummary = useDetailSeoSummary();
    useShellImmersiveMode(immersiveMode);

    return (
        <>
            {/* Loading Animation */}
            {showLoader && <SekaiLoader />}
            {children}
            {detailSeoSummary && (
                <DetailSeoSummary
                    title={detailSeoSummary.title}
                    description={detailSeoSummary.description}
                    locale={detailSeoSummary.locale}
                    semantic={detailSeoSummary.semantic}
                />
            )}
        </>
    );
}
