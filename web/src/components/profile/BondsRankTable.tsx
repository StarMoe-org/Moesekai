"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { UNIT_DATA, UNIT_ICON_FILES } from "@/types/types";
import { getCharacterIconUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import Modal from "@/components/common/Modal";
import { Button, SectionCard, cn } from "@/components/md3";
import { mdHandshake } from "@/components/md3/icons";
import type { UserBond, UserCharacter } from "@/lib/account";

interface BondsRankTableProps {
    userBonds: UserBond[];
    userCharacters: UserCharacter[];
}

interface BondRow {
    key: string;
    c1: number;
    c2: number;
    rank: number | null;
    exp: number | null;
}

const MAX_BOND_LEVEL = 75;
const DEFAULT_TOPK = 5;

function extractPairFromGroupId(groupId: number): { c1: number; c2: number } {
    return {
        c1: Math.floor(groupId / 100) % 100,
        c2: groupId % 100,
    };
}

function normalizePair(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function pairKey(a: number, b: number): string {
    return `${a}-${b}`;
}

export default function BondsRankTable({ userBonds, userCharacters }: BondsRankTableProps) {
    const { themeColor } = useTheme();
    const { t } = useI18n();
    const [showDetailModal, setShowDetailModal] = useState(false);
    // Filters are inside the modal only
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);

    const characterRankMap = useMemo(() => {
        const map = new Map<number, number>();
        userCharacters.forEach((item) => map.set(item.characterId, item.characterRank));
        return map;
    }, [userCharacters]);

    const bondsMap = useMemo(() => {
        const map = new Map<string, UserBond>();
        userBonds.forEach((item) => {
            const { c1, c2 } = extractPairFromGroupId(item.bondsGroupId);
            map.set(normalizePair(c1, c2), item);
        });
        return map;
    }, [userBonds]);

    const displayedCharacters = useMemo(() => {
        if (!selectedUnitId) return [];
        const unit = UNIT_DATA.find((u) => u.id === selectedUnitId);
        return unit ? unit.charIds : [];
    }, [selectedUnitId]);

    // All rows sorted by rank (for modal and top-k)
    const allSortedRows = useMemo((): BondRow[] => {
        return Array.from(bondsMap.entries())
            .map(([pair, bond]) => {
                const [x, y] = pair.split("-").map(Number);
                const xr = characterRankMap.get(x) || 0;
                const yr = characterRankMap.get(y) || 0;
                const c1 = xr >= yr ? x : y;
                const c2 = xr >= yr ? y : x;
                return { key: pairKey(c1, c2), c1, c2, rank: bond.rank, exp: bond.exp } satisfies BondRow;
            })
            .sort((a, b) => {
                const rankDiff = (b.rank || 0) - (a.rank || 0);
                if (rankDiff !== 0) return rankDiff;
                return (b.exp || 0) - (a.exp || 0);
            });
    }, [bondsMap, characterRankMap]);

    // Top K for inline display
    const topRows = useMemo(() => allSortedRows.slice(0, DEFAULT_TOPK), [allSortedRows]);

    // Filtered rows for modal
    const modalRows = useMemo((): BondRow[] => {
        if (selectedCharacterId !== null) {
            const filtered: BondRow[] = [];
            for (let other = 1; other <= 26; other += 1) {
                if (other === selectedCharacterId) continue;
                const bond = bondsMap.get(normalizePair(selectedCharacterId, other));
                filtered.push({
                    key: pairKey(selectedCharacterId, other),
                    c1: selectedCharacterId,
                    c2: other,
                    rank: bond?.rank ?? null,
                    exp: bond?.exp ?? null,
                });
            }
            return filtered;
        }
        return allSortedRows;
    }, [selectedCharacterId, bondsMap, allSortedRows]);

    const handleUnitClick = (unitId: string) => {
        if (selectedUnitId === unitId) {
            setSelectedUnitId(null);
            setSelectedCharacterId(null);
        } else {
            setSelectedUnitId(unitId);
            setSelectedCharacterId(null);
        }
    };

    const handleOpenModal = () => {
        setSelectedUnitId(null);
        setSelectedCharacterId(null);
        setShowDetailModal(true);
    };

    const renderRow = (row: BondRow) => {
        const c1Rank = characterRankMap.get(row.c1) || 0;
        const c2Rank = characterRankMap.get(row.c2) || 0;
        const c1Name = getCharacterName(t, row.c1);
        const c2Name = getCharacterName(t, row.c2);
        const progress = row.rank ? Math.max(0, Math.min((row.rank / MAX_BOND_LEVEL) * 100, 100)) : 0;
        const expText = row.rank === null ? "-" : row.rank >= MAX_BOND_LEVEL ? "MAX" : String(row.exp || 0);

        return (
            <div key={row.key} className="rounded-md3-md bg-surface-container px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex -space-x-2">
                        <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-surface-container bg-surface-container-highest">
                            <Image src={getCharacterIconUrl(row.c1)} alt={c1Name} fill className="object-cover" unoptimized />
                        </div>
                        <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-surface-container bg-surface-container-highest">
                            <Image src={getCharacterIconUrl(row.c2)} alt={c2Name} fill className="object-cover" unoptimized />
                        </div>
                    </div>
                    <div className="type-label-m text-on-surface">Lv {c1Rank} &amp; {c2Rank}</div>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <span className="text-on-surface-variant">{t("page.profile.stats.bondRank")}</span>
                    <span className="font-medium text-on-surface">{row.rank ?? "-"}</span>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center justify-between type-label-s text-on-surface-variant">
                        <span>{t("page.profile.stats.progress")}</span>
                        <span className="font-medium text-on-surface">{t("page.profile.stats.expValue", { value: expText })}</span>
                    </div>
                    <div className="h-3 rounded-full bg-surface-container-highest overflow-hidden relative">
                        <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: themeColor }} />
                    </div>
                </div>
            </div>
        );
    };

    const renderDesktopRow = (row: BondRow) => {
        const c1Rank = characterRankMap.get(row.c1) || 0;
        const c2Rank = characterRankMap.get(row.c2) || 0;
        const c1Name = getCharacterName(t, row.c1);
        const c2Name = getCharacterName(t, row.c2);
        const progress = row.rank ? Math.max(0, Math.min((row.rank / MAX_BOND_LEVEL) * 100, 100)) : 0;
        const expText = row.rank === null ? "-" : row.rank >= MAX_BOND_LEVEL ? "MAX" : String(row.exp || 0);

        return (
            <div key={row.key} className="flex items-center gap-2 rounded-md3-md bg-surface-container px-2 py-2">
                <div className="w-[92px] shrink-0 flex items-center gap-3 min-w-0">
                    <div className="flex -space-x-2">
                        <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-surface-container bg-surface-container-highest">
                            <Image src={getCharacterIconUrl(row.c1)} alt={c1Name} fill className="object-cover" unoptimized />
                        </div>
                        <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-surface-container bg-surface-container-highest">
                            <Image src={getCharacterIconUrl(row.c2)} alt={c2Name} fill className="object-cover" unoptimized />
                        </div>
                    </div>
                </div>
                <div className="w-20 shrink-0 type-body-m font-medium text-on-surface text-center">{c1Rank} &amp; {c2Rank}</div>
                <div className="w-[72px] shrink-0 type-body-m font-medium text-on-surface text-center">{row.rank ?? "-"}</div>
                <div className="flex-1 min-w-0">
                    <div className="h-4 rounded-full bg-surface-container-highest overflow-hidden relative">
                        <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: themeColor }} />
                    </div>
                </div>
                <div className="w-[72px] shrink-0 type-body-m font-medium text-on-surface text-center">{expText}</div>
            </div>
        );
    };

    return (
        <div id="profile-bonds-rank" className="h-full scroll-mt-20">
        <SectionCard
            className="h-full"
            icon={mdHandshake}
            title={t("page.profile.stats.bondRank")}
            actions={bondsMap.size > DEFAULT_TOPK ? (
                <Button variant="outlined" size="xs" onClick={handleOpenModal}>
                    {t("page.profile.stats.viewDetails")}
                </Button>
            ) : undefined}
        >

            {/* Inline top-k rows */}
            <div className="sm:hidden space-y-2">
                {topRows.map(renderRow)}
                {topRows.length === 0 && <div className="py-8 text-center type-body-m text-on-surface-variant">{t("page.profile.stats.noBondData")}</div>}
            </div>

            <div className="hidden sm:block space-y-2">
                <div className="flex items-center gap-2 px-2 py-2 type-label-l text-on-surface-variant">
                    <div className="w-[92px] shrink-0 text-left">{t("page.profile.stats.character")}</div>
                    <div className="w-20 shrink-0 text-center">{t("page.profile.stats.characterRank")}</div>
                    <div className="w-[72px] shrink-0 text-center">{t("page.profile.stats.bondRank")}</div>
                    <div className="flex-1 min-w-0 text-center">{t("page.profile.stats.progress")}</div>
                    <div className="w-[72px] shrink-0 text-center">{t("page.profile.stats.nextExp")}</div>
                </div>
                {topRows.map(renderDesktopRow)}
                {topRows.length === 0 && <div className="py-8 text-center type-body-m text-on-surface-variant">{t("page.profile.stats.noBondData")}</div>}
            </div>

            <Modal
                isOpen={showDetailModal}
                onClose={() => setShowDetailModal(false)}
                title={t("page.profile.stats.bondRankDetails")}
                size="xl"
            >
                <div className="space-y-4">
                    <div className="rounded-md3-md bg-surface-container-high p-3 sm:p-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {UNIT_DATA.map((unit) => {
                                const selected = selectedUnitId === unit.id;
                                return (
                                    <button
                                        key={unit.id}
                                        onClick={() => handleUnitClick(unit.id)}
                                        aria-pressed={selected}
                                        className={cn(
                                            "state-layer focus-ring rounded-md3-md p-1.5 transition-colors duration-200 ease-md3-standard",
                                            selected
                                                ? "bg-secondary-container ring-2 ring-primary"
                                                : "bg-surface-container-high",
                                        )}
                                        title={t(`common.units.${unit.id}`)}
                                    >
                                        <div className="w-8 h-8 relative">
                                            <Image src={`/data/icon/${UNIT_ICON_FILES[unit.id]}`} alt={t(`common.units.${unit.id}`)} fill className="object-contain" unoptimized />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {displayedCharacters.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                {displayedCharacters.map((characterId) => {
                                    const selected = selectedCharacterId === characterId;
                                    const characterName = getCharacterName(t, characterId);
                                    return (
                                        <button
                                            key={characterId}
                                            onClick={() => setSelectedCharacterId(selected ? null : characterId)}
                                            aria-pressed={selected}
                                            className={cn(
                                                "focus-ring relative rounded-full ring-2 transition-[box-shadow,opacity] duration-200 ease-md3-standard",
                                                selected
                                                    ? "z-10 ring-primary"
                                                    : "opacity-85 ring-transparent hover:opacity-100 hover:ring-outline-variant",
                                            )}
                                            title={characterName}
                                        >
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest">
                                                <Image src={getCharacterIconUrl(characterId)} alt={characterName} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="sm:hidden space-y-2">
                        {modalRows.map(renderRow)}
                        {modalRows.length === 0 && <div className="py-8 text-center type-body-m text-on-surface-variant">{t("page.profile.stats.noBondData")}</div>}
                    </div>

                    <div className="hidden sm:block overflow-x-auto">
                        <div className="min-w-[760px] space-y-2">
                            <div className="flex items-center gap-2 px-2 py-2 type-label-l text-on-surface-variant">
                                <div className="w-[92px] shrink-0 text-left">{t("page.profile.stats.character")}</div>
                                <div className="w-20 shrink-0 text-center">{t("page.profile.stats.characterRank")}</div>
                                <div className="w-[72px] shrink-0 text-center">{t("page.profile.stats.bondRank")}</div>
                                <div className="flex-1 min-w-0 text-center">{t("page.profile.stats.progress")}</div>
                                <div className="w-[72px] shrink-0 text-center">{t("page.profile.stats.nextExp")}</div>
                            </div>
                            {modalRows.map(renderDesktopRow)}
                            {modalRows.length === 0 && <div className="py-8 text-center type-body-m text-on-surface-variant">{t("page.profile.stats.noBondData")}</div>}
                        </div>
                    </div>
                </div>
            </Modal>
        </SectionCard>
        </div>
    );
}
