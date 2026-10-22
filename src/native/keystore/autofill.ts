import { nativeAutofill } from './autofillModule';

export type AutofillStatus = {
  // False when this build or phone has no autofill support at all.
  supported: boolean;
  // True when KiteVault is the autofill service chosen in Android's settings.
  enabled: boolean;
};

const UNSUPPORTED: AutofillStatus = { supported: false, enabled: false };

// Asks Android whether KiteVault is the current autofill service. Never throws.
export function getAutofillStatus(): AutofillStatus {
  try {
    const status = nativeAutofill?.getStatus();
    if (!status) return UNSUPPORTED;
    return { supported: status.supported === true, enabled: status.enabled === true };
  } catch {
    return UNSUPPORTED;
  }
}

// Opens Android's own page where the user picks KiteVault as their autofill service. The choice
// is always made by the user there; KiteVault cannot switch it on by itself.
// Returns false if that page could not be opened.
export function openAutofillSettings(): boolean {
  try {
    return nativeAutofill?.openAutofillSettings() ?? false;
  } catch {
    return false;
  }
}
