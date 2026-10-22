import { File } from 'expo-file-system';

import { lockVault, unlockVault, useVaultStore } from '@/vault';

import {
  addFolder,
  deleteFolder,
  deleteForever,
  describeSaveError,
  emptyTrash,
  EntryActionError,
  moveToTrash,
  purgeExpired,
  removeSeedEntries,
  renameFolder,
  restoreFromTrash,
  saveEntryFromForm,
  seedFakeEntries,
  setFavorite,
} from '../entryActions';
import { emptyForm, entryToForm } from '../entrySchema';
import { TRASH_RETENTION_MS } from '../model';
import {
  entry,
  resetVaultFiles,
  storeEntries,
  unlockedVaultWith,
} from '../__support__/entryTestUtils';

const PASSWORD = 'correct horse battery staple';
const form = (title: string) => ({ ...emptyForm('login'), title, username: 'u', password: 'p' });

afterAll(resetVaultFiles);

// What the file on disk really contains, as seen after locking and unlocking again.
async function reloadFromDisk() {
  lockVault();
  useVaultStore.setState({ data: null });
  const data = await unlockVault(PASSWORD);
  useVaultStore.setState({ data }); // the store follows the real session again
  return data;
}

describe('creating and editing', () => {
  beforeEach(() => unlockedVaultWith());

  test('a new entry is saved to the file', async () => {
    const id = await saveEntryFromForm(form('Bank'));
    expect(storeEntries().map((e) => e.title)).toEqual(['Bank']);
    expect((await reloadFromDisk()).entries.map((e) => e.id)).toEqual([id]);
  });

  test('an edit changes the entry, keeps its id and records the old password', async () => {
    const id = await saveEntryFromForm(form('Bank'), undefined, () => 1000);
    const current = storeEntries()[0]!;
    await saveEntryFromForm(
      { ...entryToForm(current), title: 'Bank 2', password: 'p2' },
      id,
      () => 2000,
    );

    const saved = (await reloadFromDisk()).entries[0]!;
    expect(saved).toMatchObject({
      id,
      title: 'Bank 2',
      password: 'p2',
      createdAt: 1000,
      updatedAt: 2000,
    });
    expect(saved.passwordHistory).toEqual([{ password: 'p', changedAt: 2000 }]);
  });

  test('editing an entry that no longer exists fails clearly', async () => {
    await expect(saveEntryFromForm(form('X'), 'missing')).rejects.toBeInstanceOf(EntryActionError);
    await expect(setFavorite('missing', true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('favorite is saved', async () => {
    const id = await saveEntryFromForm(form('Bank'));
    await setFavorite(id, true);
    expect((await reloadFromDisk()).entries[0]?.favorite).toBe(true);
  });

  test('several quick changes are all kept (none overwrites another)', async () => {
    await Promise.all([
      saveEntryFromForm(form('One')),
      saveEntryFromForm(form('Two')),
      saveEntryFromForm(form('Three')),
      addFolder('Work'),
    ]);
    const data = await reloadFromDisk();
    expect(data.entries.map((e) => e.title).sort()).toEqual(['One', 'Three', 'Two']);
    expect(data.folders.map((f) => f.name)).toEqual(['Work']);
  });
});

describe('when saving fails', () => {
  beforeEach(() => unlockedVaultWith([entry({ id: 'a', title: 'Keep me' })]));
  afterEach(() => jest.restoreAllMocks());

  test('a disk error is thrown, the data stays as it was, and the file is still good', async () => {
    jest.spyOn(File.prototype, 'create').mockImplementation(() => {
      throw new Error('write failed');
    });

    await expect(saveEntryFromForm(form('Lost'))).rejects.toThrow();
    await expect(moveToTrash('a')).rejects.toThrow();

    expect(storeEntries().map((e) => e.title)).toEqual(['Keep me']);
    expect(storeEntries()[0]?.deletedAt).toBeUndefined();

    jest.restoreAllMocks();
    expect((await reloadFromDisk()).entries.map((e) => e.title)).toEqual(['Keep me']);
  });

  test('a full phone says so in plain words, and nothing is lost', async () => {
    jest.spyOn(File.prototype, 'write').mockImplementation(() => {
      throw new Error('ENOSPC: No space left on device');
    });
    const error = await saveEntryFromForm(form('Lost')).catch((e) => e);
    const message = describeSaveError(error);
    expect(message).toMatch(/out of storage space/i);
    expect(message).toMatch(/existing passwords are safe/i);
    expect(message).not.toMatch(/ENOSPC/);
    expect(storeEntries().map((e) => e.title)).toEqual(['Keep me']);
    jest.restoreAllMocks();
    expect((await reloadFromDisk()).entries.map((e) => e.title)).toEqual(['Keep me']);
  });

  test('after a failure the next change works', async () => {
    const spy = jest.spyOn(File.prototype, 'create').mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    await expect(saveEntryFromForm(form('Lost'))).rejects.toThrow();
    spy.mockRestore();
    await saveEntryFromForm(form('Kept'));
    expect(
      storeEntries()
        .map((e) => e.title)
        .sort(),
    ).toEqual(['Keep me', 'Kept']);
  });

  test('a locked vault refuses changes with a clear message', async () => {
    lockVault();
    const error = await saveEntryFromForm(form('X')).catch((e) => e);
    expect(error.code).toBe('LOCKED');
    expect(describeSaveError(error)).toMatch(/locked/i);
  });

  test('error messages never include secrets or internals', () => {
    const message = describeSaveError(new Error('write failed for password hunter2'));
    expect(message).not.toMatch(/hunter2|write failed/);
    expect(message).toMatch(/nothing was changed/i);
  });
});

describe('trash', () => {
  beforeEach(() =>
    unlockedVaultWith([entry({ id: 'a', title: 'A' }), entry({ id: 'b', title: 'B' })]),
  );

  test('moving to the trash keeps the entry and stamps the time, and is saved', async () => {
    await moveToTrash('a', () => 5000);
    expect(storeEntries().find((e) => e.id === 'a')?.deletedAt).toBe(5000);
    const saved = (await reloadFromDisk()).entries.find((e) => e.id === 'a');
    expect(saved?.deletedAt).toBe(5000);
  });

  test('restoring brings it back', async () => {
    await moveToTrash('a');
    await restoreFromTrash('a');
    expect(storeEntries().find((e) => e.id === 'a')?.deletedAt).toBeUndefined();
    expect('deletedAt' in storeEntries().find((e) => e.id === 'a')!).toBe(false);
  });

  test('delete forever removes it from the file', async () => {
    await moveToTrash('a');
    await deleteForever('a');
    expect((await reloadFromDisk()).entries.map((e) => e.id)).toEqual(['b']);
    await expect(deleteForever('a')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('empty trash removes only trashed entries', async () => {
    await moveToTrash('a');
    await emptyTrash();
    expect(storeEntries().map((e) => e.id)).toEqual(['b']);
    const before = useVaultStore.getState().data;
    await emptyTrash(); // nothing to do: no needless save
    expect(useVaultStore.getState().data).toBe(before);
  });

  test('entries older than 30 days are purged, newer ones kept', async () => {
    const t0 = 1_000_000;
    await moveToTrash('a', () => t0);
    await moveToTrash('b', () => t0 + 20 * 24 * 60 * 60 * 1000);

    await purgeExpired(() => t0 + TRASH_RETENTION_MS - 1);
    expect(storeEntries().map((e) => e.id)).toEqual(['a', 'b']);

    await purgeExpired(() => t0 + TRASH_RETENTION_MS);
    expect((await reloadFromDisk()).entries.map((e) => e.id)).toEqual(['b']);
  });

  test('purging with nothing expired does not touch the file', async () => {
    const before = useVaultStore.getState().data;
    await purgeExpired();
    expect(useVaultStore.getState().data).toBe(before);
  });
});

describe('folders', () => {
  beforeEach(() =>
    unlockedVaultWith(
      [entry({ id: 'a', folderId: 'x' }), entry({ id: 'b' })],
      [{ id: 'x', name: 'Work' }],
    ),
  );

  test('adds and renames', async () => {
    const id = await addFolder('  Family ');
    await renameFolder(id, 'Home');
    expect((await reloadFromDisk()).folders.map((f) => f.name)).toEqual(['Work', 'Home']);
  });

  test('rejects empty, too long and duplicate names', async () => {
    await expect(addFolder('   ')).rejects.toMatchObject({ code: 'INVALID_FOLDER' });
    await expect(addFolder('x'.repeat(51))).rejects.toMatchObject({ code: 'INVALID_FOLDER' });
    await expect(addFolder('work')).rejects.toThrow(/already have a folder/);
    const id = await addFolder('Other');
    await expect(renameFolder(id, 'WORK')).rejects.toMatchObject({ code: 'INVALID_FOLDER' });
    await expect(renameFolder(id, 'Other')).resolves.toBeUndefined(); // same name as itself is fine
  });

  test('deleting a folder keeps its entries and just removes the folder from them', async () => {
    await deleteFolder('x');
    const data = await reloadFromDisk();
    expect(data.folders).toEqual([]);
    expect(data.entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(data.entries[0]?.folderId).toBeUndefined();
  });
});

describe('dev seed', () => {
  beforeEach(() => unlockedVaultWith([entry({ id: 'real', title: 'Real one' })]));

  test('adds 2,000 fake entries in one save and removes only them', async () => {
    await seedFakeEntries(2000);
    expect(storeEntries()).toHaveLength(2001);
    expect((await reloadFromDisk()).entries).toHaveLength(2001);

    await removeSeedEntries();
    expect(storeEntries().map((e) => e.id)).toEqual(['real']);
    expect(useVaultStore.getState().data?.folders).toEqual([]);
  });
});
