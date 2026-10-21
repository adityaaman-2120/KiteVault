import { deleteJsonFile, readJsonFile, writeJsonFile } from '@/storage/jsonFile';

import { DEFAULT_APP_SETTINGS, parseAppSettings, SETTINGS_FILE } from '../appSettings';
import { useSettingsStore } from '../useSettingsStore';

beforeEach(() => {
  deleteJsonFile(SETTINGS_FILE);
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
});
afterAll(() => deleteJsonFile(SETTINGS_FILE));

describe('parseAppSettings', () => {
  test('keeps valid values', () => {
    expect(
      parseAppSettings({ backgroundLockSeconds: 300, inactivityLockMinutes: 15 }),
    ).toMatchObject({
      backgroundLockSeconds: 300,
      inactivityLockMinutes: 15,
    });
    expect(parseAppSettings({ backgroundLockSeconds: 0, inactivityLockMinutes: 1 })).toMatchObject({
      backgroundLockSeconds: 0,
      inactivityLockMinutes: 1,
    });
  });

  test.each([null, undefined, 'text', 42, [], {}])('uses defaults for %j', (raw) => {
    expect(parseAppSettings(raw)).toEqual(DEFAULT_APP_SETTINGS);
  });

  test('replaces only the invalid field', () => {
    expect(
      parseAppSettings({ backgroundLockSeconds: 77, inactivityLockMinutes: 10 }),
    ).toMatchObject({
      backgroundLockSeconds: DEFAULT_APP_SETTINGS.backgroundLockSeconds,
      inactivityLockMinutes: 10,
    });
  });
});

describe('useSettingsStore', () => {
  test('loads defaults when there is no file', async () => {
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState()).toMatchObject(DEFAULT_APP_SETTINGS);
  });

  test('update applies immediately and is saved to the file', async () => {
    const saving = useSettingsStore.getState().update({ backgroundLockSeconds: 0 });
    expect(useSettingsStore.getState().backgroundLockSeconds).toBe(0);
    await saving;
    expect(await readJsonFile(SETTINGS_FILE)).toEqual({
      ...DEFAULT_APP_SETTINGS,
      backgroundLockSeconds: 0,
    });
  });

  test('saved settings are read back after a restart', async () => {
    await useSettingsStore
      .getState()
      .update({ backgroundLockSeconds: 300, inactivityLockMinutes: 2 });
    useSettingsStore.setState(DEFAULT_APP_SETTINGS); // simulate a fresh launch
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState()).toMatchObject({
      backgroundLockSeconds: 300,
      inactivityLockMinutes: 2,
    });
  });

  test('ignores invalid values and a corrupt file', async () => {
    await useSettingsStore.getState().update({ inactivityLockMinutes: 9999 });
    expect(useSettingsStore.getState().inactivityLockMinutes).toBe(
      DEFAULT_APP_SETTINGS.inactivityLockMinutes,
    );
    await writeJsonFile(SETTINGS_FILE, 'garbage');
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState()).toMatchObject(DEFAULT_APP_SETTINGS);
  });

  test('the settings file holds only the preferences and no secrets', async () => {
    await useSettingsStore.getState().update({ backgroundLockSeconds: 60 });
    expect(Object.keys((await readJsonFile(SETTINGS_FILE)) as object).sort()).toEqual([
      'allowScreenshots',
      'backgroundLockSeconds',
      'backupAuto',
      'backupEnabled',
      'backupLastAt',
      'backupPending',
      'backupRemoteId',
      'backupRemoteModified',
      'biometricPromptDismissed',
      'clipboardClearSeconds',
      'inactivityLockMinutes',
    ]);
  });

  test('screenshots default to blocked and the clipboard to 30 s; bad values fall back', () => {
    expect(DEFAULT_APP_SETTINGS).toMatchObject({
      allowScreenshots: false,
      clipboardClearSeconds: 30,
    });
    expect(parseAppSettings({ allowScreenshots: 'yes', clipboardClearSeconds: 45 })).toMatchObject({
      allowScreenshots: false,
      clipboardClearSeconds: 30,
    });
    expect(parseAppSettings({ clipboardClearSeconds: 0 }).clipboardClearSeconds).toBe(0);
  });

  test('cloud backup is off by default and automatic backup needs backup to be on', () => {
    expect(DEFAULT_APP_SETTINGS).toMatchObject({
      backupEnabled: false,
      backupAuto: false,
      backupPending: false,
    });
    expect(parseAppSettings({ backupEnabled: false, backupAuto: true }).backupAuto).toBe(false);
    expect(parseAppSettings({ backupEnabled: true, backupAuto: true }).backupAuto).toBe(true);
  });

  test('backup values that are not what we wrote are ignored, and hold no secrets', () => {
    const parsed = parseAppSettings({
      backupEnabled: 'yes',
      backupLastAt: -5,
      backupRemoteId: 42,
      backupRemoteModified: { x: 1 },
    });
    expect(parsed).toMatchObject({
      backupEnabled: false,
      backupLastAt: 0,
      backupRemoteId: '',
      backupRemoteModified: '',
    });
    expect(parseAppSettings({ backupRemoteId: 'x'.repeat(500) }).backupRemoteId).toHaveLength(200);
  });

  test('remembers the biometric "do not ask again" choice', async () => {
    await useSettingsStore.getState().update({ biometricPromptDismissed: true });
    useSettingsStore.setState(DEFAULT_APP_SETTINGS);
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().biometricPromptDismissed).toBe(true);
    // Anything that is not exactly true counts as false.
    expect(parseAppSettings({ biometricPromptDismissed: 'yes' }).biometricPromptDismissed).toBe(
      false,
    );
  });
});
