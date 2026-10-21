import { Alert } from 'react-native';

import { BiometricError, getUnlockState, isBiometricAvailable } from '@/native/keystore';

import { useSettingsStore } from '@/features/settings/useSettingsStore';

import { enableBiometric } from './biometricService';
import { describeBiometricError } from './messages';

// After a successful master-password unlock: offer to turn on biometric unlock, if this phone
// supports it, it is not on yet, and the user did not choose "Don't ask again".
export async function offerBiometricUnlock(): Promise<void> {
  if (!isBiometricAvailable()) return;
  if (useSettingsStore.getState().biometricPromptDismissed) return;
  if ((await getUnlockState()) !== 'disabled') return;

  const choice = await new Promise<'enable' | 'later' | 'never'>((resolve) => {
    Alert.alert(
      'Enable biometric unlock?',
      'Open KiteVault with your fingerprint or face. You can always use your master password instead, and we will ask for it again after a restart, 7 days, or 5 biometric unlocks.',
      [
        { text: "Don't ask again", style: 'cancel', onPress: () => resolve('never') },
        { text: 'Not now', onPress: () => resolve('later') },
        { text: 'Enable', onPress: () => resolve('enable') },
      ],
      { cancelable: true, onDismiss: () => resolve('later') },
    );
  });

  if (choice === 'never') {
    await useSettingsStore.getState().update({ biometricPromptDismissed: true });
  } else if (choice === 'enable') {
    try {
      await enableBiometric();
    } catch (error) {
      const message =
        error instanceof BiometricError && error.kind === 'cancelled'
          ? 'Biometric unlock was not turned on. You can turn it on later in Settings.'
          : describeBiometricError(error);
      Alert.alert('Biometric unlock', message);
    }
  }
}
