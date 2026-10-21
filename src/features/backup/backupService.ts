import { bytesEqual, wipe } from '@/crypto';
import { runWithAttemptLimit } from '@/features/lock/unlockService';
import type { AppSettings } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { disableBiometricUnlock } from '@/native/keystore';
import { loadVaultFile } from '@/storage';
import {
  getVaultKeyCopy,
  isVaultUnlocked,
  isWellFormedVaultFile,
  mergeVaults,
  readBackupData,
  useVaultStore,
  type MergeSummary,
} from '@/vault';

import { useBackupState, type BackupUiState, type ConflictRelation } from './backupState';
import { isCloudBackupAvailable } from './config';
import { deviceLabel, newDeviceId } from './deviceInfo';
import { createDriveClient, type RemoteBackup, type VersionMeta } from './driveApi';
import { BackupError, backupErrorKind } from './errors';
import { googleAuth } from './googleAuth';

// The optional Google Drive backup. What is uploaded is the vault FILE exactly as it is on this
// phone, which is already encrypted. The vault is never decrypted for a backup, no key is needed,
// and the master password is never involved. A backup also works while the vault is locked.
//
// Up to MAX_VERSIONS versions are kept in the hidden app folder, each labelled with a revision
// number, the phone that made it, and a time, so an older one can be restored and so that a
// newer one made by another phone is noticed before it is overwritten.

export const MAX_VERSIONS = 5;
// Automatic backups made by the same phone within this time replace the newest version instead of
// adding a new one. Without it, five bursts of editing would push every older version out of the
// five slots within minutes, and the history would be useless. Manual backups always add one.
export const VERSION_WINDOW_MS = 30 * 60_000;

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

// --- comparing this phone with the cloud ------------------------------------------------------

export type SeenVersion = { id: string; modifiedTime: string; revision: number };

export type Relation = 'empty' | 'in-sync' | 'remote-behind' | ConflictRelation;

// How the newest cloud version relates to what this phone last uploaded or downloaded ("seen").
// Pure, so the rules can be tested exactly:
//   empty         the cloud has no backup
//   in-sync       the cloud still holds exactly what this phone last saw: safe to upload
//   remote-behind the cloud holds something OLDER than what this phone saw (a newer version was
//                 deleted): uploading only puts it back, nothing is lost
//   unrelated     this phone has never seen the cloud backup
//   remote-ahead  the cloud changed since this phone looked, this phone has no changes of its own
//   diverged      the cloud changed and so did this phone
export function compareWithCloud(
  newest: RemoteBackup | null,
  seen: SeenVersion,
  localRevision: number,
): Relation {
  if (!newest) return 'empty';
  if (!seen.id) return 'unrelated';
  if (
    newest.id === seen.id &&
    newest.modifiedTime === seen.modifiedTime &&
    newest.revision === seen.revision
  ) {
    return 'in-sync';
  }
  if (Date.parse(newest.modifiedTime) < Date.parse(seen.modifiedTime)) return 'remote-behind';
  return localRevision > seen.revision ? 'diverged' : 'remote-ahead';
}

const seenVersion = (): SeenVersion => ({
  id: settings().backupRemoteId,
  modifiedTime: settings().backupRemoteModified,
  revision: settings().backupRemoteRevision,
});

// --- this phone's labels -----------------------------------------------------------------------

async function versionMeta(): Promise<VersionMeta> {
  let { backupDeviceId } = settings();
  if (!backupDeviceId) {
    backupDeviceId = newDeviceId();
    await patch({ backupDeviceId });
  }
  return {
    revision: Math.max(1, settings().backupLocalRevision),
    deviceId: backupDeviceId,
    deviceName: deviceLabel(backupDeviceId),
  };
}

// --- signing in and out ------------------------------------------------------------------------

// Asks Google for the account and for the Drive permission. Does not upload anything yet.
export async function enableBackup(): Promise<void> {
  requireAvailable();
  ui({ busy: 'signing-in', error: null });
  try {
    const { email } = await googleAuth.signIn();
    await patch({
      backupEnabled: true,
      backupLocalRevision: Math.max(1, settings().backupLocalRevision),
    });
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

// Signs out of Google and forgets the backup settings on this phone. The backups that are already
// in Google Drive are NOT deleted (use deleteCloudBackup first for that).
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
    backupRemoteRevision: 0,
  });
  ui({ email: null, error: null, conflict: null });
}

// --- uploading ---------------------------------------------------------------------------------

export type BackupOptions = {
  // 'keep-mine': the user chose this phone's version over a newer cloud one. It is saved as a NEW
  // version, so the cloud version stays in the history.
  resolve?: 'keep-mine';
  // Manual backups (and anything the user asked for) always add a version.
  manual?: boolean;
};

// Uploads the vault file now. Throws BackupError('conflict') when the cloud holds a newer version
// than this phone last saw, unless the user already chose ("keep-mine"). Nothing is overwritten
// then; useBackupState.conflict says what is going on.
export function backupNow(options: BackupOptions = {}): Promise<RemoteBackup> {
  return exclusive(async () => {
    requireAvailable();
    if (!settings().backupEnabled) throw new BackupError('not-signed-in');
    ui({ busy: 'backing-up', error: null });
    // Anything saved from here on marks the file as changed again.
    await patch({ backupPending: false });
    try {
      const meta = await versionMeta();
      const bytes = await loadVaultFile(isWellFormedVaultFile);
      if (!bytes) throw new BackupError('no-vault');
      if (!isWellFormedVaultFile(bytes)) throw new BackupError('invalid-backup'); // never upload junk

      const drive = createDriveClient(googleAuth);
      const newest = (await drive.list())[0] ?? null;
      const relation = compareWithCloud(newest, seenVersion(), meta.revision);
      if (newest && options.resolve !== 'keep-mine') {
        if (relation === 'unrelated' || relation === 'remote-ahead' || relation === 'diverged') {
          ui({
            conflict: {
              relation,
              remote: newest,
              localRevision: meta.revision,
              seenRevision: settings().backupRemoteRevision,
            },
          });
          throw new BackupError('conflict');
        }
      }

      // An automatic backup right after another one from this phone replaces that version.
      const replaceNewest =
        !options.manual &&
        options.resolve === undefined &&
        relation === 'in-sync' &&
        newest !== null &&
        newest.deviceId === meta.deviceId &&
        Date.now() - timeOf(newest.createdTime) < VERSION_WINDOW_MS;

      const uploaded = await drive.upload(bytes, meta, replaceNewest ? newest!.id : undefined);
      await patch({
        backupLastAt: timeOf(uploaded.modifiedTime),
        backupRemoteId: uploaded.id,
        backupRemoteModified: uploaded.modifiedTime,
        backupRemoteRevision: meta.revision,
      });
      ui({ error: null, conflict: null });
      // Keep only the newest versions. Failing to tidy up must not fail the backup.
      await drive.prune(MAX_VERSIONS).catch(() => undefined);
      return uploaded;
    } catch (error) {
      await patch({ backupPending: true });
      const kind = backupErrorKind(error);
      ui({ error: kind });
      throw error;
    } finally {
      ui({ busy: 'idle' });
    }
  });
}

export async function setAutoBackup(on: boolean): Promise<void> {
  await patch({ backupAuto: on });
}

// --- the three ways out of a conflict ----------------------------------------------------------

// Takes the cloud version as the one this phone has now "seen", and makes this phone's revision
// number higher than both (merged data is newer than either), so that whatever is uploaded next is recognised as the newest.
async function markCloudSeen(version: RemoteBackup, localRevision: number): Promise<void> {
  await patch({
    backupRemoteId: version.id,
    backupRemoteModified: version.modifiedTime,
    backupRemoteRevision: version.revision,
    backupLocalRevision: Math.max(localRevision, version.revision + 1),
  });
}

// Swaps the vault on this phone for downloaded bytes. If the vault key of the new vault is not the
// one that was in use, the key stored for biometric unlock no longer fits and is removed.
async function replaceLocalVault(bytes: Uint8Array, masterPassword: string): Promise<void> {
  const before = isVaultUnlocked() ? getVaultKeyCopy() : null;
  await useVaultStore.getState().replaceWithBackup(bytes, masterPassword);
  const after = getVaultKeyCopy();
  if (before && !bytesEqual(before, after)) disableBiometricUnlock();
  wipe(before, after);
}

async function downloadNewest(): Promise<{ version: RemoteBackup; bytes: Uint8Array }> {
  const drive = createDriveClient(googleAuth);
  const version = (await drive.list())[0];
  if (!version) throw new BackupError('not-found');
  const bytes = await drive.download(version.id);
  if (!isWellFormedVaultFile(bytes)) throw new BackupError('invalid-backup');
  return { version, bytes };
}

// "Keep this device's version": uploads this phone's vault as the newest version. The cloud
// version is not deleted; it stays in the history.
export function resolveKeepMine(): Promise<RemoteBackup> {
  return backupNow({ resolve: 'keep-mine', manual: true });
}

// "Use cloud version": replaces the vault on this phone with the newest cloud version. Changes
// made only on this phone since its last backup are lost. The master password is the one of the
// CLOUD version (it may have been changed on the other phone), and is checked by decrypting.
export function resolveUseCloud(masterPassword: string): Promise<void> {
  return exclusive(async () => {
    requireAvailable();
    const { version, bytes } = await downloadNewest();
    await runWithAttemptLimit(() => replaceLocalVault(bytes, masterPassword));
    // This phone now has exactly the cloud version, so it takes that version's revision number.
    await patch({
      backupRemoteId: version.id,
      backupRemoteModified: version.modifiedTime,
      backupRemoteRevision: version.revision,
      backupLocalRevision: version.revision,
      backupLastAt: timeOf(version.modifiedTime),
      backupPending: false,
    });
    ui({ conflict: null, error: null });
  });
}

// "Merge": combines this phone's vault with the newest cloud version (see vault/merge.ts), saves
// the result on this phone (encrypted with this phone's key and master password), and uploads it
// as a new version. The cloud version it was merged with stays in the history.
export async function resolveMerge(masterPassword: string): Promise<MergeSummary> {
  const merged = await exclusive(async () => {
    requireAvailable();
    const local = useVaultStore.getState().data;
    if (!local) throw new BackupError('no-vault');
    const { version, bytes } = await downloadNewest();

    let remoteData!: Awaited<ReturnType<typeof readBackupData>>;
    await runWithAttemptLimit(async () => {
      remoteData = await readBackupData(bytes, masterPassword);
    });

    // The last time this phone and the cloud agreed: edits after it, on both sides, are conflicts.
    const baseTime = settings().backupLastAt > 0 ? settings().backupLastAt : undefined;
    const result = mergeVaults(local, remoteData, { baseTime });
    await useVaultStore.getState().save(result.data);
    // The merged vault contains the cloud version, so this phone has now seen it.
    await markCloudSeen(version, settings().backupLocalRevision + 1);
    return result.summary;
  });
  await backupNow({ resolve: 'keep-mine', manual: true });
  return merged;
}

// --- history -----------------------------------------------------------------------------------

export async function listVersions(): Promise<RemoteBackup[]> {
  requireAvailable();
  return createDriveClient(googleAuth).list();
}

// Restores an older version. The current vault is first saved as a new version (when it has
// changes the cloud does not have yet), so the restore itself can be undone from the history.
// The master password is the one that version had, and is checked by decrypting before anything
// changes.
export function restoreVersion(version: RemoteBackup, masterPassword: string): Promise<void> {
  return exclusive(async () => {
    requireAvailable();
    const drive = createDriveClient(googleAuth);
    const bytes = await drive.download(version.id);
    if (!isWellFormedVaultFile(bytes)) throw new BackupError('invalid-backup');

    await runWithAttemptLimit(async () => {
      await readBackupData(bytes, masterPassword);
    });
  }).then(async () => {
    // Outside the lock above because backupNow takes it too.
    const needsSafetyCopy =
      settings().backupPending || settings().backupLocalRevision > settings().backupRemoteRevision;
    if (needsSafetyCopy) await backupNow({ resolve: 'keep-mine', manual: true });
    await exclusive(async () => {
      const drive = createDriveClient(googleAuth);
      const bytes = await drive.download(version.id);
      await replaceLocalVault(bytes, masterPassword);
      const newest = (await drive.list())[0] ?? version;
      // The restored vault is a NEW state of the vault, newer than anything in the cloud: its
      // revision is higher than every revision seen, and it gets uploaded as the newest version.
      await patch({
        backupRemoteId: newest.id,
        backupRemoteModified: newest.modifiedTime,
        backupRemoteRevision: newest.revision,
        backupLocalRevision: Math.max(settings().backupLocalRevision, newest.revision) + 1,
        backupPending: true,
      });
      ui({ conflict: null, error: null });
    });
  });
}

// --- deleting ----------------------------------------------------------------------------------

// Deletes every backup version from Google Drive. Automatic backup is switched off, otherwise the
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
        backupRemoteRevision: 0,
      });
      ui({ conflict: null });
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
// the vault. Finds the newest version.
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

// After a successful restore: this phone now tracks that cloud version, so its next backup is not
// mistaken for a conflict. Automatic backup stays off until the user switches it on.
export async function rememberRestoredBackup(backup: RemoteBackup, email: string): Promise<void> {
  await patch({
    backupEnabled: true,
    backupAuto: false,
    backupPending: false,
    backupLastAt: timeOf(backup.modifiedTime),
    backupRemoteId: backup.id,
    backupRemoteModified: backup.modifiedTime,
    backupRemoteRevision: backup.revision,
    backupLocalRevision: Math.max(1, backup.revision),
  });
  ui({ email, error: null, conflict: null });
}
