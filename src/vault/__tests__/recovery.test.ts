import { File } from 'expo-file-system';

import {
  changeMasterPassword,
  createVault,
  formatRecoveryKey,
  generateRecoveryKey,
  getRecoveryInfo,
  getVaultKeyCopy,
  isVaultUnlocked,
  lockVault,
  recoverVault,
  removeRecoveryKey,
  saveVault,
  setRecoveryKey,
  unlockVault,
  unlockVaultWithKey,
  verifyMasterPassword,
} from '..';
import { decodeVaultFile, encodeVaultFile } from '../format';
import {
  FAST_KDF,
  makeEntry,
  resetVaultFiles,
  snapshot,
  vaultFile,
  withEntries,
} from '../__support__/testUtils';

const OLD = 'correct horse battery staple';
const NEW = 'a completely new master password';
const opts = { kdfParams: FAST_KDF };

async function vaultWithEntry() {
  const created = await createVault(OLD, opts);
  const data = snapshot(withEntries(created, makeEntry()));
  await saveVault(snapshot(data));
  return data;
}

// Makes a recovery key the way the app does, and returns the text the user would write down.
async function makeRecoveryKey(now?: () => number) {
  const key = generateRecoveryKey();
  const text = formatRecoveryKey(key);
  await setRecoveryKey(key, now);
  return text;
}

const header = async () => decodeVaultFile(await vaultFile().bytes());

beforeEach(resetVaultFiles);
afterEach(() => jest.restoreAllMocks());
afterAll(resetVaultFiles);

describe('creating a recovery key', () => {
  test('a vault starts without one', async () => {
    await vaultWithEntry();
    expect(await getRecoveryInfo()).toEqual({ exists: false });
    expect((await header()).header.recovery).toBeUndefined();
  });

  test('adds a second wrapped copy of the vault key to the header and leaves the body alone', async () => {
    await vaultWithEntry();
    const before = await header();

    await makeRecoveryKey(() => 1_700_000_000_000);

    const after = await header();
    expect(after.body).toEqual(before.body); // nothing re-encrypted
    expect(after.header.wrappedKey).toEqual(before.header.wrappedKey); // password entry untouched
    expect(after.header.salt).toEqual(before.header.salt);
    expect(after.header.recovery?.wrappedKey).toHaveLength(60); // iv 12 + key 32 + tag 16
    expect(after.header.recovery?.createdAt).toBe(1_700_000_000_000);
    expect(await getRecoveryInfo()).toEqual({ exists: true, createdAt: 1_700_000_000_000 });
  });

  test('the recovery key itself is never written anywhere', async () => {
    await vaultWithEntry();
    const key = generateRecoveryKey();
    const text = formatRecoveryKey(key);
    await setRecoveryKey(key);

    const file = Buffer.from(await vaultFile().bytes());
    expect(file.includes(Buffer.from(key))).toBe(false);
    expect(file.toString('latin1')).not.toContain(text.replace(/-/g, ''));
    for (const group of text.split('-')) expect(file.toString('latin1')).not.toContain(group);
  });

  test('the master password still works, and saving keeps the recovery entry', async () => {
    const saved = await vaultWithEntry();
    await makeRecoveryKey();
    await saveVault(withEntries(snapshot(saved), makeEntry({ id: 'second' })));

    expect((await header()).header.recovery).toBeDefined();
    lockVault();
    expect((await unlockVault(OLD)).entries.map((e) => e.id)).toEqual(['entry-1', 'second']);
    expect(await getRecoveryInfo()).toMatchObject({ exists: true });
  });

  test('works with the vault locked: the header can be read without any key', async () => {
    await vaultWithEntry();
    await makeRecoveryKey();
    lockVault();
    expect(await getRecoveryInfo()).toMatchObject({ exists: true });
  });

  test('needs an unlocked vault and a 32-byte key', async () => {
    await vaultWithEntry();
    await expect(setRecoveryKey(new Uint8Array(16))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    lockVault();
    await expect(setRecoveryKey(generateRecoveryKey())).rejects.toMatchObject({ code: 'LOCKED' });
  });

  test('the master password can be checked first without changing anything', async () => {
    await vaultWithEntry();
    const before = await vaultFile().bytes();
    await expect(verifyMasterPassword(OLD)).resolves.toBeUndefined();
    await expect(verifyMasterPassword('wrong')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(await vaultFile().bytes()).toEqual(before);
  });

  test('a new recovery key replaces the old one, which stops working', async () => {
    await vaultWithEntry();
    const first = await makeRecoveryKey();
    const second = await makeRecoveryKey();
    lockVault();

    await expect(recoverVault(first, NEW, opts)).rejects.toMatchObject({
      code: 'WRONG_RECOVERY_KEY',
    });
    await expect(recoverVault(second, NEW, opts)).resolves.toBeDefined();
  });

  test('removing the recovery key makes it useless', async () => {
    await vaultWithEntry();
    const text = await makeRecoveryKey();
    await removeRecoveryKey();
    expect(await getRecoveryInfo()).toEqual({ exists: false });
    lockVault();
    await expect(recoverVault(text, NEW, opts)).rejects.toMatchObject({ code: 'NO_RECOVERY_KEY' });
    await expect(unlockVault(OLD)).resolves.toBeDefined(); // the password is unaffected
  });
});

describe('forgot master password: the full recovery flow', () => {
  test('recovers with the written-down key, sets a new password, and keeps all data', async () => {
    const saved = await vaultWithEntry();
    const text = await makeRecoveryKey();
    const bodyBefore = (await header()).body;
    lockVault();

    // The master password is "forgotten": the recovery key opens the vault and sets a new one.
    const data = await recoverVault(text, NEW, opts);

    expect(isVaultUnlocked()).toBe(true);
    expect(snapshot(data)).toEqual(saved);
    expect((await header()).body).toEqual(bodyBefore); // still not re-encrypted
    lockVault();

    await expect(unlockVault(OLD)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' }); // old password is gone
    expect(snapshot(await unlockVault(NEW))).toEqual(saved);
  });

  test('typed in lower case, with spaces, or with O for 0, it still works', async () => {
    await vaultWithEntry();
    const text = await makeRecoveryKey();
    lockVault();
    const sloppy = text.toLowerCase().replace(/-/g, '  ').replace(/0/g, 'o');
    await expect(recoverVault(sloppy, NEW, opts)).resolves.toBeDefined();
  });

  test('the recovery key keeps working afterwards (and after more password changes)', async () => {
    await vaultWithEntry();
    const text = await makeRecoveryKey();
    lockVault();

    await recoverVault(text, NEW, opts);
    await changeMasterPassword(NEW, 'yet another master password', opts);
    lockVault();

    await expect(recoverVault(text, 'and one more master password', opts)).resolves.toBeDefined();
    lockVault();
    await expect(unlockVault('and one more master password')).resolves.toBeDefined();
  });

  test('the vault key does not change, so biometric unlock stays valid', async () => {
    await vaultWithEntry();
    const keyBefore = getVaultKeyCopy();
    const text = await makeRecoveryKey();
    lockVault();

    await recoverVault(text, NEW, opts);
    expect(getVaultKeyCopy()).toEqual(keyBefore);
    lockVault();
    await expect(unlockVaultWithKey(Uint8Array.from(keyBefore))).resolves.toBeDefined();
  });

  test('the new password works with the stored KDF upgraded to the requested cost', async () => {
    await vaultWithEntry();
    const text = await makeRecoveryKey();
    lockVault();
    await recoverVault(text, NEW, { kdfParams: { ...FAST_KDF, iterations: 3 } });
    expect((await header()).header.kdf.iterations).toBe(3);
  });

  describe('wrong input', () => {
    test('a key with a typo is reported as a typing mistake and nothing changes', async () => {
      await vaultWithEntry();
      const text = await makeRecoveryKey();
      lockVault();
      const before = await vaultFile().bytes();

      const typo = (text[0] === '2' ? '3' : '2') + text.slice(1);
      await expect(recoverVault(typo, NEW, opts)).rejects.toMatchObject({
        code: 'INVALID_RECOVERY_KEY',
      });
      await expect(recoverVault(text.slice(0, 30), NEW, opts)).rejects.toMatchObject({
        code: 'INVALID_RECOVERY_KEY',
      });
      expect(await vaultFile().bytes()).toEqual(before);
      expect(isVaultUnlocked()).toBe(false);
    });

    test('a well-formed key for another vault is refused', async () => {
      await vaultWithEntry();
      await makeRecoveryKey();
      lockVault();
      const stranger = formatRecoveryKey(generateRecoveryKey());
      const before = await vaultFile().bytes();

      await expect(recoverVault(stranger, NEW, opts)).rejects.toMatchObject({
        code: 'WRONG_RECOVERY_KEY',
      });
      expect(await vaultFile().bytes()).toEqual(before);
      await expect(unlockVault(OLD)).resolves.toBeDefined(); // the old password still works
    });

    test('a vault without a recovery key says so', async () => {
      await vaultWithEntry();
      lockVault();
      await expect(
        recoverVault(formatRecoveryKey(generateRecoveryKey()), NEW, opts),
      ).rejects.toMatchObject({ code: 'NO_RECOVERY_KEY' });
    });

    test('an empty new password is refused before anything happens', async () => {
      await vaultWithEntry();
      const text = await makeRecoveryKey();
      lockVault();
      await expect(recoverVault(text, '', opts)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    test('there is nothing to recover when no vault exists', async () => {
      await expect(
        recoverVault(formatRecoveryKey(generateRecoveryKey()), NEW, opts),
      ).rejects.toMatchObject({ code: 'NO_VAULT' });
    });

    test('a damaged vault body is reported as damaged, not as a wrong key', async () => {
      await vaultWithEntry();
      const text = await makeRecoveryKey();
      lockVault();
      const { header: h, body } = await header();
      const damaged = body.slice();
      damaged[damaged.length - 1] = (damaged[damaged.length - 1] ?? 0) ^ 1;
      const file = vaultFile();
      file.delete();
      file.create();
      await file.write(encodeVaultFile(h, damaged));

      await expect(recoverVault(text, NEW, opts)).rejects.toMatchObject({ code: 'CORRUPTED' });
    });
  });

  test.each(Array.from({ length: 9 }, (_, i) => i))(
    'a crash after %i file operations leaves the old or the new master password working',
    async (survive) => {
      await vaultWithEntry();
      const text = await makeRecoveryKey();
      lockVault();

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
        await recoverVault(text, NEW, opts).catch(() => undefined);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
      lockVault();

      const opened = await unlockVault(OLD).then(
        () => 'old',
        () =>
          unlockVault(NEW).then(
            () => 'new',
            () => 'none',
          ),
      );
      expect(['old', 'new']).toContain(opened);
      // And in every case the recovery key can still be used afterwards.
      lockVault();
      await expect(recoverVault(text, 'final master password here', opts)).resolves.toBeDefined();
    },
  );
});

describe('interaction with other changes', () => {
  test('a normal password change keeps the recovery key valid', async () => {
    await vaultWithEntry();
    const text = await makeRecoveryKey();
    await changeMasterPassword(OLD, NEW, opts);
    expect(await getRecoveryInfo()).toMatchObject({ exists: true });
    lockVault();
    await expect(recoverVault(text, 'another master password!', opts)).resolves.toBeDefined();
  });

  test('replacing the vault key drops the recovery key (it cannot be re-wrapped), and says so', async () => {
    await vaultWithEntry();
    const text = await makeRecoveryKey();
    await changeMasterPassword(OLD, NEW, { ...opts, rotateVaultKey: true });

    expect(await getRecoveryInfo()).toEqual({ exists: false });
    lockVault();
    await expect(recoverVault(text, 'another master password!', opts)).rejects.toMatchObject({
      code: 'NO_RECOVERY_KEY',
    });
  });

  test('a header with a damaged recovery entry makes the file unreadable', async () => {
    await vaultWithEntry();
    await makeRecoveryKey();
    lockVault();
    const { header: h, body } = await header();
    h.recovery = { wrappedKey: new Uint8Array(10), createdAt: 1 };
    const file = vaultFile();
    file.delete();
    file.create();
    await file.write(encodeVaultFile(h, body));
    await expect(unlockVault(OLD)).rejects.toMatchObject({ code: 'CORRUPTED' });
  });
});
