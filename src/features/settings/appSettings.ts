// Non-sensitive app preferences, kept in a plain file outside the vault so they are available
// before the vault is unlocked.
export type AppSettings = {
  backgroundLockSeconds: number; // 0 = immediately
  inactivityLockMinutes: number;
};

export const BACKGROUND_LOCK_OPTIONS = [
  { value: 0, label: 'Immediately' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
] as const;

export const INACTIVITY_LOCK_OPTIONS = [
  { value: 1, label: '1 min' },
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
] as const;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  backgroundLockSeconds: 30,
  inactivityLockMinutes: 5,
};

export const SETTINGS_FILE = 'settings.json';

// Unknown or invalid values fall back to the defaults field by field.
export function parseAppSettings(raw: unknown): AppSettings {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<AppSettings>;
  const background = BACKGROUND_LOCK_OPTIONS.some((o) => o.value === value.backgroundLockSeconds);
  const inactivity = INACTIVITY_LOCK_OPTIONS.some((o) => o.value === value.inactivityLockMinutes);
  return {
    backgroundLockSeconds: background
      ? (value.backgroundLockSeconds as number)
      : DEFAULT_APP_SETTINGS.backgroundLockSeconds,
    inactivityLockMinutes: inactivity
      ? (value.inactivityLockMinutes as number)
      : DEFAULT_APP_SETTINGS.inactivityLockMinutes,
  };
}
