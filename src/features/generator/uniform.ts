import { CryptoError, generateRandomBytes, wipe } from '@/crypto';

// A uniform random number generator built on the secure random bytes from src/crypto.
//
// Why not `randomValue % n`? When n does not divide the number of possible random values, the
// smaller results come up slightly more often (modulo bias). We use rejection sampling instead:
// random values from the uneven "tail" at the top are thrown away and drawn again, so every
// result from 0 to n-1 is exactly equally likely.

export const UINT32_RANGE = 2 ** 32;

// Maps `value` (0 up to range-1, every value equally likely) to 0..n-1 without bias.
// Returns null when `value` is in the rejected tail and a new value must be drawn.
export function reduceUniform(value: number, n: number, range: number): number | null {
  const limit = range - (range % n); // the largest multiple of n that fits in the range
  return value < limit ? value % n : null;
}

export type ByteSource = (count: number) => Uint8Array;

export type UniformPicker = {
  // A uniformly random integer from 0 to n-1 (n from 1 to 2^32).
  pick: (n: number) => number;
  // Best-effort wipe of the random bytes that were drawn but not used.
  dispose: () => void;
};

const POOL_BYTES = 256; // one call to the secure generator serves 64 draws

export function createUniformPicker(source: ByteSource = generateRandomBytes): UniformPicker {
  let pool: Uint8Array = new Uint8Array(0);
  let offset = 0;

  function nextUint32(): number {
    if (offset + 4 > pool.length) {
      wipe(pool);
      pool = source(POOL_BYTES);
      offset = 0;
      if (pool.length < 4)
        throw new CryptoError('RANDOM_FAILED', 'Random generator returned too few bytes.');
    }
    // Multiplication instead of bit shifts, which would turn large values negative.
    const value =
      pool[offset]! * 2 ** 24 +
      pool[offset + 1]! * 2 ** 16 +
      pool[offset + 2]! * 2 ** 8 +
      pool[offset + 3]!;
    offset += 4;
    return value;
  }

  return {
    pick(n) {
      if (!Number.isInteger(n) || n < 1 || n > UINT32_RANGE) {
        throw new RangeError('pick() needs a whole number from 1 to 2^32.');
      }
      if (n === 1) return 0;
      for (;;) {
        const result = reduceUniform(nextUint32(), n, UINT32_RANGE);
        if (result !== null) return result;
      }
    },
    dispose() {
      wipe(pool);
      pool = new Uint8Array(0);
      offset = 0;
    },
  };
}

export function pickFrom<T>(items: readonly T[], picker: UniformPicker): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty list.');
  return items[picker.pick(items.length)]!;
}

// Fisher-Yates shuffle with unbiased picks. Returns a new array.
export function shuffle<T>(items: readonly T[], picker: UniformPicker): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = picker.pick(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
