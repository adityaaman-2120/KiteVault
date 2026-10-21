import {
  changeMasterPassword,
  createVault,
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

const PASSWORD = 'correct horse battery staple';

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'VaultError', code });
}

beforeEach(resetVaultFiles);
afterAll(resetVaultFiles);

describe('createVault', () => {
  test('creates an empty, unlocked vault and writes the file', async () => {
    expect(await vaultExists()).toBe(false);
    const data = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    expect(data).toMatchObject({ version: 1, entries: [], folders: [] });
    expect(isVaultUnlocked()).toBe(true);
    expect(await vaultExists()).toBe(true);
  });

  test('refuses to overwrite an existing vault', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    await expectCode(createVault('another password', { kdfParams: FAST_KDF }), 'VAULT_EXISTS');
  });

  test('rejects an empty master password', async () => {
    await expectCode(createVault('', { kdfParams: FAST_KDF }), 'INVALID_INPUT');
    expect(await vaultExists()).toBe(false);
  });

  test('stores the KDF parameters in the header', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const { header } = decodeVaultFile(await vaultFile().bytes());
    expect(header.kdf).toEqual(FAST_KDF);
    expect(header.salt.length).toBe(16);
  });
});

describe('unlockVault', () => {
  test('unlocks with the correct password and returns the saved data', async () => {
    const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const saved = withEntries(created, makeEntry());
    await saveVault(snapshot(saved));
    lockVault();

    const data = await unlockVault(PASSWORD);
    expect(data).toEqual(snapshot(saved));
    expect(isVaultUnlocked()).toBe(true);
  });

  test('wrong password fails with WRONG_PASSWORD and stays locked', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    lockVault();
    await expectCode(unlockVault('wrong password'), 'WRONG_PASSWORD');
    await expectCode(unlockVault(''), 'WRONG_PASSWORD');
    expect(isVaultUnlocked()).toBe(false);
  });

  test('fails with NO_VAULT when nothing has been created', async () => {
    await expectCode(unlockVault(PASSWORD), 'NO_VAULT');
  });
});

describe('corrupted files', () => {
  async function createLocked() {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    lockVault();
    return await vaultFile().bytes();
  }

  async function overwrite(bytes: Uint8Array) {
    const file = vaultFile();
    file.delete();
    file.create();
    await file.write(bytes);
  }

  test('a flipped bit in the encrypted body is reported as CORRUPTED', async () => {
    const bytes = await createLocked();
    bytes[bytes.length - 5] = (bytes[bytes.length - 5] ?? 0) ^ 1;
    await overwrite(bytes);
    await expectCode(unlockVault(PASSWORD), 'CORRUPTED');
  });

  test('a flipped bit in the wrapped key looks like a wrong password', async () => {
    const bytes = await createLocked();
    const text = Buffer.from(bytes).toString('latin1');
    const at = text.indexOf('"wrappedKey":"') + '"wrappedKey":"'.length + 4;
    bytes[at] = bytes[at] === 0x41 ? 0x42 : 0x41; // swap one base64 character
    await overwrite(bytes);
    await expectCode(unlockVault(PASSWORD), 'WRONG_PASSWORD');
  });

  test.each([
    ['truncated', (b: Uint8Array) => b.slice(0, b.length - 20)],
    ['empty', () => new Uint8Array(0)],
    ['wrong magic', (b: Uint8Array) => Uint8Array.from(b, (v, i) => (i === 0 ? 0x58 : v))],
    ['random bytes', () => new Uint8Array(200).fill(7)],
  ])('%s file is reported as CORRUPTED', async (_name, damage) => {
    await overwrite(damage(await createLocked()));
    await expectCode(unlockVault(PASSWORD), 'CORRUPTED');
  });

  test('a damaged vault file is restored from the previous copy when one exists', async () => {
    const good = await createLocked();
    const bak = vaultFile('vault.kvlt.bak');
    bak.create();
    await bak.write(good);
    await overwrite(good.slice(0, 10));
    await expect(unlockVault(PASSWORD)).resolves.toMatchObject({ version: 1 });
    expect(vaultFile('vault.kvlt.bak').exists).toBe(false);
  });

  test('a newer format version is rejected as UNSUPPORTED_VERSION', async () => {
    const bytes = await createLocked();
    const text = Buffer.from(bytes)
      .toString('latin1')
      .replace('"formatVersion":1', '"formatVersion":9');
    await overwrite(new Uint8Array(Buffer.from(text, 'latin1')));
    await expectCode(unlockVault(PASSWORD), 'UNSUPPORTED_VERSION');
  });
});

describe('saveVault', () => {
  test('persists changes across lock and unlock', async () => {
    const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const first = withEntries(created, makeEntry());
    await saveVault(first);
    const second = withEntries(first, makeEntry({ id: 'entry-2', title: 'Second' }));
    await saveVault(second);
    lockVault();
    expect((await unlockVault(PASSWORD)).entries.map((e) => e.id)).toEqual(['entry-1', 'entry-2']);
  });

  test('every save uses a new IV and different bytes', async () => {
    const data = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const bodies = new Set<string>();
    for (let i = 0; i < 20; i++) {
      await saveVault(data);
      const { body } = decodeVaultFile(await vaultFile().bytes());
      bodies.add(Buffer.from(body.subarray(0, 12)).toString('hex'));
    }
    expect(bodies.size).toBe(20);
  });

  test('the file on disk contains no plaintext secrets', async () => {
    const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    await saveVault(withEntries(created, makeEntry()));
    const text = Buffer.from(await vaultFile().bytes()).toString('latin1');
    for (const secret of ['hunter2-unique-marker', 'alice@example.com', 'Example Site', PASSWORD]) {
      expect(text).not.toContain(secret);
    }
    expect(vaultFile('vault.kvlt.tmp').exists).toBe(false);
    expect(vaultFile('vault.kvlt.bak').exists).toBe(false);
  });

  test('fails with LOCKED while locked', async () => {
    const data = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    lockVault();
    await expectCode(saveVault(data), 'LOCKED');
  });
});

describe('lockVault', () => {
  test('clears the session and scrubs the decrypted data held in memory', async () => {
    const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const withEntry = withEntries(created, makeEntry());
    await saveVault(withEntry);

    lockVault();

    expect(isVaultUnlocked()).toBe(false);
    expect(withEntry.entries).toEqual([]);
  });

  test('also scrubs card and identity details and password history', async () => {
    const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const card = {
      holder: 'H',
      number: '4242424242424242',
      expiry: '09/28',
      cvv: '123',
      pin: '1234',
    };
    const identity = { fullName: 'Pat', email: 'p@example.com', phone: '1', address: 'x' };
    const withDetails = withEntries(created, makeEntry({ card, identity }));
    await saveVault(withDetails);
    const kept = {
      card: withDetails.entries[0]!.card!,
      identity: withDetails.entries[0]!.identity!,
      entry: withDetails.entries[0]!,
    };

    lockVault();

    expect(Object.values(kept.card).every((v) => v === '')).toBe(true);
    expect(Object.values(kept.identity).every((v) => v === '')).toBe(true);
    expect(kept.entry.passwordHistory).toEqual([]);
  });

  test('is safe to call when already locked', () => {
    expect(() => lockVault()).not.toThrow();
  });
});

describe('changeMasterPassword', () => {
  test('the new password unlocks, the old one no longer does, and data is kept', async () => {
    const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const saved = withEntries(created, makeEntry());
    await saveVault(snapshot(saved));
    const before = await vaultFile().bytes();

    await changeMasterPassword(PASSWORD, 'a brand new password', { kdfParams: FAST_KDF });
    lockVault();

    await expectCode(unlockVault(PASSWORD), 'WRONG_PASSWORD');
    expect(await unlockVault('a brand new password')).toEqual(snapshot(saved));

    const after = await vaultFile().bytes();
    const a = decodeVaultFile(before);
    const b = decodeVaultFile(after);
    expect(b.header.salt).not.toEqual(a.header.salt);
    expect(b.header.wrappedKey).not.toEqual(a.header.wrappedKey);
  });

  test('a wrong old password fails and changes nothing', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const before = await vaultFile().bytes();
    await expectCode(
      changeMasterPassword('not the password', 'new password', { kdfParams: FAST_KDF }),
      'WRONG_PASSWORD',
    );
    expect(await vaultFile().bytes()).toEqual(before);
    lockVault();
    await expect(unlockVault(PASSWORD)).resolves.toBeDefined();
  });

  test('requires an unlocked vault and a non-empty new password', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    await expectCode(changeMasterPassword(PASSWORD, '', { kdfParams: FAST_KDF }), 'INVALID_INPUT');
    lockVault();
    await expectCode(changeMasterPassword(PASSWORD, 'x', { kdfParams: FAST_KDF }), 'LOCKED');
  });

  test('can raise the stored KDF cost', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    const stronger = { ...FAST_KDF, iterations: 3 };
    await changeMasterPassword(PASSWORD, PASSWORD, { kdfParams: stronger });
    expect(decodeVaultFile(await vaultFile().bytes()).header.kdf).toEqual(stronger);
    lockVault();
    await expect(unlockVault(PASSWORD)).resolves.toBeDefined();
  });
});
