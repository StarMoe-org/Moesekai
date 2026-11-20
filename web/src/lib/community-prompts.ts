/**
 * Engagement counter and dismissible community/support prompt scheduler.
 *
 * Tracks total page views in browser localStorage and selects either:
 * - Milestone sponsorship prompts (starting at 100 views), or
 * - Random frequent-visitor community prompts (QQ feedback group, Bilibili
 *   official channel, official Discord) subject to cooldowns and user opt-out.
 */

export const COMMUNITY_PROMPT_STORAGE_KEY = "moesekai_community_prompt_state_v1";
export const COMMUNITY_PROMPT_UPDATED_EVENT = "moesekai:community-prompt-updated";

export const SPONSOR_VIEW_MILESTONES = [
    100,
    200,
    300,
    500,
    800,
    1000,
    1500,
    2000,
    3000,
    5000,
    8000,
    10000,
] as const;
export const RECURRING_MILESTONE_STEP_AFTER_MAX = 5000;
export const MIN_VIEWS_FOR_RANDOM_PROMPT = 12;
export const RANDOM_TRIGGER_PROBABILITY = 0.25;

export type CommunityPromptId =
    | "qq-feedback"
    | "bilibili-promo"
    | "discord-promo"
    | "sponsor-support";

export interface CommunityPromptState {
    totalViews: number;
    lastPromptAt: number;
    lastPromptViewCount: number;
    lastPromptId: CommunityPromptId | null;
    shownSponsorMilestones: number[];
    dismissedIds: CommunityPromptId[];
    mutedAll: boolean;
}

export interface CommunityPromptSelection {
    promptId: CommunityPromptId;
    milestone?: number;
}

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const VALID_PROMPT_IDS = new Set<CommunityPromptId>([
    "qq-feedback",
    "bilibili-promo",
    "discord-promo",
    "sponsor-support",
]);

const EXCLUDED_ROUTE_RE = /^\/(?:oauth2|leave|blank|internal-healthz|chart-image)(?:\/|$)/;

const RANDOM_PROMPT_WEIGHTS: Record<CommunityPromptId, number> = {
    "qq-feedback": 3,
    "bilibili-promo": 2,
    "discord-promo": 2,
    "sponsor-support": 1,
};

export function defaultCommunityPromptState(): CommunityPromptState {
    return {
        totalViews: 0,
        lastPromptAt: 0,
        lastPromptViewCount: 0,
        lastPromptId: null,
        shownSponsorMilestones: [],
        dismissedIds: [],
        mutedAll: false,
    };
}

function normalizeNonNegativeInt(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : 0;
}

function parseCommunityPromptState(raw: string | null): CommunityPromptState {
    if (!raw) return defaultCommunityPromptState();
    try {
        const parsed = JSON.parse(raw) as Partial<CommunityPromptState> | null;
        if (!parsed || typeof parsed !== "object") return defaultCommunityPromptState();

        const lastPromptId = typeof parsed.lastPromptId === "string" && VALID_PROMPT_IDS.has(parsed.lastPromptId as CommunityPromptId)
            ? (parsed.lastPromptId as CommunityPromptId)
            : null;

        const shownSponsorMilestones = Array.isArray(parsed.shownSponsorMilestones)
            ? Array.from(new Set(parsed.shownSponsorMilestones.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0).map(Math.floor)))
            : [];

        const dismissedIds = Array.isArray(parsed.dismissedIds)
            ? Array.from(new Set(parsed.dismissedIds.filter((v): v is CommunityPromptId => typeof v === "string" && VALID_PROMPT_IDS.has(v as CommunityPromptId))))
            : [];

        return {
            totalViews: normalizeNonNegativeInt(parsed.totalViews),
            lastPromptAt: normalizeNonNegativeInt(parsed.lastPromptAt),
            lastPromptViewCount: normalizeNonNegativeInt(parsed.lastPromptViewCount),
            lastPromptId,
            shownSponsorMilestones,
            dismissedIds,
            mutedAll: Boolean(parsed.mutedAll),
        };
    } catch {
        return defaultCommunityPromptState();
    }
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
    if (storage) return storage;
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

export function readCommunityPromptState(storage?: StorageLike): CommunityPromptState {
    const target = resolveStorage(storage);
    if (!target) return defaultCommunityPromptState();
    try {
        return parseCommunityPromptState(target.getItem(COMMUNITY_PROMPT_STORAGE_KEY));
    } catch {
        return defaultCommunityPromptState();
    }
}

export function writeCommunityPromptState(state: CommunityPromptState, storage?: StorageLike): void {
    const target = resolveStorage(storage);
    if (!target) return;
    try {
        target.setItem(COMMUNITY_PROMPT_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Ignore storage quota or private mode failures.
    }
    if (!storage && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(COMMUNITY_PROMPT_UPDATED_EVENT, { detail: state }));
    }
}

export function isCountableRoute(routePath: string): boolean {
    const normalized = routePath || "/";
    return !EXCLUDED_ROUTE_RE.test(normalized);
}

export function isPromptEligibleRoute(routePath: string): boolean {
    return isCountableRoute(routePath);
}

export function recordPageView(state: CommunityPromptState): CommunityPromptState {
    return {
        ...state,
        totalViews: state.totalViews + 1,
    };
}

function isSponsorPage(routePath: string): boolean {
    return routePath === "/patreon" || routePath.startsWith("/patreon/");
}

export function isSameLocalDay(timestampA: number, timestampB: number): boolean {
    if (timestampA <= 0 || timestampB <= 0) return false;
    const a = new Date(timestampA);
    const b = new Date(timestampB);
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

export function getReachedSponsorMilestones(totalViews: number): number[] {
    const reached: number[] = SPONSOR_VIEW_MILESTONES.filter((milestone) => totalViews >= milestone);
    const maxListed = SPONSOR_VIEW_MILESTONES[SPONSOR_VIEW_MILESTONES.length - 1];
    for (
        let milestone = maxListed + RECURRING_MILESTONE_STEP_AFTER_MAX;
        milestone <= totalViews;
        milestone += RECURRING_MILESTONE_STEP_AFTER_MAX
    ) {
        reached.push(milestone);
    }
    return reached;
}

export function pickCommunityPrompt(
    state: CommunityPromptState,
    options: { routePath: string; now: number; random?: () => number },
): CommunityPromptSelection | null {
    if (state.mutedAll) return null;
    if (!isPromptEligibleRoute(options.routePath)) return null;
    if (isSameLocalDay(state.lastPromptAt, options.now)) return null;

    const milestoneSponsorAllowed = !isSponsorPage(options.routePath);
    const randomSponsorAllowed = milestoneSponsorAllowed && !state.dismissedIds.includes("sponsor-support");

    // 1. Check milestone sponsor prompt (100, 200, 300, 500, 800, 1000, ...).
    if (milestoneSponsorAllowed) {
        const unshownMilestones = getReachedSponsorMilestones(state.totalViews).filter(
            (milestone) => !state.shownSponsorMilestones.includes(milestone),
        );
        if (unshownMilestones.length > 0) {
            return {
                promptId: "sponsor-support",
                milestone: unshownMilestones[unshownMilestones.length - 1],
            };
        }
    }

    // 2. Check frequent-visitor random prompts (at most once per day).
    if (state.totalViews < MIN_VIEWS_FOR_RANDOM_PROMPT) return null;

    const allCandidates: CommunityPromptId[] = ["qq-feedback", "bilibili-promo", "discord-promo"];
    if (randomSponsorAllowed && state.totalViews >= SPONSOR_VIEW_MILESTONES[0]) {
        allCandidates.push("sponsor-support");
    }

    const available = allCandidates.filter((id) => !state.dismissedIds.includes(id));
    if (available.length === 0) return null;

    const random = options.random ?? Math.random;
    if (random() >= RANDOM_TRIGGER_PROBABILITY) return null;

    // Avoid repeating the exact same prompt twice in a row when alternatives exist.
    const pool = available.length > 1 && state.lastPromptId
        ? available.filter((id) => id !== state.lastPromptId)
        : available;

    const totalWeight = pool.reduce((sum, id) => sum + RANDOM_PROMPT_WEIGHTS[id], 0);
    let target = random() * totalWeight;
    for (const id of pool) {
        target -= RANDOM_PROMPT_WEIGHTS[id];
        if (target < 0) {
            return { promptId: id };
        }
    }
    return { promptId: pool[pool.length - 1] };
}

export function markPromptShown(
    state: CommunityPromptState,
    promptId: CommunityPromptId,
    now: number,
): CommunityPromptState {
    const reachedMilestones = promptId === "sponsor-support"
        ? Array.from(new Set([
            ...state.shownSponsorMilestones,
            ...getReachedSponsorMilestones(state.totalViews),
        ]))
        : state.shownSponsorMilestones;

    return {
        ...state,
        lastPromptAt: now,
        lastPromptViewCount: state.totalViews,
        lastPromptId: promptId,
        shownSponsorMilestones: reachedMilestones,
    };
}

export function applyPromptDismissal(
    state: CommunityPromptState,
    promptId: CommunityPromptId,
    options: { permanent?: boolean; muteAll?: boolean } = {},
): CommunityPromptState {
    if (options.muteAll) {
        return {
            ...state,
            mutedAll: true,
        };
    }
    if (options.permanent) {
        return {
            ...state,
            dismissedIds: state.dismissedIds.includes(promptId)
                ? state.dismissedIds
                : [...state.dismissedIds, promptId],
        };
    }
    return state;
}

export function setCommunityPromptsMuted(muted: boolean, storage?: StorageLike): CommunityPromptState {
    const current = readCommunityPromptState(storage);
    const next: CommunityPromptState = {
        ...current,
        mutedAll: muted,
        ...(muted ? {} : { dismissedIds: [] }),
    };
    writeCommunityPromptState(next, storage);
    return next;
}
