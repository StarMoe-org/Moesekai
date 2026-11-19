import { useMemo } from "react";
import {
    mdAllInclusive,
    mdCake,
    mdCelebration,
    mdHandshake,
    mdHourglassTop,
    mdLocalFlorist,
    mdPublic,
} from "@/components/md3/icons";

export interface ICardSupply {
    id: number;
    cardSupplyType: string;
    assetbundleName?: string;
    name: string;
}

const CARD_SUPPLY_TYPES = [
    "normal",
    "birthday",
    "term_limited",
    "colorful_festival_limited",
    "bloom_festival_limited",
    "unit_event_limited",
    "collaboration_limited",
] as const;

export type CardSupplyTypeId = typeof CARD_SUPPLY_TYPES[number];

export interface CardSupplyTypeMapping {
    type: CardSupplyTypeId;
}

export interface CardSupplyMeta {
    icon: string;
    colorClass: string;
}

/** Shared icon and semantic color mapping for each card supply type. */
export function getCardSupplyMeta(supplyType: string): CardSupplyMeta {
    switch (supplyType) {
        case "normal":
            return { icon: mdAllInclusive, colorClass: "text-on-surface-variant" };
        case "birthday":
            return { icon: mdCake, colorClass: "text-tertiary" };
        case "term_limited":
            return { icon: mdHourglassTop, colorClass: "text-primary" };
        case "colorful_festival_limited":
            return { icon: mdCelebration, colorClass: "text-secondary" };
        case "bloom_festival_limited":
            return { icon: mdLocalFlorist, colorClass: "text-secondary" };
        case "unit_event_limited":
            return { icon: mdPublic, colorClass: "text-primary" };
        case "collaboration_limited":
            return { icon: mdHandshake, colorClass: "text-tertiary" };
        default:
            return { icon: mdHourglassTop, colorClass: "text-secondary" };
    }
}

export function useCardSupplyTypeMapping() {
    return useMemo<CardSupplyTypeMapping[]>(
        () => CARD_SUPPLY_TYPES.map((type) => ({ type })),
        []
    );
}
