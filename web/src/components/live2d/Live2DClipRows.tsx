"use client";
import { CircularProgress, Icon, cn } from "@/components/md3";
import { mdPlayArrowFill } from "@/components/md3/icons";
import type { Live2DClipRow } from "@/lib/live2dViewer/clips";

interface Live2DClipRowsProps {
    rows: readonly Live2DClipRow[];
    /** A row's name in words (its known words translated, else as spelled). */
    label: (row: Live2DClipRow) => string;
    /** The clip playing or shown, the one being fetched, and the default one. */
    current: string | null;
    pending: string | null;
    fallback: string | null;
    onPick: (name: string) => void;
}

/**
 * Clips as rows: an action's or emotion's name, then a button per variant. A row of one clip
 * without a variant has a play button instead of a number.
 */
export function Live2DClipRows({ rows, label, current, pending, fallback, onPick }: Live2DClipRowsProps) {
    return (
        <ul className="divide-y divide-outline-variant/60">
            {rows.map(row => {
                const name = label(row);
                const active = row.clips.some(clip => clip.name === current);
                return (
                    <li key={row.key} className="flex items-start gap-3 py-2">
                        <div className="w-24 shrink-0 pt-1.5">
                            <p className={cn("truncate type-label-l", active ? "text-primary" : "text-on-surface")} title={name}>{name}</p>
                            {row.tag && <p className="truncate font-mono type-label-s text-on-surface-variant">{row.tag}</p>}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                            {row.clips.map(clip => {
                                const selected = clip.name === current;
                                const loading = clip.name === pending;
                                return (
                                    <button
                                        key={clip.name}
                                        type="button"
                                        title={clip.name}
                                        aria-pressed={selected}
                                        aria-label={clip.code ? `${name} ${clip.code}` : name}
                                        onClick={() => onPick(clip.name)}
                                        className={cn(
                                            "state-layer focus-ring relative inline-flex h-8 min-w-10 items-center justify-center gap-1 rounded-md3-sm px-2 font-mono type-label-m transition-colors",
                                            selected ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface",
                                        )}
                                    >
                                        {loading ? (
                                            <CircularProgress size={14} strokeWidth={2} />
                                        ) : clip.code ? (
                                            clip.code
                                        ) : (
                                            <Icon path={mdPlayArrowFill} size={16} />
                                        )}
                                        {clip.name === fallback && !selected && (
                                            <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
