// Decides when to lock. Pure logic with injected clock and timers so it can be tested exactly;
// useAutoLock.ts connects it to React Native.
export type AutoLockConfig = {
  // 0 locks the moment the app leaves the foreground.
  backgroundTimeoutMs: number;
  inactivityTimeoutMs: number;
};

type Timer = unknown;

export type AutoLockDeps = {
  getConfig: () => AutoLockConfig;
  lock: () => void;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
};

export type AutoLock = {
  setUnlocked: (unlocked: boolean) => void;
  appStateChanged: (next: string) => void;
  activity: () => void;
  dispose: () => void;
};

export function createAutoLock(deps: AutoLockDeps): AutoLock {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer as number));

  let unlocked = false;
  let foreground = true;
  let backgroundedAt: number | null = null;
  let inactivityTimer: Timer | null = null;
  let backgroundTimer: Timer | null = null;

  function stopTimers() {
    if (inactivityTimer !== null) clearTimer(inactivityTimer);
    if (backgroundTimer !== null) clearTimer(backgroundTimer);
    inactivityTimer = null;
    backgroundTimer = null;
  }

  function lockNow() {
    if (!unlocked) return;
    unlocked = false;
    stopTimers();
    deps.lock();
  }

  function startInactivityTimer() {
    if (inactivityTimer !== null) clearTimer(inactivityTimer);
    inactivityTimer = null;
    if (!unlocked || !foreground) return;
    inactivityTimer = setTimer(lockNow, deps.getConfig().inactivityTimeoutMs);
  }

  return {
    setUnlocked(value) {
      unlocked = value;
      if (value) startInactivityTimer();
      else stopTimers();
    },

    activity() {
      if (unlocked && foreground) startInactivityTimer();
    },

    appStateChanged(next) {
      if (next === 'active') {
        if (foreground) return;
        foreground = true;
        const since = backgroundedAt;
        backgroundedAt = null;
        if (backgroundTimer !== null) clearTimer(backgroundTimer);
        backgroundTimer = null;
        // Timers can be paused while the app is in the background, so compare clock times.
        // A clock that went backwards (negative elapsed time) locks too, to be safe.
        if (unlocked && since !== null) {
          const elapsed = now() - since;
          if (elapsed < 0 || elapsed >= deps.getConfig().backgroundTimeoutMs) lockNow();
          else startInactivityTimer();
        }
        return;
      }

      if (!foreground) return; // already counted as backgrounded
      foreground = false;
      backgroundedAt = now();
      if (inactivityTimer !== null) clearTimer(inactivityTimer);
      inactivityTimer = null;
      if (!unlocked) return;
      const timeout = deps.getConfig().backgroundTimeoutMs;
      if (timeout <= 0) lockNow();
      else backgroundTimer = setTimer(lockNow, timeout);
    },

    dispose() {
      unlocked = false;
      stopTimers();
    },
  };
}
