"use client";

import { useId } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { cn } from "@/components/md3";
import { ServerRegionIcon } from "@/components/common/ServerRegion";
import { SERVER_IDS, SERVER_LABEL_KEYS, SERVER_SHORT_LABEL_KEYS, type ServerType } from "@/lib/account-servers";

export interface ServerPickerProps {
    value: ServerType;
    onValueChange: (server: ServerType) => void;
    disabled?: boolean;
    /** Id of the visible heading that names the group. */
    labelledBy?: string;
    className?: string;
}

/**
 * Picks one of the five servers: equal tiles in a single row, the server's artwork over a
 * short name, with the full name as tooltip and accessible name. Chips sized to their
 * labels wrap unevenly here, as the names differ widely in length.
 */
export function ServerPicker({ value, onValueChange, disabled = false, labelledBy, className = "" }: ServerPickerProps) {
    const { t } = useI18n();
    const name = useId();
    return (
        <div role="radiogroup" aria-labelledby={labelledBy} className={cn("grid grid-cols-5 gap-1.5 sm:gap-2", className)}>
            {SERVER_IDS.map((server) => {
                const selected = server === value;
                const fullName = t(SERVER_LABEL_KEYS[server]);
                return (
                    <label
                        key={server}
                        title={fullName}
                        className={cn(
                            "state-layer relative flex min-w-0 select-none flex-col items-center justify-center gap-1.5 rounded-md3-md border px-1 py-2.5",
                            "transition-[background-color,border-color] duration-150 ease-md3-standard",
                            "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-secondary",
                            selected
                                ? "border-transparent bg-primary-container text-on-primary-container"
                                : "border-outline-variant text-on-surface-variant",
                            disabled ? "md3-disabled" : "cursor-pointer",
                        )}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={server}
                            checked={selected}
                            disabled={disabled}
                            onChange={() => onValueChange(server)}
                            aria-label={fullName}
                            className="sr-only"
                        />
                        <ServerRegionIcon server={server} size={24} decorative />
                        <span className="max-w-full truncate type-label-l">{t(SERVER_SHORT_LABEL_KEYS[server])}</span>
                    </label>
                );
            })}
        </div>
    );
}
