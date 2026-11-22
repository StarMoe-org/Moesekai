/**
 * Persists the link between a local Story Maker draft ID and its published Community Story
 * `postId` in browser `localStorage`, so creators can update published stories and attach
 * custom voice tracks seamlessly across sessions.
 */

const STORAGE_KEY = "moesekai.storyMaker.publishedLinks.v1";

export interface PublishedStoryLink {
    postId: number;
    updatedAt: number;
}

function readLinkMap(): Record<string, PublishedStoryLink> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const result: Record<string, PublishedStoryLink> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (
                value &&
                typeof value === "object" &&
                typeof (value as { postId?: unknown }).postId === "number" &&
                Number.isInteger((value as { postId: number }).postId) &&
                (value as { postId: number }).postId > 0
            ) {
                result[key] = {
                    postId: (value as { postId: number }).postId,
                    updatedAt:
                        typeof (value as { updatedAt?: unknown }).updatedAt === "number"
                            ? (value as { updatedAt: number }).updatedAt
                            : Date.now(),
                };
            }
        }
        return result;
    } catch {
        return {};
    }
}

function writeLinkMap(map: Record<string, PublishedStoryLink>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Ignore storage quota or private browsing errors
    }
}

export function getPublishedStoryLink(draftId: string | null | undefined): PublishedStoryLink | null {
    if (!draftId) return null;
    const map = readLinkMap();
    return map[draftId] ?? null;
}

export function setPublishedStoryLink(draftId: string, postId: number): void {
    if (!draftId || !Number.isInteger(postId) || postId <= 0) return;
    const map = readLinkMap();
    map[draftId] = { postId, updatedAt: Date.now() };
    writeLinkMap(map);
}

export function clearPublishedStoryLink(draftId: string): void {
    if (!draftId) return;
    const map = readLinkMap();
    if (!(draftId in map)) return;
    delete map[draftId];
    writeLinkMap(map);
}
