"use client";

import { Select } from "@/components/md3";

export interface TranslationEditionSelectOption {
    key: string;
    label: string;
    isDefault?: boolean;
}

interface TranslationEditionSelectProps {
    options: readonly TranslationEditionSelectOption[];
    value: string;
    onChange: (key: string) => void;
    label: string;
    currentLabel: string;
    defaultLabel?: string;
    listLabel: string;
    className?: string;
}

/** Compatibility adapter retaining the lyrics selector's public API while using the shared MD3 Select. */
export default function TranslationEditionSelect({
    options,
    value,
    onChange,
    label,
    currentLabel,
    defaultLabel,
    listLabel,
    className,
}: TranslationEditionSelectProps) {
    const selectedOption = options.find((option) => option.key === value);
    return (
        <Select
            value={value}
            onValueChange={onChange}
            options={options.map((option) => ({ value: option.key, label: option.label, textValue: option.label }))}
            label={label}
            aria-label={currentLabel}
            listLabel={listLabel}
            selectedLabel={selectedOption?.label ?? defaultLabel ?? currentLabel}
            className={className}
        />
    );
}
