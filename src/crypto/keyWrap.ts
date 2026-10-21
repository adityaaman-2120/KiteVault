import { decrypt, encrypt } from './cipher';
import { CryptoError } from './errors';
import { KEY_LENGTH } from './kdf';
import { wipe } from './wipe';

// Wraps (encrypts) a 32-byte key under another 32-byte key using AES-256-GCM.
export function wrapKey(wrappingKey: Uint8Array, keyToWrap: Uint8Array): Uint8Array {
  if (keyToWrap.length !== KEY_LENGTH) {
    throw new CryptoError('INVALID_INPUT', `Key to wrap must be ${KEY_LENGTH} bytes.`);
  }
  return encrypt(wrappingKey, keyToWrap);
}

// Throws CryptoError('DECRYPT_FAILED') if the wrapping key is wrong or the blob was modified.
export function unwrapKey(wrappingKey: Uint8Array, wrapped: Uint8Array): Uint8Array {
  const key = decrypt(wrappingKey, wrapped);
  if (key.length !== KEY_LENGTH) {
    wipe(key);
    throw new CryptoError('DECRYPT_FAILED', 'Decryption failed: wrong key or corrupted data.');
  }
  return key;
}
