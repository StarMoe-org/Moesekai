"use client";

/**
 * My account: the StarMoe Passport (who you are), the Haruki connection (where data comes from), the game
 * accounts (whose data you look at) and this device. See docs/account-system.md.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import HarukiConnectButton from "@/components/HarukiConnectButton";
import AddGameAccountDialog from "@/components/account/AddGameAccountDialog";
import GameAccountList from "@/components/account/GameAccountList";
import PassportAvatar from "@/components/account/PassportAvatar";
import {
    Banner,
    Button,
    CircularProgress,
    Dialog,
    EmptyState,
    Icon,
    PageContainer,
    PageHeader,
    SectionCard,
    Snackbar,
} from "@/components/md3";
import {
    mdAccountCircle,
    mdAdd,
    mdDelete,
    mdDevices,
    mdLink,
    mdLogin,
    mdLogout,
    mdOpenInNew,
    mdPerson,
    mdSync,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useStarMoeAccountSync } from "@/hooks/useStarMoeAccountSync";
import {
    clearAllAccounts,
    refreshGameAccount,
    refreshGameAccounts,
    saveLocalAccountsToPassport,
    type AccountRefreshError,
    type MoesekaiAccount,
} from "@/lib/account";
import { useGameAccounts } from "@/lib/account/hooks";
import { LEGACY_OAUTH_END_DATE, isLegacyOAuthAccount } from "@/lib/legacy-oauth";
import {
    PASSPORT_ACCOUNT_CENTER_URL,
    retryMoesekaiAccount,
    signIn,
    signOut,
    useMoesekaiAccount,
} from "@/lib/moesekai-account";
import { StarMoeApiError, loadStarMoeAccounts } from "@/lib/starmoe-accounts";

export default function AccountClient() {
    const { t, formatDate } = useI18n();
    const searchParams = useSearchParams();
    const login = useMoesekaiAccount();
    const saved = useStarMoeAccountSync();
    const { accounts, active } = useGameAccounts();
    const signedIn = login.status === "signed-in";
    const savedReady = signedIn && saved.status === "ready";

    const [addOpen, setAddOpen] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [savingError, setSavingError] = useState<string | null>(null);
    const [signingOut, setSigningOut] = useState(false);
    const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(() => new Set());
    const [refreshErrors, setRefreshErrors] = useState<ReadonlyMap<string, AccountRefreshError>>(() => new Map());

    // ?add=1 (the sidebar's "Add game account") opens the add dialog once, then leaves the URL clean.
    useEffect(() => {
        if (searchParams.get("add") !== "1") return;
        setAddOpen(true);
        const url = new URL(window.location.href);
        url.searchParams.delete("add");
        window.history.replaceState({}, "", url.toString());
    }, [searchParams]);

    const refreshOne = useCallback(async (account: MoesekaiAccount) => {
        setRefreshing((ids) => new Set(ids).add(account.id));
        const error = await refreshGameAccount(account.id);
        setRefreshing((ids) => {
            const next = new Set(ids);
            next.delete(account.id);
            return next;
        });
        setRefreshErrors((errors) => {
            const next = new Map(errors);
            if (error) next.set(account.id, error);
            else next.delete(account.id);
            return next;
        });
    }, []);

    // Once it is known whether the visitor is signed in (which decides where data is read from), read the
    // accounts that have no data yet; accounts that arrive from the Passport have none.
    const loginKnown = login.status !== "loading";
    useEffect(() => {
        if (loginKnown) void refreshGameAccounts({ onlyMissing: true });
    }, [loginKnown, saved.accounts]);

    const localOnly = useMemo(() => (savedReady ? accounts.filter((account) => !account.starmoeSource) : []), [savedReady, accounts]);
    const legacy = useMemo(() => accounts.filter((account) => isLegacyOAuthAccount(account) && !account.starmoeSource), [accounts]);
    const legacyEnd = formatDate(`${LEGACY_OAUTH_END_DATE}T00:00:00`, { dateStyle: "long" });

    async function handleSaveLocal() {
        setSaving(true);
        setSavingError(null);
        try {
            await saveLocalAccountsToPassport();
            setToast(t("page.account.games.pendingDone"));
        } catch (error) {
            setSavingError(error instanceof StarMoeApiError && error.code === "too_many_accounts"
                ? t("page.account.games.full", { max: saved.maxManual })
                : t("page.account.games.pendingFailed"));
        } finally {
            setSaving(false);
        }
    }

    function handleSignOut() {
        setSigningOut(true);
        signOut().catch(() => {
            setToast(t("page.account.passport.signOutFailed"));
            setSigningOut(false);
        });
    }

    function handleClear() {
        clearAllAccounts();
        setClearOpen(false);
        setRefreshErrors(new Map());
        // Signed in, only this device's cache was cleared: bring the saved accounts back.
        if (signedIn) void loadStarMoeAccounts(true).then(() => refreshGameAccounts({ onlyMissing: true })).catch(() => undefined);
    }

    const harukiStatus = saved.haruki === "active"
        ? (saved.harukiName ? t("page.account.haruki.active", { name: saved.harukiName }) : t("page.account.haruki.activeNoName"))
        : saved.haruki === "needs_reconnect"
            ? t("page.account.haruki.needsReconnect")
            : t("page.account.haruki.notConnected");

    return (
        <MainLayout>
            <PageContainer>
                <PageHeader title={t("page.account.title")} description={t("page.account.description")} />

                <div className="space-y-6 pb-6">
                    {/* Who you are */}
                    <SectionCard icon={mdAccountCircle} title={t("page.account.passport.title")}>
                        {login.status === "loading" && (
                            <div className="flex items-center gap-3" aria-busy>
                                <span className="h-12 w-12 rounded-full bg-surface-container-highest" />
                                <span className="h-4 w-32 rounded-md3-xs bg-surface-container-highest" />
                            </div>
                        )}
                        {login.status === "unavailable" && (
                            <Banner
                                tone="warning"
                                action={
                                    <Button variant="text" size="xs" onClick={() => void retryMoesekaiAccount()}>
                                        {t("page.account.passport.retry")}
                                    </Button>
                                }
                            >
                                {t("page.account.passport.unavailable")}
                            </Banner>
                        )}
                        {login.status === "signed-in" && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                                        <PassportAvatar user={login.user} />
                                    </span>
                                    <div className="min-w-0 flex-1 basis-40">
                                        <div className="truncate type-title-m text-on-surface">{login.user.name}</div>
                                        <div className="truncate type-body-s text-on-surface-variant">
                                            {login.user.username ? `@${login.user.username} · ` : ""}{t("page.account.passport.signedIn")}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <ExternalLink
                                            href={PASSPORT_ACCOUNT_CENTER_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="state-layer focus-ring inline-flex h-8 items-center gap-1.5 rounded-full border border-outline px-3 type-label-l text-primary"
                                        >
                                            <Icon path={mdOpenInNew} size={18} />
                                            {t("page.account.passport.accountCenter")}
                                        </ExternalLink>
                                        <Button variant="text" size="xs" icon={mdLogout} disabled={signingOut} onClick={handleSignOut}>
                                            {t("page.account.passport.signOut")}
                                        </Button>
                                    </div>
                                </div>
                                <p className="type-body-s text-on-surface-variant">{t("page.account.passport.accountCenterHint")}</p>
                            </div>
                        )}
                        {login.status === "signed-out" && (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="type-title-m text-on-surface">{t("page.account.passport.signedOutTitle")}</h3>
                                    <p className="mt-1 type-body-m text-on-surface-variant">{t("page.account.passport.signedOutBody")}</p>
                                </div>
                                <Button variant="filled" icon={mdLogin} onClick={() => signIn()}>
                                    {t("page.account.passport.signIn")}
                                </Button>
                                <div className="rounded-md3-lg bg-surface-container p-4">
                                    <div className="type-title-s text-on-surface">{t("page.account.passport.guestTitle")}</div>
                                    <ul className="mt-2 list-disc space-y-1 pl-5 type-body-s text-on-surface-variant">
                                        <li>{t("page.account.passport.guestDevice")}</li>
                                        <li>{t("page.account.passport.guestPublic")}</li>
                                        <li>{t("page.account.passport.guestFeatures")}</li>
                                    </ul>
                                </div>
                            </div>
                        )}
                    </SectionCard>

                    {/* Where data comes from */}
                    <SectionCard icon={mdLink} title={t("page.account.haruki.title")}>
                        <p className="type-body-m text-on-surface-variant">{t("page.account.haruki.description")}</p>
                        {signedIn ? (
                            <div className="mt-4 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <span className="type-title-s text-on-surface">{harukiStatus}</span>
                                    <HarukiConnectButton variant={saved.haruki === "active" ? "outlined" : "filled"} size="s" />
                                </div>
                                {saved.haruki === "needs_reconnect" && (
                                    <Banner tone="warning">{t("page.account.haruki.needsReconnectBody")}</Banner>
                                )}
                            </div>
                        ) : (
                            <p className="mt-3 type-body-s text-on-surface-variant">{t("page.account.haruki.signInFirst")}</p>
                        )}
                    </SectionCard>

                    {/* Whose data you look at */}
                    <SectionCard
                        icon={mdPerson}
                        title={
                            <>
                                {t("page.account.games.title")}
                                {accounts.length > 0 && <span className="ml-1 type-body-m text-on-surface-variant">({accounts.length})</span>}
                            </>
                        }
                        actions={
                            accounts.length > 0 ? (
                                <Button variant="filled" size="xs" icon={mdAdd} onClick={() => setAddOpen(true)}>
                                    {t("page.account.games.add")}
                                </Button>
                            ) : undefined
                        }
                    >
                        <div className="mb-4 space-y-3 empty:hidden">
                            {localOnly.length > 0 && (
                                <Banner
                                    tone="info"
                                    title={t("page.account.games.pendingTitle", { count: localOnly.length })}
                                    action={
                                        <Button variant="filled" size="xs" icon={saving ? undefined : mdSync} disabled={saving} onClick={() => void handleSaveLocal()}>
                                            {saving && <CircularProgress size={16} strokeWidth={2} />}
                                            {t("page.account.games.pendingAction")}
                                        </Button>
                                    }
                                >
                                    {t("page.account.games.pendingBody")}
                                </Banner>
                            )}
                            {savingError && <Banner tone="error">{savingError}</Banner>}
                            {legacy.length > 0 && (
                                <Banner
                                    tone="warning"
                                    title={t("page.account.games.legacyTitle", { date: legacyEnd })}
                                    action={<HarukiConnectButton variant="filled" size="xs" />}
                                >
                                    {t("page.account.games.legacyBody", { count: legacy.length })}
                                </Banner>
                            )}
                        </div>

                        {accounts.length === 0 ? (
                            <EmptyState
                                className="py-8"
                                icon={mdPerson}
                                title={t("page.account.games.empty")}
                                description={signedIn ? t("page.account.games.emptySignedIn") : t("page.account.games.emptyGuest")}
                                action={
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {login.status === "signed-out" && (
                                            <Button variant="filled" icon={mdLogin} onClick={() => signIn()}>
                                                {t("page.account.games.signIn")}
                                            </Button>
                                        )}
                                        <Button variant={login.status === "signed-out" ? "outlined" : "filled"} icon={mdAdd} onClick={() => setAddOpen(true)}>
                                            {login.status === "signed-out" ? t("page.account.games.addByUid") : t("page.account.games.add")}
                                        </Button>
                                    </div>
                                }
                            />
                        ) : (
                            <GameAccountList
                                accounts={accounts}
                                activeId={active?.id ?? null}
                                signedIn={signedIn}
                                refreshing={refreshing}
                                refreshErrors={refreshErrors}
                                onRefresh={(account) => void refreshOne(account)}
                            />
                        )}
                    </SectionCard>

                    {/* This device */}
                    <SectionCard icon={mdDevices} title={t("page.account.device.title")}>
                        <p className="type-body-m text-on-surface-variant">
                            {signedIn ? t("page.account.device.bodySignedIn") : t("page.account.device.bodyGuest")}
                        </p>
                        <Button className="mt-4" variant="outlined" color="error" icon={mdDelete} disabled={accounts.length === 0} onClick={() => setClearOpen(true)}>
                            {signedIn ? t("page.account.device.clearSignedIn") : t("page.account.device.clearGuest")}
                        </Button>
                        <p className="mt-4 type-body-s text-on-surface-variant">
                            {signedIn ? t("page.account.device.noticeSignedIn") : t("page.account.device.noticeGuest")}
                        </p>
                    </SectionCard>
                </div>
            </PageContainer>

            <AddGameAccountDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={(_id, notice) => notice && setToast(notice)} />

            <Dialog
                isOpen={clearOpen}
                onClose={() => setClearOpen(false)}
                title={signedIn ? t("page.account.device.confirmTitleSignedIn") : t("page.account.device.confirmTitleGuest")}
                icon={mdDelete}
                size="sm"
                supportingText={signedIn ? t("page.account.device.bodySignedIn") : t("page.account.device.bodyGuest")}
                actions={
                    <>
                        <Button variant="text" onClick={() => setClearOpen(false)}>{t("common.action.cancel")}</Button>
                        <Button variant="filled" color="error" onClick={handleClear}>{t("page.account.device.confirm")}</Button>
                    </>
                }
            />

            <Snackbar open={toast !== null} message={toast ?? ""} onClose={() => setToast(null)} />
        </MainLayout>
    );
}
