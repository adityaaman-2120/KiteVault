import { deleteJsonFile, readJsonFile, writeJsonFile } from '@/storage/jsonFile';
import { useVaultStore, VaultError } from '@/vault';

import {
  EMPTY_ATTEMPT_STATE,
  parseAttemptState,
  remainingLockoutMs,
  type AttemptState,
} from './attemptPolicy';

const ATTEMPTS_FILE = 'unlock-attempts.json';

export class LockoutError extends Error {
  readonly remainingMs: number;

  constructor(remainingMs: number) {
    super('Too many attempts. Please wait before trying again.');
    this.name = 'LockoutError';
    this.remainingMs = remainingMs;
  }
}

export async function loadAttemptState(): Promise<AttemptState> {
  return parseAttemptState(await readJsonFile(ATTEMPTS_FILE));
}

export function clearAttemptState(): void {
  deleteJsonFile(ATTEMPTS_FILE);
}

// Unlocks the vault, enforcing the delay after repeated wrong passwords. All unlock attempts
// should go through here rather than calling the vault store directly.
//
// The counter lives in a small file in the app-private folder so closing the app does not reset
// it. It is a guard against guessing on the phone itself; it does not protect a copy of the
// vault file, which is protected by Argon2id and the password's strength alone.
export async function unlockWithAttemptLimit(
  password: string,
  now: () => number = Date.now,
): Promise<void> {
  const before = await loadAttemptState();
  const remaining = remainingLockoutMs(before, now());
  if (remaining > 0) throw new LockoutError(remaining);

  // Count the attempt first, so killing the app mid-check does not give a free guess.
  await writeJsonFile(ATTEMPTS_FILE, {
    failedAttempts: before.failedAttempts + 1,
    lastFailedAt: now(),
  } satisfies AttemptState);

  try {
    await useVaultStore.getState().unlock(password);
  } catch (error) {
    // Only a wrong password counts against the user; a damaged or missing file does not.
    if (!(error instanceof VaultError) || error.code !== 'WRONG_PASSWORD') {
      await writeJsonFile(ATTEMPTS_FILE, before);
    }
    throw error;
  }
  clearAttemptState();
}

export { EMPTY_ATTEMPT_STATE };
