"use client";

/**
 * One shared view of the saved game accounts for every component: the list and the active account, updated when
 * any page (or another tab, or the StarMoe sync) changes them.
 */
import { useSyncExternalStore } from "react";
import { ACCOUNTS_CHANGED_EVENT, getAccounts, pickActiveAccount, readStoredAccountsRaw } from "./store";
import type { MoesekaiAccount } from "./types";

export interface GameAccountsSnapshot {
    accounts: MoesekaiAccount[];
    active: MoesekaiAccount | null;
}

const EMPTY: GameAccountsSnapshot = { accounts: [], active: null };

let cachedRaw: { accounts: string | null; active: string | null } | null = null;
let cached: GameAccountsSnapshot = EMPTY;

function getSnapshot(): GameAccountsSnapshot {
    const raw = readStoredAccountsRaw();
    if (cachedRaw && cachedRaw.accounts === raw.accounts && cachedRaw.active === raw.active) return cached;
    cachedRaw = raw;
    let accounts: MoesekaiAccount[] = [];
    try {
        const parsed = raw.accounts ? JSON.parse(raw.accounts) : [];
        accounts = Array.isArray(parsed) ? parsed : [];
    } catch {
        accounts = [];
    }
    cached = accounts.length === 0 ? EMPTY : { accounts, active: pickActiveAccount(accounts, raw.active) };
    return cached;
}

function subscribe(listener: () => void): () => void {
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, listener);
    window.addEventListener("storage", listener);
    // Runs the one-time migration from older single-account keys outside of rendering; it fires the change event.
    getAccounts();
    return () => {
        window.removeEventListener(ACCOUNTS_CHANGED_EVENT, listener);
        window.removeEventListener("storage", listener);
    };
}

export function useGameAccounts(): GameAccountsSnapshot {
    return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
