import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useVaultStore } from '@/vault';
import { makeEntry, snapshot } from '@/vault/__support__/testUtils';

import { backupNow, enableBackup } from '../backupService';
import { useBackupState } from '../backupState';
import { BackupConflictScreen } from '../BackupConflictScreen';
import { BackupHistoryScreen } from '../BackupHistoryScreen';
import { testDrive } from '../__support__/fakeGoogle';
import { MASTER_PASSWORD, setUpBackupEnv, tearDownBackupEnv } from '../__support__/backupTestEnv';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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

const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(async () => {
  await setUpBackupEnv();
  await enableBackup();
  await backupNow({ manual: true });
});
afterAll(tearDownBackupEnv);

describe('conflict screen', () => {
  test('says there is no conflict when there is none', async () => {
    await render(<BackupConflictScreen />);
    expect(screen.getByText('There is no conflict.')).toBeTruthy();
  });

  async function makeConflict() {
    testDrive.putFile(Uint8Array.from(testDrive.only().bytes), {
      revision: '9',
      deviceId: 'ee11',
      deviceName: 'Other phone (ee11)',
    });
    await backupNow().catch(() => undefined);
    expect(useBackupState.getState().conflict).not.toBeNull();
  }

  test('offers the three choices and names the other phone', async () => {
    await makeConflict();
    await render(<BackupConflictScreen />);
    expect(button("Keep this device's version")).toBeTruthy();
    expect(button('Use cloud version')).toBeTruthy();
    expect(button('Merge')).toBeTruthy();
    expect(screen.getAllByText(/Other phone \(ee11\)/).length).toBeGreaterThan(0);
  });

  test('"keep this device" resolves it', async () => {
    await makeConflict();
    await render(<BackupConflictScreen />);
    await fireEvent.press(button("Keep this device's version"));
    expect(await screen.findByText('Conflict resolved')).toBeTruthy();
    expect(useBackupState.getState().conflict).toBeNull();
  });

  test('"merge" asks for the cloud version\'s master password, and a wrong one is reported', async () => {
    await makeConflict();
    await render(<BackupConflictScreen />);
    await fireEvent.press(button('Merge'));
    await fireEvent.changeText(screen.getByLabelText(/^Master password/), 'wrong');
    await fireEvent.press(button('Merge'));
    expect(await screen.findByText(/does not open this backup/)).toBeTruthy();
    expect(useBackupState.getState().conflict).not.toBeNull();
  });

  test('merge with the right password lists what happened', async () => {
    await makeConflict();
    await useVaultStore
      .getState()
      .save(snapshot({ ...useVaultStore.getState().data!, entries: [makeEntry({ id: 'zz' })] }));
    await render(<BackupConflictScreen />);
    await fireEvent.press(button('Merge'));
    await fireEvent.changeText(screen.getByLabelText(/^Master password/), MASTER_PASSWORD);
    await fireEvent.press(button('Merge'));
    expect(await screen.findByText('Conflict resolved')).toBeTruthy();
    expect(screen.getByText(/Nothing was deleted/)).toBeTruthy();
  });
});

describe('history screen', () => {
  test('lists the versions with phone and revision', async () => {
    await render(<BackupHistoryScreen />);
    expect(await screen.findByText(/\(newest\)/)).toBeTruthy();
    expect(screen.getByText(/revision 1/)).toBeTruthy();
  });

  test('restoring needs the password; a wrong one is reported', async () => {
    await render(<BackupHistoryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Restore…' }));
    await fireEvent.changeText(screen.getByLabelText(/^Master password/), 'wrong');
    await fireEvent.press(button('Restore this version'));
    expect(await screen.findByText(/does not open this backup/)).toBeTruthy();
  });

  test('restores with the right password', async () => {
    useSettingsStore.setState({ backupPending: false });
    await render(<BackupHistoryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Restore…' }));
    await fireEvent.changeText(screen.getByLabelText(/^Master password/), MASTER_PASSWORD);
    await fireEvent.press(button('Restore this version'));
    await waitFor(() => expect(screen.getByText(/Restored\./)).toBeTruthy());
  });

  test('says so when there are no backups', async () => {
    testDrive.files.clear();
    await render(<BackupHistoryScreen />);
    expect(await screen.findByText('No backups yet.')).toBeTruthy();
  });
});
