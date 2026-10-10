"use client";
import Image from "next/image";
import { Icon, cn } from "@/components/md3";
import { mdClose } from "@/components/md3/icons";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getMusicJacketUrl } from "@/lib/assets";

interface SongSuggestionOptionProps {
    id: string;
    title: string;
    /** Second line: the localized title, or the alias that matched. */
    secondary?: string;
    /** The song's assetbundleName, for its jacket. */
    jacket?: string;
    assetSource?: AssetSourceType;
    active: boolean;
    /** Already guessed wrong this round: still listed, but cannot be picked. */
    guessed?: boolean;
    onActivate: () => void;
    onPick: () => void;
}

/**
 * One row of a song suggestion list, shared by the daily challenge and free
 * play. The jacket slot is always there, so a row with a second line and a
 * row without one are the same height.
 */
export default function SongSuggestionOption({ id, title, secondary, jacket, assetSource = "main-jp", active, guessed, onActivate, onPick }: SongSuggestionOptionProps) {
    return (
        <li
            id={id}
            role="option"
            aria-selected={active}
            aria-disabled={guessed || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={onActivate}
            onClick={onPick}
            className={cn(
                "state-layer flex cursor-pointer items-center gap-3 rounded-md3-md px-3 py-2 transition-colors",
                active ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container text-on-surface",
                guessed && "cursor-not-allowed opacity-38",
            )}
        >
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md3-sm bg-surface-container-highest">
                {jacket ? <Image src={getMusicJacketUrl(jacket, assetSource)} alt="" fill sizes="40px" className="object-cover" unoptimized /> : null}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate type-body-l">{title}</span>
                {secondary ? (
                    <span className={cn("block truncate type-body-s", active ? "text-on-secondary-container" : "text-on-surface-variant")}>{secondary}</span>
                ) : null}
            </span>
            {guessed ? <Icon path={mdClose} size={18} className="shrink-0 text-error" /> : null}
        </li>
    );
}
