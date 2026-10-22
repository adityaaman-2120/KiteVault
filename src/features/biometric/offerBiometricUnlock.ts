import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { getUnlockState, isBiometricAvailable } from '@/native/keystore';

import { useBiometricOfferStore } from './biometricOfferStore';

// After a successful master-password unlock: ask the home screen to show the biometric popup, if
// this phone supports it, it is not on yet, and the user did not choose "Don't ask again".
// It is the same popup that is shown right after the vault is created.
export async function offerBiometricUnlock(): Promise<void> {
  if (!isBiometricAvailable()) return;
  if (useSettingsStore.getState().biometricPromptDismissed) return;
  if ((await getUnlockState()) !== 'disabled') return;
  useBiometricOfferStore.getState().request();
}
