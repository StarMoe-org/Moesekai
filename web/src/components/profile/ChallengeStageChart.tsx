"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import ReactECharts from "echarts-for-react";
import { CHAR_COLORS } from "@/types/types";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { getCharacterIconUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import Modal from "@/components/common/Modal";
import { Button, LoadingState, SectionCard } from "@/components/md3";
import { mdLeaderboard } from "@/components/md3/icons";
import { useProfileChartColors } from "./useProfileChartColors";
import type {
    ServerType,
    UserChallengeLiveSoloHighScoreReward,
    UserChallengeLiveSoloResult,
    UserChallengeLiveSoloStage,
} from "@/lib/account";

interface Props {
    challengeStageRanks: Map<number, number>;
    server: ServerType;
    challengeSoloStages: UserChallengeLiveSoloStage[];
    challengeSoloResults: UserChallengeLiveSoloResult[];
    challengeHighScoreRewards: UserChallengeLiveSoloHighScoreReward[];
}

interface Row { characterId: number; rank: number; score: number; remainJewel: number; remainFragment: number; }
interface RewardMaster { id: number; characterId: number; resourceBoxId: number; }
interface BoxDetail { resourceType?: string; resourceId?: number; resourceQuantity?: number; }
interface BoxMaster { id: number; resourceBoxPurpose?: string; details?: BoxDetail[]; }
interface BoxDetailMasterRow {
    resourceBoxPurpose?: string;
    resourceBoxId: number;
    resourceType?: string;
    resourceId?: number | null;
    resourceQuantity?: number | null;
}
const GROUPS = [
    { key: "ln" as const, unit: "light_sound", labelKey: "common.musicTags.light_music_club", icon: "/data/icon/ln.webp", ids: [1, 2, 3, 4] },
    { key: "mmj" as const, unit: "idol", labelKey: "common.musicTags.idol", icon: "/data/icon/mmj.webp", ids: [5, 6, 7, 8] },
    { key: "vbs" as const, unit: "street", labelKey: "common.musicTags.street", icon: "/data/icon/vbs.webp", ids: [9, 10, 11, 12] },
    { key: "wxs" as const, unit: "theme_park", labelKey: "common.musicTags.theme_park", icon: "/data/icon/wxs.webp", ids: [13, 14, 15, 16] },
    { key: "n25" as const, unit: "school_refusal", labelKey: "common.musicTags.school_refusal", icon: "/data/icon/n25.webp", ids: [17, 18, 19, 20] },
    { key: "vs" as const, unit: "piapro", labelKey: "common.musicTags.vocaloid", icon: "/data/icon/vs.webp", ids: [21, 22, 23, 24, 25, 26] },
];

const CHALLENGE_BOX_PURPOSE = "challenge_live_high_score";
const scoreCap = (s: ServerType) => (s === "jp" ? 3000000 : 2500000);
const rewardId = (x: UserChallengeLiveSoloHighScoreReward) => Number(x.challengeLiveHighScoreRewardId ?? x.challengeLiveSoloHighScoreRewardId ?? x.rewardId ?? 0) || null;
const rewardCid = (x: UserChallengeLiveSoloHighScoreReward) => Number(x.characterId ?? x.gameCharacterId ?? 0) || null;
const boxKey = (purpose: string, boxId: number) => `${purpose}#${boxId}`;

function collectBox(resourceMap: Map<number, BoxMaster>, root: number): { jewel: number; frag: number } {
    let jewel = 0; let frag = 0;
    const stack = [root]; const visited = new Set<number>();
    while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        for (const d of resourceMap.get(id)?.details || []) {
            const t = String(d.resourceType || "").toLowerCase();
            const rid = Number(d.resourceId || 0);
            const q = Number(d.resourceQuantity || 0);
            if (!q) continue;
            if (t.includes("jewel")) jewel += q;
            else if (t === "material" && rid === 15) frag += q;
            else if (t.includes("box")) stack.push(rid);
        }
    }
    return { jewel, frag };
}

export default function ChallengeStageChart({
    challengeStageRanks, server, challengeSoloStages, challengeSoloResults, challengeHighScoreRewards,
}: Props) {
    const { themeColor, serverSource } = useTheme();
    const { t, formatNumber } = useI18n();
    const colors = useProfileChartColors();
    const [mobile, setMobile] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [rows, setRows] = useState<Row[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        const fn = () => setMobile(window.innerWidth <= 420);
        fn(); window.addEventListener("resize", fn); return () => window.removeEventListener("resize", fn);
    }, []);

    useEffect(() => { setRows(null); setShowDetail(false); setError(null); setLoading(false); }, [server, serverSource, challengeSoloStages, challengeSoloResults, challengeHighScoreRewards]);

    // Sort characters by rank descending for bar chart
    const sortedChars = useMemo(() => {
        const entries: { id: number; rank: number }[] = [];
        for (let i = 1; i <= 26; i++) {
            entries.push({ id: i, rank: challengeStageRanks.get(i) || 0 });
        }
        return entries.sort((a, b) => b.rank - a.rank);
    }, [challengeStageRanks]);

    const barOption = useMemo(() => ({
        animation: true,
        animationDuration: 800,
        animationEasing: "cubicOut",
        tooltip: {
            trigger: "axis" as const,
            backgroundColor: colors.surfaceContainerHigh,
            borderColor: colors.outlineVariant,
            textStyle: { color: colors.onSurface },
            axisPointer: { type: "shadow" as const },
            formatter: (params: Array<{ name: string; value: number }>) => {
                const p = params[0];
                return t("page.profile.stats.chartLevelTooltip", { name: p.name, value: p.value });
            },
        },
        grid: {
            left: mobile ? 8 : 12,
            right: mobile ? 8 : 12,
            top: 16,
            bottom: mobile ? 44 : 54,
            containLabel: false,
        },
        xAxis: {
            type: "category" as const,
            data: sortedChars.map((c) => getCharacterName(t, c.id, "short")),
            axisLabel: {
                fontSize: mobile ? 8 : 10,
                color: colors.onSurfaceVariant,
                rotate: mobile ? 60 : 45,
                fontWeight: 600,
            },
            axisLine: { lineStyle: { color: colors.outlineVariant } },
            axisTick: { show: false },
        },
        yAxis: {
            type: "value" as const,
            axisLabel: {
                fontSize: 10,
                color: colors.onSurfaceVariant,
            },
            splitLine: { lineStyle: { color: `${colors.outlineVariant}80` } },
            axisLine: { show: false },
        },
        series: [{
            type: "bar",
            data: sortedChars.map((c) => ({
                value: c.rank,
                itemStyle: {
                    color: CHAR_COLORS[String(c.id)] || "#999",
                    borderRadius: [3, 3, 0, 0],
                },
            })),
            barMaxWidth: mobile ? 14 : 20,
            emphasis: {
                itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.15)" },
            },
        }],
    }), [sortedChars, mobile, t, colors]);

    const loadDetail = useCallback(async () => {
        if (loading || rows) return;
        setLoading(true); setError(null);
        try {
            const [rewards, boxes, boxDetails] = await Promise.all([
                fetchMasterDataForServer<RewardMaster[]>(server, "challengeLiveHighScoreRewards.json"),
                fetchMasterDataForServer<BoxMaster[]>(server, "resourceBoxes.json"),
                fetchMasterDataForServer<BoxDetailMasterRow[]>(server, "resourceBoxDetails.json").catch(() => []),
            ]);
            const rewardPack = { rewards, boxes, boxDetails };

            const rewardById = new Map<number, RewardMaster>(); rewardPack.rewards.forEach((r) => rewardById.set(r.id, r));
            const completed = new Map<number, Set<number>>();
            challengeHighScoreRewards.forEach((x) => {
                const rid = rewardId(x); if (!rid) return;
                const cid = rewardCid(x) || rewardById.get(rid)?.characterId || 0; if (!cid) return;
                const set = completed.get(cid) || new Set<number>(); set.add(rid); completed.set(cid, set);
            });
            const rewardsByChar = new Map<number, RewardMaster[]>();
            rewardPack.rewards.forEach((r) => { const arr = rewardsByChar.get(r.characterId) || []; arr.push(r); rewardsByChar.set(r.characterId, arr); });
            const scoreBy = new Map<number, number>(); challengeSoloResults.forEach((x) => scoreBy.set(x.characterId, x.highScore || 0));
            const rankBy = new Map<number, number>(); challengeSoloStages.forEach((x) => rankBy.set(x.characterId, Math.max(rankBy.get(x.characterId) || 0, x.rank || 0)));

            const boxDetailsByKey = new Map<string, BoxDetail[]>();
            rewardPack.boxDetails.forEach((d) => {
                const purpose = d.resourceBoxPurpose || "";
                if (!purpose || !d.resourceBoxId) return;
                const key = boxKey(purpose, d.resourceBoxId);
                const arr = boxDetailsByKey.get(key) || [];
                arr.push({
                    resourceType: d.resourceType,
                    resourceId: typeof d.resourceId === "number" ? d.resourceId : undefined,
                    resourceQuantity: typeof d.resourceQuantity === "number" ? d.resourceQuantity : undefined,
                });
                boxDetailsByKey.set(key, arr);
            });

            const rewardBoxIds = new Set<number>();
            rewardPack.rewards.forEach((r) => rewardBoxIds.add(r.resourceBoxId));
            const scopedBoxes = rewardPack.boxes.filter((b) => (b.resourceBoxPurpose || "") === CHALLENGE_BOX_PURPOSE);
            const preferredBoxes = new Map<number, BoxMaster>();
            rewardPack.boxes.forEach((b) => {
                if (!rewardBoxIds.has(b.id)) return;
                const prev = preferredBoxes.get(b.id);
                if (!prev || ((b.resourceBoxPurpose || "") === CHALLENGE_BOX_PURPOSE && (prev.resourceBoxPurpose || "") !== CHALLENGE_BOX_PURPOSE)) {
                    preferredBoxes.set(b.id, b);
                }
            });

            const sourceBoxes = scopedBoxes.length ? scopedBoxes : Array.from(preferredBoxes.values());
            const boxMap = new Map<number, BoxMaster>();
            sourceBoxes.forEach((b) => {
                const purpose = b.resourceBoxPurpose || (scopedBoxes.length ? CHALLENGE_BOX_PURPOSE : "");
                const details = (b.details && b.details.length)
                    ? b.details
                    : (boxDetailsByKey.get(boxKey(purpose, b.id)) || []);
                boxMap.set(b.id, { ...b, details });
            });

            const next: Row[] = [];
            for (let cid = 1; cid <= 26; cid += 1) {
                const done = completed.get(cid) || new Set<number>();
                let jewel = 0; let frag = 0;
                (rewardsByChar.get(cid) || []).forEach((r) => {
                    if (done.has(r.id)) return;
                    const am = collectBox(boxMap, r.resourceBoxId); jewel += am.jewel; frag += am.frag;
                });
                next.push({ characterId: cid, rank: rankBy.get(cid) || 0, score: scoreBy.get(cid) || 0, remainJewel: jewel, remainFragment: frag });
            }
            setRows(next);
        } catch {
            setError(t("page.profile.stats.challengeDetailLoadFailed"));
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, rows, server, serverSource, challengeHighScoreRewards, challengeSoloResults, challengeSoloStages, t]);

    const openDetail = useCallback(() => {
        setShowDetail(true);
        if (!rows && !loading) void loadDetail();
    }, [rows, loading, loadDetail]);

    const groupedRows = useMemo(() => {
        if (!rows) return [];
        const map = new Map(rows.map((r) => [r.characterId, r]));
        return GROUPS.map((g) => ({ ...g, rows: g.ids.map((id) => map.get(id)).filter((x): x is Row => Boolean(x)) }));
    }, [rows]);

    const remainTotals = useMemo(() => {
        if (!rows) return { jewel: 0, fragment: 0 };
        return rows.reduce(
            (acc, row) => ({
                jewel: acc.jewel + row.remainJewel,
                fragment: acc.fragment + row.remainFragment,
            }),
            { jewel: 0, fragment: 0 },
        );
    }, [rows]);

    return (
        <div id="profile-challenge-stage" className="h-full scroll-mt-20">
        <SectionCard
            className="flex h-full flex-col"
            bodyClassName="flex flex-1 flex-col"
            icon={mdLeaderboard}
            title={t("page.profile.stats.challengeRank")}
            actions={
                <Button variant="outlined" size="xs" onClick={openDetail}>
                    {t("page.profile.stats.viewDetails")}
                </Button>
            }
        >

            <div className="flex-1 min-h-[240px] sm:min-h-[300px] flex items-center">
                <div className="w-full h-[240px] sm:h-[300px]">
                    <ReactECharts
                        option={barOption}
                        notMerge={false}
                        lazyUpdate={true}
                        style={{ width: "100%", height: "100%" }}
                        opts={{ renderer: "svg" }}
                    />
                </div>
            </div>

            <Modal
                isOpen={showDetail}
                onClose={() => setShowDetail(false)}
                title={t("page.profile.stats.challengeDetails")}
                size="xl"
            >
                {loading && <LoadingState className="min-h-[200px]" label={t("page.profile.stats.loadingChallengeDetails")} />}
                {error && <div className="py-8 text-center type-body-m text-error">{error}</div>}
                {!loading && !error && groupedRows.length === 0 && (
                    <div className="py-8 text-center type-body-m text-on-surface-variant">{t("page.profile.stats.noChallengeData")}</div>
                )}
                {!loading && !error && groupedRows.length > 0 && (
                    <div>
                        {mobile ? (
                            <div className="space-y-4">
                                <div className="rounded-md3-md bg-surface-container-high p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="type-title-s text-on-surface">{t("page.profile.stats.total")}</span>
                                        <span className="type-label-m text-on-surface-variant">{t("page.profile.stats.allCharacters")}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-md3-sm bg-surface-container-lowest px-2 py-1 text-on-surface-variant">{t("page.profile.stats.jewel")} <span className="font-medium text-on-surface">{formatNumber(remainTotals.jewel)}</span></div>
                                        <div className="rounded-md3-sm bg-surface-container-lowest px-2 py-1 text-on-surface-variant">{t("page.profile.stats.fragment")} <span className="font-medium text-on-surface">{formatNumber(remainTotals.fragment)}</span></div>
                                    </div>
                                </div>
                                {groupedRows.map((g) => (
                                    <div key={g.key} className="space-y-2">
                                        <div className="flex items-center gap-2 px-1 py-1 type-label-m text-on-surface-variant">{g.icon && <img src={g.icon} alt={t(g.labelKey)} className="w-4 h-4 object-contain" />}<span>{t(g.labelKey)}</span></div>
                                        {g.rows.map((r) => {
                                            const prog = Math.max(0, Math.min((r.score / scoreCap(server)) * 100, 100));
                                                    const cname = getCharacterName(t, r.characterId, "short");
                                            return (
                                                <div key={r.characterId} className="rounded-md3-md bg-surface-container-low p-3 space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-outline-variant"><Image src={getCharacterIconUrl(r.characterId)} alt={cname} fill className="object-cover" unoptimized /></div>
                                                            <span className="type-body-m font-medium text-on-surface truncate">{cname}</span>
                                                        </div>
                                                        <div className="type-label-m text-on-surface-variant">Lv {r.rank}</div>
                                                    </div>
                                                    <div className="type-body-m font-medium text-on-surface">{t("page.profile.stats.highScoreValue", { value: formatNumber(r.score) })}</div>
                                                    <div className="h-3 rounded-full bg-surface-container-highest overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prog}%`, backgroundColor: themeColor }} /></div>
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div className="rounded-md3-sm bg-surface-container px-2 py-1 text-on-surface-variant">{t("page.profile.stats.jewel")} <span className="font-medium text-on-surface">{formatNumber(r.remainJewel)}</span></div>
                                                        <div className="rounded-md3-sm bg-surface-container px-2 py-1 text-on-surface-variant">{t("page.profile.stats.fragment")} <span className="font-medium text-on-surface">{formatNumber(r.remainFragment)}</span></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="min-w-[840px] space-y-4">
                                    <div className="grid grid-cols-[170px_70px_130px_minmax(240px,1fr)_90px_110px] items-center gap-3 px-4 py-2 type-label-l text-on-surface-variant">
                                        <div className="text-left">{t("page.profile.stats.character")}</div>
                                        <div className="text-center">{t("page.profile.stats.level")}</div>
                                        <div className="text-center">{t("page.profile.stats.highScore")}</div>
                                        <div className="text-center">{t("page.profile.stats.progressWithCap", { cap: server === "jp" ? t("page.profile.stats.scoreCapJp") : t("page.profile.stats.scoreCapOther") })}</div>
                                        <div className="text-center">{t("page.profile.stats.remainingJewel")}</div>
                                        <div className="text-center">{t("page.profile.stats.remainingFragment")}</div>
                                    </div>
                                    <div className="grid grid-cols-[170px_70px_130px_minmax(240px,1fr)_90px_110px] items-center gap-3 rounded-md3-md bg-surface-container-high px-4 py-2">
                                        <div className="type-title-s text-on-surface">{t("page.profile.stats.total")}</div>
                                        <div className="type-body-m text-on-surface-variant text-center">-</div>
                                        <div className="type-body-m text-on-surface-variant text-center">-</div>
                                        <div className="type-body-m text-on-surface-variant text-center">-</div>
                                        <div className="type-title-s text-on-surface text-center">{formatNumber(remainTotals.jewel)}</div>
                                        <div className="type-title-s text-on-surface text-center">{formatNumber(remainTotals.fragment)}</div>
                                    </div>
                                    {groupedRows.map((g) => (
                                        <div key={g.key} className="space-y-2">
                                            <div className="flex items-center gap-2 px-3 py-1 type-label-m text-on-surface-variant">{g.icon && <img src={g.icon} alt={t(g.labelKey)} className="w-4 h-4 object-contain" />}<span>{t(g.labelKey)}</span></div>
                                            <div className="space-y-2">
                                                {g.rows.map((r) => {
                                                    const prog = Math.max(0, Math.min((r.score / scoreCap(server)) * 100, 100));
                                            const cname = getCharacterName(t, r.characterId, "short");
                                                    return (
                                                        <div key={r.characterId} className="grid grid-cols-[170px_70px_130px_minmax(240px,1fr)_90px_110px] items-center gap-3 rounded-md3-md bg-surface-container-low px-4 py-2">
                                                            <div className="flex items-center gap-2 min-w-0"><div className="relative w-9 h-9 rounded-full overflow-hidden border border-outline-variant"><Image src={getCharacterIconUrl(r.characterId)} alt={cname} fill className="object-cover" unoptimized /></div><span className="type-body-m font-medium text-on-surface truncate">{cname}</span></div>
                                                            <div className="type-body-m font-medium text-on-surface text-center">{r.rank}</div>
                                                            <div className="type-body-m font-medium text-on-surface text-center">{formatNumber(r.score)}</div>
                                                            <div className="h-4 rounded-full bg-surface-container-highest overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prog}%`, backgroundColor: themeColor }} /></div>
                                                            <div className="type-body-m font-medium text-on-surface text-center">{formatNumber(r.remainJewel)}</div>
                                                            <div className="type-body-m font-medium text-on-surface text-center">{formatNumber(r.remainFragment)}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </SectionCard>
        </div>
    );
}
