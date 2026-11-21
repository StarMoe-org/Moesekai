"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "@/components/LocalizedLink";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import AccountAvatar from "@/components/AccountAvatar";
import ProfileHeroCard from "@/components/profile/ProfileHeroCard";
import MusicClearStatus from "@/components/profile/MusicClearStatus";
import CharacterRankGrid from "@/components/profile/CharacterRankGrid";
import ChallengeStageChart from "@/components/profile/ChallengeStageChart";
import BondsRankTable from "@/components/profile/BondsRankTable";
import PowerBonusDetail from "@/components/profile/PowerBonusDetail";
import { useProfileExtras } from "@/hooks/useProfileExtras";
import { fetchRealtimeRankingMasterData } from "@/lib/realtime-ranking-api";
import type { RealtimeRankingMasterData } from "@/types/realtime-ranking";
import {
    getAccounts,
    getActiveAccount,
    setActiveAccount,
    createAccount,
    removeAccount,
    updateAccount,
    clearAllAccounts,
    verifyHarukiApi,
    getTopCharacterId,
    getLeaderCardId,
    rememberAccount,
    refreshGameAccount,
    refreshGameAccounts,
    ACCOUNTS_CHANGED_EVENT,
    type MoesekaiAccount,
    type ServerType,
} from "@/lib/account";
import { disconnectOAuthAccount } from "@/lib/legacy-oauth";
import HarukiConnectButton from "@/components/HarukiConnectButton";
import { useStarMoeAccountSync } from "@/hooks/useStarMoeAccountSync";
import { signIn, useMoesekaiAccount } from "@/lib/moesekai-account";
import { importStarMoeAccounts, loadStarMoeAccounts, StarMoeApiError } from "@/lib/starmoe-accounts";
import { ServerPicker } from "@/components/common/ServerPicker";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import {
    Banner,
    Button,
    CircularProgress,
    EmptyState,
    Icon,
    IconButton,
    LoadingState,
    PageContainer,
    PageHeader,
    SectionCard,
    TextField,
    cn,
} from "@/components/md3";
import {
    mdAdd,
    mdBuild,
    mdCalculate,
    mdChevronRight,
    mdDelete,
    mdLayers,
    mdPerson,
    mdStyle,
    mdSync,
    mdWarning,
} from "@/components/md3/icons";

export default function ProfileClient() {
    const { t, formatDate } = useI18n();
    const searchParams = useSearchParams();
    const oauthStatus = searchParams.get("oauth");
    const [accounts, setAccounts] = useState<MoesekaiAccount[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    // Add account form
    const [showAddForm, setShowAddForm] = useState(false);
    const [formGameId, setFormGameId] = useState("");
    const [formServer, setFormServer] = useState<ServerType>("jp");
    const [isVerifying, setIsVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [oauthMessage, _setOauthMessage] = useState<string | null>(null);

    // Confirm clear
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // StarMoe account: saved accounts and the Haruki connection (StarMoe Connect).
    const login = useMoesekaiAccount();
    const saved = useStarMoeAccountSync();
    const signedIn = login.status === "signed-in";
    const syncing = signedIn && saved.status === "ready";
    const [importing, setImporting] = useState(false);
    const [importMessage, setImportMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
    // Accounts being re-read by their "resync" button, and the last one that failed.
    const [resyncingIds, setResyncingIds] = useState<ReadonlySet<string>>(() => new Set());
    const [resyncError, setResyncError] = useState<string | null>(null);

    const reload = useCallback(() => {
        const accs = getAccounts();
        setAccounts(accs);
        const active = getActiveAccount();
        setActiveId(active?.id || null);
    }, []);

    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            reload();
            setLoaded(true);
        });
        return () => cancelAnimationFrame(raf);
    }, [reload, searchParams]);

    // Once it is known whether the visitor is signed in (which decides where data is read from), refresh every account.
    const loginKnown = login.status !== "loading";
    useEffect(() => {
        if (loginKnown) refreshAccounts(false);
    }, [loginKnown, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    // Pages elsewhere (and the StarMoe sync) change the list: follow them.
    useEffect(() => {
        window.addEventListener(ACCOUNTS_CHANGED_EVENT, reload);
        return () => window.removeEventListener(ACCOUNTS_CHANGED_EVENT, reload);
    }, [reload]);

    // Accounts that just arrived from the StarMoe account have no data yet.
    useEffect(() => {
        if (syncing) refreshAccounts(true);
    }, [syncing, saved.accounts]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Refreshes account data (uploadTime, name, avatar, etc.); `onlyMissing` skips accounts that have some. Reads of an account already in progress are shared. */
    function refreshAccounts(onlyMissing: boolean) {
        void refreshGameAccounts({ onlyMissing }).then(reload);
    }

    /** The "resync" button: re-reads one account and says so when that fails (the old data stays). */
    async function handleResync(acc: MoesekaiAccount) {
        if (resyncingIds.has(acc.id)) return;
        setResyncingIds((ids) => new Set(ids).add(acc.id));
        setResyncError(null);
        const error = await refreshGameAccount(acc.id);
        setResyncingIds((ids) => {
            const next = new Set(ids);
            next.delete(acc.id);
            return next;
        });
        reload();
        if (error) {
            const label = acc.userGamedata?.name || acc.nickname || acc.gameId;
            const message = error === "OAUTH"
                ? t("common.harukiErrors.oauthRefreshFailed")
                : error === "API_NOT_PUBLIC"
                    ? t("common.harukiErrors.apiNotPublic")
                    : error === "NOT_FOUND"
                        ? t("common.harukiErrors.userNotFound")
                        : t("common.harukiErrors.networkError");
            setResyncError(`${label}: ${message}`);
        }
    }

    const handleAddAccount = useCallback(async () => {
        if (!formGameId.trim()) return;
        setIsVerifying(true);
        setVerifyError(null);

        const result = await verifyHarukiApi(formServer, formGameId.trim());

        if (!result.success) {
            if (result.error === "API_NOT_PUBLIC") {
                setVerifyError(t("common.harukiErrors.apiNotPublic"));
            } else if (result.error === "NOT_FOUND") {
                setVerifyError(t("common.harukiErrors.userNotFound"));
            } else {
                setVerifyError(t("common.harukiErrors.networkError"));
            }
            setIsVerifying(false);
            return;
        }

        const userGamedata = result.userGamedata || null;
        const userDecks = result.userDecks || null;
        const userCharacters = result.userCharacters || null;
        const userChallengeLiveSoloStages = result.userChallengeLiveSoloStages || null;
        const userChallengeLiveSoloResults = result.userChallengeLiveSoloResults || null;
        const userChallengeLiveSoloHighScoreRewards = result.userChallengeLiveSoloHighScoreRewards || null;
        const userBonds = result.userBonds || null;
        const userMaterials = result.userMaterials || null;
        const userAreas = result.userAreas || null;
        const userMysekaiFixtureGameCharacterPerformanceBonuses = result.userMysekaiFixtureGameCharacterPerformanceBonuses || null;
        const userMysekaiGates = result.userMysekaiGates || null;
        const uploadTime = result.uploadTime || null;

        // Resolve the leader card ID.
        const avatarCardId = getLeaderCardId(userGamedata, userDecks);
        const nickname = userGamedata?.name || "";
        const avatarCharacterId = userCharacters && userCharacters.length > 0
            ? getTopCharacterId(userCharacters)
            : null;

        // Create the account and populate extended fields.
        const account = createAccount(formGameId.trim(), formServer, nickname, avatarCharacterId, userCharacters, true);
        updateAccount(account.id, {
            userCharacters,
            userChallengeLiveSoloStages,
            userChallengeLiveSoloResults,
            userChallengeLiveSoloHighScoreRewards,
            userBonds,
            userMaterials,
            userAreas,
            userMysekaiFixtureGameCharacterPerformanceBonuses,
            userMysekaiGates,
            userGamedata,
            userDecks,
            uploadTime,
            avatarCardId,
            avatarCharacterId,
        });
        try {
            await rememberAccount(formServer, formGameId.trim());
        } catch (err) {
            // Kept on this device; the StarMoe account is full or could not be reached.
            setVerifyError(err instanceof StarMoeApiError && err.code === "too_many_accounts"
                ? t("common.account.starmoeAccountsFull")
                : t("common.account.starmoeSaveFailed"));
            setIsVerifying(false);
            reload();
            return;
        }

        setFormGameId("");
        setFormServer("jp");
        setShowAddForm(false);
        setIsVerifying(false);
        reload();
    }, [formGameId, formServer, reload, t]);

    const handleSetActive = useCallback((id: string) => {
        setActiveAccount(id);
        setActiveId(id);
    }, []);

    const handleDelete = useCallback((id: string) => {
        void disconnectOAuthAccount(id).catch(() => {
            // Ignore disconnect failures; local account deletion should still succeed.
        }).finally(() => {
            removeAccount(id);
            setDeleteConfirmId(null);
            reload();
        });
    }, [reload]);

    const handleClearAll = useCallback(() => {
        clearAllAccounts();
        setShowClearConfirm(false);
        reload();
        // Signed in, only this device's cache was cleared: bring the saved accounts back.
        if (signedIn) void loadStarMoeAccounts(true).then(() => refreshAccounts(true)).catch(() => undefined);
    }, [reload, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    const localOnly = useMemo(() => (syncing ? accounts.filter((acc) => !acc.starmoeSource) : []), [syncing, accounts]);
    const legacyOAuth = accounts.filter((acc) => acc.authSource === "oauth2" && !acc.starmoeSource);
    const handleImport = useCallback(async () => {
        setImporting(true);
        setImportMessage(null);
        try {
            await importStarMoeAccounts(localOnly.map((acc) => ({ server: acc.server, uid: acc.gameId })));
            setImportMessage({ tone: "info", text: t("page.profile.importDone") });
        } catch (err) {
            setImportMessage({
                tone: "error",
                text: err instanceof StarMoeApiError && err.code === "too_many_accounts"
                    ? t("common.account.starmoeAccountsFull")
                    : t("page.profile.importFailed"),
            });
        } finally {
            setImporting(false);
            reload();
        }
    }, [localOnly, reload, t]);

    const activeAccount = accounts.find((acc) => acc.id === activeId) || null;
    const activeCharacterRanks = new Map((activeAccount?.userCharacters || []).map((c) => [c.characterId, c.characterRank]));
    const activeChallengeStageRanks = new Map<number, number>();
    (activeAccount?.userChallengeLiveSoloStages || []).forEach((stage) => {
        const current = activeChallengeStageRanks.get(stage.characterId) || 0;
        if (stage.rank > current) activeChallengeStageRanks.set(stage.characterId, stage.rank);
    });

    // Signature, honors, card states and clear results for the player card.
    const extras = useProfileExtras(activeAccount);
    // Cards and honors come from the account's own server.
    const activeServer = activeAccount?.server ?? null;
    const [master, setMaster] = useState<{ server: ServerType; data: RealtimeRankingMasterData } | null>(null);
    useEffect(() => {
        if (!activeServer) return;
        let cancelled = false;
        void fetchRealtimeRankingMasterData(activeServer).then((data) => {
            if (!cancelled) setMaster({ server: activeServer, data });
        });
        return () => { cancelled = true; };
    }, [activeServer]);
    const masterData = master && master.server === activeServer ? master.data : null;
    const cardMap = useMemo(() => (masterData ? new Map(masterData.cards.map((card) => [card.id, card])) : null), [masterData]);
    const scrollToAccounts = useCallback(() => {
        document.getElementById("profile-accounts")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    if (!loaded) {
        return (
            <MainLayout>
                <PageContainer>
                    <LoadingState label={t("common.state.loading")} />
                </PageContainer>
            </MainLayout>
        );
    }

    const accountBadge = (acc: MoesekaiAccount): string => {
        if (acc.starmoeSource === "verified") return t("common.account.harukiVerified");
        if (acc.starmoeSource === "manual") return t("common.account.savedToStarMoe");
        if (acc.authSource === "oauth2") return "OAuth2";
        return signedIn ? t("common.account.localOnly") : t("common.account.publicApi");
    };

    const toolLinks = [
        { href: "/deck-recommend", icon: mdStyle, titleKey: "page.profile.tools.deckRecommend.title", descriptionKey: "page.profile.tools.deckRecommend.description" },
        { href: "/score-control", icon: mdCalculate, titleKey: "page.profile.tools.scoreControl.title", descriptionKey: "page.profile.tools.scoreControl.description" },
        { href: "/my-cards", icon: mdLayers, titleKey: "page.profile.tools.myCards.title", descriptionKey: "page.profile.tools.myCards.description" },
    ] as const;

    return (
        <MainLayout>
            <PageContainer>
                <PageHeader
                    eyebrow={t("page.profile.badge")}
                    title={t("page.profile.title")}
                    highlight={t("page.profile.titleHighlight")}
                    description={signedIn ? t("page.profile.descriptionSignedIn") : t("page.profile.description")}
                />

                {(oauthMessage || oauthStatus === "success") && (
                    <Banner tone="info" className="mb-6">
                        {oauthMessage || t("common.account.oauthBindSuccess")}
                    </Banner>
                )}

                {activeAccount && (
                    <>
                        <ProfileHeroCard
                            account={activeAccount}
                            extras={extras}
                            master={masterData}
                            cards={cardMap}
                            accountCount={accounts.length}
                            onManageAccounts={scrollToAccounts}
                        />

                        <div className="mb-6">
                            <MusicClearStatus server={activeAccount.server} status={extras.status} results={extras.musicResults} />
                        </div>

                        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <CharacterRankGrid characterRanks={activeCharacterRanks} />
                            <ChallengeStageChart
                                challengeStageRanks={activeChallengeStageRanks}
                                server={activeAccount.server}
                                challengeSoloStages={activeAccount.userChallengeLiveSoloStages || []}
                                challengeSoloResults={activeAccount.userChallengeLiveSoloResults || []}
                                challengeHighScoreRewards={activeAccount.userChallengeLiveSoloHighScoreRewards || []}
                            />
                        </div>

                        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <BondsRankTable
                                userBonds={activeAccount.userBonds || []}
                                userCharacters={activeAccount.userCharacters || []}
                            />
                            <PowerBonusDetail
                                server={activeAccount.server}
                                userAreas={activeAccount.userAreas || []}
                                userCharacters={activeAccount.userCharacters || []}
                                userMysekaiFixtureGameCharacterPerformanceBonuses={activeAccount.userMysekaiFixtureGameCharacterPerformanceBonuses || []}
                                userMysekaiGates={activeAccount.userMysekaiGates || []}
                            />
                        </div>
                    </>
                )}

                {/* Accounts List */}
                <div id="profile-accounts" className="mb-6 scroll-mt-20">
                    <SectionCard
                        icon={mdPerson}
                        title={
                            <>
                                {t("page.profile.boundAccounts")}
                                {accounts.length > 0 && (
                                    <span className="ml-1 type-body-m text-on-surface-variant">({accounts.length})</span>
                                )}
                            </>
                        }
                        actions={
                            <div className="hidden items-center gap-2 sm:flex">
                                <HarukiConnectButton variant="outlined" size="xs" />
                                <Button
                                    variant="filled"
                                    size="xs"
                                    icon={mdAdd}
                                    onClick={() => { setShowAddForm(true); setVerifyError(null); }}
                                >
                                    {t("common.account.addAccount")}
                                </Button>
                            </div>
                        }
                    >
                        {/* On phones the header only has room for the title. */}
                        <div className="mb-4 grid grid-cols-2 gap-2 sm:hidden">
                            <HarukiConnectButton variant="outlined" size="s" />
                            <Button
                                variant="filled"
                                size="s"
                                icon={mdAdd}
                                onClick={() => { setShowAddForm(true); setVerifyError(null); }}
                            >
                                {t("common.account.addAccount")}
                            </Button>
                        </div>
                        <div className="mb-4 space-y-3 empty:hidden">
                            {(login.status === "signed-out" || login.status === "unavailable") && (
                                <Banner
                                    tone="info"
                                    title={t("page.profile.signInTitle")}
                                    action={
                                        <Button variant="filled" size="xs" onClick={() => signIn()}>
                                            {t("page.profile.signInAction")}
                                        </Button>
                                    }
                                >
                                    {t("page.profile.signInDescription")}
                                </Banner>
                            )}
                            {signedIn && saved.haruki === "needs_reconnect" && (
                                <Banner
                                    tone="warning"
                                    title={t("page.profile.harukiReconnectTitle")}
                                    action={<HarukiConnectButton variant="filled" size="xs" />}
                                >
                                    {t("page.profile.harukiReconnectDescription")}
                                </Banner>
                            )}
                            {localOnly.length > 0 && (
                                <Banner
                                    tone="info"
                                    title={t("page.profile.importTitle", { count: localOnly.length })}
                                    action={
                                        <Button variant="filled" size="xs" icon={mdSync} disabled={importing} onClick={() => void handleImport()}>
                                            {importing && <CircularProgress size={16} strokeWidth={2} />}
                                            {t("page.profile.importAction")}
                                        </Button>
                                    }
                                >
                                    {t("page.profile.importDescription")}
                                </Banner>
                            )}
                            {importMessage && <Banner tone={importMessage.tone}>{importMessage.text}</Banner>}
                            {resyncError && <Banner tone="error">{resyncError}</Banner>}
                            {legacyOAuth.length > 0 && (
                                <Banner
                                    tone="warning"
                                    title={t("page.profile.legacyOAuthTitle")}
                                    action={<HarukiConnectButton variant="outlined" size="xs" />}
                                >
                                    {t("page.profile.legacyOAuthDescription")}
                                </Banner>
                            )}
                        </div>
                        {accounts.length === 0 && !showAddForm ? (
                            <EmptyState
                                className="py-10"
                                icon={mdPerson}
                                title={t("common.account.noAccounts")}
                                action={
                                    <Button variant="filled" size="m" onClick={() => { setShowAddForm(true); setVerifyError(null); }}>
                                        {t("common.account.addFirstAccount")}
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="space-y-3">
                                {accounts.map((acc) => {
                                    const isActive = acc.id === activeId;
                                    // Prefer userGamedata.name, otherwise use nickname.
                                    const displayName = acc.userGamedata?.name || acc.nickname;
    
                                    return (
                                        <div
                                            key={acc.id}
                                            className={cn(
                                                "relative rounded-md3-lg border p-4 transition-colors duration-200 ease-md3-standard",
                                                isActive
                                                    ? "border-primary bg-primary-container/40"
                                                    : "border-outline-variant bg-surface-container",
                                            )}
                                        >
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                                {/* Avatar - use the leader card thumbnail. */}
                                                <AccountAvatar account={acc} size="lg" className={cn("ring-2 ring-offset-1 ring-offset-surface transition-all", isActive ? "ring-primary" : "ring-outline-variant")} />
    
                                                {/* Info */}
                                                <div className="min-w-0 flex-1 basis-48">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {displayName && (
                                                            <span className="truncate type-title-s text-on-surface">{displayName}</span>
                                                        )}
                                                        <span className="font-mono type-body-s text-on-surface-variant">{acc.gameId}</span>
                                                        <span className={cn(
                                                            "rounded-md3-xs px-1.5 py-0.5 type-label-s",
                                                            isActive ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant",
                                                        )}>
                                                            <ServerRegionLabel server={acc.server} size={16} />
                                                        </span>
                                                        {isActive && (
                                                            <span className="rounded-md3-xs bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                                                                {t("common.account.current")}
                                                            </span>
                                                        )}
                                                        <span className={cn(
                                                            "rounded-md3-xs px-1.5 py-0.5 type-label-s",
                                                            acc.starmoeSource === "verified" || acc.authSource === "oauth2"
                                                                ? "bg-secondary-container text-on-secondary-container"
                                                                : "bg-surface-container-highest text-on-surface-variant",
                                                        )}>
                                                            {accountBadge(acc)}
                                                        </span>
                                                        {acc.authError === "reauth_required" && !acc.starmoeSource && (
                                                            <span className="rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container">
                                                                {t("common.account.reauthRequired")}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-2 type-label-s text-on-surface-variant">
                                                        <p>
                                                            {t("common.account.createdAt", { date: formatDate(acc.createdAt) })}
                                                        </p>
                                                        {acc.uploadTime && (
                                                            <>
                                                                <span aria-hidden="true" className="opacity-60">•</span>
                                                                <p>
                                                                    {t("common.account.dataUpdatedAt", { date: formatDate(acc.uploadTime * 1000, { dateStyle: "medium", timeStyle: "short" }) })}
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
    
                                                {/* Actions: wrap under the info on narrow screens */}
                                                <div className="ml-auto flex flex-shrink-0 flex-wrap items-center justify-end gap-1">
                                                    {!isActive && (
                                                        <Button variant="text" size="xs" onClick={() => handleSetActive(acc.id)}>
                                                            {t("common.account.setDefault")}
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="text"
                                                        size="xs"
                                                        color="secondary"
                                                        icon={resyncingIds.has(acc.id) ? undefined : mdSync}
                                                        disabled={resyncingIds.has(acc.id)}
                                                        onClick={() => void handleResync(acc)}
                                                    >
                                                        {resyncingIds.has(acc.id) && <CircularProgress size={14} strokeWidth={2} />}
                                                        {t("common.account.resync")}
                                                    </Button>
                                                    {acc.starmoeSource === "verified" && signedIn ? null : deleteConfirmId === acc.id ? (
                                                        <div className="flex items-center gap-1">
                                                            <Button variant="tonal" size="xs" color="error" onClick={() => handleDelete(acc.id)}>
                                                                {t("common.action.confirm")}
                                                            </Button>
                                                            <Button variant="text" size="xs" onClick={() => setDeleteConfirmId(null)}>
                                                                {t("common.action.cancel")}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <IconButton
                                                            icon={mdDelete}
                                                            label={t("common.account.deleteAccount")}
                                                            size="xs"
                                                            className="hover:text-error"
                                                            onClick={() => setDeleteConfirmId(acc.id)}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
    
                        {/* Add Account Form */}
                        {showAddForm && (
                            <div className="mt-4 rounded-md3-lg bg-surface-container p-4">
                                <h3 className="mb-3 type-title-m text-on-surface">
                                    {t("common.account.addNewAccount")}
                                </h3>
                                <div className="space-y-4">
                                    <TextField
                                        variant="outlined"
                                        label={t("common.form.gameUid")}
                                        required
                                        value={formGameId}
                                        onChange={(e) => setFormGameId(e.target.value)}
                                        placeholder={t("common.account.inputGameUid")}
                                        disabled={isVerifying}
                                    />
                                    <div>
                                        <div id="profile-server-label" className="mb-2 type-label-l text-on-surface-variant">{t("common.form.server")}</div>
                                        <ServerPicker value={formServer} onValueChange={setFormServer} disabled={isVerifying} labelledBy="profile-server-label" />
                                    </div>
    
                                    {verifyError && (
                                        <Banner tone="error" title={verifyError}>
                                            <ExternalLink
                                                href="https://haruki.seiunx.com"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-1 inline-block rounded-md3-xs underline focus-ring"
                                            >
                                                {t("common.account.goHaruki")}
                                            </ExternalLink>
                                        </Banner>
                                    )}
    
                                    <p className="type-body-s text-on-surface-variant">
                                        {t("common.account.addHint")}
                                    </p>
    
                                    <div className="flex gap-3 pt-1">
                                        <Button
                                            variant="filled"
                                            size="m"
                                            className="flex-1"
                                            onClick={handleAddAccount}
                                            disabled={!formGameId.trim() || isVerifying}
                                        >
                                            {isVerifying ? (
                                                <>
                                                    <CircularProgress size={18} strokeWidth={2} />
                                                    {t("common.account.verifyingWithDots")}
                                                </>
                                            ) : (
                                                t("common.account.verifyAndAdd")
                                            )}
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            size="m"
                                            onClick={() => { setShowAddForm(false); setVerifyError(null); }}
                                            disabled={isVerifying}
                                        >
                                            {t("common.action.cancel")}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </SectionCard>
                </div>

                {/* Tool Quick Links */}
                <SectionCard className="mb-6" icon={mdBuild} title={t("page.profile.toolQuickLinks")}>
                    <p className="mb-4 type-body-s text-on-surface-variant">
                        {t("page.profile.toolQuickLinksHint")}
                    </p>
                    <div className="space-y-2">
                        {toolLinks.map((tool) => (
                            <Link
                                key={tool.href}
                                href={tool.href}
                                className="group state-layer focus-ring flex items-center justify-between rounded-md3-lg bg-surface-container p-3"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-md3-md bg-secondary-container text-on-secondary-container">
                                        <Icon path={tool.icon} size={22} />
                                    </div>
                                    <div>
                                        <div className="type-title-s text-on-surface">{t(tool.titleKey)}</div>
                                        <div className="type-body-s text-on-surface-variant">{t(tool.descriptionKey)}</div>
                                    </div>
                                </div>
                                <span className="flex items-center gap-0.5 type-label-l text-primary">
                                    {t("page.profile.goTo")}
                                    <Icon path={mdChevronRight} size={18} />
                                </span>
                            </Link>
                        ))}
                    </div>
                </SectionCard>

                {/* Danger Zone */}
                {accounts.length > 0 && (
                    <SectionCard
                        className="mb-6 border border-error/40"
                        icon={mdWarning}
                        title={<span className="text-error">{t("page.profile.dangerZone")}</span>}
                    >
                        <p className="mb-4 type-body-s text-on-surface-variant">
                            {signedIn ? t("page.profile.dangerDescriptionSignedIn") : t("page.profile.dangerDescription")}
                        </p>
                        {!showClearConfirm ? (
                            <Button variant="outlined" color="error" onClick={() => setShowClearConfirm(true)}>
                                {signedIn ? t("page.profile.clearLocalData") : t("page.profile.clearAllData")}
                            </Button>
                        ) : (
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="type-body-m text-error">{signedIn ? t("page.profile.clearLocalConfirm") : t("page.profile.clearAllConfirm")}</span>
                                <Button variant="filled" color="error" onClick={handleClearAll}>
                                    {t("page.profile.confirmClear")}
                                </Button>
                                <Button variant="outlined" onClick={() => setShowClearConfirm(false)}>
                                    {t("common.action.cancel")}
                                </Button>
                            </div>
                        )}
                    </SectionCard>
                )}

                {/* Info */}
                <div className="mt-8 text-center type-body-s text-on-surface-variant">
                    <p>{signedIn ? t("page.profile.syncedNotice") : t("common.account.localOnlyNotice")}</p>
                </div>
            </PageContainer>
        </MainLayout>
    );
}
