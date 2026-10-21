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
    expect(parseAppSettings({ backgroundLockSeconds: 300, inactivityLockMinutes: 15 })).toEqual({
      backgroundLockSeconds: 300,
      inactivityLockMinutes: 15,
    });
    expect(parseAppSettings({ backgroundLockSeconds: 0, inactivityLockMinutes: 1 })).toEqual({
      backgroundLockSeconds: 0,
      inactivityLockMinutes: 1,
    });
  });

  test.each([null, undefined, 'text', 42, [], {}])('uses defaults for %j', (raw) => {
    expect(parseAppSettings(raw)).toEqual(DEFAULT_APP_SETTINGS);
  });

  test('replaces only the invalid field', () => {
    expect(parseAppSettings({ backgroundLockSeconds: 77, inactivityLockMinutes: 10 })).toEqual({
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
      backgroundLockSeconds: 0,
      inactivityLockMinutes: DEFAULT_APP_SETTINGS.inactivityLockMinutes,
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

  test('the settings file holds nothing but the two lock preferences', async () => {
    await useSettingsStore.getState().update({ backgroundLockSeconds: 60 });
    expect(Object.keys((await readJsonFile(SETTINGS_FILE)) as object).sort()).toEqual([
      'backgroundLockSeconds',
      'inactivityLockMinutes',
    ]);
  });
});
