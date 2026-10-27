"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Icon, Tabs, TextField, cn } from "@/components/md3";
import { mdApparel, mdBlock, mdCheck, mdCheckroom, mdCrown, mdFace3, mdScience, mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { getCharacterName } from "@/lib/i18n";
import { blocked, released, type Costume3dLook, type HeadGroup, type RoleCostume } from "@/lib/costume3d/look";
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
    /** Unrestricted (experimental setting): the other roles' parts are listed too. */
    unrestricted: {
        loading: boolean;
        failed: boolean;
        /** Costumes the role has no look of, worn with a borrowed body. */
        borrowedCostumes: Set<number>;
        /** The character a hair or head was taken from; null for the role's own. */
        ownerOf: (part: Costume3dPart) => number | null;
    } | null;
}

function Tag({ tone, children }: { tone: "primary" | "tertiary" | "secondary"; children: React.ReactNode }) {
    const tones = {
        primary: "bg-primary-container text-on-primary-container",
        secondary: "bg-secondary-container text-on-secondary-container",
        tertiary: "bg-tertiary-container text-on-tertiary-container",
    };
    return <span className={cn("rounded-md3-xs px-1 type-label-s", tones[tone])}>{children}</span>;
}

/**
 * The wardrobe: costumes, hairs and heads as three tabs of thumbnail cards, with a search.
 * Picking a costume dresses its hair and head unless one was picked over it ("match costume").
 */
export function Wardrobe(props: WardrobeProps) {
    const {
        tab, onTab, tint, catalog, variant, look, costumes, costumeNumber, colorId, onCostume, hairs, hair, onHair,
        heads, head, onHead, costumeThumbnail, partThumbnail, colorName, now, showSpoilers, unrestricted,
    } = props;
    const { t } = useI18n();
    const { t: translate } = useTranslation();
    const [queries, setQueries] = useState<Record<WardrobeTab, string>>({ costume: "", hair: "", head: "" });
    const query = queries[tab].trim().toLowerCase();
    const name = useCallback((original: string) => translate("costumes", "name", original) || original, [translate]);
    const named = (color: { colorName: string; colorId: number }, costume: number) => {
        const raw = color.colorName || colorName(costume, color.colorId);
        return raw ? translate("costumes", "colorName", raw) || raw : t("page.costume3d.colorNumber", { number: color.colorId });
    };
    const ownerOf = unrestricted?.ownerOf;
    const ownerName = useCallback((part: Costume3dPart) => {
        const owner = ownerOf?.(part);
        return owner ? getCharacterName(t, owner) : null;
    }, [ownerOf, t]);
    const matches = useCallback((number: number, original: string, also?: string | null) => !query || String(number) === query
        || original.toLowerCase().includes(query) || name(original).toLowerCase().includes(query)
        || Boolean(also?.toLowerCase().includes(query)), [query, name]);
    const listed = useCallback((publishedAt: number | null) => showSpoilers || released(publishedAt, now), [showSpoilers, now]);

    // What each tab lists (all of it, for the counts), and what it shows for the search.
    const listedHairs = useMemo(() => hairs.filter(part => part.costumeNumber === 0 || listed(part.publishedAt)), [hairs, listed]);
    const listedHeads = useMemo(() => heads.filter(group => listed(group.publishedAt)), [heads, listed]);
    const costumeList = useMemo(() => costumes.filter(costume => matches(costume.costumeNumber, costume.name)), [costumes, matches]);
    const hairList = useMemo(() => listedHairs.filter(part => matches(part.costumeNumber, part.name, ownerName(part))), [listedHairs, matches, ownerName]);
    const ownHeads = useMemo(() => new Set([variant?.head, ...(variant?.alternativeHeads ?? [])]), [variant]);
    const wornHead = look?.head?.costume3dId ?? null;
    const headList = useMemo(() => {
        // The worn head and the costume's own first.
        const rank = (group: HeadGroup) => (group.parts.some(part => part.costume3dId === wornHead) ? 2 : group.parts.some(part => ownHeads.has(part.costume3dId)) ? 1 : 0);
        return listedHeads.filter(group => matches(group.costumeNumber, group.name, ownerName(group.parts[0]))).sort((a, b) => rank(b) - rank(a));
    }, [listedHeads, matches, ownerName, wornHead, ownHeads]);

    const selectedIndex = tab === "costume" ? costumeList.findIndex(costume => costume.costumeNumber === costumeNumber) : -1;
    const { shown: page, sentinel } = usePaged<unknown>(
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
        const shown = page as RoleCostume[];
        body = (
            <div className={grid}>
                {shown.map(costume => {
                    const selected = costume.costumeNumber === costumeNumber;
                    const shownColor = selected ? colorId : costume.colors[0]?.colorId ?? 1;
                    const upcoming = costume.publishedAt == null || costume.publishedAt > now;
                    const borrowed = unrestricted?.borrowedCostumes.has(costume.costumeNumber);
                    return (
                        <div key={costume.costumeNumber} className="min-w-0">
                            <Card
                                tint={tint}
                                thumbnail={costumeThumbnail(costume.costumeNumber, shownColor)}
                                title={name(costume.name)}
                                subtitle={costume.colors.length === 1 ? named(costume.colors[0], costume.costumeNumber) : `#${costume.costumeNumber}`}
                                colors={costume.colors.length > 1 ? t("page.costume3d.colorCount", { count: costume.colors.length }) : undefined}
                                tags={upcoming || borrowed ? (
                                    <>
                                        {upcoming && <Tag tone="tertiary">{t("page.costume3d.upcoming")}</Tag>}
                                        {borrowed && <Tag tone="secondary">{t("page.costume3d.unrestricted.borrowedTag")}</Tag>}
                                    </>
                                ) : undefined}
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
        const shown = page as Costume3dPart[];
        body = (
            <>
                {fullHead && look?.head && (
                    <p className="type-body-s text-on-surface-variant">{t("page.costume3d.hairLockedByFullHead", { name: name(look.head.name) })}</p>
                )}
                <div className={grid}>
                    {shown.map(part => {
                        const isBlocked = !fullHead && !unrestricted && blocked(catalog, wornHead, part.costume3dId);
                        const owner = ownerName(part);
                        return (
                            <Card
                                key={part.costume3dId}
                                tint={tint}
                                thumbnail={partThumbnail(part)}
                                title={part.costumeNumber === 0 ? t("page.costume3d.defaultHair") : name(part.name)}
                                subtitle={owner ?? (part.costumeNumber === 0 ? undefined : `#${part.costumeNumber}`)}
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
        const shown = page as HeadGroup[];
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
                    const borrowed = Boolean(ownerOf?.(group.parts[0]));
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
                            tags={(own || borrowed || group.headType === "head_and_hair") ? (
                                <>
                                    {own && <Tag tone="primary">{t("page.costume3d.ownTag")}</Tag>}
                                    {group.headType === "head_and_hair" && <Tag tone="tertiary">{t("page.costume3d.fullHeadTag")}</Tag>}
                                    {borrowed && <Tag tone="secondary">{t("page.costume3d.unrestricted.borrowedTag")}</Tag>}
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
                    { value: "hair", icon: mdFace3, label: <span>{t("page.costume3d.hair")}{count(listedHairs.length)}</span> },
                    { value: "head", icon: mdCrown, label: <span>{t("page.costume3d.head")}{count(listedHeads.length)}</span> },
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
            {unrestricted && (
                <p className={cn("flex items-center gap-1.5 type-body-s", unrestricted.failed ? "text-error" : "text-on-surface-variant")}>
                    <Icon path={mdScience} className="h-4 w-4 shrink-0" />
                    {t(unrestricted.failed ? "page.costume3d.unrestricted.failed" : unrestricted.loading ? "page.costume3d.unrestricted.loading" : "page.costume3d.unrestricted.notice")}
                </p>
            )}
            {tab !== "costume" && notes}
            <div ref={scrollerRef} className="-mx-1 flex flex-col gap-3 px-1 pb-2 pt-1 @3xl:min-h-0 @3xl:flex-1 @3xl:overflow-y-auto">
                {body}
                {(tab === "costume" ? costumeList : tab === "hair" ? hairList : headList).length === 0 && (
                    <p className="py-8 text-center type-body-m text-on-surface-variant">{t("page.costume3d.noMatches")}</p>
                )}
                <div ref={sentinel} className="h-px" />
            </div>
        </div>
    );
}
