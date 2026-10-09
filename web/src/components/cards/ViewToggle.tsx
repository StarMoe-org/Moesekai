"use client";

import { SegmentedButton } from "@/components/md3";
import { mdGridView, mdViewList } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";

export type ListViewMode = "grid" | "table";

interface ViewToggleProps {
    value: ListViewMode;
    onChange: (value: ListViewMode) => void;
}

/** Grid/list switch: the same 40px track and spotlight fill as every other segmented control. */
export default function ViewToggle({ value, onChange }: ViewToggleProps) {
    const { t } = useI18n();
    return (
        <SegmentedButton
            aria-label={t("common.view.label")}
            iconOnly
            className="w-auto"
            value={value}
            onValueChange={onChange}
            options={[
                { value: "grid", label: t("common.view.grid"), icon: mdGridView },
                { value: "table", label: t("common.view.table"), icon: mdViewList },
            ]}
        />
    );
}
