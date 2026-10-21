import {
  fromBase64,
  IV_LENGTH,
  KEY_LENGTH,
  SALT_LENGTH,
  TAG_LENGTH,
  toBase64,
  utf8Decode,
  utf8Encode,
  type KdfParams,
} from '@/crypto';

import { VaultError } from './errors';

// File layout (see docs/DECISIONS.md):
//   "KVLT" (4 bytes) | header length (uint16, big endian) | header (UTF-8 JSON) | body
// The body is the AES-256-GCM encrypted vault JSON: iv (12) | ciphertext | tag (16).
export const FORMAT_VERSION = 1;

const MAGIC = utf8Encode('KVLT');
const MAX_HEADER_BYTES = 4096;
// A wrapped vault key is iv + 32-byte key + tag.
const WRAPPED_KEY_LENGTH = IV_LENGTH + KEY_LENGTH + TAG_LENGTH;
const MIN_BODY_LENGTH = IV_LENGTH + TAG_LENGTH;

export type VaultHeader = {
  formatVersion: number;
  kdf: KdfParams;
  salt: Uint8Array;
  wrappedKey: Uint8Array;
};

const corrupted = () => new VaultError('CORRUPTED', 'The vault file is damaged.');

export function encodeVaultFile(header: VaultHeader, body: Uint8Array): Uint8Array {
  const headerBytes = utf8Encode(
    JSON.stringify({
      formatVersion: header.formatVersion,
      kdf: header.kdf,
      salt: toBase64(header.salt),
      wrappedKey: toBase64(header.wrappedKey),
    }),
  );
  const out = new Uint8Array(MAGIC.length + 2 + headerBytes.length + body.length);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint16(MAGIC.length, headerBytes.length, false);
  out.set(headerBytes, MAGIC.length + 2);
  out.set(body, MAGIC.length + 2 + headerBytes.length);
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseKdf(value: unknown): KdfParams {
  if (
    !isRecord(value) ||
    value.algorithm !== 'argon2id' ||
    value.version !== 19 ||
    typeof value.memoryKiB !== 'number' ||
    typeof value.iterations !== 'number' ||
    typeof value.parallelism !== 'number'
  ) {
    throw corrupted();
  }
  // Numeric limits are enforced when the key is derived.
  return {
    algorithm: 'argon2id',
    version: 19,
    memoryKiB: value.memoryKiB,
    iterations: value.iterations,
    parallelism: value.parallelism,
  };
}

// Throws VaultError('CORRUPTED') or ('UNSUPPORTED_VERSION'). Does not need any key.
export function decodeVaultFile(bytes: Uint8Array): { header: VaultHeader; body: Uint8Array } {
  if (bytes.length < MAGIC.length + 2) throw corrupted();
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw corrupted();
  }
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
    MAGIC.length,
    false,
  );
  const headerStart = MAGIC.length + 2;
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES) throw corrupted();
  if (bytes.length < headerStart + headerLength + MIN_BODY_LENGTH) throw corrupted();

  let raw: unknown;
  try {
    raw = JSON.parse(utf8Decode(bytes.subarray(headerStart, headerStart + headerLength)));
  } catch {
    throw corrupted();
  }
  if (!isRecord(raw) || typeof raw.formatVersion !== 'number') throw corrupted();
  if (raw.formatVersion !== FORMAT_VERSION) {
    throw new VaultError(
      'UNSUPPORTED_VERSION',
      'This vault was created by a different version of KiteVault.',
    );
  }

  const salt = typeof raw.salt === 'string' ? fromBase64(raw.salt) : null;
  const wrappedKey = typeof raw.wrappedKey === 'string' ? fromBase64(raw.wrappedKey) : null;
  if (!salt || salt.length < SALT_LENGTH) throw corrupted();
  if (!wrappedKey || wrappedKey.length !== WRAPPED_KEY_LENGTH) throw corrupted();

  return {
    header: { formatVersion: FORMAT_VERSION, kdf: parseKdf(raw.kdf), salt, wrappedKey },
    body: bytes.slice(headerStart + headerLength),
  };
}

// Cheap structural check used by storage to tell a complete file from a damaged one.
export function isWellFormedVaultFile(bytes: Uint8Array): boolean {
  try {
    decodeVaultFile(bytes);
    return true;
  } catch {
    return false;
  }
}
