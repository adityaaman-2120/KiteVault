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
  // The user allowed the optional breach check on the Security check screen. Off by default, and
  // even when on, it runs only when the user taps the button.
  breachCheckEnabled: boolean;
  // --- optional Google Drive backup (no secrets: only on/off switches and times) ---
  backupEnabled: boolean; // signed in and backing up
  backupAuto: boolean; // back up a little while after every change
  backupPending: boolean; // the vault file changed since the last successful upload
  backupLastAt: number; // epoch ms of the last successful upload, 0 = never
  backupRemoteId: string; // Drive file this phone last uploaded to ('' = none)
  backupRemoteModified: string; // that file's modifiedTime after our upload ('' = none)
  backupRemoteRevision: number; // that file's vault revision
  // Counts every change to the vault file while backup is on. Only ever goes up, except when this
  // phone adopts a cloud version (then it takes that version's number).
  backupLocalRevision: number;
  // Random id of this phone, so backup versions can say which phone made them. Not the Android
  // id or any hardware id.
  backupDeviceId: string;
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
  breachCheckEnabled: false,
  backupEnabled: false,
  backupAuto: false,
  backupPending: false,
  backupLastAt: 0,
  backupRemoteId: '',
  backupRemoteModified: '',
  backupRemoteRevision: 0,
  backupLocalRevision: 0,
  backupDeviceId: '',
};

export const SETTINGS_FILE = 'settings.json';

const wholeNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;

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
    breachCheckEnabled: value.breachCheckEnabled === true,
    backupEnabled: value.backupEnabled === true,
    backupAuto: value.backupEnabled === true && value.backupAuto === true,
    backupPending: value.backupPending === true,
    backupLastAt:
      typeof value.backupLastAt === 'number' &&
      Number.isFinite(value.backupLastAt) &&
      value.backupLastAt > 0
        ? value.backupLastAt
        : 0,
    backupRemoteId:
      typeof value.backupRemoteId === 'string' ? value.backupRemoteId.slice(0, 200) : '',
    backupRemoteModified:
      typeof value.backupRemoteModified === 'string' ? value.backupRemoteModified.slice(0, 64) : '',
    backupRemoteRevision: wholeNumber(value.backupRemoteRevision),
    backupLocalRevision: wholeNumber(value.backupLocalRevision),
    backupDeviceId:
      typeof value.backupDeviceId === 'string' && /^[0-9a-f]{1,64}$/.test(value.backupDeviceId)
        ? value.backupDeviceId
        : '',
  };
}
