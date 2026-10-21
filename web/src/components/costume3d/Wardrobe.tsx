"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Icon, Tabs, TextField, cn } from "@/components/md3";
import { mdApparel, mdBlock, mdCheck, mdCheckroom, mdCrown, mdFace3, mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { blocked, type Costume3dLook, type HeadGroup, type RoleCostume } from "@/lib/costume3d/look";
import type { Costume3dCatalog, Costume3dPart, Costume3dVariant } from "@/types/costume3d";

/** Cards rendered at first and added each time the end of the grid comes into view. */
const PAGE = 48;

export type WardrobeTab = "costume" | "hair" | "head";

interface Swatch {
    key: string;
    thumbnail: string | null;
    label: string;
    selected: boolean;
    onClick: () => void;
}

function Thumbnail({ src, className }: { src: string | null; className?: string }) {
    return src ? (
        <Image src={src} alt="" fill className={cn("object-contain", className)} unoptimized />
    ) : (
        <Icon path={mdCheckroom} className="absolute inset-0 m-auto h-1/3 w-1/3 text-on-surface-variant" />
    );
}

/**
 * One choice of the wardrobe: a large thumbnail on a tile tinted with the unit's colour, its
 * name, and a round swatch per colour that picks that colour at once.
 */
function Card({ thumbnail, title, subtitle, colors, tags, selected, disabled, hint, swatches, onClick, tint, icon }: {
    thumbnail: string | null;
    title: string;
    subtitle?: string;
    colors?: string;
    tags?: React.ReactNode;
    selected: boolean;
    disabled?: boolean;
    hint?: string;
    swatches?: Swatch[];
    onClick: () => void;
    tint: string;
    icon?: string;
}) {
    return (
        <div className={cn("group flex min-w-0 flex-col gap-1.5", disabled && "opacity-40")} data-selected={selected || undefined}>
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                aria-pressed={selected}
                title={hint ?? title}
                className={cn(
                    "state-layer focus-ring relative aspect-square w-full overflow-hidden rounded-md3-lg transition-[outline-color,transform] duration-200 ease-md3-standard disabled:cursor-not-allowed",
                    "outline outline-[3px] -outline-offset-[3px]",
                    selected ? "outline-primary" : "outline-transparent group-hover:-translate-y-0.5",
                )}
                style={{
                    background: `linear-gradient(160deg, color-mix(in srgb, ${tint} 30%, var(--md-sys-color-surface-container-highest)), color-mix(in srgb, ${tint} 8%, var(--md-sys-color-surface-container)))`,
                }}
            >
                {icon ? <Icon path={icon} className="absolute inset-0 m-auto h-1/3 w-1/3 text-on-surface-variant" /> : <Thumbnail src={thumbnail} className="p-1" />}
                {selected && (
                    <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-on-primary">
                        <Icon path={mdCheck} className="h-3.5 w-3.5" />
                    </span>
                )}
                {colors && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-surface-container-lowest/85 px-1.5 type-label-s text-on-surface">{colors}</span>
                )}
                {tags && <span className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-0.5">{tags}</span>}
            </button>
            <div className="min-w-0 px-0.5">
                <p className={cn("truncate type-label-l", selected ? "text-primary" : "text-on-surface")} title={title}>{title}</p>
                {subtitle && <p className="truncate type-label-s text-on-surface-variant">{subtitle}</p>}
            </div>
            {swatches && swatches.length > 1 && (
                <div className="flex flex-wrap gap-1 px-0.5">
                    {swatches.map(swatch => (
                        <button
                            key={swatch.key}
                            type="button"
                            onClick={swatch.onClick}
                            disabled={disabled}
                            aria-pressed={swatch.selected}
                            aria-label={`${title} · ${swatch.label}`}
                            title={swatch.label}
                            className={cn(
                                "focus-ring relative h-5 w-5 overflow-hidden rounded-full bg-surface-container-high transition-shadow disabled:cursor-not-allowed",
                                swatch.selected
                                    ? "shadow-[0_0_0_2px_var(--md-sys-color-surface-container-low),0_0_0_4px_var(--md-sys-color-primary)]"
                                    : "shadow-[0_0_0_1px_var(--md-sys-color-outline-variant)]",
                            )}
                        >
                            <Thumbnail src={swatch.thumbnail} className="scale-150" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Shows `items` a page at a time, adding a page when the end of the list comes into view; at
 * least `minimum` (so that a selected item far down is there to scroll to).
 */
function usePaged<T>(items: T[], resetKey: string, minimum: number): { shown: T[]; sentinel: React.RefObject<HTMLDivElement | null> } {
    const [count, setCount] = useState({ key: resetKey, value: PAGE });
    const value = Math.max(count.key === resetKey ? count.value : PAGE, minimum);
    const sentinel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const node = sentinel.current;
        if (!node || value >= items.length) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) setCount({ key: resetKey, value: value + PAGE });
        }, { rootMargin: "400px" });
        observer.observe(node);
        return () => observer.disconnect();
    }, [items.length, resetKey, value]);
    return { shown: items.slice(0, value), sentinel };
}

interface WardrobeProps {
    tab: WardrobeTab;
    onTab: (tab: WardrobeTab) => void;
    /** The unit colour the cards are tinted with. */
    tint: string;
    catalog: Costume3dCatalog;
    variant: Costume3dVariant | null;
    look: Costume3dLook | null;

    costumes: RoleCostume[];
    costumeNumber: number | null;
    colorId: number;
    onCostume: (costumeNumber: number, colorId?: number) => void;

    hairs: Costume3dPart[];
    /** Picked over the costume: null follows it. */
    hair: number | null;
    onHair: (id: number | null) => void;

    heads: HeadGroup[];
    /** Picked over the costume: null follows it, 0 is none. */
    head: number | null;
    onHead: (id: number | null) => void;

    costumeThumbnail: (costumeNumber: number, colorId: number) => string | null;
    partThumbnail: (part: Costume3dPart) => string | null;
    colorName: (costumeNumber: number, colorId: number) => string;
    now: number;
    showSpoilers: boolean;
}

/**
 * The wardrobe: costumes, hairs and heads as three tabs of thumbnail cards, with a search.
 * Picking a costume dresses its hair and head unless one was picked over it ("match costume").
 */
export function Wardrobe(props: WardrobeProps) {
    const {
        tab, onTab, tint, catalog, variant, look, costumes, costumeNumber, colorId, onCostume, hairs, hair, onHair,
        heads, head, onHead, costumeThumbnail, partThumbnail, colorName, now, showSpoilers,
    } = props;
    const { t } = useI18n();
    const { t: translate } = useTranslation();
    const [queries, setQueries] = useState<Record<WardrobeTab, string>>({ costume: "", hair: "", head: "" });
    const query = queries[tab].trim().toLowerCase();
    const name = (original: string) => translate("costumes", "name", original) || original;
    const named = (color: { colorName: string; colorId: number }, costume: number) => {
        const raw = color.colorName || colorName(costume, color.colorId);
        return raw ? translate("costumes", "colorName", raw) || raw : t("page.costume3d.colorNumber", { number: color.colorId });
    };
    const matches = (number: number, original: string) => !query || String(number) === query
        || original.toLowerCase().includes(query) || name(original).toLowerCase().includes(query);
    const released = (publishedAt: number | null) => showSpoilers || (publishedAt != null && publishedAt <= now);

    const costumeList = useMemo(() => costumes.filter(costume => matches(costume.costumeNumber, costume.name)),
        // matches() reads the query and translations, which the dependencies stand for
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [costumes, query]);
    const hairList = useMemo(() => hairs.filter(part => (part.costumeNumber === 0 || released(part.publishedAt)) && matches(part.costumeNumber, part.name)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hairs, query, showSpoilers, now]);
    const ownHeads = new Set([variant?.head, ...(variant?.alternativeHeads ?? [])]);
    const wornHead = look?.head?.costume3dId ?? null;
    const headList = useMemo(() => {
        const list = heads.filter(group => released(group.publishedAt) && matches(group.costumeNumber, group.name));
        // The worn head and the costume's own first.
        const rank = (group: HeadGroup) => (group.parts.some(part => part.costume3dId === wornHead) ? 2 : group.parts.some(part => ownHeads.has(part.costume3dId)) ? 1 : 0);
        return list.sort((a, b) => rank(b) - rank(a));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [heads, query, showSpoilers, now, wornHead, variant]);

    const selectedIndex = tab === "costume" ? costumeList.findIndex(costume => costume.costumeNumber === costumeNumber) : -1;
    const paged = usePaged<unknown>(
        tab === "costume" ? costumeList : tab === "hair" ? hairList : headList,
        `${tab}|${query}|${catalog.role.characterId}-${catalog.role.unit}`,
        selectedIndex + 1,
    );

    // The selected card is brought into view when the role or the tab changes, within the
    // wardrobe's own scroll only (on narrow screens the grid scrolls with the page: left alone).
    const scrollerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const scroller = scrollerRef.current;
        const card = scroller?.querySelector<HTMLElement>("[data-selected]");
        if (!scroller || !card || scroller.scrollHeight <= scroller.clientHeight) return;
        const offset = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        if (offset < 0 || offset > scroller.clientHeight - card.offsetHeight) scroller.scrollTop += offset - 8;
    }, [tab, catalog]);

    const fullHead = Boolean(look?.fullHead);
    const notes = look?.hairReplaced || look?.hairIgnored ? (
        <Banner tone="info">
            {look.hairIgnored
                ? t("page.costume3d.hairIgnored")
                : t("page.costume3d.hairReplaced", { name: look.hairReplaced ? name(look.hairReplaced.name) : "" })}
        </Banner>
    ) : null;

    const grid = "grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-x-3 gap-y-4";
    let body: React.ReactNode;
    if (tab === "costume") {
        const shown = paged.shown as RoleCostume[];
        body = (
            <div className={grid}>
                {shown.map(costume => {
                    const selected = costume.costumeNumber === costumeNumber;
                    const shownColor = selected ? colorId : costume.colors[0]?.colorId ?? 1;
                    const upcoming = costume.publishedAt == null || costume.publishedAt > now;
                    return (
                        <div key={costume.costumeNumber} className="min-w-0">
                            <Card
                                tint={tint}
                                thumbnail={costumeThumbnail(costume.costumeNumber, shownColor)}
                                title={name(costume.name)}
                                subtitle={costume.colors.length === 1 ? named(costume.colors[0], costume.costumeNumber) : `#${costume.costumeNumber}`}
                                colors={costume.colors.length > 1 ? t("page.costume3d.colorCount", { count: costume.colors.length }) : undefined}
                                tags={upcoming ? <span className="rounded-md3-xs bg-tertiary-container px-1 type-label-s text-on-tertiary-container">{t("page.costume3d.upcoming")}</span> : undefined}
                                selected={selected}
                                onClick={() => onCostume(costume.costumeNumber)}
                                swatches={costume.colors.map(color => ({
                                    key: String(color.colorId),
                                    thumbnail: costumeThumbnail(costume.costumeNumber, color.colorId),
                                    label: named(color, costume.costumeNumber),
                                    selected: selected && color.colorId === colorId,
                                    onClick: () => onCostume(costume.costumeNumber, color.colorId),
                                }))}
                            />
                        </div>
                    );
                })}
            </div>
        );
    } else if (tab === "hair") {
        const shown = paged.shown as Costume3dPart[];
        body = (
            <>
                {fullHead && look?.head && (
                    <p className="type-body-s text-on-surface-variant">{t("page.costume3d.hairLockedByFullHead", { name: name(look.head.name) })}</p>
                )}
                <div className={grid}>
                    {shown.map(part => {
                        const isBlocked = !fullHead && blocked(catalog, wornHead, part.costume3dId);
                        return (
                            <Card
                                key={part.costume3dId}
                                tint={tint}
                                thumbnail={partThumbnail(part)}
                                title={part.costumeNumber === 0 ? t("page.costume3d.defaultHair") : name(part.name)}
                                subtitle={part.costumeNumber === 0 ? undefined : `#${part.costumeNumber}`}
                                tags={isBlocked ? <Icon path={mdBlock} className="h-4 w-4 text-error" /> : undefined}
                                selected={!fullHead && look?.hair?.costume3dId === part.costume3dId}
                                disabled={fullHead || isBlocked}
                                hint={fullHead ? t("page.costume3d.hairLockedByFullHead", { name: look?.head ? name(look.head.name) : "" }) : isBlocked ? t("page.costume3d.incompatible") : undefined}
                                onClick={() => onHair(part.costume3dId)}
                            />
                        );
                    })}
                </div>
            </>
        );
    } else {
        const shown = paged.shown as HeadGroup[];
        body = (
            <div className={grid}>
                {!query && (
                    <Card
                        tint={tint}
                        thumbnail={null}
                        icon={mdBlock}
                        title={t("page.costume3d.noHead")}
                        selected={look != null && !look.head && !look.accessory}
                        onClick={() => onHead(0)}
                    />
                )}
                {shown.map(group => {
                    const worn = group.parts.find(part => part.costume3dId === wornHead);
                    const own = group.parts.some(part => ownHeads.has(part.costume3dId));
                    const shownPart = worn ?? group.parts[0];
                    return (
                        <Card
                            key={group.key}
                            tint={tint}
                            thumbnail={partThumbnail(shownPart)}
                            title={name(group.name)}
                            subtitle={group.parts.length === 1 && group.parts[0].colorId > 1
                                ? named({ colorName: "", colorId: group.parts[0].colorId }, group.costumeNumber)
                                : `#${group.costumeNumber}`}
                            colors={group.parts.length > 1 ? t("page.costume3d.colorCount", { count: group.parts.length }) : undefined}
                            tags={(own || group.headType === "head_and_hair") ? (
                                <>
                                    {own && <span className="rounded-md3-xs bg-primary-container px-1 type-label-s text-on-primary-container">{t("page.costume3d.ownTag")}</span>}
                                    {group.headType === "head_and_hair" && <span className="rounded-md3-xs bg-tertiary-container px-1 type-label-s text-on-tertiary-container">{t("page.costume3d.fullHeadTag")}</span>}
                                </>
                            ) : undefined}
                            selected={Boolean(worn)}
                            onClick={() => onHead(group.parts[0].costume3dId)}
                            swatches={group.parts.map(part => ({
                                key: String(part.costume3dId),
                                thumbnail: partThumbnail(part),
                                label: named({ colorName: "", colorId: part.colorId }, group.costumeNumber),
                                selected: part.costume3dId === wornHead,
                                onClick: () => onHead(part.costume3dId),
                            }))}
                        />
                    );
                })}
            </div>
        );
    }

    const count = (n: number) => <span className="ml-1 type-label-s text-on-surface-variant">{n}</span>;
    const follow = tab === "hair" && hair != null ? () => onHair(null) : tab === "head" && head != null ? () => onHead(null) : null;
    const placeholder = tab === "costume" ? t("page.costume3d.searchPlaceholder") : tab === "hair" ? t("page.costume3d.hairSearchPlaceholder") : t("page.costume3d.headSearchPlaceholder");

    return (
        // Inside the page's @container: beside the stage the grid scrolls within the wardrobe.
        <div className="flex min-h-0 flex-col gap-3 @3xl:flex-1">
            <Tabs
                items={[
                    { value: "costume", icon: mdApparel, label: <span>{t("page.costume3d.costumes")}{count(costumes.length)}</span> },
                    { value: "hair", icon: mdFace3, label: <span>{t("page.costume3d.hair")}{count(hairs.filter(part => part.costumeNumber === 0 || released(part.publishedAt)).length)}</span> },
                    { value: "head", icon: mdCrown, label: <span>{t("page.costume3d.head")}{count(heads.filter(group => released(group.publishedAt)).length)}</span> },
                ]}
                value={tab}
                onValueChange={onTab}
                aria-label={t("page.costume3d.title")}
            />
            <div className="flex items-center gap-2">
                <TextField
                    className="min-w-0 flex-1"
                    icon={mdSearch}
                    value={queries[tab]}
                    onValueChange={value => setQueries(current => ({ ...current, [tab]: value }))}
                    clearable
                    clearLabel={t("page.costume3d.clearSearch")}
                    placeholder={placeholder}
                    aria-label={placeholder}
                />
                {follow && <Button variant="tonal" size="s" onClick={follow}>{t("page.costume3d.followCostume")}</Button>}
            </div>
            {tab !== "costume" && notes}
            <div ref={scrollerRef} className="-mx-1 flex flex-col gap-3 px-1 pb-2 pt-1 @3xl:min-h-0 @3xl:flex-1 @3xl:overflow-y-auto">
                {body}
                {(tab === "costume" ? costumeList : tab === "hair" ? hairList : headList).length === 0 && (
                    <p className="py-8 text-center type-body-m text-on-surface-variant">{t("page.costume3d.noMatches")}</p>
                )}
                <div ref={paged.sentinel} className="h-px" />
            </div>
        </div>
    );
}
