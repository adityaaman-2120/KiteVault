import { Buffer } from './engine';

export function utf8Encode(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, 'utf8'));
}

export function utf8Decode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('utf8');
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

// Returns null unless the text is canonical base64 (so malformed headers are rejected, not guessed at).
export function fromBase64(text: string): Uint8Array | null {
  const bytes = Uint8Array.from(Buffer.from(text, 'base64'));
  return toBase64(bytes) === text ? bytes : null;
}

// Compares in constant time with respect to the contents.
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
