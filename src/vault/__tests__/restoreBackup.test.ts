import {
  createVault,
  eraseVault,
  formatRecoveryKey,
  generateRecoveryKey,
  isVaultUnlocked,
  lockVault,
  recoverVault,
  restoreVaultFromBackup,
  saveVault,
  setRecoveryKey,
  unlockVault,
  vaultExists,
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

// Makes a vault, copies its file (that copy is "the backup"), then wipes the phone.
async function makeBackup(withRecoveryKey = false) {
  const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
  const data = snapshot(withEntries(created, makeEntry()));
  await saveVault(snapshot(data));
  let recoveryText: string | undefined;
  if (withRecoveryKey) {
    const key = generateRecoveryKey();
    recoveryText = formatRecoveryKey(key);
    await setRecoveryKey(key);
  }
  const backup = await vaultFile().bytes();
  await eraseVault(); // a new phone: no vault, nothing unlocked
  return { backup, data, recoveryText };
}

beforeEach(resetVaultFiles);
afterAll(resetVaultFiles);

describe('restoreVaultFromBackup', () => {
  test('with the right master password it saves the vault on the phone and unlocks it', async () => {
    const { backup, data } = await makeBackup();

    const restored = await restoreVaultFromBackup(backup, PASSWORD);

    expect(snapshot(restored)).toEqual(data);
    expect(isVaultUnlocked()).toBe(true);
    expect(await vaultExists()).toBe(true);
  });

  test('the file is stored exactly as downloaded: nothing was re-encrypted', async () => {
    const { backup } = await makeBackup();
    await restoreVaultFromBackup(backup, PASSWORD);
    expect(await vaultFile().bytes()).toEqual(backup);
  });

  test('the restored vault opens normally afterwards', async () => {
    const { backup, data } = await makeBackup();
    await restoreVaultFromBackup(backup, PASSWORD);
    lockVault();
    expect(snapshot(await unlockVault(PASSWORD))).toEqual(data);
  });

  test('a wrong master password restores nothing', async () => {
    const { backup } = await makeBackup();
    await expect(restoreVaultFromBackup(backup, 'not the password')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    await expect(restoreVaultFromBackup(backup, '')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    expect(isVaultUnlocked()).toBe(false);
    expect(await vaultExists()).toBe(false);
  });

  test('knowing the Google account is not enough: the file alone opens nothing', async () => {
    const { backup } = await makeBackup();
    // Without the password there is no way in: no key is stored next to the data.
    const text = Buffer.from(backup).toString('latin1');
    expect(text).not.toContain(PASSWORD);
    await expect(restoreVaultFromBackup(backup, 'guess')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
  });

  test('refuses to overwrite a vault that is already on the phone', async () => {
    const { backup } = await makeBackup();
    await createVault('a different master password', { kdfParams: FAST_KDF });
    const before = await vaultFile().bytes();
    lockVault();

    await expect(restoreVaultFromBackup(backup, PASSWORD)).rejects.toMatchObject({
      code: 'VAULT_EXISTS',
    });
    expect(await vaultFile().bytes()).toEqual(before);
  });

  test.each([
    ['empty', () => new Uint8Array(0)],
    ['random bytes', () => new Uint8Array(300).fill(7)],
    ['truncated', (b: Uint8Array) => b.slice(0, 40)],
  ])('a %s file is reported as damaged, and nothing is saved', async (_name, damage) => {
    const { backup } = await makeBackup();
    await expect(restoreVaultFromBackup(damage(backup), PASSWORD)).rejects.toMatchObject({
      code: 'CORRUPTED',
    });
    expect(await vaultExists()).toBe(false);
  });

  test('a backup whose data was tampered with is refused before anything is saved', async () => {
    const { backup } = await makeBackup();
    const tampered = backup.slice();
    tampered[tampered.length - 3] = (tampered[tampered.length - 3] ?? 0) ^ 1;
    await expect(restoreVaultFromBackup(tampered, PASSWORD)).rejects.toMatchObject({
      code: 'CORRUPTED',
    });
    expect(await vaultExists()).toBe(false);
    expect(isVaultUnlocked()).toBe(false);
  });

  test('a backup from a newer version of the app is refused', async () => {
    const { backup } = await makeBackup();
    const text = Buffer.from(backup)
      .toString('latin1')
      .replace('"formatVersion":1', '"formatVersion":9');
    await expect(
      restoreVaultFromBackup(new Uint8Array(Buffer.from(text, 'latin1')), PASSWORD),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' });
  });

  test('the recovery key travels with the backup', async () => {
    const { backup, recoveryText } = await makeBackup(true);
    await restoreVaultFromBackup(backup, PASSWORD);
    lockVault();
    await expect(
      recoverVault(recoveryText!, 'a new master password!', { kdfParams: FAST_KDF }),
    ).resolves.toBeDefined();
  });
});
