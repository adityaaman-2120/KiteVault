import { describeDaysLeft, toOpenableUrl } from '../format';
import {
  isExpiredInTrash,
  newId,
  purgeExpiredTrash,
  trashDaysLeft,
  TRASH_RETENTION_MS,
} from '../model';
import { filterEntries, NO_FILTER, sortEntries } from '../search';
import { makeSeedEntry, withSeedEntries, withoutSeedEntries } from '../seed';
import { entry, showInStore } from '../__support__/entryTestUtils';
import { createEmptyVaultData } from '@/vault';

const DAY = 24 * 60 * 60 * 1000;

describe('search', () => {
  const list = [
    entry({ id: '1', title: 'GitHub', username: 'octocat', urls: ['https://github.com'] }),
    entry({
      id: '2',
      title: 'Bank',
      username: 'alice@bank.example',
      urls: ['https://bank.example'],
      favorite: true,
    }),
    entry({ id: '3', title: 'Wifi note', type: 'note', username: '', urls: [], folderId: 'f1' }),
    entry({ id: '4', title: 'Visa', type: 'card', username: '', urls: [] }),
  ];
  const ids = (found: { id: string }[]) => found.map((e) => e.id);

  test('no filter returns everything', () => {
    expect(filterEntries(list, NO_FILTER)).toHaveLength(4);
  });

  test('searches title, username and website, ignoring case', () => {
    expect(ids(filterEntries(list, { ...NO_FILTER, query: 'GITHUB' }))).toEqual(['1']);
    expect(ids(filterEntries(list, { ...NO_FILTER, query: 'octo' }))).toEqual(['1']);
    expect(ids(filterEntries(list, { ...NO_FILTER, query: 'bank.example' }))).toEqual(['2']);
  });

  test('every word must match somewhere', () => {
    expect(ids(filterEntries(list, { ...NO_FILTER, query: 'alice bank' }))).toEqual(['2']);
    expect(filterEntries(list, { ...NO_FILTER, query: 'alice github' })).toEqual([]);
  });

  test('does not search passwords or notes', () => {
    const secret = entry({ id: '9', title: 'X', password: 'zebra-secret', notes: 'zebra-note' });
    expect(filterEntries([secret], { ...NO_FILTER, query: 'zebra' })).toEqual([]);
  });

  test('filters by type, favorites and folder', () => {
    expect(ids(filterEntries(list, { ...NO_FILTER, type: 'note' }))).toEqual(['3']);
    expect(ids(filterEntries(list, { ...NO_FILTER, favoritesOnly: true }))).toEqual(['2']);
    expect(ids(filterEntries(list, { ...NO_FILTER, folderId: 'f1' }))).toEqual(['3']);
    expect(ids(filterEntries(list, { ...NO_FILTER, folderId: '' }))).toEqual(['1', '2', '4']);
  });

  test('filters combine', () => {
    expect(
      filterEntries(list, { ...NO_FILTER, type: 'login', favoritesOnly: true, query: 'alice' }),
    ).toHaveLength(1);
    expect(filterEntries(list, { ...NO_FILTER, type: 'card', query: 'alice' })).toEqual([]);
  });

  test('sorts favorites first, then A-Z, without changing the input', () => {
    const original = [...list];
    expect(ids(sortEntries(list))).toEqual(['2', '1', '4', '3']);
    expect(list).toEqual(original);
  });
});

describe('with 2,000 entries', () => {
  const now = 1_700_000_000_000;
  const big = withSeedEntries(createEmptyVaultData(), 2000, now).entries;

  test('seed data is what the dev button promises', () => {
    expect(big).toHaveLength(2000);
    expect(new Set(big.map((e) => e.id)).size).toBe(2000);
    expect(withoutSeedEntries(withSeedEntries(createEmptyVaultData(), 2000, now)).entries).toEqual(
      [],
    );
    expect(makeSeedEntry(3, now)).toEqual(makeSeedEntry(3, now)); // deterministic, no randomness
  });

  test('sorting and searching stay fast', () => {
    const t0 = performance.now();
    const sorted = sortEntries(big);
    const t1 = performance.now();
    const first = filterEntries(sorted, { ...NO_FILTER, query: 'site0001' }); // builds the cache
    const t2 = performance.now();
    const again = filterEntries(sorted, { ...NO_FILTER, query: 'user1999' });
    const t3 = performance.now();

    expect(first).toHaveLength(1);
    expect(again).toHaveLength(1);
    // Generous limits (a phone is slower than this computer, but not 20x).
    expect(t1 - t0).toBeLessThan(150);
    expect(t2 - t1).toBeLessThan(100);
    expect(t3 - t2).toBeLessThan(25);
  });

  test('unchanged entries keep their identity, so rows can skip re-rendering', () => {
    showInStore(big);
    const sortedA = sortEntries(big);
    const sortedB = sortEntries(big);
    expect(sortedA[0]).toBe(sortedB[0]);
  });
});

describe('trash rules', () => {
  const deletedAt = 1_000_000;

  test('an entry expires exactly 30 days after deletion', () => {
    const e = entry({ deletedAt });
    expect(isExpiredInTrash(e, deletedAt + TRASH_RETENTION_MS - 1)).toBe(false);
    expect(isExpiredInTrash(e, deletedAt + TRASH_RETENTION_MS)).toBe(true);
    expect(isExpiredInTrash(entry(), deletedAt + 100 * DAY)).toBe(false); // not in the trash
  });

  test('days left counts down', () => {
    const e = entry({ deletedAt });
    expect(trashDaysLeft(e, deletedAt)).toBe(30);
    expect(trashDaysLeft(e, deletedAt + 29 * DAY + 1)).toBe(1);
    expect(trashDaysLeft(e, deletedAt + 31 * DAY)).toBe(0);
    expect(describeDaysLeft(1)).toBe('1 day left');
    expect(describeDaysLeft(12)).toBe('12 days left');
  });

  test('purging removes only expired trash and returns the same object when there is none', () => {
    const data = createEmptyVaultData();
    data.entries = [
      entry({ id: 'live' }),
      entry({ id: 'old', deletedAt: deletedAt - 1 }),
      entry({ id: 'recent', deletedAt: deletedAt + 20 * DAY }),
    ];
    const now = deletedAt + TRASH_RETENTION_MS;
    const purged = purgeExpiredTrash(data, now);
    expect(purged.entries.map((e) => e.id)).toEqual(['live', 'recent']);
    expect(purgeExpiredTrash(purged, now)).toBe(purged);
  });
});

describe('toOpenableUrl', () => {
  test.each([
    ['https://example.com', 'https://example.com/'],
    ['http://example.com/a?b=1', 'http://example.com/a?b=1'],
    ['example.com', 'https://example.com/'],
    ['  example.com/login  ', 'https://example.com/login'],
    ['example.com:8080/x', 'https://example.com:8080/x'],
  ])('%s opens as %s', (raw, expected) => {
    expect(toOpenableUrl(raw)).toBe(expected);
  });

  test.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'intent://scan/#Intent;scheme=zxing;end',
    'file:///etc/passwd',
    'content://contacts/people',
    'mailto:a@b.com',
    'tel:123',
    '',
    '   ',
    'http://',
  ])('%j is refused', (raw) => {
    expect(toOpenableUrl(raw)).toBeNull();
  });
});

test('newId makes unique 32-character ids', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId()));
  expect(ids.size).toBe(500);
  expect([...ids][0]).toMatch(/^[0-9a-f]{32}$/);
});
