"use client";

import { useI18n } from "@/contexts/I18nContext";

export default function CatalogPagination({ page, pages, total, pageSize, onPage }: {
    page: number; pages: number; total: number; pageSize: number; onPage(page: number): void;
}) {
    const { t } = useI18n();
    if (total === 0) return null;
    const visible = Array.from(new Set([1, pages, page - 1, page, page + 1].filter(value => value >= 1 && value <= pages))).sort((a, b) => a - b);
    return <nav className="interaction-pagination" aria-label={t("page.mysekaiInteractions.r5.pagination")}>
        <span className="interaction-page-range" aria-live="polite">{t("page.mysekaiInteractions.r5.range", { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, total), total })}</span>
        <div className="interaction-page-controls">
            <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label={t("page.mysekaiInteractions.r5.previous")} data-page-action="previous">‹</button>
            {visible.map((number, index) => <span className="interaction-page-slot" key={number}>
                {index > 0 && number - visible[index - 1] > 1 && <span className="interaction-page-ellipsis">…</span>}
                <button type="button" aria-current={number === page ? "page" : undefined}
                    aria-label={t("page.mysekaiInteractions.r5.page", { page: number, pages })} onClick={() => onPage(number)} data-page-number={number}>{number}</button>
            </span>)}
            <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label={t("page.mysekaiInteractions.r5.next")} data-page-action="next">›</button>
        </div>
    </nav>;
}
