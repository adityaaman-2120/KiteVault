// Tiny pub/sub so any part of the UI can report "the user is still here" without
// depending on the lock feature.
const listeners = new Set<() => void>();

export function markActivity(): void {
  listeners.forEach((listener) => listener());
}

export function onActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
