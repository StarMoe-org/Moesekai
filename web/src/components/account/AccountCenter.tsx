"use client";

/**
 * The account entry at the foot of the sidebar, the same on every page.
 *
 * The entry is a capsule: who you are (your StarMoe Passport, or "Sign in with StarMoe") over the game account
 * you are viewing. It opens a floating glass panel above itself, in three bands:
 *   1. the Passport: avatar and name, or a sign-in card in guest mode;
 *   2. the game accounts: pills to switch the one being viewed (the current one in the glass selection), then
 *      "Add" and "Manage";
 *   3. signed in: the Passport account center and sign-out.
 *
 * The last signed-in name and avatar are remembered on this device, so the entry does not flash "Sign in" while
 * the session is being checked.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { usePathname } from "next/navigation";
import AccountAvatar from "@/components/AccountAvatar";
import { ServerRegionIcon } from "@/components/common/ServerRegion";
import { Button, Icon, Snackbar, cn } from "@/components/md3";
import { OverlayParentContext, useOverlay } from "@/components/md3/useOverlay";
import { mdAdd, mdCheck, mdLogin, mdLogout, mdManageAccounts, mdOpenInNew, mdPerson, mdUnfoldMore } from "@/components/md3/icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useCardThumbnail } from "@/hooks/useCardThumbnail";
import { getCachedAvatarUrl, getCharacterIconUrl, getTopCharacterId, setActiveAccount, type MoesekaiAccount } from "@/lib/account";
import { useGameAccounts } from "@/lib/account/hooks";
import { PASSPORT_ACCOUNT_CENTER_URL, signIn, signOut, useMoesekaiAccount, type MoesekaiUser } from "@/lib/moesekai-account";
import { useCommunitySession } from "@/lib/community-session";
import { gameAccountName } from "./GameAccountList";
import PassportAvatar from "./PassportAvatar";

const LAST_USER_KEY = "moesekai_passport_last_user";
/** The panel follows the sidebar pane's width, but never gets narrower than this. */
const PANEL_MIN_WIDTH = 240;

type LastUser = Pick<MoesekaiUser, "name" | "avatar"> & {
    username?: string | null;
    avatarCardId?: number | null;
    avatarCardTrained?: boolean;
};

function readLastUserRaw(): string | null {
    try {
        return localStorage.getItem(LAST_USER_KEY);
    } catch {
        return null;
    }
}

function subscribeNothing(): () => void {
    return () => undefined;
}

function parseLastUser(raw: string | null): LastUser | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<LastUser>;
        return typeof parsed.name === "string"
            ? {
                  name: parsed.name,
                  avatar: typeof parsed.avatar === "string" ? parsed.avatar : null,
                  avatarCardId: typeof parsed.avatarCardId === "number" ? parsed.avatarCardId : null,
                  avatarCardTrained: Boolean(parsed.avatarCardTrained),
              }
            : null;
    } catch {
        return null;
    }
}

function GameAccountImage({ account }: { account: MoesekaiAccount }) {
    const { assetSource } = useTheme();
    const thumbnail = useCardThumbnail(account.avatarCardId ?? null, assetSource);
    const src = thumbnail
        || getCachedAvatarUrl(account.id)
        || getCharacterIconUrl(account.avatarCharacterId || (account.userCharacters ? getTopCharacterId(account.userCharacters) : 21));
    return <Image src={src} alt="" width={40} height={40} className="h-full w-full object-cover" unoptimized />;
}

/** Where the panel sits: above the entry, as wide as the sidebar pane, kept inside the window. */
interface Placement {
    left: number;
    bottom: number;
    width: number;
    maxHeight: number;
}

export default function AccountCenter({ onNavigate }: { onNavigate?: () => void }) {
    const { t } = useI18n();
    const pathname = usePathname();
    const login = useMoesekaiAccount();
    const communitySession = useCommunitySession({ eager: login.status === "signed-in" });
    const { accounts, active } = useGameAccounts();
    const lastUserRaw = useSyncExternalStore(subscribeNothing, readLastUserRaw, () => null);
    const lastUser = useMemo(() => parseLastUser(lastUserRaw), [lastUserRaw]);
    const [open, setOpen] = useState(false);
    const [placement, setPlacement] = useState<Placement | null>(null);
    const [signingOut, setSigningOut] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const anchorRef = useRef<HTMLButtonElement>(null);
    const panelId = useId();

    const close = useCallback(() => {
        setOpen(false);
        anchorRef.current?.focus({ preventScroll: true });
    }, []);
    const { overlayRef: panelRef, overlayContext, onFocusCapture, isTopOverlay } = useOverlay(open, close, { syncHistory: false, modal: false });

    // Remember who signed in last (including card-face avatar), for the entry shown while the next visit checks the session.
    useEffect(() => {
        try {
            if (login.status === "signed-in") {
                const avatarCardId =
                    communitySession.authenticated && communitySession.profile
                        ? (communitySession.profile.avatar_card_id ?? null)
                        : (lastUser?.avatarCardId ?? null);
                const avatarCardTrained =
                    communitySession.authenticated && communitySession.profile
                        ? Boolean(communitySession.profile.avatar_card_trained)
                        : Boolean(lastUser?.avatarCardTrained);
                localStorage.setItem(
                    LAST_USER_KEY,
                    JSON.stringify({
                        name: login.user.name,
                        avatar: login.user.avatar,
                        avatarCardId,
                        avatarCardTrained,
                    }),
                );
            } else if (login.status === "signed-out") {
                localStorage.removeItem(LAST_USER_KEY);
            }
        } catch {
            // storage full or blocked: only the loading entry loses its hint
        }
    }, [login, communitySession.authenticated, communitySession.profile, lastUser?.avatarCardId, lastUser?.avatarCardTrained]);

    // A route change (any link in the panel, or elsewhere) never leaves the panel open.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOpen(false);
    }, [pathname]);

    const place = useCallback(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        // The sidebar pane is the anchor's padded box; the panel lines up with the pane's inner edges.
        const pane = anchor.parentElement?.getBoundingClientRect() ?? anchor.getBoundingClientRect();
        const width = Math.min(Math.max(pane.width - 8, PANEL_MIN_WIDTH), window.innerWidth - 16);
        const left = Math.max(8, Math.min(pane.left + 4, window.innerWidth - width - 8));
        const top = anchor.getBoundingClientRect().top;
        setPlacement({ left, width, bottom: window.innerHeight - top + 8, maxHeight: Math.max(240, top - 16) });
    }, []);

    useLayoutEffect(() => {
        if (!open) return;
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, place]);

    // A press outside the panel and its entry closes it.
    useEffect(() => {
        if (!open) return;
        const onDown = (event: PointerEvent) => {
            if (!isTopOverlay()) return;
            const target = event.target as Node;
            if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open, panelRef, isTopOverlay]);

    const signedIn = login.status === "signed-in";
    const user: LastUser | null = signedIn ? login.user : login.status === "loading" ? lastUser : null;
    const identity = user
        ? user.name
        : login.status === "unavailable"
            ? t("page.account.center.unavailable")
            : login.status === "loading"
                ? ""
                : t("page.account.center.signIn");
    const viewing = active ? gameAccountName(active) : t("page.account.center.noGame");

    function handleSignOut() {
        setSigningOut(true);
        // On success the page navigates away; a failure leaves the session as it was.
        signOut().catch(() => {
            setToast(t("page.account.passport.signOutFailed"));
            setSigningOut(false);
        });
    }

    function navigateAway() {
        setOpen(false);
        onNavigate?.();
    }

    const panel = open && placement && createPortal(
        <OverlayParentContext.Provider value={overlayContext}>
            <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-label={t("page.account.center.menu")}
                onFocusCapture={onFocusCapture}
                className="md3-menu-enter glass-thick fixed z-[300] flex flex-col overflow-hidden rounded-md3-xl text-on-surface"
                style={{ left: placement.left, bottom: placement.bottom, width: placement.width, maxHeight: placement.maxHeight, transformOrigin: "bottom" }}
            >
                {/* 1. Who you are */}
                <section className="shrink-0 p-2">
                    {login.status === "signed-in" && (
                        <div className="flex items-center gap-3 rounded-md3-lg p-2">
                            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/40 ring-offset-2 ring-offset-transparent">
                                <PassportAvatar user={login.user} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate type-title-m text-on-surface">{login.user.name}</span>
                                <span className="block truncate type-body-s text-on-surface-variant">
                                    {login.user.username ? `@${login.user.username}` : t("page.account.center.passport")}
                                </span>
                            </span>
                        </div>
                    )}
                    {login.status === "signed-out" && (
                        <div className="rounded-md3-lg border border-outline-variant/70 p-3">
                            <div className="type-label-m text-on-surface-variant">{t("page.account.center.passport")}</div>
                            <p className="mt-1 type-body-s text-on-surface">{t("page.account.center.signInBody")}</p>
                            <Button className="mt-3" variant="filled" size="s" icon={mdLogin} fullWidth onClick={() => signIn()}>
                                {t("page.account.center.signInAction")}
                            </Button>
                            <p className="mt-2 type-label-s text-on-surface-variant">{t("page.account.center.guestNote")}</p>
                        </div>
                    )}
                    {(login.status === "unavailable" || login.status === "loading") && (
                        <div className="flex items-center gap-3 p-2 type-body-s text-on-surface-variant">
                            <Icon path={mdPerson} size={20} />
                            {login.status === "unavailable" ? t("page.account.center.unavailable") : <span aria-hidden className="h-4 w-24 rounded-md3-xs bg-surface-container-highest" />}
                        </div>
                    )}
                </section>

                <div role="separator" className="mx-4 h-px shrink-0 bg-outline-variant/60" />

                {/* 2. Whose data you look at */}
                <section className="flex min-h-0 flex-col p-2">
                    <div className="flex items-baseline justify-between px-3 pb-1 pt-1">
                        <span className="type-label-m text-on-surface-variant">{t("page.account.center.games")}</span>
                        {accounts.length > 0 && <span className="type-label-s text-on-surface-variant">{accounts.length}</span>}
                    </div>
                    {accounts.length === 0 ? (
                        <p className="px-3 py-2 type-body-s text-on-surface-variant">{t("page.account.center.empty")}</p>
                    ) : (
                        <ul className="min-h-0 space-y-0.5 overflow-y-auto overscroll-contain" role="radiogroup" aria-label={t("page.account.center.games")}>
                            {accounts.map((account) => {
                                const current = account.id === active?.id;
                                return (
                                    <li key={account.id}>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={current}
                                            onClick={() => setActiveAccount(account.id)}
                                            className={cn(
                                                "state-layer focus-ring flex h-12 w-full items-center gap-3 rounded-full pl-1.5 pr-3 text-left [@media(any-pointer:coarse)]:h-14",
                                                current ? "glass-selected text-on-surface" : "text-on-surface-variant",
                                            )}
                                        >
                                            <AccountAvatar account={account} size="md" className="ring-1 ring-outline-variant" />
                                            <span className="min-w-0 flex-1 truncate type-label-l">{gameAccountName(account)}</span>
                                            <ServerRegionIcon server={account.server} size={16} />
                                            <span className="flex w-5 justify-center">{current && <Icon path={mdCheck} size={20} className="text-primary" />}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <div className="mt-2 grid shrink-0 grid-cols-2 gap-2 px-1">
                        <Button variant="tonal" size="s" icon={mdAdd} href="/account?add=1" onClick={navigateAway}>
                            {t("page.account.center.addShort")}
                        </Button>
                        <Button variant="outlined" size="s" icon={mdManageAccounts} href="/account" onClick={navigateAway}>
                            {t("page.account.center.manageShort")}
                        </Button>
                    </div>
                </section>

                {/* 3. The Passport itself */}
                {signedIn && (
                    <>
                        <div role="separator" className="mx-4 h-px shrink-0 bg-outline-variant/60" />
                        <section className="flex shrink-0 items-center justify-between gap-1 p-2">
                            <Button
                                variant="text"
                                size="s"
                                icon={mdOpenInNew}
                                onClick={() => window.open(PASSPORT_ACCOUNT_CENTER_URL, "_blank", "noopener,noreferrer")}
                            >
                                {t("page.account.center.accountCenterShort")}
                            </Button>
                            <Button variant="text" size="s" color="error" icon={mdLogout} disabled={signingOut} onClick={handleSignOut}>
                                {t("page.account.center.signOut")}
                            </Button>
                        </section>
                    </>
                )}
            </div>
        </OverlayParentContext.Provider>,
        document.body,
    );

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                aria-label={t("page.account.center.menu")}
                onClick={() => setOpen((value) => !value)}
                className={cn(
                    "state-layer focus-ring flex w-full items-center gap-3 rounded-full py-1.5 pl-1.5 pr-3 text-left transition-colors duration-200 ease-md3-standard",
                    open && "glass-selected",
                )}
            >
                <span className="relative h-10 w-10 shrink-0">
                    <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-primary-container text-on-primary-container">
                        {user ? <PassportAvatar user={user} /> : active ? <GameAccountImage account={active} /> : <Icon path={mdPerson} size={24} />}
                    </span>
                    {/* Signed in, the game account rides on the Passport avatar. */}
                    {user && active && (
                        <span className="absolute -bottom-1 -right-1 h-5 w-5 overflow-hidden rounded-full ring-2 ring-surface">
                            <GameAccountImage account={active} />
                        </span>
                    )}
                </span>
                <span className="min-w-0 flex-grow">
                    {identity ? (
                        <span className="block truncate type-label-l text-on-surface">{identity}</span>
                    ) : (
                        <span aria-hidden className="block h-4 w-24 rounded-md3-xs bg-surface-container-highest" />
                    )}
                    <span className="flex min-w-0 items-center gap-1 type-body-s text-on-surface-variant">
                        <span className="truncate">{viewing}</span>
                        {active && <ServerRegionIcon server={active.server} size={14} />}
                    </span>
                </span>
                <Icon
                    path={mdUnfoldMore}
                    size={20}
                    className={cn("shrink-0 text-on-surface-variant transition-transform duration-200 ease-md3-standard", open && "rotate-180")}
                />
            </button>
            {panel}
            <Snackbar open={toast !== null} message={toast ?? ""} onClose={() => setToast(null)} />
        </>
    );
}
