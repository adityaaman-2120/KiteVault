// Clears a copied secret from the clipboard after a delay, but only if the clipboard still holds
// exactly what we put there (so something the user copied meanwhile is never wiped).
//
// Pure logic with injected clipboard, clock and timers so every rule can be unit tested.
type Timer = unknown;

export type ClipboardCleanerDeps = {
  read: () => Promise<string>;
  write: (text: string) => Promise<void>;
  // Android 10+ lets only the app in the foreground read the clipboard.
  isForeground: () => boolean;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
};

export type ClipboardCleaner = {
  // Copies `value`. With `clearAfterMs` null (or 0) it is never cleared automatically.
  copy: (value: string, clearAfterMs: number | null) => Promise<void>;
  // Call when the app comes back to the foreground: finishes a clear that was due meanwhile.
  appForegrounded: () => void;
  // Forgets the pending clear (the clipboard is left alone).
  cancel: () => void;
};

type Pending = { value: string; dueAt: number };

export function createClipboardCleaner(deps: ClipboardCleanerDeps): ClipboardCleaner {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer as number));

  let pending: Pending | null = null;
  let timer: Timer | null = null;

  function stopTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  async function attemptClear() {
    const target = pending;
    if (!target || now() < target.dueAt) return;
    // In the background we cannot read the clipboard, so we cannot tell if it is still ours.
    // Keep waiting; appForegrounded() will try again.
    if (!deps.isForeground()) return;

    try {
      const current = await deps.read();
      // A newer copy may have replaced this one while we were reading.
      if (pending !== target) return;
      if (current === target.value) await deps.write('');
    } catch {
      // If we cannot read it we do not touch it: wiping blindly could destroy the user's data.
    }
    if (pending === target) pending = null;
  }

  return {
    async copy(value, clearAfterMs) {
      stopTimer();
      pending = null;
      await deps.write(value);
      if (!clearAfterMs || clearAfterMs <= 0) return;
      pending = { value, dueAt: now() + clearAfterMs };
      timer = setTimer(() => void attemptClear(), clearAfterMs);
    },

    appForegrounded() {
      void attemptClear();
    },

    cancel() {
      stopTimer();
      pending = null;
    },
  };
}
