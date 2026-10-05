"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { UNIT_DATA, UNIT_ICON_FILES, UNIT_FIELD_TO_ID, type CardAttribute } from "@/types/types";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { getAreaItemThumbnailUrl, getCharacterIconUrl, getMaterialThumbnailUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { Button, Chip, LoadingState, SectionCard, cn } from "@/components/md3";
import { mdConstruction } from "@/components/md3/icons";
import type { ServerType, UserArea, UserGamedata, UserMaterial } from "@/lib/account";

type AttrFilter = CardAttribute | "all";

interface Props {
    server: ServerType;
    userAreas: UserArea[];
    userMaterials: UserMaterial[];
    userGamedata: UserGamedata | null;
}

interface AreaItemMaster {
    id: number;
    areaId: number;
    name: string;
    assetbundleName: string;
}

interface AreaItemLevelMaster {
    areaItemId: number;
    level: number;
    targetUnit: string;
    targetCardAttr: string;
    targetGameCharacterId?: number;
    power1BonusRate?: number;
}

interface ResourceBoxDetail {
    resourceType: string;
    resourceId: number;
    resourceLevel?: number;
    resourceQuantity?: number;
}

interface ResourceBoxMaster {
    id: number;
    details: ResourceBoxDetail[];
}

interface ShopItemCost {
    cost: {
        resourceId: number;
        resourceType: string;
        quantity: number;
    };
}

interface ShopItemMaster {
    resourceBoxId: number;
    costs?: ShopItemCost[];
}

interface MaterialMaster {
    id: number;
    name: string;
}

interface ItemMeta {
    item: AreaItemMaster;
    targetUnit: string;
    targetAttr: string;
    targetCharacterId: number | null;
    maxLevel: number;
    levelBonuses: Map<number, number>;
}

const COIN_ID = -1;
const TREE_AREA_ID = 11;
const FLOWER_AREA_ID = 13;

const UNIT_TO_TARGET: Record<string, string> = Object.fromEntries(
    Object.entries(UNIT_FIELD_TO_ID).map(([k, v]) => [v, k])
);

const ATTRS: CardAttribute[] = ["cool", "cute", "happy", "mysterious", "pure"];
const ATTR_ICON_FILES: Record<CardAttribute, string> = {
    cool: "Cool.webp",
    cute: "cute.webp",
    happy: "Happy.webp",
    mysterious: "Mysterious.webp",
    pure: "Pure.webp",
};

function mergeCost(target: Map<number, number>, add: Map<number, number>) {
    add.forEach((v, k) => target.set(k, (target.get(k) || 0) + v));
}

function getAvailableColor(have: number, need: number): string {
    return have >= need ? "text-primary" : "text-error";
}

export default function AreaItemUpgradeMaterials({
    server,
    userAreas,
    userMaterials,
    userGamedata,
}: Props) {
    const { themeColor, assetSource } = useTheme();
    const { t, formatNumber } = useI18n();

    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
    const [selectedAttr, setSelectedAttr] = useState<AttrFilter | null>(null);
    const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [itemMetas, setItemMetas] = useState<Map<number, ItemMeta>>(new Map());
    const [itemLevelCosts, setItemLevelCosts] = useState<Map<number, Map<number, Map<number, number>>>>(new Map());
    const [materialNameMap, setMaterialNameMap] = useState<Map<number, string>>(new Map());

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [areaItems, areaItemLevels, resourceBoxes, shopItems, materials] = await Promise.all([
                    fetchMasterDataForServer<AreaItemMaster[]>(server, "areaItems.json"),
                    fetchMasterDataForServer<AreaItemLevelMaster[]>(server, "areaItemLevels.json"),
                    fetchMasterDataForServer<ResourceBoxMaster[]>(server, "resourceBoxes.json"),
                    fetchMasterDataForServer<ShopItemMaster[]>(server, "shopItems.json"),
                    fetchMasterDataForServer<MaterialMaster[]>(server, "materials.json"),
                ]);

                if (cancelled) return;

                const nameMap = new Map<number, string>();
                materials.forEach((m) => nameMap.set(m.id, m.name));
                setMaterialNameMap(nameMap);

                const levelsByItem = new Map<number, AreaItemLevelMaster[]>();
                areaItemLevels.forEach((row) => {
                    const arr = levelsByItem.get(row.areaItemId) || [];
                    arr.push(row);
                    levelsByItem.set(row.areaItemId, arr);
                });

                const metaMap = new Map<number, ItemMeta>();
                areaItems.forEach((item) => {
                    const lvRows = (levelsByItem.get(item.id) || []).slice().sort((a, b) => a.level - b.level);
                    if (!lvRows.length) return;
                    const first = lvRows[0];
                    const maxLevel = lvRows[lvRows.length - 1].level;
                    const bonusMap = new Map<number, number>();
                    lvRows.forEach((row) => {
                        bonusMap.set(row.level, row.power1BonusRate || 0);
                    });
                    metaMap.set(item.id, {
                        item,
                        targetUnit: first.targetUnit || "",
                        targetAttr: first.targetCardAttr || "",
                        targetCharacterId: first.targetGameCharacterId || null,
                        maxLevel,
                        levelBonuses: bonusMap,
                    });
                });

                const boxToTarget = new Map<number, { itemId: number; level: number }>();
                resourceBoxes.forEach((box) => {
                    box.details.forEach((d) => {
                        if (d.resourceType === "area_item" && typeof d.resourceLevel === "number") {
                            boxToTarget.set(box.id, { itemId: d.resourceId, level: d.resourceLevel });
                        }
                    });
                });

                const costsMap = new Map<number, Map<number, Map<number, number>>>();
                shopItems.forEach((shop) => {
                    const target = boxToTarget.get(shop.resourceBoxId);
                    if (!target) return;
                    const perLevel = costsMap.get(target.itemId) || new Map<number, Map<number, number>>();
                    const materialCost = new Map<number, number>();
                    (shop.costs || []).forEach((c) => {
                        const cost = c.cost;
                        const key = cost.resourceType === "coin" ? COIN_ID : cost.resourceId;
                        materialCost.set(key, (materialCost.get(key) || 0) + cost.quantity);
                    });
                    perLevel.set(target.level, materialCost);
                    costsMap.set(target.itemId, perLevel);
                });

                setItemMetas(metaMap);
                setItemLevelCosts(costsMap);
            } catch {
                if (!cancelled) {
                    setError(t("page.profile.stats.areaItemLoadFailed"));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [server, t]);

    const userMaterialMap = useMemo(() => {
        const map = new Map<number, number>();
        map.set(COIN_ID, userGamedata?.coin || 0);
        userMaterials.forEach((m) => map.set(m.materialId, m.quantity));
        return map;
    }, [userMaterials, userGamedata]);

    const userItemLvMap = useMemo(() => {
        const map = new Map<number, number>();
        userAreas.forEach((area) => {
            area.areaItems.forEach((item) => map.set(item.areaItemId, item.level));
        });
        return map;
    }, [userAreas]);

    const displayedCharacters = useMemo(() => {
        if (!selectedUnitId) return UNIT_DATA.flatMap((u) => u.charIds);
        const unit = UNIT_DATA.find((u) => u.id === selectedUnitId);
        return unit ? unit.charIds : [];
    }, [selectedUnitId]);

    const filteredItems = useMemo(() => {
        const metas = Array.from(itemMetas.values());
        if (selectedAttr) {
            if (selectedAttr === "all") {
                return metas.filter((m) => m.item.areaId === TREE_AREA_ID || m.item.areaId === FLOWER_AREA_ID);
            }
            return metas.filter((m) => m.targetAttr === selectedAttr);
        }

        if (selectedCharacterId !== null) {
            return metas.filter((m) => m.targetCharacterId === selectedCharacterId);
        }

        if (selectedUnitId) {
            const targetUnit = UNIT_TO_TARGET[selectedUnitId];
            return metas.filter((m) => m.targetUnit === targetUnit && !m.targetCharacterId);
        }

        return [];
    }, [itemMetas, selectedAttr, selectedCharacterId, selectedUnitId]);

    const sortedItems = useMemo(() => {
        return filteredItems.sort((a, b) => a.item.id - b.item.id);
    }, [filteredItems]);

    const onUnitClick = (unitId: string) => {
        setSelectedAttr(null);
        setSelectedUnitId((prev) => (prev === unitId ? null : unitId));
        setSelectedCharacterId((prev) => {
            if (prev === null) return null;
            const unit = UNIT_DATA.find((u) => u.id === unitId);
            if (!unit) return null;
            return unit.charIds.includes(prev) ? prev : null;
        });
    };

    const onCharacterClick = (characterId: number) => {
        setSelectedAttr(null);
        setSelectedCharacterId((prev) => (prev === characterId ? null : characterId));
    };

    const onAttrClick = (attr: AttrFilter) => {
        setSelectedUnitId(null);
        setSelectedCharacterId(null);
        setSelectedAttr((prev) => (prev === attr ? null : attr));
    };

    const emptyHint = !selectedUnitId && selectedCharacterId === null && !selectedAttr;

    useEffect(() => {
        setExpandedItemId(null);
    }, [selectedUnitId, selectedCharacterId, selectedAttr]);

    return (
        <div id="profile-area-item-materials" className="mb-6 scroll-mt-20">
        <SectionCard icon={mdConstruction} title={t("page.profile.stats.areaItemUpgradeMaterials")}>
            <p className="-mt-1 mb-4 type-body-s text-on-surface-variant">
                {t("page.profile.stats.areaItemUpgradeDescription")}
            </p>

            <div className="space-y-3 mb-4">
                <div className="flex flex-wrap gap-2">
                    {UNIT_DATA.map((unit) => {
                        const selected = selectedUnitId === unit.id;
                        return (
                            <button
                                key={unit.id}
                                onClick={() => onUnitClick(unit.id)}
                                aria-pressed={selected}
                                className={cn(
                                    "state-layer focus-ring rounded-md3-md p-1.5 transition-colors duration-200 ease-md3-standard",
                                    selected ? "bg-secondary-container ring-2 ring-primary" : "bg-surface-container-high",
                                )}
                                title={t(`common.units.${unit.id}`)}
                            >
                                <div className="w-8 h-8 relative">
                                    <Image
                                        src={`/data/icon/${UNIT_ICON_FILES[unit.id]}`}
                                        alt={t(`common.units.${unit.id}`)}
                                        fill
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {displayedCharacters.map((characterId) => {
                        const selected = selectedCharacterId === characterId;
                        const characterName = getCharacterName(t, characterId);
                        return (
                            <button
                                key={characterId}
                                onClick={() => onCharacterClick(characterId)}
                                aria-pressed={selected}
                                className={cn(
                                    "focus-ring relative rounded-full ring-2 transition-[box-shadow,opacity] duration-200 ease-md3-standard",
                                    selected ? "z-10 ring-primary" : "opacity-85 ring-transparent hover:opacity-100 hover:ring-outline-variant",
                                )}
                                title={characterName}
                            >
                                <div className="w-9 h-9 rounded-full overflow-hidden bg-surface-container-highest">
                                    <Image
                                        src={getCharacterIconUrl(characterId)}
                                        alt={characterName}
                                        width={36}
                                        height={36}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {ATTRS.map((attr) => {
                        const selected = selectedAttr === attr;
                        return (
                            <button
                                key={attr}
                                onClick={() => onAttrClick(attr)}
                                aria-pressed={selected}
                                className={cn(
                                    "state-layer focus-ring rounded-md3-md p-1.5 transition-colors duration-200 ease-md3-standard",
                                    selected ? "bg-secondary-container ring-2 ring-primary" : "bg-surface-container-high",
                                )}
                                title={attr}
                            >
                                <div className="w-8 h-8 relative">
                                    <Image
                                        src={`/data/icon/${ATTR_ICON_FILES[attr]}`}
                                        alt={attr}
                                        fill
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            </button>
                        );
                    })}
                    <Chip selected={selectedAttr === "all"} onClick={() => onAttrClick("all")}>
                        {t("common.filter.all")}
                    </Chip>
                </div>
            </div>

            {loading && (
                <LoadingState className="min-h-[200px]" label={t("page.profile.stats.loadingAreaItems")} />
            )}

            {!loading && error && (
                <div className="py-8 text-center type-body-m text-error">
                    {error}
                </div>
            )}

            {!loading && !error && emptyHint && (
                <div className="py-8 text-center type-body-m text-on-surface-variant">
                    {t("page.profile.stats.areaItemEmptyHint")}
                </div>
            )}

            {!loading && !error && !emptyHint && sortedItems.length === 0 && (
                <div className="py-8 text-center type-body-m text-on-surface-variant">
                    {t("page.profile.stats.noAreaItemResult")}
                </div>
            )}

            {!loading && !error && sortedItems.length > 0 && (
                <div className="space-y-4">
                    {sortedItems.map((meta) => {
                        const currentLv = userItemLvMap.get(meta.item.id) || 0;
                        const costsByLv = itemLevelCosts.get(meta.item.id) || new Map<number, Map<number, number>>();
                        const lvRows: Array<{
                            level: number;
                            bonus: number;
                            lvCost: Map<number, number>;
                            sumCost: Map<number, number>;
                        }> = [];
                        const running = new Map<number, number>();

                        for (let lv = currentLv + 1; lv <= meta.maxLevel; lv += 1) {
                            const lvCost = costsByLv.get(lv) || new Map<number, number>();
                            mergeCost(running, lvCost);
                            lvRows.push({
                                level: lv,
                                bonus: meta.levelBonuses.get(lv) || 0,
                                lvCost,
                                sumCost: new Map(running),
                            });
                        }

                        const levelsRemaining = Math.max(meta.maxLevel - currentLv, 0);
                        const currentBonus = meta.levelBonuses.get(currentLv) || 0;
                        const maxBonus = meta.levelBonuses.get(meta.maxLevel) || currentBonus;
                        const totalCost = lvRows.length > 0
                            ? lvRows[lvRows.length - 1].sumCost
                            : new Map<number, number>();
                        const totalMaterials = Array.from(totalCost.entries()).sort((a, b) => b[1] - a[1]);
                        const expanded = expandedItemId === meta.item.id;

                        return (
                            <div key={meta.item.id} className="rounded-md3-lg bg-surface-container p-3 sm:p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="relative w-14 h-14 rounded-md3-md overflow-hidden bg-surface-container-highest">
                                        <Image
                                            src={getAreaItemThumbnailUrl(meta.item.assetbundleName, assetSource)}
                                            alt={meta.item.name}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="type-title-s text-on-surface truncate">{meta.item.name}</div>
                                        <div className="type-body-s text-on-surface-variant">{t("page.profile.stats.currentMaxLevel", { current: currentLv, max: meta.maxLevel })}</div>
                                        <div className="type-body-s text-on-surface-variant mt-0.5">{t("page.profile.stats.bonusRange", { current: currentBonus.toFixed(1), max: maxBonus.toFixed(1) })}</div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {lvRows.length === 0 && (
                                        <div className="type-label-l text-primary">{t("page.profile.stats.maxLevelNoMaterials")}</div>
                                    )}

                                    {lvRows.length > 0 && (
                                        <>
                                            <div className="rounded-md3-md bg-surface-container-high px-3 py-2.5">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="type-label-l text-on-surface">{t("page.profile.stats.totalRequiredMaterials")}</div>
                                                    <div className="type-label-m text-on-surface-variant">{t("page.profile.stats.remainingLevels", { count: levelsRemaining })}</div>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {totalMaterials.map(([materialId, quantity]) => {
                                                        const have = userMaterialMap.get(materialId) || 0;
                                                        const enoughClass = getAvailableColor(have, quantity);
                                                        const isCoin = materialId === COIN_ID;
                                                        const materialName = isCoin ? t("page.profile.stats.coin") : (materialNameMap.get(materialId) || t("page.profile.stats.materialFallback", { id: materialId }));
                                                        return (
                                                            <div key={materialId} className="flex items-center gap-2 rounded-md3-sm bg-surface-container-lowest px-2 py-1.5">
                                                                {isCoin ? (
                                                                    <div className="w-8 h-8 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center text-sm font-black">¥</div>
                                                                ) : (
                                                                    <div className="relative w-8 h-8 rounded-md3-xs overflow-hidden bg-surface-container-highest">
                                                                        <Image
                                                                            src={getMaterialThumbnailUrl(materialId, assetSource)}
                                                                            alt={materialName}
                                                                            fill
                                                                            className="object-cover"
                                                                            unoptimized
                                                                        />
                                                                    </div>
                                                                )}
                                                                <div className="min-w-0">
                                                                    <div className="type-label-s text-on-surface-variant truncate">{materialName}</div>
                                                                    <div className={`text-xs font-bold ${enoughClass}`}>
                                                                        {t("page.profile.stats.ownedTotalRequired", { have: formatNumber(have), total: formatNumber(quantity) })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-1">
                                                <Button
                                                    variant="outlined"
                                                    size="xs"
                                                    aria-expanded={expanded}
                                                    onClick={() => setExpandedItemId((prev) => prev === meta.item.id ? null : meta.item.id)}
                                                >
                                                    {expanded ? t("page.profile.stats.collapseLevelDetails") : t("page.profile.stats.viewLevelDetails")}
                                                </Button>
                                            </div>

                                            {expanded && (
                                                <div className="space-y-2 pt-1">
                                                    {lvRows.map((row) => (
                                                        <div key={row.level} className="rounded-md3-md bg-surface-container-high px-2.5 py-2">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="type-title-s text-on-surface">
                                                                    Lv.{row.level}
                                                                    <span className="ml-2 type-label-m text-on-surface-variant">+{row.bonus.toFixed(1)}%</span>
                                                                </div>
                                                                <div
                                                                    className="h-1.5 rounded-full"
                                                                    style={{
                                                                        width: `${Math.max(4, Math.min((row.level / meta.maxLevel) * 100, 100))}%`,
                                                                        backgroundColor: themeColor,
                                                                    }}
                                                                />
                                                            </div>

                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                {Array.from(row.lvCost.entries()).map(([materialId, quantity]) => {
                                                                    const have = userMaterialMap.get(materialId) || 0;
                                                                    const sumNeed = row.sumCost.get(materialId) || 0;
                                                                    const enoughClass = getAvailableColor(have, sumNeed);
                                                                    const isCoin = materialId === COIN_ID;
                                                                    const materialName = isCoin ? t("page.profile.stats.coin") : (materialNameMap.get(materialId) || t("page.profile.stats.materialFallback", { id: materialId }));
                                                                    return (
                                                                        <div key={materialId} className="flex items-center gap-2 rounded-md3-sm bg-surface-container-lowest px-2 py-1.5">
                                                                            {isCoin ? (
                                                                                <div className="w-8 h-8 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center text-sm font-black">¥</div>
                                                                            ) : (
                                                                                <div className="relative w-8 h-8 rounded-md3-xs overflow-hidden bg-surface-container-highest">
                                                                                    <Image
                                                                                        src={getMaterialThumbnailUrl(materialId, assetSource)}
                                                                                        alt={materialName}
                                                                                        fill
                                                                                        className="object-cover"
                                                                                        unoptimized
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                            <div className="min-w-0">
                                                                                <div className="type-label-s text-on-surface-variant truncate">{materialName}</div>
                                                                                <div className="type-label-m text-on-surface">
                                                                                    {t("page.profile.stats.requiredThisLevel", { count: formatNumber(quantity) })}
                                                                                </div>
                                                                                <div className={`text-xs font-bold ${enoughClass}`}>
                                                                                    {t("page.profile.stats.ownedCumulative", { have: formatNumber(have), total: formatNumber(sumNeed) })}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </SectionCard>
        </div>
    );
}
