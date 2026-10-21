import { create } from 'zustand';

import { readJsonFile, writeJsonFile } from '@/storage/jsonFile';

import {
  DEFAULT_APP_SETTINGS,
  parseAppSettings,
  SETTINGS_FILE,
  type AppSettings,
} from './appSettings';

type SettingsState = AppSettings & {
  load: () => Promise<void>;
  update: (changes: Partial<AppSettings>) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_APP_SETTINGS,

  async load() {
    set(parseAppSettings(await readJsonFile(SETTINGS_FILE)));
  },

  async update(changes) {
    const { backgroundLockSeconds, inactivityLockMinutes } = get();
    const next = parseAppSettings({ backgroundLockSeconds, inactivityLockMinutes, ...changes });
    set(next); // apply right away; saving can fail without breaking the session
    await writeJsonFile(SETTINGS_FILE, next);
  },
}));
