"use client";

import React, { useState, useEffect, useMemo, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import dynamic from "next/dynamic";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import { fetchMasterData } from "@/lib/fetch";
import { getMusicScoreUrl, getMusicVocalAudioUrl, getMusicJacketUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import MusicSelector from "@/components/deck-recommend/MusicSelector";
import { Button, Chip, LoadingState, PageContainer, PageHeader, SectionCard, SegmentedButton, TextField } from "@/components/md3";
import { mdArrowBack, mdHome, mdLink, mdMusicNote, mdPlayArrowFill } from "@/components/md3/icons";
import type { IMusicInfo, IMusicVocalInfo, IMusicDifficultyInfo, MusicDifficultyType } from "@/types/music";

const ChartPreviewPlayer = dynamic(
    () => import("@/components/chart-preview/ChartPreviewPlayer"),
    { ssr: false }
);

const DIFFICULTIES: { value: MusicDifficultyType; color: string }[] = [
    { value: "easy", color: "#34d399" },
    { value: "normal", color: "#38bdf8" },
    { value: "hard", color: "#fbbf24" },
    { value: "expert", color: "#f87171" },
    { value: "master", color: "#a855f7" },
    { value: "append", color: "#f472b6" },
];

function ChartPreviewInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { assetSource } = useTheme();
    const { t } = useI18n();
    const getDifficultyLabel = useCallback((difficulty: MusicDifficultyType) => {
        return t(`page.chartPreview.difficulties.${difficulty}`);
    }, [t]);
    const formatNoteCount = useCallback((count: number) => {
        return t("page.chartPreview.noteCount", { count: count.toLocaleString() });
    }, [t]);
    const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);

    // URL params (custom URL mode - legacy)
    const urlSus = searchParams.get("sus");
    const urlBgm = searchParams.get("bgm");
    const urlOffset = searchParams.get("offset");

    // URL params (song selection mode)
    const urlMode = searchParams.get("mode");
    const urlMusicId = searchParams.get("musicId");
    const urlDifficulty = searchParams.get("difficulty");
    const urlPreview = searchParams.get("preview");
    const urlFrom = searchParams.get("from");
    const urlVocalId = searchParams.get("vocalId");

    // Vocals for BGM lookup
    const [vocals, setVocals] = useState<IMusicVocalInfo[]>([]);
    // Music data for song info display
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [musicDifficulties, setMusicDifficulties] = useState<IMusicDifficultyInfo[]>([]);

    // UI states
    const [selectedMusicId, setSelectedMusicId] = useState<string>(urlMusicId || "");
    const [selectedDifficulty, setSelectedDifficulty] = useState<MusicDifficultyType>(
        (urlDifficulty as MusicDifficultyType) || "master"
    );
    const [selectedVocalId, setSelectedVocalId] = useState<number | null>(
        urlVocalId ? Number(urlVocalId) : null
    );
    const [previewActive, setPreviewActive] = useState(urlPreview === "true");
    const [mode, setMode] = useState<"song" | "url">(urlSus ? "url" : (urlMode === "url" ? "url" : "song"));

    // Custom URL mode
    const [customSus, setCustomSus] = useState("");
    const [customBgm, setCustomBgm] = useState("");
    const [customOffset, setCustomOffset] = useState("");
    const [paramsInitialized, setParamsInitialized] = useState(false);

    useEffect(() => {
        if (!previewActive) {
             
            setIsPlayerFullscreen(false);
        }
    }, [previewActive]);

    // Load vocals, musics, and difficulties data
    useEffect(() => {
        if (urlSus) {
             
            setPreviewActive(true);
             
            setParamsInitialized(true);
            return;
        }
        Promise.all([
            fetchMasterData<IMusicVocalInfo[]>("musicVocals.json"),
            fetchMasterData<IMusicInfo[]>("musics.json"),
            fetchMasterData<IMusicDifficultyInfo[]>("musicDifficulties.json"),
        ])
            .then(([vocalsData, musicsData, diffsData]) => {
                setVocals(vocalsData);
                setMusics(musicsData);
                setMusicDifficulties(diffsData);
            })
            .catch(() => { })
            .finally(() => {
                // Auto-enter preview if URL has musicId + preview=true
                if (urlMusicId && urlPreview === "true") {
                    setPreviewActive(true);
                }
                setParamsInitialized(true);
            });
    }, [urlSus, urlMusicId, urlPreview]);

    // Sync state to URL (skip for legacy sus mode)
    useEffect(() => {
        if (!paramsInitialized || urlSus) return;

        const params = new URLSearchParams();
        if (mode !== "song") params.set("mode", mode);
        if (selectedMusicId) params.set("musicId", selectedMusicId);
        if (selectedDifficulty !== "master") params.set("difficulty", selectedDifficulty);
        if (previewActive) params.set("preview", "true");
        if (urlFrom) params.set("from", urlFrom);
        if (selectedVocalId !== null) params.set("vocalId", String(selectedVocalId));
        replaceCurrentUrlSearchParams(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, selectedMusicId, selectedDifficulty, selectedVocalId, previewActive, paramsInitialized, urlSus, router]);

    // Get first vocal for BGM
    const musicIdNum = selectedMusicId ? Number(selectedMusicId) : null;

    // Available difficulties for the selected song
    const availableDifficulties = useMemo(() => {
        if (!musicIdNum) return [];
        const DIFF_ORDER: MusicDifficultyType[] = ["easy", "normal", "hard", "expert", "master", "append"];
        return musicDifficulties
            .filter((d) => d.musicId === musicIdNum)
            .sort((a, b) => DIFF_ORDER.indexOf(a.musicDifficulty) - DIFF_ORDER.indexOf(b.musicDifficulty));
    }, [musicDifficulties, musicIdNum]);

    // Available vocals for the selected song
    const availableVocals = useMemo(() => {
        if (!musicIdNum) return [];
        return vocals.filter((v) => v.musicId === musicIdNum);
    }, [vocals, musicIdNum]);

    // Auto-correct difficulty & vocal when song changes
    useEffect(() => {
        if (availableDifficulties.length > 0) {
            const hasCurrent = availableDifficulties.some((d) => d.musicDifficulty === selectedDifficulty);
            if (!hasCurrent) {
                const master = availableDifficulties.find((d) => d.musicDifficulty === "master");
                 
                setSelectedDifficulty(master ? "master" : availableDifficulties[availableDifficulties.length - 1].musicDifficulty);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableDifficulties]);

    // Reset vocal selection when song changes
    useEffect(() => {
         
        setSelectedVocalId(null);
    }, [musicIdNum]);

    const selectedVocal = useMemo(() => {
        if (!musicIdNum) return null;
        if (selectedVocalId !== null) {
            const match = availableVocals.find((v) => v.id === selectedVocalId);
            if (match) return match;
        }
        return availableVocals[0] ?? null;
    }, [availableVocals, musicIdNum, selectedVocalId]);

    // Compute URLs for song mode
    const songSusUrl = useMemo(() => {
        if (!musicIdNum) return null;
        return getMusicScoreUrl(musicIdNum, selectedDifficulty, assetSource);
    }, [musicIdNum, selectedDifficulty, assetSource]);

    const songBgmUrl = useMemo(() => {
        if (!selectedVocal) return null;
        return getMusicVocalAudioUrl(selectedVocal.assetbundleName, assetSource);
    }, [selectedVocal, assetSource]);

    // Selected music info for header display
    const selectedMusic = useMemo(() => {
        if (!musicIdNum) return null;
        return musics.find((m) => m.id === musicIdNum) ?? null;
    }, [musics, musicIdNum]);

    const selectedDiffInfo = useMemo(() => {
        if (!musicIdNum) return null;
        return musicDifficulties.find(
            (d) => d.musicId === musicIdNum && d.musicDifficulty === selectedDifficulty
        ) ?? null;
    }, [musicDifficulties, musicIdNum, selectedDifficulty]);

    // Determine active SUS/BGM URLs
    let activeSusUrl: string | null = null;
    let activeBgmUrl: string | undefined = undefined;
    let activeOffset: number | null = null;
    let activeCoverUrl: string | null = null;
    let activeTitle: string | null = null;
    let activeDifficulty: string | null = null;
    let activeComposer: string | null = null;
    let activeLyricist: string | null = null;
    let activeArranger: string | null = null;
    let activeVocal: string | null = null;

    if (urlSus) {
        activeSusUrl = urlSus;
        activeBgmUrl = urlBgm ?? undefined;
        activeOffset = urlOffset ? Number.parseFloat(urlOffset) : null;
        activeCoverUrl = searchParams.get("cover");
        activeTitle = searchParams.get("title");
        activeDifficulty = searchParams.get("difficulty");
        activeComposer = searchParams.get("composer");
        activeLyricist = searchParams.get("lyricist");
        activeArranger = searchParams.get("arranger");
        activeVocal = searchParams.get("vocal");
    } else if (mode === "url" && previewActive) {
        activeSusUrl = customSus || null;
        activeBgmUrl = customBgm || undefined;
        activeOffset = customOffset ? Number.parseFloat(customOffset) : null;
    } else if (mode === "song" && previewActive) {
        activeSusUrl = songSusUrl;
        activeBgmUrl = songBgmUrl ?? undefined;
        if (selectedMusic) {
            activeCoverUrl = getMusicJacketUrl(selectedMusic.assetbundleName, assetSource);
            activeTitle = selectedMusic.title;
            activeDifficulty = selectedDifficulty.toUpperCase();
            activeComposer = selectedMusic.composer ?? null;
            activeLyricist = selectedMusic.lyricist ?? null;
            activeArranger = selectedMusic.arranger ?? null;
        }
    }

    const handleStartPreview = () => {
        if (mode === "song" && !selectedMusicId) return;
        if (mode === "url" && !customSus) return;
        setPreviewActive(true);
    };

    const handleBack = () => {
        setPreviewActive(false);
    };

    const renderHeader = (showDescription = false) => (
        <PageHeader
            align="center"
            eyebrow={t("page.chartPreview.badge")}
            title={t("page.chartPreview.title")}
            highlight={t("page.chartPreview.titleHighlight")}
            description={showDescription ? t("page.chartPreview.description") : undefined}
        />
    );

    // URL mode: auto-start (legacy sus param)
    if (urlSus && previewActive) {
        return (
            <MainLayout immersiveMode={isPlayerFullscreen}>
                <PageContainer>
                    {renderHeader()}
                    <ChartPreviewPlayer
                        susUrl={activeSusUrl!}
                        bgmUrl={activeBgmUrl}
                        rawOffsetMs={activeOffset}
                        fillerSec={selectedMusic?.fillerSec}
                        onFullscreenChange={setIsPlayerFullscreen}
                        coverUrl={activeCoverUrl}
                        title={activeTitle}
                        difficulty={activeDifficulty}
                        composer={activeComposer}
                        lyricist={activeLyricist}
                        arranger={activeArranger}
                        vocal={activeVocal}
                    />
                </PageContainer>
            </MainLayout>
        );
    }

    // Preview active (song or custom URL mode)
    if (previewActive && activeSusUrl) {
        const diffInfo = DIFFICULTIES.find((d) => d.value === selectedDifficulty);
        return (
            <MainLayout immersiveMode={isPlayerFullscreen}>
                <PageContainer>
                    <div className="mb-4 flex items-center gap-2">
                        {urlFrom ? (
                            <>
                                <Button variant="tonal" icon={mdArrowBack} className="shrink-0" onClick={() => router.back()}>
                                    {t("page.chartPreview.backPrevious")}
                                </Button>
                                <Button variant="outlined" icon={mdHome} className="shrink-0" onClick={handleBack}>
                                    {t("page.chartPreview.previewHome")}
                                </Button>
                            </>
                        ) : (
                            <Button variant="tonal" icon={mdArrowBack} className="shrink-0" onClick={handleBack}>
                                {t("page.chartPreview.back")}
                            </Button>
                        )}
                        {selectedMusic ? (
                            <>
                                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md3-sm shadow-elev-1 sm:h-14 sm:w-14">
                                    <Image
                                        src={getMusicJacketUrl(selectedMusic.assetbundleName, assetSource)}
                                        alt={selectedMusic.title}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className="truncate type-title-m text-on-surface sm:type-title-l">
                                        {selectedMusic.title}
                                    </h2>
                                    <div className="mt-0.5 flex items-center gap-2">
                                        {diffInfo && (
                                            <span
                                                className="shrink-0 rounded-md3-xs px-2 py-0.5 type-label-s text-white"
                                                style={{ backgroundColor: diffInfo.color }}
                                            >
                                                {getDifficultyLabel(diffInfo.value)}
                                            </span>
                                        )}
                                        {selectedDiffInfo && (
                                            <span className="truncate type-body-s text-on-surface-variant">
                                                {t("page.chartPreview.levelLabel", { level: selectedDiffInfo.playLevel })} · {formatNoteCount(selectedDiffInfo.totalNoteCount)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <h2 className="min-w-0 flex-1 truncate type-title-l text-on-surface sm:type-headline-s">
                                {selectedMusicId ? t("page.chartPreview.previewTitleWithId", { id: selectedMusicId }) : t("page.chartPreview.metadataTitle")}
                            </h2>
                        )}
                    </div>
                    {/* Vocal switcher in preview mode */}
                    {availableVocals.length > 1 && (
                        <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
                            <span className="shrink-0 type-label-m text-on-surface-variant">{t("page.chartPreview.vocalVersion")}</span>
                            {availableVocals.map((v) => (
                                <Chip
                                    key={v.id}
                                    className="shrink-0"
                                    selected={selectedVocal?.id === v.id}
                                    onClick={() => setSelectedVocalId(v.id)}
                                >
                                    {v.caption}
                                </Chip>
                            ))}
                        </div>
                    )}
                    <ChartPreviewPlayer
                        key={`${activeSusUrl}-${activeBgmUrl}`}
                        susUrl={activeSusUrl}
                        bgmUrl={activeBgmUrl}
                        rawOffsetMs={activeOffset}
                        fillerSec={selectedMusic?.fillerSec}
                        onFullscreenChange={setIsPlayerFullscreen}
                        coverUrl={activeCoverUrl}
                        title={activeTitle}
                        difficulty={activeDifficulty}
                        composer={activeComposer}
                        lyricist={activeLyricist}
                        arranger={activeArranger}
                        vocal={activeVocal}
                    />
                </PageContainer>
            </MainLayout>
        );
    }

    // Selection UI
    return (
        <MainLayout>
            <PageContainer>
                {/* Page Header */}
                {renderHeader(true)}

                {/* Mode Tabs */}
                <div className="mx-auto mb-6 max-w-md">
                    <SegmentedButton
                        value={mode}
                        onValueChange={setMode}
                        options={[
                            { value: "song", label: t("page.chartPreview.selectSong"), icon: mdMusicNote },
                            { value: "url", label: t("page.chartPreview.customUrl"), icon: mdLink },
                        ]}
                    />
                </div>

                {mode === "song" ? (
                    <div className="mx-auto max-w-3xl space-y-6">
                        {/* Music Selector (reused from deck-recommend) */}
                        <MusicSelector
                            selectedMusicId={selectedMusicId}
                            onSelect={setSelectedMusicId}
                            showRecommendations={false}
                        />

                        {/* Difficulty Selector */}
                        <div>
                            <div className="mb-2 text-center type-title-s text-on-surface-variant">
                                {t("page.chartPreview.difficulty")}
                            </div>
                            {availableDifficulties.length > 0 ? (
                                <div className="flex flex-wrap justify-center gap-2">
                                    {availableDifficulties.map((diff) => {
                                        const meta = DIFFICULTIES.find((d) => d.value === diff.musicDifficulty);
                                        if (!meta) return null;
                                        const active = selectedDifficulty === diff.musicDifficulty;
                                        return (
                                            <button
                                                key={diff.musicDifficulty}
                                                type="button"
                                                aria-pressed={active}
                                                onClick={() => setSelectedDifficulty(diff.musicDifficulty)}
                                                className={`state-layer focus-ring flex flex-col items-center rounded-md3-md px-4 py-2 transition-colors duration-200 ease-md3-standard ${active
                                                        ? "bg-surface-container-lowest shadow-elev-1"
                                                        : "bg-transparent"
                                                    }`}
                                                style={active ? { boxShadow: `0 0 0 2px ${meta.color}` } : undefined}
                                            >
                                                <span className="type-label-s uppercase" style={{ color: meta.color }}>
                                                    {getDifficultyLabel(meta.value)}
                                                </span>
                                                <span className="type-title-l type-emphasized" style={{ color: meta.color }}>
                                                    {diff.playLevel}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-wrap justify-center gap-2">
                                    {DIFFICULTIES.map((d) => {
                                        const active = selectedDifficulty === d.value;
                                        return (
                                            <button
                                                key={d.value}
                                                type="button"
                                                aria-pressed={active}
                                                onClick={() => setSelectedDifficulty(d.value)}
                                                className={`state-layer focus-ring flex flex-col items-center rounded-md3-md px-4 py-2 transition-colors duration-200 ease-md3-standard ${active
                                                        ? "bg-surface-container-lowest shadow-elev-1"
                                                        : "bg-transparent"
                                                    }`}
                                                style={active ? { boxShadow: `0 0 0 2px ${d.color}` } : undefined}
                                            >
                                                <span className="type-label-m uppercase" style={{ color: d.color }}>
                                                    {getDifficultyLabel(d.value)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Vocal Selector */}
                        {availableVocals.length > 1 && (
                            <div>
                                <div className="mb-2 text-center type-title-s text-on-surface-variant">
                                    {t("page.chartPreview.vocalVersion")}
                                </div>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {availableVocals.map((v) => (
                                        <Chip
                                            key={v.id}
                                            selected={selectedVocal?.id === v.id}
                                            onClick={() => setSelectedVocalId(v.id)}
                                        >
                                            {v.caption}
                                        </Chip>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Start Button */}
                        <Button
                            variant="filled"
                            size="m"
                            fullWidth
                            icon={mdPlayArrowFill}
                            onClick={handleStartPreview}
                            disabled={!selectedMusicId}
                        >
                            {t("page.chartPreview.startPreview")}
                            {selectedMusicId && (
                                <span className="type-label-l opacity-80">
                                    {t("page.chartPreview.startPreviewSuffix", { id: selectedMusicId, difficulty: getDifficultyLabel(selectedDifficulty) })}
                                </span>
                            )}
                        </Button>
                    </div>
                ) : (
                    <div className="mx-auto max-w-2xl">
                        <SectionCard title={t("page.chartPreview.customChartUrl")} icon={mdLink} bodyClassName="space-y-4">
                            <TextField
                                label="SUS URL *"
                                placeholder="https://..."
                                value={customSus}
                                onValueChange={setCustomSus}
                            />
                            <TextField
                                label={t("page.chartPreview.bgmUrlOptional")}
                                placeholder="https://..."
                                value={customBgm}
                                onValueChange={setCustomBgm}
                            />
                            <TextField
                                type="number"
                                label={t("page.chartPreview.offsetOptional")}
                                placeholder="0"
                                value={customOffset}
                                onValueChange={setCustomOffset}
                            />
                            <Button
                                variant="filled"
                                size="m"
                                fullWidth
                                icon={mdPlayArrowFill}
                                onClick={handleStartPreview}
                                disabled={!customSus}
                            >
                                {t("page.chartPreview.startPreview")}
                            </Button>
                        </SectionCard>
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}

function ChartPreviewFallback() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <PageContainer>
                <PageHeader
                    align="center"
                    eyebrow={t("page.chartPreview.badge")}
                    title={t("page.chartPreview.title")}
                    highlight={t("page.chartPreview.titleHighlight")}
                />
                <LoadingState label={t("page.chartPreview.loading")} />
            </PageContainer>
        </MainLayout>
    );
}

export default function ChartPreviewContent() {
    return (
        <Suspense fallback={<ChartPreviewFallback />}>
            <ChartPreviewInner />
        </Suspense>
    );
}
