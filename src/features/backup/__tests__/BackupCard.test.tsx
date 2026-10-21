import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { Alert, type AlertButton } from 'react-native';

import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { vaultFile } from '@/vault/__support__/testUtils';

import { backupNow } from '../backupService';
import { useBackupState } from '../backupState';
import { BACKUP_PRIVACY, BackupCard } from '../BackupCard';
import { BackupError } from '../errors';
import { testDrive, testGoogle } from '../__support__/fakeGoogle';
import { backupSettings, setUpBackupEnv, tearDownBackupEnv } from '../__support__/backupTestEnv';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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

let alertSpy: jest.SpyInstance;
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const confirm = (label: string) => {
  const buttons = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
  buttons.find((b) => b.text === label)!.onPress?.();
};

beforeEach(async () => {
  await setUpBackupEnv();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(tearDownBackupEnv);

// Backup already on and one upload done.
async function backedUp() {
  testGoogle.state.signedIn = true;
  await useSettingsStore.getState().update({ backupEnabled: true });
  await backupNow();
  useBackupState.setState({ email: 'someone@example.com' });
}

describe('when backup is off', () => {
  test('explains what it is and says Google cannot read the vault', async () => {
    await render(<BackupCard />);
    expect(screen.getByText('Encrypted cloud backup')).toBeTruthy();
    expect(screen.getByText(BACKUP_PRIVACY)).toBeTruthy();
    expect(BACKUP_PRIVACY).toMatch(/only ever sees the encrypted file/);
    expect(BACKUP_PRIVACY).toMatch(/cannot open it/);
    expect(button('Turn on cloud backup')).toBeTruthy();
    expect(testDrive.fetch).not.toHaveBeenCalled(); // nothing happens until the user asks
  });

  test('turning it on signs in and makes the first backup', async () => {
    await render(<BackupCard />);
    await fireEvent.press(button('Turn on cloud backup'));

    expect(await screen.findByText('Signed in as someone@example.com')).toBeTruthy();
    expect(testDrive.only().bytes).toEqual(await vaultFile().bytes());
    expect(screen.getByText(/Last backup:/)).toBeTruthy();
    expect(backupSettings().backupEnabled).toBe(true);
  });

  test('cancelling the Google sign-in leaves it off and shows no scary message', async () => {
    testGoogle.state.signInError = new BackupError('cancelled');
    await render(<BackupCard />);
    await fireEvent.press(button('Turn on cloud backup'));
    await waitFor(() => expect(testGoogle.signIn).toHaveBeenCalled());
    expect(backupSettings().backupEnabled).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('a sign-in that is not set up for this build says so', async () => {
    testGoogle.state.signInError = new BackupError('setup-error');
    await render(<BackupCard />);
    await fireEvent.press(button('Turn on cloud backup'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Cloud backup',
      expect.stringMatching(/not set up correctly for this build/),
    );
  });

  test('a Google account that already holds another backup is not overwritten', async () => {
    testDrive.putFile(new Uint8Array([7, 7, 7]));
    await render(<BackupCard />);
    await fireEvent.press(button('Turn on cloud backup'));

    expect(await screen.findByText(/Nothing was overwritten/)).toBeTruthy();
    expect(testDrive.only().bytes).toEqual(new Uint8Array([7, 7, 7]));

    await fireEvent.press(button('Resolve'));
    expect(mockPush).toHaveBeenCalledWith('/backup-conflict');
  });
});

describe('when backup is on', () => {
  test('opens the backup history', async () => {
    await backedUp();
    await render(<BackupCard />);
    await fireEvent.press(button('Backup history'));
    expect(mockPush).toHaveBeenCalledWith('/backup-history');
  });

  test('shows the account and when the last backup was made', async () => {
    await backedUp();
    await render(<BackupCard />);
    expect(screen.getByText('Signed in as someone@example.com')).toBeTruthy();
    expect(screen.getByText(/Last backup: .*2026/)).toBeTruthy();
    expect(screen.getByText(BACKUP_PRIVACY)).toBeTruthy();
  });

  test('says when nothing has been backed up yet, and when newer changes are waiting', async () => {
    testGoogle.state.signedIn = true;
    await useSettingsStore.getState().update({ backupEnabled: true });
    await render(<BackupCard />);
    expect(screen.getByText(/No backup made yet/)).toBeTruthy();

    await useSettingsStore
      .getState()
      .update({ backupLastAt: Date.UTC(2026, 9, 22), backupPending: true });
    expect(await screen.findByText(/newer changes not uploaded yet/)).toBeTruthy();
  });

  test('"Back up now" uploads the current file', async () => {
    await backedUp();
    await useSettingsStore.getState().update({ backupPending: true });
    await render(<BackupCard />);
    const before = testDrive.only().modifiedTime;
    await fireEvent.press(button('Back up now'));
    await waitFor(() => expect(testDrive.only().modifiedTime).not.toBe(before));
  });

  test('automatic backup can be switched on and off', async () => {
    await backedUp();
    await render(<BackupCard />);
    const toggle = () => screen.getByLabelText('Back up automatically after changes');
    expect(toggle().props.value).toBe(false);
    await fireEvent(toggle(), 'valueChange', true);
    expect(backupSettings().backupAuto).toBe(true);
    await fireEvent(toggle(), 'valueChange', false);
    expect(backupSettings().backupAuto).toBe(false);
  });

  test('no internet shows a clear message and keeps backup on', async () => {
    await backedUp();
    testDrive.offline = true;
    await render(<BackupCard />);
    await fireEvent.press(button('Back up now'));
    expect(await screen.findByText(/No internet connection/)).toBeTruthy();
    expect(backupSettings().backupEnabled).toBe(true);
  });

  test('Google Drive full', async () => {
    await backedUp();
    testDrive.failNext = { status: 403, reason: 'storageQuotaExceeded' };
    await render(<BackupCard />);
    await fireEvent.press(button('Back up now'));
    expect(await screen.findByText(/Google Drive is full/)).toBeTruthy();
  });

  test('revoked access offers to sign in again, and signing in again works', async () => {
    await backedUp();
    testDrive.expireToken('token-2');
    testGoogle.state.refreshError = new BackupError('access-revoked');
    await render(<BackupCard />);
    await fireEvent.press(button('Back up now'));
    expect(await screen.findByText(/no longer has access to your Google Drive/)).toBeTruthy();

    testGoogle.state.refreshError = null;
    await fireEvent.press(button('Sign in to Google again'));
    await waitFor(() => expect(useBackupState.getState().error).toBeNull());
  });

  test('"Sign out" forgets the settings but says the backup stays in Google Drive', async () => {
    await backedUp();
    await render(<BackupCard />);
    expect(screen.getByText(/Signing out keeps the backup in your Google Drive/)).toBeTruthy();
    await fireEvent.press(button('Sign out'));
    expect(await screen.findByRole('button', { name: 'Turn on cloud backup' })).toBeTruthy();
    expect(testDrive.files.size).toBe(1);
    expect(backupSettings().backupEnabled).toBe(false);
  });

  test('"Delete cloud backup" asks first, then deletes it from Google Drive', async () => {
    await backedUp();
    await render(<BackupCard />);
    await fireEvent.press(button('Delete cloud backup'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete the cloud backup?',
      expect.stringMatching(/for good/),
      expect.any(Array),
    );
    expect(testDrive.files.size).toBe(1);

    confirm('Delete backup');
    await waitFor(() => expect(testDrive.files.size).toBe(0));
    expect(await screen.findByText(/No backup made yet/)).toBeTruthy();
    expect(await vaultFile().bytes()).toBeDefined(); // the phone's vault is untouched
  });

  test('cancelling the delete keeps the backup', async () => {
    await backedUp();
    await render(<BackupCard />);
    await fireEvent.press(button('Delete cloud backup'));
    const buttons = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
    buttons.find((b) => b.style === 'cancel')!.onPress?.();
    expect(testDrive.files.size).toBe(1);
  });

  test('a delete that cannot be done says why', async () => {
    await backedUp();
    await render(<BackupCard />);
    await fireEvent.press(button('Delete cloud backup'));
    testDrive.offline = true;
    confirm('Delete backup');
    await waitFor(() =>
      expect(alertSpy).toHaveBeenLastCalledWith(
        'Cloud backup',
        expect.stringMatching(/No internet/),
      ),
    );
    expect(testDrive.files.size).toBe(1);
  });
});

describe('in a build without cloud backup', () => {
  test('the card says it is not available and offers nothing', async () => {
    const config = (
      Constants.expoConfig as unknown as { extra: { cloudBackup: { enabled: boolean } } }
    ).extra.cloudBackup;
    config.enabled = false;
    try {
      await render(<BackupCard />);
      expect(screen.getByText('Not available in this version of the app.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Turn on cloud backup' })).toBeNull();
    } finally {
      config.enabled = true;
    }
  });
});
