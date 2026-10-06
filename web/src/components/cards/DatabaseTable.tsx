"use client";
import type { ReactNode } from "react";
import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";

export interface DatabaseRow {
    id: number;
    href: string;
    thumbnail: ReactNode;
    name: ReactNode;
    details: ReactNode;
}

export default function DatabaseTable({ rows, thumbnailClassName = "h-16 w-24" }: { rows: DatabaseRow[]; thumbnailClassName?: string }) {
    const { t } = useI18n();
    return (
        <div className="overflow-x-auto rounded-md3-md border border-outline-variant bg-surface-container-low">
            <table className="w-full min-w-[640px] border-collapse text-left type-body-m text-on-surface">
                <thead className="bg-surface-container-high type-label-l text-on-surface-variant">
                    <tr>
                        <th scope="col" className="w-28 p-3"><span className="sr-only">{t("page.mysekai.detail.thumbnail")}</span></th>
                        <th scope="col" className="p-3">ID</th>
                        <th scope="col" className="p-3">{t("common.field.name")}</th>
                        <th scope="col" className="p-3">{t("common.field.description")}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                    {rows.map(row => <tr key={row.id} className="hover:bg-surface-container">
                        <td className="p-3"><div className={`relative overflow-hidden rounded-md3-sm ${thumbnailClassName}`}>{row.thumbnail}</div></td>
                        <td className="p-3 type-label-m font-mono text-on-surface-variant">{row.id}</td>
                        <th scope="row" className="p-3 font-normal"><Link href={row.href} data-shortcut-item="true" className="state-layer focus-ring block rounded-md3-xs py-2 type-title-s text-primary">{row.name}</Link></th>
                        <td className="p-3 type-body-s text-on-surface-variant">{row.details}</td>
                    </tr>)}
                </tbody>
            </table>
        </div>
    );
}
