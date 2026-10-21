import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useVaultStore } from '@/vault';
import { makeEntry, snapshot, vaultFile } from '@/vault/__support__/testUtils';
import type { VaultData } from '@/vault';

import {
  backupNow,
  compareWithCloud,
  enableBackup,
  listVersions,
  MAX_VERSIONS,
  resolveKeepMine,
  resolveMerge,
  resolveUseCloud,
  restoreVersion,
} from '../backupService';
import { useBackupState } from '../backupState';
import type { RemoteBackup } from '../driveApi';
import { testDrive } from '../__support__/fakeGoogle';
import {
  backupSettings,
  MASTER_PASSWORD,
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

const T = 1_700_000_000_000;
const OTHER = { deviceId: 'ee11', deviceName: 'Other phone (ee11)' };

const remote = (over: Partial<RemoteBackup> = {}): RemoteBackup => ({
  id: 'f1',
  modifiedTime: '2026-10-22T10:00:00.000Z',
  createdTime: '2026-10-22T10:00:00.000Z',
  size: 1,
  revision: 3,
  deviceId: 'aa',
  deviceName: 'A',
  ...over,
});

describe('compareWithCloud', () => {
  const seen = { id: 'f1', modifiedTime: '2026-10-22T10:00:00.000Z', revision: 3 };

  test('nothing in the cloud', () => {
    expect(compareWithCloud(null, seen, 3)).toBe('empty');
  });
  test('the cloud is exactly what this phone saw', () => {
    expect(compareWithCloud(remote(), seen, 3)).toBe('in-sync');
    expect(compareWithCloud(remote(), seen, 9)).toBe('in-sync'); // local edits: safe to upload
  });
  test('this phone never saw the cloud backup', () => {
    expect(compareWithCloud(remote(), { id: '', modifiedTime: '', revision: 0 }, 1)).toBe(
      'unrelated',
    );
  });
  test('a newer cloud version and no local edits', () => {
    const newer = remote({ modifiedTime: '2026-10-22T11:00:00.000Z', revision: 4 });
    expect(compareWithCloud(newer, seen, 3)).toBe('remote-ahead');
  });
  test('a newer cloud version and local edits', () => {
    const newer = remote({ modifiedTime: '2026-10-22T11:00:00.000Z', revision: 4 });
    expect(compareWithCloud(newer, seen, 5)).toBe('diverged');
  });
  test('a different file with the same time is still a change', () => {
    expect(compareWithCloud(remote({ id: 'f2' }), seen, 3)).toBe('remote-ahead');
  });
  test('the cloud went back in time (a newer version was deleted): not a conflict', () => {
    const older = remote({ modifiedTime: '2026-10-22T09:00:00.000Z' });
    expect(compareWithCloud(older, seen, 3)).toBe('remote-behind');
  });
});

beforeEach(async () => {
  await setUpBackupEnv();
  await useVaultStore
    .getState()
    .save(snapshot(withVault([makeEntry({ id: 'e1', title: 'Local', updatedAt: T + 1000 })])));
});
afterAll(tearDownBackupEnv);

function withVault(entries: ReturnType<typeof makeEntry>[]): VaultData {
  return { ...useVaultStore.getState().data!, entries };
}

// The file bytes of this vault holding `data`, then goes back to what it was.
async function bytesWith(data: VaultData): Promise<Uint8Array> {
  const before = snapshot(useVaultStore.getState().data!);
  await useVaultStore.getState().save(snapshot(data));
  const bytes = Uint8Array.from(await vaultFile().bytes());
  await useVaultStore.getState().save(before);
  return bytes;
}

const entries = () => useVaultStore.getState().data!.entries;
const settings = () => useSettingsStore.getState();

// "Another phone" uploads `data` as the newest version.
async function otherPhoneUploads(data: VaultData, revision = 7) {
  const file = testDrive.putFile(await bytesWith(data), {
    revision: String(revision),
    ...OTHER,
  });
  return file;
}

describe('versions', () => {
  beforeEach(enableBackup);

  test('manual backups add versions and only the newest five are kept', async () => {
    for (let i = 0; i < MAX_VERSIONS + 2; i++) await backupNow({ manual: true });
    expect(testDrive.files.size).toBe(MAX_VERSIONS);
    expect((await listVersions()).length).toBe(MAX_VERSIONS);
  });

  test('each version names the phone and revision', async () => {
    await backupNow();
    const props = testDrive.only().appProperties;
    expect(props.revision).toBe('1');
    expect(props.deviceName).toMatch(/\([0-9a-f]{4}\)$/);
    expect(props.deviceId).toBe(settings().backupDeviceId);
    expect(props.deviceId).toMatch(/^[0-9a-f]{32}$/);
  });

  test('an automatic backup soon after another replaces it', async () => {
    await backupNow();
    testDrive.only().createdTime = new Date().toISOString();
    await backupNow();
    expect(testDrive.files.size).toBe(1);
  });

  test('an automatic backup long after the last one adds a version', async () => {
    await backupNow();
    testDrive.only().createdTime = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    await backupNow();
    expect(testDrive.files.size).toBe(2);
  });

  test('a version from another phone is never replaced in place', async () => {
    await backupNow();
    const mine = testDrive.only();
    mine.appProperties = { ...mine.appProperties, deviceId: 'ffff' };
    mine.createdTime = new Date().toISOString();
    await backupNow({ manual: false }).catch(() => undefined);
    expect(testDrive.files.get(mine.id)!.appProperties.deviceId).toBe('ffff');
  });

  test('uploads still work when the cloud lost a newer version', async () => {
    await backupNow({ manual: true });
    await backupNow({ manual: true });
    testDrive.files.delete(testDrive.newest().id); // the newest version vanished
    await expect(backupNow({ manual: true })).resolves.toBeDefined();
    expect(useBackupState.getState().conflict).toBeNull();
  });
});

describe('a conflict never overwrites', () => {
  beforeEach(async () => {
    await enableBackup();
    await backupNow();
  });

  test('another phone uploaded after our last backup', async () => {
    const theirs = await otherPhoneUploads(withVault([makeEntry({ id: 'e1', title: 'Theirs' })]));
    await expect(backupNow()).rejects.toMatchObject({ kind: 'conflict' });
    expect(testDrive.newest().id).toBe(theirs.id);
    expect(testDrive.files.size).toBe(2);
    expect(useBackupState.getState().conflict?.remote.deviceName).toBe(OTHER.deviceName);
  });
});

describe('keep this device', () => {
  test('uploads our version as a new one; theirs stays in the history', async () => {
    await enableBackup();
    await backupNow();
    const theirs = await otherPhoneUploads(withVault([makeEntry({ id: 'e1', title: 'Theirs' })]));
    await expect(backupNow()).rejects.toMatchObject({ kind: 'conflict' });
    await resolveKeepMine();
    expect(testDrive.files.size).toBe(3);
    expect(testDrive.files.get(theirs.id)).toBeDefined();
    expect(testDrive.newest().id).not.toBe(theirs.id);
    expect(useBackupState.getState().conflict).toBeNull();
  });
});

describe('use cloud version', () => {
  async function conflicted(theirs: VaultData) {
    await enableBackup();
    await backupNow();
    await useVaultStore
      .getState()
      .save(snapshot(withVault([makeEntry({ id: 'e1', title: 'Local only edit' })])));
    settings().update({ backupLocalRevision: 4 });
    const file = await otherPhoneUploads(theirs, 7);
    await expect(backupNow()).rejects.toMatchObject({ kind: 'conflict' });
    return file;
  }

  test('replaces this phone with the cloud vault and adopts its revision', async () => {
    const file = await conflicted(
      withVault([makeEntry({ id: 'e1', title: 'Theirs' }), makeEntry({ id: 'e9', title: 'Nine' })]),
    );
    await resolveUseCloud(MASTER_PASSWORD);
    expect(
      entries()
        .map((e) => e.title)
        .sort(),
    ).toEqual(['Nine', 'Theirs']);
    expect(backupSettings()).toMatchObject({
      backupRemoteId: file.id,
      backupRemoteRevision: 7,
      backupLocalRevision: 7,
      backupPending: false,
    });
    expect(useBackupState.getState().conflict).toBeNull();
    expect(testDrive.files.size).toBe(2); // nothing was uploaded or deleted
  });

  test('a wrong password changes nothing', async () => {
    await conflicted(withVault([makeEntry({ id: 'e1', title: 'Theirs' })]));
    const before = Uint8Array.from(await vaultFile().bytes());
    await expect(resolveUseCloud('not the password')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    expect(Uint8Array.from(await vaultFile().bytes())).toEqual(before);
    expect(entries()[0]!.title).toBe('Local only edit');
    expect(useBackupState.getState().conflict).not.toBeNull();
  });
});

describe('merge', () => {
  async function conflicted(theirs: VaultData, mine: VaultData) {
    await enableBackup();
    await backupNow();
    await useVaultStore.getState().save(snapshot(mine));
    settings().update({ backupLocalRevision: 4 });
    await otherPhoneUploads(theirs, 7);
    await expect(backupNow()).rejects.toMatchObject({ kind: 'conflict' });
  }

  test('same entry edited on both phones: the newest edit wins, new entries from both stay', async () => {
    const base = makeEntry({ id: 'e1', title: 'Base', updatedAt: T });
    await conflicted(
      withVault([
        { ...base, title: 'Edited on the other phone', updatedAt: T + 5000 },
        makeEntry({ id: 'e2', title: 'Only there', updatedAt: T }),
      ]),
      withVault([
        { ...base, title: 'Edited here', updatedAt: T + 2000 },
        makeEntry({ id: 'e3', title: 'Only here', updatedAt: T }),
      ]),
    );
    const summary = await resolveMerge(MASTER_PASSWORD);
    expect(summary).toMatchObject({ tookCloud: 1, addedFromCloud: 1, keptHereOnly: 1 });
    expect(
      entries()
        .map((e) => e.title)
        .sort(),
    ).toEqual(['Edited on the other phone', 'Only here', 'Only there']);
    // the merged result was uploaded as the newest version, with a revision above both
    expect(testDrive.files.size).toBe(3);
    expect(Number(testDrive.newest().appProperties.revision)).toBeGreaterThan(7);
    expect(useBackupState.getState().conflict).toBeNull();
    await expect(backupNow()).resolves.toBeDefined(); // no new conflict
  });

  test('deleted on the other phone: it moves to the Trash here, never silently erased', async () => {
    const e = makeEntry({ id: 'e2', title: 'Doomed', updatedAt: T });
    await conflicted(withVault([{ ...e, deletedAt: T + 9000, updatedAt: T }]), withVault([e]));
    const summary = await resolveMerge(MASTER_PASSWORD);
    expect(summary.keptInTrash).toBe(1);
    const merged = entries().find((x) => x.id === 'e2')!;
    expect(merged.deletedAt).toBe(T + 9000);
    expect(merged.title).toBe('Doomed');
  });

  test('deleted on the other phone but edited here afterwards: it stays alive', async () => {
    const e = makeEntry({ id: 'e2', title: 'Doomed', updatedAt: T });
    await conflicted(
      withVault([{ ...e, deletedAt: T + 1000 }]),
      withVault([{ ...e, title: 'Edited after', updatedAt: T + 5000 }]),
    );
    const summary = await resolveMerge(MASTER_PASSWORD);
    expect(summary.restoredFromTrash).toBe(1);
    const merged = entries().find((x) => x.id === 'e2')!;
    expect(merged.deletedAt).toBeUndefined();
    expect(merged.title).toBe('Edited after');
  });

  test('a wrong password changes nothing', async () => {
    await conflicted(withVault([makeEntry({ id: 'e5', title: 'Theirs' })]), withVault([]));
    await expect(resolveMerge('nope')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(entries()).toHaveLength(0);
    expect(testDrive.files.size).toBe(2);
  });
});

describe('history', () => {
  test('restores an older version; the current state is saved first', async () => {
    await enableBackup();
    await backupNow({ manual: true });
    const oldest = testDrive.newest();

    await useVaultStore
      .getState()
      .save(snapshot(withVault([makeEntry({ id: 'e1', title: 'Newer work' })])));
    settings().update({ backupLocalRevision: 3, backupPending: true });

    const versions = await listVersions();
    const old = versions.find((v) => v.id === oldest.id)!;
    await restoreVersion(old, MASTER_PASSWORD);

    expect(entries()[0]!.title).toBe('Local'); // the old state is back
    // the "Newer work" state is in the history, so the restore can be undone
    expect(testDrive.files.size).toBe(2);
    const safety = testDrive.newest();
    expect(safety.id).not.toBe(oldest.id);
    expect(backupSettings().backupPending).toBe(true); // restored vault is newer than the cloud
    await expect(backupNow()).resolves.toBeDefined();
  });

  test('a wrong password changes nothing and uploads nothing', async () => {
    await enableBackup();
    await backupNow({ manual: true });
    const before = Uint8Array.from(await vaultFile().bytes());
    const [version] = await listVersions();
    testDrive.requests.length = 0;
    await expect(restoreVersion(version!, 'nope')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    expect(Uint8Array.from(await vaultFile().bytes())).toEqual(before);
    expect(testDrive.requests.some((r) => r.method !== 'GET')).toBe(false);
  });

  test('refuses a file that is not a vault', async () => {
    await enableBackup();
    const junk = testDrive.putFile(new Uint8Array([1, 2, 3]));
    const [version] = await listVersions();
    expect(version!.id).toBe(junk.id);
    await expect(restoreVersion(version!, MASTER_PASSWORD)).rejects.toMatchObject({
      kind: 'invalid-backup',
    });
  });
});
