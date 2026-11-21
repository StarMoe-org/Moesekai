/**
 * Keeps this browser's account list in step with the visitor's StarMoe account.
 *
 * Signed in, the StarMoe account's list is the source of truth: its accounts are added here (their data follows
 * on the next read), accounts it no longer has are dropped if they came from it, and accounts only this browser
 * knows stay until the visitor saves or removes them.
 */
import type { ServerType } from "../account-servers";
import { onStarMoeAccountsLoaded, saveStarMoeAccount, starMoeDataEnabled, type StarMoeAccounts } from "../starmoe-accounts";
import {
    emptyAccount,
    findAccountByGameId,
    getAccounts,
    getActiveAccountId,
    makeAccountId,
    notifyAccountsChanged,
    saveAccounts,
    setActiveAccount,
} from "./store";
import type { MoesekaiAccount } from "./types";

/**
 * Saves an account the visitor added by hand with their StarMoe account (signed in only; tools that create
 * accounts on their own do not call this). Resolves false when signed out or not offered; rejects with
 * code too_many_accounts at the limit.
 */
export async function rememberAccount(server: ServerType, gameId: string): Promise<boolean> {
    if (!starMoeDataEnabled()) return false;
    const existing = findAccountByGameId(server, gameId);
    if (existing?.starmoeSource) return true;
    await saveStarMoeAccount(server, gameId);
    return true;
}

/** Accounts kept only in this browser, which a signed-in visitor can copy to their StarMoe account. */
export function getLocalOnlyAccounts(): MoesekaiAccount[] {
    return getAccounts().filter((account) => !account.starmoeSource);
}

function applyStarMoeAccounts(next: StarMoeAccounts): void {
    if (typeof window === "undefined" || next.status !== "ready") return;
    const byId = new Map(getAccounts().map((account) => [account.id, account]));
    const listed = new Set<string>();
    let changed = false;

    for (const remote of next.accounts) {
        const id = makeAccountId(remote.server, remote.uid);
        listed.add(id);
        const local = byId.get(id);
        if (!local) {
            byId.set(id, emptyAccount(remote.server, remote.uid, { starmoeSource: remote.source, starmoeReadVia: remote.readVia }));
            changed = true;
        } else if (local.starmoeSource !== remote.source || local.starmoeReadVia !== remote.readVia) {
            byId.set(id, { ...local, starmoeSource: remote.source, starmoeReadVia: remote.readVia });
            changed = true;
        }
    }
    for (const [id, account] of byId) {
        if (account.starmoeSource && !listed.has(id)) {
            byId.delete(id);
            changed = true;
        }
    }
    if (!changed) return;

    const merged = [...byId.values()];
    saveAccounts(merged);
    const activeId = getActiveAccountId();
    if (merged.length > 0 && (!activeId || !byId.has(activeId))) {
        setActiveAccount(merged[0].id);
        return;
    }
    notifyAccountsChanged();
}

if (typeof window !== "undefined") {
    onStarMoeAccountsLoaded(applyStarMoeAccounts);
}
