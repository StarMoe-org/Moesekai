"use client";

import Image from "next/image";
import DegreeImage from "@/components/honor/DegreeImage";
import BondsDegreeImage from "@/components/honor/BondsDegreeImage";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getCardFullUrl } from "@/lib/assets";
import { getLeaderCardId, type MoesekaiAccount } from "@/lib/account";
import type { ProfileExtras, ProfileHonor } from "@/hooks/useProfileExtras";
import type { RealtimeRankingMasterData } from "@/types/realtime-ranking";
import type { ICardInfo } from "@/types/types";
import { Button, IconButton, cn } from "@/components/md3";
import { mdSwapHoriz } from "@/components/md3/icons";
import { showsTrainedArt } from "./profile-cards";
import ProfileDeck from "./ProfileDeck";

interface Props {
    account: MoesekaiAccount;
    extras: ProfileExtras;
    master: RealtimeRankingMasterData | null;
    cards: Map<number, ICardInfo> | null;
    accountCount: number;
    onManageAccounts: () => void;
}

function HonorSlot({ honor, main, master, pending }: { honor?: ProfileHonor; main: boolean; master: RealtimeRankingMasterData | null; pending: boolean }) {
    const { assetSource } = useTheme();
    let image: React.ReactNode = null;

    if (honor && master) {
        if (honor.profileHonorType === "bonds") {
            const bondsHonor = master.bondsHonors.find((entry) => entry.id === honor.honorId);
            const word = master.bondsHonorWords.find((entry) => entry.id === honor.bondsHonorWordId);
            if (bondsHonor) {
                image = (
                    <BondsDegreeImage
                        bondsHonor={bondsHonor}
                        gameCharaUnits={master.gameCharaUnits}
                        bondsHonorWordAssetbundleName={word?.assetbundleName}
                        viewType={honor.bondsHonorViewType === "reverse" ? "reverse" : "normal"}
                        honorLevel={honor.honorLevel}
                        source={assetSource}
                        sub={!main}
                        className="block h-auto w-full"
                    />
                );
            }
        } else {
            const entry = master.honors.find((item) => item.id === honor.honorId);
            if (entry) {
                image = (
                    <DegreeImage
                        honor={entry}
                        honorGroup={master.honorGroups.find((group) => group.id === entry.groupId)}
                        honorLevel={honor.honorLevel}
                        source={assetSource}
                        sub={!main}
                        className="block h-auto w-full"
                    />
                );
            }
        }
    }

    return (
        <div className={main ? "col-span-2 sm:flex-[380_1_0%]" : "sm:flex-[180_1_0%]"}>
            {image ?? (
                <div className={cn(
                    "rounded-md3-md border border-dashed border-outline-variant",
                    main ? "aspect-[380/80]" : "aspect-[180/80]",
                    pending && "animate-pulse border-transparent bg-surface-container-high",
                )} />
            )}
        </div>
    );
}

/**
 * The player card from the game's profile screen: leader card art, name and
 * player rank, the one-line comment, the three equipped honors and the deck.
 */
export default function ProfileHeroCard({ account, extras, master, cards, accountCount, onManageAccounts }: Props) {
    const { t, formatDate, formatNumber } = useI18n();
    const { assetSource } = useTheme();

    const name = account.userGamedata?.name || account.nickname;
    const rank = account.userGamedata?.rank;
    const leaderId = getLeaderCardId(account.userGamedata, account.userDecks) ?? account.avatarCardId;
    const leader = leaderId ? cards?.get(leaderId) : undefined;
    // Wait for the card states so the art does not flip from normal to trained.
    const art = leader && extras.status !== "loading"
        ? getCardFullUrl(leader.characterId, leader.assetbundleName, showsTrainedArt(leader, extras.cards.get(leader.id)), assetSource)
        : null;

    return (
        <section className="mb-6 overflow-hidden rounded-md3-xl border border-outline-variant/70 bg-surface-card text-on-surface">
            <div className="grid lg:grid-cols-[minmax(0,10fr)_minmax(0,11fr)]">
                <div className="relative aspect-[16/9] bg-surface-container-high lg:aspect-auto lg:min-h-[19rem]">
                    {art && (
                        <Image src={art} alt={leader?.prefix ?? ""} fill unoptimized priority className="object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-card via-transparent to-transparent lg:bg-gradient-to-r lg:via-transparent lg:from-transparent lg:to-surface-card" />
                </div>

                <div className="relative -mt-12 flex min-w-0 flex-col gap-4 px-4 pb-5 sm:-mt-16 sm:px-6 sm:pb-6 lg:mt-0 lg:py-6 lg:pl-3">
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <h2 className="min-w-0 break-words type-headline-s text-on-surface sm:type-headline-m">{name}</h2>
                                {rank ? (
                                    <span className="inline-flex shrink-0 items-baseline gap-1.5 rounded-md3-full bg-primary px-3 py-1 text-on-primary">
                                        <span className="type-label-m">{t("page.profile.hero.rank")}</span>
                                        <span className="type-title-m tabular-nums leading-none">{formatNumber(rank)}</span>
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 type-body-s text-on-surface-variant">
                                <ServerRegionLabel server={account.server} size={16} />
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">{account.gameId}</span>
                            </div>
                        </div>
                        {accountCount > 1 && (
                            <>
                                <IconButton variant="tonal" size="xs" icon={mdSwapHoriz} label={t("page.profile.hero.switchAccount")} onClick={onManageAccounts} className="shrink-0 sm:hidden" />
                                <span className="hidden shrink-0 sm:block">
                                    <Button variant="tonal" size="xs" icon={mdSwapHoriz} onClick={onManageAccounts}>
                                        {t("page.profile.hero.switchAccount")}
                                    </Button>
                                </span>
                            </>
                        )}
                    </div>

                    {extras.word && (
                        <p className="whitespace-pre-line break-words rounded-md3-lg rounded-tl-md3-xs bg-surface-container px-4 py-3 type-body-m text-on-surface">
                            {extras.word}
                        </p>
                    )}

                    {(extras.status === "loading" || extras.honors.length > 0) && (
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-start">
                            {[0, 1, 2].map((slot) => (
                                <HonorSlot
                                    key={slot}
                                    main={slot === 0}
                                    master={master}
                                    honor={extras.honors[slot]}
                                    pending={extras.status === "loading" || (!!extras.honors[slot] && !master)}
                                />
                            ))}
                        </div>
                    )}

                    <ProfileDeck account={account} cards={cards} extras={extras} />

                    {account.uploadTime ? (
                        <p className="mt-auto type-label-s text-on-surface-variant">
                            {t("common.account.dataUpdatedAt", { date: formatDate(account.uploadTime * 1000, { dateStyle: "medium", timeStyle: "short" }) })}
                        </p>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
