"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import { CharacterPicker } from "@/components/costume3d/CharacterPicker";
import { Costume3dViewport } from "@/components/costume3d/Costume3dViewport";
import { Wardrobe, type WardrobeTab } from "@/components/costume3d/Wardrobe";
import { Banner, Button, EmptyState, LoadingState, PageContainer, PageHeader, Surface, cn } from "@/components/md3";
import { mdViewInAr } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { replaceAssetSourceRegion, useTheme, type ServerSourceType } from "@/contexts/ThemeContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { getCostumeThumbnailUrl } from "@/lib/assets";
import { costume3dRegions, type Costume3dRegion } from "@/lib/costume3d/config";
import { Costume3dUnavailableError, loadCatalog, loadCostume, loadPool, openOutput, type Costume3dOutput } from "@/lib/costume3d/data";
import {
    costumeVariant, hairById, hairOptions, headGroups, parseSelection, released, resolveLook, roleCostumes, selectionParams,
    type Costume3dPool, type Costume3dSelection, type RoleCostume,
} from "@/lib/costume3d/look";
import type { StageLoad } from "@/lib/costume3d/stage";
import { fetchMasterData } from "@/lib/fetch";
import { getCharacterName } from "@/lib/i18n";
import type { Costume3dCatalog, Costume3dCostume, Costume3dPart } from "@/types/costume3d";
import type { ICostumeInfo, IMoeCostumeData } from "@/types/costume";
import { UNIT_DATA, UNIT_FIELD_LABEL_KEYS, UNIT_FIELD_TO_ID } from "@/types/types";

const subscribeNever = () => () => {};
const LAST_ROLE_KEY = "costume3d:lastRole";

type Loaded<T> = { key: string; value: T } | { key: string; error: unknown };

/** Loads `load()` whenever `key` changes; null while it is on its way, or without a key. */
function useLoaded<T>(key: string | null, load: () => Promise<T>): { value: T | null; error: unknown } {
    const [state, setState] = useState<Loaded<T> | null>(null);
    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        load().then(
            value => { if (!cancelled) setState({ key, value }); },
            (error: unknown) => { if (!cancelled) setState({ key, error }); },
        );
        return () => { cancelled = true; };
        // the key names everything `load` reads
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    if (!key || state?.key !== key) return { value: null, error: null };
    return "value" in state ? { value: state.value, error: null } : { value: null, error: state.error };
}

/** The unit a character belongs to: their role there is the one shown first. */
function homeUnit(characterId: number): string | null {
    const unit = UNIT_DATA.find(entry => entry.charIds.includes(characterId));
    return Object.entries(UNIT_FIELD_TO_ID).find(([, id]) => id === unit?.id)?.[0] ?? null;
}

function unitColor(unit: string): string {
    return UNIT_DATA.find(entry => entry.id === UNIT_FIELD_TO_ID[unit])?.color ?? "#888888";
}

/** A costume part's thumbnail name on the site: shared parts first, then the character's own. */
function thumbnailName(info: ICostumeInfo | undefined, partType: string, colorId: number, characterId: number): string | null {
    if (!info) return null;
    const shared = info.parts[partType];
    const extra = info.extraParts?.find(part => part.characterId === characterId && part.partType === partType)?.variants;
    const pick = (list: ICostumeInfo["parts"][string] | undefined) => list?.find(part => part.colorId === colorId) ?? list?.[0];
    return (pick(extra) ?? pick(shared))?.assetbundleName ?? null;
}

function readLastRole(): { characterId: number; unit: string } | null {
    try {
        const value = JSON.parse(localStorage.getItem(LAST_ROLE_KEY) ?? "null") as { characterId?: unknown; unit?: unknown } | null;
        return value && typeof value.characterId === "number" && typeof value.unit === "string"
            ? { characterId: value.characterId, unit: value.unit }
            : null;
    } catch {
        return null;
    }
}

function Costume3dContent() {
    const { t } = useI18n();
    const { t: translate } = useTranslation();
    const params = useSearchParams();
    const { serverSource, assetSource, isShowSpoiler, themeCharId, hasHydratedThemeSettings, costume3dUnrestricted } = useTheme();
    const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
    const [now] = useState(() => Date.now());
    const regions = useMemo(() => costume3dRegions(), []);

    // What the reader asked for: the address first, then their choices on the page.
    const [initial] = useState(() => parseSelection(new URLSearchParams(params.toString())));
    const [want, setWant] = useState<Partial<Costume3dSelection>>(initial);
    const [chosenRegion, setChosenRegion] = useState<Costume3dRegion | null>(null);
    const addressRegion = regions.find(region => region === initial.server) ?? null;
    const siteRegion = hydrated && hasHydratedThemeSettings ? serverSource : null;
    const region: Costume3dRegion | null = chosenRegion ?? addressRegion
        ?? (siteRegion && regions.includes(siteRegion as Costume3dRegion) ? siteRegion as Costume3dRegion : null);
    const regionMissing = !region && siteRegion !== null;

    const output = useLoaded<Costume3dOutput>(region, () => openOutput(region as string));
    const costumeData = useLoaded<Map<number, ICostumeInfo>>(region, () =>
        fetchMasterData<IMoeCostumeData>("moe_costume.json", false, region as ServerSourceType)
            .then(data => new Map((data.costumes ?? []).map(costume => [costume.costumeNumber, costume]))));

    // The role: the asked character in the asked unit, else in their own unit.
    const role = useMemo(() => {
        const roles = output.value?.roles;
        if (!roles?.length || !hydrated) return null;
        const last = initial.characterId == null ? readLastRole() : null;
        const theme = Number(themeCharId);
        const characterId = want.characterId ?? last?.characterId ?? (Number.isInteger(theme) && theme >= 1 && theme <= 26 ? theme : 1);
        const unit = want.unit ?? (want.characterId == null ? last?.unit : undefined);
        const mine = roles.filter(entry => entry.characterId === characterId);
        const pool = mine.length ? mine : roles;
        return pool.find(entry => entry.unit === unit) ?? pool.find(entry => entry.unit === homeUnit(entry.characterId)) ?? pool[0];
    }, [output.value, want.characterId, want.unit, initial.characterId, themeCharId, hydrated]);

    const catalogState = useLoaded<Costume3dCatalog>(
        output.value && role ? `${region}|${role.characterId}-${role.unit}` : null,
        () => loadCatalog(output.value as Costume3dOutput, role as { characterId: number; unit: string }),
    );
    const catalog = catalogState.value;
    // Unrestricted (experimental setting): every role's parts, read once the role's own are shown.
    const poolState = useLoaded<Costume3dPool>(
        costume3dUnrestricted && output.value && catalog ? `${region}|pool` : null,
        () => loadPool(output.value as Costume3dOutput),
    );
    const pool = costume3dUnrestricted ? poolState.value : null;

    // The costumes this role can wear; those not yet released only with spoilers shown. Colours the
    // output leaves unnamed (CN, TW, KR) take the site's names of the costume's colours.
    const ownCostumes = useMemo(() => (catalog ? roleCostumes(catalog) : []), [catalog]);
    const costumes = useMemo(() => (catalog
        ? (pool ? pool.costumes.map(entry => ownCostumes.find(own => own.costumeNumber === entry.costumeNumber) ?? entry) : ownCostumes)
            .filter(costume => isShowSpoiler || released(costume.publishedAt, now))
            .map(costume => {
                const info = costumeData.value?.get(costume.costumeNumber);
                if (!info || costume.colors.every(color => color.colorName)) return costume;
                const named = Object.values(info.parts).flat();
                return {
                    ...costume,
                    colors: costume.colors.map(color => ({
                        ...color,
                        colorName: color.colorName || named.find(part => part.colorId === color.colorId)?.colorName || "",
                    })),
                };
            })
        : []), [catalog, ownCostumes, pool, costumeData.value, isShowSpoiler, now]);
    // What only the pool brings, for the wardrobe to mark.
    const borrowedCostumes = useMemo(() => new Set(pool ? costumes.filter(entry => !ownCostumes.some(own => own.costumeNumber === entry.costumeNumber)).map(entry => entry.costumeNumber) : []), [pool, costumes, ownCostumes]);
    const costume = costumes.find(entry => entry.costumeNumber === want.costumeNumber) ?? costumes[0] ?? null;
    const colorId = costume?.colors.some(color => color.colorId === want.colorId) ? want.colorId as number : costume?.colors[0]?.colorId ?? 1;
    const hairs = useMemo(() => {
        const own = catalog ? hairOptions(catalog) : [];
        const bundles = new Set(own.map(part => part.model?.bundle));
        return pool ? [...own, ...pool.hairs.filter(part => !bundles.has(part.model?.bundle))] : own;
    }, [catalog, pool]);
    const heads = useMemo(() => {
        const own = catalog ? headGroups(catalog) : [];
        const keys = new Set(own.map(group => group.key));
        return pool ? [...own, ...pool.heads.filter(group => !keys.has(group.key))] : own;
    }, [catalog, pool]);
    /** The role a hair or head of the pool was taken from; null for the role's own. */
    const roleOf = useCallback((part: Costume3dPart) => (pool && catalog && !catalog.parts.includes(part)
        ? pool.roleOf.get(part) ?? null
        : null), [pool, catalog]);
    const ownerOf = useCallback((part: Costume3dPart) => roleOf(part)?.characterId ?? null, [roleOf]);
    const costumeInfo = useCallback((costumeNumber: number) => costumeData.value?.get(costumeNumber), [costumeData.value]);
    /** Who a part of the pool was taken from: the character, and the unit when they have several roles (Miku). */
    const ownerName = useCallback((part: Costume3dPart) => {
        const from = roleOf(part);
        if (!from) return null;
        const name = getCharacterName(t, from.characterId);
        const several = (pool?.roles.filter(entry => entry.characterId === from.characterId).length ?? 0) > 1;
        return several ? `${name} · ${t(UNIT_FIELD_LABEL_KEYS[from.unit] ?? from.unit)}` : name;
    }, [roleOf, pool, t]);
    const pickedHair = catalog ? hairById(catalog, want.hair, want.hairUnit, pool) : null;
    const hair = pickedHair ? pickedHair.costume3dId : null;
    const hairUnit = pickedHair ? roleOf(pickedHair)?.unit ?? null : null;
    const head = want.head === 0 || (want.head != null && Boolean(catalog?.parts.some(part => part.costume3dId === want.head && part.slot === "head") || pool?.headsById.has(want.head)))
        ? want.head as number
        : null;

    const costumeState = useLoaded<Costume3dCostume>(
        output.value && costume ? `${region}|${costume.costumeNumber}` : null,
        () => loadCostume(output.value as Costume3dOutput, (costume as RoleCostume).costumeNumber),
    );
    // The role's own look of the costume; unrestricted, one with a borrowed body when it has none.
    const worn = useMemo(() => (costumeState.value && catalog ? costumeVariant(costumeState.value, catalog, colorId, pool) : null),
        [costumeState.value, catalog, colorId, pool]);
    const variant = worn?.variant ?? null;
    const look = useMemo(() => (variant && catalog ? resolveLook(variant, catalog, { hair, hairUnit, head }, pool) : null), [variant, catalog, hair, hairUnit, head, pool]);

    const lookKey = look && variant
        ? [variant.bodyBundle, variant.bodyColor, look.face, look.hairFrom, look.accessory?.bundle, look.accessory?.color, look.accessory?.attach, variant.motion].join("|")
        : null;
    const stageLoad = useMemo<StageLoad | null>(() => (output.value && variant && look && catalog && !variant.missing?.length
        ? { library: output.value.library, variant, look, skin: { default: catalog.role.skin.default, shadow1: catalog.role.skin.shadow1 } }
        : null),
    // a new look object with the same bundles is the same load
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookKey, output.value]);

    // The address follows what is shown, so it can be shared; the last role is remembered.
    useEffect(() => {
        if (!role || !costume || !region) return;
        const selection: Costume3dSelection = { characterId: role.characterId, unit: role.unit, costumeNumber: costume.costumeNumber, colorId, hair, hairUnit, head };
        const url = new URL(window.location.href);
        const search = `?${selectionParams(selection, region !== serverSource ? region : null).toString()}`;
        if (url.search !== search) {
            url.search = search;
            window.history.replaceState({}, "", url.toString());
        }
        try {
            localStorage.setItem(LAST_ROLE_KEY, JSON.stringify({ characterId: role.characterId, unit: role.unit }));
        } catch {
            // private mode: nothing remembered
        }
    }, [role, costume, colorId, hair, hairUnit, head, region, serverSource]);

    const regionAssets = region ? replaceAssetSourceRegion(assetSource, region as ServerSourceType) : assetSource;
    const thumbnailOf = useCallback((costumeNumber: number, partType: string, color: number, characterId: number | null | undefined) => {
        const name = role ? thumbnailName(costumeData.value?.get(costumeNumber), partType, color, characterId ?? role.characterId) : null;
        return name ? getCostumeThumbnailUrl(name, regionAssets) : null;
    }, [costumeData.value, role, regionAssets]);
    const costumeThumbnail = useCallback((costumeNumber: number, color: number) =>
        thumbnailOf(costumeNumber, "body", color, borrowedCostumes.has(costumeNumber) ? pool?.costumeOwners.get(costumeNumber) : null), [thumbnailOf, borrowedCostumes, pool]);
    const partThumbnail = useCallback((part: Costume3dPart) => thumbnailOf(part.costumeNumber, part.slot, part.colorId, ownerOf(part)), [thumbnailOf, ownerOf]);
    const colorNameOf = useCallback((costumeNumber: number, color: number) =>
        catalog?.parts.find(part => part.slot === "body" && part.costumeNumber === costumeNumber && part.colorId === color)?.colorName
        || Object.values(costumeData.value?.get(costumeNumber)?.parts ?? {}).flat().find(part => part.colorId === color)?.colorName
        || "", [catalog, costumeData.value]);

    const selectCharacter = useCallback((characterId: number) => {
        setWant(current => ({ ...current, characterId, unit: undefined, hair: null, hairUnit: null, head: null }));
    }, []);
    const selectUnit = useCallback((unit: string) => {
        setWant(current => ({ ...current, characterId: role?.characterId, unit, hair: null, hairUnit: null, head: null }));
    }, [role]);
    const selectCostume = useCallback((costumeNumber: number, color?: number) => {
        setWant(current => ({ ...current, costumeNumber, ...(color != null ? { colorId: color } : {}) }));
    }, []);

    const [tab, setTab] = useState<WardrobeTab>("costume");
    // The character's own unit first, then the site's unit order.
    const unitOrder = (unit: string) => (role && unit === homeUnit(role.characterId) ? -1 : UNIT_DATA.findIndex(entry => entry.id === UNIT_FIELD_TO_ID[unit]));
    const characterRoles = (output.value?.roles.filter(entry => entry.characterId === role?.characterId) ?? [])
        .sort((a, b) => unitOrder(a.unit) - unitOrder(b.unit));
    const available = useMemo(() => new Set(output.value?.roles.map(entry => entry.characterId) ?? []), [output.value]);
    const characterName = role ? getCharacterName(t, role.characterId) : "";
    const unitName = role ? t(UNIT_FIELD_LABEL_KEYS[role.unit] ?? role.unit) : "";
    const costumeName = costume ? translate("costumes", "name", costume.name) || costume.name : "";
    const colorEntry = costume?.colors.find(color => color.colorId === colorId);
    const colorName = colorEntry?.colorName
        ? translate("costumes", "colorName", colorEntry.colorName) || colorEntry.colorName
        : t("page.costume3d.colorNumber", { number: colorId });

    const header = <PageHeader title={t("page.costume3d.title")} description={t("page.costume3d.description")} />;
    // Beside the stage the page fits the window: a one-line title, then stage and panel at full height.
    const compactHeader = (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="type-headline-s text-on-surface">{t("page.costume3d.title")}</h1>
            <p className="type-body-m text-on-surface-variant">{t("page.costume3d.description")}</p>
        </div>
    );

    // ---------------------------------------------------------------- what keeps the page from showing
    if (!hydrated || (!region && !regionMissing)) return <PageContainer wide>{header}<LoadingState /></PageContainer>;
    if (regionMissing || output.error) {
        const reason = output.error instanceof Costume3dUnavailableError ? output.error.reason : regionMissing ? "region" : "network";
        return (
            <PageContainer wide>
                {header}
                <EmptyState
                    icon={mdViewInAr}
                    title={t(`page.costume3d.unavailable.${reason}Title`)}
                    description={t(`page.costume3d.unavailable.${reason}Message`)}
                    action={reason === "region" ? (
                        <div className="flex flex-wrap justify-center gap-2">
                            {regions.map(entry => (
                                <Button key={entry} variant="tonal" onClick={() => setChosenRegion(entry)}>
                                    {t("page.costume3d.unavailable.useRegion", { region: entry.toUpperCase() })}
                                </Button>
                            ))}
                        </div>
                    ) : undefined}
                />
            </PageContainer>
        );
    }
    if (!output.value || !role) return <PageContainer wide>{header}<LoadingState /></PageContainer>;

    const pill = "rounded-full bg-surface-container-lowest/80 px-2.5 py-0.5 type-label-m text-on-surface";
    const caption = costume && (
        <div className="flex flex-col items-start gap-2">
            <p className="type-headline-s text-on-surface [text-shadow:0_1px_8px_var(--md-sys-color-surface)]">{costumeName}</p>
            <div className="flex flex-wrap gap-1.5">
                <span className={cn(pill, "flex items-center gap-1.5")}>
                    <span className="h-2 w-2 rounded-full" style={{ background: unitColor(role.unit) }} />
                    {characterName}
                    {characterRoles.length > 1 && <span className="text-on-surface-variant">{unitName}</span>}
                </span>
                <span className={pill}>{colorName}</span>
                {worn?.from && (
                    <span className={pill}>{t("page.costume3d.captionBorrowed", { character: getCharacterName(t, worn.from.characterId) })}</span>
                )}
                {hair != null && look?.hair && !look.fullHead && (
                    <span className={pill}>{t(look.hairFrom ? "page.costume3d.captionHairFrom" : "page.costume3d.captionHair", {
                        name: look.hair.costumeNumber === 0 ? t("page.costume3d.defaultHair") : translate("costumes", "name", look.hair.name) || look.hair.name,
                        character: ownerName(look.hair) ?? getCharacterName(t, role.characterId),
                    })}</span>
                )}
                {head != null && (
                    <span className={pill}>{t("page.costume3d.captionHead", {
                        name: look?.head ? translate("costumes", "name", look.head.name) || look.head.name : t("page.costume3d.noHead"),
                    })}</span>
                )}
            </div>
        </div>
    );

    const stageMessage = catalogState.error || costumeState.error
        ? t("page.costume3d.loadFailed")
        : costumeState.value && !variant
            ? t("page.costume3d.costumeUnavailable")
            : variant?.missing?.length ? t("page.costume3d.costumeUnavailable") : null;

    const viewport = (
        <div className="relative h-full">
            <Costume3dViewport
                load={stageLoad}
                unitColor={unitColor(role.unit)}
                caption={caption}
                label={costume ? t("page.costume3d.stageLabel", { character: characterName, costume: costumeName }) : t("page.costume3d.title")}
                className="h-full"
            />
            {stageMessage && (
                <div className="absolute inset-x-3 top-3"><Banner tone="warning">{stageMessage}</Banner></div>
            )}
        </div>
    );

    const wardrobe = catalog ? (
        <Wardrobe
            tab={tab}
            onTab={setTab}
            tint={unitColor(role.unit)}
            catalog={catalog}
            variant={variant}
            look={look}
            costumes={costumes}
            costumeNumber={costume?.costumeNumber ?? null}
            colorId={colorId}
            onCostume={selectCostume}
            hairs={hairs}
            hair={hair}
            onHair={part => setWant(current => ({ ...current, hair: part?.costume3dId ?? null, hairUnit: part ? roleOf(part)?.unit ?? null : null }))}
            heads={heads}
            head={head}
            onHead={id => setWant(current => ({ ...current, head: id }))}
            costumeThumbnail={costumeThumbnail}
            partThumbnail={partThumbnail}
            colorName={colorNameOf}
            now={now}
            showSpoilers={isShowSpoiler}
            unrestricted={costume3dUnrestricted ? { pool, loading: !pool && !poolState.error, failed: Boolean(poolState.error), borrowedCostumes, ownerName, ownerOf, costumeInfo } : null}
        />
    ) : catalogState.error ? (
        <p className="py-8 text-center type-body-m text-error">{t("page.costume3d.loadFailed")}</p>
    ) : <LoadingState className="min-h-[20vh]" />;

    // Stage and panel fill the window beside each other; the header above is the only page scroll,
    // unless the panel's filters leave its grid too short: then the panel grows below the stage.
    const column = "@3xl:sticky @3xl:top-20 @3xl:h-[calc(100dvh-10.5rem)] @3xl:min-h-[540px]";
    const panelColumn = "@3xl:sticky @3xl:top-20 @3xl:min-h-[max(540px,calc(100dvh-10.5rem))]";
    return (
        <PageContainer wide className="sm:py-5">
            {compactHeader}
            {/* Laid out by the width the page has beside the site's navigation, not the window's. */}
            <div className="@container">
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] @6xl:grid-cols-[minmax(0,1fr)_440px]">
                    {/* The stage: on narrow screens kept in view while the panel scrolls under it. */}
                    <div className={cn("sticky top-[6.5rem] z-10 h-[46dvh] min-h-[320px] sm:top-16", column)}>
                        {viewport}
                    </div>
                    {/* The panel: who, then what they wear. */}
                    <Surface tone="card" radius="xl" className={cn("flex flex-col gap-4 p-4", panelColumn)}>
                        <CharacterPicker
                            available={available}
                            selected={role.characterId}
                            onSelect={selectCharacter}
                            units={characterRoles.map(entry => entry.unit)}
                            unit={role.unit}
                            onUnit={selectUnit}
                        />
                        <div className="h-px shrink-0 bg-outline-variant" />
                        {wardrobe}
                    </Surface>
                </div>
            </div>
            {/* What Haruki's projects gave this page. */}
            <section className="mt-6 rounded-md3-lg bg-surface-container-low px-4 py-3 type-body-s text-on-surface-variant">
                <h2 className="mb-1 type-label-l text-on-surface">{t("page.costume3d.credits.title")}</h2>
                <ul className="list-disc space-y-1 pl-5">
                    <li>
                        <ExternalLink href="https://github.com/Team-Haruki" target="_blank" className="text-primary underline-offset-2 hover:underline">Team-Haruki</ExternalLink>
                        {t("page.costume3d.credits.masterdata")}
                    </li>
                    <li>
                        <ExternalLink href="https://haruki.seiunx.com/costumes" target="_blank" className="text-primary underline-offset-2 hover:underline">{t("page.costume3d.credits.toolboxLink")}</ExternalLink>
                        {t("page.costume3d.credits.toolbox")}
                    </li>
                </ul>
            </section>
        </PageContainer>
    );
}

export default function Costume3dClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <Costume3dContent />
            </Suspense>
        </MainLayout>
    );
}
