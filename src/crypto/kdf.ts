import { argon2, Buffer } from './engine';
import { CryptoError } from './errors';
import { wipe } from './wipe';

export const KEY_LENGTH = 32;
export const SALT_LENGTH = 16;

// Stored in the vault header so the cost can be raised later without breaking old vaults.
export type KdfParams = {
  algorithm: 'argon2id';
  version: 19; // Argon2 v1.3 (0x13)
  memoryKiB: number;
  iterations: number;
  parallelism: number;
};

// 64 MiB, 3 passes, 1 lane: above the OWASP minimum and roughly 1s on a mid-range phone.
export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: 'argon2id',
  version: 19,
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
};

// Floor stops a tampered header from weakening the KDF; ceiling stops it from exhausting memory.
const MIN_MEMORY_KIB = 19 * 1024;
const MAX_MEMORY_KIB = 1024 * 1024;
const MAX_ITERATIONS = 20;
const MAX_PARALLELISM = 8;

function validateParams(params: KdfParams): void {
  const ok =
    params.algorithm === 'argon2id' &&
    params.version === 19 &&
    Number.isInteger(params.memoryKiB) &&
    params.memoryKiB >= MIN_MEMORY_KIB &&
    params.memoryKiB <= MAX_MEMORY_KIB &&
    Number.isInteger(params.iterations) &&
    params.iterations >= 2 &&
    params.iterations <= MAX_ITERATIONS &&
    Number.isInteger(params.parallelism) &&
    params.parallelism >= 1 &&
    params.parallelism <= MAX_PARALLELISM;
  if (!ok) throw new CryptoError('INVALID_INPUT', 'Unsupported or unsafe KDF parameters.');
}

// Turns the master password into a 32-byte key with Argon2id. The caller owns (and should wipe)
// the returned key. Strings are normalized to NFKC so the same password typed on different
// keyboards gives the same key.
export async function deriveKeyFromPassword(
  password: string | Uint8Array,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<Uint8Array> {
  validateParams(params);
  if (salt.length < SALT_LENGTH) {
    throw new CryptoError('INVALID_INPUT', `Salt must be at least ${SALT_LENGTH} bytes.`);
  }
  const message =
    typeof password === 'string' ? Buffer.from(password.normalize('NFKC'), 'utf8') : password;
  if (message.length === 0) throw new CryptoError('INVALID_INPUT', 'Password must not be empty.');

  try {
    const key = await new Promise<Uint8Array>((resolve, reject) => {
      argon2(
        'argon2id',
        {
          message,
          nonce: salt,
          parallelism: params.parallelism,
          tagLength: KEY_LENGTH,
          memory: params.memoryKiB,
          passes: params.iterations,
          version: params.version,
        },
        (err, result) => (err ? reject(err) : resolve(result)),
      );
    });
    if (key.length !== KEY_LENGTH) throw new Error('bad length');
    return key;
  } catch {
    throw new CryptoError('KDF_FAILED', 'Key derivation failed.');
  } finally {
    // Only wipe the buffer we created; a caller-supplied one stays theirs.
    if (typeof password === 'string') wipe(message);
  }
}
