import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { backupNow, enableBackup } from '@/features/backup/backupService';
import { testDrive, testGoogle } from '@/features/backup/__support__/fakeGoogle';
import {
  backupSettings,
  setUpBackupEnv,
  tearDownBackupEnv,
} from '@/features/backup/__support__/backupTestEnv';
import { DEFAULT_APP_SETTINGS } from '@/features/settings/appSettings';

import { eraseEverything } from '../eraseVault';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { cloudBackup: { enabled: true, webClientId: '' } } } },
}));
jest.mock('@/features/backup/googleAuth', () => ({
  ...jest.requireActual('@/features/backup/googleAuth'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  googleAuth: require('@/features/backup/__support__/fakeGoogle').testGoogle,
}));

beforeEach(setUpBackupEnv);
afterAll(tearDownBackupEnv);

test('erasing the vault signs out of Google and forgets the backup settings, but not the cloud copy', async () => {
  await enableBackup();
  await backupNow();
  await useSettingsStore.getState().update({ backupAuto: true });
  expect(testDrive.files.size).toBe(1);

  await eraseEverything();

  expect(testGoogle.signOut).toHaveBeenCalled();
  expect(backupSettings()).toEqual({
    backupEnabled: false,
    backupAuto: false,
    backupPending: false,
    backupLastAt: 0,
    backupRemoteId: '',
    backupRemoteModified: '',
  });
  expect(useSettingsStore.getState()).toMatchObject(DEFAULT_APP_SETTINGS);
  expect(testDrive.files.size).toBe(1); // the backup stays in Google Drive, as the Data note says
});

test('erasing works even if Google sign-out fails', async () => {
  await enableBackup();
  testGoogle.signOut.mockRejectedValueOnce(new Error('boom'));
  await expect(eraseEverything()).resolves.toBeUndefined();
});
