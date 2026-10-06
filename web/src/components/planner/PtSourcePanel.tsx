"use client";
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Banner, Button, Checkbox, Chip, LinearProgress, LoadingIndicator, Select, SegmentedButton, Surface, TextField } from "@/components/md3";
import { mdCalculate } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { getServerDisplayCode } from "@/components/common/ServerRegion";
import { fetchMasterDataForServer, fetchMusicMetas } from "@/lib/fetch";
import { loadTranslations } from "@/lib/translations";
import { DEFAULT_GAP_SECONDS, FIRE_MULTIPLIERS, fireMultiplier, playsPerHour } from "@/lib/goal-planner/core";
import { useDeckEngine } from "@/lib/deck-recommend/use-deck-engine";
import {
    CUSTOM_ROOM_PT_FACTOR,
    autoSpecialMeasureTeammates,
    readPlannerAccount,
} from "@/lib/deck-recommend/planner-args";
import type { EventRules } from "@/lib/event-rules/types";
import type { PtPlan, SongOption } from "@/lib/goal-planner/types";
import type {
    PlannerDeckEngine,
    PlannerDeckOption,
    PlannerDeckProfile,
    PlannerDeckRequest,
    PlannerLiveType,
    PlannerSongGainRequest,
    PlannerSongGainRow,
} from "@/lib/deck-recommend/planner-types";
import type { IMusicInfo, IMusicMeta } from "@/types/music";
import DeckPicker from "./DeckPicker";
import SongGainTable, { DIFFICULTY_BADGE_COLORS, type SongGainView } from "./SongGainTable";

interface PtSourcePanelProps {
    rules: EventRules;
    server: "jp" | "cn";
    eventId: number;
    eventType: string;
    chapterCharacterId: number | null;
    value: PtPlan | null;
    onChange(pt: PtPlan | null, songOptions: SongOption[]): void;
}

type Mode = PtPlan["mode"];
type LiveChoice = "coop" | "solo";

interface SongEntry {
    musicId: number;
    title: string;
    subtitle?: string;
    search: string;
    /** Song length in seconds by difficulty (music metas). */
    seconds: Record<string, number>;
}

interface SongData {
    server: string;
    songs: SongEntry[];
    defaultMusicId: number | null;
}

interface DeckRun {
    ctx: string;
    req: PlannerDeckRequest;
    options: PlannerDeckOption[];
}

interface GainSpec {
    ctx: string;
    mode: Mode;
    server: "jp" | "cn";
    eventId: number;
    eventType: string;
    liveType: PlannerLiveType;
    autoLiveType: PlannerLiveType;
    teammates: { power: number; scoreUp: number } | null;
    profile: PlannerDeckProfile;
    fire: number;
    autoFire: number;
}

interface GainState {
    key: string;
    ctx: string;
    mode: Mode;
    manual: PlannerSongGainRow[];
    auto: PlannerSongGainRow[];
    error: string | null;
}

type PanelError = { kind: "engine"; message: string } | { kind: "noResult" };

interface ComputedView extends SongGainView {
    musicId: number;
    seconds: number;
    playsPerHour: number;
}

const DIFFICULTY_ORDER = ["easy", "normal", "hard", "expert", "master", "append"];
const MODES: ReadonlyArray<{ value: Mode; key: string }> = [
    { value: "deck", key: "page.predictionPlanner.pt.mode.deck" },
    { value: "manual", key: "page.predictionPlanner.pt.mode.manual" },
    { value: "direct", key: "page.predictionPlanner.pt.mode.direct" },
];
const LIVE_LABEL_KEYS: Record<PlannerLiveType, string> = {
    multi: "page.predictionPlanner.pt.live.multi",
    solo: "page.predictionPlanner.pt.live.solo",
    auto: "page.predictionPlanner.pt.live.auto",
    cheerful: "page.predictionPlanner.pt.live.cheerful",
};
const SONG_OPTION_TOP = 10;
const SEARCH_RESULT_LIMIT = 8;
const GAIN_DEBOUNCE_MS = 200;
const DECK_RESULT_LIMIT = 5;
/** Effective skill of five cards with equal skill: 1 + 4 x 0.2 times one card's skill. */
const EFFECTIVE_SKILL_PER_CARD = 1.8;

const LABEL_CLASS = "block type-label-l text-on-surface-variant mb-1.5";

function parseNumberInput(raw: string): number | null {
    const cleaned = raw.replace(/[,\s]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function songKey(musicId: number, difficulty: string): string {
    return `${musicId}:${difficulty}`;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function subscribeStorage(callback: () => void): () => void {
    window.addEventListener("storage", callback);
    return () => window.removeEventListener("storage", callback);
}

function accountSnapshot(): string {
    const account = readPlannerAccount();
    return account ? `${account.server}|${account.userId}` : "";
}

function emptySnapshot(): string {
    return "";
}

/** Chapter used for the support deck when the overall scope is selected: the running one, else the next, else the last. */
function overallChapterCharacter(rules: EventRules, now: number): number | undefined {
    const chapters = rules.chapters
        .filter((c) => c.gameCharacterId !== null)
        .sort((a, b) => a.startAt - b.startAt);
    if (chapters.length === 0) return undefined;
    const pick = chapters.find((c) => now < c.aggregateAt) ?? chapters[chapters.length - 1];
    return pick.gameCharacterId ?? undefined;
}

function buildSongData(server: string, musics: IMusicInfo[], metas: IMusicMeta[], titleMap: Record<string, string> | null, now: number): SongData {
    const secondsById = new Map<number, Record<string, number>>();
    for (const meta of metas) {
        const entry = secondsById.get(meta.music_id) ?? {};
        entry[meta.difficulty] = meta.music_time;
        secondsById.set(meta.music_id, entry);
    }
    const songs: SongEntry[] = [];
    for (const music of musics) {
        const seconds = secondsById.get(music.id);
        if (!seconds || music.publishedAt > now) continue;
        const subtitle = titleMap?.[music.title];
        songs.push({
            musicId: music.id,
            title: music.title,
            subtitle: subtitle && subtitle !== music.title ? subtitle : undefined,
            search: [String(music.id), music.title, music.pronunciation, subtitle ?? ""].join("\n").toLowerCase(),
            seconds,
        });
    }
    songs.sort((a, b) => a.musicId - b.musicId);
    const available = new Set(songs.map((s) => s.musicId));
    let defaultMusicId: number | null = null;
    let best = -Infinity;
    for (const meta of metas) {
        if (!available.has(meta.music_id)) continue;
        const v = meta.pspi_pt_per_hour_multi ?? 0;
        if (v > best) {
            best = v;
            defaultMusicId = meta.music_id;
        }
    }
    return { server, songs, defaultMusicId: defaultMusicId ?? songs[0]?.musicId ?? null };
}

function SegmentButton({ active, onClick, children, disabled }: { active: boolean; onClick(): void; children: React.ReactNode; disabled?: boolean }) {
    return (
        <Chip
            selected={active}
            showCheckmark={false}
            onClick={onClick}
            disabled={disabled}
            className="min-w-0 [&>button]:w-full [&>button]:justify-center [&>button]:px-2"
        >
            {children}
        </Chip>
    );
}

function NumberField({ label, value, onChange, placeholder }: { label: string; value: string; onChange(v: string): void; placeholder?: string }) {
    return (
        <TextField
            variant="filled"
            dense
            label={label}
            type="text"
            inputMode="decimal"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0"
        />
    );
}

/** Where the planner's PT per play comes from: the deck engine, manual deck parameters, or direct entry. */
export default function PtSourcePanel({ rules, server, eventId, eventType, chapterCharacterId, value, onChange }: PtSourcePanelProps) {
    const { t, formatNumber, locale } = useI18n();
    const engine = useDeckEngine();

    const engineRef = useRef<PlannerDeckEngine>(engine);
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        engineRef.current = engine;
        onChangeRef.current = onChange;
    });

    const accountKey = useSyncExternalStore(subscribeStorage, accountSnapshot, emptySnapshot);
    const account = useMemo(() => {
        if (!accountKey) return null;
        const [accountServer, userId] = accountKey.split("|");
        return accountServer === server && userId ? { server: accountServer as "jp" | "cn", userId } : null;
    }, [accountKey, server]);

    const [modeChoice, setModeChoice] = useState<Mode | null>(value?.mode ?? null);
    const mode: Mode = modeChoice ?? (account ? "deck" : "manual");

    // Preloads the engine and the account's data, as the deck-recommend page does.
    const warmup = engine.warmup;
    useEffect(() => {
        if (mode === "deck" && account) warmup(account.server, account.userId);
    }, [mode, account, warmup]);

    const [liveChoice, setLiveChoice] = useState<LiveChoice>("coop");
    const [musicChoice, setMusicChoice] = useState<number | null>(null);
    const [difficultyChoice, setDifficultyChoice] = useState("master");
    const [search, setSearch] = useState("");
    const [fire, setFire] = useState(value?.manualFire ?? 5);
    const [autoFireChoice, setAutoFireChoice] = useState(value?.autoFire ?? 5);
    const [customRoom, setCustomRoom] = useState(false);
    const [gapInput, setGapInput] = useState("");

    const [songData, setSongData] = useState<SongData | null>(null);

    const [deckRun, setDeckRun] = useState<DeckRun | null>(null);
    const [selectedRank, setSelectedRank] = useState<number | null>(null);
    const [running, setRunning] = useState(false);
    const [deckError, setDeckError] = useState<PanelError | null>(null);
    const [gapBonusInput, setGapBonusInput] = useState("");
    const runIdRef = useRef(0);

    const [manualBonus, setManualBonus] = useState("");
    const [manualPower, setManualPower] = useState("");
    const [manualEffectiveSkill, setManualEffectiveSkill] = useState("");
    const [manualProfile, setManualProfile] = useState<{ ctx: string; profile: PlannerDeckProfile } | null>(null);

    const initialDirect = value?.mode === "direct" ? value : null;
    const [directManual, setDirectManual] = useState(initialDirect ? String(initialDirect.manualPtPerPlay) : "");
    const [directAuto, setDirectAuto] = useState(initialDirect ? String(initialDirect.autoPtPerPlay) : "");
    const [directPph, setDirectPph] = useState(initialDirect ? String(Math.round(initialDirect.playsPerHour * 10) / 10) : "");

    const [gains, setGains] = useState<GainState | null>(null);

    // Song gains depend on the event only; deck results also depend on the chapter's support character.
    const eventCtx = `${server}:${eventId}`;
    const ctx = `${eventCtx}:${chapterCharacterId ?? "all"}`;
    const special = rules.auto.value.specialMeasure;
    const minAutoFire = Math.max(1, rules.auto.value.minFire);
    const maxAutoFire = Math.max(minAutoFire, rules.auto.value.maxFire);
    const autoFire = Math.min(maxAutoFire, Math.max(minAutoFire, autoFireChoice));
    const coopLive: PlannerLiveType = eventType === "cheerful_carnival" ? "cheerful" : "multi";
    const liveType: PlannerLiveType = liveChoice === "coop" ? coopLive : "solo";
    const gapSeconds = parseNumberInput(gapInput) ?? DEFAULT_GAP_SECONDS[liveType];
    const roomFactor = customRoom && liveChoice === "coop" ? CUSTOM_ROOM_PT_FACTOR : 1;
    const hasEngineGap = rules.engineCoverageGaps.length > 0;

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchMasterDataForServer<IMusicInfo[]>(server, "musics.json"),
            fetchMusicMetas().catch(() => [] as IMusicMeta[]),
            loadTranslations(locale).catch(() => null),
        ])
            .then(([musics, metas, translations]) => {
                if (cancelled) return;
                setSongData(buildSongData(server, musics, metas, translations?.music?.title ?? null, Date.now()));
            })
            .catch(() => {
                if (!cancelled) setSongData({ server, songs: [], defaultMusicId: null });
            });
        return () => {
            cancelled = true;
        };
    }, [server, locale]);

    const songs = useMemo(() => (songData && songData.server === server ? songData.songs : []), [songData, server]);
    const songsLoading = !songData || songData.server !== server;
    const songById = useMemo(() => new Map(songs.map((s) => [s.musicId, s])), [songs]);

    const musicId = musicChoice !== null && songById.has(musicChoice) ? musicChoice : (songData?.server === server ? songData.defaultMusicId : null);
    const song = musicId !== null ? songById.get(musicId) ?? null : null;
    const songDifficulties = song ? DIFFICULTY_ORDER.filter((d) => song.seconds[d] !== undefined) : [];
    const difficulty = songDifficulties.includes(difficultyChoice)
        ? difficultyChoice
        : songDifficulties.includes("master") ? "master" : songDifficulties[songDifficulties.length - 1] ?? difficultyChoice;
    const selectedKey = musicId !== null ? songKey(musicId, difficulty) : null;
    const songSeconds = song?.seconds[difficulty] ?? null;

    const searchMatches = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        const out: SongEntry[] = [];
        for (const s of songs) {
            if (s.search.includes(q)) out.push(s);
            if (out.length >= SEARCH_RESULT_LIMIT) break;
        }
        return out;
    }, [search, songs]);

    // Deck results belong to the event/chapter they were computed for.
    const activeRun = deckRun && deckRun.ctx === ctx ? deckRun : null;
    const selectedOption = activeRun?.options.find((o) => o.rank === selectedRank) ?? null;
    const gapBonus = hasEngineGap ? parseNumberInput(gapBonusInput) : null;

    let profile: PlannerDeckProfile | null = null;
    if (mode === "deck" && selectedOption) {
        const skills = selectedOption.cards.slice(0, 5).map((c) => c.skillScoreUp);
        while (skills.length < 5) skills.push(0);
        profile = {
            totalPower: selectedOption.totalPower,
            eventBonusRate: gapBonus ?? selectedOption.eventBonus,
            skillScoreUps: [skills[0], skills[1], skills[2], skills[3], skills[4]],
        };
    } else if (mode === "manual" && manualProfile && manualProfile.ctx === eventCtx) {
        profile = manualProfile.profile;
    }

    const gainSpec: GainSpec | null = profile
        ? {
            ctx: eventCtx,
            mode,
            server,
            eventId,
            eventType,
            liveType,
            autoLiveType: special ? coopLive : "auto",
            teammates: special ? autoSpecialMeasureTeammates(rules) : null,
            profile,
            fire,
            autoFire,
        }
        : null;
    const gainKey = gainSpec ? JSON.stringify(gainSpec) : null;

    useEffect(() => {
        if (!gainKey) return;
        const spec = JSON.parse(gainKey) as GainSpec;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            const base = { server: spec.server, eventId: spec.eventId, eventType: spec.eventType, profile: spec.profile };
            const manualReq: PlannerSongGainRequest = { ...base, liveType: spec.liveType, boost: spec.fire };
            const autoReq: PlannerSongGainRequest = {
                ...base,
                liveType: spec.autoLiveType,
                boost: spec.autoFire,
                teammates: spec.teammates ?? undefined,
            };
            (async () => {
                const manual = await engineRef.current.songGains(manualReq);
                const auto = await engineRef.current.songGains(autoReq);
                return { manual, auto };
            })()
                .then(({ manual, auto }) => {
                    if (!cancelled) setGains({ key: gainKey, ctx: spec.ctx, mode: spec.mode, manual, auto, error: null });
                })
                .catch((err) => {
                    if (!cancelled) setGains({ key: gainKey, ctx: spec.ctx, mode: spec.mode, manual: [], auto: [], error: errorMessage(err) });
                });
        }, GAIN_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [gainKey]);

    // Keeps the last rows of the same event and mode while a new request is in flight.
    const activeGains = profile && gains && gains.ctx === eventCtx && gains.mode === mode ? gains : null;
    const gainsPending = gainKey !== null && gains?.key !== gainKey;

    // The engine's own PT for the recommended song is exact; the rows cover every other song.
    const runReq = activeRun?.req;
    const exactKey = mode === "deck" && selectedOption && runReq && !hasEngineGap && runReq.liveType === liveType
        ? songKey(runReq.musicId, runReq.difficulty)
        : null;
    const exactNoBoost = exactKey && selectedOption && runReq ? selectedOption.eventPoint / fireMultiplier(runReq.boost) : null;

    const views = useMemo<ComputedView[]>(() => {
        if (!activeGains) return [];
        const multiplier = fireMultiplier(fire);
        const out: ComputedView[] = [];
        for (const row of activeGains.manual) {
            const key = songKey(row.musicId, row.difficulty);
            const entry = songById.get(row.musicId);
            // Rows can include songs not yet released on this server.
            if (songById.size > 0 && !entry) continue;
            const noBoost = key === exactKey && exactNoBoost !== null ? exactNoBoost : row.ptPerPlayNoBoost;
            const ptPerPlay = Math.floor(noBoost * multiplier * roomFactor);
            const pph = playsPerHour(row.seconds, gapSeconds);
            out.push({
                key,
                musicId: row.musicId,
                title: entry?.title ?? row.title,
                subtitle: entry?.subtitle,
                difficulty: row.difficulty,
                seconds: row.seconds,
                playsPerHour: pph,
                ptPerPlay,
                ptPerHour: ptPerPlay * pph,
                ptPerStamina: fire >= 1 ? ptPerPlay / fire : null,
            });
        }
        return out;
    }, [activeGains, fire, roomFactor, gapSeconds, songById, exactKey, exactNoBoost]);

    // Candidates for the song comparison: the best songs per hour and per play (per stamina at a fixed fire).
    const comparisonViews = useMemo(() => {
        const byHour = [...views].sort((a, b) => b.ptPerHour - a.ptPerHour).slice(0, SONG_OPTION_TOP);
        const byPlay = [...views].sort((a, b) => b.ptPerPlay - a.ptPerPlay).slice(0, SONG_OPTION_TOP);
        return [...byHour, ...byPlay];
    }, [views]);

    const bestAuto = useMemo(() => {
        if (!activeGains) return null;
        let best: PlannerSongGainRow | null = null;
        for (const row of activeGains.auto) {
            if (!best || row.ptPerPlayNoBoost > best.ptPerPlayNoBoost) best = row;
        }
        return best;
    }, [activeGains]);

    const labelFor = (title: string, diff: string) => `${title} (${diff.toUpperCase()})`;

    let plan: PtPlan | null = null;
    let songOptions: SongOption[] = [];
    let autoSongLabel: string | null = null;
    if (mode === "direct") {
        const manualPt = parseNumberInput(directManual);
        const pph = parseNumberInput(directPph);
        if (manualPt !== null && manualPt > 0 && pph !== null && pph > 0) {
            plan = {
                mode: "direct",
                manualPtPerPlay: manualPt,
                manualFire: fire,
                playsPerHour: pph,
                // Only song time fills the break gauge; the typed rate includes the gap between plays.
                songSeconds: Math.max(1, 3600 / pph - gapSeconds),
                autoPtPerPlay: parseNumberInput(directAuto) ?? 0,
                autoFire,
                autoIsLowerBound: false,
            };
        }
    } else {
        const base = selectedKey ? views.find((v) => v.key === selectedKey) : undefined;
        if (base) {
            if (bestAuto) {
                const autoEntry = songById.get(bestAuto.musicId);
                autoSongLabel = labelFor(autoEntry?.title ?? bestAuto.title, bestAuto.difficulty);
            }
            const basePlan: PtPlan = {
                mode,
                manualPtPerPlay: base.ptPerPlay,
                manualFire: fire,
                playsPerHour: base.playsPerHour,
                songSeconds: base.seconds,
                // Auto is count-limited rather than time-limited, so it uses the highest-PT song.
                autoPtPerPlay: bestAuto ? Math.floor(bestAuto.ptPerPlayNoBoost * fireMultiplier(autoFire)) : 0,
                autoSongSeconds: bestAuto?.seconds,
                autoFire,
                autoIsLowerBound: special,
                songLabel: labelFor(base.title, base.difficulty),
            };
            plan = basePlan;
            const seen = new Set<string>([base.key]);
            songOptions = [{ key: base.key, label: basePlan.songLabel ?? base.title, pt: basePlan }];
            for (const v of comparisonViews) {
                if (seen.has(v.key)) continue;
                seen.add(v.key);
                const optionLabel = labelFor(v.title, v.difficulty);
                songOptions.push({
                    key: v.key,
                    label: optionLabel,
                    pt: {
                        ...basePlan,
                        manualPtPerPlay: v.ptPerPlay,
                        playsPerHour: v.playsPerHour,
                        songSeconds: v.seconds,
                        songLabel: optionLabel,
                    },
                });
            }
        }
    }

    const emitKey = JSON.stringify([plan, songOptions]);
    const lastEmitRef = useRef<string | null>(null);
    useEffect(() => {
        if (lastEmitRef.current === emitKey) return;
        lastEmitRef.current = emitKey;
        const [nextPlan, nextOptions] = JSON.parse(emitKey) as [PtPlan | null, SongOption[]];
        onChangeRef.current(nextPlan, nextOptions);
    }, [emitKey]);

    const pickSong = (entry: SongEntry) => {
        setMusicChoice(entry.musicId);
        setSearch("");
    };

    const switchSong = (key: string) => {
        const [id, diff] = key.split(":");
        setMusicChoice(Number(id));
        setDifficultyChoice(diff);
    };

    const selectDeck = (rank: number) => {
        setSelectedRank(rank);
        const option = activeRun?.options.find((o) => o.rank === rank);
        if (option && hasEngineGap) setGapBonusInput(String(Math.round(option.eventBonus * 10) / 10));
    };

    const calculateDeck = async () => {
        if (!account || musicId === null) return;
        const supportCharacterId = rules.chapters.some((c) => c.gameCharacterId !== null)
            ? chapterCharacterId ?? overallChapterCharacter(rules, Date.now())
            : undefined;
        const req: PlannerDeckRequest = {
            server,
            userId: account.userId,
            eventId,
            eventType,
            liveType,
            musicId,
            difficulty,
            boost: fire,
            supportCharacterId,
            limit: DECK_RESULT_LIMIT,
        };
        const runId = ++runIdRef.current;
        const runCtx = ctx;
        setRunning(true);
        setDeckError(null);
        try {
            const options = await engineRef.current.recommend(req);
            if (runId !== runIdRef.current) return;
            const top = options.slice(0, DECK_RESULT_LIMIT);
            setDeckRun({ ctx: runCtx, req, options: top });
            setSelectedRank(top[0]?.rank ?? null);
            if (top[0] && hasEngineGap) setGapBonusInput(String(Math.round(top[0].eventBonus * 10) / 10));
            if (top.length === 0) setDeckError({ kind: "noResult" });
        } catch (err) {
            if (runId === runIdRef.current) setDeckError({ kind: "engine", message: errorMessage(err) });
        } finally {
            if (runId === runIdRef.current) setRunning(false);
        }
    };

    const cancelDeck = () => {
        runIdRef.current += 1;
        engineRef.current.cancel();
        setRunning(false);
    };

    const calculateManual = () => {
        const power = parseNumberInput(manualPower);
        if (power === null || power <= 0) return;
        // Effective skill = leader + 0.2 x the other four, which is all multi lives use, so an even spread keeps multi
        // exact. Solo and Auto also weigh the leader alone: 160/140 decks read 0.5% high in solo, 200/100 about 3%.
        const perCard = (parseNumberInput(manualEffectiveSkill) ?? 0) / EFFECTIVE_SKILL_PER_CARD;
        setManualProfile({
            ctx: eventCtx,
            profile: {
                totalPower: power,
                eventBonusRate: parseNumberInput(manualBonus) ?? 0,
                skillScoreUps: [perCard, perCard, perCard, perCard, perCard],
            },
        });
    };

    const engineErrorText = (message: string) => t("page.predictionPlanner.pt.errors.engine", { message });
    // The hook reports a failed run both in its state and through the rejected promise; show it once.
    const errorSet = new Set<string>();
    if (mode !== "direct") {
        if (engine.status === "error" && engine.error) errorSet.add(engineErrorText(engine.error));
        if (mode === "deck" && deckError) {
            errorSet.add(deckError.kind === "noResult" ? t("page.predictionPlanner.pt.errors.noResult") : engineErrorText(deckError.message));
        }
        if (activeGains?.error) errorSet.add(engineErrorText(activeGains.error));
    }
    const errors = [...errorSet];

    const progressPercent = Math.round(engine.progress?.percent ?? 0);
    const liveOptions: PlannerLiveType[] = [coopLive, "solo"];
    const fireOptions = FIRE_MULTIPLIERS.map((m, count) => ({ count, m }));

    // Rendered right under the calculate row of the deck and manual modes.
    const statTiles = mode !== "direct" && plan ? (
        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 transition-opacity ${gainsPending ? "opacity-60" : ""}`}>
            <Surface tone="highest" radius="md" className="p-3 min-w-0">
                <span className="type-label-m text-on-surface-variant block mb-0.5">{t("page.predictionPlanner.pt.direct.manualPt")}</span>
                <span className="type-title-m type-emphasized font-mono text-on-surface">{formatNumber(plan.manualPtPerPlay)}</span>
            </Surface>
            <Surface tone="highest" radius="md" className="p-3 min-w-0">
                <span className="type-label-m text-on-surface-variant block mb-0.5">{t("page.predictionPlanner.pt.direct.playsPerHour")}</span>
                <span className="type-title-m type-emphasized font-mono text-on-surface">{formatNumber(plan.playsPerHour, { maximumFractionDigits: 1 })}</span>
            </Surface>
            <Surface tone="highest" radius="md" className="col-span-2 sm:col-span-1 p-3 min-w-0">
                <span className="type-label-m text-on-surface-variant flex flex-wrap items-center gap-1.5 mb-0.5">
                    <span>{t("page.predictionPlanner.pt.direct.autoPt")}</span>
                    {plan.autoIsLowerBound && (
                        <span className="px-1.5 py-0.5 rounded-md3-sm bg-tertiary-container text-on-tertiary-container type-label-s">
                            {t("page.predictionPlanner.pt.autoLowerBound")}
                        </span>
                    )}
                </span>
                <span className="type-title-m type-emphasized font-mono text-on-surface">{formatNumber(plan.autoPtPerPlay)}</span>
                {autoSongLabel && (
                    <span className="block type-label-s text-on-surface-variant truncate" title={autoSongLabel}>
                        {t("page.predictionPlanner.pt.live.auto")} · {autoSongLabel}
                    </span>
                )}
            </Surface>
        </div>
    ) : null;

    return (
        <Surface as="section" tone="card" radius="lg" className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="type-title-l text-on-surface">{t("page.predictionPlanner.pt.title")}</h2>
                <SegmentedButton
                    value={mode}
                    onValueChange={setModeChoice}
                    options={MODES.map((m) => ({ value: m.value, label: t(m.key) }))}
                    aria-label={t("page.predictionPlanner.pt.title")}
                    showCheckmark={false}
                    className="sm:w-auto"
                />
            </div>

            {mode !== "direct" && (
                <div className="space-y-4">
                    <div>
                        <span className={LABEL_CLASS}>{t("page.predictionPlanner.pt.liveType")}</span>
                        <div className="grid grid-cols-2 gap-2 sm:flex">
                            {liveOptions.map((lt) => (
                                <SegmentButton
                                    key={lt}
                                    active={liveType === lt}
                                    onClick={() => {
                                        setLiveChoice(lt === "solo" ? "solo" : "coop");
                                        setGapInput("");
                                    }}
                                >
                                    {t(LIVE_LABEL_KEYS[lt])}
                                </SegmentButton>
                            ))}
                        </div>
                    </div>

                    <div>
                        <span className={LABEL_CLASS}>{t("page.predictionPlanner.pt.song")}</span>
                        {songsLoading ? (
                            <div className="flex items-center gap-2 py-2 text-on-surface-variant">
                                <LoadingIndicator size={24} aria-label={t("page.predictionPlanner.loading")} />
                            </div>
                        ) : song ? (
                            <Surface tone="highest" radius="md" className="mb-2 px-3 py-2 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="type-label-s font-mono text-on-surface-variant shrink-0">#{song.musicId}</span>
                                    <span className="type-title-s text-on-surface truncate">{song.title}</span>
                                    {songSeconds !== null && (
                                        <span className="ml-auto type-label-s font-mono text-on-surface-variant shrink-0">{formatNumber(songSeconds, { maximumFractionDigits: 1 })}s</span>
                                    )}
                                </div>
                                {song.subtitle && <div className="type-body-s text-on-surface-variant truncate">{song.subtitle}</div>}
                            </Surface>
                        ) : null}
                        <Select<number>
                            searchable
                            dense
                            disabled={songsLoading}
                            filterOptions={false}
                            value={musicId}
                            selectedLabel={song?.title}
                            searchValue={search}
                            onSearchChange={setSearch}
                            onValueChange={(id) => { const entry = songById.get(id); if (entry) pickSong(entry); }}
                            placeholder={t("page.predictionPlanner.pt.songSearch")}
                            searchPlaceholder={t("page.predictionPlanner.pt.songSearch")}
                            aria-label={t("page.predictionPlanner.pt.songSearch")}
                            options={searchMatches.map((entry) => ({
                                value: entry.musicId,
                                textValue: entry.title,
                                label: <span><span className="block type-title-s">{entry.title}</span>{entry.subtitle && <span className="block type-body-s">{entry.subtitle}</span>}</span>,
                                leading: <span className="type-label-s font-mono">#{entry.musicId}</span>,
                            }))}
                        />
                    </div>

                    {songDifficulties.length > 0 && (
                        <div>
                            <span className={LABEL_CLASS}>{t("page.predictionPlanner.pt.difficulty")}</span>
                            <div className="flex flex-wrap gap-1.5">
                                {songDifficulties.map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setDifficultyChoice(d)}
                                        aria-pressed={difficulty === d}
                                        className={`state-layer focus-ring relative px-3 py-2 rounded-md3-sm type-label-l uppercase transition-colors duration-150 ease-md3-standard ${difficulty === d
                                            ? DIFFICULTY_BADGE_COLORS[d] ?? "bg-secondary-container text-on-secondary-container"
                                            : "bg-surface-container-highest text-on-surface-variant"
                                            }`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                <Select
                    value={fire}
                    onValueChange={setFire}
                    options={fireOptions.map(({ count, m }) => ({ value: count, label: t("page.predictionPlanner.pt.fireOption", { count, multiplier: m }) }))}
                    label={t("page.predictionPlanner.pt.fire")}
                    className="min-w-0"
                />
                <Select
                    value={autoFire}
                    onValueChange={setAutoFireChoice}
                    options={fireOptions.filter(({ count }) => count >= minAutoFire && count <= maxAutoFire).map(({ count, m }) => ({ value: count, label: t("page.predictionPlanner.pt.fireOption", { count, multiplier: m }) }))}
                    label={t("page.predictionPlanner.pt.autoFire")}
                    className="min-w-0"
                />
            </div>

            {mode !== "direct" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:items-end">
                    <NumberField
                        label={t("page.predictionPlanner.pt.gapSeconds")}
                        value={gapInput}
                        onChange={setGapInput}
                        placeholder={String(DEFAULT_GAP_SECONDS[liveType])}
                    />
                    {liveChoice === "coop" && (
                        <Checkbox
                            checked={customRoom}
                            onCheckedChange={setCustomRoom}
                            className="sm:pb-2"
                            label={t("page.predictionPlanner.pt.customRoom", { percent: formatNumber(CUSTOM_ROOM_PT_FACTOR * 100, { maximumFractionDigits: 1 }) })}
                        />
                    )}
                </div>
            )}

            {mode === "deck" && (
                <div className="space-y-3">
                    {!account ? (
                        <Surface tone="highest" radius="md" className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-3">
                            <span className="type-body-m text-on-surface-variant">{t("page.predictionPlanner.pt.deck.needAccount")}</span>
                            <Button href="/deck-recommend/" className="shrink-0">
                                {t("page.predictionPlanner.pt.deck.goToDeck")}
                            </Button>
                        </Surface>
                    ) : (
                        <>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="type-body-s text-on-surface-variant font-mono break-all">
                                    {t("page.predictionPlanner.pt.deck.account", { userId: account.userId, server: getServerDisplayCode(account.server) })}
                                </span>
                                {running ? (
                                    <div className="flex items-center gap-2">
                                        <span className="type-label-l text-primary">
                                            {t("page.predictionPlanner.pt.deck.calculating", { percent: progressPercent })}
                                        </span>
                                        <Button variant="outlined" size="xs" onClick={cancelDeck}>
                                            {t("page.predictionPlanner.pt.deck.cancel")}
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        icon={mdCalculate}
                                        onClick={calculateDeck}
                                        disabled={musicId === null}
                                    >
                                        {t("page.predictionPlanner.pt.deck.calculate")}
                                    </Button>
                                )}
                            </div>
                            {running && (
                                <LinearProgress
                                    value={progressPercent / 100}
                                    aria-label={t("page.predictionPlanner.pt.deck.calculating", { percent: progressPercent })}
                                />
                            )}
                        </>
                    )}

                    {statTiles}

                    {hasEngineGap && (
                        <div className="space-y-2">
                            <Banner tone="warning" className="break-words">
                                {t("page.predictionPlanner.rules.warnings.engineGap", { tables: rules.engineCoverageGaps.join(", ") })}
                            </Banner>
                            {selectedOption && (
                                <NumberField
                                    label={t("page.predictionPlanner.pt.manual.bonus")}
                                    value={gapBonusInput}
                                    onChange={setGapBonusInput}
                                    placeholder={String(Math.round(selectedOption.eventBonus * 10) / 10)}
                                />
                            )}
                        </div>
                    )}

                    {activeRun && activeRun.options.length > 0 && (
                        <DeckPicker options={activeRun.options} selectedRank={selectedRank} onSelect={selectDeck} />
                    )}
                </div>
            )}

            {mode === "manual" && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <NumberField label={t("page.predictionPlanner.pt.manual.bonus")} value={manualBonus} onChange={setManualBonus} placeholder="0" />
                        <NumberField label={t("page.predictionPlanner.pt.manual.power")} value={manualPower} onChange={setManualPower} placeholder="0" />
                        <NumberField label={t("page.predictionPlanner.pt.manual.effectiveSkill")} value={manualEffectiveSkill} onChange={setManualEffectiveSkill} placeholder="0" />
                    </div>
                    <div className="flex justify-end">
                        <Button
                            icon={mdCalculate}
                            onClick={calculateManual}
                            disabled={musicId === null || !(parseNumberInput(manualPower) ?? 0)}
                        >
                            {t("page.predictionPlanner.pt.manual.calculate")}
                        </Button>
                    </div>
                    {statTiles}
                </div>
            )}

            {mode === "direct" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NumberField label={t("page.predictionPlanner.pt.direct.manualPt")} value={directManual} onChange={setDirectManual} placeholder="0" />
                    <NumberField label={t("page.predictionPlanner.pt.direct.autoPt")} value={directAuto} onChange={setDirectAuto} placeholder="0" />
                    <NumberField label={t("page.predictionPlanner.pt.direct.playsPerHour")} value={directPph} onChange={setDirectPph} placeholder="0" />
                    <NumberField
                        label={t("page.predictionPlanner.pt.gapSeconds")}
                        value={gapInput}
                        onChange={setGapInput}
                        placeholder={String(DEFAULT_GAP_SECONDS[liveType])}
                    />
                </div>
            )}

            {errors.length > 0 && (
                <ul className="space-y-1.5">
                    {errors.map((text, i) => (
                        <li key={i}>
                            <Banner tone="error" className="break-words">{text}</Banner>
                        </li>
                    ))}
                </ul>
            )}

            {mode !== "direct" && views.length > 0 && (
                <SongGainTable rows={views} selectedKey={selectedKey} onUse={switchSong} />
            )}
        </Surface>
    );
}
