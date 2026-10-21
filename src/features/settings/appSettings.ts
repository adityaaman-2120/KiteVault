// Non-sensitive app preferences, kept in a plain file outside the vault so they are available
// before the vault is unlocked.
export type AppSettings = {
  backgroundLockSeconds: number; // 0 = immediately
  inactivityLockMinutes: number;
  // True once the user chose "Don't ask again" on the biometric offer.
  biometricPromptDismissed: boolean;
  // Lets screenshots / screen recording / the recent-apps preview show the unlocked vault.
  allowScreenshots: boolean;
  // Seconds before a copied password / username is cleared from the clipboard. 0 = never.
  clipboardClearSeconds: number;
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

export const CLIPBOARD_CLEAR_OPTIONS = [
  { value: 15, label: '15 s' },
  { value: 30, label: '30 s' },
  { value: 60, label: '60 s' },
  { value: 0, label: 'Never' },
] as const;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  backgroundLockSeconds: 30,
  inactivityLockMinutes: 5,
  biometricPromptDismissed: false,
  allowScreenshots: false,
  clipboardClearSeconds: 30,
};

export const SETTINGS_FILE = 'settings.json';

// Unknown or invalid values fall back to the defaults field by field.
export function parseAppSettings(raw: unknown): AppSettings {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<AppSettings>;
  const background = BACKGROUND_LOCK_OPTIONS.some((o) => o.value === value.backgroundLockSeconds);
  const inactivity = INACTIVITY_LOCK_OPTIONS.some((o) => o.value === value.inactivityLockMinutes);
  const clipboard = CLIPBOARD_CLEAR_OPTIONS.some((o) => o.value === value.clipboardClearSeconds);
  return {
    backgroundLockSeconds: background
      ? (value.backgroundLockSeconds as number)
      : DEFAULT_APP_SETTINGS.backgroundLockSeconds,
    inactivityLockMinutes: inactivity
      ? (value.inactivityLockMinutes as number)
      : DEFAULT_APP_SETTINGS.inactivityLockMinutes,
    biometricPromptDismissed: value.biometricPromptDismissed === true,
    allowScreenshots: value.allowScreenshots === true,
    clipboardClearSeconds: clipboard
      ? (value.clipboardClearSeconds as number)
      : DEFAULT_APP_SETTINGS.clipboardClearSeconds,
  };
}
