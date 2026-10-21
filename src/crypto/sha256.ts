import { createHash } from './engine';

// SHA-256 from the vetted native library (used for a typo-detecting checksum, not for secrecy).
export function sha256(data: Uint8Array): Uint8Array {
  return Uint8Array.from(createHash('sha256').update(data).digest());
}
