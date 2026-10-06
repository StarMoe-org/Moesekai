"use client";

import { IconButton } from "@/components/md3";
import { mdGridView, mdViewList } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";

export type ListViewMode = "grid" | "table";

interface ViewToggleProps {
    value: ListViewMode;
    onChange: (value: ListViewMode) => void;
}

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
    const { t } = useI18n();
    const label = t("common.view.label");
    return (
        <div className="flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container p-1" role="group" aria-label={label}>
            <IconButton icon={mdGridView} label={t("common.view.grid")} selected={value === "grid"} variant="tonal" size="s" onClick={() => onChange("grid")} />
            <IconButton icon={mdViewList} label={t("common.view.table")} selected={value === "table"} variant="tonal" size="s" onClick={() => onChange("table")} />
        </div>
    );
}
