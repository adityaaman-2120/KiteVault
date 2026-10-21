import { createUniformPicker, pickFrom, reduceUniform, shuffle, UINT32_RANGE } from '../uniform';

// Chi-square statistic for counts that should all be equal.
function chiSquare(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
}

describe('reduceUniform: no modulo bias', () => {
  // Feed EVERY possible random value of a small range through the function and count the
  // results. If any result were more likely than another, the counts would differ.
  test.each([2, 3, 5, 6, 7, 10, 26, 62, 90, 100, 255])(
    'every result is exactly equally likely for n=%i (range 256)',
    (n) => {
      const counts = new Array<number>(n).fill(0);
      let rejected = 0;
      for (let value = 0; value < 256; value++) {
        const result = reduceUniform(value, n, 256);
        if (result === null) rejected++;
        else counts[result]!++;
      }
      expect(new Set(counts).size).toBe(1); // all counts identical
      expect(rejected).toBe(256 % n); // exactly the uneven tail is thrown away
      expect(counts[0]! * n + rejected).toBe(256);
    },
  );

  test('the same holds for a power-of-two n: nothing is rejected', () => {
    for (const n of [2, 4, 16, 64, 128, 256]) {
      for (let value = 0; value < 256; value++) {
        expect(reduceUniform(value, n, 256)).toBe(value % n);
      }
    }
  });

  test('this test would catch the biased shortcut (value % n)', () => {
    const counts = [0, 0, 0];
    for (let value = 0; value < 256; value++) counts[value % 3]!++;
    expect(counts).toEqual([86, 85, 85]); // 256 is not a multiple of 3: result 0 is more likely
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  test('with the real 32-bit range the last multiple of n is the cut-off', () => {
    const n = 90;
    const limit = UINT32_RANGE - (UINT32_RANGE % n);
    expect(reduceUniform(limit - 1, n, UINT32_RANGE)).toBe(n - 1);
    expect(reduceUniform(limit, n, UINT32_RANGE)).toBeNull();
    expect(reduceUniform(UINT32_RANGE - 1, n, UINT32_RANGE)).toBeNull();
    expect(reduceUniform(0, n, UINT32_RANGE)).toBe(0);
  });

  test('n=3 rejects 0xFFFFFFFF (the one value that would favour result 0)', () => {
    expect(reduceUniform(0xffffffff, 3, UINT32_RANGE)).toBeNull();
    expect(reduceUniform(0xfffffffe, 3, UINT32_RANGE)).toBe(2);
  });
});

describe('createUniformPicker', () => {
  const bytes = (...uint32: number[]) =>
    Uint8Array.from(
      uint32.flatMap((v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]),
    );

  test('draws again when a value is in the rejected tail', () => {
    const calls: number[] = [];
    // First value 0xFFFFFFFF is rejected for n=3; the next one (7) gives 7 % 3 = 1.
    const picker = createUniformPicker((count) => {
      calls.push(count);
      return bytes(0xffffffff, 7, ...new Array(62).fill(0));
    });
    expect(picker.pick(3)).toBe(1);
    expect(calls).toEqual([256]); // both values came from the same batch
  });

  test('reads the bytes as one unsigned 32-bit number (no sign problems)', () => {
    const picker = createUniformPicker(() =>
      bytes(0x80000000, 0x80000001, ...new Array(62).fill(0)),
    );
    expect(picker.pick(2 ** 31)).toBe(0); // 0x80000000 is exactly 2^31, n divides 2^32
    expect(picker.pick(2 ** 31)).toBe(1);
  });

  test('fetches a new batch when the first is used up', () => {
    let batches = 0;
    const picker = createUniformPicker(() => {
      batches++;
      return new Uint8Array(256).fill(1); // value 0x01010101, accepted for small n
    });
    for (let i = 0; i < 64; i++) picker.pick(10);
    expect(batches).toBe(1);
    picker.pick(10);
    expect(batches).toBe(2);
  });

  test('n = 1 needs no randomness', () => {
    const source = jest.fn(() => new Uint8Array(256));
    expect(createUniformPicker(source).pick(1)).toBe(0);
    expect(source).not.toHaveBeenCalled();
  });

  test.each([0, -1, 1.5, NaN, Infinity, 2 ** 32 + 1])('rejects n = %p', (n) => {
    expect(() => createUniformPicker().pick(n)).toThrow(RangeError);
  });

  test('refuses a broken random source', () => {
    expect(() => createUniformPicker(() => new Uint8Array(2)).pick(5)).toThrow(/too few bytes/);
  });

  test('dispose wipes the unused bytes', () => {
    const pool = new Uint8Array(256).fill(9);
    const picker = createUniformPicker(() => pool);
    picker.pick(10);
    picker.dispose();
    expect(pool.every((b) => b === 0)).toBe(true);
  });

  test('real secure random: results stay in range and look uniform', () => {
    const picker = createUniformPicker();
    for (const n of [2, 6, 7, 26, 90]) {
      const counts = new Array<number>(n).fill(0);
      const draws = n * 3000;
      for (let i = 0; i < draws; i++) {
        const v = picker.pick(n);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(n);
        counts[v]!++;
      }
      // Critical chi-square value at p = 0.0001 for df = 89 is about 140; this limit makes a
      // false alarm on good random numbers essentially impossible, yet a biased picker still fails.
      expect(chiSquare(counts)).toBeLessThan(n - 1 + 8 * Math.sqrt(2 * (n - 1)) + 20);
    }
    picker.dispose();
  });

  test('uses the secure generator from src/crypto, never Math.random', () => {
    const random = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });
    try {
      const picker = createUniformPicker();
      for (let i = 0; i < 100; i++) picker.pick(90);
      picker.dispose();
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});

describe('pickFrom and shuffle', () => {
  test('pickFrom returns an element, and refuses an empty list', () => {
    const picker = createUniformPicker();
    expect(['a', 'b', 'c']).toContain(pickFrom(['a', 'b', 'c'], picker));
    expect(() => pickFrom([], picker)).toThrow();
  });

  test('shuffle keeps exactly the same items and does not change the input', () => {
    const picker = createUniformPicker();
    const input = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffle(input, picker);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(out).not.toEqual(input); // 1 in 50! chance of failing
  });

  test('all 6 orders of 3 items are equally likely', () => {
    const picker = createUniformPicker();
    const counts = new Map<string, number>();
    for (let i = 0; i < 12000; i++) {
      const key = shuffle(['a', 'b', 'c'], picker).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    expect(chiSquare([...counts.values()])).toBeLessThan(35); // df = 5
  });
});
