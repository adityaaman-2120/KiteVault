import { requireOptionalNativeModule } from 'expo';

export type NativeAutofillStatus = {
  supported: boolean; // this phone has an autofill framework
  enabled: boolean; // KiteVault is the autofill service the user chose
};

export type NativeAutofill = {
  getStatus(): NativeAutofillStatus;
  openAutofillSettings(): boolean;
};

// Null when the native module is not in this build (for example in unit tests).
export const nativeAutofill = requireOptionalNativeModule<NativeAutofill>('KitevaultAutofill');
