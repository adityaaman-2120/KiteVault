import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { DEFAULT_APP_SETTINGS, SETTINGS_FILE } from '@/features/settings/appSettings';
import { deleteJsonFile } from '@/storage/jsonFile';
import { createVault, saveVault, useVaultStore } from '@/vault';
import {
  FAST_KDF,
  makeEntry,
  resetVaultFiles,
  snapshot,
  withEntries,
} from '@/vault/__support__/testUtils';

import { useBackupState } from '../backupState';
import { resetFakes, testDrive } from './fakeGoogle';

export const MASTER_PASSWORD = 'correct horse battery staple';
export const SECRET_PASSWORD = 'hunter2-unique-marker';

// A vault with one entry on the phone, no backup settings, an empty pretend Drive, and the
// pretend network installed as `fetch`.
export async function setUpBackupEnv(): Promise<void> {
  resetVaultFiles();
  deleteJsonFile(SETTINGS_FILE);
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  useBackupState.setState({ email: null, busy: 'idle', error: null, conflict: null });
  resetFakes();
  globalThis.fetch = testDrive.fetch as unknown as typeof fetch;

  const created = await createVault(MASTER_PASSWORD, { kdfParams: FAST_KDF });
  const data = snapshot(withEntries(created, makeEntry({ password: SECRET_PASSWORD })));
  useVaultStore.setState({ data: created });
  await saveVault(snapshot(data));
}

export const backupSettings = () => {
  const {
    backupEnabled,
    backupAuto,
    backupPending,
    backupLastAt,
    backupRemoteId,
    backupRemoteModified,
    backupRemoteRevision,
    backupLocalRevision,
  } = useSettingsStore.getState();
  return {
    backupEnabled,
    backupAuto,
    backupPending,
    backupLastAt,
    backupRemoteId,
    backupRemoteModified,
    backupRemoteRevision,
    backupLocalRevision,
  };
};

export function tearDownBackupEnv(): void {
  resetVaultFiles();
  deleteJsonFile(SETTINGS_FILE);
}
