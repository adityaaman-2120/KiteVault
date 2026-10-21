import { deleteJsonFile, readJsonFile, writeJsonFile } from '@/storage/jsonFile';
import { createVault, lockVault, useVaultStore, VaultError } from '@/vault';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import {
  clearAttemptState,
  loadAttemptState,
  LockoutError,
  unlockWithAttemptLimit,
} from '../unlockService';

const PASSWORD = 'correct horse battery staple';
const wrong = (now?: () => number) => unlockWithAttemptLimit('wrong password', now);

let clock = 1_000_000;
const now = () => clock;

beforeEach(async () => {
  resetVaultFiles();
  clearAttemptState();
  useVaultStore.setState({ data: null });
  clock = 1_000_000;
  await createVault(PASSWORD, { kdfParams: FAST_KDF });
  lockVault();
});
afterAll(() => {
  resetVaultFiles();
  deleteJsonFile('unlock-attempts.json');
});

test('a correct password unlocks and leaves no failure count', async () => {
  await unlockWithAttemptLimit(PASSWORD, now);
  expect(useVaultStore.getState().data).not.toBeNull();
  expect(await loadAttemptState()).toEqual({ failedAttempts: 0, lastFailedAt: 0 });
});

test('the first 4 wrong passwords fail with no delay', async () => {
  for (let i = 1; i <= 4; i++) {
    await expect(wrong(now)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect((await loadAttemptState()).failedAttempts).toBe(i);
  }
  // Still allowed to try, and the right password works.
  await expect(unlockWithAttemptLimit(PASSWORD, now)).resolves.toBeUndefined();
});

test('after 5 wrong passwords further tries are refused until the delay passes', async () => {
  for (let i = 0; i < 5; i++) await expect(wrong(now)).rejects.toBeInstanceOf(VaultError);

  const original = useVaultStore.getState().unlock;
  const unlockSpy = jest.fn(original);
  useVaultStore.setState({ unlock: unlockSpy });
  // Even the correct password is refused during the delay.
  const attempt = unlockWithAttemptLimit(PASSWORD, now);
  await expect(attempt).rejects.toBeInstanceOf(LockoutError);
  await expect(attempt).rejects.toMatchObject({ remainingMs: 30_000 });
  expect(unlockSpy).not.toHaveBeenCalled();

  clock += 29_999;
  await expect(unlockWithAttemptLimit(PASSWORD, now)).rejects.toMatchObject({ remainingMs: 1 });

  clock += 1;
  await expect(unlockWithAttemptLimit(PASSWORD, now)).resolves.toBeUndefined();
  expect(await loadAttemptState()).toEqual({ failedAttempts: 0, lastFailedAt: 0 });
  useVaultStore.setState({ unlock: original });
});

test('the delay grows with every further wrong password', async () => {
  for (let i = 0; i < 5; i++) await wrong(now).catch(() => {});
  const waits: number[] = [];
  for (let i = 0; i < 3; i++) {
    clock += 15 * 60_000; // wait out whatever delay applies
    await wrong(now).catch(() => {});
    await unlockWithAttemptLimit(PASSWORD, now).catch((e) => waits.push(e.remainingMs));
  }
  expect(waits).toEqual([60_000, 120_000, 240_000]);
});

test('the failure count survives restarting the app', async () => {
  for (let i = 0; i < 5; i++) await wrong(now).catch(() => {});
  // A restart loses all in-memory state; only the file remains.
  useVaultStore.setState({ data: null });
  expect(await readJsonFile('unlock-attempts.json')).toEqual({
    failedAttempts: 5,
    lastFailedAt: clock,
  });
  await expect(unlockWithAttemptLimit(PASSWORD, now)).rejects.toBeInstanceOf(LockoutError);
});

test('the attempt is counted before the password is checked', async () => {
  let countedDuringCheck = -1;
  const original = useVaultStore.getState().unlock;
  useVaultStore.setState({
    unlock: async (password: string) => {
      countedDuringCheck = (await loadAttemptState()).failedAttempts;
      return original(password);
    },
  });
  await unlockWithAttemptLimit(PASSWORD, now);
  useVaultStore.setState({ unlock: original });
  expect(countedDuringCheck).toBe(1);
});

test('a damaged or missing vault does not count as a wrong password', async () => {
  resetVaultFiles(); // no vault file any more
  await expect(unlockWithAttemptLimit('anything', now)).rejects.toMatchObject({
    code: 'NO_VAULT',
  });
  expect(await loadAttemptState()).toEqual({ failedAttempts: 0, lastFailedAt: 0 });
});

test('an unreadable counter file is treated as no failures', async () => {
  await writeJsonFile('unlock-attempts.json', { failedAttempts: 'lots' });
  await expect(unlockWithAttemptLimit(PASSWORD, now)).resolves.toBeUndefined();
});
