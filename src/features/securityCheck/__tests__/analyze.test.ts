import { evaluatePassword } from '@/features/onboarding/passwordStrength';
import { makeEntry } from '@/vault/__support__/testUtils';
import type { Entry } from '@/vault';

import {
  analyzeEntries,
  OLD_PASSWORD_MS,
  passwordSetAt,
  scoreLabel,
  type AnalyzeOptions,
} from '../analyze';
import { sha1Upper } from '../hibp';
import { hostOf, likelySupports2fa } from '../sites2fa';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const STRONG = 'k7#Qv9!zLm2$Rx8@Wp4&';

// A stand-in rating so most tests do not depend on zxcvbn: "weak..." is weak, the rest is fine.
const fakeRate: AnalyzeOptions['rate'] = (pw) => (pw.startsWith('weak') ? 0 : 4);
const run = (entries: Entry[], extra: Partial<AnalyzeOptions> = {}) =>
  analyzeEntries(entries, {
    now: NOW,
    rate: fakeRate,
    hash: sha1Upper,
    pause: async () => {},
    ...extra,
  });

const login = (id: string, password: string, over: Partial<Entry> = {}) =>
  makeEntry({
    id,
    title: `Site ${id}`,
    username: `user${id}`,
    password,
    urls: [`https://${id}.example`],
    totpSecret: undefined,
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    passwordHistory: [],
    ...over,
  });
const kinds = (r: Awaited<ReturnType<typeof run>>, id: string) =>
  r.issues.filter((i) => i.entryId === id).map((i) => i.kind);

describe('weak passwords (zxcvbn)', () => {
  test('flags the weak ones and leaves strong ones alone', async () => {
    const r = await run([login('a', 'weak-one'), login('b', STRONG + '1')]);
    expect(kinds(r, 'a')).toEqual(['weak']);
    expect(kinds(r, 'b')).toEqual([]);
  });

  test('with the real zxcvbn: common passwords are weak, a random one is not', async () => {
    const real: AnalyzeOptions['rate'] = (pw, inputs) => evaluatePassword(pw, inputs).score;
    const r = await run([login('a', 'password123'), login('b', 'qwertyuiop'), login('c', STRONG)], {
      rate: real,
    });
    expect(kinds(r, 'a')).toContain('weak');
    expect(kinds(r, 'b')).toContain('weak');
    expect(kinds(r, 'c')).not.toContain('weak');
  });

  test('words from the site or user name make a password easier to guess', () => {
    const alone = evaluatePassword('zorblaxqu7').score;
    const withInputs = evaluatePassword('zorblaxqu7', ['zorblaxqu7']).score;
    expect(withInputs).toBeLessThan(alone);
  });

  test('the same password is rated once', async () => {
    const rate = jest.fn(fakeRate);
    await run([login('a', 'dup-pass'), login('b', 'dup-pass'), login('c', 'dup-pass')], { rate });
    expect(rate).toHaveBeenCalledTimes(1);
  });
});

describe('reused passwords', () => {
  test('every login that shares a password is flagged, with how many others share it', async () => {
    const r = await run([
      login('a', 'same-pw'),
      login('b', 'same-pw'),
      login('c', 'same-pw'),
      login('d', 'other-pw'),
    ]);
    expect(r.counts.reused).toBe(3);
    expect(r.issues.find((i) => i.entryId === 'a' && i.kind === 'reused')!.detail).toContain(
      '2 other logins',
    );
    expect(kinds(r, 'd')).toEqual([]);
  });
  test('two logins: "1 other login"', async () => {
    const r = await run([login('a', 'same-pw'), login('b', 'same-pw')]);
    expect(r.issues[0]!.detail).toContain('1 other login.');
  });
  test('trashed entries and notes do not count as a second use', async () => {
    const r = await run([
      login('a', 'same-pw'),
      login('b', 'same-pw', { deletedAt: NOW }),
      makeEntry({ id: 'n', type: 'note', password: 'same-pw' }),
    ]);
    expect(r.counts.reused).toBe(0);
  });
});

describe('old passwords', () => {
  test('older than a year is flagged, newer is not', async () => {
    const r = await run([
      login('old', 'p1', { createdAt: NOW - 400 * DAY }),
      login('new', 'p2', { createdAt: NOW - 300 * DAY }),
    ]);
    expect(kinds(r, 'old')).toEqual(['old']);
    expect(kinds(r, 'new')).toEqual([]);
    expect(r.issues[0]!.detail).toContain('more than 1 year');
  });
  test('exactly one year is not yet old; a day more is', async () => {
    expect(kinds(await run([login('a', 'p', { createdAt: NOW - OLD_PASSWORD_MS })]), 'a')).toEqual(
      [],
    );
    expect(
      kinds(await run([login('a', 'p', { createdAt: NOW - OLD_PASSWORD_MS - DAY })]), 'a'),
    ).toEqual(['old']);
  });
  test('age counts from the last password change, not from when the entry was made', async () => {
    const changedRecently = login('a', 'p1', {
      createdAt: NOW - 900 * DAY,
      passwordHistory: [{ password: 'before', changedAt: NOW - 10 * DAY }],
    });
    const changedLongAgo = login('b', 'p2', {
      createdAt: NOW - 900 * DAY,
      passwordHistory: [{ password: 'before', changedAt: NOW - 500 * DAY }],
    });
    expect(passwordSetAt(changedRecently)).toBe(NOW - 10 * DAY);
    const r = await run([changedRecently, changedLongAgo]);
    expect(kinds(r, 'a')).toEqual([]);
    expect(kinds(r, 'b')).toEqual(['old']);
  });
  test('says how many years', async () => {
    const r = await run([login('a', 'p', { createdAt: NOW - 800 * DAY })]);
    expect(r.issues[0]!.detail).toContain('more than 2 years');
  });
});

describe('logins with no password', () => {
  test('are flagged; notes, cards and trashed logins are not', async () => {
    const r = await run([
      login('a', ''),
      makeEntry({ id: 'n', type: 'note', password: '' }),
      makeEntry({ id: 'c', type: 'card', password: '' }),
      login('t', '', { deletedAt: NOW }),
    ]);
    expect(r.issues.map((i) => [i.entryId, i.kind])).toEqual([['a', 'missing-password']]);
  });
  test('an empty password is not rated or counted as reused', async () => {
    const rate = jest.fn(fakeRate);
    const r = await run([login('a', ''), login('b', '')], { rate });
    expect(rate).not.toHaveBeenCalled();
    expect(r.counts.reused).toBe(0);
  });
});

describe('missing 2FA suggestions', () => {
  const site = (id: string, url: string, over: Partial<Entry> = {}) =>
    login(id, `pw-${id}-${STRONG}`, { urls: [url], ...over });

  test('flags well-known sites without a code', async () => {
    const r = await run([
      site('a', 'https://github.com/login'),
      site('b', 'https://accounts.google.com'),
      site('c', 'https://www.paypal.com'),
      site('d', 'https://my-small-shop.example'),
      site('e', 'https://notgithub.com'),
    ]);
    expect(r.issues.map((i) => i.entryId).sort()).toEqual(['a', 'b', 'c']);
  });
  test('an entry that already has a code is fine', async () => {
    const r = await run([site('a', 'https://github.com', { totpSecret: 'JBSWY3DPEHPK3PXP' })]);
    expect(r.counts['no-2fa']).toBe(0);
  });
  test('can be switched off', async () => {
    const r = await run([site('a', 'https://github.com')], { include2fa: false });
    expect(r.issues).toEqual([]);
  });
  test('is only a suggestion: it does not change the score', async () => {
    const r = await run([site('a', 'https://github.com')]);
    expect(r.counts['no-2fa']).toBe(1);
    expect(r.score).toBe(100);
  });
  test('host matching', () => {
    expect(hostOf('HTTPS://WWW.Mail.Google.com:443/a?b#c')).toBe('mail.google.com');
    expect(hostOf('user@github.com/x')).toBe('github.com');
    // a backslash is a slash to browsers: an address that uses one to hide the host is refused
    expect(hostOf('https://evil.test\\@github.com')).toBe('');
    expect(likelySupports2fa(['nothing', 'https://gist.github.com'])).toBe(true);
    expect(likelySupports2fa(['https://evilgithub.com', 'https://github.com.evil.test'])).toBe(
      false,
    );
    expect(likelySupports2fa([])).toBe(false);
  });
});

describe('breach results', () => {
  test('a password whose hash is in the map is flagged with the count', async () => {
    const breached = new Map([[sha1Upper('password'), 9545824]]);
    const r = await run([login('a', 'password'), login('b', STRONG)], { breached });
    expect(kinds(r, 'a')).toContain('breached');
    expect(r.issues.find((i) => i.kind === 'breached')!.detail).toContain('9,545,824');
    expect(kinds(r, 'b')).toEqual([]);
  });
  test('without breach results there are no breach issues', async () => {
    const r = await run([login('a', 'password')]);
    expect(r.counts.breached).toBe(0);
  });
});

describe('score', () => {
  test('all good is 100', async () => {
    const r = await run([login('a', 'good-a'), login('b', 'good-b')]);
    expect(r).toMatchObject({ score: 100, label: 'Excellent', logins: 2 });
  });
  test('no logins: nothing to score', async () => {
    const r = await run([makeEntry({ id: 'n', type: 'note' }), login('t', 'x', { deletedAt: 1 })]);
    expect(r).toMatchObject({ score: null, label: 'Nothing to check', logins: 0 });
  });
  test('an entry is charged for its worst problem only', async () => {
    // weak (0.8) and reused (0.6) on both logins: charged 0.8 each, not 1.4
    const r = await run([login('a', 'weak-x'), login('b', 'weak-x')]);
    expect(r.counts.weak + r.counts.reused).toBe(4);
    expect(r.score).toBe(20);
  });
  test('one breached login out of two is 50', async () => {
    const breached = new Map([[sha1Upper('pw-one'), 3]]);
    const r = await run([login('a', 'pw-one'), login('b', 'pw-two')], { breached });
    expect(r).toMatchObject({ score: 50, label: 'Fair' });
  });
  test('an old password costs less than a weak one', async () => {
    const old = await run([login('a', 'p', { createdAt: NOW - 500 * DAY })]);
    const weak = await run([login('a', 'weak-p')]);
    expect(old.score!).toBeGreaterThan(weak.score!);
  });
  test.each([
    [100, 'Excellent'],
    [90, 'Excellent'],
    [89, 'Good'],
    [75, 'Good'],
    [74, 'Fair'],
    [50, 'Fair'],
    [49, 'Poor'],
    [0, 'Poor'],
  ])('%i is %s', (score, label) => expect(scoreLabel(score)).toBe(label));
});

describe('the list', () => {
  test('is ordered by seriousness, then by title', async () => {
    const breached = new Map([[sha1Upper('leaked'), 1]]);
    const r = await run(
      [
        login('1', 'p-old', { title: 'B old', createdAt: NOW - 500 * DAY }),
        login('2', 'weak-1', { title: 'A weak' }),
        login('3', 'leaked', { title: 'C leaked' }),
        login('4', '', { title: 'D empty' }),
        login('5', 'p-old2', { title: 'A old', createdAt: NOW - 500 * DAY }),
      ],
      { breached },
    );
    expect(r.issues.map((i) => `${i.kind}:${i.title}`)).toEqual([
      'breached:C leaked',
      'weak:A weak',
      'missing-password:D empty',
      'old:A old',
      'old:B old',
    ]);
  });

  test('every issue carries the entry id so it can be opened', async () => {
    const r = await run([login('abc123', 'weak-1')]);
    expect(r.issues[0]).toMatchObject({
      entryId: 'abc123',
      title: 'Site abc123',
      username: 'userabc123',
    });
  });

  test('the result never contains a password', async () => {
    const r = await run([login('a', 'weak-secret-value'), login('b', 'weak-secret-value')], {
      breached: new Map([[sha1Upper('weak-secret-value'), 5]]),
    });
    expect(JSON.stringify(r)).not.toContain('weak-secret-value');
  });
});

describe('big vaults', () => {
  test('pauses between chunks so the screen stays responsive, and reports progress', async () => {
    const entries = Array.from({ length: 120 }, (_, i) => login(String(i), `pw-${i}`));
    const pause = jest.fn(async () => {});
    const progress: number[] = [];
    await run(entries, { pause, onProgress: (done) => progress.push(done) });
    expect(pause).toHaveBeenCalledTimes(4); // after 25, 50, 75, 100
    expect(progress.at(-1)).toBe(120);
  });
});
