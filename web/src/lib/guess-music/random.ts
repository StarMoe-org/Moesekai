/**
 * Deterministic pseudo-random numbers for the guess-the-song game.
 *
 * The same seed string yields the same sequence in every browser and in
 * Node, so a shared seed reproduces the same game. The seed is hashed with
 * cyrb128 into four 32-bit words that drive an sfc32 generator.
 */

export interface SeededRandom {
    /** A float in [0, 1). */
    next(): number;
    /** An integer in [0, maxExclusive). */
    int(maxExclusive: number): number;
    /** One element, or undefined for an empty list. */
    pick<T>(items: readonly T[]): T | undefined;
    /** A shuffled copy (Fisher-Yates). */
    shuffle<T>(items: readonly T[]): T[];
    /** `count` distinct elements in random order (all of them when the list is shorter). */
    sample<T>(items: readonly T[], count: number): T[];
}

function cyrb128(text: string): [number, number, number, number] {
    let h1 = 1779033703;
    let h2 = 3144134277;
    let h3 = 1013904242;
    let h4 = 2773480762;
    for (let i = 0; i < text.length; i++) {
        const k = text.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4;
    h2 ^= h1;
    h3 ^= h1;
    h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
    return () => {
        a |= 0;
        b |= 0;
        c |= 0;
        d |= 0;
        const t = (((a + b) | 0) + d) | 0;
        d = (d + 1) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
}

export function createRandom(seed: string): SeededRandom {
    const next = sfc32(...cyrb128(seed));
    // The first outputs of a freshly seeded sfc32 are still correlated with the seed.
    for (let i = 0; i < 12; i++) next();

    const int = (maxExclusive: number) => (maxExclusive <= 0 ? 0 : Math.floor(next() * maxExclusive));
    const shuffle = <T>(items: readonly T[]): T[] => {
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = int(i + 1);
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };
    return {
        next,
        int,
        pick: (items) => (items.length ? items[int(items.length)] : undefined),
        shuffle,
        sample: (items, count) => {
            const copy = [...items];
            const total = Math.max(0, Math.min(count, copy.length));
            // Partial Fisher-Yates: the first `total` slots end up as the sample.
            for (let i = 0; i < total; i++) {
                const j = i + int(copy.length - i);
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy.slice(0, total);
        },
    };
}

/** A short random seed for a new game (not deterministic). */
export function createSeed(): string {
    return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}
