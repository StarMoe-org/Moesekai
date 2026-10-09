"use client";

import { Icon, withOverrides } from "@/components/md3";
import { mdMusicOff } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";

/** Marks a clip played with its vocals removed. */
export default function VocalRemovalBadge({ className }: { className?: string }) {
    const { t } = useI18n();
    return (
        <span
            className={withOverrides(
                "inline-flex h-6 items-center gap-1 rounded-md3-sm bg-tertiary-container px-2 type-label-m text-on-tertiary-container",
                className,
            )}
        >
            <Icon path={mdMusicOff} size={16} />
            {t("page.guessMusic.vocalRemovalOn")}
        </span>
    );
}
