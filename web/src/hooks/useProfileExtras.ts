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
    // A character honor's chosen background style and word (0 or absent: the default).
    honorBackgroundId?: number | null;
    honorWordId?: number | null;
}

export interface ProfileCardState {
    level: number;
    masterRank: number;
    specialTrainingStatus?: string;
    defaultImage?: string;
}

/** One composed part of a WL3 combination frame: which character draws that part. */
export interface ProfileFramePart {
    partPosition: string;
    gameCharacterId: number;
}

/** One entry of userPlayerFrames: the frame the account attached, plus its composed parts. */
export interface ProfilePlayerFrame {
    playerFrameId: number;
    /** The slot it is attached to; every real entry so far says `first`. */
    playerFrameAttachStatus?: string;
    /** WL3 combination frames only: the six parts the player composed, in part order. */
    partsLayout?: ProfileFramePart[];
    editCount?: number;
}

export interface ProfileExtras {
    status: "loading" | "ready" | "error";
    word: string | null;
    honors: ProfileHonor[];
    cards: Map<number, ProfileCardState>;
    /** The frames the account attached, ascending by id; empty when it has none set. */
    playerFrames: ProfilePlayerFrame[];
    musicResults: UserMusicResultsMap | null;
}

// The profile card needs a few keys the account refresh does not store: they are
// large (cards, music results) or only shown here (signature, honors, frame).
export const PROFILE_EXTRAS_KEYS = ["userProfile", "userProfileHonors", "userCards", "userMusics", "userMusicResults"];
/**
 * The same read without the two music tables. The player-frame preview asks for these: signature,
 * the three titles, the owned cards and the attached frame.
 *
 * `userPlayerFrames` is one record per attached frame and, for a WL3 combination frame, carries
 * `partsLayout` (six `partPosition` + `gameCharacterId` pairs) and `editCount`, so the preview can
 * draw the frame the player actually composed.
 *
 * moesekai-api allowlists ?key= (accounts.go allowedSekaiKeys): a key missing there makes the whole
 * request 400, so the backend has to know `userPlayerFrames` before a page asks for it.
 */
export const PROFILE_CORE_KEYS = [
    "userProfile",
    "userProfileHonors",
    "userCards",
    "userPlayerFrames",
];
// Keys my-cards and my-musics already rely on, in case a public API rejects the profile ones.
const FALLBACK_KEYS = ["userCards", "userMusics", "userMusicResults"];
/**
 * Keys a deployment or a game server may legitimately not answer. moesekai-api allowlists `?key=`
 * and treats an entry it does not know as a 404 for the whole request, so these are dropped before
 * the minimal read: losing the frame must not cost the signature and the titles.
 */
const OPTIONAL_KEYS = ["userPlayerFrames"];

const LOADING: ProfileExtras = {
    status: "loading",
    word: null,
    honors: [],
    cards: new Map(),
    playerFrames: [],
    musicResults: null,
};

/** Reads the profile-only extras of one account. Throws what the callers' error codes understand. */
export async function fetchProfileExtras(
    account: MoesekaiAccount,
    keys: readonly string[] = PROFILE_EXTRAS_KEYS,
): Promise<ProfileExtras> {
    let data: Record<string, unknown>;
    try {
        data = await fetchAccountGameData(account, [...keys]);
    } catch {
        // Retry without the keys this deployment may not accept yet, and only then with the subset
        // my-cards / my-musics already depend on.
        const withoutOptional = keys.filter(key => !OPTIONAL_KEYS.includes(key));
        if (withoutOptional.length > 0 && withoutOptional.length < keys.length) {
            try {
                return parseProfileExtras(await fetchAccountGameData(account, withoutOptional));
            } catch {
                // The account itself is unreadable; the minimal read below reports that.
            }
        }
        const fallback = keys.filter(key => FALLBACK_KEYS.includes(key));
        data = await fetchAccountGameData(account, fallback.length > 0 ? fallback : [...keys]);
    }
    return parseProfileExtras(data);
}

export function parseProfileExtras(data: Record<string, unknown>): ProfileExtras {
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

    // The attached frame(s), oldest first, so the caller can take the last one. A record without a
    // usable id is dropped; `partsLayout` is kept only when it names real parts.
    const playerFrames = Array.isArray(data.userPlayerFrames)
        ? (data.userPlayerFrames as ProfilePlayerFrame[])
            .filter((frame) => frame && Number.isFinite(frame.playerFrameId) && frame.playerFrameId > 0)
            .map((frame) => ({
                ...frame,
                partsLayout: Array.isArray(frame.partsLayout)
                    ? frame.partsLayout.filter((part) => (
                        part && typeof part.partPosition === "string"
                        && Number.isFinite(part.gameCharacterId) && part.gameCharacterId > 0
                    ))
                    : undefined,
            }))
            .sort((a, b) => a.playerFrameId - b.playerFrameId)
        : [];

    const hasMusicData = Array.isArray(data.userMusicResults) || Array.isArray(data.userMusics);
    return {
        status: "ready",
        word,
        honors,
        cards,
        playerFrames,
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
            let extras: ProfileExtras;
            try {
                extras = await fetchProfileExtras(account);
            } catch {
                if (!cancelled) setState({ id: account.id, extras: { ...LOADING, status: "error" } });
                return;
            }
            if (!cancelled) setState({ id: account.id, extras });
        };

        void load();
        return () => { cancelled = true; };
    // Refetch per account only; the object itself changes on every background refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId]);

    if (!account || state?.id !== account.id) return LOADING;
    return state.extras;
}
