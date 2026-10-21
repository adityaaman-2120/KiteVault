import { wipe } from '@/crypto';
import {
  BiometricError,
  disableBiometricUnlock,
  enableBiometricUnlock,
  unlockWithBiometrics,
} from '@/native/keystore';
import { getVaultKeyCopy, useVaultStore, VaultError } from '@/vault';

// Turns biometric unlock on for the currently unlocked vault. Shows the system dialog once.
export async function enableBiometric(): Promise<void> {
  const vaultKey = getVaultKeyCopy();
  try {
    await enableBiometricUnlock(vaultKey);
  } finally {
    wipe(vaultKey); // the native side kept its own copy only until it finished wrapping
  }
}

// Shows the system dialog and, if it passes, opens the vault with the stored vault key.
// Throws BiometricError; the stored key is removed whenever it is found to be unusable.
export async function unlockWithBiometric(): Promise<void> {
  const vaultKey = await unlockWithBiometrics();
  try {
    await useVaultStore.getState().unlockWithKey(vaultKey); // takes ownership of vaultKey
  } catch (error) {
    if (error instanceof VaultError && error.code === 'WRONG_KEY') {
      // The stored key no longer matches the vault (for example after a password change).
      disableBiometricUnlock();
      throw new BiometricError('key-invalidated');
    }
    throw error;
  }
}
