"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { UNIT_DATA, UNIT_FIELD_TO_ID, UNIT_ICON_FILES, type CardAttribute } from "@/types/types";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { getCharacterIconUrl } from "@/lib/assets";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import Modal from "@/components/common/Modal";
import { Button, LoadingState, SectionCard } from "@/components/md3";
import { mdBolt } from "@/components/md3/icons";
import type {
    ServerType,
    UserArea,
    UserCharacter,
    UserMysekaiFixtureGameCharacterPerformanceBonus,
    UserMysekaiGate,
} from "@/lib/account";

interface Props {
    server: ServerType;
    userAreas: UserArea[];
    userCharacters: UserCharacter[];
    userMysekaiFixtureGameCharacterPerformanceBonuses: UserMysekaiFixtureGameCharacterPerformanceBonus[];
    userMysekaiGates: UserMysekaiGate[];
}

interface AreaItemLevelMaster {
    areaItemId: number;
    level: number;
    targetUnit: string;
    targetCardAttr: string;
    targetGameCharacterId?: number;
    power1BonusRate: number;
}

interface CharacterRankMaster {
    characterId: number;
    characterRank: number;
    power1BonusRate: number;
}

interface GateLevelMaster {
    mysekaiGateId: number;
    level: number;
    powerBonusRate: number;
}

interface CharaBonus {
    areaItem: number;
    rank: number;
    fixture: number;
    total: number;
}

interface UnitBonus {
    areaItem: number;
    gate: number;
    total: number;
}

interface AttrBonus {
    areaItem: number;
    total: number;
}

const UNIT_ORDER = ["light_sound", "idol", "street", "theme_park", "school_refusal", "piapro"] as const;
const UNIT_LABEL_KEYS: Record<(typeof UNIT_ORDER)[number], string> = {
    light_sound: "common.musicTags.light_music_club",
    idol: "common.musicTags.idol",
    street: "common.musicTags.street",
    theme_park: "common.musicTags.theme_park",
    school_refusal: "common.musicTags.school_refusal",
    piapro: "common.musicTags.vocaloid",
};
const ATTR_ORDER: CardAttribute[] = ["cool", "cute", "happy", "mysterious", "pure"];
const ATTR_ICON_FILES: Record<CardAttribute, string> = {
    cool: "Cool.webp",
    cute: "cute.webp",
    happy: "Happy.webp",
    mysterious: "Mysterious.webp",
    pure: "Pure.webp",
};

const UNIT_ICON: Record<string, string> = Object.fromEntries(
    Object.entries(UNIT_FIELD_TO_ID).map(([field, id]) => [field, "/data/icon/" + UNIT_ICON_FILES[id]])
);

const UNIT_CHAR_IDS: Record<string, number[]> = Object.fromEntries(
    UNIT_DATA.map(u => {
        const field = Object.entries(UNIT_FIELD_TO_ID).find(([, v]) => v === u.id)?.[0];
        return field ? [field, u.charIds] : null;
    }).filter(Boolean) as [string, number[]][]
);

function fmt(v: number): string {
    return `${v.toFixed(1)}%`;
}

export default function PowerBonusDetail({
    server,
    userAreas,
    userCharacters,
    userMysekaiFixtureGameCharacterPerformanceBonuses,
    userMysekaiGates,
}: Props) {
    const { t } = useI18n();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    const [areaItemLevels, setAreaItemLevels] = useState<AreaItemLevelMaster[]>([]);
    const [characterRanks, setCharacterRanks] = useState<CharacterRankMaster[]>([]);
    const [gateLevels, setGateLevels] = useState<GateLevelMaster[]>([]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [a, c, g] = await Promise.all([
                    fetchMasterDataForServer<AreaItemLevelMaster[]>(server, "areaItemLevels.json"),
                    fetchMasterDataForServer<CharacterRankMaster[]>(server, "characterRanks.json"),
                    fetchMasterDataForServer<GateLevelMaster[]>(server, "mysekaiGateLevels.json"),
                ]);
                if (cancelled) return;
                setAreaItemLevels(a);
                setCharacterRanks(c);
                setGateLevels(g);
            } catch {
                if (!cancelled) setError(t("page.profile.stats.powerBonusLoadFailed"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [server, t]);

    useEffect(() => {
        setShowDetailModal(false);
    }, [server]);

    const areaItemBonusAtCurrentLv = useMemo(() => {
        const byItem = new Map<number, Map<number, AreaItemLevelMaster>>();
        areaItemLevels.forEach((x) => {
            const m = byItem.get(x.areaItemId) || new Map<number, AreaItemLevelMaster>();
            m.set(x.level, x);
            byItem.set(x.areaItemId, m);
        });
        const rows: AreaItemLevelMaster[] = [];
        userAreas.forEach((area) => {
            area.areaItems.forEach((item) => {
                const row = byItem.get(item.areaItemId)?.get(item.level);
                if (row) rows.push(row);
            });
        });
        return rows;
    }, [areaItemLevels, userAreas]);

    const bonus = useMemo(() => {
        const chara = new Map<number, CharaBonus>();
        for (let i = 1; i <= 26; i += 1) chara.set(i, { areaItem: 0, rank: 0, fixture: 0, total: 0 });

        const unit = new Map<(typeof UNIT_ORDER)[number], UnitBonus>();
        UNIT_ORDER.forEach((u) => unit.set(u, { areaItem: 0, gate: 0, total: 0 }));

        const attr = new Map<CardAttribute, AttrBonus>();
        ATTR_ORDER.forEach((a) => attr.set(a, { areaItem: 0, total: 0 }));

        areaItemBonusAtCurrentLv.forEach((item) => {
            const cid = item.targetGameCharacterId;
            if (typeof cid === "number" && cid >= 1 && cid <= 26) {
                chara.get(cid)!.areaItem += item.power1BonusRate || 0;
            }
            const unitKey = item.targetUnit as (typeof UNIT_ORDER)[number];
            if (UNIT_ORDER.includes(unitKey)) unit.get(unitKey)!.areaItem += item.power1BonusRate || 0;
            const attrKey = item.targetCardAttr as CardAttribute;
            if (ATTR_ORDER.includes(attrKey)) attr.get(attrKey)!.areaItem += item.power1BonusRate || 0;
        });

        const rankByChar = new Map<string, CharacterRankMaster>();
        characterRanks.forEach((r) => rankByChar.set(`${r.characterId}-${r.characterRank}`, r));
        userCharacters.forEach((c) => {
            const r = rankByChar.get(`${c.characterId}-${c.characterRank}`);
            if (!r) return;
            const b = chara.get(c.characterId);
            if (!b) return;
            b.rank += r.power1BonusRate || 0;
        });

        userMysekaiFixtureGameCharacterPerformanceBonuses.forEach((f) => {
            const b = chara.get(f.gameCharacterId);
            if (!b) return;
            b.fixture += (f.totalBonusRate || 0) * 0.1;
        });

        const gateByKey = new Map<string, GateLevelMaster>();
        gateLevels.forEach((g) => gateByKey.set(`${g.mysekaiGateId}-${g.level}`, g));
        let maxGateBonus = 0;
        userMysekaiGates.forEach((g) => {
            const lv = gateByKey.get(`${g.mysekaiGateId}-${g.mysekaiGateLevel}`);
            if (!lv) return;
            const gateBonus = lv.powerBonusRate || 0;
            maxGateBonus = Math.max(maxGateBonus, gateBonus);
            const idx = g.mysekaiGateId - 1;
            if (idx >= 0 && idx < 5) unit.get(UNIT_ORDER[idx])!.gate += gateBonus;
        });
        unit.get("piapro")!.gate += maxGateBonus;

        chara.forEach((b) => { b.total = b.areaItem + b.rank + b.fixture; });
        unit.forEach((b) => { b.total = b.areaItem + b.gate; });
        attr.forEach((b) => { b.total = b.areaItem; });

        return { chara, unit, attr };
    }, [areaItemBonusAtCurrentLv, characterRanks, gateLevels, userCharacters, userMysekaiFixtureGameCharacterPerformanceBonuses, userMysekaiGates]);

    const renderUnitCards = (showBreakdown: boolean) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {UNIT_ORDER.map((unitKey) => {
                const unitBonus = bonus.unit.get(unitKey)!;
                const charIds = UNIT_CHAR_IDS[unitKey];
                const unitLabel = t(UNIT_LABEL_KEYS[unitKey]);
                const isVirtualSinger = unitKey === "piapro";

                return (
                    <div key={unitKey} className="rounded-md3-md bg-surface-container p-3">
                        <div className="flex flex-col items-center gap-2 mb-3">
                            <div className="relative w-8 h-8 flex-shrink-0">
                                <Image src={UNIT_ICON[unitKey]} alt={unitLabel} fill className="object-contain" unoptimized />
                            </div>
                            <span className="type-title-l text-on-surface">{fmt(unitBonus.total)}</span>
                        </div>

                        <div className={`flex justify-center flex-wrap ${isVirtualSinger ? "gap-1.5 sm:gap-2" : "gap-3"}`}>
                            {charIds.map((cid) => {
                                const cb = bonus.chara.get(cid);
                                const characterName = getCharacterName(t, cid);
                                return (
                                    <div key={cid} className="flex flex-col items-center gap-0.5">
                                        <div className={`relative rounded-full overflow-hidden bg-surface-container-highest ${isVirtualSinger ? "w-7 h-7" : "w-8 h-8"}`}>
                                            <Image src={getCharacterIconUrl(cid)} alt={characterName} fill className="object-cover" unoptimized />
                                        </div>
                                        <span className={`font-medium text-on-surface-variant ${isVirtualSinger ? "text-[9px]" : "text-[10px]"}`}>
                                            {cb ? fmt(cb.total) : "-"}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {showBreakdown && (
                            <div className="mt-3 pt-2 border-t border-outline-variant space-y-1.5">
                                <div className="type-label-s text-on-surface-variant">
                                    <span className="font-medium text-on-surface-variant">{t("page.profile.stats.unitBonus")}</span>
                                    <span className="ml-1.5">{fmt(unitBonus.total)}</span>
                                    <span className="ml-1 text-on-surface-variant opacity-80">{t("page.profile.stats.unitBonusFormula", { areaItem: fmt(unitBonus.areaItem), gate: fmt(unitBonus.gate) })}</span>
                                </div>
                                {charIds.map((cid) => {
                                    const cb = bonus.chara.get(cid);
                                    if (!cb) return null;
                                    const name = getCharacterName(t, cid, "short");
                                    return (
                                        <div key={cid} className="type-label-s text-on-surface-variant flex items-center gap-1.5 flex-wrap">
                                            <div className="relative w-4 h-4 rounded-full overflow-hidden bg-surface-container-highest flex-shrink-0">
                                                <Image src={getCharacterIconUrl(cid)} alt={name} fill className="object-cover" unoptimized />
                                            </div>
                                            <span className="font-medium text-on-surface-variant">{fmt(cb.total)}</span>
                                            <span className="text-on-surface-variant opacity-80">{t("page.profile.stats.characterBonusFormula", { areaItem: fmt(cb.areaItem), rank: fmt(cb.rank), fixture: fmt(cb.fixture) })}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    const renderAttrCards = () => (
        <div className="rounded-md3-md bg-surface-container p-3">
            <div className="type-title-s text-on-surface mb-3">{t("page.profile.stats.attributeBonus")}</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {ATTR_ORDER.map((a) => {
                    const b = bonus.attr.get(a)!;
                    return (
                        <div key={a} className="rounded-md3-sm bg-surface-container-highest px-2.5 py-2 flex items-center gap-2">
                            <div className="relative w-6 h-6">
                                <Image src={`/data/icon/${ATTR_ICON_FILES[a]}`} alt={a} fill className="object-contain" unoptimized />
                            </div>
                            <div className="type-title-s text-on-surface">{fmt(b.total)}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div id="profile-power-bonus" className="h-full scroll-mt-20">
        <SectionCard
            className="h-full"
            icon={mdBolt}
            title={t("page.profile.stats.powerBonus")}
            actions={!loading && !error ? (
                <Button variant="outlined" size="xs" onClick={() => setShowDetailModal(true)}>
                    {t("page.profile.stats.viewDetails")}
                </Button>
            ) : undefined}
        >
            {loading && <LoadingState className="min-h-[200px]" label={t("page.profile.stats.loadingPowerBonus")} />}
            {!loading && error && <div className="py-8 text-center type-body-m text-error">{error}</div>}

            {!loading && !error && (
                <div className="space-y-4">
                    {renderUnitCards(false)}
                    {renderAttrCards()}
                </div>
            )}

            {!loading && !error && (
                <Modal
                    isOpen={showDetailModal}
                    onClose={() => setShowDetailModal(false)}
                    title={t("page.profile.stats.powerBonusDetails")}
                    size="xl"
                >
                    <div className="space-y-5">
                        <section className="rounded-md3-lg bg-surface-container-high p-3 sm:p-4 space-y-3">
                            <h3 className="type-title-s text-on-surface">{t("page.profile.stats.unitCharacterBonusBreakdown")}</h3>
                            {renderUnitCards(true)}
                        </section>
                        <section className="rounded-md3-lg bg-surface-container-high p-3 sm:p-4 space-y-3">
                            <h3 className="type-title-s text-on-surface">{t("page.profile.stats.attributeBonus")}</h3>
                            {renderAttrCards()}
                        </section>
                    </div>
                </Modal>
            )}
        </SectionCard>
        </div>
    );
}
