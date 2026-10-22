import Constants from 'expo-constants';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { loadVaultFile } from '@/storage';
import { isWellFormedVaultFile, lockVault, useVaultStore } from '@/vault';
import { vaultFile } from '@/vault/__support__/testUtils';

import {
  backupNow,
  deleteCloudBackup,
  downloadCloudBackup,
  enableBackup,
  findCloudBackup,
  refreshSignIn,
  resolveKeepMine,
  setAutoBackup,
  signOutOfBackup,
} from '../backupService';
import { useBackupState } from '../backupState';
import type { RemoteBackup } from '../driveApi';
import { BackupError } from '../errors';
import { testDrive, testGoogle } from '../__support__/fakeGoogle';
import {
  backupSettings,
  MASTER_PASSWORD,
  SECRET_PASSWORD,
  setUpBackupEnv,
  tearDownBackupEnv,
} from '../__support__/backupTestEnv';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { cloudBackup: { enabled: true, webClientId: '' } } } },
}));
jest.mock('../googleAuth', () => ({
  ...jest.requireActual('../googleAuth'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  googleAuth: require('../__support__/fakeGoogle').testGoogle,
}));

beforeEach(setUpBackupEnv);
afterEach(() => jest.restoreAllMocks());
afterAll(tearDownBackupEnv);

const remoteOf = (id: string): RemoteBackup => ({
  id,
  modifiedTime: '',
  createdTime: '',
  size: 0,
  revision: 0,
  deviceId: '',
  deviceName: '',
});

const signedIn = async () => {
  await enableBackup();
};

describe('turning backup on', () => {
  test('signs in, remembers it, and shows the account', async () => {
    await enableBackup();
    expect(testGoogle.signIn).toHaveBeenCalledTimes(1);
    expect(backupSettings().backupEnabled).toBe(true);
    expect(useBackupState.getState().email).toBe('someone@example.com');
    expect(testDrive.fetch).not.toHaveBeenCalled(); // signing in alone uploads nothing
  });

  test('a cancelled sign-in changes nothing', async () => {
    testGoogle.state.signInError = new BackupError('cancelled');
    await expect(enableBackup()).rejects.toMatchObject({ kind: 'cancelled' });
    expect(backupSettings().backupEnabled).toBe(false);
    expect(useBackupState.getState().busy).toBe('idle');
  });

  test('a sign-in that is not set up for this build is reported as such', async () => {
    testGoogle.state.signInError = new BackupError('setup-error');
    await expect(enableBackup()).rejects.toMatchObject({ kind: 'setup-error' });
    expect(useBackupState.getState().error).toBe('setup-error');
  });
});

describe('backing up', () => {
  test('uploads the encrypted vault file exactly as it is on the phone', async () => {
    await signedIn();
    const local = await vaultFile().bytes();

    const result = await backupNow();

    expect(testDrive.only().bytes).toEqual(local);
    expect(result.id).toBe(testDrive.only().id);
    expect(isWellFormedVaultFile(testDrive.only().bytes)).toBe(true);
  });

  test('works while the vault is locked, so the vault is never decrypted for a backup', async () => {
    await signedIn();
    lockVault();
    useVaultStore.setState({ data: null });
    await expect(backupNow()).resolves.toBeDefined();
    expect(testDrive.only().bytes).toEqual(await vaultFile().bytes());
  });

  test('nothing readable leaves the phone', async () => {
    await signedIn();
    await backupNow();
    const sent = testDrive.requests
      .filter((r) => r.body)
      .map((r) => Buffer.from(r.body!).toString('latin1'));
    const everything = sent.join('') + Buffer.from(testDrive.only().bytes).toString('latin1');
    for (const secret of [SECRET_PASSWORD, MASTER_PASSWORD, 'alice@example.com', 'Example Site']) {
      expect(everything).not.toContain(secret);
    }
    for (const request of testDrive.requests) {
      expect(request.url).not.toContain(SECRET_PASSWORD);
    }
  });

  test('records the time from Google and which file it uploaded to', async () => {
    await signedIn();
    const result = await backupNow();
    expect(backupSettings()).toMatchObject({
      backupLastAt: Date.parse(result.modifiedTime),
      backupRemoteId: result.id,
      backupRemoteModified: result.modifiedTime,
      backupRemoteRevision: 1,
      backupPending: false,
    });
  });

  test('an automatic backup soon after another from this phone replaces that version', async () => {
    await signedIn();
    await backupNow();
    testDrive.only().createdTime = new Date().toISOString();
    const first = testDrive.only().id;
    await useVaultStore
      .getState()
      .save({ ...useVaultStore.getState().data!, folders: [{ id: 'f', name: 'New' }] });
    await backupNow();
    expect(testDrive.files.size).toBe(1);
    expect(testDrive.only().id).toBe(first);
    expect(testDrive.only().bytes).toEqual(await vaultFile().bytes());
  });

  test('needs a sign-in', async () => {
    await expect(backupNow()).rejects.toMatchObject({ kind: 'not-signed-in' });
    expect(testDrive.fetch).not.toHaveBeenCalled();
  });

  test('a damaged local file is never uploaded', async () => {
    await signedIn();
    const file = vaultFile();
    file.delete();
    file.create();
    await file.write(new Uint8Array([1, 2, 3]));
    await expect(backupNow()).rejects.toMatchObject({ kind: 'invalid-backup' });
    expect(testDrive.files.size).toBe(0);
  });

  test('no vault means nothing to back up', async () => {
    await signedIn();
    vaultFile().delete();
    expect(await loadVaultFile()).toBeNull();
    await expect(backupNow()).rejects.toMatchObject({ kind: 'no-vault' });
  });

  test('two backups started at once are run one after the other', async () => {
    await signedIn();
    let active = 0;
    let overlapped = false;
    testDrive.onRequest = () => {
      active++;
      if (active > 1) overlapped = true;
      queueMicrotask(() => active--);
    };
    await Promise.all([backupNow(), backupNow()]);
    expect(overlapped).toBe(false);
    expect(testDrive.files.size).toBe(1);
  });
});

describe('pending changes', () => {
  test('are cleared by a successful backup', async () => {
    await signedIn();
    await useVaultStore.getState().save(useVaultStore.getState().data!);
    await backupNow();
    expect(backupSettings().backupPending).toBe(false);
  });

  test('stay marked when the backup fails, so they are tried again later', async () => {
    await signedIn();
    testDrive.offline = true;
    await expect(backupNow()).rejects.toMatchObject({ kind: 'offline' });
    expect(backupSettings().backupPending).toBe(true);
    expect(useBackupState.getState().error).toBe('offline');

    testDrive.offline = false;
    await backupNow();
    expect(backupSettings().backupPending).toBe(false);
    expect(useBackupState.getState().error).toBeNull();
  });

  test('a change made while the upload is running is not lost', async () => {
    await signedIn();
    testDrive.onRequest = (request) => {
      // What a save does while backup is on: mark pending and raise the revision.
      if (request.method === 'POST')
        void useSettingsStore.getState().update({
          backupPending: true,
          backupLocalRevision: backupSettings().backupLocalRevision + 1,
        });
    };
    await backupNow();
    expect(backupSettings().backupPending).toBe(true);
  });

  test('stay marked while the upload is running, so an app killed half way tries again', async () => {
    await signedIn();
    await useSettingsStore.getState().update({ backupPending: true });
    let markedDuringUpload: boolean | null = null;
    testDrive.onRequest = (request) => {
      if (request.method === 'POST') markedDuringUpload = backupSettings().backupPending;
    };
    await backupNow();
    expect(markedDuringUpload).toBe(true);
    expect(backupSettings().backupPending).toBe(false);
  });
});

describe('conflicts: never overwrite a backup this phone does not know about', () => {
  test('a backup from another vault or phone is left alone', async () => {
    await signedIn();
    const other = testDrive.putFile(new Uint8Array([7, 7, 7]));
    await expect(backupNow()).rejects.toMatchObject({ kind: 'conflict' });
    expect(testDrive.only().bytes).toEqual(new Uint8Array([7, 7, 7]));
    expect(testDrive.only().id).toBe(other.id);
    expect(useBackupState.getState()).toMatchObject({
      conflict: { relation: 'unrelated', remote: { id: other.id } },
      error: 'conflict',
    });
    expect(backupSettings().backupPending).toBe(true);
  });

  test('"keep this device" adds a new version and keeps the other one', async () => {
    await signedIn();
    const other = testDrive.putFile(new Uint8Array([7, 7, 7]));
    await expect(backupNow()).rejects.toMatchObject({ kind: 'conflict' });
    await resolveKeepMine();
    expect(testDrive.files.size).toBe(2);
    expect(testDrive.files.get(other.id)!.bytes).toEqual(new Uint8Array([7, 7, 7]));
    expect(testDrive.newest().bytes).toEqual(await vaultFile().bytes());
    expect(useBackupState.getState().conflict).toBeNull();
    await expect(backupNow()).resolves.toBeDefined(); // and it is trusted from now on
  });

  test('a backup changed by another phone since our last one is a conflict', async () => {
    await signedIn();
    await backupNow();
    testDrive.only().bytes = new Uint8Array([9, 9]);
    testDrive.only().modifiedTime = testDrive.tick();
    testDrive.only().appProperties = { revision: '5', deviceId: 'ab', deviceName: 'Other (ab)' };
    await expect(backupNow()).rejects.toMatchObject({ kind: 'conflict' });
    expect(testDrive.only().bytes).toEqual(new Uint8Array([9, 9]));
    expect(useBackupState.getState().conflict?.relation).toBe('remote-ahead');
  });

  test('changes on this phone as well make it "diverged"', async () => {
    await signedIn();
    await backupNow();
    testDrive.only().modifiedTime = testDrive.tick();
    testDrive.only().appProperties = { revision: '5', deviceId: 'ab', deviceName: 'Other (ab)' };
    useSettingsStore.setState({ backupLocalRevision: 4 });
    await expect(backupNow()).rejects.toMatchObject({ kind: 'conflict' });
    expect(useBackupState.getState().conflict?.relation).toBe('diverged');
  });

  test('our own earlier backup is not a conflict', async () => {
    await signedIn();
    await backupNow();
    await expect(backupNow()).resolves.toBeDefined();
  });
});

describe('problems while backing up', () => {
  test('no internet', async () => {
    await signedIn();
    testDrive.offline = true;
    await expect(backupNow()).rejects.toMatchObject({ kind: 'offline' });
    expect(backupSettings().backupEnabled).toBe(true); // still on: it will work when online
  });

  test('an expired token is refreshed without the user noticing', async () => {
    await signedIn();
    testDrive.expireToken('token-2');
    await expect(backupNow()).resolves.toBeDefined();
    expect(testGoogle.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(useBackupState.getState().error).toBeNull();
  });

  test('Google Drive is full', async () => {
    await signedIn();
    testDrive.failNext = { status: 403, reason: 'storageQuotaExceeded' };
    await expect(backupNow()).rejects.toMatchObject({ kind: 'quota' });
    expect(useBackupState.getState().error).toBe('quota');
  });

  test('too many requests', async () => {
    await signedIn();
    testDrive.failNext = { status: 429 };
    await expect(backupNow()).rejects.toMatchObject({ kind: 'rate-limited' });
  });

  test("the user removed KiteVault's access in their Google account", async () => {
    await signedIn();
    testDrive.expireToken('token-2');
    testGoogle.state.refreshError = new BackupError('access-revoked');
    await expect(backupNow()).rejects.toMatchObject({ kind: 'access-revoked' });
    expect(useBackupState.getState().error).toBe('access-revoked');
    expect(backupSettings().backupEnabled).toBe(true); // stays on so the card can offer "sign in again"
  });

  test('Drive itself says access was revoked', async () => {
    await signedIn();
    testDrive.failNext = { status: 403, reason: 'insufficientPermissions' };
    await expect(backupNow()).rejects.toMatchObject({ kind: 'access-revoked' });
  });

  test("signed out of Google behind the app's back", async () => {
    await signedIn();
    testGoogle.state.signedIn = false;
    await expect(backupNow()).rejects.toMatchObject({ kind: 'not-signed-in' });
  });

  test('the busy flag is always cleared', async () => {
    await signedIn();
    testDrive.offline = true;
    await backupNow().catch(() => undefined);
    expect(useBackupState.getState().busy).toBe('idle');
  });
});

describe('signing out', () => {
  test('forgets the backup settings but leaves the backup in Google Drive', async () => {
    await signedIn();
    await setAutoBackup(true);
    await backupNow();

    await signOutOfBackup();

    expect(testGoogle.signOut).toHaveBeenCalled();
    expect(backupSettings()).toEqual({
      backupEnabled: false,
      backupAuto: false,
      backupPending: false,
      backupLastAt: 0,
      backupRemoteId: '',
      backupRemoteModified: '',
      backupRemoteRevision: 0,
      backupLocalRevision: 1,
    });
    expect(useBackupState.getState().email).toBeNull();
    expect(testDrive.files.size).toBe(1); // the cloud copy is untouched
  });

  test('works even if Google reports an error', async () => {
    await signedIn();
    testGoogle.signOut.mockRejectedValueOnce(new Error('boom'));
    await expect(signOutOfBackup()).resolves.toBeUndefined();
    expect(backupSettings().backupEnabled).toBe(false);
  });
});

describe('deleting the cloud backup', () => {
  test("removes the file, switches automatic backup off, and keeps the phone's vault", async () => {
    await signedIn();
    await setAutoBackup(true);
    await backupNow();
    const local = await vaultFile().bytes();

    expect(await deleteCloudBackup()).toBe(1);

    expect(testDrive.files.size).toBe(0);
    expect(backupSettings()).toMatchObject({
      backupAuto: false,
      backupLastAt: 0,
      backupRemoteId: '',
      backupEnabled: true,
    });
    expect(await vaultFile().bytes()).toEqual(local);
  });

  test('is fine when the backup is already gone ("file missing")', async () => {
    await signedIn();
    await backupNow();
    testDrive.files.clear();
    await expect(deleteCloudBackup()).resolves.toBe(0);
  });

  test('reports problems and changes nothing locally', async () => {
    await signedIn();
    await backupNow();
    testDrive.offline = true;
    await expect(deleteCloudBackup()).rejects.toMatchObject({ kind: 'offline' });
    expect(backupSettings().backupRemoteId).not.toBe('');
    expect(useBackupState.getState().busy).toBe('idle');
  });
});

describe('looking for a backup to restore', () => {
  test('finds the backup after signing in', async () => {
    const file = testDrive.putFile(new Uint8Array([1]));
    const found = await findCloudBackup();
    expect(found.email).toBe('someone@example.com');
    expect(found.backup).toMatchObject({ id: file.id });
  });

  test('reports "no backup" as null, not as an error', async () => {
    expect((await findCloudBackup()).backup).toBeNull();
  });

  test('a cancelled sign-in and no internet are reported', async () => {
    testGoogle.state.signInError = new BackupError('cancelled');
    await expect(findCloudBackup()).rejects.toMatchObject({ kind: 'cancelled' });
    testGoogle.state.signInError = null;
    testDrive.offline = true;
    await expect(findCloudBackup()).rejects.toMatchObject({ kind: 'offline' });
  });

  test('downloads the exact file, but refuses something that is not a vault', async () => {
    await signedIn();
    await backupNow();
    const good = await downloadCloudBackup(remoteOf(testDrive.only().id));
    expect(good).toEqual(await vaultFile().bytes());

    const junk = testDrive.putFile(new Uint8Array([1, 2, 3]));
    await expect(downloadCloudBackup(remoteOf(junk.id))).rejects.toMatchObject({
      kind: 'invalid-backup',
    });
  });

  test('a file that disappeared is "not found"', async () => {
    await signedIn();
    await expect(downloadCloudBackup(remoteOf('gone'))).rejects.toMatchObject({
      kind: 'not-found',
    });
  });
});

describe('refreshSignIn', () => {
  test('shows the account when the earlier sign-in is still there', async () => {
    await signedIn();
    useBackupState.setState({ email: null });
    await refreshSignIn();
    expect(useBackupState.getState().email).toBe('someone@example.com');
  });

  test('does nothing when backup is off, and ignores errors', async () => {
    await refreshSignIn();
    expect(testGoogle.signInSilently).not.toHaveBeenCalled();
    await signedIn();
    testGoogle.signInSilently.mockRejectedValueOnce(new BackupError('offline'));
    await expect(refreshSignIn()).resolves.toBeUndefined();
  });
});

describe('backup is not part of this build', () => {
  test('every operation refuses and nothing touches the network or Google sign-in', async () => {
    const config = (
      Constants.expoConfig as unknown as { extra: { cloudBackup: { enabled: boolean } } }
    ).extra.cloudBackup;
    config.enabled = false;
    try {
      await expect(enableBackup()).rejects.toMatchObject({ kind: 'unavailable' });
      await expect(backupNow()).rejects.toMatchObject({ kind: 'unavailable' });
      await expect(deleteCloudBackup()).rejects.toMatchObject({ kind: 'unavailable' });
      await expect(findCloudBackup()).rejects.toMatchObject({ kind: 'unavailable' });
      expect(testDrive.fetch).not.toHaveBeenCalled();
      expect(testGoogle.signIn).not.toHaveBeenCalled();
    } finally {
      config.enabled = true;
    }
  });
});
