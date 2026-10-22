import { mergeVaults } from '../merge';
import { createEmptyVaultData, type Entry, type VaultData } from '../types';

const T = 1_700_000_000_000; // an arbitrary starting time
const MIN = 60_000;

function entry(id: string, over: Partial<Entry> = {}): Entry {
  return {
    id,
    type: 'login',
    title: `Site ${id}`,
    username: 'alice',
    password: 'pw-1',
    urls: [],
    notes: '',
    customFields: [],
    favorite: false,
    createdAt: T,
    updatedAt: T,
    passwordHistory: [],
    ...over,
  };
}

function vault(entries: Entry[], folders: { id: string; name: string }[] = []): VaultData {
  return { ...createEmptyVaultData(), entries, folders };
}

const byId = (data: VaultData) => new Map(data.entries.map((e) => [e.id, e]));
const ids = (data: VaultData) => data.entries.map((e) => e.id).sort();

describe('entries on only one side', () => {
  test('are all kept, whichever side has them', () => {
    const { data, summary } = mergeVaults(
      vault([entry('a'), entry('b')]),
      vault([entry('b'), entry('c')]),
    );
    expect(ids(data)).toEqual(['a', 'b', 'c']);
    expect(summary).toMatchObject({ keptHereOnly: 1, addedFromCloud: 1 });
  });

  test('an entry deleted FOR GOOD on one device comes back from the other (never lost)', () => {
    // Device A emptied the Trash (entry gone); device B still has it.
    const { data } = mergeVaults(vault([]), vault([entry('gone', { title: 'Old bank' })]));
    expect(byId(data).get('gone')?.title).toBe('Old bank');
    const reverse = mergeVaults(vault([entry('gone')]), vault([]));
    expect(ids(reverse.data)).toEqual(['gone']);
  });

  test('empty vaults merge to an empty vault', () => {
    expect(mergeVaults(vault([]), vault([])).data.entries).toEqual([]);
  });
});

describe('the same entry on both sides', () => {
  test('identical copies stay one entry', () => {
    const { data, summary } = mergeVaults(vault([entry('a')]), vault([entry('a')]));
    expect(data.entries).toHaveLength(1);
    expect(summary.conflictingCopies).toBe(0);
  });

  test('edited on only ONE device since the last sync: the newer wins, no copy', () => {
    const base = T;
    const stale = entry('a', { updatedAt: base - MIN });
    const edited = entry('a', { updatedAt: base + MIN, notes: 'changed' });
    const { data, summary } = mergeVaults(vault([stale]), vault([edited]), { baseTime: base });
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({ notes: 'changed', updatedAt: base + MIN });
    expect(summary).toMatchObject({ tookCloud: 1, conflictingCopies: 0 });
  });

  test('the same holds when it is this device that has the newer edit', () => {
    const base = T;
    const { data, summary } = mergeVaults(
      vault([entry('a', { updatedAt: base + MIN, notes: 'mine' })]),
      vault([entry('a', { updatedAt: base - MIN })]),
      { baseTime: base },
    );
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]?.notes).toBe('mine');
    expect(summary).toMatchObject({ keptLocal: 1, conflictingCopies: 0 });
  });

  test('edited on BOTH devices: the newest wins in place and the other edit is kept as a copy', () => {
    const base = T;
    const mine = entry('a', { updatedAt: base + 5 * MIN, notes: 'phone edit', username: 'alice' });
    const theirs = entry('a', {
      updatedAt: base + 9 * MIN,
      notes: 'tablet edit',
      username: 'alice2',
    });

    const { data, summary } = mergeVaults(vault([mine]), vault([theirs]), { baseTime: base });

    expect(data.entries).toHaveLength(2);
    const winner = byId(data).get('a')!;
    expect(winner).toMatchObject({ notes: 'tablet edit', username: 'alice2' });
    const copy = data.entries.find((e) => e.id !== 'a')!;
    expect(copy).toMatchObject({
      notes: 'phone edit',
      username: 'alice',
      title: 'Site a (conflicting copy)',
    });
    expect(copy.favorite).toBe(false);
    expect(summary).toMatchObject({ tookCloud: 1, conflictingCopies: 1 });
  });

  test('without a known base time, any disagreement keeps both versions (the safe way)', () => {
    const { data } = mergeVaults(
      vault([entry('a', { updatedAt: T + MIN, notes: 'one' })]),
      vault([entry('a', { updatedAt: T + 2 * MIN, notes: 'two' })]),
    );
    expect(data.entries).toHaveLength(2);
  });

  test('same time, different content: this device wins and the other is kept as a copy', () => {
    const { data } = mergeVaults(
      vault([entry('a', { updatedAt: T + MIN, notes: 'mine' })]),
      vault([entry('a', { updatedAt: T + MIN, notes: 'theirs' })]),
      { baseTime: T },
    );
    expect(byId(data).get('a')?.notes).toBe('mine');
    expect(data.entries.map((e) => e.notes).sort()).toEqual(['mine', 'theirs']);
  });

  test('only bookkeeping differs (history, update time): one entry, no copy', () => {
    const { data } = mergeVaults(
      vault([
        entry('a', { updatedAt: T + MIN, passwordHistory: [{ password: 'old', changedAt: T }] }),
      ]),
      vault([entry('a', { updatedAt: T + 2 * MIN })]),
      { baseTime: T - 1 },
    );
    expect(data.entries).toHaveLength(1);
  });

  test('a replaced password is never lost: it goes into the password history', () => {
    const mine = entry('a', { updatedAt: T + MIN, password: 'phone-password' });
    const theirs = entry('a', { updatedAt: T + 2 * MIN, password: 'tablet-password' });
    const { data } = mergeVaults(vault([mine]), vault([theirs]), { baseTime: T });
    const winner = byId(data).get('a')!;
    expect(winner.password).toBe('tablet-password');
    expect(winner.passwordHistory.map((h) => h.password)).toEqual(['phone-password']);
  });

  test('password histories from both sides are combined, newest first, without duplicates, capped at 10', () => {
    const history = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        password: `${prefix}${i}`,
        changedAt: T + i * MIN,
      }));
    const shared = { password: 'shared', changedAt: T - MIN };
    const mine = entry('a', {
      updatedAt: T + MIN,
      password: 'p-mine',
      passwordHistory: [shared, ...history('m', 6)],
    });
    const theirs = entry('a', {
      updatedAt: T + 2 * MIN,
      password: 'p-theirs',
      passwordHistory: [shared, ...history('t', 6)],
    });

    const result = byId(mergeVaults(vault([mine]), vault([theirs]), { baseTime: T }).data).get(
      'a',
    )!;
    const passwords = result.passwordHistory.map((h) => h.password);

    expect(passwords).toHaveLength(10);
    expect(new Set(passwords).size).toBe(10);
    expect(passwords).not.toContain('p-theirs'); // the current password is not history
    const times = result.passwordHistory.map((h) => h.changedAt);
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });

  test('a card edited on two devices keeps both versions of the card', () => {
    const card = (number: string) => ({
      holder: 'A',
      number,
      expiry: '09/30',
      cvv: '123',
      pin: '',
    });
    const { data } = mergeVaults(
      vault([entry('c', { type: 'card', updatedAt: T + MIN, card: card('4111111111111111') })]),
      vault([entry('c', { type: 'card', updatedAt: T + 2 * MIN, card: card('4222222222222222') })]),
      { baseTime: T },
    );
    expect(data.entries.map((e) => e.card?.number).sort()).toEqual([
      '4111111111111111',
      '4222222222222222',
    ]);
  });
});

describe('deleted on one device', () => {
  const trashed = (id: string, deletedAt: number, over: Partial<Entry> = {}) =>
    entry(id, { deletedAt, ...over });

  test('deleted after the other device last edited it: it stays in the Trash, not purged', () => {
    const live = entry('a', { updatedAt: T });
    const deleted = trashed('a', T + 10 * MIN, { updatedAt: T });
    const { data, summary } = mergeVaults(vault([live]), vault([deleted]), { baseTime: T - MIN });
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]?.deletedAt).toBe(T + 10 * MIN);
    expect(summary.keptInTrash).toBe(1);
  });

  test('the same when it is THIS device that deleted it', () => {
    const { data } = mergeVaults(vault([trashed('a', T + 10 * MIN)]), vault([entry('a')]));
    expect(data.entries[0]?.deletedAt).toBe(T + 10 * MIN);
  });

  test('edited on the other device AFTER the deletion: the edit wins and the entry is alive again', () => {
    const deleted = trashed('a', T + 10 * MIN, { updatedAt: T });
    const edited = entry('a', { updatedAt: T + 20 * MIN, notes: 'edited later' });
    const { data, summary } = mergeVaults(vault([deleted]), vault([edited]), { baseTime: T - MIN });
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({ notes: 'edited later' });
    expect(data.entries[0]?.deletedAt).toBeUndefined();
    expect(summary.restoredFromTrash).toBe(1);
  });

  test('edited BEFORE the deletion on the other device: the deletion wins, but the edit is not lost', () => {
    const deleted = trashed('a', T + 20 * MIN, { updatedAt: T });
    const edited = entry('a', { updatedAt: T + 10 * MIN, notes: 'edit made before deleting' });
    const { data } = mergeVaults(vault([deleted]), vault([edited]), { baseTime: T - MIN });
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]?.deletedAt).toBe(T + 20 * MIN); // in the Trash
    expect(data.entries[0]?.notes).toBe('edit made before deleting'); // newest content kept inside
  });

  test('restored from the Trash on one device after the other device deleted it: it stays restored', () => {
    // The restore bumps updatedAt (see restoreFromTrash).
    const stillDeleted = trashed('a', T + 10 * MIN, { updatedAt: T });
    const restored = entry('a', { updatedAt: T + 30 * MIN });
    const { data } = mergeVaults(vault([stillDeleted]), vault([restored]), { baseTime: T });
    expect(data.entries[0]?.deletedAt).toBeUndefined();
  });

  test('deleted on both devices: still in the Trash, with the later deletion time', () => {
    const { data } = mergeVaults(
      vault([trashed('a', T + 5 * MIN, { updatedAt: T })]),
      vault([trashed('a', T + 9 * MIN, { updatedAt: T })]),
    );
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]?.deletedAt).toBe(T + 9 * MIN);
  });

  test('deleted on both, but edited differently before: the newer content is kept, nothing duplicated', () => {
    const { data } = mergeVaults(
      vault([trashed('a', T + 9 * MIN, { updatedAt: T + MIN, notes: 'one' })]),
      vault([trashed('a', T + 5 * MIN, { updatedAt: T + 2 * MIN, notes: 'two' })]),
    );
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({ notes: 'two', deletedAt: T + 9 * MIN });
  });

  test('a deletion never removes anything from the merged vault', () => {
    const local = vault([entry('a'), entry('b'), entry('c')]);
    const remote = vault([trashed('a', T + MIN), trashed('b', T + MIN), entry('c')]);
    const { data } = mergeVaults(local, remote, { baseTime: T });
    expect(ids(data)).toEqual(['a', 'b', 'c']);
  });
});

describe('folders', () => {
  test('are combined, and each side keeps its own entries in them', () => {
    const { data, summary } = mergeVaults(
      vault([entry('a', { folderId: 'f1' })], [{ id: 'f1', name: 'Work' }]),
      vault([entry('b', { folderId: 'f2' })], [{ id: 'f2', name: 'Home' }]),
    );
    expect(data.folders.map((f) => f.name).sort()).toEqual(['Home', 'Work']);
    expect(byId(data).get('a')?.folderId).toBe('f1');
    expect(byId(data).get('b')?.folderId).toBe('f2');
    expect(summary.foldersAdded).toBe(1);
  });

  test("the same folder on both sides appears once, keeping this device's name", () => {
    const { data } = mergeVaults(
      vault([], [{ id: 'f1', name: 'Work' }]),
      vault([], [{ id: 'f1', name: 'Job' }]),
    );
    expect(data.folders).toEqual([{ id: 'f1', name: 'Work' }]);
  });

  test('two different folders with the same name keep unique names', () => {
    const { data } = mergeVaults(
      vault([], [{ id: 'f1', name: 'Work' }]),
      vault(
        [],
        [
          { id: 'f9', name: 'work' },
          { id: 'f10', name: 'WORK' },
        ],
      ),
    );
    expect(data.folders.map((f) => f.id)).toEqual(['f1', 'f9', 'f10']);
    expect(new Set(data.folders.map((f) => f.name.toLowerCase())).size).toBe(3);
  });
});

describe('properties of the merge', () => {
  const sample = () => {
    const local = vault(
      [
        entry('a', { updatedAt: T + 5 * MIN, notes: 'phone' }),
        entry('b', { updatedAt: T + MIN }),
        entry('only-local'),
        entry('d', { deletedAt: T + 3 * MIN }),
      ],
      [{ id: 'f1', name: 'Work' }],
    );
    const remote = vault(
      [
        entry('a', { updatedAt: T + 9 * MIN, notes: 'tablet' }),
        entry('b', { updatedAt: T + 4 * MIN, notes: 'newer' }),
        entry('only-remote'),
        entry('d', { updatedAt: T + 8 * MIN, notes: 'edited after delete' }),
      ],
      [{ id: 'f2', name: 'Home' }],
    );
    return { local, remote };
  };

  test('merging the same two vaults again changes nothing (no ever-growing copies)', () => {
    const { local, remote } = sample();
    const first = mergeVaults(local, remote, { baseTime: T }).data;
    const second = mergeVaults(first, remote, { baseTime: T }).data;
    expect(JSON.stringify(second.entries.slice().sort((x, y) => x.id.localeCompare(y.id)))).toBe(
      JSON.stringify(first.entries.slice().sort((x, y) => x.id.localeCompare(y.id))),
    );
    expect(second.folders).toEqual(first.folders);
  });

  test('merging in the other direction picks the same winners and the same copies', () => {
    const { local, remote } = sample();
    const forward = mergeVaults(local, remote, { baseTime: T }).data;
    const backward = mergeVaults(remote, local, { baseTime: T }).data;
    const normal = (d: VaultData) =>
      JSON.stringify(d.entries.slice().sort((x, y) => x.id.localeCompare(y.id)));
    expect(normal(backward)).toBe(normal(forward));
  });

  test('the same copy id comes from the same content (deterministic, no randomness)', () => {
    const { local, remote } = sample();
    const a = mergeVaults(local, remote, { baseTime: T }).data;
    const b = mergeVaults(local, remote, { baseTime: T }).data;
    expect(ids(a)).toEqual(ids(b));
    for (const id of ids(a)) expect(id).toMatch(/^[\w-]+$/);
  });

  test('never loses an entry id: everything on either side is still there', () => {
    const { local, remote } = sample();
    const { data } = mergeVaults(local, remote, { baseTime: T });
    for (const e of [...local.entries, ...remote.entries]) expect(ids(data)).toContain(e.id);
  });

  test('does not change its inputs', () => {
    const { local, remote } = sample();
    const before = JSON.stringify([local, remote]);
    mergeVaults(local, remote, { baseTime: T });
    expect(JSON.stringify([local, remote])).toBe(before);
  });

  test("keeps this device's settings and data version", () => {
    const local = { ...vault([]), settings: { autoLockSeconds: 11, clipboardClearSeconds: 22 } };
    const remote = { ...vault([]), settings: { autoLockSeconds: 99, clipboardClearSeconds: 99 } };
    expect(mergeVaults(local, remote).data.settings).toEqual(local.settings);
  });

  test('refuses vaults with different data versions', () => {
    expect(() => mergeVaults(vault([]), { ...vault([]), version: 2 })).toThrow(RangeError);
  });

  test('the summary adds up', () => {
    const { local, remote } = sample();
    const { data, summary } = mergeVaults(local, remote, { baseTime: T });
    // 5 different entries (a, b, d, only-local, only-remote) plus a copy for each of a and b,
    // which were both edited on both devices after the base time.
    expect(data.entries).toHaveLength(7);
    expect(summary).toEqual({
      keptHereOnly: 1,
      addedFromCloud: 1,
      tookCloud: 2,
      keptLocal: 0,
      conflictingCopies: 2,
      restoredFromTrash: 1,
      keptInTrash: 0,
      foldersAdded: 1,
    });
  });
});

describe('apps linked for autofill', () => {
  const link = (pkg: string, cert = 'AABB') => ({ packageName: pkg, certSha256: cert });

  test('links added on either device are all kept', () => {
    const a = entry('x', { updatedAt: T + 2 * MIN, appLinks: [link('com.one')] });
    const b = entry('x', { updatedAt: T + MIN, appLinks: [link('com.two')] });
    const { data } = mergeVaults(vault([a]), vault([b]));
    const merged = byId(data).get('x')!;
    expect(merged.appLinks!.map((l) => l.packageName).sort()).toEqual(['com.one', 'com.two']);
  });

  test('the same link is not duplicated, however the certificate is written', () => {
    const a = entry('x', { appLinks: [link('com.one', 'AA:BB')], updatedAt: T + MIN });
    const b = entry('x', { appLinks: [link('com.one', 'aabb')] });
    expect(byId(mergeVaults(vault([a]), vault([b])).data).get('x')!.appLinks).toHaveLength(1);
  });

  test('different links alone never create a "conflicting copy"', () => {
    const a = entry('x', { updatedAt: T + 2 * MIN, appLinks: [link('com.one')] });
    const b = entry('x', { updatedAt: T + 3 * MIN, appLinks: [link('com.two')] });
    const { data, summary } = mergeVaults(vault([a]), vault([b]));
    expect(data.entries).toHaveLength(1);
    expect(summary.conflictingCopies).toBe(0);
  });

  test('an entry without links stays without the field', () => {
    const { data } = mergeVaults(vault([entry('x')]), vault([entry('x', { updatedAt: T + MIN })]));
    expect(byId(data).get('x')).not.toHaveProperty('appLinks');
  });
});
