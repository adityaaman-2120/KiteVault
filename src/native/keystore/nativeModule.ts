import { requireOptionalNativeModule } from 'expo';

export type UnlockState =
  | 'disabled' // biometric unlock is not set up
  | 'ready' // set up and usable right now
  | 'reauth-required' // set up, but the master password must be typed first
  | 'invalidated' // fingerprints / faces changed: the key can never be used again
  | 'unavailable'; // no biometrics are enrolled any more

export type NativeKeystore = {
  isBiometricAvailable(): boolean;
  getUnlockState(): Promise<UnlockState>;
  enableBiometricUnlock(vaultKey: Uint8Array): Promise<void>;
  unlockWithBiometrics(): Promise<Uint8Array>;
  disableBiometricUnlock(): void;
  recordPasswordUnlock(): void;
};

// Null when the native module is not in this build (for example in unit tests).
export const native = requireOptionalNativeModule<NativeKeystore>('KitevaultKeystore');
