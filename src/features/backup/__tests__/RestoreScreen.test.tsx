import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { clearAttemptState } from '@/features/lock/unlockService';
import { useSessionStore } from '@/features/session/useSessionStore';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { eraseVault, isVaultUnlocked, useVaultStore, vaultExists } from '@/vault';
import { vaultFile } from '@/vault/__support__/testUtils';

import { backupNow, enableBackup } from '../backupService';
import { useBackupState } from '../backupState';
import { BackupError } from '../errors';
import { RESTORE_NOTICE, RestoreScreen } from '../RestoreScreen';
import { testDrive, testGoogle } from '../__support__/fakeGoogle';
import {
  backupSettings,
  MASTER_PASSWORD,
  setUpBackupEnv,
  tearDownBackupEnv,
} from '../__support__/backupTestEnv';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { cloudBackup: { enabled: true, webClientId: '' } } } },
}));
jest.mock('../googleAuth', () => ({
  ...jest.requireActual('../googleAuth'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  googleAuth: require('../__support__/fakeGoogle').testGoogle,
}));

const downloads = () => testDrive.requests.filter((r) => r.url.includes('alt=media'));
const signInButton = () => screen.getByRole('button', { name: 'Sign in with Google' });
const restoreButton = () => screen.getByRole('button', { name: /^Restore vault|^Restoring/ });

// The phone that made the backup, then a brand-new phone: no vault, nothing signed in.
async function newPhoneWithBackupInCloud() {
  await setUpBackupEnv();
  await enableBackup();
  await backupNow();
  await eraseVault();
  useVaultStore.setState({ data: null });
  useSessionStore.getState().setStatus('no-vault');
  await useSettingsStore.getState().update({
    backupEnabled: false,
    backupRemoteId: '',
    backupRemoteModified: '',
    backupLastAt: 0,
  });
  useBackupState.setState({ email: null });
  testGoogle.state.signedIn = false;
  testDrive.requests.length = 0;
  testGoogle.signIn.mockClear();
  clearAttemptState();
}

beforeEach(async () => {
  jest.clearAllMocks();
  await newPhoneWithBackupInCloud();
});
afterAll(tearDownBackupEnv);

test('says clearly that Google sign-in alone cannot open the vault', async () => {
  await render(<RestoreScreen />);
  expect(screen.getByText(RESTORE_NOTICE)).toBeTruthy();
  expect(RESTORE_NOTICE).toBe(
    'Signing in with Google only finds your encrypted backup. It cannot open your vault. You need your master password to decrypt it.',
  );
});

test('signing in finds the backup but downloads nothing and opens nothing', async () => {
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());

  expect(await screen.findByText(/Backup found in someone@example.com/)).toBeTruthy();
  expect(screen.getByLabelText('Master password of the backed-up vault')).toBeTruthy();
  expect(downloads()).toHaveLength(0); // the encrypted file has not even been fetched yet
  expect(await vaultExists()).toBe(false);
  expect(isVaultUnlocked()).toBe(false);
  expect(restoreButton()).toBeDisabled();
});

test('restores the vault with the right master password', async () => {
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  await screen.findByText(/Backup found/);
  await fireEvent.changeText(
    screen.getByLabelText('Master password of the backed-up vault'),
    MASTER_PASSWORD,
  );
  await fireEvent.press(restoreButton());

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'), { timeout: 15000 });
  expect(isVaultUnlocked()).toBe(true);
  expect(useSessionStore.getState().status).toBe('unlocked');
  expect(useVaultStore.getState().data?.entries.map((e) => e.id)).toEqual(['entry-1']);
  expect(await vaultFile().bytes()).toEqual(testDrive.only().bytes); // exactly the downloaded file
});

test('afterwards this phone tracks that backup, so its next backup is not a conflict', async () => {
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  await screen.findByText(/Backup found/);
  await fireEvent.changeText(
    screen.getByLabelText('Master password of the backed-up vault'),
    MASTER_PASSWORD,
  );
  await fireEvent.press(restoreButton());
  await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 15000 });

  expect(backupSettings()).toMatchObject({
    backupEnabled: true,
    backupAuto: false,
    backupRemoteId: testDrive.only().id,
    backupRemoteModified: testDrive.only().modifiedTime,
  });
  await expect(backupNow()).resolves.toBeDefined();
});

test('a wrong master password says so, restores nothing, and does not download again on retry', async () => {
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  await screen.findByText(/Backup found/);

  await fireEvent.changeText(
    screen.getByLabelText('Master password of the backed-up vault'),
    'not the password',
  );
  await fireEvent.press(restoreButton());
  expect(await screen.findByText(/does not open this backup/i)).toBeTruthy();
  expect(isVaultUnlocked()).toBe(false);
  expect(await vaultExists()).toBe(false);
  expect(screen.getByLabelText('Master password of the backed-up vault').props.value).toBe('');

  await fireEvent.changeText(
    screen.getByLabelText('Master password of the backed-up vault'),
    MASTER_PASSWORD,
  );
  await fireEvent.press(restoreButton());
  await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 15000 });
  expect(downloads()).toHaveLength(1);
});

test('after 5 wrong passwords it makes the user wait', async () => {
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  await screen.findByText(/Backup found/);
  for (let i = 0; i < 5; i++) {
    await fireEvent.changeText(
      screen.getByLabelText('Master password of the backed-up vault'),
      'nope',
    );
    await fireEvent.press(restoreButton());
    await screen.findByText(/does not open this backup/i);
  }
  await fireEvent.changeText(
    screen.getByLabelText('Master password of the backed-up vault'),
    MASTER_PASSWORD,
  );
  await fireEvent.press(restoreButton());
  expect(await screen.findByText(/Too many wrong attempts/)).toBeTruthy();
  expect(isVaultUnlocked()).toBe(false);
});

test('a Google account without a backup gets a clear message and can switch accounts', async () => {
  testDrive.files.clear();
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  expect(
    await screen.findByText(/No KiteVault backup was found in someone@example.com/),
  ).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Use a different Google account' }));
  expect(testGoogle.signOut).toHaveBeenCalled();
  expect(signInButton()).toBeTruthy();
});

test('cancelling the Google sign-in is quiet', async () => {
  testGoogle.state.signInError = new BackupError('cancelled');
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  await waitFor(() => expect(testGoogle.signIn).toHaveBeenCalled());
  expect(screen.queryByRole('alert')).toBeNull();
  expect(signInButton()).toBeTruthy();
});

test('no internet while looking for the backup', async () => {
  testDrive.offline = true;
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  expect(await screen.findByText(/No internet connection/)).toBeTruthy();
});

test('no internet while downloading keeps the password field so the user can retry', async () => {
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  await screen.findByText(/Backup found/);
  testDrive.offline = true;
  await fireEvent.changeText(
    screen.getByLabelText('Master password of the backed-up vault'),
    MASTER_PASSWORD,
  );
  await fireEvent.press(restoreButton());
  expect(await screen.findByText(/No internet connection/)).toBeTruthy();

  testDrive.offline = false;
  await fireEvent.changeText(
    screen.getByLabelText('Master password of the backed-up vault'),
    MASTER_PASSWORD,
  );
  await fireEvent.press(restoreButton());
  await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 15000 });
});

test('a backup that vanished before the download is "not found"', async () => {
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  await screen.findByText(/Backup found/);
  testDrive.files.clear();
  await fireEvent.changeText(
    screen.getByLabelText('Master password of the backed-up vault'),
    MASTER_PASSWORD,
  );
  await fireEvent.press(restoreButton());
  expect(await screen.findByText(/backup was not found/i)).toBeTruthy();
});

test('a damaged or unreadable backup is reported', async () => {
  testDrive.only().bytes = new Uint8Array([1, 2, 3]);
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  await screen.findByText(/Backup found/);
  await fireEvent.changeText(
    screen.getByLabelText('Master password of the backed-up vault'),
    MASTER_PASSWORD,
  );
  await fireEvent.press(restoreButton());
  expect(await screen.findByText(/damaged, or was made by a newer version/i)).toBeTruthy();
  expect(await vaultExists()).toBe(false);
});

test('the master password is hidden until Show is pressed', async () => {
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  await screen.findByText(/Backup found/);
  expect(
    screen.getByLabelText('Master password of the backed-up vault').props.secureTextEntry,
  ).toBe(true);
});

test('errors never show tokens or reply text', async () => {
  testDrive.failNext = { status: 500 };
  await render(<RestoreScreen />);
  await fireEvent.press(signInButton());
  const message = await screen.findByText(/Google Drive had a problem/);
  expect(JSON.stringify(message.props.children)).not.toMatch(/token|Bearer|googleapis/i);
});

test('in a build without cloud backup it explains and offers nothing', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Constants = require('expo-constants').default;
  Constants.expoConfig.extra.cloudBackup.enabled = false;
  try {
    await render(<RestoreScreen />);
    expect(screen.getByText(/not available in this version/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  } finally {
    Constants.expoConfig.extra.cloudBackup.enabled = true;
  }
});
