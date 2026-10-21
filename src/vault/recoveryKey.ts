import { generateRandomBytes, sha256, utf8Encode, wipe, bytesEqual } from '@/crypto';

// A recovery key is 256 random bits that can wrap the vault key (see vault.ts). To write it down
// it is shown as 8 groups of 7 characters:
//
//   32 bytes of key + 3 bytes of checksum = 35 bytes = 280 bits = 56 characters (5 bits each)
//
// The characters are Crockford base32: digits and capital letters without I, L, O and U, so
// nothing is easily mistaken for something else. When the key is typed back in, lower case, spaces
// and hyphens are ignored, and O is read as 0, I and L as 1. The checksum (the first 3 bytes of a
// SHA-256 of the key with a fixed label in front) catches a typo before anything is tried, with a
// 1 in 16 million chance of missing one. It reveals 24 bits of a hash of the key, which leaves
// 232 bits to guess: nothing an attacker can use.

export const RECOVERY_KEY_BYTES = 32;
const CHECKSUM_BYTES = 3;
const TOTAL_BYTES = RECOVERY_KEY_BYTES + CHECKSUM_BYTES;
export const RECOVERY_GROUPS = 8;
export const RECOVERY_GROUP_LENGTH = 7;
export const RECOVERY_KEY_CHARACTERS = RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LABEL = utf8Encode('KiteVault recovery key v1');

export class RecoveryKeyFormatError extends Error {
  readonly reason: 'LENGTH' | 'CHARACTER' | 'CHECKSUM';

  constructor(reason: RecoveryKeyFormatError['reason']) {
    super(`Invalid recovery key (${reason}).`);
    this.name = 'RecoveryKeyFormatError';
    this.reason = reason;
  }
}

// --- base32 (plain encoding, no secrets involved) ----------------------------------------------

export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1; // keep only the bits not written yet
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// Returns null if a character is not in the alphabet. `characters` must be a multiple of 8 long.
export function decodeBase32(characters: string): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of characters) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Uint8Array.from(out);
}

// --- the recovery key --------------------------------------------------------------------------

export function generateRecoveryKey(): Uint8Array {
  return generateRandomBytes(RECOVERY_KEY_BYTES);
}

function checksum(key: Uint8Array): Uint8Array {
  const input = new Uint8Array(LABEL.length + key.length);
  input.set(LABEL, 0);
  input.set(key, LABEL.length);
  try {
    return sha256(input).slice(0, CHECKSUM_BYTES);
  } finally {
    wipe(input);
  }
}

// The text to write down: 8 groups of 7 characters, for example "7K3M9QX-...".
export function formatRecoveryKey(key: Uint8Array): string {
  if (key.length !== RECOVERY_KEY_BYTES) throw new RangeError('A recovery key is 32 bytes.');
  const all = new Uint8Array(TOTAL_BYTES);
  all.set(key, 0);
  all.set(checksum(key), RECOVERY_KEY_BYTES);
  const text = encodeBase32(all);
  wipe(all);
  const groups: string[] = [];
  for (let i = 0; i < RECOVERY_GROUPS; i++) {
    groups.push(text.slice(i * RECOVERY_GROUP_LENGTH, (i + 1) * RECOVERY_GROUP_LENGTH));
  }
  return groups.join('-');
}

// Typed text as the key's characters only: capitals, no spaces or hyphens, and the look-alikes
// O, I and L read as 0, 1 and 1.
export function normalizeRecoveryText(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

// Turns typed text back into the 32-byte key. Throws RecoveryKeyFormatError for a wrong length,
// a character that cannot be part of a key, or a checksum that does not match (a typo).
export function parseRecoveryKey(input: string): Uint8Array {
  const cleaned = normalizeRecoveryText(input);
  if (cleaned.length !== RECOVERY_KEY_CHARACTERS) throw new RecoveryKeyFormatError('LENGTH');
  const bytes = decodeBase32(cleaned);
  if (!bytes || bytes.length !== TOTAL_BYTES) throw new RecoveryKeyFormatError('CHARACTER');

  const key = bytes.slice(0, RECOVERY_KEY_BYTES);
  const given = bytes.slice(RECOVERY_KEY_BYTES);
  const ok = bytesEqual(given, checksum(key));
  wipe(bytes);
  if (!ok) {
    wipe(key);
    throw new RecoveryKeyFormatError('CHECKSUM');
  }
  return key;
}

// How many of the typed characters count, for a live "12 of 56" counter.
export function countRecoveryCharacters(input: string): number {
  return input.replace(/[\s-]+/g, '').length;
}
