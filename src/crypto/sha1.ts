import { createHash } from './engine';

// SHA-1 from the vetted native library. It is used ONLY because the Have I Been Pwned password
// list is indexed by SHA-1; it protects nothing here. Never use it for anything else.
export function sha1(data: Uint8Array): Uint8Array {
  return Uint8Array.from(createHash('sha1').update(data).digest());
}
