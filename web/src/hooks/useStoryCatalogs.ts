"use client";
import { useCallback, useState } from "react";
import type { SseWebRegion } from "@/lib/sseWeb/config";
import { fetchStoryCatalog, type StoryCatalog, type StoryKind } from "@/lib/storyPlayer/episodes";

export type StoryCatalogState =
    | { status: "loading" }
    | { status: "ready"; catalog: StoryCatalog }
    | { status: "error"; message: string };

const LOADING: StoryCatalogState = { status: "loading" };

/**
 * The story player's catalogs of one server, a kind at a time: `request` loads a kind (the
 * catalogs are kept, so asking again costs nothing) and `get` tells where it is; a kind
 * not asked for yet reads as loading.
 */
export function useStoryCatalogs(region: SseWebRegion | null) {
    const [loaded, setLoaded] = useState<Record<string, StoryCatalogState>>({});

    const request = useCallback((kind: StoryKind) => {
        if (!region) return;
        const key = `${region}:${kind}`;
        fetchStoryCatalog(region, kind).then(
            catalog => setLoaded(previous => previous[key]?.status === "ready" ? previous : { ...previous, [key]: { status: "ready", catalog } }),
            (error: unknown) => setLoaded(previous => ({ ...previous, [key]: { status: "error", message: error instanceof Error ? error.message : String(error) } })),
        );
    }, [region]);

    /** Tries a kind that failed again. */
    const retry = useCallback((kind: StoryKind) => {
        if (!region) return;
        const key = `${region}:${kind}`;
        setLoaded(({ [key]: _failed, ...rest }) => rest);
        request(kind);
    }, [region, request]);

    const get = useCallback(
        (kind: StoryKind): StoryCatalogState => (region && loaded[`${region}:${kind}`]) || LOADING,
        [region, loaded],
    );

    return { get, request, retry };
}
