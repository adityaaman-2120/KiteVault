import { File } from 'expo-file-system';

import {
  changeMasterPassword,
  createVault,
  eraseVault,
  getVaultKeyCopy,
  isVaultUnlocked,
  lockVault,
  saveVault,
  unlockVault,
  vaultExists,
} from '..';
import { decodeVaultFile } from '../format';
import {
  FAST_KDF,
  makeEntry,
  resetVaultFiles,
  snapshot,
  vaultFile,
  withEntries,
} from '../__support__/testUtils';

const OLD = 'correct horse battery staple';
const NEW = 'a completely different passphrase';

async function vaultWithEntry() {
  const created = await createVault(OLD, { kdfParams: FAST_KDF });
  const data = snapshot(withEntries(created, makeEntry()));
  await saveVault(snapshot(data));
  return data;
}

beforeEach(resetVaultFiles);
afterEach(() => jest.restoreAllMocks());
afterAll(resetVaultFiles);

describe('changing the master password (re-wrap only)', () => {
  test('the vault key is wrapped again and the encrypted body is not touched', async () => {
    await vaultWithEntry();
    const before = decodeVaultFile(await vaultFile().bytes());
    const keyBefore = getVaultKeyCopy();

    await changeMasterPassword(OLD, NEW, { kdfParams: { ...FAST_KDF, iterations: 3 } });

    const after = decodeVaultFile(await vaultFile().bytes());
    expect(after.body).toEqual(before.body); // not one byte of the vault was re-encrypted
    expect(after.header.salt).not.toEqual(before.header.salt);
    expect(after.header.wrappedKey).not.toEqual(before.header.wrappedKey);
    expect(after.header.kdf.iterations).toBe(3); // the stored cost can be raised
    expect(getVaultKeyCopy()).toEqual(keyBefore); // same vault key
  });

  test('afterwards only the new password unlocks, with all data intact', async () => {
    const saved = await vaultWithEntry();
    await changeMasterPassword(OLD, NEW, { kdfParams: FAST_KDF });
    lockVault();

    await expect(unlockVault(OLD)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(snapshot(await unlockVault(NEW))).toEqual(saved);
  });

  test('a wrong current password changes nothing', async () => {
    await vaultWithEntry();
    const before = await vaultFile().bytes();
    await expect(
      changeMasterPassword('not the password', NEW, { kdfParams: FAST_KDF }),
    ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(await vaultFile().bytes()).toEqual(before);
    lockVault();
    await expect(unlockVault(OLD)).resolves.toBeDefined();
  });

  test('saving after a change still works and keeps the new password', async () => {
    const saved = await vaultWithEntry();
    await changeMasterPassword(OLD, NEW, { kdfParams: FAST_KDF });
    await saveVault(withEntries(snapshot(saved), makeEntry({ id: 'second', title: 'Second' })));
    lockVault();
    expect((await unlockVault(NEW)).entries.map((e) => e.id)).toEqual(['entry-1', 'second']);
  });

  test('two password changes in a row work', async () => {
    await vaultWithEntry();
    await changeMasterPassword(OLD, NEW, { kdfParams: FAST_KDF });
    await changeMasterPassword(NEW, 'a third long password!', { kdfParams: FAST_KDF });
    lockVault();
    await expect(unlockVault('a third long password!')).resolves.toBeDefined();
    await expect(unlockVault(NEW)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  // One test per possible moment of a crash, each with its own time budget.
  test.each(Array.from({ length: 9 }, (_, i) => i))(
    'a crash after %i file operations leaves a vault that opens with the old or the new password',
    async (survive) => {
      await vaultWithEntry();

      let count = 0;
      const spies = (['create', 'write', 'move', 'delete'] as const).map((name) => {
        const original = File.prototype[name] as (...args: unknown[]) => unknown;
        return jest.spyOn(File.prototype, name as 'create').mockImplementation(function (
          this: File,
          ...args: unknown[]
        ) {
          if (++count > survive) throw new Error('simulated crash');
          return original.apply(this, args);
        } as never);
      });
      try {
        await changeMasterPassword(OLD, NEW, { kdfParams: FAST_KDF }).catch(() => undefined);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
      lockVault();

      // Either the old or the new password opens it; never neither.
      const opened = await unlockVault(OLD).then(
        () => 'old',
        () =>
          unlockVault(NEW).then(
            () => 'new',
            () => 'none',
          ),
      );
      expect(['old', 'new']).toContain(opened);
    },
  );

  test('the vault key can still be replaced on request', async () => {
    await vaultWithEntry();
    const before = decodeVaultFile(await vaultFile().bytes());
    const keyBefore = getVaultKeyCopy();

    await changeMasterPassword(OLD, NEW, { kdfParams: FAST_KDF, rotateVaultKey: true });

    expect(getVaultKeyCopy()).not.toEqual(keyBefore);
    expect(decodeVaultFile(await vaultFile().bytes()).body).not.toEqual(before.body);
  });

  test('an empty new password is refused', async () => {
    await vaultWithEntry();
    await expect(changeMasterPassword(OLD, '', { kdfParams: FAST_KDF })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  test('needs an unlocked vault', async () => {
    await vaultWithEntry();
    lockVault();
    await expect(changeMasterPassword(OLD, NEW, { kdfParams: FAST_KDF })).rejects.toMatchObject({
      code: 'LOCKED',
    });
  });
});

describe('eraseVault', () => {
  test('deletes the vault file and forgets the unlocked data', async () => {
    await vaultWithEntry();
    expect(await vaultExists()).toBe(true);

    await eraseVault();

    expect(isVaultUnlocked()).toBe(false);
    expect(vaultFile().exists).toBe(false);
    expect(await vaultExists()).toBe(false);
    await expect(unlockVault(OLD)).rejects.toMatchObject({ code: 'NO_VAULT' });
  });

  test('also removes leftover temporary and backup copies, which could otherwise be restored', async () => {
    await vaultWithEntry();
    const bytes = await vaultFile().bytes();
    for (const name of ['vault.kvlt.bak', 'vault.kvlt.tmp']) {
      const f = vaultFile(name);
      f.create();
      await f.write(bytes);
    }

    await eraseVault();

    for (const name of ['vault.kvlt', 'vault.kvlt.bak', 'vault.kvlt.tmp']) {
      expect(vaultFile(name).exists).toBe(false);
    }
    expect(await vaultExists()).toBe(false); // nothing to restore
  });

  test('a save that was already waiting cannot bring the file back', async () => {
    const saved = await vaultWithEntry();
    const waitingSave = saveVault(withEntries(snapshot(saved), makeEntry({ id: 'late' })));
    const erase = eraseVault();
    await Promise.allSettled([waitingSave, erase]);
    expect(vaultFile().exists).toBe(false);
    await expect(saveVault(saved)).rejects.toMatchObject({ code: 'LOCKED' });
    expect(vaultFile().exists).toBe(false);
  });

  test('if the file cannot be deleted it throws, and the vault stays unlocked and untouched', async () => {
    await vaultWithEntry();
    jest.spyOn(File.prototype, 'delete').mockImplementation(() => {
      throw new Error('locked by the system');
    });

    await expect(eraseVault()).rejects.toThrow(/could not be deleted/);

    expect(isVaultUnlocked()).toBe(true);
    expect(vaultFile().exists).toBe(true);
  });

  test('works when there is nothing to erase', async () => {
    await expect(eraseVault()).resolves.toBeUndefined();
  });
});
