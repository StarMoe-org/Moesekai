"use client";

import { useEffect, useState } from "react";
import { fetchAccountGameData, type MoesekaiAccount } from "@/lib/account";
import { parseUserMusicResults, type UserMusicResultsMap } from "@/lib/user-music-results";

/** One equipped honor slot from userProfileHonors; seq 1 is the main honor. */
export interface ProfileHonor {
    seq: number;
    profileHonorType: string;
    honorId: number;
    honorLevel?: number;
    bondsHonorViewType?: string;
    bondsHonorWordId?: number;
}

export interface ProfileCardState {
    level: number;
    masterRank: number;
    specialTrainingStatus?: string;
    defaultImage?: string;
}

export interface ProfileExtras {
    status: "loading" | "ready" | "error";
    word: string | null;
    honors: ProfileHonor[];
    cards: Map<number, ProfileCardState>;
    musicResults: UserMusicResultsMap | null;
}

// The profile card needs a few keys the account refresh does not store: they are
// large (cards, music results) or only shown here (signature, honors).
const PROFILE_KEYS = ["userProfile", "userProfileHonors", "userCards", "userMusics", "userMusicResults"];
// Keys my-cards and my-musics already rely on, in case a public API rejects the profile ones.
const FALLBACK_KEYS = ["userCards", "userMusics", "userMusicResults"];

const LOADING: ProfileExtras = { status: "loading", word: null, honors: [], cards: new Map(), musicResults: null };

function toExtras(data: Record<string, unknown>): ProfileExtras {
    const profile = data.userProfile as { word?: unknown } | undefined;
    const word = typeof profile?.word === "string" && profile.word.trim() ? profile.word.trim() : null;

    const honors = Array.isArray(data.userProfileHonors)
        ? (data.userProfileHonors as ProfileHonor[])
            .filter((honor) => honor && typeof honor.honorId === "number" && honor.honorId > 0)
            .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
            .slice(0, 3)
        : [];

    const cards = new Map<number, ProfileCardState>();
    if (Array.isArray(data.userCards)) {
        for (const card of data.userCards as Array<ProfileCardState & { cardId: number }>) {
            if (typeof card?.cardId !== "number") continue;
            cards.set(card.cardId, {
                level: card.level,
                masterRank: card.masterRank,
                specialTrainingStatus: card.specialTrainingStatus,
                defaultImage: card.defaultImage,
            });
        }
    }

    const hasMusicData = Array.isArray(data.userMusicResults) || Array.isArray(data.userMusics);
    return {
        status: "ready",
        word,
        honors,
        cards,
        musicResults: hasMusicData ? parseUserMusicResults(data) : null,
    };
}

export function useProfileExtras(account: MoesekaiAccount | null): ProfileExtras {
    const [state, setState] = useState<{ id: string; extras: ProfileExtras } | null>(null);
    const accountId = account?.id ?? null;

    useEffect(() => {
        if (!account) return;
        let cancelled = false;

        const load = async () => {
            let data: Record<string, unknown>;
            try {
                data = await fetchAccountGameData(account, PROFILE_KEYS);
            } catch {
                try {
                    data = await fetchAccountGameData(account, FALLBACK_KEYS);
                } catch {
                    if (!cancelled) setState({ id: account.id, extras: { ...LOADING, status: "error" } });
                    return;
                }
            }
            if (!cancelled) setState({ id: account.id, extras: toExtras(data) });
        };

        void load();
        return () => { cancelled = true; };
    // Refetch per account only; the object itself changes on every background refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId]);

    if (!account || state?.id !== account.id) return LOADING;
    return state.extras;
}
