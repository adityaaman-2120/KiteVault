import { DEFAULT_APP_SETTINGS, SETTINGS_FILE } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useSessionStore } from '@/features/session/useSessionStore';
import { clearAttemptState } from '@/features/lock/unlockService';
import { googleAuth } from '@/features/backup/googleAuth';
import { disableBiometricUnlock } from '@/native/keystore';
import { deleteJsonFile } from '@/storage/jsonFile';
import { eraseVault, useVaultStore } from '@/vault';

// The word the user must type before the vault is erased. Capitals matter.
export const ERASE_WORD = 'ERASE';

export const isEraseConfirmed = (typed: string): boolean => typed === ERASE_WORD;

// Permanently removes everything KiteVault keeps on this phone and returns the app to the
// welcome screen:
//   1. the vault file (and its temporary / backup copies) and the unlocked data in memory,
//   2. the biometric key in the Android Keystore, the encrypted copy of the vault key, and its counters,
//   3. all settings and the unlock-attempt counter.
// Step 1 comes first and is checked: if the vault file cannot be deleted this throws and nothing
// else is touched, so the app never claims to have erased a vault that is still there.
//
// Limit: deleting a file does not overwrite it. On phone storage the old (encrypted) bytes may
// stay on the chip until reused; they are encrypted with a key derived from the master password.
export async function eraseEverything(): Promise<void> {
  await eraseVault();

  disableBiometricUnlock();
  // Forget the Google sign-in on this phone. Any backup already in Google Drive stays there.
  await googleAuth.signOut().catch(() => undefined);
  deleteJsonFile(SETTINGS_FILE);
  clearAttemptState();
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);

  // Last: this is what sends the app to the welcome screen.
  useVaultStore.setState({ data: null });
  useSessionStore.getState().setStatus('no-vault');
}
