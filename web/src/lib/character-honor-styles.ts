import { fetchMasterData, getCurrentServer, type ServerSourceType } from "@/lib/fetch";
import type { IHonorBackground, IHonorWord } from "@/types/honor";

/**
 * Character honors are drawn from a background style plus a word, which the player picks from
 * what their character rank has unlocked. The tables are honorWords.json and honorBackgrounds.json.
 */
export interface CharacterHonorStyles {
    words: IHonorWord[];
    backgrounds: IHonorBackground[];
}

export interface CharacterHonorStyle {
    background?: IHonorBackground;
    word?: IHonorWord;
}

// Only JP has the two tables so far; the other servers answer 404. Each server's answer,
// a missing table included, is kept for the page's lifetime so it is asked for once.
const loaded = new Map<ServerSourceType, Promise<CharacterHonorStyles>>();

export function loadCharacterHonorStyles(server?: ServerSourceType): Promise<CharacterHonorStyles> {
    const key = server ?? getCurrentServer();
    let pending = loaded.get(key);
    if (!pending) {
        function table<T>(path: string): Promise<T[]> {
            return fetchMasterData<T[]>(path, false, key)
                .then((rows) => (Array.isArray(rows) ? rows : []))
                .catch((): T[] => []);
        }
        pending = Promise.all([
            table<IHonorWord>("honorWords.json"),
            table<IHonorBackground>("honorBackgrounds.json"),
        ]).then(([words, backgrounds]) => ({ words, backgrounds }));
        loaded.set(key, pending);
    }
    return pending;
}

const bySeq = (a: { seq: number }, b: { seq: number }) => a.seq - b.seq;

/** The backgrounds and words of one character honor group, in the game's order. */
export function characterHonorStyleOptions(styles: CharacterHonorStyles, honorGroupId: number) {
    return {
        backgrounds: styles.backgrounds.filter((row) => row.honorGroupId === honorGroupId).sort(bySeq),
        words: styles.words.filter((row) => row.honorGroupId === honorGroupId).sort(bySeq),
    };
}

/**
 * The background and word a character honor shows, as the game picks them: the player's choice
 * when the id names one, otherwise the group's first (style 1 and the "fan" word).
 */
export function resolveCharacterHonorStyle(
    styles: CharacterHonorStyles,
    honorGroupId: number,
    backgroundId?: number,
    wordId?: number,
): CharacterHonorStyle {
    const { backgrounds, words } = characterHonorStyleOptions(styles, honorGroupId);
    return {
        background: (backgroundId ? backgrounds.find((row) => row.id === backgroundId) : undefined) ?? backgrounds[0],
        word: (wordId ? words.find((row) => row.id === wordId) : undefined) ?? words[0],
    };
}
