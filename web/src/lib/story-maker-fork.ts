import {
    STORY_LIMITS,
    createDraft,
    newStoryId,
    serializeStoryScript,
    storyScriptFileName,
    type StoryDocument,
    type StoryDraft,
} from "@moesekai/story-core";
import type { PlayerLayoutMode } from "@moesekai/story-editor";

export const STORY_STUDIO_DESKTOP_URL = "https://story.pjsk.moe";
export const STORY_STUDIO_DESKTOP_NAME = "MoeSekai Story Studio";

export const STORY_FORK_ATTRIBUTION_STORAGE_KEY = "moesekai:story-fork-attribution:v1";
const MAX_STORED_ATTRIBUTIONS = 200;

export interface StoryForkAttribution {
    sourcePostId: number;
    sourceTitle: string;
    sourceAuthorName: string;
    forkedAt: number;
}

export interface CloneCommunityStoryOptions {
    doc: StoryDocument;
    sourcePostId: number;
    sourceTitle: string;
    sourceAuthorName: string;
    titleSuffix?: string;
}

export interface PrepareClonedStoryDocOptions {
    titleSuffix?: string;
    generateId?: (taken: string[]) => string;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function isValidAttribution(value: unknown): value is StoryForkAttribution {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.sourcePostId === "number"
        && Number.isInteger(candidate.sourcePostId)
        && candidate.sourcePostId > 0
        && typeof candidate.sourceTitle === "string"
        && typeof candidate.sourceAuthorName === "string"
        && typeof candidate.forkedAt === "number"
        && Number.isFinite(candidate.forkedAt)
    );
}

function readAttributionMap(storage: StorageLike | null = defaultStorage()): Record<string, StoryForkAttribution> {
    if (!storage) return {};
    try {
        const raw = storage.getItem(STORY_FORK_ATTRIBUTION_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const clean: Record<string, StoryForkAttribution> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (key && isValidAttribution(value)) {
                clean[key] = value;
            }
        }
        return clean;
    } catch {
        return {};
    }
}

function writeAttributionMap(
    map: Record<string, StoryForkAttribution>,
    storage: StorageLike | null = defaultStorage(),
): void {
    if (!storage) return;
    try {
        const entries = Object.entries(map);
        if (entries.length === 0) {
            storage.removeItem(STORY_FORK_ATTRIBUTION_STORAGE_KEY);
            return;
        }
        entries.sort((a, b) => b[1].forkedAt - a[1].forkedAt);
        const bounded = Object.fromEntries(entries.slice(0, MAX_STORED_ATTRIBUTIONS));
        storage.setItem(STORY_FORK_ATTRIBUTION_STORAGE_KEY, JSON.stringify(bounded));
    } catch {
        // Ignore storage quota or private-mode failures.
    }
}

export function getForkAttribution(
    draftId: string | null | undefined,
    storage?: StorageLike | null,
): StoryForkAttribution | null {
    if (!draftId) return null;
    const map = readAttributionMap(storage);
    return map[draftId] ?? null;
}

export function setForkAttribution(
    draftId: string,
    attribution: StoryForkAttribution,
    storage?: StorageLike | null,
): void {
    if (!draftId || !isValidAttribution(attribution)) return;
    const map = readAttributionMap(storage);
    map[draftId] = {
        sourcePostId: attribution.sourcePostId,
        sourceTitle: attribution.sourceTitle.trim(),
        sourceAuthorName: attribution.sourceAuthorName.trim(),
        forkedAt: attribution.forkedAt,
    };
    writeAttributionMap(map, storage);
}

export function clearForkAttribution(draftId: string, storage?: StorageLike | null): void {
    if (!draftId) return;
    const map = readAttributionMap(storage);
    if (!(draftId in map)) return;
    delete map[draftId];
    writeAttributionMap(map, storage);
}

/**
 * Resolves the initial/synced player layout mode.
 * Community stories default to "theater"; local drafts/imports default to "workspace".
 * Explicit `?layout=theater` or `?layout=workspace` always takes precedence.
 */
export function resolveStoryPlayerLayoutMode(
    layoutParam: string | null | undefined,
    isCommunityStory: boolean,
): PlayerLayoutMode {
    if (layoutParam === "theater") return "theater";
    if (layoutParam === "workspace") return "workspace";
    return isCommunityStory ? "theater" : "workspace";
}

/**
 * Returns the `?layout=` query value to persist when the user switches modes,
 * omitting the parameter when it matches the context's default layout.
 */
export function buildStoryPlayerLayoutQueryValue(
    nextMode: PlayerLayoutMode,
    isCommunityStory: boolean,
): string | null {
    if (isCommunityStory) {
        return nextMode === "workspace" ? "workspace" : null;
    }
    return nextMode === "theater" ? "theater" : null;
}

function clampForkTitle(rawTitle: string, titleSuffix?: string): string {
    const base = rawTitle.trim();
    const suffix = titleSuffix?.trim() ? ` ${titleSuffix.trim()}` : "";
    if (!suffix) {
        return base.slice(0, STORY_LIMITS.title);
    }
    if (base.endsWith(suffix)) {
        return base.slice(0, STORY_LIMITS.title);
    }
    if (!base) {
        return suffix.trim().slice(0, STORY_LIMITS.title);
    }
    const maxBaseLength = Math.max(0, STORY_LIMITS.title - suffix.length);
    if (maxBaseLength === 0) {
        return base.slice(0, STORY_LIMITS.title);
    }
    return `${base.slice(0, maxBaseLength).trimEnd()}${suffix}`;
}

/**
 * Deep-clones a community `StoryDocument` into an isolated remix document:
 * - Fresh document ID via `newStoryId([doc.id], 10)`.
 * - Clamped remix title (optional suffix).
 * - Clears original `meta.summary` and `meta.author` so the creator starts with clean
 *   publish metadata and can receive auto-prefilled fork attribution.
 */
export function prepareClonedCommunityStoryDoc(
    doc: StoryDocument,
    options: PrepareClonedStoryDocOptions = {},
): StoryDocument {
    const cloned = structuredClone(doc);
    const generateId = options.generateId ?? ((taken: string[]) => newStoryId(taken, 10));
    cloned.id = generateId([doc.id]);
    cloned.meta = {
        ...cloned.meta,
        title: clampForkTitle(cloned.meta.title, options.titleSuffix),
        summary: "",
        author: "",
    };
    return cloned;
}

/**
 * Clones a community story into browser-local IndexedDB drafts, intentionally
 * detached from the original author's `PublishedStoryLink` and voice upload batch,
 * while recording local fork attribution for future community publishing.
 */
export async function cloneCommunityStoryToDraft({
    doc,
    sourcePostId,
    sourceTitle,
    sourceAuthorName,
    titleSuffix,
}: CloneCommunityStoryOptions): Promise<StoryDraft> {
    const clonedDoc = prepareClonedCommunityStoryDoc(doc, { titleSuffix });
    const draft = await createDraft(clonedDoc);
    setForkAttribution(draft.id, {
        sourcePostId,
        sourceTitle: sourceTitle.trim() || doc.meta.title.trim(),
        sourceAuthorName: sourceAuthorName.trim(),
        forkedAt: Date.now(),
    });
    return draft;
}

/**
 * Escapes characters that could break or inject into a Markdown link label `[label](url)`.
 */
export function escapeMarkdownLinkLabel(text: string): string {
    return text
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/([\\[\]])/g, "\\$1");
}

/**
 * Formats a safe, localized Markdown attribution blockquote referencing the original post.
 * Template placeholders: `{postLink}`, `{author}`, `{title}`, `{postId}`.
 */
export function formatForkAttributionMarkdown(
    attribution: StoryForkAttribution,
    template: string,
): string {
    const escapedTitle = escapeMarkdownLinkLabel(attribution.sourceTitle) || `#${attribution.sourcePostId}`;
    const postPath = `/community/post/${attribution.sourcePostId}`;
    const postLink = `[${escapedTitle}](${postPath})`;
    const safeAuthor = attribution.sourceAuthorName
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return template
        .replaceAll("{postLink}", postLink)
        .replaceAll("{title}", escapedTitle)
        .replaceAll("{author}", safeAuthor)
        .replaceAll("{postId}", String(attribution.sourcePostId));
}

function ensureMskFilename(raw: string): string {
    const cleaned = raw.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-");
    if (!cleaned) return "story.msk";
    return cleaned.toLowerCase().endsWith(".msk") ? cleaned : `${cleaned}.msk`;
}

/**
 * Serializes a `StoryDocument` into `.msk` script text and triggers a browser file download.
 */
export function downloadStoryAsMsk(
    doc: StoryDocument,
    fallbackFilename?: string,
): { ok: boolean; filename: string } {
    const derivedName = storyScriptFileName(doc);
    const filename = derivedName !== "story.msk"
        ? derivedName
        : fallbackFilename
            ? ensureMskFilename(fallbackFilename)
            : derivedName;

    if (typeof window === "undefined" || typeof document === "undefined") {
        return { ok: false, filename };
    }

    try {
        const scriptText = serializeStoryScript(doc);
        const blob = new Blob([scriptText], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = "noopener";
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
        return { ok: true, filename };
    } catch {
        return { ok: false, filename };
    }
}
