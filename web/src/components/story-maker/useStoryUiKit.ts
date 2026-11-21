"use client";
import { useEffect, useState } from "react";
import { loadStoryUiKit, type StoryUiKit } from "@/lib/storyMaker/uiKit";

export type StoryUiKitStatus = "idle" | "loading" | "ready" | "fallback";

export interface UseStoryUiKitResult {
    kit: StoryUiKit | null;
    status: StoryUiKitStatus;
}

interface LoadedKitEntry {
    region: string;
    kit: StoryUiKit | null;
    status: "ready" | "fallback";
}

/**
 * Loads the in-game scenario UI kit sprites for `region` via sse-web's `kit-worker.js`,
 * releasing its cached Blob URL reference cleanly on unmount or region change.
 */
export function useStoryUiKit(region: string | null | undefined): UseStoryUiKitResult {
    const [entry, setEntry] = useState<LoadedKitEntry | null>(null);

    useEffect(() => {
        if (!region) return;
        const controller = new AbortController();
        let acquired: StoryUiKit | null = null;
        let disposed = false;

        void loadStoryUiKit(region, controller.signal).then((kit) => {
            if (disposed || controller.signal.aborted) {
                kit?.release();
                return;
            }
            acquired = kit;
            setEntry({
                region,
                kit,
                status: kit && kit.fromGameKit ? "ready" : "fallback",
            });
        }).catch(() => {
            if (disposed || controller.signal.aborted) return;
            setEntry({ region, kit: null, status: "fallback" });
        });

        return () => {
            disposed = true;
            controller.abort();
            acquired?.release();
            acquired = null;
        };
    }, [region]);

    if (!region) {
        return { kit: null, status: "idle" };
    }
    if (!entry || entry.region !== region) {
        return { kit: null, status: "loading" };
    }
    return { kit: entry.kit, status: entry.status };
}
