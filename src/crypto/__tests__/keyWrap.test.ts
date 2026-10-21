import { CryptoError, generateRandomBytes, unwrapKey, wipe, wrapKey } from '..';

describe('wrapKey / unwrapKey', () => {
  test('round trip', () => {
    const kek = generateRandomBytes(32);
    const dek = generateRandomBytes(32);
    const wrapped = wrapKey(kek, dek);
    expect(wrapped.length).toBe(12 + 32 + 16);
    expect(unwrapKey(kek, wrapped)).toEqual(dek);
  });

  test('wrapping twice gives different output', () => {
    const kek = generateRandomBytes(32);
    const dek = generateRandomBytes(32);
    expect(wrapKey(kek, dek)).not.toEqual(wrapKey(kek, dek));
  });

  test('wrong wrapping key or tampered data fails', () => {
    const kek = generateRandomBytes(32);
    const wrapped = wrapKey(kek, generateRandomBytes(32));
    expect(() => unwrapKey(generateRandomBytes(32), wrapped)).toThrow(CryptoError);
    const tampered = wrapped.slice();
    tampered[20] = (tampered[20] ?? 0) ^ 1;
    expect(() => unwrapKey(kek, tampered)).toThrow(CryptoError);
  });

  test('only 32-byte keys can be wrapped', () => {
    expect(() => wrapKey(generateRandomBytes(32), generateRandomBytes(16))).toThrow(
      /Key to wrap must be 32 bytes/,
    );
  });
});

describe('generateRandomBytes', () => {
  test('returns the requested length and different bytes each call', () => {
    expect(generateRandomBytes(32).length).toBe(32);
    expect(generateRandomBytes(32)).not.toEqual(generateRandomBytes(32));
  });

  test('rejects invalid sizes', () => {
    for (const n of [0, -1, 1.5, NaN, 2 * 1024 * 1024]) {
      expect(() => generateRandomBytes(n)).toThrow(CryptoError);
    }
  });
});

describe('wipe', () => {
  test('zeroes buffers and ignores null or undefined', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    wipe(a, null, undefined, b);
    expect(a).toEqual(new Uint8Array(3));
    expect(b).toEqual(new Uint8Array(2));
  });
});
