/**
 * What a game account looks like in the interface: its avatar and leader card.
 */
import type { UserCharacter, UserDeck, UserGamedata } from "./types";

/** Get the character avatar URL. */
export function getCharacterIconUrl(characterId: number): string {
    return `https://moe.exmeaning.com/assets/chr_ts_${characterId}.png`;
}

/** Get the character id with the highest rank. */
export function getTopCharacterId(characters: UserCharacter[]): number {
    if (!characters || characters.length === 0) return 21; // Default Miku
    return characters.reduce((top, c) => c.characterRank > top.characterRank ? c : top, characters[0]).characterId;
}

/** Get the current deck leader card id. */
export function getLeaderCardId(userGamedata: UserGamedata | null, userDecks: UserDeck[] | null): number | null {
    if (!userGamedata || !userDecks || userDecks.length === 0) return null;
    const currentDeck = userDecks.find(d => d.deckId === userGamedata.deck);
    return currentDeck ? currentDeck.leader : null;
}
