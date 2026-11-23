import { fetchMasterData } from "@/lib/fetch";
import {
    RealtimeRankingMasterData,
    RealtimeRankingRegion,
} from "@/types/realtime-ranking";
import { ICardInfo } from "@/types/types";
import { IBondsHonor, IBondsHonorWord, IGameCharaUnit, IHonorGroup, IHonorInfo } from "@/types/honor";

// The board's region, not the site-wide data source, decides which server's
// masterdata to read: a JP board viewed with the CN source needs JP events and
// cards. fetchMasterData keeps its IndexedDB cache when the two coincide.
async function fetchMasterDataFromSource<T>(region: RealtimeRankingRegion, path: string): Promise<T> {
    return fetchMasterData<T>(path, false, region);
}

export async function fetchRealtimeRankingMasterData(region: RealtimeRankingRegion): Promise<RealtimeRankingMasterData> {
    const [cards, honors, honorGroups, bondsHonors, bondsHonorWords, gameCharaUnits] = await Promise.all([
        fetchMasterDataFromSource<ICardInfo[]>(region, "cards.json").catch(() => []),
        fetchMasterDataFromSource<IHonorInfo[]>(region, "honors.json").catch(() => []),
        fetchMasterDataFromSource<IHonorGroup[]>(region, "honorGroups.json").catch(() => []),
        fetchMasterDataFromSource<IBondsHonor[]>(region, "bondsHonors.json").catch(() => []),
        fetchMasterDataFromSource<IBondsHonorWord[]>(region, "bondsHonorWords.json").catch(() => []),
        fetchMasterDataFromSource<IGameCharaUnit[]>(region, "gameCharacterUnits.json").catch(() => []),
    ]);

    return {
        server: region,
        cards,
        honors,
        honorGroups,
        bondsHonors,
        bondsHonorWords,
        gameCharaUnits,
    };
}

export async function fetchRealtimeRankingEvents(region: RealtimeRankingRegion) {
    return fetchMasterDataFromSource<import("@/types/events").IEventInfo[]>(region, "events.json");
}
