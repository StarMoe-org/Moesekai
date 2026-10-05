import { getExternalLyricsPerformer } from "@/lib/lyrics-performers";
import { CHAR_COLORS } from "@/types/types";

function parseHex(color: string): [number, number, number] {
    const normalized = color.trim().replace(/^#/, "");
    if (/^[\da-f]{3}$/i.test(normalized)) {
        return normalized.split("").map((channel) => Number.parseInt(`${channel}${channel}`, 16)) as [number, number, number];
    }
    if (/^[\da-f]{6}$/i.test(normalized)) {
        return [
            Number.parseInt(normalized.slice(0, 2), 16),
            Number.parseInt(normalized.slice(2, 4), 16),
            Number.parseInt(normalized.slice(4, 6), 16),
        ];
    }
    const rgb = color.match(/^rgba?\(\s*([\d.]+)(%)?\s*,\s*([\d.]+)(%)?\s*,\s*([\d.]+)(%)?/i);
    if (rgb) {
        const channel = (value: string, percent?: string) => Math.round(Number(value) * (percent ? 2.55 : 1));
        return [channel(rgb[1], rgb[2]), channel(rgb[3], rgb[4]), channel(rgb[5], rgb[6])];
    }
    return [0, 0, 0];
}

function channelLuminance(channel: number): number {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: string, background: string): number {
    const [fr, fg, fb] = parseHex(foreground);
    const [br, bg, bb] = parseHex(background);
    const foregroundLuminance = 0.2126 * channelLuminance(fr) + 0.7152 * channelLuminance(fg) + 0.0722 * channelLuminance(fb);
    const backgroundLuminance = 0.2126 * channelLuminance(br) + 0.7152 * channelLuminance(bg) + 0.0722 * channelLuminance(bb);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHex(red: number, green: number, blue: number): string {
    return `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

export function adjustHexForContrast(color: string, background: string, minimumRatio = 4.5): string {
    if (contrastRatio(color, background) >= minimumRatio) return color;
    const source = parseHex(color);
    const backgroundIsLight = contrastRatio("#000000", background) >= contrastRatio("#ffffff", background);
    const target = backgroundIsLight ? [0, 0, 0] : [255, 255, 255];

    for (let step = 1; step <= 20; step += 1) {
        const amount = step / 20;
        const candidate = rgbToHex(
            source[0] + (target[0] - source[0]) * amount,
            source[1] + (target[1] - source[1]) * amount,
            source[2] + (target[2] - source[2]) * amount,
        );
        if (contrastRatio(candidate, background) >= minimumRatio) return candidate;
    }
    return backgroundIsLight ? "#000000" : "#ffffff";
}

export interface LyricsPerformerColors {
    /** The source/masterdata performer color, kept unchanged for content identity. */
    base: string;
    /** A readable content color adjusted against the active MD3 surface. */
    foreground: string;
}

export function getLyricsPerformerColors(characterId: number, background = "#ffffff"): LyricsPerformerColors | null {
    const base = CHAR_COLORS[String(characterId)] ?? getExternalLyricsPerformer(characterId)?.color;
    if (!base) return null;
    return {
        base,
        foreground: adjustHexForContrast(base, background),
    };
}
