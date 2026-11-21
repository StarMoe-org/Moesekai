"use client";

/**
 * Lightweight module-level store for /api/community/me and unread notifications.
 * Uses useSyncExternalStore without adding to global React Context providers,
 * and stays synchronized with StarMoe Passport account status via useMoesekaiAccount.
 */

import { useEffect, useSyncExternalStore } from "react";
import { useMoesekaiAccount } from "./moesekai-account";
import { useStarMoeAccounts } from "./starmoe-accounts";
import {
    fetchCommunityMe,
    isCommunityApiError,
    updateCommunityPreferences,
    type UpdateCommunityPreferencesInput,
} from "./community-api";
import type { CommunityMode, CommunityProfile } from "@/types/community";

export type CommunitySessionStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface CommunitySessionState {
    status: CommunitySessionStatus;
    authenticated: boolean;
    profile: CommunityProfile | null;
    unreadNotifications: number;
    communityMode: CommunityMode;
    turnstileSiteKey: string;
    turnstileRequired: boolean;
    canManageMods: boolean;
    blockedSubs: string[];
}

const INITIAL_STATE: CommunitySessionState = {
    status: "idle",
    authenticated: false,
    profile: null,
    unreadNotifications: 0,
    communityMode: "normal",
    turnstileSiteKey: "",
    turnstileRequired: false,
    canManageMods: false,
    blockedSubs: [],
};

const REFRESH_INTERVAL_MS = 60_000;

let state: CommunitySessionState = INITIAL_STATE;
let inFlight: Promise<CommunitySessionState> | null = null;
let lastLoadAt = 0;
let lastAuthKey = "";
const listeners = new Set<() => void>();

function emit(next: CommunitySessionState): void {
    state = next;
    listeners.forEach((listener) => listener());
}

export function getCommunitySession(): CommunitySessionState {
    return state;
}

function getServerSnapshot(): CommunitySessionState {
    return INITIAL_STATE;
}

export function refreshCommunitySession(force = false): Promise<CommunitySessionState> {
    if (typeof window === "undefined") return Promise.resolve(INITIAL_STATE);
    if (!force && state.status === "ready" && Date.now() - lastLoadAt < REFRESH_INTERVAL_MS) {
        return Promise.resolve(state);
    }
    if (inFlight) return inFlight;

    if (state.status === "idle") {
        emit({ ...state, status: "loading" });
    }

    inFlight = fetchCommunityMe()
        .then((res) => {
            lastLoadAt = Date.now();
            const turnstileSiteKey =
                typeof res.turnstile_site_key === "string" ? res.turnstile_site_key : "";
            const turnstileRequired =
                typeof res.turnstile_required === "boolean"
                    ? res.turnstile_required
                    : Boolean(turnstileSiteKey);
            const canManageMods =
                typeof res.can_manage_mods === "boolean"
                    ? res.can_manage_mods
                    : res.profile?.role === "admin";
            const next: CommunitySessionState = {
                status: "ready",
                authenticated: Boolean(res.authenticated && res.profile),
                profile: res.profile ?? null,
                unreadNotifications: typeof res.unread_notifications === "number" ? res.unread_notifications : 0,
                communityMode: res.community_mode ?? "normal",
                turnstileSiteKey,
                turnstileRequired,
                canManageMods,
                blockedSubs: Array.isArray(res.blocked_subs) ? res.blocked_subs : [],
            };
            emit(next);
            return next;
        })
        .catch((error: unknown) => {
            lastLoadAt = Date.now();
            if (isCommunityApiError(error) && (error.status === 404 || error.status === 503)) {
                const next: CommunitySessionState = {
                    ...state,
                    status: "unavailable",
                    authenticated: false,
                    profile: null,
                    unreadNotifications: 0,
                    turnstileRequired: false,
                    canManageMods: false,
                };
                emit(next);
                return next;
            }
            const next: CommunitySessionState = {
                ...state,
                status: state.status === "ready" ? "ready" : "error",
            };
            emit(next);
            return next;
        })
        .finally(() => {
            inFlight = null;
        });

    return inFlight;
}

export async function patchCommunitySessionPreferences(
    input: UpdateCommunityPreferencesInput,
): Promise<CommunityProfile> {
    const profile = await updateCommunityPreferences(input);
    emit({
        ...state,
        status: "ready",
        authenticated: true,
        profile,
    });
    return profile;
}

export function acceptCommunityPolicy(): Promise<CommunityProfile> {
    return patchCommunitySessionPreferences({ accept_policy: true });
}

export function setUnreadNotificationsCount(count: number): void {
    const nextCount = Math.max(0, Math.floor(count));
    if (state.unreadNotifications === nextCount) return;
    emit({ ...state, unreadNotifications: nextCount });
}

export function setCommunityModeLocal(mode: CommunityMode): void {
    if (state.communityMode === mode) return;
    emit({ ...state, communityMode: mode });
}

export function updateBlockedSubLocal(sub: string, blocked: boolean): void {
    const current = new Set(state.blockedSubs);
    if (blocked) {
        current.add(sub);
    } else {
        current.delete(sub);
    }
    emit({ ...state, blockedSubs: Array.from(current) });
}

function onWindowFocus(): void {
    if (Date.now() - lastLoadAt >= REFRESH_INTERVAL_MS) {
        void refreshCommunitySession();
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (listeners.size === 1 && typeof window !== "undefined") {
        window.addEventListener("focus", onWindowFocus);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") {
            window.removeEventListener("focus", onWindowFocus);
        }
    };
}

/**
 * Subscribe to the community session store. Automatically syncs when the
 * StarMoe Passport sign-in state changes without polluting global Contexts.
 */
export function useCommunitySession(options?: { eager?: boolean }) {
    const eager = options?.eager ?? true;
    const account = useMoesekaiAccount();
    const starMoeAccounts = useStarMoeAccounts();
    const snapshot = useSyncExternalStore(subscribe, getCommunitySession, getServerSnapshot);

    const authKey =
        account.status === "signed-in"
            ? `in:${account.user.id}`
            : account.status === "signed-out"
              ? "out"
              : account.status;

    useEffect(() => {
        if (!eager) return;
        if (account.status === "loading") return;
        if (lastAuthKey !== authKey) {
            lastAuthKey = authKey;
            void refreshCommunitySession(true);
            return;
        }
        if (snapshot.status === "idle") {
            void refreshCommunitySession();
        }
    }, [eager, account.status, authKey, snapshot.status]);

    return {
        ...snapshot,
        account,
        hasVerifiedConnectAccount:
            starMoeAccounts.haruki === "active" ||
            starMoeAccounts.accounts.some((item) => item.source === "verified") ||
            Boolean(snapshot.profile?.has_verified_haruki),
        refresh: () => refreshCommunitySession(true),
    };
}
