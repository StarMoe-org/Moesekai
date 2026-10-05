"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import {
    getAssetSourceFallbackOrder,
    getChartSvgUrl,
    getMusicJacketUrl,
    getMusicScoreUrl,
} from "@/lib/assets";
import { fetchMasterData, fetchMasterDataForServer } from "@/lib/fetch";
import { DIFFICULTY_COLORS, DIFFICULTY_NAMES, type MusicDifficultyType } from "@/types/music";
import { Button, Icon, IconButton, LoadingState } from "@/components/md3";
import { mdAdd, mdDownload, mdFitScreen, mdOpenInNew, mdRefresh, mdRemove } from "@/components/md3/icons";

const VALID_DIFFICULTIES = new Set<string>(["easy", "normal", "hard", "expert", "master", "append"]);

interface MusicRow {
    id: number;
    title: string;
    composer: string;
    assetbundleName: string;
}

interface DifficultyRow {
    musicId: number;
    musicDifficulty: string;
    playLevel: number;
}

type ViewerState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; url: string; width: number; height: number };

/**
 * Replaces external image hrefs with data URLs so the SVG can be shown via <img>
 * (isolating its stylesheet from the page) and exported to PNG without tainting
 * the canvas. Mirrors upstream sekai-sus2img's inlineSvgImages.
 */
async function inlineSvgImages(svgText: string): Promise<string> {
    const hrefs = Array.from(
        new Set(
            [...svgText.matchAll(/href="([^"]+)"/g)]
                .map((match) => match[1])
                .filter((href) => href && !href.startsWith("#") && !href.startsWith("data:"))
        )
    );

    const dataUrls = new Map<string, string>();
    await Promise.all(
        hrefs.map(async (href) => {
            try {
                const res = await fetch(href);
                if (!res.ok) return;
                const blob = await res.blob();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result ?? ""));
                    reader.onerror = () => reject(new Error("read failed"));
                    reader.readAsDataURL(blob);
                });
                dataUrls.set(href, dataUrl);
            } catch {
                // keep original href when fetch fails (e.g. CORS) — it still renders in-browser
            }
        })
    );

    let inlined = svgText;
    for (const [href, dataUrl] of dataUrls) {
        inlined = inlined.replaceAll(`href="${href}"`, `href="${dataUrl}"`);
    }
    return inlined;
}

function ChartImageInner() {
    const searchParams = useSearchParams();
    const { assetSource } = useTheme();
    const { t } = useI18n();

    const musicId = Number(searchParams.get("musicId"));
    const rawDifficulty = (searchParams.get("difficulty") || "master").toLowerCase();
    const difficulty = (VALID_DIFFICULTIES.has(rawDifficulty) ? rawDifficulty : "master") as MusicDifficultyType;
    const paramsValid = Number.isInteger(musicId) && musicId > 0;

    const [state, setState] = useState<ViewerState>({ status: "loading" });
    const [musicTitle, setMusicTitle] = useState<string>("");
    const [playLevel, setPlayLevel] = useState<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const [isDownloading, setIsDownloading] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [reloadToken, setReloadToken] = useState(0);

    useEffect(() => {
        if (!paramsValid) {
            setState({ status: "error", message: t("page.chartImage.missingParams") });
            return;
        }

        let cancelled = false;
        let objectUrl: string | null = null;

        (async () => {
            setState({ status: "loading" });

            // Music metadata is cosmetic (footer title/jacket/level) — best effort.
            let title = `#${musicId}`;
            let composer: string | null = null;
            let jacket: string | null = null;
            let level: number | null = null;
            try {
                const [musics, difficulties] = await Promise.all([
                    fetchMasterData<MusicRow[]>("musics.json"),
                    fetchMasterData<DifficultyRow[]>("musicDifficulties.json"),
                ]);
                let music = musics.find((row) => row.id === musicId);
                level = difficulties.find(
                    (row) => row.musicId === musicId && row.musicDifficulty === difficulty
                )?.playLevel ?? null;
                if (!music) {
                    // Song not in the selected server's masterdata yet (e.g. a new JP song
                    // while browsing the CN server) — fall back to JP masterdata.
                    const [jpMusics, jpDifficulties] = await Promise.all([
                        fetchMasterDataForServer<MusicRow[]>("jp", "musics.json"),
                        fetchMasterDataForServer<DifficultyRow[]>("jp", "musicDifficulties.json"),
                    ]);
                    music = jpMusics.find((row) => row.id === musicId);
                    level = level ?? jpDifficulties.find(
                        (row) => row.musicId === musicId && row.musicDifficulty === difficulty
                    )?.playLevel ?? null;
                }
                if (music) {
                    title = music.title;
                    composer = music.composer;
                    jacket = getMusicJacketUrl(music.assetbundleName, assetSource);
                }
            } catch {
                // render without metadata
            }
            if (cancelled) return;
            setMusicTitle(title);
            setPlayLevel(level);

            let susText: string | null = null;
            for (const source of getAssetSourceFallbackOrder(assetSource)) {
                try {
                    const res = await fetch(getMusicScoreUrl(musicId, difficulty, source));
                    if (res.ok) {
                        susText = await res.text();
                        break;
                    }
                } catch {
                    // try the next asset source
                }
            }
            if (cancelled) return;
            if (!susText) {
                throw new Error(`SUS ${musicId}/${difficulty}: not found`);
            }

            const [{ parseSusText }, { renderScoreToSvg }] = await Promise.all([
                import("@/vendor/sekai-sus2img/parser"),
                import("@/vendor/sekai-sus2img/renderer"),
            ]);

            const score = parseSusText(susText);
            score.meta.title = title;
            score.meta.artist = composer;
            score.meta.difficulty = DIFFICULTY_NAMES[difficulty] ?? difficulty.toUpperCase();
            score.meta.playlevel = level != null ? String(level) : null;
            score.meta.jacket = jacket;

            const rendered = renderScoreToSvg(score, {
                noteHost: "/notes_new/custom01",
                noteSize: 18,
                timeHeight: 240,
            });
            const inlined = await inlineSvgImages(rendered.svg);
            if (cancelled) return;

            const blob = new Blob([inlined], { type: "image/svg+xml;charset=utf-8" });
            objectUrl = URL.createObjectURL(blob);
            setState({ status: "ready", url: objectUrl, width: rendered.width, height: rendered.height });
        })().catch((error: unknown) => {
            if (!cancelled) {
                const detail = error instanceof Error ? error.message : "";
                setState({
                    status: "error",
                    message: detail ? `${t("page.chartImage.failed")} (${detail})` : t("page.chartImage.failed"),
                });
            }
        });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [paramsValid, musicId, difficulty, assetSource, reloadToken, t]);

    const applyFitZoom = useCallback((height: number) => {
        const container = containerRef.current;
        if (!container || height <= 0) return;
        const fitted = (container.clientHeight - 16) / height;
        setZoom(Math.min(4, Math.max(0.05, Math.round(fitted * 100) / 100)));
    }, []);

    useEffect(() => {
        if (state.status === "ready") {
            applyFitZoom(state.height);
        }
    }, [state, applyFitZoom]);

    const downloadPng = useCallback(async () => {
        if (state.status !== "ready" || isDownloading) return;
        setIsDownloading(true);
        try {
            const image = new Image();
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error("SVG load failed"));
                image.src = state.url;
            });

            const canvas = document.createElement("canvas");
            canvas.width = state.width;
            canvas.height = state.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas unavailable");
            ctx.drawImage(image, 0, 0, state.width, state.height);

            const pngBlob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))), "image/png");
            });
            const url = URL.createObjectURL(pngBlob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${musicTitle || musicId}_${difficulty}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch {
            // ignore; the button simply stays available for retry
        } finally {
            setIsDownloading(false);
        }
    }, [state, isDownloading, musicTitle, musicId, difficulty]);

    const difficultyColor = DIFFICULTY_COLORS[difficulty] ?? "#9ca3af";

    return (
        <div data-seed="21" data-theme="light" className="fixed inset-0 flex flex-col bg-surface text-on-surface">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container px-3 py-2 sm:px-5">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <h1 className="truncate type-title-s sm:type-title-m">{musicTitle || `#${musicId}`}</h1>
                    <span
                        className="rounded-full px-2.5 py-0.5 type-label-m text-white"
                        style={{ backgroundColor: difficultyColor }}
                    >
                        {DIFFICULTY_NAMES[difficulty] ?? difficulty.toUpperCase()}
                        {playLevel != null ? ` ${playLevel}` : ""}
                    </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                    <IconButton
                        icon={mdRemove}
                        size="xs"
                        label={t("page.chartImage.zoomOut")}
                        disabled={state.status !== "ready"}
                        onClick={() => setZoom((value) => Math.max(0.05, Math.round(value * 0.8 * 100) / 100))}
                    />
                    <span className="w-12 text-center font-mono type-label-m tabular-nums">{Math.round(zoom * 100)}%</span>
                    <IconButton
                        icon={mdAdd}
                        size="xs"
                        label={t("page.chartImage.zoomIn")}
                        disabled={state.status !== "ready"}
                        onClick={() => setZoom((value) => Math.min(4, Math.round(value * 1.25 * 100) / 100))}
                    />
                    <Button
                        variant="text"
                        size="xs"
                        icon={mdFitScreen}
                        disabled={state.status !== "ready"}
                        onClick={() => state.status === "ready" && applyFitZoom(state.height)}
                    >
                        {t("page.chartImage.zoomFit")}
                    </Button>
                    <Button variant="text" size="xs" disabled={state.status !== "ready"} onClick={() => setZoom(1)}>
                        {t("page.chartImage.zoomReset")}
                    </Button>
                    <div className="mx-1 hidden h-5 w-px bg-outline-variant sm:block" />
                    <Button
                        variant="filled"
                        size="xs"
                        icon={mdDownload}
                        disabled={state.status !== "ready" || isDownloading}
                        onClick={downloadPng}
                    >
                        {isDownloading ? "…" : t("page.chartImage.downloadPng")}
                    </Button>
                </div>
            </div>

            {/* Canvas */}
            <div ref={containerRef} className="flex-1 overflow-auto bg-surface p-2">
                {state.status === "loading" && <LoadingState label={t("page.chartImage.generating")} className="h-full min-h-0" />}

                {state.status === "error" && (
                    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                        <p className="type-body-m text-error">{state.message}</p>
                        <div className="flex items-center gap-3">
                            <Button variant="outlined" icon={mdRefresh} onClick={() => setReloadToken((token) => token + 1)}>
                                {t("common.action.retry")}
                            </Button>
                            {paramsValid && (
                                <a
                                    href={getChartSvgUrl(musicId, difficulty)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="focus-ring inline-flex items-center gap-1 rounded-md3-xs type-label-l text-primary underline underline-offset-2"
                                >
                                    {t("page.chartImage.openRawSvg")}
                                    <Icon path={mdOpenInNew} size={16} />
                                </a>
                            )}
                        </div>
                    </div>
                )}

                {state.status === "ready" && (
                    <img
                        src={state.url}
                        alt={musicTitle || `#${musicId}`}
                        draggable={false}
                        style={{ width: `${Math.round(state.width * zoom)}px`, maxWidth: "none" }}
                    />
                )}
            </div>
        </div>
    );
}

export default function ChartImageContent() {
    return (
        <Suspense fallback={null}>
            <ChartImageInner />
        </Suspense>
    );
}
