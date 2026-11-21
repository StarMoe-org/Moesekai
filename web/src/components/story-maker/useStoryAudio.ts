"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * The story player's sound: one looping BGM, one-shot SEs and one voice at a time, all through
 * HTMLAudioElement at the reader's volume. Sounds that fail to load are skipped silently (a
 * missing asset must not stop the story).
 */
export function useStoryAudio(volume: number, muted: boolean) {
    const bgmRef = useRef<{ url: string; audio: HTMLAudioElement; level: number } | null>(null);
    const voiceRef = useRef<HTMLAudioElement | null>(null);
    const effectsRef = useRef(new Set<HTMLAudioElement>());
    const masterRef = useRef(muted ? 0 : volume);

    useEffect(() => {
        masterRef.current = muted ? 0 : volume;
        const bgm = bgmRef.current;
        if (bgm) bgm.audio.volume = bgm.level * masterRef.current;
        if (voiceRef.current) voiceRef.current.volume = masterRef.current;
    }, [volume, muted]);

    const stopBgm = useCallback(() => {
        const bgm = bgmRef.current;
        if (!bgm) return;
        bgm.audio.pause();
        bgm.audio.removeAttribute("src");
        bgmRef.current = null;
    }, []);

    /** Plays `url` as the BGM at `level` (the same BGM keeps playing; null stops it). */
    const syncBgm = useCallback((url: string | null, level: number) => {
        const current = bgmRef.current;
        if (!url) {
            stopBgm();
            return;
        }
        if (current?.url === url) {
            current.level = level;
            current.audio.volume = level * masterRef.current;
            return;
        }
        stopBgm();
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = level * masterRef.current;
        bgmRef.current = { url, audio, level };
        audio.play().catch(() => undefined);
    }, [stopBgm]);

    const playSe = useCallback((url: string) => {
        const audio = new Audio(url);
        audio.volume = masterRef.current;
        effectsRef.current.add(audio);
        const done = () => effectsRef.current.delete(audio);
        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", done, { once: true });
        audio.play().catch(done);
    }, []);

    const stopVoice = useCallback(() => {
        voiceRef.current?.pause();
        voiceRef.current = null;
    }, []);

    /** Plays a voice line (stopping the one before); settles when it ends or fails. */
    const playVoice = useCallback((url: string): Promise<void> => {
        stopVoice();
        const audio = new Audio(url);
        audio.volume = masterRef.current;
        voiceRef.current = audio;
        return new Promise<void>((resolve) => {
            audio.addEventListener("ended", () => resolve(), { once: true });
            audio.addEventListener("error", () => resolve(), { once: true });
            audio.addEventListener("pause", () => resolve(), { once: true });
            audio.play().catch(() => resolve());
        });
    }, [stopVoice]);

    const stopAll = useCallback(() => {
        stopBgm();
        stopVoice();
        for (const audio of effectsRef.current) audio.pause();
        effectsRef.current.clear();
    }, [stopBgm, stopVoice]);

    useEffect(() => stopAll, [stopAll]);

    return { syncBgm, playSe, playVoice, stopVoice, stopAll };
}

/** A one-shot preview of an asset (the pickers' play button). */
let previewAudio: HTMLAudioElement | null = null;
export function previewStorySound(url: string | null): void {
    previewAudio?.pause();
    previewAudio = null;
    if (!url) return;
    previewAudio = new Audio(url);
    previewAudio.play().catch(() => undefined);
}
