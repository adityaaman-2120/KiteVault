import {
  delayAfterFailures,
  EMPTY_ATTEMPT_STATE,
  FREE_ATTEMPTS,
  parseAttemptState,
  remainingLockoutMs,
} from '../attemptPolicy';

describe('delayAfterFailures', () => {
  test('no delay for the first 4 wrong attempts', () => {
    for (let n = 0; n < FREE_ATTEMPTS; n++) expect(delayAfterFailures(n)).toBe(0);
  });

  test('starts at 30 seconds on the 5th wrong attempt and doubles each time', () => {
    const seconds = [5, 6, 7, 8, 9].map((n) => delayAfterFailures(n) / 1000);
    expect(seconds).toEqual([30, 60, 120, 240, 480]);
  });

  test('is capped at 15 minutes, even for absurd counts', () => {
    expect(delayAfterFailures(10)).toBe(15 * 60_000);
    expect(delayAfterFailures(1_000_000)).toBe(15 * 60_000);
  });
});

describe('remainingLockoutMs', () => {
  const failedAt = 1_000_000;

  test('is zero below the threshold', () => {
    expect(remainingLockoutMs({ failedAttempts: 4, lastFailedAt: failedAt }, failedAt)).toBe(0);
    expect(remainingLockoutMs(EMPTY_ATTEMPT_STATE, failedAt)).toBe(0);
  });

  test('counts down from the last failure', () => {
    const state = { failedAttempts: 5, lastFailedAt: failedAt };
    expect(remainingLockoutMs(state, failedAt)).toBe(30_000);
    expect(remainingLockoutMs(state, failedAt + 12_000)).toBe(18_000);
    expect(remainingLockoutMs(state, failedAt + 30_000)).toBe(0);
    expect(remainingLockoutMs(state, failedAt + 99_000)).toBe(0);
  });

  test('uses the longer delay after more failures', () => {
    const state = { failedAttempts: 7, lastFailedAt: failedAt };
    expect(remainingLockoutMs(state, failedAt + 100_000)).toBe(20_000);
  });

  test('a clock set backwards does not shorten the wait', () => {
    const state = { failedAttempts: 5, lastFailedAt: failedAt };
    expect(remainingLockoutMs(state, failedAt - 3_600_000)).toBe(30_000);
  });
});

describe('parseAttemptState', () => {
  test('accepts a valid state', () => {
    expect(parseAttemptState({ failedAttempts: 3, lastFailedAt: 123 })).toEqual({
      failedAttempts: 3,
      lastFailedAt: 123,
    });
  });

  test.each([
    null,
    undefined,
    'x',
    5,
    [],
    {},
    { failedAttempts: -1, lastFailedAt: 1 },
    { failedAttempts: 1.5, lastFailedAt: 1 },
    { failedAttempts: 2, lastFailedAt: 'now' },
  ])('treats %j as no failures', (raw) => {
    expect(parseAttemptState(raw)).toEqual(EMPTY_ATTEMPT_STATE);
  });
});
