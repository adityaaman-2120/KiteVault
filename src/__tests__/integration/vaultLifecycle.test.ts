import { fakeNative } from '@/features/biometric/__support__/fakeNativeKeystore';
import { eraseEverything } from '@/features/data/eraseVault';
import { saveEntryFromForm } from '@/features/entries/entryActions';
import { emptyForm } from '@/features/entries/entrySchema';
import {
  clearAttemptState,
  loadAttemptState,
  unlockWithAttemptLimit,
} from '@/features/lock/unlockService';
import { useSessionStore } from '@/features/session/useSessionStore';
import { DEFAULT_APP_SETTINGS, SETTINGS_FILE } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { readJsonFile } from '@/storage/jsonFile';
import { isVaultUnlocked, vaultExists, useVaultStore } from '@/vault';
import { resetVaultFiles, vaultFile } from '@/vault/__support__/testUtils';
import { File, Paths } from 'expo-file-system';

// The whole life of a vault with the real stores, the real encryption and the real file code
// (only the phone's secure hardware is replaced by a fake). Each step builds on the one before.
jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('@/features/biometric/__support__/fakeNativeKeystore').fakeNative,
}));

const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a completely different passphrase 2026';
const SECRET = 'site-password-marker-98765';
const TITLE = 'My Bank Title Marker';

const store = () => useVaultStore.getState();
const status = () => useSessionStore.getState().status;
const exists = (name: string) => new File(Paths.document, name).exists;

async function fileText(): Promise<string> {
  return Buffer.from(await vaultFile().bytes()).toString('latin1');
}
async function failure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error).name;
  }
  return 'NO_ERROR';
}

beforeAll(() => {
  resetVaultFiles();
  clearAttemptState();
  fakeNative.reset();
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  useVaultStore.setState({ data: null });
});
afterAll(() => {
  resetVaultFiles();
  clearAttemptState();
});

describe('one vault from creation to erase', () => {
  test('1. on a fresh phone there is no vault', async () => {
    await store().initialize();
    expect(await vaultExists()).toBe(false);
    expect(status()).toBe('no-vault');
    expect(store().data).toBeNull();
  });

  test('2. creating a vault unlocks it and writes an encrypted file', async () => {
    await store().create(PASSWORD);

    expect(status()).toBe('unlocked');
    expect(isVaultUnlocked()).toBe(true);
    expect(store().data).toMatchObject({ entries: [], folders: [] });
    expect(await vaultExists()).toBe(true);
    expect(exists('vault.kvlt')).toBe(true);
    expect(exists('vault.kvlt.tmp')).toBe(false);
    expect(exists('vault.kvlt.bak')).toBe(false);
    const text = await fileText();
    expect(text.startsWith('KVLT')).toBe(true);
    expect(text).not.toContain(PASSWORD);
  });

  test('3. adding an entry saves it, encrypted, and leaves no temporary files', async () => {
    const before = await fileText();
    const id = await saveEntryFromForm({
      ...emptyForm('login'),
      title: TITLE,
      username: 'alice@example.com',
      password: SECRET,
      urls: [{ value: 'https://bank.example' }],
      notes: 'a private note',
    });

    expect(store().data!.entries).toHaveLength(1);
    expect(store().data!.entries[0]).toMatchObject({ id, title: TITLE, password: SECRET });
    const after = await fileText();
    expect(after).not.toBe(before);
    for (const secret of [SECRET, TITLE, 'alice@example.com', 'bank.example', 'a private note']) {
      expect(after).not.toContain(secret);
    }
    expect(exists('vault.kvlt.tmp')).toBe(false);
    expect(exists('vault.kvlt.bak')).toBe(false);
  });

  test('4. locking removes the decrypted data and the key', async () => {
    store().lock();

    expect(status()).toBe('locked');
    expect(store().data).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
    // Nothing can be saved or changed while locked.
    expect(
      await failure(() =>
        store().save({ version: 1, entries: [], folders: [], settings: {} as never }),
      ),
    ).toBe('LOCKED');
    expect(await failure(() => saveEntryFromForm({ ...emptyForm(), title: 'x' }))).toBe('LOCKED');
    expect(await fileText()).not.toContain(SECRET);
  });

  test('5. a wrong password does not unlock and is counted; the right one unlocks and resets the count', async () => {
    expect(await failure(() => unlockWithAttemptLimit('not the password'))).toBe('WRONG_PASSWORD');
    expect(status()).toBe('locked');
    expect(store().data).toBeNull();
    expect((await loadAttemptState()).failedAttempts).toBe(1);

    await unlockWithAttemptLimit(PASSWORD);
    expect(status()).toBe('unlocked');
    expect((await loadAttemptState()).failedAttempts).toBe(0);
    expect(store().data!.entries).toHaveLength(1);
    expect(store().data!.entries[0]).toMatchObject({
      title: TITLE,
      password: SECRET,
      notes: 'a private note',
    });
  });

  test('6. changing the master password keeps the data and the vault key, and swaps which password works', async () => {
    const bodyOf = (text: string) => text.slice(text.indexOf('}', 6) + 1); // after the header JSON
    const beforeBody = bodyOf(await fileText());

    expect(await failure(() => store().changePassword('wrong current', NEW_PASSWORD))).toBe(
      'WRONG_PASSWORD',
    );
    expect(store().data!.entries).toHaveLength(1); // nothing changed by the refusal

    await store().changePassword(PASSWORD, NEW_PASSWORD);

    // The encrypted body is untouched: only the key wrapper in the header was replaced.
    expect(bodyOf(await fileText()).endsWith(beforeBody.slice(-200))).toBe(true);
    expect(store().data!.entries).toHaveLength(1);

    store().lock();
    expect(await failure(() => store().unlock(PASSWORD))).toBe('WRONG_PASSWORD');
    expect(status()).toBe('locked');
    await store().unlock(NEW_PASSWORD);
    expect(status()).toBe('unlocked');
    expect(store().data!.entries[0]).toMatchObject({ title: TITLE, password: SECRET });
    expect(await fileText()).not.toContain(NEW_PASSWORD);
  });

  test('7. entries added after the change are saved and survive another lock and unlock', async () => {
    await saveEntryFromForm({ ...emptyForm('note'), title: 'Second entry', notes: 'second note' });
    store().lock();
    await store().unlock(NEW_PASSWORD);
    expect(
      store()
        .data!.entries.map((e) => e.title)
        .sort(),
    ).toEqual([TITLE, 'Second entry'].sort());
  });

  test('8. erasing removes everything and the app goes back to the welcome state', async () => {
    fakeNative.stored = new Uint8Array(32).fill(5);
    fakeNative.state = 'ready';
    await useSettingsStore.getState().update({ clipboardClearSeconds: 60, allowScreenshots: true });
    expect(await readJsonFile(SETTINGS_FILE)).not.toBeNull();

    await eraseEverything();

    expect(exists('vault.kvlt')).toBe(false);
    expect(exists('vault.kvlt.tmp')).toBe(false);
    expect(exists('vault.kvlt.bak')).toBe(false);
    expect(await vaultExists()).toBe(false);
    expect(status()).toBe('no-vault');
    expect(store().data).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
    expect(fakeNative.stored).toBeNull(); // the biometric key copy is gone
    expect(await readJsonFile(SETTINGS_FILE)).toBeNull();
    expect(useSettingsStore.getState()).toMatchObject({
      clipboardClearSeconds: 30,
      allowScreenshots: false,
    });
    expect(await loadAttemptState()).toMatchObject({ failedAttempts: 0 });
  });

  test('9. after erasing, the old password and the old entries are gone for good', async () => {
    expect(await failure(() => store().unlock(NEW_PASSWORD))).toBe('NO_VAULT');
    await store().create('brand new master password 123');
    expect(store().data!.entries).toHaveLength(0);
    store().lock();
    expect(await failure(() => store().unlock(NEW_PASSWORD))).toBe('WRONG_PASSWORD');
    expect(await failure(() => store().unlock(PASSWORD))).toBe('WRONG_PASSWORD');
  });
});
