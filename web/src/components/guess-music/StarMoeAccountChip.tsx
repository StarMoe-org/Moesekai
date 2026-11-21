"use client";

/**
 * The /guess-music header's account control. Signed out (the sidebar may be folded away on a phone), it offers
 * sign-in. Signed in, it is about the leaderboard: which game account the player's scores are shown with, picked
 * from their Haruki-verified accounts. Signing out and managing accounts live in the sidebar and on /account.
 *
 * The account is moesekai-api's session (useMoesekaiAccount). When the server has no passport client, or cannot
 * be reached, signing in would lead nowhere, so the chip says sign-in is unavailable instead.
 *
 * Until the legacy browser OAuth2 binding ends (LEGACY_OAUTH_END_DATE), accounts bound that way can still be
 * linked with their token; drop that path with lib/legacy-oauth.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import PassportAvatar from "@/components/account/PassportAvatar";
import { gameAccountName } from "@/components/account/GameAccountList";
import { ServerRegionIcon } from "@/components/common/ServerRegion";
import { Button, Chip, Icon, Menu, Snackbar, type MenuItemDef } from "@/components/md3";
import { mdAccountCircle, mdKeyboardArrowDown, mdLink, mdLinkOff, mdLogin, mdManageAccounts, mdVerified } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useStarMoeAccountSync } from "@/hooks/useStarMoeAccountSync";
import { isValidServer, updateAccount, type MoesekaiAccount } from "@/lib/account";
import { useGameAccounts } from "@/lib/account/hooks";
import { refreshOAuthToken } from "@/lib/legacy-oauth";
import { DailyApiError, createDailyApi, type DailyGameAccount } from "@/lib/guess-music/daily-api";
import { markSignedOut, signIn, useMoesekaiAccount } from "@/lib/moesekai-account";
import { connectHref } from "@/lib/starmoe-accounts";

/** A legacy OAuth2 account whose token can still prove it is the player's. */
function hasLegacyToken(account: MoesekaiAccount): boolean {
    return account.authSource === "oauth2" && Boolean(account.oauthToken?.accessToken) && account.authError !== "reauth_required";
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

function ServerTrailing({ server }: { server: string }) {
    return isValidServer(server) ? <ServerRegionIcon server={server} size={18} /> : <span className="type-label-s">{server.toUpperCase()}</span>;
}

export default function StarMoeAccountChip() {
    const { t } = useI18n();
    const account = useMoesekaiAccount();
    // Brings the verified accounts (and the Haruki connection state) the link menu offers.
    const saved = useStarMoeAccountSync();
    const { accounts } = useGameAccounts();
    // A 401 from the account calls means the session is gone: the chip turns back into "sign in".
    const api = useMemo(() => createDailyApi({ onUnauthorized: markSignedOut }), []);
    const [me, setMe] = useState<{ userId: string; game: DailyGameAccount | null } | null>(null);
    const [meVersion, reloadMe] = useReducer((value: number) => value + 1, 0);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const closeToast = useCallback(() => setToast(null), []);
    const userId = account.user?.id ?? null;

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

    // Verified accounts come from Haruki through StarMoe Connect; legacy-bound ones are offered until that ends.
    const verified = useMemo(() => accounts.filter((a) => a.starmoeSource === "verified"), [accounts]);
    const legacy = useMemo(
        () => accounts.filter((a) => hasLegacyToken(a) && !verified.some((v) => v.server === a.server && v.gameId === a.gameId)),
        [accounts, verified],
    );

    const linkErrorMessage = useCallback((error: unknown, fallbackKey: "common.starmoe.linkFailed" | "common.starmoe.unlinkFailed") => {
        if (error instanceof DailyApiError) {
            if (error.status === 401) return t("common.starmoe.sessionExpired");
            if (error.code === "not_verified") return t("page.account.link.notVerified");
            if (error.code === "haruki_connect_required") return t("page.account.link.connectRequired");
        }
        if (error instanceof Error && (error.message === "OAUTH_REAUTH_REQUIRED" || error.message.startsWith("TOKEN_REFRESH_FAILED_"))) {
            return t("common.starmoe.harukiReauth");
        }
        return fallbackKey === "common.starmoe.linkFailed" ? t("common.starmoe.linkFailed") : t("common.starmoe.unlinkFailed");
    }, [t]);

    const linkGame = useCallback(async (gameAccount: MoesekaiAccount) => {
        if (!userId) return;
        setBusy(true);
        try {
            const result = gameAccount.starmoeSource === "verified"
                ? await api.linkVerifiedGame(gameAccount.server, gameAccount.gameId)
                : await api.linkGame(await freshHarukiAccessToken(gameAccount));
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
            label: t("page.account.link.linked", { name: linked.game.name || linked.game.userId }),
            trailing: <ServerTrailing server={linked.game.server} />,
        });
        items.push({ key: "unlink", icon: mdLinkOff, label: t("common.starmoe.unlinkGame"), disabled: busy, onSelect: () => void unlinkGame() });
    } else if (linked) {
        for (const gameAccount of [...verified, ...legacy]) {
            items.push({
                key: `link-${gameAccount.id}`,
                icon: mdLink,
                label: t("common.starmoe.linkGame", { name: gameAccountName(gameAccount) }),
                trailing: <ServerTrailing server={gameAccount.server} />,
                disabled: busy,
                onSelect: () => void linkGame(gameAccount),
            });
        }
        if (verified.length === 0 && saved.haruki !== "active") {
            items.push({
                key: "connect",
                icon: mdLink,
                label: saved.haruki === "needs_reconnect" ? t("page.account.link.reconnectToLink") : t("page.account.link.connectToLink"),
                dividerBefore: items.length > 0,
                onSelect: () => window.location.assign(connectHref()),
            });
        } else if (verified.length === 0 && legacy.length === 0) {
            items.push({ key: "none", icon: mdLink, label: t("page.account.link.noVerified"), disabled: true });
        }
    }
    items.push({ key: "manage", icon: mdManageAccounts, label: t("page.account.title"), href: "/account", dividerBefore: items.length > 0 });

    return (
        <>
            <Menu
                align="end"
                items={items}
                anchor={(anchorProps) => (
                    <Chip
                        {...anchorProps}
                        variant="assist"
                        avatar={<PassportAvatar user={signedInUser} />}
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
