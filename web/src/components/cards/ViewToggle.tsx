"use client";

import { SegmentedButton, type SegmentOption } from "@/components/md3";
import { mdGridView, mdPanorama, mdViewList } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";

export type ListViewMode = "grid" | "table";
export type CardViewMode = "grid" | "large" | "table";

interface ViewToggleProps<T extends CardViewMode = ListViewMode> {
    value: T;
    onChange: (value: T) => void;
    includeLarge?: boolean;
}

/** Grid/list switch: the same 40px track and spotlight fill as every other segmented control. */
export default function ViewToggle<T extends CardViewMode = ListViewMode>({
    value,
    onChange,
    includeLarge = false,
}: ViewToggleProps<T>) {
    const { t } = useI18n();
    const options: SegmentOption<T>[] = [
        { value: "grid" as T, label: t("common.view.grid"), icon: mdGridView },
        ...(includeLarge
            ? [{ value: "large" as T, label: t("common.view.large"), icon: mdPanorama }]
            : []),
        { value: "table" as T, label: t("common.view.table"), icon: mdViewList },
    ];
    return (
        <SegmentedButton
            aria-label={t("common.view.label")}
            iconOnly
            className="w-auto"
            value={value}
            onValueChange={onChange}
            options={options}
        />
    );
}
