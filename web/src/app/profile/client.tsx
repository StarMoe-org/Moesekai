"use client";

/**
 * The profile of the game account being viewed: deck, song clears, character ranks, challenge stages, bonds and
 * bonuses. Managing the game accounts themselves is on /account.
 */
import React, { useState, useEffect, useMemo } from "react";
import Link from "@/components/LocalizedLink";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import ProfileHeroCard from "@/components/profile/ProfileHeroCard";
import MusicClearStatus from "@/components/profile/MusicClearStatus";
import CharacterRankGrid from "@/components/profile/CharacterRankGrid";
import ChallengeStageChart from "@/components/profile/ChallengeStageChart";
import BondsRankTable from "@/components/profile/BondsRankTable";
import PowerBonusDetail from "@/components/profile/PowerBonusDetail";
import { useProfileExtras } from "@/hooks/useProfileExtras";
import { fetchRealtimeRankingMasterData } from "@/lib/realtime-ranking-api";
import type { RealtimeRankingMasterData } from "@/types/realtime-ranking";
import { refreshGameAccount, type ServerType } from "@/lib/account";
import { useGameAccounts } from "@/lib/account/hooks";
import { useStarMoeAccountSync } from "@/hooks/useStarMoeAccountSync";
import { useMoesekaiAccount } from "@/lib/moesekai-account";
import { localizePathForBrowser } from "@/lib/localized-path";
import { useI18n } from "@/contexts/I18nContext";
import {
    Banner,
    Button,
    EmptyState,
    Icon,
    PageContainer,
    PageHeader,
    SectionCard,
} from "@/components/md3";
import {
    mdBuild,
    mdCalculate,
    mdChevronRight,
    mdLayers,
    mdManageAccounts,
    mdPerson,
    mdStyle,
} from "@/components/md3/icons";

export default function ProfileClient() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const oauthStatus = searchParams.get("oauth");
    const login = useMoesekaiAccount();
    const { accounts, active: activeAccount } = useGameAccounts();
    // Keeps the list in step with the Passport while signed in.
    useStarMoeAccountSync();

    // Account management moved to /account; old links to its section on this page go there.
    useEffect(() => {
        if (window.location.hash === "#profile-accounts") window.location.replace(localizePathForBrowser("/account"));
    }, []);

    // Once it is known whether the visitor is signed in (which decides where data is read from), re-read the
    // account being viewed so its profile is current.
    const loginKnown = login.status !== "loading";
    const activeId = activeAccount?.id ?? null;
    useEffect(() => {
        if (loginKnown && activeId) void refreshGameAccount(activeId);
    }, [loginKnown, activeId]);

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
                    actions={
                        <Button variant="outlined" size="s" icon={mdManageAccounts} href="/account">
                            {t("page.account.profile.manage")}
                        </Button>
                    }
                />

                {oauthStatus === "success" && (
                    <Banner tone="info" className="mb-6">
                        {t("common.account.oauthBindSuccess")}
                    </Banner>
                )}

                {!activeAccount && (
                    <SectionCard className="mb-6">
                        <EmptyState
                            className="py-10"
                            icon={mdPerson}
                            title={t("page.account.profile.emptyTitle")}
                            description={t("page.account.profile.emptyBody")}
                            action={
                                <Button variant="filled" href="/account">
                                    {t("page.account.profile.emptyAction")}
                                </Button>
                            }
                        />
                    </SectionCard>
                )}

                {activeAccount && (
                    <>
                        <ProfileHeroCard
                            account={activeAccount}
                            extras={extras}
                            master={masterData}
                            cards={cardMap}
                            accountCount={accounts.length}
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

            </PageContainer>
        </MainLayout>
    );
}
