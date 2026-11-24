"use client";
import { useMemo, useState } from "react";
import { resolveFallbackSubCharacter, type Live2DModel, type Live2DModelKind } from "@moesekai/story-core";
import { TextField, cn } from "@/components/md3";
import { mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { UNIT_DATA, UNIT_ICON_FILES, UNIT_ID_LABEL_KEYS } from "@/types/types";
import {
    groupLive2DModelsByOwner,
    live2dCostumeLabel,
    live2dGroupKey,
    live2dModelMatchesQuery,
    live2dOwnerName,
    live2dSecondaryOwnerName,
    localeToRegionKey,
} from "./labels";

interface Live2DModelPickerProps {
    models: readonly Live2DModel[];
    current: Live2DModel | null;
    /** The group whose models are listed (`character:<id>`, `sub`, `collab`, `mob`). */
    group: string;
    onGroupChange: (group: string) => void;
    onSelect: (model: Live2DModel) => void;
}

function ownerInitial(label: string): string {
    return Array.from(label.trim())[0] ?? "?";
}

/**
 * Choosing a model: global search across all localized names/aliases/IDs, or browsing by the
 * 26 main characters (unit rows) and supporting / collaboration / mob groups organized by person.
 */
export function Live2DModelPicker({ models, current, group, onGroupChange, onSelect }: Live2DModelPickerProps) {
    const { t, locale } = useI18n();
    const [query, setQuery] = useState("");
    const trimmedQuery = query.trim();

    const counts = useMemo(() => {
        const byGroup = new Map<string, number>();
        for (const model of models) {
            const key = live2dGroupKey(model);
            byGroup.set(key, (byGroup.get(key) ?? 0) + 1);
        }
        return byGroup;
    }, [models]);

    const searchMatches = useMemo(() => {
        if (!trimmedQuery) return [];
        return models.filter(model => live2dModelMatchesQuery(t, model, trimmedQuery, locale));
    }, [models, t, trimmedQuery, locale]);

    const isCharacterGroup = group.startsWith("character:");
    const listed = useMemo(
        () => (trimmedQuery ? [] : models.filter(model => live2dGroupKey(model) === group)),
        [models, group, trimmedQuery],
    );
    const ownerGroups = useMemo(
        () => (trimmedQuery || isCharacterGroup ? [] : groupLive2DModelsByOwner(t, listed, locale)),
        [trimmedQuery, isCharacterGroup, t, listed, locale],
    );

    const currentGroup = current ? live2dGroupKey(current) : null;
    const categoryKinds: readonly Live2DModelKind[] = (counts.get("mob") ?? 0) > 0
        ? ["sub", "collab", "mob"]
        : ["sub", "collab"];
    const selectedCharacterId = isCharacterGroup ? Number(group.slice("character:".length)) : null;
    const selectedCharacterName = selectedCharacterId !== null ? getCharacterName(t, selectedCharacterId) : null;
    const regionKey = localeToRegionKey(locale);

    return (
        <div className="space-y-4">
            <TextField
                variant="filled"
                icon={mdSearch}
                clearable
                value={query}
                onValueChange={setQuery}
                placeholder={t("page.live2d.searchModels")}
                aria-label={t("page.live2d.searchModels")}
            />

            {trimmedQuery ? (
                <div>
                    <p className="mb-1.5 px-1 type-title-s text-on-surface">
                        {t("page.live2d.searchResults", { count: searchMatches.length })}
                    </p>
                    {searchMatches.length === 0 ? (
                        <p className="px-1 py-4 text-center type-body-s text-on-surface-variant">
                            {t("page.live2d.searchEmpty")}
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {searchMatches.map(model => {
                                const selected = model.id === current?.id;
                                const ownerName = live2dOwnerName(t, model, locale);
                                const secondaryName = live2dSecondaryOwnerName(model, locale);
                                const costume = live2dCostumeLabel(t, model);
                                return (
                                    <li key={model.id}>
                                        <button
                                            type="button"
                                            aria-current={selected || undefined}
                                            onClick={() => onSelect(model)}
                                            className={cn(
                                                "state-layer focus-ring flex w-full items-center gap-2.5 rounded-md3-md px-2.5 py-2 text-left",
                                                selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                            )}
                                        >
                                            {model.kind === "character" && model.characterId !== null ? (
                                                <img
                                                    src={getCharacterIconUrl(model.characterId)}
                                                    alt=""
                                                    loading="lazy"
                                                    className="size-8 shrink-0 rounded-full bg-surface-container-highest object-cover"
                                                />
                                            ) : (
                                                <span
                                                    aria-hidden
                                                    className={cn(
                                                        "flex size-8 shrink-0 items-center justify-center rounded-full type-label-l",
                                                        selected
                                                            ? "bg-primary/15 text-on-secondary-container"
                                                            : "bg-surface-container-highest text-on-surface-variant",
                                                    )}
                                                >
                                                    {ownerInitial(ownerName)}
                                                </span>
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="flex min-w-0 items-baseline gap-1.5">
                                                    <span className="truncate type-label-l">{ownerName}</span>
                                                    {secondaryName && (
                                                        <span className="truncate type-label-s opacity-65">{secondaryName}</span>
                                                    )}
                                                </span>
                                                <span className="flex min-w-0 items-center gap-1.5 type-label-s opacity-75">
                                                    <span className="truncate">{costume}</span>
                                                    <span aria-hidden>{"\u00b7"}</span>
                                                    <span className="truncate font-mono opacity-85">{model.id}</span>
                                                </span>
                                            </span>
                                            {model.generation === 2 && (
                                                <span className="shrink-0 rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container">
                                                    v2
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        {UNIT_DATA.map(unit => (
                            <div key={unit.id} className="flex items-center gap-2">
                                <img
                                    src={`/data/icon/${UNIT_ICON_FILES[unit.id]}`}
                                    alt={t(UNIT_ID_LABEL_KEYS[unit.id] ?? unit.id)}
                                    title={t(UNIT_ID_LABEL_KEYS[unit.id] ?? unit.id)}
                                    className="h-7 w-10 shrink-0 object-contain"
                                />
                                <div className="flex flex-wrap gap-1.5">
                                    {unit.charIds.map(id => {
                                        const key = `character:${id}`;
                                        const name = getCharacterName(t, id);
                                        const count = counts.get(key) ?? 0;
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                title={name}
                                                aria-label={name}
                                                aria-pressed={group === key}
                                                disabled={count === 0}
                                                onClick={() => onGroupChange(key)}
                                                className={cn(
                                                    "focus-ring relative size-10 shrink-0 overflow-hidden rounded-full bg-surface-container-highest outline-offset-2 transition",
                                                    group === key ? "outline-2 outline-primary outline" : "hover:brightness-95",
                                                    count === 0 && "opacity-38",
                                                )}
                                            >
                                                <img src={getCharacterIconUrl(id)} alt="" loading="lazy" className="size-full object-cover" />
                                                {currentGroup === key && group !== key && (
                                                    <span aria-hidden className="absolute bottom-0.5 right-0.5 size-2.5 rounded-full border-2 border-surface bg-primary" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        <div className="flex flex-wrap gap-2 pt-1">
                            {categoryKinds.map(kind => {
                                const count = counts.get(kind) ?? 0;
                                return (
                                    <button
                                        key={kind}
                                        type="button"
                                        aria-pressed={group === kind}
                                        disabled={count === 0}
                                        onClick={() => onGroupChange(kind)}
                                        className={cn(
                                            "state-layer focus-ring relative inline-flex h-9 items-center gap-1.5 rounded-full px-4 type-label-l",
                                            group === kind ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-high text-on-surface",
                                            count === 0 && "opacity-38",
                                        )}
                                    >
                                        {currentGroup === kind && group !== kind && (
                                            <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
                                        )}
                                        {t(`page.live2d.kind.${kind}`)}
                                        <span className="type-label-s opacity-70">{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <p className="mb-1.5 px-1 type-title-s text-on-surface">
                            {selectedCharacterName ?? t(`page.live2d.kind.${group}`)}
                            <span className="ml-2 type-label-m text-on-surface-variant">{listed.length}</span>
                        </p>
                        {listed.length === 0 ? (
                            <p className="px-1 type-body-s text-on-surface-variant">{t("page.live2d.groupEmpty")}</p>
                        ) : isCharacterGroup ? (
                            <ul className="space-y-0.5">
                                {listed.map(model => {
                                    const selected = model.id === current?.id;
                                    const fallbackSpecial = resolveFallbackSubCharacter(model);
                                    const rawSpecialName = model.names?.[regionKey]
                                        ?? fallbackSpecial?.names?.[regionKey]
                                        ?? model.name
                                        ?? fallbackSpecial?.names?.jp
                                        ?? null;
                                    const specialStoryName = rawSpecialName && rawSpecialName.trim() !== selectedCharacterName?.trim()
                                        ? rawSpecialName.trim()
                                        : null;
                                    return (
                                        <li key={model.id}>
                                            <button
                                                type="button"
                                                aria-current={selected || undefined}
                                                onClick={() => onSelect(model)}
                                                className={cn(
                                                    "state-layer focus-ring flex w-full items-center gap-3 rounded-md3-md px-3 py-2 text-left",
                                                    selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                                )}
                                            >
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex min-w-0 items-center gap-1.5">
                                                        <span className="truncate type-label-l">{live2dCostumeLabel(t, model)}</span>
                                                        {specialStoryName && (
                                                            <span className="shrink-0 rounded-md3-xs bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                                                                {specialStoryName}
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="block truncate font-mono type-label-s opacity-70">{model.id}</span>
                                                </span>
                                                {model.generation === 2 && (
                                                    <span className="shrink-0 rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container">
                                                        v2
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <ul className="space-y-1.5">
                                {ownerGroups.map(ownerGroup => {
                                    if (ownerGroup.models.length === 1) {
                                        const model = ownerGroup.models[0];
                                        const selected = model.id === current?.id;
                                        const variantLabel = model.subVariant.length > 0 ? live2dCostumeLabel(t, model) : null;
                                        return (
                                            <li key={ownerGroup.ownerKey}>
                                                <button
                                                    type="button"
                                                    aria-current={selected || undefined}
                                                    onClick={() => onSelect(model)}
                                                    className={cn(
                                                        "state-layer focus-ring flex w-full items-center gap-2.5 rounded-md3-md px-2.5 py-2 text-left",
                                                        selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                                    )}
                                                >
                                                    <span
                                                        aria-hidden
                                                        className={cn(
                                                            "flex size-8 shrink-0 items-center justify-center rounded-full type-label-l",
                                                            selected
                                                                ? "bg-primary/15 text-on-secondary-container"
                                                                : "bg-surface-container-highest text-on-surface-variant",
                                                        )}
                                                    >
                                                        {ownerInitial(ownerGroup.displayName)}
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex min-w-0 items-baseline gap-1.5">
                                                            <span className="truncate type-label-l">{ownerGroup.displayName}</span>
                                                            {ownerGroup.secondaryName && (
                                                                <span className="truncate type-label-s opacity-65">{ownerGroup.secondaryName}</span>
                                                            )}
                                                        </span>
                                                        <span className="flex min-w-0 items-center gap-1.5 type-label-s opacity-70">
                                                            {variantLabel && (
                                                                <>
                                                                    <span className="truncate">{variantLabel}</span>
                                                                    <span aria-hidden>{"\u00b7"}</span>
                                                                </>
                                                            )}
                                                            <span className="truncate font-mono">{model.id}</span>
                                                        </span>
                                                        {ownerGroup.aliases.length > 0 && (
                                                            <span className="block truncate type-label-s opacity-60">
                                                                {t("page.live2d.aliasesLabel")}: {ownerGroup.aliases.slice(0, 3).join(" / ")}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {model.generation === 2 && (
                                                        <span className="shrink-0 rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container">
                                                            v2
                                                        </span>
                                                    )}
                                                </button>
                                            </li>
                                        );
                                    }

                                    return (
                                        <li
                                            key={ownerGroup.ownerKey}
                                            className="space-y-1.5 rounded-md3-lg border border-outline-variant/60 bg-surface-container p-2"
                                        >
                                            <div className="flex items-start gap-2 px-1">
                                                <span
                                                    aria-hidden
                                                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-container-highest type-label-m text-on-surface-variant"
                                                >
                                                    {ownerInitial(ownerGroup.displayName)}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex min-w-0 items-baseline gap-1.5">
                                                        <span className="truncate type-title-s text-on-surface">{ownerGroup.displayName}</span>
                                                        {ownerGroup.secondaryName && (
                                                            <span className="truncate type-label-s text-on-surface-variant">
                                                                {ownerGroup.secondaryName}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {ownerGroup.aliases.length > 0 && (
                                                        <p className="truncate type-label-s text-on-surface-variant">
                                                            {t("page.live2d.aliasesLabel")}: {ownerGroup.aliases.join(" / ")}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant">
                                                    {t("page.live2d.variantsCount", { count: ownerGroup.models.length })}
                                                </span>
                                            </div>
                                            <ul className="space-y-0.5">
                                                {ownerGroup.models.map(model => {
                                                    const selected = model.id === current?.id;
                                                    return (
                                                        <li key={model.id}>
                                                            <button
                                                                type="button"
                                                                aria-current={selected || undefined}
                                                                onClick={() => onSelect(model)}
                                                                className={cn(
                                                                    "state-layer focus-ring flex w-full items-center gap-2.5 rounded-md3-md px-2.5 py-1.5 text-left",
                                                                    selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                                                )}
                                                            >
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block truncate type-label-l">{live2dCostumeLabel(t, model)}</span>
                                                                    <span className="block truncate font-mono type-label-s opacity-70">{model.id}</span>
                                                                </span>
                                                                {model.generation === 2 && (
                                                                    <span className="shrink-0 rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container">
                                                                        v2
                                                                    </span>
                                                                )}
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
