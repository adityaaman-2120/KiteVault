import { BiometricError } from '@/native/keystore';

// Plain-language messages. They never include keys or anything from the native error.
export function describeBiometricError(error: unknown): string {
  if (!(error instanceof BiometricError)) {
    return 'Biometric unlock did not work. Please use your master password.';
  }
  switch (error.kind) {
    case 'cancelled':
      return 'Biometric unlock was cancelled. You can use your master password instead.';
    case 'key-invalidated':
      return 'Your fingerprint or face settings changed, so biometric unlock was turned off to keep your vault safe. Unlock with your master password, then turn it on again in Settings.';
    case 'unavailable':
      return 'No fingerprint or face is set up on this device any more, so biometric unlock was turned off. Please use your master password.';
    case 'locked-out':
      return 'Too many failed biometric attempts. Try again later, or use your master password.';
    case 'reauth-required':
      return describeReauth(error.reason);
    case 'unsupported':
      return 'Biometric unlock is not available in this version of the app.';
    case 'busy':
      return 'A biometric prompt is already open.';
    default:
      return 'Biometric unlock did not work. Please use your master password.';
  }
}

export function describeReauth(reason?: BiometricError['reason']): string {
  switch (reason) {
    case 'REBOOT':
      return 'Your phone restarted. Please enter your master password.';
    case 'EXPIRED':
      return 'It has been 7 days since you last typed your master password. Please enter it.';
    case 'USE_LIMIT':
      return 'You have used biometric unlock 5 times. Please enter your master password.';
    default:
      return 'For your security, please enter your master password.';
  }
}
