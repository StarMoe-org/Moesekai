"use client";

import Link from "@/components/LocalizedLink";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { useI18n } from "@/contexts/I18nContext";
import type { MoesekaiAccount } from "@/lib/account";
import type { ProfileExtras } from "@/hooks/useProfileExtras";
import type { ICardInfo } from "@/types/types";
import { showsTrainedArt } from "./profile-cards";

interface Props {
    account: MoesekaiAccount;
    cards: Map<number, ICardInfo> | null;
    extras: ProfileExtras;
}

/** The five cards of the deck in use, leader first, as the profile screen shows them. */
export default function ProfileDeck({ account, cards, extras }: Props) {
    const { t } = useI18n();
    const deck = account.userDecks?.find((item) => item.deckId === account.userGamedata?.deck) ?? account.userDecks?.[0];
    const members = deck ? [deck.member1, deck.member2, deck.member3, deck.member4, deck.member5].filter((id) => id > 0) : [];
    const artReady = extras.status !== "loading";

    return (
        <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
                <h3 className="shrink-0 type-title-s text-on-surface">{t("page.profile.deck.title")}</h3>
                {deck?.name && <span className="min-w-0 truncate type-label-m text-on-surface-variant">{deck.name}</span>}
            </div>
            {members.length === 0 ? (
                <p className="mt-2 type-body-s text-on-surface-variant">{t("page.profile.deck.empty")}</p>
            ) : (
                <div className="mt-1 grid grid-cols-5 gap-2 pt-2 sm:gap-3">
                    {members.map((id, index) => {
                        const card = cards?.get(id);
                        const state = extras.cards.get(id);
                        return (
                            <Link key={`${id}-${index}`} href={`/cards/${id}`} className="group state-layer focus-ring block min-w-0 rounded-md3-sm">
                                <div className="relative">
                                    {card && artReady ? (
                                        <SekaiCardThumbnail
                                            card={card}
                                            trained={showsTrainedArt(card, state)}
                                            mastery={state?.masterRank || 0}
                                            className="w-full"
                                        />
                                    ) : (
                                        <div className="aspect-square animate-pulse rounded-md3-sm bg-surface-container-high" />
                                    )}
                                    {id === deck?.leader && (
                                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md3-full bg-primary px-1.5 type-label-s text-on-primary shadow-elev-1">
                                            {t("page.profile.deck.leader")}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 h-4 text-center type-label-s tabular-nums text-on-surface-variant">
                                    {state?.level ? t("page.profile.deck.level", { level: state.level }) : null}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
