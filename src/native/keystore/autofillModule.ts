import { requireOptionalNativeModule } from 'expo';

export type NativeAutofillStatus = {
  supported: boolean; // this phone has an autofill framework
  enabled: boolean; // KiteVault is the autofill service the user chose
};

// One login waiting to be saved, exactly as the Kotlin side hands it over (nothing is trusted yet).
export type NativePendingSave = {
  id?: unknown;
  createdAt?: unknown;
  kind?: unknown; // "WEB" or "APP"
  username?: unknown;
  password?: unknown;
  host?: unknown;
  packageName?: unknown;
  label?: unknown;
  certSha256?: unknown;
};

export type NativeAutofill = {
  getStatus(): NativeAutofillStatus;
  openAutofillSettings(): boolean;
  getPendingSaves(): Promise<NativePendingSave[]>;
  getPendingSaveCount(): Promise<number>;
  discardPendingSave(id: string): Promise<boolean>;
  clearPendingSaves(): Promise<void>;
};

// Null when the native module is not in this build (for example in unit tests).
export const nativeAutofill = requireOptionalNativeModule<NativeAutofill>('KitevaultAutofill');
