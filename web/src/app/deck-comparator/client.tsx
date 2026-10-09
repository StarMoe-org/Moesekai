"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ExternalLink from "@/components/ExternalLink";
import { useI18n } from "@/contexts/I18nContext";
import { IMusicInfo, IMusicMeta, difficultyFillStyle } from "@/types/music";
import { fetchMasterData, fetchMusicMetas } from "@/lib/fetch";
import MainLayout from "@/components/MainLayout";
import MusicSelector from "@/components/deck-recommend/MusicSelector";
import {
    MultiLivePTCalculator,
    Skill6Mode,
    Skill15Strategy,
    getBoostRate,
    type MusicMeta,
    type CalculationResult,
    type PTResult,
} from "@/lib/deck-comparator/calculator";
import { Banner, Button, Icon, IconButton, PageContainer, PageHeader, Switch } from "@/components/md3";
import { mdAnalytics, mdCalculate, mdClose, mdHistory, mdMusicNote, mdPerson, mdSave, mdWarning } from "@/components/md3/icons";
import "./deck-comparator.css";

const DIFFICULTY_OPTIONS = [
    { value: "easy", labelKey: "page.deckComparator.difficulties.easy" },
    { value: "normal", labelKey: "page.deckComparator.difficulties.normal" },
    { value: "hard", labelKey: "page.deckComparator.difficulties.hard" },
    { value: "expert", labelKey: "page.deckComparator.difficulties.expert" },
    { value: "master", labelKey: "page.deckComparator.difficulties.master" },
    { value: "append", labelKey: "page.deckComparator.difficulties.append" },
];

interface HistoryItem {
    id: string; // Timestamp as ID
    timestamp: number;
    musicId: number;
    musicTitle: string;
    difficulty: string;
    userPower: number;
    deckBonus: number;
    fires: number;
    score: number;
    pt: number;
    eventRate: number;
}

interface MusicMetaApiItem extends IMusicMeta {
    tap_count?: number;
    base_score_auto?: number;
    skill_score_solo?: number[];
    skill_score_multi?: number[];
    skill_score_auto?: number[];
}

// ==================== Main Component ====================
export default function DeckComparatorClient() {
    const { t, formatDate, formatNumber } = useI18n();

    // Music selection state
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [musicMetas, setMusicMetas] = useState<MusicMetaApiItem[]>([]);
    const [musicId, setMusicId] = useState("");
    const [difficulty, setDifficulty] = useState("master");

    // Calculator inputs
    const [userPower, setUserPower] = useState(280000);
    const [userEffectiveness, setUserEffectiveness] = useState(250);
    const [allSameTeammate, setAllSameTeammate] = useState(true);
    const [teammatePower, setTeammatePower] = useState(200000);
    const [teammateEffectiveness, setTeammateEffectiveness] = useState(200);
    const [teammates, setTeammates] = useState([
        { power: 200000, effectiveness: 200 },
        { power: 200000, effectiveness: 200 },
        { power: 200000, effectiveness: 200 },
        { power: 200000, effectiveness: 200 },
    ]);
    const [skill6Mode, setSkill6Mode] = useState<Skill6Mode>(Skill6Mode.TEAM_AVERAGE);
    const [skill15Strategy, setSkill15Strategy] = useState<Skill15Strategy>(Skill15Strategy.EXPECTED);

    // Event PT inputs
    const [deckBonus, setDeckBonus] = useState(150);
    const [fires, setFires] = useState(5);

    // Result state
    const [result, setResult] = useState<CalculationResult | null>(null);
    const [ptResult, setPtResult] = useState<PTResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // History state
    const [history, setHistory] = useState<HistoryItem[]>(() => {
        if (typeof window === "undefined") return [];
        try {
            const saved = localStorage.getItem("deck-comparator-history");
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    // Load initial data
    useEffect(() => {
        // Load music list
        fetchMasterData<IMusicInfo[]>("musics.json")
            .then(data => setMusics(data))
            .catch(err => console.error("Failed to fetch musics", err));

        // Load meta
        fetchMusicMetas()
            .then(data => setMusicMetas(data))
            .catch(err => console.error("Failed to fetch music meta", err));

    }, []);

    // Save history to local storage
    useEffect(() => {
        localStorage.setItem("deck-comparator-history", JSON.stringify(history));
    }, [history]);

    const handleSaveHistory = () => {
        if (!ptResult || !result || !musicId) return;

        const music = musics.find(m => m.id.toString() === musicId);
        const title = music ? music.title : t("page.deckComparator.fallbackMusicTitle", { id: musicId });

        const item: HistoryItem = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            musicId: parseInt(musicId),
            musicTitle: title,
            difficulty,
            userPower,
            deckBonus,
            fires,
            score: result.score,
            pt: ptResult.pt,
            eventRate: ptResult.eventRate,
        };

        setHistory(prev => [item, ...prev]);
    };

    const handleDeleteHistory = (id: string) => {
        setHistory(prev => prev.filter(item => item.id !== id));
    };

    // Get music meta for selected song + difficulty
    const selectedMeta = useMemo((): MusicMeta | null => {
        if (!musicId || !musicMetas.length) return null;
        const id = parseInt(musicId);
        const meta = musicMetas.find(
            (m) => m.music_id === id && m.difficulty === difficulty
        );
        if (!meta) return null;
        return {
            music_id: meta.music_id,
            difficulty: meta.difficulty,
            music_time: meta.music_time,
            base_score: meta.base_score,
            fever_score: meta.fever_score,
            tap_count: meta.tap_count || 0,
            event_rate: meta.event_rate || 100,
            skill_score_solo: meta.skill_score_solo || [],
            skill_score_multi: meta.skill_score_multi || [],
            skill_score_auto: meta.skill_score_auto || [],
            base_score_auto: meta.base_score_auto || 0,
        };
    }, [musicId, difficulty, musicMetas]);

    // Update individual teammate
    const updateTeammate = useCallback((index: number, field: 'power' | 'effectiveness', value: number) => {
        setTeammates(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    }, []);

    // Handle calculation
    const handleCalculate = useCallback(() => {
        if (!selectedMeta) {
            setError(t("page.deckComparator.errors.musicMetaRequired"));
            return;
        }
        if (!userPower || userPower <= 0) {
            setError(t("page.deckComparator.errors.invalidPower"));
            return;
        }

        try {
            setError(null);
            const calc = new MultiLivePTCalculator();

            // Set teammates
            const actualTeammates = allSameTeammate
                ? Array.from({ length: 4 }, () => ({ power: teammatePower, effectiveness: teammateEffectiveness }))
                : teammates;

            for (let i = 0; i < 4; i++) {
                calc.setTeammate(i, actualTeammates[i].power, actualTeammates[i].effectiveness);
            }

            calc.setSkill6Mode(skill6Mode);
            calc.setSkill15Strategy(skill15Strategy);

            const res = calc.calculate(userPower, userEffectiveness, selectedMeta);
            setResult(res);

            // PT calculation
            const pt = calc.calculatePT(res, selectedMeta, deckBonus, fires);
            setPtResult(pt);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t("page.deckComparator.errors.calculationFailedUnknown");
            const cause = err instanceof Error && typeof err.cause === "object" && err.cause !== null
                ? err.cause as Record<string, string | number>
                : undefined;
            const translated = message.startsWith("page.deckComparator.")
                ? t(message, cause)
                : t("page.deckComparator.errors.calculationFailed", { message });
            setError(translated);
            setResult(null);
            setPtResult(null);
        }
    }, [selectedMeta, userPower, userEffectiveness, allSameTeammate, teammatePower, teammateEffectiveness, teammates, skill6Mode, skill15Strategy, deckBonus, fires, t]);

    // Score breakdown colors
    const breakdownColors = {
        base: "#3b82f6",
        skill15: "#10b981",
        skill6: "#f59e0b",
        active: "#8b5cf6",
    };

    return (
        <MainLayout>
            <PageContainer className="max-w-5xl">
                <PageHeader
                    eyebrow={t("page.deckComparator.badge")}
                    title={t("page.deckComparator.title")}
                    highlight={t("page.deckComparator.titleHighlight")}
                    description={t("page.deckComparator.description")}
                />

                {/* Mobile Info */}
                <Banner tone="info" className="dc-mobile-info mb-6">{t("page.deckComparator.mobileInfo")}</Banner>

                {/* Input Form */}
                <div className="bg-surface-card border border-outline-variant/70 p-5 sm:p-6 rounded-md3-xl mb-6">
                    <h2 className="type-title-l text-on-surface mb-4 flex items-center gap-2">
                        <Icon path={mdMusicNote} size={24} className="text-primary" />
                        {t("page.deckComparator.musicAndDifficulty")}
                    </h2>

                    {/* Song + Difficulty */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                        <div>
                            <MusicSelector
                                selectedMusicId={musicId}
                                onSelect={(id) => setMusicId(id)}
                                recommendMode="event"
                                liveType="multi"
                            />
                            {/* Meta availability hint */}
                            {musicId && !selectedMeta && (
                                <p className="mt-1 flex items-center gap-1 type-body-s text-tertiary">
                                    <Icon path={mdWarning} size={16} />
                                    {t("page.deckComparator.noMetaForDifficulty", { difficulty: difficulty.toUpperCase() })}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="mb-1 block type-label-l text-on-surface-variant">{t("page.deckComparator.difficulty")}</label>
                            <div className="flex flex-wrap gap-2">
                                {DIFFICULTY_OPTIONS.map((d) => (
                                    <button
                                        key={d.value}
                                        onClick={() => setDifficulty(d.value)}
                                        className="state-layer focus-ring h-9 px-3 rounded-md3-sm border border-outline-variant type-label-l text-on-surface-variant transition-colors"
                                        style={difficulty === d.value ? difficultyFillStyle(d.value) : undefined}
                                    >
                                        {t(d.labelKey)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* User Config */}
                <div className="bg-surface-card border border-outline-variant/70 p-5 sm:p-6 rounded-md3-xl mb-6">
                    <h2 className="type-title-l text-on-surface mb-4 flex items-center gap-2">
                        <Icon path={mdPerson} size={24} className="text-primary" />
                        {t("page.deckComparator.playerConfig")}
                    </h2>

                    {/* User Power + Effectiveness + Deck Bonus */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                        <div>
                            <label className="mb-1 block type-label-l text-on-surface-variant">
                                {t("page.deckComparator.myPower")} <span className="text-error">*</span>
                            </label>
                            <input
                                type="number"
                                value={userPower}
                                onChange={(e) => setUserPower(Number(e.target.value))}
                                placeholder="280000"
                                className="dc-number-input h-10 px-3 type-body-m rounded-md3-md border border-outline bg-transparent text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant w-full"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block type-label-l text-on-surface-variant">
                                {t("page.deckComparator.myEffectiveness")}
                            </label>
                            <input
                                type="number"
                                value={userEffectiveness}
                                onChange={(e) => setUserEffectiveness(Number(e.target.value))}
                                placeholder="250"
                                className="dc-number-input h-10 px-3 type-body-m rounded-md3-md border border-outline bg-transparent text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant w-full"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block type-label-l text-on-surface-variant">
                                {t("page.deckComparator.deckBonus")}
                            </label>
                            <input
                                type="number"
                                value={deckBonus}
                                onChange={(e) => setDeckBonus(Number(e.target.value))}
                                placeholder="150"
                                className="dc-number-input h-10 px-3 type-body-m rounded-md3-md border border-outline bg-transparent text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant w-full"
                            />
                            <p className="mt-1 text-xs text-on-surface-variant">{t("page.deckComparator.deckBonusHint")}</p>
                        </div>
                    </div>

                    {/* Teammate Config */}
                    <div className="mb-5">
                        <div className="flex items-center justify-between mb-3">
                            <label className="type-label-l text-on-surface-variant">
                                {t("page.deckComparator.teammateConfig")}
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="type-label-l text-on-surface-variant">{t("page.deckComparator.wholeTeamSame")}</span>
                                <Switch
                                    checked={allSameTeammate}
                                    onCheckedChange={setAllSameTeammate}
                                    aria-label={t("page.deckComparator.wholeTeamSame")}
                                />
                            </div>
                        </div>

                        {allSameTeammate ? (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block type-label-m text-on-surface-variant">{t("page.deckComparator.power")}</label>
                                    <input
                                        type="number"
                                        value={teammatePower}
                                        onChange={(e) => setTeammatePower(Number(e.target.value))}
                                        className="dc-number-input h-10 px-3 type-body-m rounded-md3-md border border-outline bg-transparent text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant w-full"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block type-label-m text-on-surface-variant">{t("page.deckComparator.effectiveness")}</label>
                                    <input
                                        type="number"
                                        value={teammateEffectiveness}
                                        onChange={(e) => setTeammateEffectiveness(Number(e.target.value))}
                                        className="dc-number-input h-10 px-3 type-body-m rounded-md3-md border border-outline bg-transparent text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant w-full"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {teammates.map((tm, i) => (
                                    <div key={i} className="dc-teammate-row grid grid-cols-[auto_1fr_1fr] gap-2 items-center p-2 rounded-md3-md bg-surface-container">
                                        <span className="type-label-l text-on-surface-variant w-6 text-center">
                                            P{i + 2}
                                        </span>
                                        <input
                                            type="number"
                                            value={tm.power}
                                            onChange={(e) => updateTeammate(i, 'power', Number(e.target.value))}
                                            placeholder={t("page.deckComparator.powerPlaceholder")}
                                            className="dc-number-input h-10 px-3 type-body-m rounded-md3-md border border-outline bg-transparent text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant w-full"
                                        />
                                        <input
                                            type="number"
                                            value={tm.effectiveness}
                                            onChange={(e) => updateTeammate(i, 'effectiveness', Number(e.target.value))}
                                            placeholder={t("page.deckComparator.effectivenessPlaceholder")}
                                            className="dc-number-input h-10 px-3 type-body-m rounded-md3-md border border-outline bg-transparent text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant w-full"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Skill6 Mode + Skill1-5 Strategy */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                        <div>
                            <label className="mb-2 block type-label-l text-on-surface-variant">{t("page.deckComparator.skill6Mode")}</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSkill6Mode(Skill6Mode.TEAM_AVERAGE)}
                                    className={`flex-1 px-3 py-2 rounded-md3-md type-label-m transition-all ${skill6Mode === Skill6Mode.TEAM_AVERAGE
                                        ? "bg-primary-container text-on-primary-container"
                                        : "border border-outline-variant text-on-surface-variant"
                                        }`}
                                >
                                    {t("page.deckComparator.skill6Modes.teamAverage")}
                                </button>
                                <button
                                    onClick={() => setSkill6Mode(Skill6Mode.HIGHEST_POWER)}
                                    className={`flex-1 px-3 py-2 rounded-md3-md type-label-m transition-all ${skill6Mode === Skill6Mode.HIGHEST_POWER
                                        ? "bg-primary-container text-on-primary-container"
                                        : "border border-outline-variant text-on-surface-variant"
                                        }`}
                                >
                                    {t("page.deckComparator.skill6Modes.highestPower")}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block type-label-l text-on-surface-variant">{t("page.deckComparator.skill15Strategy")}</label>
                            <div className="flex gap-2">
                                {[
                                    { value: Skill15Strategy.EXPECTED, labelKey: "page.deckComparator.skill15Strategies.expected" },
                                    { value: Skill15Strategy.BEST, labelKey: "page.deckComparator.skill15Strategies.best" },
                                    { value: Skill15Strategy.WORST, labelKey: "page.deckComparator.skill15Strategies.worst" },
                                ].map((s) => (
                                    <button
                                        key={s.value}
                                        onClick={() => setSkill15Strategy(s.value)}
                                        className={`flex-1 px-3 py-2 rounded-md3-md type-label-m transition-all ${skill15Strategy === s.value
                                            ? "bg-primary-container text-on-primary-container"
                                            : "border border-outline-variant text-on-surface-variant"
                                            }`}
                                    >
                                        {t(s.labelKey)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Fire Count */}
                    <div className="mb-5">
                        <div>
                            <label className="mb-1 block type-label-l text-on-surface-variant">
                                {t("page.deckComparator.fireCount")}
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    value={fires}
                                    min={0}
                                    max={10}
                                    onChange={(e) => setFires(Math.min(10, Math.max(0, Number(e.target.value) || 0)))}
                                    className="dc-number-input h-10 px-3 type-body-m rounded-md3-md border border-outline bg-transparent text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant w-24"
                                />
                                <span className="text-sm text-on-surface-variant">
                                    {t("page.deckComparator.currentMultiplier", { rate: getBoostRate(fires) })}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Calculate Button */}
                    <Button
                        type="button"
                        variant="filled"
                        size="m"
                        fullWidth
                        icon={mdCalculate}
                        onClick={handleCalculate}
                        disabled={!selectedMeta}
                    >
                        {t("page.deckComparator.calculatePt")}
                    </Button>
                </div>

                {/* Error Display */}
                {error && (
                    <Banner tone="error" className="mb-6">{error}</Banner>
                )}

                {/* Results */}
                {result && (
                    <div className="dc-score-enter bg-surface-card border border-outline-variant/70 p-5 sm:p-6 rounded-md3-xl mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="type-title-l text-on-surface flex items-center gap-2">
                                <Icon path={mdAnalytics} size={24} className="text-primary" />
                                {t("page.deckComparator.resultsTitle")}
                            </h2>
                            <Button type="button" variant="tonal" size="xs" icon={mdSave} onClick={handleSaveHistory}>
                                {t("page.deckComparator.saveResult")}
                            </Button>
                        </div>

                        {/* Main PT */}
                        {ptResult && (
                            <div className="text-center mb-6 pb-6 border-b border-outline-variant">
                                <div className="type-label-l text-on-surface-variant mb-1">{t("page.deckComparator.result.eventPt")}</div>
                                <div className="type-display-m sm:type-display-l type-emphasized text-tertiary font-mono">
                                    {formatNumber(ptResult.pt)}
                                </div>
                                <div className="flex items-center justify-center gap-3 mt-2 text-xs text-on-surface-variant">
                                    <span>{t("page.deckComparator.result.basePt", { value: formatNumber(ptResult.basePT) })}</span>
                                    <span>·</span>
                                    <span>{t("page.deckComparator.result.musicRate", { value: ptResult.eventRate })}</span>
                                    <span>·</span>
                                    <span>{t("page.deckComparator.result.deckRate", { value: ptResult.deckRate.toFixed(2) })}</span>
                                    <span>·</span>
                                    <span>{t("page.deckComparator.result.boostRate", { value: ptResult.boostRate })}</span>
                                </div>
                            </div>
                        )}

                        {/* Main Score */}
                        <div className="text-center mb-6">
                            <div className="type-label-l text-on-surface-variant mb-1">{t("page.deckComparator.result.estimatedScore")}</div>
                            <div className="type-display-s sm:type-display-m type-emphasized text-primary font-mono">
                                {formatNumber(result.score)}
                            </div>
                            {ptResult && (
                                <div className="text-xs text-on-surface-variant mt-1">
                                    {t("page.deckComparator.result.teammateTotalScore", { value: formatNumber(ptResult.otherScore) })}
                                </div>
                            )}
                        </div>

                        {/* Score Breakdown Bar */}
                        <div className="mb-6">
                            <div className="dc-breakdown-bar">
                                <div className="flex h-full">
                                    <div
                                        className="dc-breakdown-segment"
                                        style={{
                                            width: `${(result.baseScorePart / result.score) * 100}%`,
                                            backgroundColor: breakdownColors.base,
                                        }}
                                    />
                                    <div
                                        className="dc-breakdown-segment"
                                        style={{
                                            width: `${(result.skill15Part / result.score) * 100}%`,
                                            backgroundColor: breakdownColors.skill15,
                                        }}
                                    />
                                    <div
                                        className="dc-breakdown-segment"
                                        style={{
                                            width: `${(result.skill6Part / result.score) * 100}%`,
                                            backgroundColor: breakdownColors.skill6,
                                        }}
                                    />
                                    <div
                                        className="dc-breakdown-segment"
                                        style={{
                                            width: `${(result.activeBonus / result.score) * 100}%`,
                                            backgroundColor: breakdownColors.active,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Breakdown Details */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                            {[
                                { label: t("page.deckComparator.result.baseScore"), value: result.baseScorePart, color: breakdownColors.base },
                                { label: t("page.deckComparator.result.skill15"), value: result.skill15Part, color: breakdownColors.skill15 },
                                { label: t("page.deckComparator.result.skill6"), value: result.skill6Part, color: breakdownColors.skill6 },
                                { label: t("page.deckComparator.result.activeBonus"), value: result.activeBonus, color: breakdownColors.active },
                            ].map((item) => (
                                <div key={item.label} className="bg-surface-container rounded-md3-md p-3">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-xs text-on-surface-variant">{item.label}</span>
                                    </div>
                                    <div className="type-title-s text-on-surface font-mono">
                                        {formatNumber(item.value)}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Additional Info */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                            <div className="bg-surface-container rounded-md3-md p-3">
                                <div className="text-xs text-on-surface-variant mb-1">{t("page.deckComparator.result.totalPower")}</div>
                                <div className="type-title-s text-on-surface font-mono">
                                    {formatNumber(result.totalPower)}
                                </div>
                            </div>
                            <div className="bg-surface-container rounded-md3-md p-3">
                                <div className="text-xs text-on-surface-variant mb-1">{t("page.deckComparator.result.skill6Effectiveness")}</div>
                                <div className="type-title-s text-on-surface font-mono">
                                    {result.skill6Effectiveness.toFixed(1)}%
                                </div>
                            </div>
                            <div className="bg-surface-container rounded-md3-md p-3 col-span-2 sm:col-span-1">
                                <div className="text-xs text-on-surface-variant mb-1">{t("page.deckComparator.result.fluctuationRange")}</div>
                                <div className="type-title-s text-on-surface font-mono">
                                    ±{formatNumber((result.details.scoreBest - result.details.scoreWorst) / 2)}
                                </div>
                            </div>
                        </div>

                        {/* Best / Worst Reference */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-md3-md p-3 bg-primary-container text-on-primary-container">
                                <div className="type-label-m mb-1">{t("page.deckComparator.result.bestScore")}</div>
                                <div className="type-title-s font-mono">
                                    {formatNumber(result.details.scoreBest)}
                                </div>
                            </div>
                            <div className="rounded-md3-md p-3 bg-error-container text-on-error-container">
                                <div className="type-label-m mb-1">{t("page.deckComparator.result.worstScore")}</div>
                                <div className="type-title-s font-mono">
                                    {formatNumber(result.details.scoreWorst)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* History List */}
                {history.length > 0 && (
                    <div className="bg-surface-card border border-outline-variant/70 p-5 sm:p-6 rounded-md3-xl mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="type-title-l text-on-surface flex items-center gap-2">
                                <Icon path={mdHistory} size={24} className="text-primary" />
                                {t("page.deckComparator.historyTitle")}
                            </h2>
                            <span className="text-xs text-on-surface-variant">
                                {t("page.deckComparator.historyCount", { count: formatNumber(history.length) })}
                            </span>
                        </div>

                        <div className="space-y-3">
                            {history.map((item) => (
                                <div key={item.id} className="relative group bg-surface-container rounded-md3-md p-3 flex items-center gap-3">
                                    {/* Song Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className="type-title-s text-on-surface truncate">
                                                {item.musicTitle}
                                            </span>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md3-xs uppercase bg-surface-container-highest text-on-surface-variant" style={difficultyFillStyle(item.difficulty)}>
                                                {item.difficulty}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                                            <span>{formatDate(item.timestamp, { dateStyle: "short", timeStyle: "short" })}</span>
                                            <span className="hidden sm:inline">·</span>
                                            <span>{t("page.deckComparator.historyPower", { power: `${(item.userPower / 10000).toFixed(1)}w` })}</span>
                                            <span className="hidden sm:inline">·</span>
                                            <span>{t("page.deckComparator.historyBonus", { bonus: item.deckBonus })}</span>
                                            <span className="hidden sm:inline">·</span>
                                            <span>{item.fires}🔥</span>
                                        </div>
                                    </div>

                                    {/* Score Info */}
                                    <div className="text-right flex-shrink-0">
                                        <div className="type-title-s text-primary font-mono">
                                            {formatNumber(item.pt)} PT
                                        </div>
                                        <div className="text-xs text-on-surface-variant font-mono">
                                            {formatNumber(item.score)}
                                        </div>
                                    </div>

                                    {/* Delete Button */}
                                    <IconButton
                                        icon={mdClose}
                                        label={t("page.deckComparator.deleteHistory")}
                                        variant="tonal"
                                        size="xs"
                                        onClick={() => handleDeleteHistory(item.id)}
                                        className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                        title={t("page.deckComparator.deleteHistory")}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-12 text-center type-body-s text-on-surface-variant">
                    <p className="mb-1">
                        {t("page.deckComparator.sourceCreditPrefix")} <ExternalLink href="https://github.com/xfl03/sekai-calculator" target="_blank" rel="noopener noreferrer" className="text-on-surface-variant hover:text-primary hover:underline">sekai-calculator</ExternalLink>
                    </p>
                    <p>
                        {t("page.deckComparator.licenseNotice")}
                    </p>
                </div>
            </PageContainer>

        </MainLayout>
    );
}
