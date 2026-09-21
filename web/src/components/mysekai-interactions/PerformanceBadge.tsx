"use client";

import { useI18n } from "@/contexts/I18nContext";

/** Authored furniture performances, as classified by the source catalog. */
export default function PerformanceBadge() {
    const { t } = useI18n();
    return <span className="workspace-performance-tag" data-performance-badge>
        <span className="workspace-performance-symbol" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none">
                <path d="m6 5 7.5 5L6 15V5Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
                <path d="M15.5 2v4M13.5 4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
        </span>
        {t("page.mysekaiInteractions.category.fixture_performance")}
    </span>;
}
