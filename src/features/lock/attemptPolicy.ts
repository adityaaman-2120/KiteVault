// Delay between unlock tries after repeated wrong passwords. Pure logic, no storage.
export const FREE_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;

export type AttemptState = {
  failedAttempts: number;
  lastFailedAt: number; // epoch ms
};

export const EMPTY_ATTEMPT_STATE: AttemptState = { failedAttempts: 0, lastFailedAt: 0 };

// 0-4 failures: no delay. Then 30s, 1m, 2m, 4m, 8m, and 15m from then on.
export function delayAfterFailures(failedAttempts: number): number {
  if (failedAttempts < FREE_ATTEMPTS) return 0;
  const doublings = Math.min(failedAttempts - FREE_ATTEMPTS, 30);
  return Math.min(BASE_DELAY_MS * 2 ** doublings, MAX_DELAY_MS);
}

// Milliseconds until the next try is allowed (0 = allowed now).
export function remainingLockoutMs(state: AttemptState, now: number): number {
  const delay = delayAfterFailures(state.failedAttempts);
  if (delay === 0) return 0;
  const elapsed = now - state.lastFailedAt;
  // A clock moved backwards must not shorten the wait.
  if (elapsed < 0) return delay;
  return Math.max(0, delay - elapsed);
}

// Anything unreadable counts as "no failures" rather than blocking the owner out.
export function parseAttemptState(raw: unknown): AttemptState {
  const value = raw as Partial<AttemptState> | null;
  if (
    typeof value === 'object' &&
    value !== null &&
    Number.isInteger(value.failedAttempts) &&
    (value.failedAttempts as number) >= 0 &&
    Number.isFinite(value.lastFailedAt)
  ) {
    return { failedAttempts: value.failedAttempts!, lastFailedAt: value.lastFailedAt! };
  }
  return EMPTY_ATTEMPT_STATE;
}
