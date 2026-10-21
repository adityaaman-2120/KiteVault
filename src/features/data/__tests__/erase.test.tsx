import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';

import { fakeNative } from '@/features/biometric/__support__/fakeNativeKeystore';
import { clearAttemptState, loadAttemptState } from '@/features/lock/unlockService';
import { DEFAULT_APP_SETTINGS, SETTINGS_FILE } from '@/features/settings/appSettings';
import { useSessionStore } from '@/features/session/useSessionStore';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { readJsonFile, writeJsonFile } from '@/storage/jsonFile';
import {
  createVault,
  isVaultUnlocked,
  saveVault,
  unlockVault,
  vaultExists,
  useVaultStore,
} from '@/vault';
import {
  FAST_KDF,
  makeEntry,
  resetVaultFiles,
  vaultFile,
  withEntries,
} from '@/vault/__support__/testUtils';

import { DATA_INFO, DataInfoCard } from '../DataInfoCard';
import { EraseVaultCard, ERASE_WARNING } from '../EraseVaultCard';
import { eraseEverything, ERASE_WORD, isEraseConfirmed } from '../eraseVault';

jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('@/features/biometric/__support__/fakeNativeKeystore').fakeNative,
}));

const PASSWORD = 'correct horse battery staple';

// A phone that has a vault, biometric unlock, customised settings and a failed-attempt count.
async function setUpFullyConfiguredApp() {
  resetVaultFiles();
  fakeNative.reset();
  const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
  const data = withEntries(created, makeEntry());
  useVaultStore.setState({ data });
  await useVaultStore.getState().save(data);
  useSessionStore.getState().setStatus('unlocked');

  fakeNative.stored = new Uint8Array(32).fill(7);
  fakeNative.state = 'ready';
  await useSettingsStore.getState().update({
    backgroundLockSeconds: 0,
    allowScreenshots: true,
    clipboardClearSeconds: 60,
    biometricPromptDismissed: true,
  });
  await writeJsonFile('unlock-attempts.json', { failedAttempts: 3, lastFailedAt: 1 });
}

afterAll(() => {
  resetVaultFiles();
  clearAttemptState();
});

describe('confirmation word', () => {
  test('only the exact word ERASE counts', () => {
    expect(ERASE_WORD).toBe('ERASE');
    expect(isEraseConfirmed('ERASE')).toBe(true);
    for (const typed of ['', 'erase', 'Erase', 'ERASE ', ' ERASE', 'ERAS', 'ERASEE', 'DELETE']) {
      expect(isEraseConfirmed(typed)).toBe(false);
    }
  });
});

describe('eraseEverything', () => {
  beforeEach(setUpFullyConfiguredApp);

  test('removes the vault, the biometric key, all settings, and returns to the welcome state', async () => {
    await eraseEverything();

    // vault
    expect(vaultFile().exists).toBe(false);
    expect(await vaultExists()).toBe(false);
    expect(isVaultUnlocked()).toBe(false);
    expect(useVaultStore.getState().data).toBeNull();
    await expect(unlockVault(PASSWORD)).rejects.toMatchObject({ code: 'NO_VAULT' });

    // biometric key and blob
    expect(fakeNative.disableBiometricUnlock).toHaveBeenCalled();
    expect(fakeNative.stored).toBeNull();

    // settings and attempt counter: files gone, values back to the defaults
    expect(await readJsonFile(SETTINGS_FILE)).toBeNull();
    expect(await readJsonFile('unlock-attempts.json')).toBeNull();
    expect(await loadAttemptState()).toEqual({ failedAttempts: 0, lastFailedAt: 0 });
    expect(useSettingsStore.getState()).toMatchObject(DEFAULT_APP_SETTINGS);

    // the app goes back to the welcome screen
    expect(useSessionStore.getState().status).toBe('no-vault');
  });

  test('leftover backup copies are erased too', async () => {
    const bak = vaultFile('vault.kvlt.bak');
    bak.create();
    await bak.write(await vaultFile().bytes());
    await eraseEverything();
    expect(vaultFile('vault.kvlt.bak').exists).toBe(false);
    expect(await vaultExists()).toBe(false);
  });

  test('a new vault can be created afterwards, with no trace of the old one', async () => {
    await eraseEverything();
    const data = await createVault('a completely new password', { kdfParams: FAST_KDF });
    expect(data.entries).toEqual([]);
    expect(useSettingsStore.getState()).toMatchObject(DEFAULT_APP_SETTINGS);
  });

  test('if the vault file cannot be deleted, it says so and changes nothing else', async () => {
    jest.spyOn(File.prototype, 'delete').mockImplementation(() => {
      throw new Error('locked by the system');
    });
    await expect(eraseEverything()).rejects.toThrow();
    jest.restoreAllMocks();

    expect(isVaultUnlocked()).toBe(true);
    expect(vaultFile().exists).toBe(true);
    expect(useSessionStore.getState().status).toBe('unlocked');
    expect(fakeNative.disableBiometricUnlock).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().allowScreenshots).toBe(true);
    expect(await readJsonFile('unlock-attempts.json')).not.toBeNull();
  });

  test('the vault really is gone: the old data cannot be saved back', async () => {
    const old = useVaultStore.getState().data!;
    await eraseEverything();
    await expect(saveVault(old)).rejects.toMatchObject({ code: 'LOCKED' });
    expect(vaultFile().exists).toBe(false);
  });
});

describe('EraseVaultCard', () => {
  beforeEach(setUpFullyConfiguredApp);

  const eraseButton = () => screen.getByRole('button', { name: 'Erase everything' });

  test('the red button opens a confirmation with the exact warning, and erases nothing yet', async () => {
    await render(<EraseVaultCard />);
    expect(screen.queryByText(ERASE_WARNING)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Erase vault' }));

    expect(
      screen.getByText(
        'This will permanently erase all passwords on this device. This cannot be undone.',
      ),
    ).toBeTruthy();
    expect(vaultFile().exists).toBe(true);
    expect(isVaultUnlocked()).toBe(true);
  });

  test('the final button stays disabled until ERASE is typed exactly', async () => {
    await render(<EraseVaultCard />);
    await fireEvent.press(screen.getByRole('button', { name: 'Erase vault' }));
    expect(eraseButton()).toBeDisabled();

    for (const typed of ['erase', 'Erase', 'ERAS', 'ERASE ']) {
      await fireEvent.changeText(screen.getByLabelText('Type ERASE to confirm'), typed);
      expect(eraseButton()).toBeDisabled();
    }
    await fireEvent.changeText(screen.getByLabelText('Type ERASE to confirm'), 'ERASE');
    expect(eraseButton()).toBeEnabled();
  });

  test('Cancel closes it without erasing, and the word has to be typed again next time', async () => {
    await render(<EraseVaultCard />);
    await fireEvent.press(screen.getByRole('button', { name: 'Erase vault' }));
    await fireEvent.changeText(screen.getByLabelText('Type ERASE to confirm'), 'ERASE');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(ERASE_WARNING)).toBeNull();
    expect(vaultFile().exists).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Erase vault' }));
    expect(screen.getByLabelText('Type ERASE to confirm').props.value).toBe('');
    expect(eraseButton()).toBeDisabled();
  });

  test('confirming erases everything', async () => {
    await render(<EraseVaultCard />);
    await fireEvent.press(screen.getByRole('button', { name: 'Erase vault' }));
    await fireEvent.changeText(screen.getByLabelText('Type ERASE to confirm'), 'ERASE');
    await fireEvent.press(eraseButton());

    await waitFor(() => expect(useSessionStore.getState().status).toBe('no-vault'));
    expect(vaultFile().exists).toBe(false);
    expect(fakeNative.stored).toBeNull();
    expect(await readJsonFile(SETTINGS_FILE)).toBeNull();
  });

  test('if erasing fails the dialog stays open with a clear error and nothing is lost', async () => {
    await render(<EraseVaultCard />);
    await fireEvent.press(screen.getByRole('button', { name: 'Erase vault' }));
    await fireEvent.changeText(screen.getByLabelText('Type ERASE to confirm'), 'ERASE');

    jest.spyOn(File.prototype, 'delete').mockImplementation(() => {
      throw new Error('locked by the system');
    });
    await fireEvent.press(eraseButton());

    expect(await screen.findByText(/could not be erased, and nothing was changed/i)).toBeTruthy();
    jest.restoreAllMocks();
    expect(vaultFile().exists).toBe(true);
    expect(useSessionStore.getState().status).toBe('unlocked');
    expect(eraseButton()).toBeEnabled(); // can try again
  });
});

describe('DataInfoCard', () => {
  test('explains uninstalling and cloud backup', async () => {
    await render(<DataInfoCard />);
    expect(
      screen.getByText(
        'Uninstalling the app also deletes all local data. If you enabled cloud backup, your encrypted backup stays in your Google Drive until you delete it.',
      ),
    ).toBeTruthy();
    expect(DATA_INFO).toContain('Google Drive');
  });
});
