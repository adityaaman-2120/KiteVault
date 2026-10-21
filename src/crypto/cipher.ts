import { Buffer, createCipheriv, createDecipheriv } from './engine';
import { CryptoError } from './errors';
import { KEY_LENGTH } from './kdf';
import { generateRandomBytes } from './random';
import { wipe } from './wipe';

export const IV_LENGTH = 12;
export const TAG_LENGTH = 16;

function assertKey(key: Uint8Array): void {
  if (key.length !== KEY_LENGTH) {
    throw new CryptoError('INVALID_INPUT', `Key must be ${KEY_LENGTH} bytes.`);
  }
}

// AES-256-GCM with a fresh random 12-byte IV on every call.
// Output layout: iv (12) | ciphertext | tag (16).
export function encrypt(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  assertKey(key);
  const iv = generateRandomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
  const body = cipher.update(plaintext);
  const rest = cipher.final();
  const tag = cipher.getAuthTag();

  const out = new Uint8Array(IV_LENGTH + body.length + rest.length + TAG_LENGTH);
  out.set(iv, 0);
  out.set(body, IV_LENGTH);
  out.set(rest, IV_LENGTH + body.length);
  out.set(tag, IV_LENGTH + body.length + rest.length);
  return out;
}

// Throws CryptoError('DECRYPT_FAILED') for a wrong key or any modified data. The two cases
// are deliberately indistinguishable.
export function decrypt(key: Uint8Array, blob: Uint8Array): Uint8Array {
  assertKey(key);
  if (blob.length < IV_LENGTH + TAG_LENGTH) {
    throw new CryptoError('DECRYPT_FAILED', 'Decryption failed: wrong key or corrupted data.');
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(blob.length - TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - TAG_LENGTH);

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(Buffer.from(tag));
    const body = decipher.update(ciphertext);
    const rest = decipher.final(); // throws if the tag does not match
    const out = new Uint8Array(body.length + rest.length);
    out.set(body, 0);
    out.set(rest, body.length);
    wipe(body, rest); // intermediate plaintext copies
    return out;
  } catch {
    throw new CryptoError('DECRYPT_FAILED', 'Decryption failed: wrong key or corrupted data.');
  }
}
