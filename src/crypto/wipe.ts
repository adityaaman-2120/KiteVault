// Best effort only: zeroes this buffer, but JavaScript may have made copies we cannot reach
// (strings are immutable, the GC can move memory). See docs/DECISIONS.md.
export function wipe(...buffers: (Uint8Array | null | undefined)[]): void {
  for (const buffer of buffers) {
    buffer?.fill(0);
  }
}
