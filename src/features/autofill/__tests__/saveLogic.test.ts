import {
  entry,
  storeEntries,
  unlockedVaultWith,
} from '@/features/entries/__support__/entryTestUtils';
import type { PendingSave } from '@/native/keystore/autofill';
import { useVaultStore } from '@/vault';
import { vaultFile } from '@/vault/__support__/testUtils';

import { saveAsNewLogin, updateLoginPassword } from '../saveActions';
import { findExistingLogins, normalizeCert, originText, suggestedTitle } from '../saveMatching';

const web = (over: Partial<PendingSave> = {}, host = 'bank.com'): PendingSave => ({
  id: 'p1',
  createdAt: 1,
  username: 'alice',
  password: 'new-pass',
  origin: { kind: 'web', host },
  ...over,
});
const app = (over: Partial<PendingSave> = {}): PendingSave => ({
  id: 'p2',
  createdAt: 1,
  username: 'bob',
  password: 'app-pass',
  origin: {
    kind: 'app',
    packageName: 'com.example.app',
    label: 'Example App',
    certSha256: 'AA:BB',
  },
  ...over,
});

describe('texts', () => {
  test('a website shows its host; an app shows its name AND its package name', () => {
    expect(originText(web().origin)).toBe('bank.com');
    expect(originText(app().origin)).toBe('Example App (com.example.app)');
    expect(suggestedTitle(web().origin)).toBe('bank.com');
    expect(suggestedTitle(app().origin)).toBe('Example App');
  });
  test('certificates compare the same however they are written', () => {
    expect(normalizeCert('aa:bb:cc')).toBe('AABBCC');
    expect(normalizeCert(' AABBCC ')).toBe('AABBCC');
  });
});

describe('finding a login that already exists', () => {
  const entries = [
    entry({ id: 'a', username: 'Alice', urls: ['https://www.bank.com/login'], updatedAt: 5 }),
    entry({ id: 'b', username: 'alice', urls: ['http://bank.com'], updatedAt: 9 }),
    entry({ id: 'c', username: 'alice', urls: ['https://login.bank.com'] }), // another subdomain
    entry({ id: 'd', username: 'alice', urls: ['https://bank.com.evil.test'] }),
    entry({ id: 'e', username: 'carol', urls: ['https://bank.com'] }), // another user
    entry({ id: 'f', username: 'alice', urls: ['https://bank.com'], deletedAt: 1 }), // trashed
    entry({ id: 'g', type: 'note', username: 'alice', urls: ['https://bank.com'] }),
  ];

  test('same host and same user name, ignoring case, www, scheme and path', () => {
    expect(findExistingLogins(entries, web().origin, 'alice').map((e) => e.id)).toEqual(['b', 'a']);
  });
  test('other subdomains, look-alike hosts, other users, the Trash and notes do not count', () => {
    const ids = findExistingLogins(entries, web().origin, 'alice').map((e) => e.id);
    for (const other of ['c', 'd', 'e', 'f', 'g']) expect(ids).not.toContain(other);
  });
  test('an empty user name only matches logins without a user name', () => {
    const list = [entry({ id: 'x', username: '', urls: ['https://bank.com'] }), entries[0]!];
    expect(findExistingLogins(list, web().origin, '').map((e) => e.id)).toEqual(['x']);
  });
  test('an app matches only a login linked to that package with that certificate', () => {
    const linked = entry({
      id: 'l',
      username: 'bob',
      appLinks: [{ packageName: 'com.example.app', certSha256: 'aabb' }],
    });
    const otherCert = entry({
      id: 'o',
      username: 'bob',
      appLinks: [{ packageName: 'com.example.app', certSha256: 'CCDD' }],
    });
    const otherApp = entry({
      id: 'p',
      username: 'bob',
      appLinks: [{ packageName: 'com.example.app2', certSha256: 'AABB' }],
    });
    const byUrl = entry({ id: 'u', username: 'bob', urls: ['https://example.com'] });
    expect(
      findExistingLogins([linked, otherCert, otherApp, byUrl], app().origin, 'bob').map(
        (e) => e.id,
      ),
    ).toEqual(['l']);
  });
});

describe('saving a new login', () => {
  beforeEach(() => unlockedVaultWith([entry({ id: 'old' })], [{ id: 'f1', name: 'Work' }]));
  afterAll(() => unlockedVaultWith([]));

  test('a website login gets its address, the chosen title and folder', async () => {
    const id = await saveAsNewLogin(web(), { title: '  My bank ', folderId: 'f1' }, () => 5000);
    const saved = storeEntries().find((e) => e.id === id)!;
    expect(saved).toMatchObject({
      type: 'login',
      title: 'My bank',
      username: 'alice',
      password: 'new-pass',
      urls: ['https://bank.com'],
      folderId: 'f1',
      createdAt: 5000,
      updatedAt: 5000,
      passwordHistory: [],
      favorite: false,
    });
    expect(saved).not.toHaveProperty('appLinks');
    expect(storeEntries()).toHaveLength(2); // the existing entry is untouched
  });

  test('an app login gets an app link with the normalized certificate and no web address', async () => {
    const id = await saveAsNewLogin(app(), { title: 'Example App' });
    const saved = storeEntries().find((e) => e.id === id)!;
    expect(saved.urls).toEqual([]);
    expect(saved.appLinks).toEqual([{ packageName: 'com.example.app', certSha256: 'AABB' }]);
    expect(saved).not.toHaveProperty('folderId');
  });

  test('a blank title, or a folder that is gone, saves nothing', async () => {
    await expect(saveAsNewLogin(web(), { title: '   ' })).rejects.toMatchObject({
      code: 'INVALID_ENTRY',
    });
    await expect(saveAsNewLogin(web(), { title: 'x', folderId: 'missing' })).rejects.toMatchObject({
      code: 'INVALID_FOLDER',
    });
    expect(storeEntries()).toHaveLength(1);
  });

  test('is stored in the vault and survives locking', async () => {
    const id = await saveAsNewLogin(web(), { title: 'Bank' });
    const state = useVaultStore.getState();
    state.lock();
    await state.unlock('correct horse battery staple');
    expect(storeEntries().find((e) => e.id === id)!.password).toBe('new-pass');
  });
});

describe('updating a password', () => {
  const existing = () =>
    entry({
      id: 'e1',
      username: 'alice',
      password: 'old-pass',
      urls: ['https://bank.com'],
      updatedAt: 100,
      passwordHistory: [{ password: 'older-pass', changedAt: 50 }],
    });
  beforeEach(() => unlockedVaultWith([existing()]));
  afterAll(() => unlockedVaultWith([]));

  test('the new password replaces the old one, which goes to the history (newest first)', async () => {
    await updateLoginPassword('e1', web(), () => 9000);
    const e = storeEntries()[0]!;
    expect(e.password).toBe('new-pass');
    expect(e.updatedAt).toBe(9000);
    expect(e.passwordHistory).toEqual([
      { password: 'old-pass', changedAt: 9000 },
      { password: 'older-pass', changedAt: 50 },
    ]);
    expect(e.title).toBe('Example Site'); // nothing else changed
  });

  test('keeps at most 10 old passwords', async () => {
    await unlockedVaultWith([
      entry({
        id: 'e1',
        username: 'alice',
        password: 'p0',
        passwordHistory: Array.from({ length: 10 }, (_, i) => ({
          password: `h${i}`,
          changedAt: i,
        })),
      }),
    ]);
    await updateLoginPassword('e1', web(), () => 500);
    const history = storeEntries()[0]!.passwordHistory;
    expect(history).toHaveLength(10);
    expect(history[0]).toEqual({ password: 'p0', changedAt: 500 });
    expect(history.map((h) => h.password)).not.toContain('h9');
  });

  test('an empty old password is not put in the history', async () => {
    await unlockedVaultWith([
      entry({ id: 'e1', username: 'alice', password: '', passwordHistory: [] }),
    ]);
    await updateLoginPassword('e1', web());
    expect(storeEntries()[0]!.passwordHistory).toEqual([]);
  });

  test('the same password changes nothing and does not touch the vault file', async () => {
    const save = jest.spyOn(useVaultStore.getState(), 'save');
    await updateLoginPassword('e1', web({ password: 'old-pass' }), () => 9000);
    expect(storeEntries()[0]!.updatedAt).toBe(100);
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });

  test('an app save also links the app, once', async () => {
    await unlockedVaultWith([entry({ id: 'e1', username: 'bob', password: 'old' })]);
    await updateLoginPassword('e1', app());
    expect(storeEntries()[0]!.appLinks).toEqual([
      { packageName: 'com.example.app', certSha256: 'AABB' },
    ]);
    await updateLoginPassword('e1', app({ password: 'another' }));
    expect(storeEntries()[0]!.appLinks).toHaveLength(1);
    expect(storeEntries()[0]!.passwordHistory.map((h) => h.password)).toEqual(['app-pass', 'old']);
  });

  test('a website save does not add app links', async () => {
    await updateLoginPassword('e1', web());
    expect(storeEntries()[0]).not.toHaveProperty('appLinks');
  });

  test('an entry that is gone is reported and nothing else changes', async () => {
    await expect(updateLoginPassword('missing', web())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(storeEntries()[0]!.password).toBe('old-pass');
  });

  test('the old password is also in the saved file only inside the encrypted vault', async () => {
    await updateLoginPassword('e1', web());
    const file = Buffer.from(await vaultFile().bytes()).toString('latin1');
    expect(file).not.toContain('old-pass');
    expect(file).not.toContain('new-pass');
  });
});
