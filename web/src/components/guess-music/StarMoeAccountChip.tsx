"use client";

/**
 * StarMoe pass account chip for the /guess-music header: sign in, or the
 * signed-in user's avatar and name with sign-out and game-account linking.
 *
 * The account is moesekai-api's session (useMoesekaiAccount). When the
 * server has no passport client, or cannot be reached, signing in would lead
 * nowhere, so the chip says sign-in is unavailable instead.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { usePathname } from "next/navigation";

import { ServerRegionIcon } from "@/components/common/ServerRegion";
import { Button, Chip, Icon, Menu, Snackbar, type MenuItemDef } from "@/components/md3";
import { mdAccountCircle, mdKeyboardArrowDown, mdLink, mdLinkOff, mdLogin, mdLogout, mdVerified } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { ACCOUNTS_CHANGED_EVENT, getAccounts, isValidServer, updateAccount, type MoesekaiAccount } from "@/lib/account";
import { stripRouteLocale } from "@/lib/localized-path";
import { refreshOAuthToken } from "@/lib/oauth";
import { DailyApiError, createDailyApi, type DailyGameAccount } from "@/lib/guess-music/daily-api";
import { markSignedOut, signIn, signOut, useMoesekaiAccount, type MoesekaiUser } from "@/lib/moesekai-account";

type GameLink = DailyGameAccount;

/** Accounts bound through Haruki OAuth2 in this browser, whose token can prove game ownership. */
function getLinkableAccounts(): MoesekaiAccount[] {
    return getAccounts().filter((account) => account.authSource === "oauth2" && Boolean(account.oauthToken?.accessToken) && account.authError !== "reauth_required");
}

async function freshHarukiAccessToken(account: MoesekaiAccount): Promise<string> {
    const token = account.oauthToken;
    if (!token?.accessToken) throw new Error("OAUTH_REAUTH_REQUIRED");
    if (token.expiresAt === null || token.expiresAt > Date.now() + 30_000) return token.accessToken;
    if (!token.refreshToken) throw new Error("OAUTH_REAUTH_REQUIRED");
    const refreshed = await refreshOAuthToken(token.refreshToken);
    updateAccount(account.id, {
        oauthToken: {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: refreshed.expiresAt,
            tokenType: refreshed.tokenType,
            scope: refreshed.scope,
        },
        oauthScopes: refreshed.scope,
        authError: null,
    });
    return refreshed.accessToken;
}

function accountDisplayName(account: MoesekaiAccount): string {
    return account.userGamedata?.name || account.nickname || account.gameId;
}

function Avatar({ user }: { user: MoesekaiUser }) {
    if (user.avatar) {
        return <img src={user.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />;
    }
    return (
        <span aria-hidden className="flex h-full w-full items-center justify-center bg-primary type-label-m text-on-primary">
            {Array.from(user.name)[0]?.toUpperCase() ?? "?"}
        </span>
    );
}

function ServerTrailing({ server }: { server: string }) {
    return isValidServer(server) ? <ServerRegionIcon server={server} size={18} /> : <span className="type-label-s">{server.toUpperCase()}</span>;
}

export default function StarMoeAccountChip() {
    const { t } = useI18n();
    const pathname = usePathname();
    const account = useMoesekaiAccount();
    // A 401 from the account calls means the session is gone: the chip turns back into "sign in".
    const api = useMemo(() => createDailyApi({ onUnauthorized: markSignedOut }), []);
    const [me, setMe] = useState<{ userId: string; game: GameLink | null } | null>(null);
    const [meVersion, reloadMe] = useReducer((value: number) => value + 1, 0);
    const [accountsVersion, accountsChanged] = useReducer((value: number) => value + 1, 0);
    const [busy, setBusy] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const closeToast = useCallback(() => setToast(null), []);
    const userId = account.user?.id ?? null;
    const signedIn = account.status === "signed-in";

    useEffect(() => {
        window.addEventListener(ACCOUNTS_CHANGED_EVENT, accountsChanged);
        window.addEventListener("storage", accountsChanged);
        return () => {
            window.removeEventListener(ACCOUNTS_CHANGED_EVENT, accountsChanged);
            window.removeEventListener("storage", accountsChanged);
        };
    }, []);

    useEffect(() => {
        if (!userId) return;
        const controller = new AbortController();
        api.me(controller.signal).then(
            (data) => setMe({ userId, game: data.game ?? null }),
            (error: unknown) => {
                if (controller.signal.aborted) return;
                // The backend may not offer accounts yet; the menu then just omits linking.
                console.warn("[StarMoe] could not load the linked game account", error);
            },
        );
        return () => controller.abort();
    }, [api, userId, meVersion]);

    const linkable = useMemo(
        () => (signedIn && accountsVersion >= 0 ? getLinkableAccounts() : []),
        [signedIn, accountsVersion],
    );

    const linkErrorMessage = useCallback((error: unknown, fallbackKey: "common.starmoe.linkFailed" | "common.starmoe.unlinkFailed") => {
        if (error instanceof DailyApiError && error.status === 401) return t("common.starmoe.sessionExpired");
        if (error instanceof Error && (error.message === "OAUTH_REAUTH_REQUIRED" || error.message.startsWith("TOKEN_REFRESH_FAILED_"))) {
            return t("common.starmoe.harukiReauth");
        }
        return fallbackKey === "common.starmoe.linkFailed" ? t("common.starmoe.linkFailed") : t("common.starmoe.unlinkFailed");
    }, [t]);

    const linkGame = useCallback(async (gameAccount: MoesekaiAccount) => {
        if (!userId) return;
        setBusy(true);
        try {
            const harukiAccessToken = await freshHarukiAccessToken(gameAccount);
            const result = await api.linkGame(harukiAccessToken);
            if (result?.game) {
                setMe({ userId, game: result.game });
                setToast(t("common.starmoe.linkSuccess", { name: result.game.name || result.game.userId }));
            } else {
                reloadMe();
            }
        } catch (error) {
            console.warn("[StarMoe] game account link failed", error);
            setToast(linkErrorMessage(error, "common.starmoe.linkFailed"));
        } finally {
            setBusy(false);
        }
    }, [api, linkErrorMessage, t, userId]);

    const unlinkGame = useCallback(async () => {
        if (!userId) return;
        setBusy(true);
        try {
            await api.unlinkGame();
            setMe({ userId, game: null });
            setToast(t("common.starmoe.unlinkSuccess"));
        } catch (error) {
            console.warn("[StarMoe] game account unlink failed", error);
            setToast(linkErrorMessage(error, "common.starmoe.unlinkFailed"));
        } finally {
            setBusy(false);
        }
    }, [api, linkErrorMessage, t, userId]);

    const handleSignOut = useCallback(() => {
        setSigningOut(true);
        // On success the page navigates away; a failure leaves the session (and the menu) as it was.
        signOut().catch((error: unknown) => {
            console.warn("[StarMoe] sign-out failed", error);
            setToast(t("common.starmoe.signOutFailed"));
            setSigningOut(false);
        });
    }, [t]);

    const snackbar = <Snackbar open={toast !== null} message={toast ?? ""} onClose={closeToast} />;

    if (account.status === "unavailable") {
        return (
            <span className="inline-flex h-8 max-w-full items-center gap-1.5 px-1 type-label-m text-on-surface-variant">
                <Icon path={mdAccountCircle} size={18} />
                <span className="truncate">{t("common.starmoe.unavailable")}</span>
            </span>
        );
    }

    if (account.status === "loading") {
        return <span aria-hidden className="inline-block h-8 w-24 rounded-md3-sm bg-surface-container-high" />;
    }

    if (account.status === "signed-out") {
        return (
            <>
                <Button variant="tonal" size="xs" icon={mdLogin} onClick={() => signIn()} aria-label={t("common.starmoe.signIn")}>
                    <span className="hidden sm:inline">{t("common.starmoe.signIn")}</span>
                    <span className="sm:hidden">{t("common.starmoe.signInShort")}</span>
                </Button>
                {snackbar}
            </>
        );
    }

    const signedInUser = account.user;
    const linked = me && me.userId === signedInUser.id ? me : null;
    const items: MenuItemDef[] = [];
    if (linked?.game) {
        items.push({
            key: "game",
            icon: mdVerified,
            label: t("common.starmoe.linkedGame", { name: linked.game.name || linked.game.userId }),
            trailing: <ServerTrailing server={linked.game.server} />,
        });
        items.push({ key: "unlink", icon: mdLinkOff, label: t("common.starmoe.unlinkGame"), disabled: busy, onSelect: () => void unlinkGame() });
    } else if (linked) {
        if (linkable.length > 0) {
            for (const gameAccount of linkable) {
                items.push({
                    key: `link-${gameAccount.id}`,
                    icon: mdLink,
                    label: t("common.starmoe.linkGame", { name: accountDisplayName(gameAccount) }),
                    trailing: <ServerTrailing server={gameAccount.server} />,
                    disabled: busy,
                    onSelect: () => void linkGame(gameAccount),
                });
            }
        } else {
            items.push({
                key: "authorize",
                icon: mdLink,
                label: t("common.starmoe.authorizeGame"),
                href: `/oauth2/connect/?returnTo=${encodeURIComponent(stripRouteLocale(pathname || "/"))}`,
            });
        }
    }
    items.push({ key: "logout", icon: mdLogout, label: t("common.starmoe.signOut"), dividerBefore: items.length > 0, disabled: signingOut, onSelect: handleSignOut });

    return (
        <>
            <Menu
                align="end"
                items={items}
                anchor={(anchorProps) => (
                    <Chip
                        {...anchorProps}
                        variant="assist"
                        avatar={<Avatar user={signedInUser} />}
                        trailingIcon={mdKeyboardArrowDown}
                        aria-label={t("common.starmoe.accountMenu", { name: signedInUser.name })}
                        title={signedInUser.name}
                    >
                        <span className="block max-w-[6rem] truncate sm:max-w-[10rem]">{signedInUser.name}</span>
                    </Chip>
                )}
            />
            {snackbar}
        </>
    );
}
