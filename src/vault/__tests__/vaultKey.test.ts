import {
  changeMasterPassword,
  createVault,
  getVaultKeyCopy,
  isVaultUnlocked,
  lockVault,
  saveVault,
  unlockVault,
  unlockVaultWithKey,
} from '..';
import {
  FAST_KDF,
  makeEntry,
  resetVaultFiles,
  snapshot,
  vaultFile,
  withEntries,
} from '../__support__/testUtils';

const PASSWORD = 'correct horse battery staple';

beforeEach(resetVaultFiles);
afterAll(resetVaultFiles);

async function vaultWithEntry() {
  const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
  const data = snapshot(withEntries(created, makeEntry()));
  await saveVault(snapshot(data));
  return data;
}

describe('getVaultKeyCopy', () => {
  test('returns a 32-byte copy that can be wiped without affecting the vault', async () => {
    const data = await vaultWithEntry();
    const copy = getVaultKeyCopy();
    expect(copy.length).toBe(32);

    copy.fill(0);

    expect(getVaultKeyCopy().some((byte) => byte !== 0)).toBe(true);
    await expect(saveVault(snapshot(data))).resolves.toBeUndefined();
  });

  test('is refused while locked', async () => {
    await vaultWithEntry();
    lockVault();
    expect(() => getVaultKeyCopy()).toThrow(/locked/i);
  });
});

describe('unlockVaultWithKey', () => {
  test('opens the vault with the right key, without the password', async () => {
    const saved = await vaultWithEntry();
    const key = getVaultKeyCopy();
    lockVault();

    const data = await unlockVaultWithKey(key);

    expect(snapshot(data)).toEqual(saved);
    expect(isVaultUnlocked()).toBe(true);
    // The session works normally afterwards.
    await expect(saveVault(snapshot(saved))).resolves.toBeUndefined();
  });

  test('a wrong key fails with WRONG_KEY, stays locked, and the key is wiped', async () => {
    await vaultWithEntry();
    lockVault();
    const wrong = new Uint8Array(32).fill(9);

    await expect(unlockVaultWithKey(wrong)).rejects.toMatchObject({ code: 'WRONG_KEY' });

    expect(isVaultUnlocked()).toBe(false);
    expect(wrong.every((byte) => byte === 0)).toBe(true);
  });

  test('a key of the wrong size is refused the same way', async () => {
    await vaultWithEntry();
    lockVault();
    await expect(unlockVaultWithKey(new Uint8Array(5).fill(1))).rejects.toMatchObject({
      code: 'WRONG_KEY',
    });
  });

  test('fails with NO_VAULT when there is no vault file', async () => {
    await expect(unlockVaultWithKey(new Uint8Array(32).fill(1))).rejects.toMatchObject({
      code: 'NO_VAULT',
    });
  });

  test('a damaged vault file is reported as CORRUPTED', async () => {
    await vaultWithEntry();
    const key = getVaultKeyCopy();
    lockVault();
    const file = vaultFile();
    file.delete();
    file.create();
    await file.write(new Uint8Array([1, 2, 3]));

    await expect(unlockVaultWithKey(key)).rejects.toMatchObject({ code: 'CORRUPTED' });
  });

  test('a normal password change keeps the vault key (only the wrapping changes)', async () => {
    await vaultWithEntry();
    const key = getVaultKeyCopy();

    await changeMasterPassword(PASSWORD, 'another long password', { kdfParams: FAST_KDF });
    lockVault();

    await expect(unlockVaultWithKey(Uint8Array.from(key))).resolves.toBeDefined();
  });

  test('the old key stops working after a password change that replaces the vault key', async () => {
    await vaultWithEntry();
    const oldKey = getVaultKeyCopy();

    await changeMasterPassword(PASSWORD, 'another long password', {
      kdfParams: FAST_KDF,
      rotateVaultKey: true,
    });
    const newKey = getVaultKeyCopy();
    lockVault();

    expect(newKey).not.toEqual(oldKey);
    await expect(unlockVaultWithKey(oldKey)).rejects.toMatchObject({ code: 'WRONG_KEY' });
    await expect(unlockVaultWithKey(newKey)).resolves.toBeDefined();
    lockVault();
    await expect(unlockVault('another long password')).resolves.toBeDefined();
  });
});
