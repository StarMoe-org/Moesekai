"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import Link from "@/components/LocalizedLink";
import { Banner, Button, EmptyState, IconButton, LoadingState, PageContainer, PageHeader, SectionCard, Select, SegmentedButton, Switch, Tabs, TextField, cn } from "@/components/md3";
import { mdArrowBack, mdCasino, mdContentCopy, mdDelete, mdGridView, mdKidStar, mdPlayArrow, mdRestartAlt, mdSave, mdSettings, mdSkipNext, mdStar, mdStyle, mdWandStars } from "@/components/md3/icons";
import CardSelectorModal from "@/components/cards/CardSelectorModal";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import PoolEditor from "@/components/gacha-simulator/PoolEditor";
import type { StageEvent } from "@/components/gacha-simulator/GachaStage";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getCardGachaVoiceUrl, getCardThumbnailUrl, getCharacterLabelHUrl } from "@/lib/assets";
import { fetchMasterData } from "@/lib/fetch";
import { getCharacterName } from "@/lib/i18n/characters";
import { playTick, setSfxVolume, unlockAudio } from "@/lib/gacha-simulator/audio";
import {
    cardProbabilities, createRng, EMPTY_PULL_STATE, FOUR_STAR_RARITIES, effectiveRates, poolIssues, RARITY_KEYS, rollPulls,
    summarise, type PullResult, type PullState, type Rng, type SimPoolConfig, type SimRarity,
} from "@/lib/gacha-simulator/engine";
import { cloneAsCustom, decodePoolShare, encodePoolShare, loadPresets, officialPoolFromGacha, randomId, savePresets } from "@/lib/gacha-simulator/pools";
import type { ICardInfo, IGachaInfo } from "@/types/types";

const GachaStage = dynamic(() => import("@/components/gacha-simulator/GachaStage"), {
    ssr: false,
    loading: () => <LoadingState className="min-h-[320px]" />,
});

type Mode = "official" | "custom";
type Status = "idle" | "playing" | "waiting" | "done";

interface Session {
    results: PullResult[];
    index: number;
    skipToHigh: boolean;
}

interface CurrentEvent {
    event: StageEvent;
    result: PullResult;
    card: ICardInfo | undefined;
    instant: boolean;
}

const HIGH = (rarity: SimRarity) => FOUR_STAR_RARITIES.includes(rarity);
const STAR_COUNT: Record<SimRarity, number> = { rarity_1: 1, rarity_2: 2, rarity_3: 3, rarity_4: 4, rarity_birthday: 4 };

function ParamsShell() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <GachaSimulatorContent />
            </Suspense>
        </MainLayout>
    );
}

export default function GachaSimulatorPage() {
    return <ParamsShell />;
}

function GachaSimulatorContent() {
    const { t } = useI18n();
    const { assetSource } = useTheme();
    const searchParams = useSearchParams();

    const [gachas, setGachas] = useState<IGachaInfo[]>([]);
    const [cards, setCards] = useState<ICardInfo[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
    const gachaMap = useMemo(() => new Map(gachas.map((gacha) => [gacha.id, gacha])), [gachas]);

    const [mode, setMode] = useState<Mode>("official");
    const [officialId, setOfficialId] = useState<number | null>(null);
    const [draft, setDraft] = useState<SimPoolConfig | null>(null);
    const [presets, setPresets] = useState<SimPoolConfig[]>([]);
    const [importCode, setImportCode] = useState("");
    const [importError, setImportError] = useState(false);
    const [presetNotice, setPresetNotice] = useState<string | null>(null);
    const [isCardSelectorOpen, setIsCardSelectorOpen] = useState(false);
    const [officialQuery, setOfficialQuery] = useState("");

    // Playback
    const [status, setStatus] = useState<Status>("idle");
    const [session, setSession] = useState<Session | null>(null);
    const [current, setCurrent] = useState<CurrentEvent | null>(null);
    const [revealedKey, setRevealedKey] = useState<number | null>(null);
    const [skipNow, setSkipNow] = useState(false);
    const [speed, setSpeed] = useState<1 | 2 | 4>(1);
    const [autoAdvance, setAutoAdvance] = useState(true);
    const [sfx, setSfx] = useState(true);
    const [voice, setVoice] = useState(true);
    const [webglUnsupported, setWebglUnsupported] = useState(false);
    const [pullState, setPullState] = useState<PullState>(EMPTY_PULL_STATE);
    const [history, setHistory] = useState<PullResult[]>([]);

    const sessionRef = useRef<Session | null>(null);
    const currentRef = useRef<CurrentEvent | null>(null);
    const autoRef = useRef(autoAdvance);
    const pullStateRef = useRef<PullState>(EMPTY_PULL_STATE);
    const keyRef = useRef(0);
    const rngRef = useRef<Rng>(createRng());
    const voiceRef = useRef<HTMLAudioElement | null>(null);
    const voiceOnRef = useRef(voice);
    const assetRef = useRef(assetSource);
    assetRef.current = assetSource;
    autoRef.current = autoAdvance;
    voiceOnRef.current = voice;
    pullStateRef.current = pullState;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setIsLoading(true);
                const [gachaData, cardData] = await Promise.all([
                    fetchMasterData<IGachaInfo[]>("gachas.json", true),
                    fetchMasterData<ICardInfo[]>("cards.json", true),
                ]);
                if (cancelled) return;
                setGachas(gachaData);
                setCards(cardData);
            } catch {
                if (!cancelled) setLoadError(t("page.gachaSimulator.loadError"));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // The masterdata load runs once; locale changes only re-render labels.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setPresets(loadPresets());
    }, []);

    // Initial selection from the URL: a share code wins, then a banner id.
    const initialised = useRef(false);
    const [wishNotice, setWishNotice] = useState(false);
    useEffect(() => {
        if (initialised.current || gachas.length === 0 || cards.length === 0) return;
        initialised.current = true;
        const code = searchParams.get("pool");
        if (code) {
            const decoded = decodePoolShare(code);
            if (decoded) {
                setDraft(decoded);
                setMode("custom");
                return;
            }
        }
        const gachaParam = Number(searchParams.get("gachaId"));
        if (Number.isFinite(gachaParam) && gachaMap.has(gachaParam)) {
            // Dream/Wish picks from the banner page become UP cards of a custom copy.
            const wishIds = (searchParams.get("wish") ?? "").split(",").map(Number).filter((id) => Number.isFinite(id) && id > 0);
            const gacha = gachaMap.get(gachaParam);
            if (wishIds.length > 0 && gacha) {
                const base = cloneAsCustom(officialPoolFromGacha(gacha, cardMap), `${gacha.name} (${t("page.gachaSimulator.copySuffix")})`);
                const picked = new Set(wishIds);
                const marked = base.cards.map((card) => (picked.has(card.cardId) ? { ...card, up: true } : card));
                if (marked.some((card) => card.up)) {
                    setDraft({ ...base, cards: marked, upShare: 0.5 });
                    setMode("custom");
                    setWishNotice(true);
                    return;
                }
            }
            setOfficialId(gachaParam);
            return;
        }
        const fallback = [...gachas].filter((g) => g.gachaDetails?.length).sort((a, b) => b.id - a.id)[0];
        if (fallback) setOfficialId(fallback.id);
    }, [gachas, cards, gachaMap, cardMap, searchParams, t]);

    const officialPool = useMemo<SimPoolConfig | null>(() => {
        if (officialId === null || cardMap.size === 0) return null;
        const gacha = gachaMap.get(officialId);
        return gacha ? officialPoolFromGacha(gacha, cardMap) : null;
    }, [officialId, gachaMap, cardMap]);

    const pool: SimPoolConfig | null = mode === "official" ? officialPool : draft;
    const poolKey = mode === "official" ? `official-${officialId}` : draft?.id ?? "none";

    // Reset the pull counters whenever the pool in play changes.
    useEffect(() => {
        setPullState(EMPTY_PULL_STATE);
        setHistory([]);
        setSession(null);
        setCurrent(null);
        setRevealedKey(null);
        setStatus("idle");
        sessionRef.current = null;
        currentRef.current = null;
    }, [poolKey]);

    // Keep the URL shareable: banner id for official, share code for custom.
    useEffect(() => {
        if (typeof window === "undefined" || !initialised.current) return;
        const url = new URL(window.location.href);
        url.search = "";
        if (mode === "official" && officialId !== null) url.searchParams.set("gachaId", String(officialId));
        if (mode === "custom" && draft) url.searchParams.set("pool", encodePoolShare(draft));
        window.history.replaceState(window.history.state, "", url.toString());
    }, [mode, officialId, draft]);

    const probabilities = useMemo(() => (pool ? cardProbabilities(pool) : []), [pool]);
    const rates = useMemo(() => (pool ? effectiveRates(pool) : null), [pool]);
    const issues = useMemo(() => (pool ? poolIssues(pool) : []), [pool]);
    const stats = useMemo(() => summarise(history), [history]);
    const theoryFourStar = rates ? rates.rarity_4 + rates.rarity_birthday : 0;
    const actualFourStar = stats.total ? (stats.fourStar / stats.total) * 100 : 0;

    const imageUrlFor = useCallback((card: ICardInfo | undefined) => (
        card ? getCardThumbnailUrl(card.characterId, card.assetbundleName, false, assetRef.current) : null
    ), []);

    const playVoiceFor = useCallback((card: ICardInfo | undefined) => {
        if (!voiceOnRef.current || !card) return;
        voiceRef.current?.pause();
        const audio = new Audio(getCardGachaVoiceUrl(card.assetbundleName, assetRef.current));
        audio.volume = 0.9;
        audio.play().catch(() => undefined);
        voiceRef.current = audio;
    }, []);

    /** Show the card at `index` of the session. */
    const showCard = useCallback((next: Session, index: number) => {
        const result = next.results[index];
        const card = cardMap.get(result.cardId);
        keyRef.current += 1;
        const instant = next.skipToHigh && !HIGH(result.rarity);
        const event: StageEvent = { key: keyRef.current, rarity: result.rarity, up: result.up, imageUrl: imageUrlFor(card) };
        // The skip-to-4★ request ends once a 4★ is on screen.
        const nextSession: Session = { ...next, index, skipToHigh: next.skipToHigh && !HIGH(result.rarity) };
        sessionRef.current = nextSession;
        setSession(nextSession);
        const entry: CurrentEvent = { event, result, card, instant };
        currentRef.current = entry;
        setCurrent(entry);
        setRevealedKey(null);
        setStatus("playing");
    }, [cardMap, imageUrlFor]);

    const handleRevealed = useCallback((key: number) => {
        const cur = currentRef.current;
        const sess = sessionRef.current;
        if (!cur || !sess || cur.event.key !== key) return;
        setSkipNow(false);
        const isLast = sess.index >= sess.results.length - 1;
        if (isLast) {
            setStatus("done");
            return;
        }
        if (autoRef.current || sess.skipToHigh) {
            showCard(sess, sess.index + 1);
        } else {
            setStatus("waiting");
        }
    }, [showCard]);

    /** The card starts to flip: show its name and play its voice. */
    const handleFlip = useCallback((key: number) => {
        const cur = currentRef.current;
        if (!cur || cur.event.key !== key || cur.instant) return;
        setRevealedKey(key);
        playVoiceFor(cur.card);
    }, [playVoiceFor]);

    const stageSpeed = (current?.instant || skipNow) ? 0 : speed;

    const runPull = useCallback(async (count: number) => {
        if (!pool || pool.cards.length === 0 || issues.includes("noCards")) return;
        if (status === "playing" || status === "waiting") return;
        await unlockAudio();
        const { results, state } = rollPulls(pool, count, pullStateRef.current, rngRef.current);
        if (results.length === 0) return;
        setPullState(state);
        pullStateRef.current = state;
        setHistory((prev) => [...prev, ...results]);
        const next: Session = { results, index: 0, skipToHigh: false };
        showCard(next, 0);
    }, [pool, issues, status, showCard]);

    const advance = () => {
        const sess = sessionRef.current;
        if (!sess || status !== "waiting") return;
        showCard(sess, sess.index + 1);
    };

    const skipCurrent = () => {
        if (status !== "playing") return;
        setSkipNow(true);
    };

    /** Fast-forward through the rest of the batch until the next 4★ (or the end). */
    const skipToHigh = () => {
        const sess = sessionRef.current;
        if (!sess || (status !== "playing" && status !== "waiting")) return;
        const updated: Session = { ...sess, skipToHigh: true };
        sessionRef.current = updated;
        setSession(updated);
        if (status === "waiting") {
            showCard(updated, sess.index + 1);
        } else if (current && !HIGH(current.result.rarity)) {
            setSkipNow(true);
        }
    };

    useEffect(() => {
        setSfxVolume(sfx ? 1 : 0);
    }, [sfx]);

    useEffect(() => () => {
        voiceRef.current?.pause();
    }, []);

    // Sound effects for the manual-advance tick.
    useEffect(() => {
        if (status === "waiting" && sfx) playTick();
    }, [status, sfx]);

    const handleSavePreset = () => {
        if (!draft) return;
        const next = presets.some((p) => p.id === draft.id)
            ? presets.map((p) => (p.id === draft.id ? draft : p))
            : [...presets, draft];
        setPresets(next);
        const ok = savePresets(next);
        setPresetNotice(ok ? t("page.gachaSimulator.presetSaved") : t("page.gachaSimulator.presetSaveFailed"));
    };

    const handleDeletePreset = (id: string) => {
        const next = presets.filter((p) => p.id !== id);
        setPresets(next);
        savePresets(next);
        if (draft?.id === id) setDraft(null);
    };

    const startCustom = (base?: SimPoolConfig) => {
        const created = base ?? { id: `custom-${randomId()}`, name: t("page.gachaSimulator.newPoolName"), source: "custom" as const, rates: { rarity_1: 0, rarity_2: 0, rarity_3: 3, rarity_4: 3, rarity_birthday: 0 }, cards: [], upShare: 0, pityPulls: 0, tenPullFloor: false };
        setDraft(created);
        setMode("custom");
    };

    const cloneOfficial = () => {
        if (!officialPool) return;
        setDraft(cloneAsCustom(officialPool, `${officialPool.name} (${t("page.gachaSimulator.copySuffix")})`));
        setMode("custom");
    };

    const handleImport = () => {
        const decoded = decodePoolShare(importCode.trim());
        if (!decoded) {
            setImportError(true);
            return;
        }
        setImportError(false);
        setDraft(decoded);
        setMode("custom");
        setImportCode("");
    };

    const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
    const shareUrl = useMemo(() => {
        if (typeof window === "undefined") return "";
        if (mode === "official" && officialId !== null) return `${window.location.origin}${window.location.pathname}?gachaId=${officialId}`;
        if (mode === "custom" && draft) return `${window.location.origin}${window.location.pathname}?pool=${encodePoolShare(draft)}`;
        return "";
    }, [mode, officialId, draft]);

    const copyShare = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopyState("copied");
        } catch {
            setCopyState("failed");
        }
    };

    const filteredGachas = useMemo(() => {
        const query = officialQuery.trim().toLowerCase();
        return [...gachas]
            .filter((g) => g.gachaDetails?.length)
            .filter((g) => !query || g.name.toLowerCase().includes(query) || String(g.id) === query)
            .sort((a, b) => b.id - a.id);
    }, [gachas, officialQuery]);

    const gachaOptions = useMemo(() => {
        const list = filteredGachas.slice(0, 300).map((g) => ({ value: g.id, label: `#${g.id} ${g.name}`, textValue: `${g.id} ${g.name}` }));
        if (officialId !== null && !list.some((o) => o.value === officialId) && gachaMap.has(officialId)) {
            const g = gachaMap.get(officialId)!;
            list.unshift({ value: g.id, label: `#${g.id} ${g.name}`, textValue: `${g.id} ${g.name}` });
        }
        return list;
    }, [filteredGachas, officialId, gachaMap]);

    const selectedCardIds = useMemo(() => (draft ? draft.cards.map((c) => c.cardId) : []), [draft]);
    const toggleCard = (card: ICardInfo) => {
        if (!draft) return;
        const exists = draft.cards.some((c) => c.cardId === card.id);
        const nextCards = exists
            ? draft.cards.filter((c) => c.cardId !== card.id)
            : [...draft.cards, { cardId: card.id, rarity: card.cardRarityType as SimRarity, weight: 1, up: false }];
        setDraft({ ...draft, cards: nextCards });
    };

    const charName = (characterId: number) => getCharacterName(t, characterId);
    const busy = status === "playing" || status === "waiting";
    const currentCard = current?.card;
    const showInfo = current && revealedKey === current.event.key && currentCard;
    const sessionDone = session && status === "done";
    const pityLeft = pool && pool.pityPulls > 0 ? Math.max(0, pool.pityPulls - pullState.sinceFourStar - 1) : null;

    if (loadError) {
        return <PageContainer><Banner tone="error" title={loadError} /></PageContainer>;
    }
    if (isLoading && gachas.length === 0) {
        return <PageContainer><LoadingState label={t("page.gachaSimulator.loading")} /></PageContainer>;
    }

    const modeItems = [
        { value: "official" as const, label: t("page.gachaSimulator.modeOfficial"), icon: mdCasino },
        { value: "custom" as const, label: t("page.gachaSimulator.modeCustom"), icon: mdStyle },
    ];

    return (
        <PageContainer wide>
            <PageHeader
                title={t("page.gachaSimulator.title")}
                description={t("page.gachaSimulator.description")}
                actions={
                    <Link href="/gacha" className="inline-flex">
                        <Button variant="text" size="s" icon={mdArrowBack}>{t("page.gachaSimulator.backToGacha")}</Button>
                    </Link>
                }
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                {/* Stage column */}
                <div className="flex min-w-0 flex-col gap-4">
                    <SectionCard icon={mdWandStars} title={pool?.name ?? t("page.gachaSimulator.noPool")} bodyClassName="flex flex-col gap-4">
                        {wishNotice && mode === "custom" && (
                            <Banner tone="info" title={t("page.gachaSimulator.wishCarried")} />
                        )}
                        {webglUnsupported && (
                            <Banner tone="warning" title={t("page.gachaSimulator.webglUnsupported")} />
                        )}
                        <div className="relative h-[320px] w-full overflow-hidden rounded-md3-lg bg-[#0b0b16] sm:h-[400px]">
                            {!webglUnsupported && (
                                <GachaStage
                                    event={current?.event ?? null}
                                    speed={stageSpeed}
                                    sfx={sfx}
                                    onRevealed={handleRevealed}
                                    onFlip={handleFlip}
                                    onUnsupported={() => setWebglUnsupported(true)}
                                    className="absolute inset-0"
                                />
                            )}
                            {status === "idle" && !webglUnsupported && (
                                <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center type-body-m text-white/70">
                                    {t("page.gachaSimulator.stageIdle")}
                                </p>
                            )}
                            {showInfo && currentCard && (
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
                                    <Image
                                        src={getCharacterLabelHUrl(currentCard.characterId, assetSource)}
                                        alt=""
                                        width={160}
                                        height={48}
                                        unoptimized
                                        className="h-10 w-auto object-contain"
                                    />
                                    <div className="min-w-0">
                                        <p className="truncate type-title-s">{charName(currentCard.characterId)} · {currentCard.prefix}</p>
                                        <p className="truncate type-body-s text-white/80">{currentCard.gachaPhrase}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="filled" size="s" icon={mdPlayArrow} disabled={!pool || busy || pool.cards.length === 0} onClick={() => runPull(1)}>
                                {t("page.gachaSimulator.pullSingle")}
                            </Button>
                            <Button variant="tonal" size="s" icon={mdGridView} disabled={!pool || busy || pool.cards.length === 0} onClick={() => runPull(10)}>
                                {t("page.gachaSimulator.pullTen")}
                            </Button>
                            {status === "waiting" && (
                                <Button variant="filled" size="s" icon={mdSkipNext} onClick={advance}>
                                    {t("page.gachaSimulator.next", { current: (session?.index ?? 0) + 1, total: session?.results.length ?? 0 })}
                                </Button>
                            )}
                            {status === "playing" && (
                                <Button variant="text" size="s" icon={mdSkipNext} onClick={skipCurrent}>{t("page.gachaSimulator.skip")}</Button>
                            )}
                            {busy && session && (
                                <Button variant="text" size="s" icon={mdStar} onClick={skipToHigh}>{t("page.gachaSimulator.skipToHigh")}</Button>
                            )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-2">
                                <span className="type-label-l text-on-surface-variant">{t("page.gachaSimulator.speed")}</span>
                                <SegmentedButton
                                    aria-label={t("page.gachaSimulator.speed")}
                                    value={String(speed) as "1" | "2" | "4"}
                                    onValueChange={(value) => setSpeed(Number(value) as 1 | 2 | 4)}
                                    options={[
                                        { value: "1", label: "1×" },
                                        { value: "2", label: "2×" },
                                        { value: "4", label: "4×" },
                                    ]}
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                <Switch checked={autoAdvance} onCheckedChange={setAutoAdvance} label={t("page.gachaSimulator.auto")} />
                                <Switch checked={voice} onCheckedChange={setVoice} icons label={t("page.gachaSimulator.voice")} />
                                <Switch checked={sfx} onCheckedChange={setSfx} icons label={sfx ? t("page.gachaSimulator.sfxOn") : t("page.gachaSimulator.sfxOff")} />
                            </div>
                        </div>

                        {sessionDone && session && (
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h3 className="type-title-s text-on-surface">{t("page.gachaSimulator.resultTitle", { count: session.results.length })}</h3>
                                    <p className="type-label-l text-on-surface-variant">
                                        {t("page.gachaSimulator.resultFourStar", { count: session.results.filter((r) => HIGH(r.rarity)).length })}
                                    </p>
                                </div>
                                <ul className="grid grid-cols-5 gap-2 sm:grid-cols-5">
                                    {session.results.map((result, i) => {
                                        const card = cardMap.get(result.cardId);
                                        return (
                                            <li key={`${result.cardId}-${i}`} className="relative">
                                                {card ? <SekaiCardThumbnail card={card} width={120} /> : <span className="block aspect-square rounded-md3-sm bg-surface-container-highest" />}
                                                <span className="absolute left-1 top-1 rounded-md3-sm bg-inverse-surface/80 px-1 type-label-s text-inverse-on-surface">
                                                    {"★".repeat(STAR_COUNT[result.rarity])}
                                                </span>
                                                {result.up && (
                                                    <span className="absolute bottom-1 right-1 rounded-md3-sm bg-primary px-1 type-label-s text-on-primary">UP</span>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard icon={mdKidStar} title={t("page.gachaSimulator.statsTitle")} bodyClassName="flex flex-col gap-3">
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Stat label={t("page.gachaSimulator.statsPulls")} value={String(stats.total)} />
                            <Stat label={t("page.gachaSimulator.statsFourStar")} value={String(stats.fourStar)} />
                            <Stat label={t("page.gachaSimulator.statsUp")} value={String(stats.up)} />
                            <Stat
                                label={t("page.gachaSimulator.statsPity")}
                                value={pityLeft === null ? t("page.gachaSimulator.pityOff") : t("page.gachaSimulator.pityProgress", { current: pullState.sinceFourStar, total: pool?.pityPulls ?? 0 })}
                            />
                        </dl>
                        <p className="type-body-s text-on-surface-variant">
                            {t("page.gachaSimulator.statsCompare", { theory: theoryFourStar.toFixed(2), actual: stats.total ? actualFourStar.toFixed(2) : "–" })}
                        </p>
                        <div>
                            <Button variant="text" size="s" icon={mdRestartAlt} onClick={() => {
                                setHistory([]);
                                setPullState(EMPTY_PULL_STATE);
                                setSession(null);
                                setCurrent(null);
                                setStatus("idle");
                                sessionRef.current = null;
                                currentRef.current = null;
                            }} disabled={busy}>
                                {t("page.gachaSimulator.statsReset")}
                            </Button>
                        </div>
                    </SectionCard>
                </div>

                {/* Pool column */}
                <div className="flex min-w-0 flex-col gap-4">
                    <Tabs items={modeItems} value={mode} onValueChange={setMode} aria-label={t("page.gachaSimulator.modeLabel")} />

                    {mode === "official" && (
                        <SectionCard icon={mdCasino} title={t("page.gachaSimulator.officialTitle")} bodyClassName="flex flex-col gap-4">
                            <p className="type-body-s text-on-surface-variant">{t("page.gachaSimulator.officialNote")}</p>
                            <Select
                                value={officialId}
                                onValueChange={(value) => setOfficialId(value)}
                                options={gachaOptions}
                                label={t("page.gachaSimulator.selectGacha")}
                                searchable
                                searchValue={officialQuery}
                                onSearchChange={setOfficialQuery}
                                searchPlaceholder={t("page.gachaSimulator.searchGacha")}
                                noOptionsLabel={t("page.gachaSimulator.noGacha")}
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button variant="tonal" size="s" icon={mdSettings} onClick={cloneOfficial} disabled={!officialPool}>
                                    {t("page.gachaSimulator.cloneToCustom")}
                                </Button>
                            </div>
                        </SectionCard>
                    )}

                    {mode === "custom" && (
                        <SectionCard icon={mdSettings} title={t("page.gachaSimulator.customTitle")} bodyClassName="flex flex-col gap-6">
                            <div className="flex flex-wrap gap-2">
                                <Button variant="tonal" size="s" icon={mdCasino} onClick={() => startCustom()}>{t("page.gachaSimulator.newPool")}</Button>
                                {draft && <Button variant="filled" size="s" icon={mdSave} onClick={handleSavePreset}>{t("page.gachaSimulator.savePreset")}</Button>}
                            </div>
                            {presetNotice && <p className="type-label-l text-primary">{presetNotice}</p>}
                            {draft ? (
                                <PoolEditor pool={draft} cards={cardMap} onChange={setDraft} onOpenCardSelector={() => setIsCardSelectorOpen(true)} />
                            ) : (
                                <EmptyState title={t("page.gachaSimulator.noDraft")} description={t("page.gachaSimulator.noDraftHint")} />
                            )}
                        </SectionCard>
                    )}

                    <SectionCard icon={mdSave} title={t("page.gachaSimulator.presetsTitle")} bodyClassName="flex flex-col gap-3">
                        {presets.length === 0 ? (
                            <p className="type-body-m text-on-surface-variant">{t("page.gachaSimulator.noPresets")}</p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {presets.map((preset) => (
                                    <li key={preset.id} className="flex items-center justify-between gap-2 rounded-md3-md bg-surface-container-high px-3 py-2">
                                        <button type="button" className="min-w-0 flex-1 truncate text-left type-label-l text-on-surface" onClick={() => { setDraft(preset); setMode("custom"); }}>
                                            {preset.name} <span className="text-on-surface-variant">· {preset.cards.length}</span>
                                        </button>
                                        <IconButton icon={mdDelete} label={t("page.gachaSimulator.deletePreset")} onClick={() => handleDeletePreset(preset.id)} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SectionCard>

                    <SectionCard icon={mdContentCopy} title={t("page.gachaSimulator.shareTitle")} bodyClassName="flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                            <TextField label={t("page.gachaSimulator.importPlaceholder")} value={importCode} onValueChange={(value) => { setImportCode(value); setImportError(false); }} error={importError} errorText={importError ? t("page.gachaSimulator.importFailed") : undefined} />
                            <div className="flex flex-wrap gap-2">
                                <Button variant="tonal" size="s" onClick={handleImport} disabled={!importCode.trim()}>{t("page.gachaSimulator.importButton")}</Button>
                                <Button variant="text" size="s" icon={mdContentCopy} onClick={copyShare} disabled={!shareUrl}>
                                    {copyState === "copied" ? t("page.gachaSimulator.copied") : copyState === "failed" ? t("page.gachaSimulator.copyFailed") : t("page.gachaSimulator.copyLink")}
                                </Button>
                            </div>
                        </div>
                        <p className="type-body-s text-on-surface-variant">{t("page.gachaSimulator.shareHint")}</p>
                    </SectionCard>

                    <ProbabilityPanel pool={pool} probabilities={probabilities} rates={rates} cardMap={cardMap} />
                </div>
            </div>

            {mode === "custom" && draft && (
                <CardSelectorModal
                    isOpen={isCardSelectorOpen}
                    onClose={() => setIsCardSelectorOpen(false)}
                    title={t("page.gachaSimulator.pickCards")}
                    cards={cards}
                    selectedCardIds={selectedCardIds}
                    onToggleCardSelect={toggleCard}
                />
            )}
        </PageContainer>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md3-md bg-surface-container-high px-3 py-2">
            <dt className="type-label-m text-on-surface-variant">{label}</dt>
            <dd className="type-title-s tabular-nums text-on-surface">{value}</dd>
        </div>
    );
}

function ProbabilityPanel({
    pool, probabilities, rates, cardMap,
}: {
    pool: SimPoolConfig | null;
    probabilities: ReturnType<typeof cardProbabilities>;
    rates: ReturnType<typeof effectiveRates> | null;
    cardMap: Map<number, ICardInfo>;
}) {
    const { t } = useI18n();
    const top = useMemo(() => [...probabilities].sort((a, b) => b.percent - a.percent).slice(0, 12), [probabilities]);
    return (
        <SectionCard icon={mdStyle} title={t("page.gachaSimulator.probabilityTitle")} bodyClassName="flex flex-col gap-4">
            {!pool || !rates ? (
                <p className="type-body-m text-on-surface-variant">{t("page.gachaSimulator.noPool")}</p>
            ) : (
                <>
                    <p className="type-body-s text-on-surface-variant">{t("page.gachaSimulator.probabilityNote")}</p>
                    <ul className="flex flex-col gap-2">
                        {RARITY_KEYS.map((rarity) => (
                            <li key={rarity} className="grid grid-cols-[6rem_1fr_4.5rem] items-center gap-3">
                                <span className="type-label-l text-on-surface">{t(`page.gachaSimulator.rarity.${rarity}`)}</span>
                                <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
                                    <div className={cn("h-full rounded-full bg-primary transition-[width] duration-300")} style={{ width: `${Math.min(100, rates[rarity])}%` }} />
                                </div>
                                <span className="text-right type-label-m tabular-nums text-on-surface">{rates[rarity].toFixed(2)}%</span>
                            </li>
                        ))}
                    </ul>
                    {top.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <h3 className="type-title-s text-on-surface">{t("page.gachaSimulator.probabilityTop", { count: top.length })}</h3>
                            <ul className="flex flex-col gap-1.5">
                                {top.map((entry) => {
                                    const card = cardMap.get(entry.cardId);
                                    return (
                                        <li key={entry.cardId} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2">
                                            {card ? <SekaiCardThumbnail card={card} width={40} /> : <span className="h-10 w-10 rounded-md3-sm bg-surface-container-highest" />}
                                            <span className="truncate type-label-m text-on-surface">
                                                {"★".repeat(STAR_COUNT[entry.rarity])} #{entry.cardId} {card?.prefix ?? ""}
                                                {entry.up && <span className="ml-1 text-primary">UP</span>}
                                            </span>
                                            <span className="type-label-m tabular-nums text-on-surface">{entry.percent.toFixed(3)}%</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </SectionCard>
    );
}
