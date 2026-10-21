import { CryptoError } from './errors';
import { randomBytes } from './engine';

const MAX_BYTES = 1024 * 1024;

// Cryptographically secure random bytes from the OS-backed OpenSSL generator.
export function generateRandomBytes(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 1 || n > MAX_BYTES) {
    throw new CryptoError(
      'INVALID_INPUT',
      'Random byte count must be an integer from 1 to 1048576.',
    );
  }
  const bytes = randomBytes(n);
  if (bytes.length !== n) {
    throw new CryptoError('RANDOM_FAILED', 'Random generator returned the wrong length.');
  }
  return bytes;
}
