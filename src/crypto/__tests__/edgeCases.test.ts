import { decrypt, encrypt } from '../cipher';
import { bytesEqual, fromBase64, toBase64, utf8Decode, utf8Encode } from '../encoding';
import { CryptoError } from '../errors';
import { deriveKeyFromPassword, KEY_LENGTH, SALT_LENGTH, type KdfParams } from '../kdf';
import { unwrapKey, wrapKey } from '../keyWrap';
import { generateRandomBytes } from '../random';
import { sha1 } from '../sha1';
import { sha256 } from '../sha256';
import { wipe } from '../wipe';

const FAST: KdfParams = {
  algorithm: 'argon2id',
  version: 19,
  memoryKiB: 19 * 1024,
  iterations: 2,
  parallelism: 1,
};
const salt = () => new Uint8Array(SALT_LENGTH).fill(7);
const key = () => new Uint8Array(KEY_LENGTH).fill(9);

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (e) {
    return (e as CryptoError).code;
  }
  return 'NO_ERROR';
};
const codeOfAsync = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (e) {
    return (e as CryptoError).code;
  }
  return 'NO_ERROR';
};

describe('encoding', () => {
  test('UTF-8 round trips text, including emoji and combining characters', () => {
    for (const text of ['', 'abc', 'pässwörd', 'é', '\u{1F511}\u{1F510}', '\u0000x']) {
      expect(utf8Decode(utf8Encode(text))).toBe(text);
    }
  });

  test('base64 round trips arbitrary bytes, including the empty array', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(fromBase64('')).toEqual(new Uint8Array(0));
  });

  test('only canonical base64 is accepted, so a damaged header cannot be "repaired" into a key', () => {
    expect(fromBase64('AQID')).toEqual(Uint8Array.from([1, 2, 3]));
    for (const bad of ['AQI', 'AQID\n', ' AQID', 'AQ!D', 'AQID=', 'AQ==AQ==', 'AR==', '====']) {
      expect(fromBase64(bad)).toBeNull();
    }
  });

  test('bytesEqual compares length and every byte', () => {
    expect(bytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2]))).toBe(true);
    expect(bytesEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
    expect(bytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3]))).toBe(false);
    expect(bytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 0]))).toBe(false);
    expect(bytesEqual(Uint8Array.from([0, 2]), Uint8Array.from([1, 2]))).toBe(false);
  });
});

describe('hashes (known answers)', () => {
  test('SHA-256 and SHA-1 of "abc"', () => {
    const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    expect(hex(sha256(utf8Encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hex(sha1(utf8Encode('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
});

describe('random', () => {
  test('refuses a bad length', () => {
    for (const n of [0, -1, 1.5, NaN, 1024 * 1024 + 1]) {
      expect(codeOf(() => generateRandomBytes(n))).toBe('INVALID_INPUT');
    }
  });

  test('gives the requested length and different output each time', () => {
    const a = generateRandomBytes(32);
    const b = generateRandomBytes(32);
    expect(a).toHaveLength(32);
    expect(bytesEqual(a, b)).toBe(false);
    expect(generateRandomBytes(1)).toHaveLength(1);
  });

  test('reports a generator that returns the wrong length', () => {
    jest.isolateModules(() => {
      jest.doMock('../engine', () => ({ randomBytes: () => new Uint8Array(3) }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { generateRandomBytes: broken } = require('../random') as typeof import('../random');
      expect(codeOf(() => broken(16))).toBe('RANDOM_FAILED');
    });
    jest.dontMock('../engine');
  });
});

describe('AES-GCM', () => {
  test('refuses a key that is not 32 bytes (both ways)', () => {
    expect(codeOf(() => encrypt(new Uint8Array(16), utf8Encode('x')))).toBe('INVALID_INPUT');
    expect(codeOf(() => decrypt(new Uint8Array(31), new Uint8Array(40)))).toBe('INVALID_INPUT');
  });

  test('refuses data that is too short to hold an IV and a tag', () => {
    expect(codeOf(() => decrypt(key(), new Uint8Array(27)))).toBe('DECRYPT_FAILED');
    expect(codeOf(() => decrypt(key(), new Uint8Array(0)))).toBe('DECRYPT_FAILED');
  });

  test('encrypting nothing works and is still authenticated', () => {
    const sealed = encrypt(key(), new Uint8Array(0));
    expect(sealed).toHaveLength(28);
    expect(decrypt(key(), sealed)).toHaveLength(0);
    sealed[sealed.length - 1]! ^= 1;
    expect(codeOf(() => decrypt(key(), sealed))).toBe('DECRYPT_FAILED');
  });

  test('flipping any single byte of IV, ciphertext or tag is detected', () => {
    const sealed = encrypt(key(), utf8Encode('hello world'));
    for (let i = 0; i < sealed.length; i++) {
      const copy = Uint8Array.from(sealed);
      copy[i]! ^= 0x80;
      expect(codeOf(() => decrypt(key(), copy))).toBe('DECRYPT_FAILED');
    }
  });

  test('a wrong key fails the same way as damaged data', () => {
    const sealed = encrypt(key(), utf8Encode('secret'));
    expect(codeOf(() => decrypt(new Uint8Array(32).fill(1), sealed))).toBe('DECRYPT_FAILED');
  });

  test('two encryptions of the same data differ (fresh IV)', () => {
    const a = encrypt(key(), utf8Encode('same'));
    const b = encrypt(key(), utf8Encode('same'));
    expect(bytesEqual(a, b)).toBe(false);
    expect(bytesEqual(a.subarray(0, 12), b.subarray(0, 12))).toBe(false);
  });
});

describe('key wrapping', () => {
  test('refuses to wrap something that is not a 32-byte key', () => {
    expect(codeOf(() => wrapKey(key(), new Uint8Array(31)))).toBe('INVALID_INPUT');
    expect(codeOf(() => wrapKey(key(), new Uint8Array(33)))).toBe('INVALID_INPUT');
  });

  test('round trips a key, and the wrapped form is 60 bytes', () => {
    const inner = generateRandomBytes(32);
    const wrapped = wrapKey(key(), inner);
    expect(wrapped).toHaveLength(60);
    expect(unwrapKey(key(), wrapped)).toEqual(inner);
  });

  test('refuses something that decrypts fine but is not a 32-byte key', () => {
    const notAKey = encrypt(key(), new Uint8Array(16));
    expect(codeOf(() => unwrapKey(key(), notAKey))).toBe('DECRYPT_FAILED');
  });

  test('a wrong wrapping key or a damaged blob cannot be told apart', () => {
    const wrapped = wrapKey(key(), generateRandomBytes(32));
    expect(codeOf(() => unwrapKey(new Uint8Array(32).fill(2), wrapped))).toBe('DECRYPT_FAILED');
    wrapped[20]! ^= 1;
    expect(codeOf(() => unwrapKey(key(), wrapped))).toBe('DECRYPT_FAILED');
  });
});

describe('Argon2id key derivation', () => {
  test('is deterministic for the same password, salt and settings, and different otherwise', async () => {
    const a = await deriveKeyFromPassword('correct horse', salt(), FAST);
    const b = await deriveKeyFromPassword('correct horse', salt(), FAST);
    const otherPassword = await deriveKeyFromPassword('correct horsf', salt(), FAST);
    const otherSalt = await deriveKeyFromPassword(
      'correct horse',
      new Uint8Array(16).fill(8),
      FAST,
    );
    expect(a).toHaveLength(KEY_LENGTH);
    expect(bytesEqual(a, b)).toBe(true);
    expect(bytesEqual(a, otherPassword)).toBe(false);
    expect(bytesEqual(a, otherSalt)).toBe(false);
  });

  test('matches a published Argon2id test vector shape: different settings give different keys', async () => {
    const base = await deriveKeyFromPassword('pw', salt(), FAST);
    const moreIterations = await deriveKeyFromPassword('pw', salt(), { ...FAST, iterations: 3 });
    const moreMemory = await deriveKeyFromPassword('pw', salt(), { ...FAST, memoryKiB: 20 * 1024 });
    expect(bytesEqual(base, moreIterations)).toBe(false);
    expect(bytesEqual(base, moreMemory)).toBe(false);
  });

  test('the same password typed as composed or decomposed characters gives the same key (NFKC)', async () => {
    const composed = await deriveKeyFromPassword('café-pass-phrase', salt(), FAST);
    const decomposed = await deriveKeyFromPassword('café-pass-phrase', salt(), FAST);
    expect(bytesEqual(composed, decomposed)).toBe(true);
  });

  test('a password given as bytes is used as is and is not wiped for the caller', async () => {
    const bytes = utf8Encode('byte password');
    await deriveKeyFromPassword(bytes, salt(), FAST);
    expect(utf8Decode(bytes)).toBe('byte password');
  });

  test('refuses an empty password and a short salt', async () => {
    expect(await codeOfAsync(() => deriveKeyFromPassword('', salt(), FAST))).toBe('INVALID_INPUT');
    expect(await codeOfAsync(() => deriveKeyFromPassword(new Uint8Array(0), salt(), FAST))).toBe(
      'INVALID_INPUT',
    );
    expect(await codeOfAsync(() => deriveKeyFromPassword('x', new Uint8Array(8), FAST))).toBe(
      'INVALID_INPUT',
    );
  });

  test.each<[string, Partial<KdfParams>]>([
    ['memory below the floor', { memoryKiB: 1024 }],
    ['memory above the ceiling', { memoryKiB: 2 * 1024 * 1024 }],
    ['fractional memory', { memoryKiB: 19 * 1024 + 0.5 }],
    ['one iteration', { iterations: 1 }],
    ['too many iterations', { iterations: 21 }],
    ['fractional iterations', { iterations: 2.5 }],
    ['zero lanes', { parallelism: 0 }],
    ['too many lanes', { parallelism: 9 }],
    ['an old Argon2 version', { version: 16 as 19 }],
    ['another algorithm', { algorithm: 'argon2i' as 'argon2id' }],
  ])('a tampered header with %s is refused before any work is done', async (_name, change) => {
    expect(
      await codeOfAsync(() => deriveKeyFromPassword('pw', salt(), { ...FAST, ...change })),
    ).toBe('INVALID_INPUT');
  });

  test('an Argon2 failure becomes KDF_FAILED without details', async () => {
    let result: string | undefined;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../engine', () => ({
        ...jest.requireActual('../engine'),
        argon2: (_a: unknown, _p: unknown, done: (e: Error | null) => void) =>
          done(new Error('boom with secrets')),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { deriveKeyFromPassword: broken } = require('../kdf') as typeof import('../kdf');
      try {
        await broken('pw', salt(), FAST);
      } catch (e) {
        result = `${(e as CryptoError).code}|${(e as Error).message}`;
      }
    });
    jest.dontMock('../engine');
    expect(result).toBe('KDF_FAILED|Key derivation failed.');
  });

  test('a result of the wrong length is also a failure', async () => {
    let code: string | undefined;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../engine', () => ({
        ...jest.requireActual('../engine'),
        argon2: (_a: unknown, _p: unknown, done: (e: null, r: Uint8Array) => void) =>
          done(null, new Uint8Array(5)),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { deriveKeyFromPassword: broken } = require('../kdf') as typeof import('../kdf');
      try {
        await broken('pw', salt(), FAST);
      } catch (e) {
        code = (e as CryptoError).code;
      }
    });
    jest.dontMock('../engine');
    expect(code).toBe('KDF_FAILED');
  });
});

describe('wipe', () => {
  test('zeroes every array it is given and ignores null and undefined', () => {
    const a = Uint8Array.from([1, 2, 3]);
    const b = Uint8Array.from([4, 5]);
    wipe(a, null, b, undefined);
    expect([...a, ...b]).toEqual([0, 0, 0, 0, 0]);
  });
});
