"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, TextField, cn } from "@/components/md3";
import { mdCheckroom, mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import type { RoleCostume } from "@/lib/costume3d/look";

const PAGE = 60;

interface CostumeListProps {
    costumes: RoleCostume[];
    selected: number | null;
    onSelect: (costume: RoleCostume) => void;
    /** The costume's thumbnail in the given colour, when the site has one. */
    thumbnail: (costume: RoleCostume, colorId: number) => string | null;
    /** Costumes after `now` are marked as not yet released (only listed when spoilers are shown). */
    now: number;
    className?: string;
    /** Two columns of tiles instead of rows (narrow screens). */
    grid?: boolean;
}

/** A role's costumes, newest first, with a search by name (or translated name) and number. */
export function CostumeList({ costumes, selected, onSelect, thumbnail, now, className = "", grid = false }: CostumeListProps) {
    const { t, formatDate } = useI18n();
    const { t: translate } = useTranslation();
    const [query, setQuery] = useState("");
    const [shown, setShown] = useState(PAGE);
    const selectedRef = useRef<HTMLButtonElement>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return costumes;
        return costumes.filter(costume => String(costume.costumeNumber) === q
            || costume.name.toLowerCase().includes(q)
            || (translate("costumes", "name", costume.name) ?? "").toLowerCase().includes(q));
    }, [costumes, query, translate]);

    // A selected costume deep in the list (from a link) is listed and scrolled to.
    const selectedIndex = filtered.findIndex(costume => costume.costumeNumber === selected);
    const visible = filtered.slice(0, Math.max(shown, selectedIndex + 1));
    useEffect(() => {
        // only when the list or the selection changes, not on every render
        selectedRef.current?.scrollIntoView({ block: "nearest" });
    }, [costumes, selected]);

    return (
        <div className={cn("flex min-h-0 flex-col", className)}>
            <TextField
                icon={mdSearch}
                value={query}
                onValueChange={value => { setQuery(value); setShown(PAGE); }}
                clearable
                clearLabel={t("page.costume3d.clearSearch")}
                placeholder={t("page.costume3d.searchPlaceholder")}
                aria-label={t("page.costume3d.searchPlaceholder")}
            />
            <p className="px-1 pb-2 pt-3 type-label-m text-on-surface-variant">
                {t("page.costume3d.costumeCount", { count: filtered.length })}
            </p>
            {filtered.length === 0 ? (
                <p className="px-1 py-8 text-center type-body-m text-on-surface-variant">{t("page.costume3d.noCostumes")}</p>
            ) : (
                <div className={cn("min-h-0 flex-1 overflow-y-auto", grid ? "grid grid-cols-2 content-start gap-2" : "flex flex-col gap-1")}>
                    {visible.map(costume => {
                        const isSelected = costume.costumeNumber === selected;
                        const src = thumbnail(costume, costume.colors[0]?.colorId ?? 1);
                        const translated = translate("costumes", "name", costume.name);
                        const upcoming = costume.publishedAt == null || costume.publishedAt > now;
                        return (
                            <button
                                key={costume.costumeNumber}
                                ref={isSelected ? selectedRef : undefined}
                                type="button"
                                onClick={() => onSelect(costume)}
                                aria-pressed={isSelected}
                                className={cn(
                                    "state-layer focus-ring flex items-center gap-3 rounded-md3-md p-2 text-left transition-colors",
                                    grid && "flex-col items-stretch text-center",
                                    isSelected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                )}
                            >
                                <span className={cn("relative shrink-0 overflow-hidden rounded-md3-sm bg-surface-container-high", grid ? "aspect-square w-full" : "h-14 w-14")}>
                                    {src ? (
                                        <Image src={src} alt="" fill className="object-contain" unoptimized />
                                    ) : (
                                        <Icon path={mdCheckroom} className="absolute inset-0 m-auto h-6 w-6 text-on-surface-variant" />
                                    )}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate type-title-s">{translated || costume.name}</span>
                                    <span className={cn("block truncate type-body-s", isSelected ? "text-on-secondary-container" : "text-on-surface-variant")}>
                                        #{costume.costumeNumber}
                                        {" · "}
                                        {t("page.costume3d.colorCount", { count: costume.colors.length })}
                                        {costume.publishedAt != null && !upcoming && ` · ${formatDate(costume.publishedAt, { dateStyle: "medium" })}`}
                                    </span>
                                    {upcoming && (
                                        <span className="mt-1 inline-block rounded-md3-xs bg-tertiary-container px-1.5 type-label-s text-on-tertiary-container">
                                            {t("page.costume3d.upcoming")}
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                    {visible.length < filtered.length && (
                        <Button variant="text" className={grid ? "col-span-2" : ""} onClick={() => setShown(n => n + PAGE)}>
                            {t("page.costume3d.showMore", { count: filtered.length - visible.length })}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
