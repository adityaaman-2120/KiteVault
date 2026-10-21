import { AppState } from 'react-native';

import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { changeMasterPassword, useVaultStore } from '@/vault';
import { vaultFile } from '@/vault/__support__/testUtils';

import { AUTO_BACKUP_DEBOUNCE_MS, createAutoBackup, startAutoBackup } from '../autoBackup';
import { backupNow, enableBackup, setAutoBackup } from '../backupService';
import { useBackupState } from '../backupState';
import { testDrive } from '../__support__/fakeGoogle';
import { backupSettings, setUpBackupEnv, tearDownBackupEnv } from '../__support__/backupTestEnv';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { cloudBackup: { enabled: true, webClientId: '' } } } },
}));
jest.mock('../googleAuth', () => ({
  ...jest.requireActual('../googleAuth'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  googleAuth: require('../__support__/fakeGoogle').testGoogle,
}));

describe('the scheduler (timing rules only)', () => {
  function setup(initial: { active?: boolean; pending?: boolean } = {}) {
    const state = { active: initial.active ?? true, pending: initial.pending ?? false };
    const timers = new Map<number, { at: number; run: () => void }>();
    let time = 0;
    let id = 0;
    const run = jest.fn(async () => {
      state.pending = false;
    });
    const auto = createAutoBackup({
      debounceMs: 20_000,
      isActive: () => state.active,
      isPending: () => state.pending,
      markPending: () => {
        state.pending = true;
      },
      run,
      setTimer: (callback, ms) => {
        timers.set(++id, { at: time + ms, run: callback });
        return id;
      },
      clearTimer: (handle) => timers.delete(handle as number),
    });
    const advance = (ms: number) => {
      time += ms;
      for (const [key, timer] of [...timers]) {
        if (timer.at <= time) {
          timers.delete(key);
          timer.run();
        }
      }
    };
    return { auto, run, state, advance, timers };
  }

  test('uploads once, a while after a save', () => {
    const t = setup();
    t.auto.fileSaved();
    t.advance(19_999);
    expect(t.run).not.toHaveBeenCalled();
    t.advance(1);
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  test('a burst of saves becomes one upload, after the last of them', () => {
    const t = setup();
    for (let i = 0; i < 6; i++) {
      t.auto.fileSaved();
      t.advance(5_000);
    }
    expect(t.run).not.toHaveBeenCalled(); // the 20 s countdown keeps restarting
    t.advance(15_000);
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  test('every save is remembered as pending, even when automatic backup is off', () => {
    const t = setup({ active: false });
    t.auto.fileSaved();
    expect(t.state.pending).toBe(true);
    expect(t.timers.size).toBe(0);
    t.advance(60_000);
    expect(t.run).not.toHaveBeenCalled();
  });

  test('does nothing at the end of the countdown if nothing is pending any more', () => {
    const t = setup();
    t.auto.fileSaved();
    t.state.pending = false; // a manual backup got there first
    t.advance(25_000);
    expect(t.run).not.toHaveBeenCalled();
  });

  test('stops if automatic backup was switched off meanwhile', () => {
    const t = setup();
    t.auto.fileSaved();
    t.state.active = false;
    t.advance(25_000);
    expect(t.run).not.toHaveBeenCalled();
  });

  test('flush uploads right away when something is waiting (app going to the background)', () => {
    const t = setup();
    t.auto.fileSaved();
    t.auto.flush();
    expect(t.run).toHaveBeenCalledTimes(1);
    t.advance(60_000);
    expect(t.run).toHaveBeenCalledTimes(1); // the countdown was cancelled
  });

  test('flush with nothing waiting does nothing', () => {
    const t = setup();
    t.auto.flush();
    expect(t.run).not.toHaveBeenCalled();
  });

  test('coming back to the app retries what could not be uploaded, soon', () => {
    const t = setup({ pending: true });
    t.auto.appForegrounded();
    t.advance(2_999);
    expect(t.run).not.toHaveBeenCalled();
    t.advance(1);
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  test('coming back with nothing waiting does nothing', () => {
    const t = setup();
    t.auto.appForegrounded();
    t.advance(10_000);
    expect(t.run).not.toHaveBeenCalled();
  });

  test('a failed upload leaves the change pending and is not retried in a loop', async () => {
    const t = setup();
    t.run.mockImplementation(async () => {
      throw new Error('offline');
    });
    t.auto.fileSaved();
    t.advance(20_000);
    await Promise.resolve();
    expect(t.run).toHaveBeenCalledTimes(1);
    expect(t.state.pending).toBe(true);
    t.advance(10 * 60_000);
    expect(t.run).toHaveBeenCalledTimes(1); // waits for the next save / foreground / manual backup
  });

  test('dispose cancels a waiting upload', () => {
    const t = setup();
    t.auto.fileSaved();
    t.auto.dispose();
    t.advance(60_000);
    expect(t.run).not.toHaveBeenCalled();
  });
});

describe('wired into the app (real saves, pretend Drive)', () => {
  let stop: () => void;
  let appStateListener: (state: string) => void = () => {};

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    await setUpBackupEnv();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _: string,
      listener: (s: string) => void,
    ) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    }) as never);
    await enableBackup();
    await backupNow(); // the first full backup
    await setAutoBackup(true);
    testDrive.fetch.mockClear();
    testDrive.requests.length = 0; // only count what happens from here on
    stop = startAutoBackup();
  });
  afterEach(() => {
    stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  afterAll(tearDownBackupEnv);

  const save = async (name: string) =>
    useVaultStore
      .getState()
      .save({ ...useVaultStore.getState().data!, folders: [{ id: name, name }] });
  const uploads = () =>
    testDrive.requests.filter((r) => r.method === 'PATCH' || r.method === 'POST');

  test('a save is uploaded after the debounce, as the encrypted file', async () => {
    await save('one');
    expect(backupSettings().backupPending).toBe(true);
    expect(uploads()).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(AUTO_BACKUP_DEBOUNCE_MS);

    expect(uploads()).toHaveLength(1);
    expect(testDrive.only().bytes).toEqual(await vaultFile().bytes());
    expect(backupSettings().backupPending).toBe(false);
  });

  test('several quick saves make a single upload of the latest version', async () => {
    await save('a');
    await jest.advanceTimersByTimeAsync(5_000);
    await save('b');
    await jest.advanceTimersByTimeAsync(5_000);
    await save('c');
    await jest.advanceTimersByTimeAsync(AUTO_BACKUP_DEBOUNCE_MS);

    expect(uploads()).toHaveLength(1);
    expect(testDrive.only().bytes).toEqual(await vaultFile().bytes());
  });

  test('changes made without a data save (password change, recovery key) are backed up too', async () => {
    await changeMasterPassword('correct horse battery staple', 'another long master password', {
      kdfParams: {
        algorithm: 'argon2id',
        version: 19,
        memoryKiB: 19 * 1024,
        iterations: 2,
        parallelism: 1,
      },
    });
    await jest.advanceTimersByTimeAsync(AUTO_BACKUP_DEBOUNCE_MS);
    expect(uploads()).toHaveLength(1);
    expect(testDrive.only().bytes).toEqual(await vaultFile().bytes());
  });

  test('nothing is uploaded when automatic backup is off', async () => {
    await setAutoBackup(false);
    await save('x');
    await jest.advanceTimersByTimeAsync(5 * AUTO_BACKUP_DEBOUNCE_MS);
    expect(uploads()).toHaveLength(0);
    expect(backupSettings().backupPending).toBe(true); // remembered for the next manual backup
  });

  test('going to the background uploads right away', async () => {
    await save('x');
    appStateListener('background');
    await jest.advanceTimersByTimeAsync(0);
    expect(uploads()).toHaveLength(1);
  });

  test('an upload that failed because of no internet is retried when the app is opened again', async () => {
    testDrive.offline = true;
    await save('x');
    await jest.advanceTimersByTimeAsync(AUTO_BACKUP_DEBOUNCE_MS);
    expect(useBackupState.getState().error).toBe('offline');
    expect(backupSettings().backupPending).toBe(true);

    testDrive.offline = false;
    testDrive.fetch.mockClear();
    appStateListener('active');
    await jest.advanceTimersByTimeAsync(3_000);

    expect(uploads()).toHaveLength(1);
    expect(backupSettings().backupPending).toBe(false);
    expect(useBackupState.getState().error).toBeNull();
  });

  test('a conflict stops automatic uploads instead of overwriting the other backup', async () => {
    testDrive.only().bytes = new Uint8Array([4, 4]); // another phone changed it
    testDrive.only().modifiedTime = testDrive.tick();
    testDrive.only().appProperties = { revision: '9', deviceId: 'zz', deviceName: 'Other (zz)' };
    await save('x');
    await jest.advanceTimersByTimeAsync(AUTO_BACKUP_DEBOUNCE_MS);
    expect(useBackupState.getState().conflict).not.toBeNull();
    expect(testDrive.only().bytes).toEqual(new Uint8Array([4, 4]));

    testDrive.fetch.mockClear();
    await save('y');
    await jest.advanceTimersByTimeAsync(5 * AUTO_BACKUP_DEBOUNCE_MS);
    expect(testDrive.fetch).not.toHaveBeenCalled(); // blocked until the user decides
  });

  test('stopping removes the listeners', async () => {
    stop();
    await save('x');
    await jest.advanceTimersByTimeAsync(5 * AUTO_BACKUP_DEBOUNCE_MS);
    expect(uploads()).toHaveLength(0);
    stop = startAutoBackup(); // so afterEach can stop again
  });

  test('does nothing for people who never turned backup on', async () => {
    stop();
    await useSettingsStore
      .getState()
      .update({ backupEnabled: false, backupAuto: false, backupPending: false });
    stop = startAutoBackup();
    await save('x');
    await jest.advanceTimersByTimeAsync(5 * AUTO_BACKUP_DEBOUNCE_MS);
    expect(testDrive.fetch).not.toHaveBeenCalled();
    expect(backupSettings().backupPending).toBe(false);
  });
});
