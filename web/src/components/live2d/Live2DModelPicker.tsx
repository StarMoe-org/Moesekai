"use client";
import { useMemo } from "react";
import { cn } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import { UNIT_DATA, UNIT_ICON_FILES, UNIT_ID_LABEL_KEYS } from "@/types/types";
import { live2dCostumeLabel, live2dGroupKey } from "./labels";

interface Live2DModelPickerProps {
    models: readonly Live2DModel[];
    current: Live2DModel | null;
    /** The group whose models are listed (`character:<id>`, `sub`, `mob`). */
    group: string;
    onGroupChange: (group: string) => void;
    onSelect: (model: Live2DModel) => void;
}

/**
 * Choosing a model: the characters by unit (and side characters and mobs), then the chosen
 * one's models, newest generation and everyday costumes first.
 */
export function Live2DModelPicker({ models, current, group, onGroupChange, onSelect }: Live2DModelPickerProps) {
    const { t } = useI18n();
    const counts = useMemo(() => {
        const byGroup = new Map<string, number>();
        for (const model of models) byGroup.set(live2dGroupKey(model), (byGroup.get(live2dGroupKey(model)) ?? 0) + 1);
        return byGroup;
    }, [models]);
    const listed = useMemo(() => models.filter(model => live2dGroupKey(model) === group), [models, group]);
    const currentGroup = current ? live2dGroupKey(current) : null;

    return (
        <div className="space-y-4">
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
                    {(["sub", "mob"] as const).map(kind => (
                        <button
                            key={kind}
                            type="button"
                            aria-pressed={group === kind}
                            disabled={!counts.get(kind)}
                            onClick={() => onGroupChange(kind)}
                            className={cn(
                                "state-layer focus-ring inline-flex h-9 items-center gap-1.5 rounded-full px-4 type-label-l",
                                group === kind ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-high text-on-surface",
                                !counts.get(kind) && "opacity-38",
                            )}
                        >
                            {t(`page.live2d.kind.${kind}`)}
                            <span className="type-label-s opacity-70">{counts.get(kind) ?? 0}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <p className="mb-1 px-1 type-title-s text-on-surface">
                    {group.startsWith("character:") ? getCharacterName(t, Number(group.slice("character:".length))) : t(`page.live2d.kind.${group}`)}
                    <span className="ml-2 type-label-m text-on-surface-variant">{listed.length}</span>
                </p>
                {listed.length === 0 ? (
                    <p className="px-1 type-body-s text-on-surface-variant">{t("page.live2d.groupEmpty")}</p>
                ) : (
                    <ul className="space-y-0.5">
                        {listed.map(model => {
                            const selected = model.id === current?.id;
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
                                            <span className="block truncate type-label-l">{live2dCostumeLabel(t, model)}</span>
                                            <span className="block truncate font-mono type-label-s opacity-70">{model.id}</span>
                                        </span>
                                        {model.generation === 2 && (
                                            <span className="shrink-0 rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container">v2</span>
                                        )}
                                        {model.bytes > 0 && (
                                            <span className="w-14 shrink-0 text-right font-mono type-label-s opacity-70">
                                                {(model.bytes / (1024 * 1024)).toFixed(1)} MB
                                            </span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
