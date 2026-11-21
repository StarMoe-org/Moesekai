"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchLive2DModels } from "@/lib/live2dViewer/client";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import type { StoryRegion } from "@/types/storyMaker";

export type StoryModelList =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; models: Live2DModel[] };

/** A server's Live2D models (its story library's `models.json`), read again on retry. */
export function useStoryModels(region: StoryRegion | null) {
    const [result, setResult] = useState<{ key: string; list: StoryModelList } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const key = region ? `${region}|${attempt}` : null;
    useEffect(() => {
        if (!region || !key) return;
        const controller = new AbortController();
        fetchLive2DModels(region, controller.signal).then(
            models => setResult({ key, list: { status: "ready", models } }),
            (error: unknown) => {
                if (!controller.signal.aborted) setResult({ key, list: { status: "error", message: error instanceof Error ? error.message : String(error) } });
            },
        );
        return () => controller.abort();
    }, [region, key]);
    const retry = useCallback(() => setAttempt(value => value + 1), []);
    const list: StoryModelList = result && result.key === key ? result.list : { status: "loading" };
    return { list, models: list.status === "ready" ? list.models : null, retry };
}
