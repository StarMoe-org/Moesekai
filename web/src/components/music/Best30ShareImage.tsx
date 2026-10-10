"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import QRCode from "qrcode";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import Modal from "@/components/common/Modal";
import { Button, IconButton, LinearProgress, LoadingIndicator } from "@/components/md3";
import { mdCheck, mdContentCopy, mdDownload, mdRefresh } from "@/components/md3/icons";
import { getMusicJacketUrl } from "@/lib/assets";
import { canvasToPngBlob, copyImageBlob } from "@/lib/imageActions";

// ==================== Types ====================

interface Best30Entry {
    musicId: number;
    difficulty: string;
    constant: number;
    userConstant: number;
    playResult: "AP" | "FC" | "C" | "";
    title: string;
    assetbundleName: string;
}

interface Best30ShareLabels {
    referenceHint: string;
    footerSource: string;
    scanQr: string;
    dataTime: (time: string) => string;
}

interface Best30ShareImageProps {
    entries: Best30Entry[];
    average: number;
    gameId: string;
    serverLabel: string;
    getMusicThumbnailUrl: (entry: { assetbundleName: string }) => string;
    avatarUrl?: string;
    nickname?: string;
    uploadTime?: string | number;
    onClose: () => void;
}

// ==================== Constants ====================

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1780;
const COLS = 5;
const ROWS = 6;
const CARD_WIDTH = 200;
const CARD_HEIGHT = 175;
const CARD_GAP = 16;
const GRID_LEFT = (CANVAS_WIDTH - (COLS * CARD_WIDTH + (COLS - 1) * CARD_GAP)) / 2;
const GRID_TOP = 310;

// Helper functions for theme colors
function darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max((num >> 16) - amt, 0);
    const G = Math.max(((num >> 8) & 0x00ff) - amt, 0);
    const B = Math.max((num & 0x0000ff) - amt, 0);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(51,204,187,${alpha})`; // fallback
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
}

function getCanvasTheme(themeColor: string) {
    return {
        bg: "#f8fafb",
        bgSubtle: "#f0f4f6",
        cardBg: "#ffffff",
        cardBorder: "#e2e8f0",
        textPrimary: "#1e293b",
        textSecondary: "#64748b",
        textMuted: "#94a3b8",
        miku: themeColor,
        mikuDark: darkenColor(themeColor, 15),
        mikuRgba04: hexToRgba(themeColor, 0.04),
        mikuHexCC: themeColor + "cc",
    };
}

const DIFFICULTY_COLORS: Record<string, string> = {
    easy: "#5CB85C",
    normal: "#5BC0DE",
    hard: "#F0AD4E",
    expert: "#EF4444",
    master: "#9B59B6",
    append: "#EC4899",
};

const DIFFICULTY_SHORT: Record<string, string> = {
    easy: "EAS",
    normal: "NOR",
    hard: "HRD",
    expert: "EXP",
    master: "MAS",
    append: "APD",
};

const JACKET_FALLBACK_SOURCES_BY_REGION: Record<string, AssetSourceType[]> = {
    en: ["main-en", "overseas-en"],
    jp: ["main-jp", "overseas-jp"],
    cn: ["main-cn", "overseas-cn"],
    tw: ["main-tw", "overseas-tw"],
    kr: ["main-kr", "overseas-kr"],
};

// ==================== Helpers ====================

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${src}`));
        img.src = src;
    });
}

async function loadImageWithFallback(sources: string[]): Promise<HTMLImageElement | null> {
    const uniqueSources = Array.from(new Set(sources.filter(Boolean)));
    for (const source of uniqueSources) {
        try {
            return await loadImage(source);
        } catch {
            // Continue trying fallbacks.
        }
    }
    return null;
}

function buildJacketCandidateUrls(
    assetbundleName: string,
    getMusicThumbnailUrl: (entry: { assetbundleName: string }) => string,
): string[] {
    const primaryUrl = getMusicThumbnailUrl({ assetbundleName });
    const match = primaryUrl.match(/\/sekai-([a-z0-9\-]+)-assets/);
    const region = match ? match[1] : "jp";
    const fallbackSources = JACKET_FALLBACK_SOURCES_BY_REGION[region] || JACKET_FALLBACK_SOURCES_BY_REGION.jp;
    const fallbackUrls = fallbackSources.map((source) =>
        getMusicJacketUrl(assetbundleName, source)
    );
    return [primaryUrl, ...fallbackUrls];
}

function parseUploadTimeToDate(uploadTime: string | number): Date | null {
    if (typeof uploadTime === "number") {
        if (!Number.isFinite(uploadTime)) return null;
        const normalized = uploadTime < 1_000_000_000_000 ? uploadTime * 1000 : uploadTime;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = String(uploadTime).trim();
    if (!text) return null;

    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
        const normalized = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(truncated + "…").width > maxWidth) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + "…";
}

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ==================== Draw Function ====================

async function drawBest30Canvas(
    canvas: HTMLCanvasElement,
    entries: Best30Entry[],
    average: number,
    gameId: string,
    serverLabel: string,
    getMusicThumbnailUrl: (entry: { assetbundleName: string }) => string,
    themeColor: string,
    avatarUrl?: string,
    nickname?: string,
    uploadTime?: string | number,
    labels?: Best30ShareLabels,
): Promise<void> {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const THEME = getCanvasTheme(themeColor);

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // ====================== Background ======================
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Subtle dot pattern
    ctx.fillStyle = THEME.mikuRgba04;
    for (let x = 0; x < CANVAS_WIDTH; x += 24) {
        for (let y = 0; y < CANVAS_HEIGHT; y += 24) {
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Top accent bar
    const accentGrad = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
    accentGrad.addColorStop(0, THEME.miku);
    accentGrad.addColorStop(1, THEME.mikuDark);
    ctx.fillStyle = accentGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, 6);

    // ====================== Header Card ======================
    const headerH = 240;
    drawRoundedRect(ctx, GRID_LEFT, 30, CANVAS_WIDTH - GRID_LEFT * 2, headerH, 20);
    ctx.fillStyle = THEME.cardBg;
    ctx.fill();
    ctx.strokeStyle = THEME.cardBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Left miku accent stripe inside header
    ctx.save();
    drawRoundedRect(ctx, GRID_LEFT, 30, CANVAS_WIDTH - GRID_LEFT * 2, headerH, 20);
    ctx.clip();
    ctx.fillStyle = THEME.miku;
    ctx.fillRect(GRID_LEFT, 30, 5, headerH);
    ctx.restore();

    // "BEST 30" label
    ctx.fillStyle = THEME.textMuted;
    ctx.font = "bold 18px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("BEST 30", GRID_LEFT + 32, 72);

    // Average score - big number with miku color
    ctx.fillStyle = THEME.miku;
    ctx.font = "900 88px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(average.toFixed(2), GRID_LEFT + 32, 180);

    // Description
    ctx.fillStyle = THEME.textMuted;
    ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(labels?.referenceHint ?? "Community constants · For reference only", GRID_LEFT + 32, 220);

    // User info (right side) - avatar + name + UID + server + upload time
    const infoRightX = CANVAS_WIDTH - GRID_LEFT - 28;
    const avatarSize = 64;
    const avatarCenterX = infoRightX - 4;
    const avatarCenterY = 80;

    // Load and draw circular avatar
    if (avatarUrl) {
        try {
            const avatarImg = await loadImage(avatarUrl);
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarCenterX - avatarSize / 2, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(
                avatarImg,
                avatarCenterX - avatarSize,
                avatarCenterY - avatarSize / 2,
                avatarSize,
                avatarSize
            );
            ctx.restore();

            // Avatar border ring
            ctx.beginPath();
            ctx.arc(avatarCenterX - avatarSize / 2, avatarCenterY, avatarSize / 2 + 1, 0, Math.PI * 2);
            ctx.strokeStyle = THEME.cardBorder;
            ctx.lineWidth = 2;
            ctx.stroke();
        } catch {
            // Avatar load failed, skip
        }
    }

    // Text area - to the left of avatar
    const textRightX = avatarUrl ? avatarCenterX - avatarSize - 12 : infoRightX;

    // Nickname (if available)
    if (nickname) {
        ctx.fillStyle = THEME.textPrimary;
        ctx.font = "bold 22px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(nickname, textRightX, 68);
    }

    // UID + Server
    ctx.fillStyle = THEME.textSecondary;
    ctx.font = "15px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`UID: ${gameId}  ·  ${serverLabel}`, textRightX, nickname ? 92 : 72);

    // Upload time
    if (uploadTime) {
        ctx.fillStyle = THEME.textMuted;
        ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "right";
        const date = parseUploadTimeToDate(uploadTime);
        if (date) {
            const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            ctx.fillText(labels?.dataTime(timeStr) ?? `Data time: ${timeStr}`, textRightX, nickname ? 114 : 96);
        } else {
            ctx.fillText(labels?.dataTime(String(uploadTime)) ?? `Data time: ${uploadTime}`, textRightX, nickname ? 114 : 96);
        }
    }

    // ====================== Load Assets ======================
    const jacketPromises = entries.map(async (entry) => {
        const candidateUrls = buildJacketCandidateUrls(entry.assetbundleName, getMusicThumbnailUrl);
        return loadImageWithFallback(candidateUrls);
    });

    const [apIcon, fcIcon] = await Promise.all([
        loadImage("/data/music/icon_allPerfect.png").catch(() => null),
        loadImage("/data/music/icon_fullCombo.png").catch(() => null),
    ]);

    const jackets = await Promise.all(jacketPromises);

    // ====================== Draw Cards ======================
    for (let i = 0; i < entries.length && i < 30; i++) {
        const entry = entries[i];
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = GRID_LEFT + col * (CARD_WIDTH + CARD_GAP);
        const y = GRID_TOP + row * (CARD_HEIGHT + CARD_GAP);

        // Card shadow
        ctx.shadowColor = "rgba(0,0,0,0.06)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        drawRoundedRect(ctx, x, y, CARD_WIDTH, CARD_HEIGHT, 12);
        ctx.fillStyle = THEME.cardBg;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Card border
        drawRoundedRect(ctx, x, y, CARD_WIDTH, CARD_HEIGHT, 12);
        ctx.strokeStyle = THEME.cardBorder;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Jacket image
        const jacket = jackets[i];
        const jacketSize = 128;
        const jacketX = x + (CARD_WIDTH - jacketSize) / 2;
        const jacketY = y + 8;

        if (jacket) {
            ctx.save();
            drawRoundedRect(ctx, jacketX, jacketY, jacketSize, jacketSize, 10);
            ctx.clip();
            ctx.drawImage(jacket, jacketX, jacketY, jacketSize, jacketSize);
            ctx.restore();
        } else {
            drawRoundedRect(ctx, jacketX, jacketY, jacketSize, jacketSize, 10);
            ctx.fillStyle = THEME.bgSubtle;
            ctx.fill();
        }

        // Rank badge (top-left of jacket)
        const rankBadgeW = 28;
        const rankBadgeH = 22;
        drawRoundedRect(ctx, jacketX, jacketY, rankBadgeW, rankBadgeH, 6);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`#${i + 1}`, jacketX + rankBadgeW / 2, jacketY + 16);

        // Difficulty badge (top-right of jacket)
        const diffColor = DIFFICULTY_COLORS[entry.difficulty] || "#888";
        const diffLabel = DIFFICULTY_SHORT[entry.difficulty] || entry.difficulty.slice(0, 3).toUpperCase();
        const diffBadgeW = 38;
        const diffBadgeH = 20;
        const diffBadgeX = jacketX + jacketSize - diffBadgeW;
        drawRoundedRect(ctx, diffBadgeX, jacketY, diffBadgeW, diffBadgeH, 6);
        ctx.fillStyle = diffColor;
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(diffLabel, diffBadgeX + diffBadgeW / 2, jacketY + 15);

        // AP/FC icon (bottom-right of jacket)
        const resultIcon = entry.playResult === "AP" ? apIcon : fcIcon;
        if (resultIcon) {
            ctx.drawImage(resultIcon, jacketX + jacketSize - 24, jacketY + jacketSize - 24, 22, 22);
        }

        // User constant badge (bottom-left of jacket)
        const constBadgeW = 48;
        const constBadgeH = 22;
        const constBadgeX = jacketX;
        const constBadgeY = jacketY + jacketSize - constBadgeH;
        drawRoundedRect(ctx, constBadgeX, constBadgeY, constBadgeW, constBadgeH, 6);
        ctx.fillStyle = THEME.miku;
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(entry.userConstant.toFixed(1), constBadgeX + constBadgeW / 2, constBadgeY + 16);

        // Song title (below jacket)
        ctx.fillStyle = THEME.textPrimary;
        ctx.font = "bold 12px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        const titleText = truncateText(ctx, entry.title, CARD_WIDTH - 16);
        ctx.fillText(titleText, x + CARD_WIDTH / 2, y + CARD_HEIGHT - 10);
    }

    // ====================== Footer ======================
    const footerY = GRID_TOP + ROWS * (CARD_HEIGHT + CARD_GAP) + 20;

    // Footer card
    drawRoundedRect(ctx, GRID_LEFT, footerY, CANVAS_WIDTH - GRID_LEFT * 2, 130, 16);
    ctx.fillStyle = THEME.cardBg;
    ctx.fill();
    ctx.strokeStyle = THEME.cardBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Footer text
    ctx.fillStyle = THEME.textSecondary;
    ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(labels?.footerSource ?? "Data source: Haruki Toolbox · Constants source: Community constants", GRID_LEFT + 24, footerY + 32);

    ctx.fillStyle = THEME.textMuted;
    ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Rating = AP ? constant : (constant ≥ 33 ? constant - 1 : constant - 1.5)", GRID_LEFT + 24, footerY + 58);

    ctx.fillStyle = THEME.textMuted;
    ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Generated by Moesekai | pjsk.moe", GRID_LEFT + 24, footerY + 88);

    const now = new Date();
    ctx.fillText(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        GRID_LEFT + 24, footerY + 110
    );

    // QR Code (right side of footer)
    try {
        const pageUrl = "https://pjsk.moe/my-musics";
        const qrDataUrl = await QRCode.toDataURL(pageUrl, {
            width: 90,
            margin: 1,
            color: { dark: THEME.mikuHexCC, light: "#00000000" },
        });
        const qrImg = await loadImage(qrDataUrl);
        const qrX = CANVAS_WIDTH - GRID_LEFT - 110;
        const qrY = footerY + 16;
        ctx.drawImage(qrImg, qrX, qrY, 96, 96);

        ctx.fillStyle = THEME.textMuted;
        ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(labels?.scanQr ?? "Scan to view", qrX + 48, qrY + 112);
    } catch (e) {
        console.warn("QR Code generation failed:", e);
    }
}

// ==================== Component ====================

export default function Best30ShareImage({
    entries,
    average,
    gameId,
    serverLabel,
    getMusicThumbnailUrl,
    avatarUrl,
    nickname,
    uploadTime,
    onClose,
}: Best30ShareImageProps) {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isGenerating, setIsGenerating] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState(() => t("page.best30Share.preparing"));
    const [canvasReady, setCanvasReady] = useState(false);
    const copyResetTimerRef = useRef<number | null>(null);
    const saveResetTimerRef = useRef<number | null>(null);

    const { themeColor } = useTheme();

    useEffect(() => {
        return () => {
            if (copyResetTimerRef.current) {
                window.clearTimeout(copyResetTimerRef.current);
            }
            if (saveResetTimerRef.current) {
                window.clearTimeout(saveResetTimerRef.current);
            }
        };
    }, []);

    // Callback ref: detect when canvas actually mounts in the DOM
    // (Modal delays rendering by one rAF, so the canvas isn't available on first render)
    const canvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
        canvasRef.current = node;
        if (node) setCanvasReady(true);
    }, []);

    // Fake progress bar — slow progression over ~15s, capping at 95%
    useEffect(() => {
        if (!isGenerating) {
            setProgress(100);
            setProgressText(t("page.best30Share.done"));
            return;
        }

        setProgress(0);
        setProgressText(t("page.best30Share.loadingAssets"));

        const stages = [
            { target: 15, text: t("page.best30Share.loadingAssets"), duration: 2000 },
            { target: 35, text: t("page.best30Share.drawingCards"), duration: 4000 },
            { target: 55, text: t("page.best30Share.renderingCovers"), duration: 4000 },
            { target: 70, text: t("page.best30Share.generatingQr"), duration: 3000 },
            { target: 85, text: t("page.best30Share.almostDone"), duration: 5000 },
            { target: 95, text: t("page.best30Share.finalizing"), duration: 12000 },
        ];

        const startTime = Date.now();

        const timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            let currentStage = 0;
            let totalDuration = 0;

            for (let i = 0; i < stages.length; i++) {
                totalDuration += stages[i].duration;
                if (elapsed < totalDuration) {
                    currentStage = i;
                    break;
                }
                if (i === stages.length - 1) {
                    currentStage = i;
                }
            }

            const stage = stages[currentStage];
            const prevTarget = currentStage > 0 ? stages[currentStage - 1].target : 0;
            const prevDuration = stages.slice(0, currentStage).reduce((s, st) => s + st.duration, 0);
            const stageElapsed = elapsed - prevDuration;
            const stageProgress = Math.min(stageElapsed / stage.duration, 1);
            // Ease out cubic for very smooth slow-down
            const eased = 1 - Math.pow(1 - stageProgress, 3);

            let currentProgress = prevTarget + (stage.target - prevTarget) * eased;
            currentProgress = Math.min(currentProgress, 95);

            setProgress(Math.round(currentProgress));
            setProgressText(stage.text);
        }, 80);

        return () => clearInterval(timer);
    }, [isGenerating, t]);

    const generateImage = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setIsGenerating(true);
        setError(null);
        try {
            await drawBest30Canvas(canvas, entries, average, gameId, serverLabel, getMusicThumbnailUrl, themeColor, avatarUrl, nickname, uploadTime, {
                referenceHint: t("page.best30Share.referenceHint"),
                footerSource: t("page.best30Share.footerSource"),
                scanQr: t("page.best30Share.scanQr"),
                dataTime: (time) => t("common.data.dataTime", { time }),
            });
        } catch (err) {
            console.error("Image generation failed:", err);
            setError(t("page.best30Share.generateFailed"));
        } finally {
            setIsGenerating(false);
        }
    }, [entries, average, gameId, serverLabel, getMusicThumbnailUrl, themeColor, avatarUrl, nickname, uploadTime, t]);

    // Trigger image generation when canvas is ready (after Modal mounts it)
    useEffect(() => {
        if (canvasReady) {
            generateImage();
        }
    }, [canvasReady, generateImage]);

    const handleDownload = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setSaveSuccess(false);
        const link = document.createElement("a");
        link.download = `best30_${gameId}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();

        setSaveSuccess(true);
        if (saveResetTimerRef.current) {
            window.clearTimeout(saveResetTimerRef.current);
        }
        saveResetTimerRef.current = window.setTimeout(() => {
            setSaveSuccess(false);
        }, 1800);
    }, [gameId]);

    const handleCopy = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setCopied(false);
        try {
            await copyImageBlob(canvasToPngBlob(canvas));
            setCopied(true);
            if (copyResetTimerRef.current) {
                window.clearTimeout(copyResetTimerRef.current);
            }
            copyResetTimerRef.current = window.setTimeout(() => {
                setCopied(false);
            }, 1800);
        } catch {
            alert(t("page.best30Share.copyFailed"));
        }
    }, [t]);

    const headerActions = (
        <>
            <IconButton
                icon={copied ? mdCheck : mdContentCopy}
                onClick={handleCopy}
                disabled={isGenerating}
                label={t("page.best30Share.copyImage")}
                title={copied ? t("page.best30Share.copied") : t("page.best30Share.copyImage")}
                className={copied ? "text-primary" : undefined}
            />
            <IconButton
                icon={saveSuccess ? mdCheck : mdDownload}
                onClick={handleDownload}
                disabled={isGenerating}
                label={t("page.best30Share.saveImage")}
                title={saveSuccess ? t("page.best30Share.saved") : t("page.best30Share.saveImage")}
                className={saveSuccess ? "text-primary" : undefined}
            />
        </>
    );

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={t("page.best30Share.title")}
            size="xl"
            syncHistory={false}
            headerActions={headerActions}
        >
            <div className="space-y-4">
                <div className="relative rounded-md3-lg bg-surface-container p-4">
                    <div className="overflow-auto max-h-[68vh] flex items-start justify-center">
                        {isGenerating && (
                            <div className="absolute inset-0 flex items-center justify-center bg-surface-container/85 z-10 rounded-md3-lg">
                                <div className="flex flex-col items-center gap-4 w-64">
                                    <LoadingIndicator size={40} />
                                    <div className="w-full">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-on-surface-variant type-label-m">{progressText}</span>
                                            <span className="text-primary type-label-l">{progress}%</span>
                                        </div>
                                        <LinearProgress value={progress / 100} aria-label={progressText} />
                                    </div>
                                    <span className="text-on-surface-variant type-label-s">{t("page.best30Share.generatingTitle")}</span>
                                </div>
                            </div>
                        )}
                        {error && (
                            <div className="absolute inset-0 flex items-center justify-center bg-surface-container/85 z-10 rounded-md3-lg">
                                <div className="text-center">
                                    <p className="text-error type-body-m mb-2">{error}</p>
                                    <Button variant="tonal" size="xs" icon={mdRefresh} onClick={generateImage}>
                                        {t("page.best30Share.regenerate")}
                                    </Button>
                                </div>
                            </div>
                        )}
                        <canvas
                            ref={canvasCallbackRef}
                            className="rounded-md3-sm shadow-elev-2"
                            style={{ maxWidth: "100%", height: "auto" }}
                        />
                    </div>
                </div>
            </div>
        </Modal>
    );
}
