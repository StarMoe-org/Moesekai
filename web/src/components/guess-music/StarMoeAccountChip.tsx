"use client";

/**
 * StarMoe pass account chip for the /guess-music header: sign in, or the
 * signed-in user's avatar and name with sign-out and game-account linking.
 *
 * The page renders it in its header and passes on what the daily challenge
 * learned from the backend: when the backend has no StarMoe client, signing
 * in would lead nowhere, so the chip shows the disabled state as well.
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
import { useStarMoeAuth, type StarMoeUser } from "@/lib/starmoe-auth";

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

function Avatar({ user }: { user: StarMoeUser }) {
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

export interface StarMoeAccountChipProps {
    /** The backend's authEnabled from the daily info; undefined until it is known. */
    backendAuthEnabled?: boolean;
}

export default function StarMoeAccountChip({ backendAuthEnabled }: StarMoeAccountChipProps) {
    const { t } = useI18n();
    const pathname = usePathname();
    const auth = useStarMoeAuth();
    const { user, getIdToken, login, logout } = auth;
    // A backend without StarMoe cannot use a sign-in; someone already signed in keeps the menu to sign out.
    const status = backendAuthEnabled === false && auth.status !== "signed-in" ? "disabled" : auth.status;
    const accountsApi = backendAuthEnabled !== false;
    const api = useMemo(() => createDailyApi({ getIdToken }), [getIdToken]);
    const [me, setMe] = useState<{ sub: string; game: GameLink | null } | null>(null);
    const [meVersion, reloadMe] = useReducer((value: number) => value + 1, 0);
    const [accountsVersion, accountsChanged] = useReducer((value: number) => value + 1, 0);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const closeToast = useCallback(() => setToast(null), []);
    const userSub = user?.sub ?? null;

    useEffect(() => {
        window.addEventListener(ACCOUNTS_CHANGED_EVENT, accountsChanged);
        window.addEventListener("storage", accountsChanged);
        return () => {
            window.removeEventListener(ACCOUNTS_CHANGED_EVENT, accountsChanged);
            window.removeEventListener("storage", accountsChanged);
        };
    }, []);

    useEffect(() => {
        if (status !== "signed-in" || !userSub || !accountsApi) return;
        const controller = new AbortController();
        api.me(controller.signal).then(
            (data) => setMe({ sub: userSub, game: data.game ?? null }),
            (error: unknown) => {
                if (controller.signal.aborted) return;
                // The backend may not offer accounts yet; the menu then just omits linking.
                console.warn("[StarMoe] could not load the linked game account", error);
            },
        );
        return () => controller.abort();
    }, [api, status, userSub, meVersion, accountsApi]);

    const linkable = useMemo(
        () => (status === "signed-in" && accountsVersion >= 0 ? getLinkableAccounts() : []),
        [status, accountsVersion],
    );

    const linkErrorMessage = useCallback((error: unknown, fallbackKey: "common.starmoe.linkFailed" | "common.starmoe.unlinkFailed") => {
        if (error instanceof DailyApiError && error.status === 401) return t("common.starmoe.sessionExpired");
        if (error instanceof Error && (error.message === "OAUTH_REAUTH_REQUIRED" || error.message.startsWith("TOKEN_REFRESH_FAILED_"))) {
            return t("common.starmoe.harukiReauth");
        }
        return fallbackKey === "common.starmoe.linkFailed" ? t("common.starmoe.linkFailed") : t("common.starmoe.unlinkFailed");
    }, [t]);

    const linkGame = useCallback(async (account: MoesekaiAccount) => {
        if (!userSub) return;
        setBusy(true);
        try {
            if (!(await getIdToken())) throw new DailyApiError("unauthorized", 401, "");
            const harukiAccessToken = await freshHarukiAccessToken(account);
            const result = await api.linkGame(harukiAccessToken);
            if (result?.game) {
                setMe({ sub: userSub, game: result.game });
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
    }, [api, getIdToken, linkErrorMessage, t, userSub]);

    const unlinkGame = useCallback(async () => {
        if (!userSub) return;
        setBusy(true);
        try {
            if (!(await getIdToken())) throw new DailyApiError("unauthorized", 401, "");
            await api.unlinkGame();
            setMe({ sub: userSub, game: null });
            setToast(t("common.starmoe.unlinkSuccess"));
        } catch (error) {
            console.warn("[StarMoe] game account unlink failed", error);
            setToast(linkErrorMessage(error, "common.starmoe.unlinkFailed"));
        } finally {
            setBusy(false);
        }
    }, [api, getIdToken, linkErrorMessage, t, userSub]);

    const snackbar = <Snackbar open={toast !== null} message={toast ?? ""} onClose={closeToast} />;

    if (status === "disabled") {
        return (
            <span className="inline-flex h-8 max-w-full items-center gap-1.5 px-1 type-label-m text-on-surface-variant">
                <Icon path={mdAccountCircle} size={18} />
                <span className="truncate">{t("common.starmoe.disabled")}</span>
            </span>
        );
    }

    if (status === "loading" || (status === "signed-in" && !user)) {
        return <span aria-hidden className="inline-block h-8 w-24 rounded-md3-sm bg-surface-container-high" />;
    }

    if (status === "signed-out") {
        return (
            <>
                <Button variant="tonal" size="xs" icon={mdLogin} onClick={() => login()} aria-label={t("common.starmoe.signIn")}>
                    <span className="hidden sm:inline">{t("common.starmoe.signIn")}</span>
                    <span className="sm:hidden">{t("common.starmoe.signInShort")}</span>
                </Button>
                {snackbar}
            </>
        );
    }

    const signedInUser = user!;
    const linked = me && me.sub === signedInUser.sub ? me : null;
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
            for (const account of linkable) {
                items.push({
                    key: `link-${account.id}`,
                    icon: mdLink,
                    label: t("common.starmoe.linkGame", { name: accountDisplayName(account) }),
                    trailing: <ServerTrailing server={account.server} />,
                    disabled: busy,
                    onSelect: () => void linkGame(account),
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
    items.push({ key: "logout", icon: mdLogout, label: t("common.starmoe.signOut"), dividerBefore: items.length > 0, onSelect: logout });

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
