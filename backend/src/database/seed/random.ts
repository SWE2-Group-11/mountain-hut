/** Source of randomness in [0, 1), injectable for testing. */
export type Random = () => number;

/** Random integer in [min, max], both included. */
export const randomInt = (random: Random, min: number, max: number): number =>
    min + Math.floor(random() * (max - min + 1));

/** A random element of a non-empty list. */
export const pickOne = <T>(random: Random, items: readonly T[]): T =>
    items[randomInt(random, 0, items.length - 1)];

/** k distinct elements of items in random order (partial Fisher-Yates shuffle). */
export const pickDistinct = <T>(random: Random, items: readonly T[], k: number): T[] => {
    const copy = [...items];
    for (let i = 0; i < k; i++) {
        const j = randomInt(random, i, copy.length - 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, k);
};

/** A random non-empty subset of items (empty only if items is empty). */
export const pickSome = <T>(random: Random, items: readonly T[]): T[] =>
    pickDistinct(random, items, randomInt(random, Math.min(1, items.length), items.length));