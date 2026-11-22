"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getAccounts, type MoesekaiAccount } from "@/lib/account";
import { signIn, useMoesekaiAccount } from "@/lib/moesekai-account";
import { connectHref } from "@/lib/starmoe-accounts";
import { localizePathForBrowser, stripRouteLocale } from "@/lib/localized-path";
import { useI18n } from "@/contexts/I18nContext";
import { Button, Dialog } from "@/components/md3";
import { mdLink } from "@/components/md3/icons";

/** Set once the visitor answered the prompt (either way); the profile page keeps a reminder banner after that. */
const PROMPT_KEY = "moesekai_oauth_migration_prompt_v1";

function legacyOAuthAccounts(): MoesekaiAccount[] {
    return getAccounts().filter((account) => account.authSource === "oauth2" && !account.starmoeSource);
}

function readAnswered(): boolean {
    try {
        return localStorage.getItem(PROMPT_KEY) !== null;
    } catch {
        return true; // storage blocked: never nag on every page
    }
}

/** SetupGuide's own flag (components/home/SetupGuide.tsx). */
function setupCompleted(): boolean {
    try {
        return localStorage.getItem("moesekai_setup_completed") === "true";
    } catch {
        return true;
    }
}

function writeAnswer(answer: "migrate" | "later"): void {
    try {
        localStorage.setItem(PROMPT_KEY, JSON.stringify({ answer, at: Date.now() }));
    } catch {
        // ignore
    }
}

/**
 * Shown once, on the first visit after this update, to visitors who bound Haruki in the browser (OAuth2): that
 * binding is being retired in favour of StarMoe Connect. "Not now" closes it for good; the profile page keeps a
 * banner with the same action.
 */
export default function OAuthMigrationPrompt() {
    const pathname = usePathname();
    const [count, setCount] = useState(0);

    useEffect(() => {
        const path = stripRouteLocale(pathname || "/");
        // Not while an OAuth2 callback is being handled.
        if (path.startsWith("/oauth2")) return;
        // Not over the home page's first-visit setup guide (SetupGuide); the next page shows it instead.
        if ((path === "/" || path === "") && !setupCompleted()) return;
        if (readAnswered()) return;
        const raf = requestAnimationFrame(() => setCount(legacyOAuthAccounts().length));
        return () => cancelAnimationFrame(raf);
    }, [pathname]);

    if (count === 0) return null;
    return <MigrationDialog count={count} onDone={() => setCount(0)} />;
}

/** Split out so the sign-in check runs only for the visitors who see the prompt. */
function MigrationDialog({ count, onDone }: { count: number; onDone: () => void }) {
    const { t } = useI18n();
    const account = useMoesekaiAccount();
    const signedIn = account.status === "signed-in";

    const later = () => {
        writeAnswer("later");
        onDone();
    };
    const migrate = () => {
        writeAnswer("migrate");
        if (signedIn) {
            window.location.assign(connectHref(localizePathForBrowser("/account")));
        } else {
            // Back on My account, the "connect Haruki" button and banner pick up from here.
            signIn(localizePathForBrowser("/account"));
        }
    };

    return (
        <Dialog
            isOpen
            onClose={later}
            icon={mdLink}
            title={t("common.oauthMigration.title")}
            supportingText={t("common.oauthMigration.body", { count })}
            actions={
                <>
                    <Button variant="text" onClick={later}>
                        {t("common.oauthMigration.later")}
                    </Button>
                    <Button variant="filled" onClick={migrate} disabled={account.status === "loading"}>
                        {signedIn ? t("common.oauthMigration.migrateSignedIn") : t("common.oauthMigration.migrate")}
                    </Button>
                </>
            }
        >
            <ul className="list-disc space-y-1 pl-5 type-body-m text-on-surface-variant">
                <li>{t("common.oauthMigration.pointSync")}</li>
                <li>{t("common.oauthMigration.pointPublic")}</li>
                <li>{t("common.oauthMigration.pointLater")}</li>
            </ul>
        </Dialog>
    );
}
