import { getCardDefaultTrainedStatus, isTrainableCard, type ICardInfo } from "@/types/types";
import type { ProfileCardState } from "@/hooks/useProfileExtras";

/** The art the player picked for a card (its default image setting), falling back to its training state. */
export function showsTrainedArt(card: ICardInfo, state?: ProfileCardState): boolean {
    if (state?.defaultImage === "special_training") return true;
    if (state?.defaultImage === "original") return false;
    return getCardDefaultTrainedStatus(card)
        || (state?.specialTrainingStatus === "done" && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");
}
