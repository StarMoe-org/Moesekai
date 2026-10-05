"use client";
import { useI18n } from "@/contexts/I18nContext";

/**
 * Advanced search syntax help panel, rendered inside the search box area
 * (toggled by the "?" button in BaseFilters).
 *
 * Built-in rows explain the shared grammar (space/AND/OR/parens/range/quotes);
 * `fieldItems` renders the field registry of the host page (id/date for cards,
 * plus level/difficulty/bpm for music) — driven by the same list the page
 * uses to configure the parser.
 */
export interface SearchSyntaxHelpFieldItem {
    /** Localized field description, e.g. "id: — ID filter (equal / list / range)" */
    label: string;
    /** Example snippet shown on the right */
    example: string;
}

interface SearchSyntaxHelpProps {
    fieldItems: SearchSyntaxHelpFieldItem[];
}

export default function SearchSyntaxHelp({ fieldItems }: SearchSyntaxHelpProps) {
    const { t } = useI18n();

    const baseRows: { label: string; example: string }[] = [
        { label: t("search.syntax.space"), example: "leo vivid" },
        { label: t("search.syntax.andExplicit"), example: "leo AND 1-100" },
        { label: t("search.syntax.or"), example: "leo OR vivid" },
        { label: t("search.syntax.group"), example: "(leo OR vivid) AND 1-100" },
        { label: t("search.syntax.range"), example: "1-100" },
        { label: t("search.syntax.quote"), example: '"505" · "ab\\"c"' },
        { label: t("search.syntax.numericOnly"), example: "" },
    ];

    const rows = [...baseRows, ...fieldItems];

    return (
        <div className="space-y-2 rounded-md3-md bg-surface-container-high p-3.5 type-body-s text-on-surface">
            <p className="mb-1 type-title-s text-on-surface">
                {t("search.syntax.title")}
            </p>
            {rows.map((row, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3">
                    <span className="text-on-surface-variant">{row.label}</span>
                    {row.example !== "" && (
                        <code className="whitespace-nowrap font-mono text-[11px] text-primary">
                            {row.example}
                        </code>
                    )}
                </div>
            ))}
        </div>
    );
}