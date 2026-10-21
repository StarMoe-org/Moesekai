"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Button, Icon, TextField, cn } from "@/components/md3";
import { mdBlock, mdCheckroom, mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { blocked, modelKey, type Costume3dLook, type RoleCostume } from "@/lib/costume3d/look";
import type { Costume3dCatalog, Costume3dPart, Costume3dVariant } from "@/types/costume3d";

const HEADS_SHOWN = 200;

/** A small square thumbnail, or the costume icon when the site has none. */
function Thumb({ src, className = "h-8 w-8" }: { src: string | null; className?: string }) {
    return (
        <span className={cn("relative shrink-0 overflow-hidden rounded-md3-xs bg-surface-container-high", className)}>
            {src ? <Image src={src} alt="" fill className="object-contain" unoptimized /> : (
                <Icon path={mdCheckroom} className="absolute inset-0 m-auto h-4 w-4 text-on-surface-variant" />
            )}
        </span>
    );
}

function SectionTitle({ children, follow }: { children: React.ReactNode; follow?: { label: string; onClick: () => void } | null }) {
    return (
        <div className="flex min-h-10 items-center justify-between gap-2">
            <h2 className="type-title-s text-on-surface">{children}</h2>
            {follow && <Button variant="text" size="xs" onClick={follow.onClick}>{follow.label}</Button>}
        </div>
    );
}

interface LookPanelProps {
    costume: RoleCostume;
    colorId: number;
    onColor: (colorId: number) => void;
    catalog: Costume3dCatalog;
    variant: Costume3dVariant | null;
    look: Costume3dLook | null;
    hairs: Costume3dPart[];
    heads: Costume3dPart[];
    /** What was picked over the costume: null follows it, a head of 0 is none. */
    hair: number | null;
    head: number | null;
    onHair: (id: number | null) => void;
    onHead: (id: number | null) => void;
    /** Thumbnail of a costume colour or of a hair / head part, when the site has one. */
    colorThumbnail: (colorId: number) => string | null;
    partThumbnail: (part: Costume3dPart) => string | null;
    /** The name of a costume's colour, when one is known. */
    colorNameOf: (costumeNumber: number, colorId: number) => string;
    /** Parts released after now are listed only when spoilers are shown. */
    now: number;
    showSpoilers: boolean;
}

/** Colour, hair and head of the look: what the game's costume screen lets one change. */
export function LookPanel(props: LookPanelProps) {
    const { costume, colorId, onColor, catalog, variant, look, hairs, heads, hair, head, onHair, onHead, colorThumbnail, partThumbnail, colorNameOf, now, showSpoilers } = props;
    const { t } = useI18n();
    const { t: translate } = useTranslation();
    const [headQuery, setHeadQuery] = useState("");
    const name = (part: Costume3dPart) => translate("costumes", "name", part.name) || part.name;

    const colorName = (color: RoleCostume["colors"][number]) => {
        const translated = color.colorName ? translate("costumes", "colorName", color.colorName) || color.colorName : "";
        return translated || t("page.costume3d.colorNumber", { number: color.colorId });
    };

    const headId = look?.head?.costume3dId ?? null;
    const wornHead = look?.head ? modelKey(look.head) : look?.accessory ? null : "none";
    const ownHeads = useMemo(() => new Set(
        [variant?.head, ...(variant?.alternativeHeads ?? [])]
            .map(id => catalog.parts.find(part => part.costume3dId === id))
            .filter((part): part is Costume3dPart => Boolean(part?.model))
            .map(modelKey),
    ), [catalog, variant]);

    const headList = useMemo(() => {
        const q = headQuery.trim().toLowerCase();
        const rank = (part: Costume3dPart) => (modelKey(part) === wornHead ? 2 : ownHeads.has(modelKey(part)) ? 1 : 0);
        return heads
            .filter(part => (showSpoilers || (part.publishedAt != null && part.publishedAt <= now))
                && (!q || String(part.costumeNumber) === q || part.name.toLowerCase().includes(q) || name(part).toLowerCase().includes(q)))
            .sort((a, b) => rank(b) - rank(a));
        // name() reads translations, which do not change while the page is open
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [heads, headQuery, ownHeads, wornHead, showSpoilers, now]);

    const visibleHairs = hairs.filter(part => showSpoilers || part.costumeNumber === 0 || (part.publishedAt != null && part.publishedAt <= now));
    // A head's colour is named after its costume's colour of the same id (heads carry no name of their own).
    const headColor = (part: Costume3dPart) => {
        if (part.colorId <= 1) return "";
        const named = colorNameOf(part.costumeNumber, part.colorId);
        return named ? translate("costumes", "colorName", named) || named : t("page.costume3d.colorNumber", { number: part.colorId });
    };

    return (
        <div className="flex flex-col gap-4">
            <section>
                <SectionTitle>{t("page.costume3d.color")}</SectionTitle>
                <div className="flex flex-wrap gap-2">
                    {costume.colors.map(color => {
                        const isSelected = color.colorId === colorId;
                        return (
                            <button
                                key={color.colorId}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => onColor(color.colorId)}
                                className={cn(
                                    "state-layer focus-ring flex items-center gap-2 rounded-md3-sm py-1 pl-1 pr-3 type-label-l transition-colors",
                                    isSelected ? "bg-primary-container text-on-primary-container" : "border border-outline-variant text-on-surface-variant",
                                )}
                            >
                                <Thumb src={colorThumbnail(color.colorId)} />
                                {colorName(color)}
                            </button>
                        );
                    })}
                </div>
            </section>

            <section>
                <SectionTitle follow={hair != null ? { label: t("page.costume3d.followCostume"), onClick: () => onHair(null) } : null}>
                    {t("page.costume3d.hair")}
                </SectionTitle>
                {look?.fullHead && (
                    <p className="mb-2 type-body-s text-on-surface-variant">
                        {t("page.costume3d.hairLockedByFullHead", { name: look.head ? name(look.head) : "" })}
                    </p>
                )}
                <div className="flex flex-wrap gap-2">
                    {visibleHairs.map(part => {
                        const isSelected = !look?.fullHead && look?.hair?.costume3dId === part.costume3dId;
                        // under a complete head every hair is off; the head's own list of blocked hairs says nothing more
                        const isBlocked = !look?.fullHead && blocked(catalog, headId, part.costume3dId);
                        const disabled = Boolean(look?.fullHead) || isBlocked;
                        return (
                            <button
                                key={part.costume3dId}
                                type="button"
                                aria-pressed={isSelected}
                                disabled={disabled}
                                title={isBlocked ? t("page.costume3d.incompatible") : undefined}
                                onClick={() => onHair(part.costume3dId)}
                                className={cn(
                                    "state-layer focus-ring flex max-w-full items-center gap-2 rounded-md3-sm py-1 pl-1 pr-3 text-left type-label-l transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                    isSelected ? "bg-primary-container text-on-primary-container" : "border border-outline-variant text-on-surface-variant",
                                )}
                            >
                                <Thumb src={partThumbnail(part)} />
                                <span className="truncate">{part.costumeNumber === 0 ? t("page.costume3d.defaultHair") : name(part)}</span>
                                {isBlocked && <Icon path={mdBlock} className="h-4 w-4" />}
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="flex min-h-0 flex-col">
                <SectionTitle follow={head != null ? { label: t("page.costume3d.followCostume"), onClick: () => onHead(null) } : null}>
                    {t("page.costume3d.head")}
                </SectionTitle>
                <TextField
                    icon={mdSearch}
                    value={headQuery}
                    onValueChange={setHeadQuery}
                    clearable
                    clearLabel={t("page.costume3d.clearSearch")}
                    placeholder={t("page.costume3d.headSearchPlaceholder")}
                    aria-label={t("page.costume3d.headSearchPlaceholder")}
                />
                <div className="mt-2 flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
                    <button
                        type="button"
                        aria-pressed={wornHead === "none"}
                        onClick={() => onHead(0)}
                        className={cn(
                            "state-layer focus-ring flex items-center gap-3 rounded-md3-sm p-1.5 text-left type-body-m",
                            wornHead === "none" ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                        )}
                    >
                        <span className="grid h-10 w-10 place-items-center rounded-md3-xs bg-surface-container-high">
                            <Icon path={mdBlock} className="h-5 w-5 text-on-surface-variant" />
                        </span>
                        {t("page.costume3d.noHead")}
                    </button>
                    {headList.slice(0, HEADS_SHOWN).map(part => {
                        const key = modelKey(part);
                        const isSelected = key === wornHead;
                        const color = headColor(part);
                        return (
                            <button
                                key={part.costume3dId}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => onHead(part.costume3dId)}
                                className={cn(
                                    "state-layer focus-ring flex items-center gap-3 rounded-md3-sm p-1.5 text-left",
                                    isSelected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                )}
                            >
                                <Thumb src={partThumbnail(part)} className="h-10 w-10" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate type-body-m">{name(part)}{color && ` · ${color}`}</span>
                                    <span className={cn("flex flex-wrap items-center gap-1 type-body-s", isSelected ? "text-on-secondary-container" : "text-on-surface-variant")}>
                                        #{part.costumeNumber}
                                        {ownHeads.has(key) && (
                                            <span className="rounded-md3-xs bg-primary-container px-1.5 type-label-s text-on-primary-container">{t("page.costume3d.ownTag")}</span>
                                        )}
                                        {part.headType === "head_and_hair" && (
                                            <span className="rounded-md3-xs bg-tertiary-container px-1.5 type-label-s text-on-tertiary-container">{t("page.costume3d.fullHeadTag")}</span>
                                        )}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                    {headList.length > HEADS_SHOWN && (
                        <p className="px-2 py-2 type-body-s text-on-surface-variant">{t("page.costume3d.headsMore", { count: headList.length - HEADS_SHOWN })}</p>
                    )}
                </div>
            </section>
        </div>
    );
}
