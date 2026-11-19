"use client";

import { useEffect } from "react";
import { useMoesekaiAccount } from "@/lib/moesekai-account";
import { loadStarMoeAccounts, useStarMoeAccounts, type StarMoeAccounts } from "@/lib/starmoe-accounts";

/**
 * Keeps the browser's account list in step with the visitor's StarMoe account on pages that show accounts:
 * once signed in, and again when the tab comes back into view (at most once a minute).
 */
export function useStarMoeAccountSync(): StarMoeAccounts {
    const account = useMoesekaiAccount();
    const saved = useStarMoeAccounts();
    const signedIn = account.status === "signed-in";
    const userId = signedIn ? account.user.id : null;

    useEffect(() => {
        void loadStarMoeAccounts(true).catch((error) => console.warn("Loading StarMoe accounts failed", error));
        if (!userId) return;
        const onVisible = () => {
            if (document.visibilityState === "visible") {
                void loadStarMoeAccounts().catch(() => undefined);
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [userId, account.status]);

    return saved;
}
