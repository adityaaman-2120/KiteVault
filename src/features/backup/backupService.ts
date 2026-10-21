import type { AppSettings } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { loadVaultFile } from '@/storage';
import { isWellFormedVaultFile } from '@/vault';

import { useBackupState, type BackupUiState } from './backupState';
import { isCloudBackupAvailable } from './config';
import { createDriveClient, type RemoteBackup } from './driveApi';
import { BackupError, backupErrorKind } from './errors';
import { googleAuth } from './googleAuth';

// The optional Google Drive backup. What is uploaded is the vault FILE exactly as it is on this
// phone, which is already encrypted. The vault is never decrypted for a backup, no key is needed,
// and the master password is never involved. A backup also works while the vault is locked.

const settings = () => useSettingsStore.getState();
const patch = (changes: Partial<AppSettings>) => settings().update(changes);
const ui = (changes: Partial<BackupUiState>) => useBackupState.setState(changes);

// One backup operation at a time, so two never upload over each other.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function requireAvailable(): void {
  if (!isCloudBackupAvailable()) throw new BackupError('unavailable');
}

const timeOf = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Date.now();
};

// --- signing in and out ------------------------------------------------------------------------

// Asks Google for the account and for the Drive permission. Does not upload anything yet.
export async function enableBackup(): Promise<void> {
  requireAvailable();
  ui({ busy: 'signing-in', error: null });
  try {
    const { email } = await googleAuth.signIn();
    await patch({ backupEnabled: true });
    ui({ email });
  } catch (error) {
    ui({ error: backupErrorKind(error) });
    throw error;
  } finally {
    ui({ busy: 'idle' });
  }
}

// Brings back an earlier sign-in without showing anything, to display the account.
export async function refreshSignIn(): Promise<void> {
  if (!isCloudBackupAvailable() || !settings().backupEnabled) return;
  try {
    const account = await googleAuth.signInSilently();
    ui({ email: account?.email ?? null });
  } catch {
    // Offline or similar: keep what we show; the next backup reports a real problem.
  }
}

// Signs out of Google and forgets the backup settings on this phone. The backup that is already
// in Google Drive is NOT deleted (use deleteCloudBackup first for that).
export async function signOutOfBackup(): Promise<void> {
  try {
    await googleAuth.signOut();
  } catch {
    // Signing out locally cannot meaningfully fail; carry on and forget the settings anyway.
  }
  await patch({
    backupEnabled: false,
    backupAuto: false,
    backupPending: false,
    backupLastAt: 0,
    backupRemoteId: '',
    backupRemoteModified: '',
  });
  ui({ email: null, error: null, conflict: false });
}

// --- uploading ---------------------------------------------------------------------------------

// Uploads the vault file now. Throws BackupError('conflict') if the cloud holds a backup this
// phone did not make (or that changed since), unless `force` is set; nothing is overwritten then.
export function backupNow(options: { force?: boolean } = {}): Promise<RemoteBackup> {
  return exclusive(async () => {
    requireAvailable();
    if (!settings().backupEnabled) throw new BackupError('not-signed-in');
    ui({ busy: 'backing-up', error: null });
    // Anything saved from here on marks the file as changed again.
    await patch({ backupPending: false });
    try {
      const bytes = await loadVaultFile(isWellFormedVaultFile);
      if (!bytes) throw new BackupError('no-vault');
      if (!isWellFormedVaultFile(bytes)) throw new BackupError('invalid-backup'); // never upload junk

      const drive = createDriveClient(googleAuth);
      const remote = await drive.find();
      if (remote && !options.force) {
        const { backupRemoteId, backupRemoteModified } = settings();
        if (backupRemoteId !== remote.id || backupRemoteModified !== remote.modifiedTime) {
          throw new BackupError('conflict');
        }
      }
      const uploaded = await drive.upload(bytes, remote?.id);
      await patch({
        backupLastAt: timeOf(uploaded.modifiedTime),
        backupRemoteId: uploaded.id,
        backupRemoteModified: uploaded.modifiedTime,
      });
      ui({ error: null, conflict: false });
      return uploaded;
    } catch (error) {
      await patch({ backupPending: true });
      const kind = backupErrorKind(error);
      ui({ error: kind, conflict: kind === 'conflict' });
      throw error;
    } finally {
      ui({ busy: 'idle' });
    }
  });
}

export async function setAutoBackup(on: boolean): Promise<void> {
  await patch({ backupAuto: on });
}

// --- deleting ----------------------------------------------------------------------------------

// Deletes the backup file(s) from Google Drive. Automatic backup is switched off, otherwise the
// next save would quietly make a new one. The sign-in stays.
export function deleteCloudBackup(): Promise<number> {
  return exclusive(async () => {
    requireAvailable();
    ui({ busy: 'deleting', error: null });
    try {
      const deleted = await createDriveClient(googleAuth).deleteAll();
      await patch({
        backupAuto: false,
        backupPending: false,
        backupLastAt: 0,
        backupRemoteId: '',
        backupRemoteModified: '',
      });
      ui({ conflict: false });
      return deleted;
    } catch (error) {
      ui({ error: backupErrorKind(error) });
      throw error;
    } finally {
      ui({ busy: 'idle' });
    }
  });
}

// --- restoring (new phone or after a reinstall) ------------------------------------------------

// Signs in and looks for a backup. Signing in only identifies the Google account; it cannot open
// the vault.
export async function findCloudBackup(): Promise<{ email: string; backup: RemoteBackup | null }> {
  requireAvailable();
  const { email } = await googleAuth.signIn();
  const backup = await createDriveClient(googleAuth).find();
  return { email, backup };
}

export async function downloadCloudBackup(backup: RemoteBackup): Promise<Uint8Array> {
  requireAvailable();
  const bytes = await createDriveClient(googleAuth).download(backup.id);
  if (!isWellFormedVaultFile(bytes)) throw new BackupError('invalid-backup');
  return bytes;
}

// After a successful restore: this phone now tracks that cloud file, so its next backup is not
// mistaken for a conflict. Automatic backup stays off until the user turns it on.
export async function rememberRestoredBackup(backup: RemoteBackup, email: string): Promise<void> {
  await patch({
    backupEnabled: true,
    backupAuto: false,
    backupPending: false,
    backupLastAt: timeOf(backup.modifiedTime),
    backupRemoteId: backup.id,
    backupRemoteModified: backup.modifiedTime,
  });
  ui({ email, error: null, conflict: false });
}
