import { File } from 'expo-file-system';

import { createVault, lockVault, saveVault, unlockVault, vaultExists } from '..';
import {
  FAST_KDF,
  makeEntry,
  resetVaultFiles,
  snapshot,
  vaultFile,
  withEntries,
} from '../__support__/testUtils';

const PASSWORD = 'correct horse battery staple';
const OPERATIONS = ['create', 'write', 'move', 'delete'] as const;

// Simulates the process dying: the first `survive` file operations succeed, every later one throws.
function crashAfter(survive: number): () => void {
  let count = 0;
  const spies = OPERATIONS.map((name) => {
    const original = File.prototype[name] as (...args: unknown[]) => unknown;
    return jest.spyOn(File.prototype, name as 'create').mockImplementation(function (
      this: File,
      ...args: unknown[]
    ) {
      if (++count > survive) throw new Error('simulated crash');
      return original.apply(this, args);
    } as never);
  });
  return () => spies.forEach((spy) => spy.mockRestore());
}

beforeEach(resetVaultFiles);
afterAll(resetVaultFiles);

describe('atomic save', () => {
  // A save does about 8 file operations; try dying after each possible one.
  const CRASH_POINTS = Array.from({ length: 10 }, (_, i) => i);

  test.each(CRASH_POINTS)(
    'a crash after %i file operations during a save leaves a vault that unlocks (old or new data)',
    async (survive) => {
      const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
      const oldData = withEntries(created, makeEntry({ id: 'old' }));
      await saveVault(oldData);
      const oldSnapshot = snapshot(oldData);
      const newSnapshot = snapshot(withEntries(oldData, makeEntry({ id: 'new' })));

      const restore = crashAfter(survive);
      const outcome = await saveVault(snapshot(newSnapshot)).then(
        () => 'saved',
        () => 'crashed',
      );
      restore();
      lockVault();
      // Early crash points must really interrupt the save, or this test proves nothing.
      if (survive < 4) expect(outcome).toBe('crashed');

      const recovered = snapshot(await unlockVault(PASSWORD));
      expect([oldSnapshot, newSnapshot]).toContainEqual(recovered);

      // Recovery leaves a clean directory, and the next save works normally.
      expect(vaultFile('vault.kvlt.tmp').exists).toBe(false);
      expect(vaultFile('vault.kvlt.bak').exists).toBe(false);
      await saveVault(withEntries(recovered, makeEntry({ id: 'after' })));
      lockVault();
      expect((await unlockVault(PASSWORD)).entries.at(-1)?.id).toBe('after');
    },
  );

  test.each(CRASH_POINTS)(
    'a crash after %i file operations while creating a vault never leaves a broken one',
    async (survive) => {
      const restore = crashAfter(survive);
      await createVault(PASSWORD, { kdfParams: FAST_KDF }).catch(() => undefined);
      restore();
      lockVault();

      if (await vaultExists()) {
        await expect(unlockVault(PASSWORD)).resolves.toMatchObject({ version: 1 });
      }
      expect(vaultFile('vault.kvlt.tmp').exists).toBe(false);
    },
  );

  test('a half-written temp file never replaces the real vault', async () => {
    const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const saved = snapshot(withEntries(created, makeEntry()));
    await saveVault(snapshot(saved));

    const tmp = vaultFile('vault.kvlt.tmp');
    tmp.create();
    await tmp.write(new Uint8Array([1, 2, 3]));

    lockVault();
    expect(snapshot(await unlockVault(PASSWORD))).toEqual(saved);
    expect(vaultFile('vault.kvlt.tmp').exists).toBe(false);
  });
});

describe('a vault file that is damaged', () => {
  async function damageMainFile(keep: 'nothing' | 'old copy') {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const good = await vaultFile().bytes();
    lockVault();
    const main = vaultFile();
    main.delete();
    main.create();
    await main.write(new Uint8Array(good.length)); // right size, all zeros
    if (keep === 'old copy') {
      const bak = vaultFile('vault.kvlt.bak');
      bak.create();
      await bak.write(good);
    }
  }

  test('with no other copy: the vault still counts as existing and reports "damaged"', async () => {
    await damageMainFile('nothing');
    expect(await vaultExists()).toBe(true);
    await expect(unlockVault(PASSWORD)).rejects.toMatchObject({ code: 'CORRUPTED' });
  });

  test('with no other copy: a new vault cannot be created on top of it by accident', async () => {
    await damageMainFile('nothing');
    await expect(createVault('another password', { kdfParams: FAST_KDF })).rejects.toMatchObject({
      code: 'VAULT_EXISTS',
    });
  });

  test('with an intact old copy left by an interrupted save: it is used', async () => {
    await damageMainFile('old copy');
    await expect(unlockVault(PASSWORD)).resolves.toMatchObject({ version: 1 });
  });
});
