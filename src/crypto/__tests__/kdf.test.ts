import { argon2 } from '../engine';
import {
  CryptoError,
  DEFAULT_KDF_PARAMS,
  deriveKeyFromPassword,
  generateRandomBytes,
  KEY_LENGTH,
  type KdfParams,
} from '..';

// Cheaper than the production default, still above the enforced floor.
const FAST: KdfParams = { ...DEFAULT_KDF_PARAMS, memoryKiB: 19 * 1024, iterations: 2 };
const salt = () => new Uint8Array(16).fill(1);

describe('deriveKeyFromPassword', () => {
  test('returns a 32-byte key and is deterministic', async () => {
    const a = await deriveKeyFromPassword('correct horse', salt(), FAST);
    const b = await deriveKeyFromPassword('correct horse', salt(), FAST);
    expect(a.length).toBe(KEY_LENGTH);
    expect(a).toEqual(b);
  });

  test('different password, salt, or params give a different key', async () => {
    const base = await deriveKeyFromPassword('correct horse', salt(), FAST);
    const otherSalt = salt();
    otherSalt[0] = 2;
    expect(await deriveKeyFromPassword('correct horsf', salt(), FAST)).not.toEqual(base);
    expect(await deriveKeyFromPassword('correct horse', otherSalt, FAST)).not.toEqual(base);
    expect(
      await deriveKeyFromPassword('correct horse', salt(), { ...FAST, iterations: 3 }),
    ).not.toEqual(base);
  });

  test('canonically equivalent unicode passwords give the same key', async () => {
    const composed = await deriveKeyFromPassword('café', salt(), FAST);
    const decomposed = await deriveKeyFromPassword('café', salt(), FAST);
    expect(decomposed).toEqual(composed);
  });

  test('string and byte-array passwords agree, and bytes are left untouched', async () => {
    const bytes = new Uint8Array(Buffer.from('correct horse', 'utf8'));
    const fromBytes = await deriveKeyFromPassword(bytes, salt(), FAST);
    expect(fromBytes).toEqual(await deriveKeyFromPassword('correct horse', salt(), FAST));
    expect(bytes.some((b) => b !== 0)).toBe(true);
  });

  test('works with a random salt and the default parameters', async () => {
    const key = await deriveKeyFromPassword('pw', generateRandomBytes(16));
    expect(key.length).toBe(KEY_LENGTH);
  });

  test('rejects empty password, short salt, and unsafe parameters', async () => {
    await expect(deriveKeyFromPassword('', salt(), FAST)).rejects.toThrow(CryptoError);
    await expect(deriveKeyFromPassword('pw', new Uint8Array(8), FAST)).rejects.toThrow(CryptoError);
    const weak = [
      { ...FAST, memoryKiB: 1024 },
      { ...FAST, iterations: 1 },
      { ...FAST, parallelism: 0 },
      { ...FAST, memoryKiB: 4 * 1024 * 1024 },
      { ...FAST, algorithm: 'argon2i' as unknown as 'argon2id' },
    ];
    for (const params of weak) {
      await expect(deriveKeyFromPassword('pw', salt(), params)).rejects.toThrow(
        /unsafe KDF parameters/,
      );
    }
  });
});

// RFC 9106 section 5.3, Argon2id test vector. It uses a secret and associated data, which our
// wrapper does not expose, so this checks the underlying library and our parameter mapping.
test('Argon2id matches the RFC 9106 test vector', async () => {
  const tag = await new Promise<Uint8Array>((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: new Uint8Array(32).fill(1),
        nonce: new Uint8Array(16).fill(2),
        secret: new Uint8Array(8).fill(3),
        associatedData: new Uint8Array(12).fill(4),
        parallelism: 4,
        tagLength: 32,
        memory: 32,
        passes: 3,
        version: 19,
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
  });
  expect(Buffer.from(tag).toString('hex')).toBe(
    '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659',
  );
});
